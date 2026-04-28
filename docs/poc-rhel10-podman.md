# PoC på RHEL 10 med Podman

<!-- cSpell:ignore oprivilegierad Firewalld firewalld policycoreutils -->
<!-- cSpell:ignore repon repot subuid subgid subuids subgids usermod -->
<!-- cSpell:ignore Keycloaks företagsproxy npmjs blobbar rhsm Tidssync -->
<!-- cSpell:ignore relabelar mounten termering proxa setsebool -->
<!-- cSpell:ignore gitignoreras realmen Realmfilen Quadlet -->
<!-- cSpell:ignore newkey keyout noout certreq utfärdning certutil -->
<!-- cSpell:ignore fullchain fullkedje showcerts certmonger -->
<!-- cSpell:ignore Paravirtual virtio Paravirtuell hypervisorn hypervisorns -->
<!-- cSpell:ignore Virt fcopy hypervkvpd hypervvssd hypervfcopyd -->
<!-- cSpell:ignore chrony chronyd chronyc peera refclock dubbelsynk -->
<!-- cSpell:ignore timedatectl timesyncd ntpd -->
<!-- cSpell:ignore zswap hugepage deduplicerar firstboot diskerna flushar -->
<!-- cSpell:ignore Nutanix UEFI -->
<!-- cSpell:ignore subkommandot versionerade -->

Denna sida beskriver vilka förutsättningar som måste finnas på en
**Red Hat Enterprise Linux 10**-server för att köra en enkel
Proof-of-Concept (PoC) av Kravhantering. PoC:n återanvänder de
befintliga Compose-filerna för **Keycloak** (IdP) och
**Microsoft SQL Server** men kör dem i **Podman** istället för Docker.
Applikationen startas med `npm run start:prodlike` (Next.js på port
`3001`).

Målet är en så **låg-privilegierad** uppsättning som möjligt:

- Podman körs **rootless** av en dedikerad, oprivilegierad
  systemanvändare.
- Inga containrar binder till portar `< 1024` direkt.
- Endast en **reverse proxy** terminerar TLS på `443/tcp` ut mot
  användarna.
- IdP (`8080`) och databas (`1433`) binds enbart till `127.0.0.1` och
  exponeras aldrig på det publika nätverket.
- Firewalld släpper bara igenom precis det som behövs.

Se även:

- [auth-developer-workflow.md](./auth-developer-workflow.md)
- [sql-server-developer-workflow.md](./sql-server-developer-workflow.md)
- [arkitekturbeskrivning-kravhantering.md](./arkitekturbeskrivning-kravhantering.md)

## 1. Hårdvara och OS

<!-- markdownlint-disable MD013 -->

| Resurs | Minimum för PoC | Kommentar |
| - | - | - |
| CPU | 4 vCPU | SQL Server + Keycloak + Next.js samtidigt. |
| RAM | 8 GiB | SQL Server ~2 GiB, Keycloak ~1 GiB, Next.js ~1 GiB. |
| Disk | 40 GiB SSD | OS + container-images + SQL-data + npm-cache. |
| OS | RHEL 10 (x86\_64) | Minimal installation räcker, inga GUI-paket. |
| Subscription | Aktiv RHEL-prenumeration | Krävs för `dnf` mot RHEL-repon (BaseOS, AppStream, CRB). |

<!-- markdownlint-enable MD013 -->

`/var/lib/containers` (rootless: `~/.local/share/containers`) bör ha
minst 20 GiB ledigt för images och volymer.

### 1.1 Extra steg om RHEL 10 körs som virtuell maskin

PoC:n fungerar lika bra på en VM som på fysisk hårdvara, men en
virtualiserad RHEL 10 behöver några extra detaljer för att rootless
Podman, SQL Server och OIDC-tokens ska bete sig stabilt. Stegen är
generella — använd hypervisorns motsvarande funktion (VMware vSphere,
Hyper-V, KVM/oVirt, Proxmox, Nutanix, Azure/AWS/GCP m.fl.).

#### VM-konfiguration (i hypervisorn)

<!-- markdownlint-disable MD013 -->

| Inställning | Rekommendation | Varför |
| - | - | - |
| Firmware | UEFI + Secure Boot | RHEL 10 stödjer Secure Boot fullt ut; matchar fysisk profil. |
| vCPU | 4 vCPU, exponera `host`-CPU-modell (KVM: `--cpu host-passthrough`, VMware: matcha gästens CPU mot värden) | Krävs för SQL Server-prestanda. Nested virtualization behövs **inte** — Podman på RHEL 10 kör containrar direkt på värdens kärna utan `podman machine`. |
| RAM | 8 GiB, **inga ballooning-aggressiva** policies | SQL Server reagerar dåligt på minne som plötsligt försvinner. Reservera/garantera om hypervisorn stödjer det. |
| Disk | Thick-provisioned eller `discard=unmap`/`virtio-scsi` med TRIM | Container- och SQL-filer skapar/raderar mycket data; TRIM håller den glesa disken liten. |
| Diskcontroller | `virtio-scsi` (KVM) eller "Paravirtual" (VMware) | Märkbart bättre I/O än emulerad SATA/IDE för SQL Server. |
| NIC | `virtio-net` (KVM) eller "VMXNET3" (VMware) | Paravirtuell NIC krävs för full throughput till reverse proxy. |
| Klocka | Synkad mot hypervisorn **och** extern NTP | OIDC-tokens (Keycloak) underkänns vid drift > 60 s. |
| Snapshots | Acceptabelt för bygg/återställning, men **stäng av** under last | Snapshots med körande SQL Server kan ge inkonsistent state vid återställning. |

<!-- markdownlint-enable MD013 -->

#### Gäst-tillägg och drivrutiner i RHEL

Installera lämpligt gäst-paket så att tid, balloon, snabb shutdown
och (för VMware) delade mappar fungerar:

> **Obs:** Om något av nedanstående `dnf install`-kommandon
> misslyckas med felmeddelandet
> `Error: There are no enabled repositories in "/etc/yum.repos.d", …`,
> är värden inte registrerad mot RHSM eller saknar aktiverade
> BaseOS/AppStream-repon. Följ avsnitt
> [2.1 Aktivera RHSM-repon (BaseOS + AppStream)](#21-aktivera-rhsm-repon-baseos--appstream)
> först och kör sedan kommandot igen.

```bash
# KVM / QEMU / Proxmox / OpenStack / oVirt
sudo dnf install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent

# VMware vSphere / Workstation / Fusion
sudo dnf install -y open-vm-tools
sudo systemctl enable --now vmtoolsd

# Hyper-V (RHEL 10 har hv_* drivrutinerna inbyggda i kärnan,
# men hyperv-daemons ger KVP/VSS/fcopy)
sudo dnf install -y hyperv-daemons
sudo systemctl enable --now hypervkvpd hypervvssd hypervfcopyd
```

Cloud-VM:ar (Azure/AWS/GCP) använder en RHEL-image som redan har
`cloud-init` och rätt agenter — verifiera bara med
`systemctl status cloud-init` och hoppa över ovanstående.

#### Tidssynkronisering

`chronyd` ingår i RHEL 10:s minimal-installation. På en VM bör den
peera mot **både** hypervisorn (om den exponerar PTP/PHC) och en
extern NTP, annars riskerar Keycloak att underkänna tokens efter
suspend/resume.

**Verifiera först nuläget** så att du inte installerar något som
redan körs eller råkar köra två konkurrerande tidstjänster
parallellt:

```bash
# Övergripande status (visar bl.a. NTP-tjänst och synk-status)
timedatectl status

# Kollar om chronyd redan kör och visar källor i så fall
if systemctl is-active --quiet chronyd; then
    echo "chronyd is already running"
    chronyc tracking
    chronyc sources -v
else
    echo "chronyd is not running"
fi

# Är paketet ens installerat?
rpm -q chrony || echo "chrony is not installed"

# Visar konfigurerade tidskällor (server/pool/peer/refclock)
grep -E '^(server|pool|peer|refclock)' /etc/chrony.conf 2>/dev/null \
    || echo "No chrony sources found or /etc/chrony.conf does not exist"

# Säkerställ att inte en annan tidstjänst redan kör — bara en av
# dessa får vara aktiv åt gången
systemctl status chronyd --no-pager
systemctl status systemd-timesyncd --no-pager
systemctl status ntpd --no-pager
```

Om `systemd-timesyncd` eller `ntpd` redan är aktiv, stäng av den
innan du aktiverar `chronyd` (`sudo systemctl disable --now
systemd-timesyncd` respektive `ntpd`). Om `chronyd` redan är aktiv
och pekar mot en intern NTP-källa enligt avsnitt 13.2 räcker det att
lägga till `refclock`-raden nedan vid behov — hoppa annars över
installationssteget.

```bash
sudo dnf install -y chrony
# Lägg till hypervisorns klocka om enheten finns:
test -e /dev/ptp_kvm && echo 'refclock PHC /dev/ptp_kvm poll 2' \
    | sudo tee -a /etc/chrony.conf
sudo systemctl enable --now chronyd
chronyc sources -v
```

Aktivera dessutom hypervisorns "sync time with host" — men låt
`chronyd` styra; dubbelsynk utan en koordinerande tjänst kan ge
hopp i klockan.

#### Lagring, swap och I/O

- Använd **XFS** (RHEL 10:s standard) på en separat virtuell disk
  för `/var/lib/containers` och databaslagringen. Det gör det enkelt
  att utöka eller flytta utan att röra `/`.
- Sätt `discard` (eller kör `fstrim.timer`) så att raderade lager i
  Podman frigör utrymme på det underliggande datalagret:

  ```bash
  sudo systemctl enable --now fstrim.timer
  ```

- Behåll en blygsam swap (1–2 GiB) — en VM utan swap blir
  oförutsägbar när SQL Server toppar.
- Stäng av **`zswap`/transparent hugepage defrag** endast om
  hypervisorn redan deduplicerar minne (VMware TPS, KSM); annars
  kan defaults stå kvar.

#### Nätverk i en virtualiserad miljö

- Lägg VM:ens NIC i **samma VLAN/segment som de interna
  användarna**, inte i ett DMZ — PoC:n är intern (se avsnitt 5.2 och
  8.1).
- Stäng av hypervisorns NAT/portforward för PoC-VM:en. Allt som ska
  vara nåbart styrs av `firewalld` inne i gästen (avsnitt 6).
- Om hypervisorn har en egen brandvägg / Security Group (Azure NSG,
  AWS SG, vSphere DFW), spegla regelmängden från avsnitt 6 där:
  endast `22/tcp` från admin-nätet och `443/tcp` från användar-nätet.
- Behåll ett **statiskt IP eller DHCP-reservation** så att
  certifikatets SAN och Keycloaks redirect-URI:er fortsätter peka
  rätt efter en omstart.

#### Cloud-init / template-härdning

Bygger ni VM:en från en gyllene mall (template) eller via cloud-init:

- Regenerera SSH-host-nycklar och `machine-id` vid första boot
  (`/etc/machine-id` tom + `systemd-firstboot`), annars får alla
  klonade VM:ar samma identitet.
- Sätt unikt hostname **innan** `npm run db:setup` körs — SQL
  Servers SPN och Keycloaks `iss` bygger på det.
- Roterar molnleverantören diskerna får ni en ny disk-UUID; håll
  `/etc/fstab` på `UUID=`-form (RHEL:s default) så att uppstart inte
  hänger.

#### Backup och återställning

För en PoC räcker **applikationsnivå-backup**:

- Snapshot på den vilande VM:en (gärna i quiesced läge via
  `qemu-guest-agent`/VMware Tools så att SQL Server flushar bufferten).
- Eller: `podman volume export` av SQL- och Keycloak-volymerna +
  kopia av `.env.prodlike.local` och nginx-cert-katalogen.

Återställning på samma VM kräver inga extra steg utöver det som
beskrivs i avsnitt 10.

## 2. Paket som måste installeras

### 2.1 Aktivera RHSM-repon (BaseOS + AppStream)

<!-- cspell:ignore repona baseos appstream rpms repolist -->

Innan något `dnf install`-kommando körs måste värden vara registrerad
mot Red Hat Subscription Management och ha minst **BaseOS** och
**AppStream** aktiverade. Annars misslyckas installationen med t.ex.:

<!-- markdownlint-disable MD013 -->

```console
$ sudo dnf install -y qemu-guest-agent
Updating Subscription Management repositories.
Error: There are no enabled repositories in "/etc/yum.repos.d", "/etc/yum/repos.d", "/etc/distro.repos.d".
```

<!-- markdownlint-enable MD013 -->

Registrera VM:en (om det inte redan gjorts av serverdrift) och aktivera
repona:

```bash
# Registrera mot RHSM (hoppa över om redan registrerad)
sudo subscription-manager register
sudo subscription-manager refresh

# Aktivera de två huvud-repon som behövs på RHEL 10 x86_64
sudo subscription-manager repos \
  --enable=rhel-10-for-x86_64-baseos-rpms \
  --enable=rhel-10-for-x86_64-appstream-rpms

sudo dnf clean all
sudo dnf repolist
```

`dnf repolist` ska nu visa både `rhel-10-for-x86_64-baseos-rpms` och
`rhel-10-for-x86_64-appstream-rpms` som aktiva. Kör därefter om
`dnf install`-kommandot som tidigare felade.

> Notera: På andra arkitekturer (t.ex. `aarch64`, `s390x`, `ppc64le`)
> byter du `x86_64` mot motsvarande arkitektur i repo-namnen.

### 2.2 Installera baspaketen

<!-- cspell:ignore modulström filkonflikter -->

Installera som `root` (eller via Ansible/Satellite) **innan** PoC-
användaren tar över:

```bash
sudo dnf install -y \
  podman \
  container-selinux \
  git curl tar gzip \
  firewalld policycoreutils-python-utils \
  nginx \
  shadow-utils \
  python3-pip
```

På RHEL 10 finns **inte** `podman-compose` som RPM-paket i
BaseOS/AppStream:

- `podman-compose` installeras istället via pip. Kör som PoC-användaren
  (eller den användare som ska köra `podman compose`):

  ```bash
  python3 -m pip install --user podman-compose
  # Lägg till ~/.local/bin i PATH om det inte redan är gjort
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
  ```

  `podman compose` (subkommandot, utan bindestreck) i Podman 5 letar
  upp `podman-compose`-binären automatiskt och översätter
  `docker-compose.*.yml`-filerna i repot.

- `podman-docker` (valfritt) installerar en `docker`-shim som mappar
  `docker …` till `podman …` och lägger upp en `/var/run/docker.sock`-
  kompatibel socket. Ta bara med det om du har skript eller verktyg
  som anropar `docker` direkt — för PoC:n räcker `podman` och
  `podman compose`:

  ```bash
  sudo dnf install -y podman-docker   # frivilligt
  ```

  > **Obs:** Vissa paket (t.ex. `podman-docker`) är signerade med en
  > nyare Red Hat-nyckel som inte finns i basinstallationen. Om
  > `dnf install` avbryts med ett GPG-/nyckelfel om
  > `Red Hat, Inc. (release key 4)`, följ avsnitt
  > [2.3 Importera Red Hats GPG-nycklar](#23-importera-red-hats-gpg-nycklar)
  > och kör sedan installationen igen.

Node.js 24 (krav från `package.json`/`.nvmrc`) installeras via de
versionerade RPM:erna `nodejs24` / `nodejs24-npm` i AppStream.

Om en äldre Node.js/npm redan finns installerad på värden (t.ex. den
icke-versionerade `nodejs`-RPM:en eller en tidigare modulström som
`nodejs:18` / `nodejs:20`) ska den avinstalleras först — annars kan
`/usr/bin/node` och `/usr/bin/npm` peka på fel version eller orsaka
filkonflikter när `nodejs24` läggs till. Kontrollera och städa bort:

```bash
# Visa installerade Node-/npm-paket
rpm -qa | grep -E '^(nodejs|npm)'

# Visa aktuella binärer/versioner (om några)
command -v node && node --version || echo "node saknas"
command -v npm  && npm  --version || echo "npm saknas"

# Avinstallera den icke-versionerade nodejs/npm samt övriga nodejs-paket
# (hoppa över raden om kommandona ovan inte returnerade några paket)
sudo dnf remove -y nodejs npm nodejs-full-i18n nodejs-libs nodejs-docs

# Om en äldre modulström är aktiverad (gäller RHEL <10 eller uppgraderade
# system), nollställ den så att den inte återinstallerar fel version:
sudo dnf module reset -y nodejs 2>/dev/null || true
```

Installera sedan Node.js 24:

```bash
sudo dnf install -y nodejs24 nodejs24-npm
node --version   # ska visa v24.x
npm --version
```

> **Obs:** Det tidigare `dnf module enable nodejs:24` + `dnf install nodejs`-flödet
> är **deprecated** på RHEL 10 — DNF-moduler (AppStream-strömmar) har tagits bort
> och ersatts av versionerade paketnamn (`nodejs22`, `nodejs24`, …).

Om `nodejs24` inte finns i din kanal (t.ex. på en arkitektur där det inte
levereras), använd NodeSource RPM-repot eller
[`nvm`](https://github.com/nvm-sh/nvm) installerat under PoC-användaren
(rekommenderat för låg-privilegierad körning).

Verktyg som **inte** behöver installeras på värden — de körs i
containrar:

- Microsoft SQL Server (image enligt `image:`-raden i
  `docker-compose.sqlserver.yml` — versionen kan uppdateras separat och
  ska inte hårdkodas här)
- `sqlcmd` används från host-sidan av `npm run db:*`-skripten via
  containern, men om du vill köra ad-hoc-queries direkt på värden går
  det att lägga till `mssql-tools18` från Microsofts repo (frivilligt).

### 2.3 Importera Red Hats GPG-nycklar

<!-- cspell:ignore rpmkeys keyring pubkey nyckelfilerna -->

Vissa paket på RHEL 10 är signerade med en nyare Red Hat-releasenyckel
(t.ex. `Red Hat, Inc. (release key 4)`, fingerprint slutar på
`05707a62`). Om denna nyckel saknas i RPM:s keyring avbryts
installationen med ett GPG-/nyckelfel — exempelvis vid
`sudo dnf install -y podman-docker`.

Uppdatera `redhat-release` (som levererar nyckelfilerna under
`/etc/pki/rpm-gpg/`), importera nycklarna till RPM:s keyring och
verifiera att rätt nyckel finns:

```bash
# 1. Uppdatera Red Hats release-/nyckelpaket
sudo dnf update -y redhat-release

# 2. Importera Red Hats GPG-/PQC-nycklar till RPM:s keyring
sudo rpmkeys --import /etc/pki/rpm-gpg/RPM-GPG-KEY-redhat-release

# 3. Verifiera att release key 4 finns importerad
rpm -q gpg-pubkey --qf '%{VERSION}-%{RELEASE}  %{SUMMARY}\n' \
  | grep 05707a62

# 4. Kör installationen igen
sudo dnf install -y podman-docker
```

Steg 3 ska skriva ut en rad som innehåller
`Red Hat, Inc. (release key 4)`. Är raden tom saknas nyckeln
fortfarande — kontrollera att `redhat-release` är uppdaterat och att
RHSM-repona enligt [2.1](#21-aktivera-rhsm-repon-baseos--appstream)
är aktiva.

## 3. Dedikerad PoC-användare (rootless Podman)

Skapa en oprivilegierad systemanvändare som äger applikation och
containrar. Den ska inte vara `wheel`/`sudoers`.

```bash
sudo useradd --create-home --shell /bin/bash kravhantering
sudo passwd -l kravhantering   # låst lösenord, logga in via SSH-nyckel
```

Verifiera att `subuid`/`subgid` finns för användaren (krävs för
rootless user namespaces):

```bash
grep kravhantering /etc/subuid /etc/subgid
# Om tomt:
sudo usermod --add-subuids 100000-165535 \
             --add-subgids 100000-165535 kravhantering
```

Tillåt att användartjänster fortsätter köra efter utloggning
(annars stoppas containrarna när SSH-sessionen avslutas):

```bash
sudo loginctl enable-linger kravhantering
```

All vidare konfiguration i denna guide körs som `kravhantering` om
inget annat anges.

## 4. SELinux

RHEL 10 har SELinux i `enforcing` som standard — **behåll det**.

- `container-selinux` (installerat ovan) ger Podman rätt policy.
- För bind-mounts från Compose (t.ex. `./dev/keycloak` i
  `docker-compose.idp.yml`) krävs SELinux-märkning. Lägg till `:Z`
  på volymen i en lokal override (se avsnitt 7).
- Behöver Next.js-processen lyssna på `3001` är ingen särskild
  SELinux-port-policy nödvändig (porten ligger i intervallet
  `unreserved_port_t`).

## 5. Nätverk — externa flöden

### 5.1 Utgående trafik (måste tillåtas i ev. perimeter-brandvägg)

`npm install`, container-pulls och Keycloaks JWKS-hämtning kräver
utgående HTTPS. Om servern står bakom en företagsproxy: sätt
`https_proxy`/`HTTPS_PROXY` och `npm config set proxy …` för
PoC-användaren samt `HTTP_PROXY` i `~/.config/containers/containers.conf`
under `[engine]`.

<!-- markdownlint-disable MD013 -->

| Destination | Port | Syfte |
| - | - | - |
| `registry.npmjs.org` | 443/tcp | `npm install` av paket i `package.json`. |
| `github.com`, `codeload.github.com` | 443/tcp | Git-clone av repo + ev. GitHub-tarballs. |
| `objects.githubusercontent.com` | 443/tcp | npm-paket som ligger på GitHub Releases. |
| `mcr.microsoft.com` | 443/tcp | Pull av SQL Server-image. |
| `*.data.mcr.microsoft.com` | 443/tcp | Layer-blobbar för Microsoft-images. |
| `quay.io`, `cdn*.quay.io` | 443/tcp | Pull av Keycloak-image. |
| `registry.access.redhat.com` | 443/tcp | Ev. RHEL-baserade hjälpcontainrar. |
| `subscription.rhsm.redhat.com` | 443/tcp | RHEL-prenumerationen + `dnf`. |
| `cdn.redhat.com` | 443/tcp | RPM-paket från RHEL-repon. |
| Företagets DNS | 53/udp | Namnuppslag. |
| NTP (t.ex. `time.cloudflare.com`) | 123/udp | Tidssync — krävs för OIDC-tokens giltighet. |

<!-- markdownlint-enable MD013 -->

Ingen utgående SMTP, ingen direkt DB-trafik externt.

### 5.2 Inkommande trafik (öppnas på serverns publika nätverkskort)

<!-- markdownlint-disable MD013 -->

| Port | Protokoll | Källa | Syfte |
| - | - | - | - |
| 22/tcp | SSH | Admin-nät / VPN | Drift och deployment. Begränsa med firewalld-zon. |
| 443/tcp | HTTPS | Användar-nät | Reverse proxy → Next.js `3001` och Keycloak. |
| 80/tcp | HTTP | Användar-nät | Stäng om certifikatet utfärdas av intern Windows Server-PKI (se avsnitt 8.1). Öppna endast vid ACME/HTTP-01 mot publik CA. |

<!-- markdownlint-enable MD013 -->

**Inga andra portar** (varken `3001`, `8080` eller `1433`) ska vara
nåbara utifrån. Containrarna binds till loopback i avsnitt 7.

## 6. Firewalld — minimal regelmängd

Aktivera och starta firewalld:

```bash
sudo systemctl enable --now firewalld
```

Lägg det publika gränssnittet i en restriktiv zon (`public` är default)
och tillåt bara nödvändiga tjänster. Allt annat blockeras implicit.

```bash
# Anta att eth0 är det publika nic:et
sudo firewall-cmd --zone=public --change-interface=eth0 --permanent

# Behåll SSH (gärna begränsat till admin-nätet via en rich rule)
sudo firewall-cmd --zone=public --add-service=ssh --permanent

# Publik HTTPS (och valfritt HTTP för ACME-redirect)
sudo firewall-cmd --zone=public --add-service=https --permanent
sudo firewall-cmd --zone=public --add-service=http  --permanent

# Aktivera reglerna
sudo firewall-cmd --reload
```

För extra åtstramning av SSH:

```bash
sudo firewall-cmd --permanent --zone=public --remove-service=ssh
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule family=ipv4 source address=10.20.0.0/24 service name=ssh accept'
sudo firewall-cmd --reload
```

Notera: eftersom Podman körs **rootless** och alla tjänsteportar binds
till `127.0.0.1` behövs **inga** firewalld-undantag för `1433`, `8080`
eller `3001`. Det är hela poängen med den låg-privilegierade designen.

## 7. Bind containerportar till loopback

Compose-filerna i repot binder portarna till alla interface som
standard (`"8080:8080"`, `"1433:1433"`). För PoC:n ska de bindas
endast till `127.0.0.1`. Lös detta utan att ändra de checkade-in
filerna med en lokal override per Compose-fil:

`docker-compose.idp.override.yml`:

```yaml
services:
  idp:
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./dev/keycloak:/opt/keycloak/data/import:ro,Z
```

`docker-compose.sqlserver.override.yml`:

```yaml
services:
  db:
    ports:
      - "127.0.0.1:1433:1433"
```

Podman Compose plockar upp `*.override.yml` automatiskt om filerna
ligger bredvid huvudfilen. `:Z` SELinux-relabelar bind-mounten så att
containern får läsa `realm-kravhantering-dev.json`.

## 8. Reverse proxy som låg-privilegierad TLS-termering

Next.js startas av `npm run start:prodlike` som lyssnar på
`0.0.0.0:3001`. För PoC:n ska den bindningen ändras till loopback
genom att starta servern bakom en proxy och **inte** exponera `3001`
i firewalld. Detta görs enklast genom att starta Next med
`--hostname 127.0.0.1`-flaggan i en wrapper, eller — minst kod —
genom att bara låta firewalld blockera `3001/tcp`.

Installera `nginx` (görs i avsnitt 2) och låt den lyssna på `443`.
Endast `nginx` får binda låga portar; det görs via systemets
`cap_net_bind_service` som redan finns i `nginx`-paketets unit-fil.

Exempel `/etc/nginx/conf.d/kravhantering.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name kravhantering.poc.example.com;

    ssl_certificate     /etc/pki/tls/certs/kravhantering.crt;
    ssl_certificate_key /etc/pki/tls/private/kravhantering.key;

    # Next.js (start:prodlike → port 3001 på loopback)
    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
    }

    # Keycloak (vid extern SSO-inloggning krävs det att webbläsaren
    # når IdP:n direkt). Exponera under en sub-path eller eget
    # subdomän — här som /auth/.
    location /auth/ {
        proxy_pass         http://127.0.0.1:8080/;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Forwarded-Proto https;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    }
}
```

SELinux: tillåt nginx att proxa till loopback-portar:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Aktivera nginx-tjänsten:

```bash
sudo systemctl enable --now nginx
```

Alternativ: använd **Caddy** för automatisk Let's Encrypt-hantering,
eller kör nginx i en rootless container med
`net.ipv4.ip_unprivileged_port_start=443` satt via `sysctl`. För en
PoC är det enklast att låta `nginx` köra som system-tjänst.

### 8.1 TLS-certifikat från intern Windows Server PKI

Eftersom PoC:n endast är åtkomlig på det interna nätverket utfärdas
servercertifikatet lämpligen av företagets befintliga **Active
Directory Certificate Services (AD CS)**. Klienterna har redan
företagets root-/utfärdande CA i sitt trust store, så ingen extern CA
behövs.

Flödet är:

1. **På RHEL** — generera privat nyckel + Certificate Signing Request
   (CSR).
2. **På Windows-CA:n** — utfärda ett certifikat baserat på CSR:en.
3. **På RHEL** — placera nyckel + utfärdat certifikat (inkl.
   CA-kedjan) där `nginx` förväntar sig dem.

#### Steg 1: Skapa nyckel och CSR på RHEL

Kör som `root` (eller via `sudo`) eftersom filerna ska läggas under
`/etc/pki`. Privatnyckeln lämnar **aldrig** servern.

```bash
sudo install -d -m 0755 /etc/pki/tls/private /etc/pki/tls/certs
sudo install -d -m 0700 /etc/pki/tls/csr

# OpenSSL-konfiguration med Subject Alternative Names (SAN).
# AD CS ignorerar SAN i CSR:en om mallen inte tillåter det — se steg 2.
sudo tee /etc/pki/tls/csr/kravhantering.cnf >/dev/null <<'EOF'
[ req ]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
req_extensions     = req_ext

[ dn ]
C  = SE
ST = Stockholm
L  = Stockholm
O  = Viscalyx
OU = Kravhantering PoC
CN = kravhantering.poc.intern.example.com

[ req_ext ]
subjectAltName = @alt_names
keyUsage       = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[ alt_names ]
DNS.1 = kravhantering.poc.intern.example.com
DNS.2 = kravhantering-poc
EOF

sudo openssl req -new -newkey rsa:2048 -nodes \
    -keyout /etc/pki/tls/private/kravhantering.key \
    -out    /etc/pki/tls/csr/kravhantering.csr \
    -config /etc/pki/tls/csr/kravhantering.cnf

sudo chmod 0600 /etc/pki/tls/private/kravhantering.key
sudo chown root:root /etc/pki/tls/private/kravhantering.key
```

Kontrollera CSR:en innan den skickas:

```bash
openssl req -in /etc/pki/tls/csr/kravhantering.csr -noout -text \
  | grep -E 'Subject:|DNS:|Signature Algorithm'
```

Kopiera `kravhantering.csr` till en Windows-administratörsarbetsplats
(via SCP/WinSCP eller `scp` från admin-klienten). CSR:en innehåller
ingen hemlighet och behöver inte krypteras vid överföring.

#### Steg 2: Utfärda certifikatet via Windows Server PKI

Det rekommenderade verktyget är `certreq.exe` från en Windows-klient
som har nätverksrätt mot CA:n. PoC:n behöver en mall som tillåter
CSR-baserad utfärdning (`Web Server`-mallen, eller en kopia av den
där `Subject Alternative Name = supplied in request` är aktiverat).
Be PKI-teamet om mallnamnet — exemplet använder `WebServer`.

På Windows (PowerShell, kör som en användare med "Enroll"-rätt på
mallen):

```powershell
# Lista tillgängliga CA:er och hitta CA-config-strängen
certutil -config - -ping

# Skicka CSR:en och hämta tillbaka certifikatet
certreq.exe -submit `
    -config "ca01.intern.example.com\Intern Issuing CA" `
    -attrib "CertificateTemplate:WebServer" `
    .\kravhantering.csr `
    .\kravhantering.cer
```

Om CA-policyn kräver manuellt godkännande returnerar `certreq` ett
RequestId. Hämta certifikatet när det är godkänt:

```powershell
certreq.exe -retrieve `
    -config "ca01.intern.example.com\Intern Issuing CA" `
    <RequestId> .\kravhantering.cer
```

Hämta också hela kedjan (utfärdande CA + ev. mellanliggande +
root-CA) som en `.p7b`:

```powershell
certutil -config "ca01.intern.example.com\Intern Issuing CA" `
    -ca.chain .\kravhantering-chain.p7b
```

#### Steg 3: Konvertera och installera på RHEL

Windows-CA:n returnerar oftast certifikatet som **DER** (`.cer`) eller
**PKCS#7** (`.p7b`). nginx på RHEL behöver **PEM**. Konvertera på
RHEL efter att filerna kopierats över:

```bash
# Om kravhantering.cer är DER-kodat → PEM
sudo openssl x509 -inform DER \
    -in  /tmp/kravhantering.cer \
    -out /etc/pki/tls/certs/kravhantering.crt

# Om filen redan är Base64/PEM (börjar med -----BEGIN CERTIFICATE-----)
# räcker det att kopiera den:
# sudo install -m 0644 /tmp/kravhantering.cer \
#     /etc/pki/tls/certs/kravhantering.crt

# Plocka ut alla CA-certifikat ur PKCS#7-kedjan till PEM
sudo openssl pkcs7 -inform DER \
    -in  /tmp/kravhantering-chain.p7b \
    -print_certs \
    -out /etc/pki/tls/certs/kravhantering-chain.pem
```

nginx vill ha **server-cert + utfärdande CA + ev. mellanliggande** i
*samma* fil (root-CA:n behövs inte och bör utelämnas). Bygg kedjan
och sätt rätt rättigheter:

```bash
sudo bash -c 'cat /etc/pki/tls/certs/kravhantering.crt \
                  /etc/pki/tls/certs/kravhantering-chain.pem \
                  > /etc/pki/tls/certs/kravhantering-fullchain.crt'
sudo chmod 0644 /etc/pki/tls/certs/kravhantering-fullchain.crt
```

Granska resultatet:

```bash
openssl x509 -in /etc/pki/tls/certs/kravhantering-fullchain.crt \
    -noout -subject -issuer -dates
openssl verify -CAfile /etc/pki/tls/certs/kravhantering-chain.pem \
    /etc/pki/tls/certs/kravhantering.crt
```

Uppdatera `nginx`-konfigurationen i avsnitt 8 så att
`ssl_certificate` pekar på fullkedje-filen:

```nginx
    ssl_certificate     /etc/pki/tls/certs/kravhantering-fullchain.crt;
    ssl_certificate_key /etc/pki/tls/private/kravhantering.key;
```

Lägg även till företagets root-CA i RHEL:s system-trust så att
utgående anrop (t.ex. SQL Server-TDS över TLS, om databasen flyttas
till en intern instans) litar på interna certifikat:

```bash
sudo cp /tmp/intern-root-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust extract
```

Ladda om nginx och verifiera handskakningen från en intern klient:

```bash
sudo nginx -t && sudo systemctl reload nginx

# Från en annan dator i det interna nätet:
openssl s_client -connect kravhantering.poc.intern.example.com:443 \
    -servername kravhantering.poc.intern.example.com \
    -showcerts </dev/null
```

Förnyelse: AD CS-certifikat har vanligtvis 1–2 års giltighet. Sätt en
påminnelse (eller använd `certmonger` med en lämplig CA-helper) och
upprepa stegen ovan när det är dags. Privatnyckeln kan återanvändas
vid förnyelse om policyn tillåter — annars generera en ny.

## 9. Justeringar i `.env.prodlike`

Standard-`.env.prodlike` pekar på `localhost:3001` och
`localhost:8080`. För PoC:n måste alla URL:er bytas till PoC-värdens
publika namn (det som certifikatet utfärdats för). Skapa
`.env.prodlike.local` (gitignoreras) och låt den åsidosätta de
publika URL:erna:

```bash
NEXT_PUBLIC_SITE_URL=https://kravhantering.poc.example.com
AUTH_OIDC_ISSUER_URL=https://kravhantering.poc.example.com/auth/realms/kravhantering-dev
AUTH_OIDC_REDIRECT_URI=https://kravhantering.poc.example.com/api/auth/callback
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=https://kravhantering.poc.example.com/
AUTH_SESSION_COOKIE_PASSWORD=<openssl rand -base64 48>
MSSQL_SA_PASSWORD=<starkt slumpat lösenord>
```

Kom ihåg att också uppdatera **redirect-URI:erna i Keycloak-realmen**
(`dev/keycloak/realm-kravhantering-dev.json`) eller importera en
anpassad realm för PoC:n så att de matchar de publika URL:erna.
Realmfilen läses in vid varje containerstart.

## 10. Starta PoC:n

Som `kravhantering`-användaren:

```bash
# 1. Klona repo + installera beroenden
git clone https://github.com/viscalyx/Kravhantering.git
cd Kravhantering
npm ci

# 2. Förbered env-filer
cp .env.sqlserver.example .env.sqlserver
$EDITOR .env.sqlserver           # sätt MSSQL_SA_PASSWORD
$EDITOR .env.prodlike.local      # se avsnitt 9

# 3. Starta SQL Server och Keycloak (Podman tar docker-compose-syntax)
podman compose -f docker-compose.sqlserver.yml \
               -f docker-compose.sqlserver.override.yml \
               --env-file .env.sqlserver up -d
podman compose -f docker-compose.idp.yml \
               -f docker-compose.idp.override.yml up -d

# 4. Migrera + seed:a databasen
npm run db:wait
npm run db:setup

# 5. Bygg och starta applikationen
npm run start:prodlike
```

Verifiera utifrån att `https://kravhantering.poc.example.com` svarar,
och att `curl -v telnet://<publik-ip>:1433` och `:8080` ger
*connection refused*.

## 11. Persistens efter omstart (frivilligt men rekommenderat)

För att containrar och Next.js-processen ska starta om efter
serverns omstart, generera systemd-användartjänster (Quadlet är det
moderna alternativet i RHEL 10):

```bash
mkdir -p ~/.config/containers/systemd
# Lägg .container/.kube-filer för db, idp och en .service för Next.js
systemctl --user daemon-reload
systemctl --user enable --now kravhantering-db.service
systemctl --user enable --now kravhantering-idp.service
systemctl --user enable --now kravhantering-app.service
```

Eftersom `loginctl enable-linger` är satt (avsnitt 3) körs dessa
även när ingen är inloggad.

## 12. Sammanfattning av låg-privilegierings-vinster

- Ingen rot-process binder applikationsportar.
- Containrar är osynliga utifrån; bara nginx på `443` är publik.
- SELinux är `enforcing` och bind-mounts är märkta korrekt.
- Firewalld släpper bara igenom SSH (helst nät-begränsad), HTTPS och
  ev. HTTP för ACME.
- PoC-användaren saknar `sudo`-rättigheter helt; drift sker via
  separat admin-konto.

## 13. Beställningar till andra roller

Det här avsnittet sammanfattar vad rollen **applikationsdrift** själv
gör inne på RHEL 10-servern och vad samma roll behöver **beställa** av
andra driftroller innan PoC:n kan tas i drift. Använd det som
checklista när beställningar skickas till respektive team.

### 13.1 Beställs hos serverdrift / virtualiseringsdrift

- **RHEL 10-virtuell maskin** enligt sizing i avsnitt 1: 4 vCPU
  (host-passthrough/CPU-modell matchad mot värd, **ingen** nested
  virtualization krävs), 8 GiB RAM med **reservation** (ingen
  aggressiv ballooning), 40 GiB tunn/tjock disk på paravirtuell
  controller (t.ex. `virtio-scsi`), UEFI + Secure Boot.
- **Operativsystem**: RHEL 10 minimal-installation, registrerad mot
  Red Hat Subscription Management med rätt entitlements (BaseOS +
  AppStream).
- **Gästverktyg/agenter** förinstallerade enligt avsnitt 1.1
  (`qemu-guest-agent`, `open-vm-tools` eller `hyperv-daemons`
  beroende på hypervisor) samt aktiverad host/guest-tidssynkning
  (`/dev/ptp_kvm` om KVM).
- **Backup/snapshot-policy** för VM:en (helst quiesced snapshot via
  guest agent) och dokumenterad återläsningsrutin.
- **Konsol-/OOB-åtkomst** (hypervisorns konsol eller motsvarande
  out-of-band-hantering) för felsökning när SSH inte räcker.
- **Patch-/uppdateringsfönster** och ansvar för OS-patchning utanför
  applikationsstacken om det inte ligger på applikationsdrift.

### 13.2 Beställs hos nätverksdrift

- **Statisk IPv4-adress** eller DHCP-reservation på det interna
  VLAN:et (avsnitt 1.1) — viktigt så att certifikatets SAN och DNS
  fortsätter matcha.
- **Internt DNS A-/PTR-record** för t.ex.
  `kravhantering.poc.example.com` → VM:ens IP (forward + reverse).
- **Brandväggsregler in mot servern** (perimeter-/segment-FW utöver
  värdens firewalld):
  - `tcp/443` från det interna användar-/klientnätet.
  - `tcp/22` endast från admin-/hopp-värdnät.
  - **Inga** öppningar för `1433`, `3001`, `8080` eller `80`.
- **Utgående trafik** (proxy- eller FW-whitelist) till destinationerna
  i avsnitt 5.1: `registry.npmjs.org`, `github.com` /
  `objects.githubusercontent.com`, `mcr.microsoft.com` (+
  `*.data.mcr.microsoft.com`), `quay.io`,
  `registry.access.redhat.com`, `subscription.rhsm.redhat.com`,
  `cdn.redhat.com`, samt DNS (`53/udp`) och NTP (`123/udp`) mot
  godkända interna tjänster.
- **Intern NTP-källa** om miljön inte tillåter publika pool-servrar.

### 13.3 Beställs hos PKI-/AD CS-drift

- **Servercertifikat** från intern Windows Server PKI (avsnitt 8.1)
  utfärdat på en `WebServer`-baserad mall, baserat på CSR genererad
  på RHEL-servern (privat nyckel lämnar **aldrig** servern).
- Certifikatet levereras som **PKCS#7-kedja (`.p7b`)** eller separata
  DER/PEM-filer inkl. utfärdande CA och root-CA.
- **Förnyelserutin** och kontaktväg för nytt certifikat innan utgång
  (ev. `certmonger`-integration om PKI:n stödjer det).

### 13.4 Beställs hos informationssäkerhet / katalog

- **Admin-konto** (separat från PoC-användaren `kravhantering`) med
  SSH-nyckel utlagd för drift och patchning av servern.
- Eventuell **logg-/SIEM-integration** (journald-forwarding, syslog)
  enligt organisationens krav.

### 13.5 Hanteras av rollen applikationsdrift själv

På den levererade RHEL 10-VM:en utför applikationsdrift allt övrigt i
detta dokument:

- Paketinstallation (`dnf`), Node.js 24, firewalld-regler på värden
  (avsnitt 5/6), SELinux-bools och relabel (avsnitt 4).
- PoC-användaren `kravhantering` + `subuid`/`subgid` +
  `loginctl enable-linger` (avsnitt 3).
- CSR-generering, inläggning av utfärdat cert + chain, samt trust
  av intern root-CA via `update-ca-trust` (avsnitt 8.1).
- Compose-overrides, `podman compose up -d`, databasmigrering/seed
  och start av appen via `npm run start:prodlike` (avsnitt 7, 10).
- nginx-konfiguration som reverse proxy mot `127.0.0.1:3001` /
  `127.0.0.1:8080` (avsnitt 8) och valfria Quadlet-tjänster för
  persistens (avsnitt 11).
