# PoC på RHEL 10 med Podman

<!-- cSpell:ignore oprivilegierad Firewalld firewalld policycoreutils -->
<!-- cSpell:ignore autostartad -->
<!-- cSpell:ignore repon repot repots subuid subgid subuids subgids usermod -->
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
<!-- cSpell:ignore subnät subnätet pkill -->
<!-- cSpell:ignore servercert konfig konfigfilen extfile Acreateserial -->
<!-- cSpell:ignore mappern tokenvalideringen committade -->

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

## Innehåll

- [1. Hårdvara och OS](#1-hårdvara-och-os)
  - [1.1 Extra steg om RHEL 10 körs som virtuell maskin](#11-extra-steg-om-rhel-10-körs-som-virtuell-maskin)
- [2. Paket som måste installeras](#2-paket-som-måste-installeras)
  - [2.1 Aktivera RHSM-repon (BaseOS + AppStream)](#21-aktivera-rhsm-repon-baseos--appstream)
  - [2.2 Installera baspaketen](#22-installera-baspaketen)
  - [2.3 Importera Red Hats GPG-nycklar](#23-importera-red-hats-gpg-nycklar)
- [3. Dedikerad PoC-användare (rootless Podman)](#3-dedikerad-poc-användare-rootless-podman)
  - [3.1 Byta till kravhantering-användaren](#31-byta-till-kravhantering-användaren)
- [4. SELinux](#4-selinux)
- [5. Nätverk — externa flöden](#5-nätverk--externa-flöden)
  - [5.1 Utgående trafik (måste tillåtas i ev. perimeter-brandvägg)](#51-utgående-trafik-måste-tillåtas-i-ev-perimeter-brandvägg)
  - [5.2 Inkommande trafik (öppnas på serverns publika nätverkskort)](#52-inkommande-trafik-öppnas-på-serverns-publika-nätverkskort)
- [6. Firewalld — minimal regelmängd](#6-firewalld--minimal-regelmängd)
  - [6.1 Verifiera om firewalld redan är aktiverad](#61-verifiera-om-firewalld-redan-är-aktiverad)
  - [6.2 Verifiera befintlig firewalld-konfiguration](#62-verifiera-befintlig-firewalld-konfiguration)
  - [6.3 Lägg till regler](#63-lägg-till-regler)
- [7. Klona repot och bind containerportar till loopback](#7-klona-repot-och-bind-containerportar-till-loopback)
  - [7.1 Klona projektet i `kravhantering`-användarens hemkatalog](#71-klona-projektet-i-kravhantering-användarens-hemkatalog)
  - [7.2 Bind containerportar till loopback](#72-bind-containerportar-till-loopback)
- [8. Reverse proxy som låg-privilegierad TLS-termering](#8-reverse-proxy-som-låg-privilegierad-tls-termering)
  - [8.1 TLS-certifikat från intern Windows Server PKI](#81-tls-certifikat-från-intern-windows-server-pki)
- [9. Justeringar i `.env.prodlike`](#9-justeringar-i-envprodlike)
- [10. Starta PoC:n](#10-starta-poc)
- [11. Persistens efter omstart (frivilligt men rekommenderat)](#11-persistens-efter-omstart-frivilligt-men-rekommenderat)
- [12. Sammanfattning av låg-privilegierings-vinster](#12-sammanfattning-av-låg-privilegierings-vinster)
- [13. Beställningar till andra roller](#13-beställningar-till-andra-roller)
  - [13.1 Beställs hos serverdrift / virtualiseringsdrift](#131-beställs-hos-serverdrift--virtualiseringsdrift)
  - [13.2 Beställs hos nätverksdrift](#132-beställs-hos-nätverksdrift)
  - [13.3 Beställs hos PKI-/AD CS-drift](#133-beställs-hos-pki-ad-cs-drift)
  - [13.4 Beställs hos informationssäkerhet / katalog](#134-beställs-hos-informationssäkerhet--katalog)
  - [13.5 Hanteras av rollen applikationsdrift själv](#135-hanteras-av-rollen-applikationsdrift-själv)
- [Appendix A: Self-signed certifikat för lokal test](#appendix-a-self-signed-certifikat-för-lokal-test)
  - [A.1 Skapa en lokal root-CA (engångssteg per lab-värd)](#a1-skapa-en-lokal-root-ca-engångssteg-per-lab-värd)
  - [A.2 Skapa nyckel + CSR för servern](#a2-skapa-nyckel--csr-för-servern)
  - [A.3 Signera CSR:en med den lokala root-CA:n](#a3-signera-csr-med-den-lokala-root-ca)
  - [A.4 Bygg fullchain och fortsätt med 8.1 Steg 3](#a4-bygg-fullchain-och-fortsätt-med-81-steg-3)
  - [A.5 Förtroende på klientmaskinerna](#a5-förtroende-på-klientmaskinerna)

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

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. Stegen kräver root-rättigheter (`dnf install`,
> `systemctl enable`, redigering av `/etc/chrony.conf`).

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

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `subscription-manager` och `dnf` kräver root.

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

<!-- cspell:ignore filkonflikter restorecon -->
<!-- cspell:ignore dittadminkonto -->

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `dnf install`/`dnf remove` kräver root. (Användaren
> `kravhantering` skapas först i avsnitt 3.)

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

- `podman-compose` installeras istället via `pip` med flaggan `--user`,
  vilket gör att binären hamnar under `~/.local/bin/` för **just den
  användare som körde kommandot**. Eftersom containrarna körs rootless
  som `kravhantering` måste `podman-compose` installeras **för
  `kravhantering`-användaren** — en `pip install --user` som körs av ditt
  admin-konto hjälper inte `kravhantering`. Själva installationen sker
  därför som `kravhantering` i avsnitt
  [7.1](#71-klona-projektet-i-kravhantering-användarens-hemkatalog), när
  `kravhantering`-användaren redan finns och du har växlat över till den
  enligt [3.1](#31-byta-till-kravhantering-användaren). Det räcker här
  med att system-paketet `python3-pip` redan finns på värden (det
  installerades med `dnf install` ovan).

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
icke-versionerade `nodejs`-RPM:en) ska den avinstalleras först —
annars kan `/usr/bin/node` och `/usr/bin/npm` peka på fel version
eller orsaka filkonflikter när `nodejs24` läggs till. Kontrollera och
städa bort:

```bash
# Visa installerade Node-/npm-paket
rpm -qa | grep -E '^(nodejs|npm)'

# Visa aktuella binärer/versioner (om några)
command -v node && node --version || echo "node saknas"
command -v npm  && npm  --version || echo "npm saknas"

# Avinstallera den icke-versionerade nodejs/npm samt övriga nodejs-paket
# (hoppa över raden om kommandona ovan inte returnerade några paket)
sudo dnf remove -y nodejs npm nodejs-full-i18n nodejs-libs nodejs-docs
```

Installera sedan Node.js 24:

```bash
sudo dnf install -y nodejs24 nodejs24-npm
```

`nodejs24`-paketet installerar binärerna som `node-24`, `npm-24` och
`npx-24` under `/usr/bin/`. För att de oversionerade kommandona `node`,
`npm` och `npx` ska peka på version 24 måste de registreras och väljas
via `alternatives`:

<!-- cspell:ignore alternatives oversionerade -->

```bash
sudo alternatives --install /usr/bin/node node /usr/bin/node-24 2400
sudo alternatives --install /usr/bin/npm  npm  /usr/bin/npm-24  2400
sudo alternatives --install /usr/bin/npx  npx  /usr/bin/npx-24  2400

sudo alternatives --set node /usr/bin/node-24
sudo alternatives --set npm  /usr/bin/npm-24
sudo alternatives --set npx  /usr/bin/npx-24

# Töm bash-kommandocachen så att den nya sökvägen plockas upp
# i samma session
hash -r

node --version   # ska visa v24.x, t.ex. v24.14.1
npm --version    # ska visa 11.x, t.ex. 11.11.0
npx --version    # ska visa samma version som npm
```

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

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `dnf update` och `rpmkeys --import` kräver root.

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

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `useradd`, `passwd`, `usermod` och `loginctl` kräver root.
> Användaren `kravhantering` skapas i detta avsnitt och tar över i
> avsnitten 7, 9, 10 och 11.

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

Växla **inte** till `kravhantering` direkt efter detta steg. Eftersom
kontot är skapat utan lösenord (`passwd -l` ovan) kan det inte köra
`sudo`, och flera kommande avsnitt kräver root-rättigheter. Fördela
arbetet enligt följande:

- **Kör som ditt admin-konto med `sudo`** (inte som `kravhantering`):
  - [4. SELinux](#4-selinux) — eventuella `setsebool`/policy-ändringar.
  - [6. Firewalld — minimal regelmängd](#6-firewalld--minimal-regelmängd).
  - [8. Reverse proxy …](#8-reverse-proxy-som-låg-privilegierad-tls-termering)
    — installation och konfiguration av nginx samt
    `setsebool -P httpd_can_network_connect 1`.
  - I [8.1 TLS-certifikat …](#81-tls-certifikat-från-intern-windows-server-pki)
    de steg som installerar/uppdaterar systemets cert-trust
    (`update-ca-trust`) och som lägger certifikat/nyckel under
    `/etc/pki/tls/`.
- **Kör som `kravhantering`** (växla först enligt
  [3.1](#31-byta-till-kravhantering-användaren)):
  - [7. Klona repot och bind containerportar till loopback](#7-klona-repot-och-bind-containerportar-till-loopback)
    — `git clone`, `docker-compose.idp.override.yml` och
    `.env.{sqlserver,idp,prodlike.local}` läggs i
    användarens hemkatalog.
  - CSR-/nyckelgenereringen (`openssl req …`) i 8.1 — den privata
    nyckeln ska ägas av `kravhantering`, inte av root.
  - [9. Justeringar i `.env.prodlike`](#9-justeringar-i-envprodlike).
  - Avsnitt 10 "Starta PoC:n" (`podman compose …`,
    `npm run start:prodlike`).
  - [11. Persistens efter omstart …](#11-persistens-efter-omstart-frivilligt-men-rekommenderat)
    — `systemd --user`-units (Quadlet) som ägs av användaren.

Se [3.1](#31-byta-till-kravhantering-användaren) för hur du växlar till
`kravhantering` från ditt admin-konto när du når ett sådant avsnitt.

### 3.1 Byta till kravhantering-användaren

Eftersom `kravhantering`-kontot har låst lösenord (`passwd -l` ovan)
måste du växla till det antingen från ditt admin-konto via `sudo` eller
genom att logga in direkt med en SSH-nyckel.

#### Alternativ 1: Växla till `kravhantering` med `sudo`

Använd när du redan är inloggad som ditt eget admin-konto på servern.
Ersätt `<dittadminkonto>` nedan med ditt personliga användarnamn.

```bash
ssh <dittadminkonto>@servernamn
sudo -iu kravhantering
```

Verifiera att du är rätt användare i rätt hemkatalog:

```bash
whoami   # ska skriva ut: kravhantering
pwd      # ska skriva ut: /home/kravhantering
```

Kör därefter guidens kommandon. Återgå till ditt vanliga konto med:

```bash
exit
```

#### Alternativ 2: Logga in som `kravhantering` via SSH-nyckel

Använd när du vill kunna logga in direkt som `kravhantering` (t.ex.
för persistenta `systemd --user`-tjänster eller automation).

1. **Skapa nyckelpar på din lokala dator** (utanför servern):

   ```bash
   ssh-keygen -t ed25519 -C "kravhantering" \
     -f ~/.ssh/kravhantering_ed25519
   ```

2. **Kopiera den publika nyckeln** — visa och kopiera hela raden:

   ```bash
   cat ~/.ssh/kravhantering_ed25519.pub
   ```

3. **Lägg in nyckeln på servern**. Logga in som ditt admin-konto och:

   ```bash
   sudo install -d -o kravhantering -g kravhantering -m 700 \
     /home/kravhantering/.ssh
   sudo -u kravhantering tee -a /home/kravhantering/.ssh/authorized_keys \
     >/dev/null <<'EOF'
   ssh-ed25519 AAAA...din-publika-nyckel... kravhantering
   EOF
   sudo chmod 600 /home/kravhantering/.ssh/authorized_keys
   sudo restorecon -Rv /home/kravhantering/.ssh
   ```

   `restorecon` återställer SELinux-kontexten på `.ssh`-katalogen så
   att `sshd` får läsa `authorized_keys` (annars nekas inloggningen
   tyst i `enforcing`-läge).

4. **Logga in från din lokala dator**:

   ```bash
   ssh -i ~/.ssh/kravhantering_ed25519 kravhantering@servernamn
   ```

   Verifiera:

   ```bash
   whoami   # ska skriva ut: kravhantering
   pwd      # ska skriva ut: /home/kravhantering
   ```

## 4. SELinux

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `setsebool -P` och övriga policy-kommandon kräver root.

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

<!-- markdownlint-enable MD013 -->

**Inga andra portar** (varken `3001`, `8080` eller `1433`) ska vara
nåbara utifrån. Containrarna binds till loopback i avsnitt 7.

## 6. Firewalld — minimal regelmängd

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. `systemctl` och `firewall-cmd --permanent` kräver root.
> Verifierings­kommandon (`systemctl is-enabled`, `firewall-cmd
> --list-all`) går att köra utan `sudo`.

### 6.1 Verifiera om firewalld redan är aktiverad

Innan `firewalld` aktiveras, kontrollera om tjänsten redan är installerad,
startad och autostartad. Då slipper du köra om steg som redan är på plats.

```bash
# Är paketet installerat?
rpm -q firewalld || echo "firewalld är inte installerat"

# Startar tjänsten automatiskt vid boot?
systemctl is-enabled firewalld

# Kör tjänsten just nu?
systemctl is-active firewalld
```

Tolkning:

- `enabled` = startar automatiskt vid boot, `disabled` = startar inte
  automatiskt vid boot.
- `active` = kör just nu, `inactive` = kör inte just nu.

Om `firewalld` redan är både `enabled` och `active` kan kommandot nedan
hoppas över. Annars aktivera och starta:

```bash
sudo systemctl enable --now firewalld
```

### 6.2 Verifiera befintlig firewalld-konfiguration

Innan nya regler läggs till, lista vad som redan är konfigurerat så att
inga steg upprepas i onödan:

```bash
# Default-zon och aktiva zoner
sudo firewall-cmd --get-default-zone
sudo firewall-cmd --get-active-zones

# Komplett dump av aktuell zon (interface, services, ports, rich-rules)
sudo firewall-cmd --zone=public --list-all
```

Jämför utdata med stegen nedan och kör bara de `firewall-cmd`-rader vars
service / interface / rich-rule **inte** redan finns med i `--list-all`.
Om allt redan stämmer kan hela 6.3 hoppas över.

### 6.3 Lägg till regler

Lägg det publika gränssnittet i en restriktiv zon (`public` är default)
och tillåt bara nödvändiga tjänster. Allt annat blockeras implicit. Kör
endast de rader vars motsvarande regel saknas enligt 6.2.

```bash
# Anta att eth0 är det publika nic:et
sudo firewall-cmd --zone=public --change-interface=eth0 --permanent

# Behåll SSH (gärna begränsat till admin-nätet via en rich rule)
sudo firewall-cmd --zone=public --add-service=ssh --permanent

# Publik HTTPS (port 80/HTTP behövs inte — PoC:n är intern och
# certifikatet kommer från intern Windows Server-PKI enligt 8.1,
# inte via ACME/HTTP-01)
sudo firewall-cmd --zone=public --add-service=https --permanent

# Aktivera reglerna
sudo firewall-cmd --reload
```

För extra åtstramning av SSH (kontrollera först att en motsvarande
rich-rule inte redan finns enligt 6.2).

> **Varning:** Att ta bort `ssh`-tjänsten och köra `firewall-cmd --reload`
> i fel ordning kan låsa ute den pågående SSH-sessionen. Följ sekvensen
> nedan, som lägger till den smala allow-regeln **först** (både i runtime
> och permanent), verifierar den, och tar bort den breda `ssh`-tjänsten
> **sist** — utan en mellanliggande `--reload`.

Kontrollera först vilken IP din SSH-session kommer ifrån — den måste
ligga i admin-nätet (här `10.20.0.0/24`, justera till ert verkliga
admin-subnät enligt [13.2](#132-beställs-hos-nätverksdrift)):

```bash
echo "$SSH_CLIENT"
```

Första fältet ska matcha admin-subnätet, t.ex. `10.20.0.42 ...`.

Lägg sedan eventuellt en rollback-timer som återställer den breda
`ssh`-tjänsten efter 2 minuter om något går fel — kör som admin i en
parallell session, **innan** ändringarna börjar:

```bash
sudo bash -c 'sleep 120; \
  firewall-cmd --permanent --zone=public --add-service=ssh; \
  firewall-cmd --reload' &
```

Genomför sedan ändringen i denna säkra ordning:

```bash
# 1. Lägg till den smala SSH-allow-regeln i runtime
sudo firewall-cmd --zone=public --add-rich-rule=\
'rule family=ipv4 source address=10.20.0.0/24 service name=ssh accept'

# 2. Lägg till samma regel permanent
sudo firewall-cmd --permanent --zone=public --add-rich-rule=\
'rule family=ipv4 source address=10.20.0.0/24 service name=ssh accept'

# 3. Bekräfta att regeln är aktiv i runtime
sudo firewall-cmd --zone=public --list-rich-rules

# 4. Ta bort den breda ssh-tjänsten från runtime
sudo firewall-cmd --zone=public --remove-service=ssh

# 5. Ta bort den breda ssh-tjänsten permanent
sudo firewall-cmd --permanent --zone=public --remove-service=ssh
```

Stäng **inte** den befintliga SSH-sessionen ännu. Öppna en andra
SSH-session från en annan terminal i samma admin-subnät och bekräfta att
inloggning fungerar. Först därefter:

```bash
sudo firewall-cmd --reload
```

Testa en ny SSH-inloggning igen. Om allt fungerar, avbryt
rollback-jobbet (om du startade ett):

```bash
jobs
sudo pkill -f 'sleep 120;.*add-service=ssh'
```

Verifiera slutresultatet:

```bash
sudo firewall-cmd --zone=public --list-all
```

Notera: eftersom Podman körs **rootless** och alla tjänsteportar binds
till `127.0.0.1` behövs **inga** firewalld-undantag för `1433`, `8080`
eller `3001`. Det är hela poängen med den låg-privilegierade designen.

## 7. Klona repot och bind containerportar till loopback

> **Användare:** Kör som `kravhantering` (växla först enligt
> [3.1](#31-byta-till-kravhantering-användaren)). Repot, override-filerna
> och `npm`-cachen läggs under `/home/kravhantering/` och läses av
> rootless `podman compose` och `npm`. Inga steg i detta avsnitt kräver
> `sudo`.

### 7.1 Klona projektet i `kravhantering`-användarens hemkatalog

Resterande avsnitt (7.2, 9, 10, 11) utgår från att Kravhantering-repot
ligger under `/home/kravhantering/Kravhantering/`. Klona det därför
**innan** override-filen i 7.2 skapas, eftersom den ska ligga bredvid
`docker-compose.idp.yml` i repot.

```bash
cd ~
git clone https://github.com/viscalyx/Kravhantering.git
cd Kravhantering
```

Verifiera att compose-filerna finns på plats (övriga avsnitt refererar
till dem med relativa sökvägar):

```bash
ls docker-compose.idp.yml docker-compose.sqlserver.yml
```

Installera även `podman-compose` för `kravhantering`-användaren — det
är en `pip install --user`-installation som hamnar under
`~/.local/bin/` och därför **måste köras av `kravhantering`** (en
installation gjord av ditt admin-konto är inte tillgänglig här). Lägg
samtidigt till `~/.local/bin` på `PATH` så att `podman compose` hittar
binären:

```bash
python3 -m pip install --user podman-compose

# Lägg till ~/.local/bin på PATH för framtida login-shells och i den
# nuvarande sessionen
grep -qxF 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc \
  || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/.local/bin:$PATH"

# Verifiera att binären hittas och att Podman-subkommandot plockar upp den
command -v podman-compose
podman compose version
```

`npm ci` körs först i avsnitt 10 — då har `.env.prodlike.local`
(avsnitt 9) hunnit skapas och containrarna i 10 startats först.

### 7.2 Bind containerportar till loopback

Compose-filerna i repot binder portarna till alla interface som
standard (`"8080:8080"`, `"1433:1433"`). För PoC:n ska de bindas
endast till `127.0.0.1`.

> **Varför inte en `ports:`-override?** I Compose är `ports:` en lista
> som **slås ihop additivt** mellan filerna i stället för att skrivas
> över. En lokal `docker-compose.*.override.yml` med `"127.0.0.1:1433:1433"`
> resulterar därför i att både den ursprungliga `1433:1433`-mappningen
> och loopback-mappningen försöker bindas, vilket gör att containern
> failar med *port already in use*. Använd i stället de
> `*_HOST_PORT`-variabler som baskonfigurationen redan stödjer — de
> är interpolation-variabler, inte listor, och **ersätts** rent när
> de sätts.

Bas-filerna binder porten via
`${SQLSERVER_HOST_PORT:-1433}:1433` respektive
`${KEYCLOAK_HOST_PORT:-8080}:8080`. Sätter du variabeln till
`127.0.0.1:1433` expanderas mappningen till `127.0.0.1:1433:1433`,
vilket är exakt den loopback-bindning som behövs.

Lägg därför till följande rad sist i `~/Kravhantering/.env.sqlserver`
(filen kopieras från `.env.sqlserver.example` i avsnitt 10):

```env
SQLSERVER_HOST_PORT=127.0.0.1:1433
```

För `idp` finns ingen motsvarande `--env-file` i
`docker-compose.idp.yml`, så skapa en separat `.env.idp` i repots
rot (`~/Kravhantering/`) och peka på den med `--env-file` i
avsnitt 10:

```env
KEYCLOAK_HOST_PORT=127.0.0.1:8080
```

För SELinux behöver bind-mounten i `docker-compose.idp.yml`
relabel-flaggan `Z`. Det är en **map-värdes**-override (samma
volume-target ersätts) och kan därför läggas i en lokal
`docker-compose.idp.override.yml` i `~/Kravhantering/`:

```yaml
services:
  idp:
    volumes:
      - ./dev/keycloak:/opt/keycloak/data/import:ro,Z
```

Podman Compose plockar upp `docker-compose.idp.override.yml`
automatiskt om filen ligger bredvid huvudfilen. `:Z` SELinux-relabelar
bind-mounten så att containern får läsa `realm-kravhantering-dev.json`.
Någon `docker-compose.sqlserver.override.yml` behövs **inte**, eftersom
loopback-bindningen för `db` styrs helt via `SQLSERVER_HOST_PORT`.

## 8. Reverse proxy som låg-privilegierad TLS-termering

> **Användare:** Kör som ditt admin-konto (`<dittadminkonto>`) med
> `sudo`. nginx, `setsebool -P` och `systemctl enable --now nginx`
> kräver root. (CSR-/nyckelgenereringen i 8.1 körs däremot som
> `kravhantering` — se användarrutan i det avsnittet.)

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
    listen 443 ssl;
    http2 on;
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

> **Aktivera inte `nginx` ännu.** Tjänsten startas först i avsnitt 8.1
> när TLS-certifikatet (`/etc/pki/tls/certs/kravhantering.crt` och
> motsvarande nyckel) finns på plats — annars vägrar `nginx` att
> starta eftersom `ssl_certificate`-sökvägen inte går att läsa.

Alternativ: använd **Caddy** för automatisk Let's Encrypt-hantering,
eller kör nginx i en rootless container med
`net.ipv4.ip_unprivileged_port_start=443` satt via `sysctl`. För en
PoC är det enklast att låta `nginx` köra som system-tjänst.

### 8.1 TLS-certifikat från intern Windows Server PKI

> **Användare:** Blandat — varje delsteg nedan anger användare:
> Steg 1 körs som ditt admin-konto med `sudo` (filer hamnar under
> `/etc/pki/tls/`), Steg 2 körs på en Windows-administratörsklient,
> och Steg 3 (konvertering, fullchain-bygge, `update-ca-trust`,
> `nginx -t`/`enable --now`/`reload`) körs som ditt admin-konto med `sudo`.

Eftersom PoC:n endast är åtkomlig på det interna nätverket utfärdas
servercertifikatet lämpligen av företagets befintliga **Active
Directory Certificate Services (AD CS)**. Klienterna har redan
företagets root-/utfärdande CA i sitt trust store, så ingen extern CA
behövs.

> **Alternativ för lokal test:** om du kör PoC:n på en lab-maskin
> utan tillgång till AD CS kan du istället skapa ett **self-signed**
> certifikat (egen lokal root-CA + servercert signerat av den) — se
> [Appendix A: Self-signed certifikat för lokal test](#appendix-a-self-signed-certifikat-för-lokal-test).
> Det resulterar i samma filer i `/etc/pki/tls/`, så avsnitt 8 och
> resten av 8.1 (nginx-konfig, `update-ca-trust`, verifiering) gäller
> oförändrat. Använd **inte** self-signed cert i en delad miljö —
> bara på en enskild lab-värd där du själv kontrollerar klienterna.

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

Ladda om nginx och verifiera handskakningen från en intern klient.
Vid första installationen är `nginx`-tjänsten inte aktiv ännu (se
noten i avsnitt 8) — då används `enable --now` istället för `reload`:

```bash
sudo nginx -t

# Första gången (tjänsten är inte aktiv ännu):
sudo systemctl enable --now nginx

# Vid efterföljande certifikatsbyten/förnyelse:
sudo systemctl reload nginx

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

> **Användare:** Kör som `kravhantering` (växla först enligt
> [3.1](#31-byta-till-kravhantering-användaren)). `.env.prodlike.local`
> ligger i användarens projektkatalog och läses av `npm run
> start:prodlike` i nästa avsnitt.

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
(`dev/keycloak/realm-kravhantering-dev.json`) så att de matchar de
publika URL:erna. Filen monteras read-only in i `idp`-containern (se
`docker-compose.idp.yml`) och importeras vid containerstart, så
ändringarna här plockas upp automatiskt när `idp`-containern startas
första gången i [10. Starta PoC:n](#10-starta-poc). Om `idp` redan har
startats (t.ex. vid en senare justering av JSON-filen) krävs en
`podman compose -f docker-compose.idp.yml restart idp` för att den nya
realmen ska läsas in.

Klienten som körs av `npm run start:prodlike` heter
`kravhantering-local` och har som standard följande fält pekande mot
`http://localhost:3001` / `http://127.0.0.1:3001`:

- `clients[].redirectUris` — t.ex. `http://localhost:3001/api/auth/callback`
- `clients[].webOrigins` — t.ex. `http://localhost:3001`
- `clients[].attributes."post.logout.redirect.uris"` —
  `##`-separerad lista, t.ex. `http://localhost:3001/##http://127.0.0.1:3001/`

För PoC:n ska samtliga ovan ersättas av en enda PoC-URL (samma DNS-namn
som certifikatet i 8.1 utfärdats för). Sätt först miljövariabeln
`POC_HOST` och kör sedan en `jq`-uppdatering på plats — det hanterar
både listorna och `##`-strängen utan att du behöver redigera JSON för
hand:

```bash
# Som kravhantering, i ~/Kravhantering/
sudo dnf install -y jq    # om jq saknas; körs som ditt admin-konto

export POC_HOST="kravhantering.poc.example.com"
REALM=dev/keycloak/realm-kravhantering-dev.json

cp "$REALM" "$REALM.bak"

jq --arg base "https://$POC_HOST" '
  (.clients[] | select(.clientId=="kravhantering-local"))
    |= ( .redirectUris = [ $base + "/api/auth/callback" ]
       | .webOrigins   = [ $base ]
       | .attributes."post.logout.redirect.uris" = ($base + "/")
       )
' "$REALM.bak" > "$REALM"

# Verifiera att ingen localhost-/127.0.0.1-URL finns kvar för
# kravhantering-local
jq '.clients[] | select(.clientId=="kravhantering-local")
     | {redirectUris, webOrigins,
        postLogout: .attributes."post.logout.redirect.uris"}' "$REALM"
```

Förväntat resultat (med `POC_HOST=kravhantering.poc.example.com`):

```json
{
  "redirectUris": ["https://kravhantering.poc.example.com/api/auth/callback"],
  "webOrigins": ["https://kravhantering.poc.example.com"],
  "postLogout": "https://kravhantering.poc.example.com/"
}
```

Den andra klienten i realmen, `kravhantering-app`, används av
dev-servern på port 3000/3001 och behöver inte ändras för PoC:n
— `start:prodlike` använder bara `kravhantering-local`.

**MCP-klienten (`kravhantering-mcp`) fungerar i prodlike utan
extra åtgärder.** Den är en service-account-klient
(`client_credentials`) utan redirect-URI:er, så den är inte beroende
av PoC-värdnamnet. Audience-mappern på `kravhantering-mcp` sätter
`aud=kravhantering-app` på MCP-tokens, och `.env.prodlike` sätter
`AUTH_OIDC_API_AUDIENCE=kravhantering-app` så att tokenvalideringen i
[`lib/auth/mcp-token.ts`](../lib/auth/mcp-token.ts) accepterar dem
även när inloggade användare går via `kravhantering-local`. Externa
MCP-klienter hämtar token från `${AUTH_OIDC_ISSUER_URL}/protocol/openid-connect/token`
med `client_id=kravhantering-mcp` och secret från realmen — secret-värdet
`dev-only-mcp-secret` i den committade realmen ska bytas mot ett
genererat värde innan PoC:n exponeras för riktiga MCP-klienter (sätt
nytt `secret` på `kravhantering-mcp`-klienten i
`dev/keycloak/realm-kravhantering-dev.json` med samma `jq`-mönster
som ovan, t.ex. `... | .secret = "<nytt-värde>"`).

Den uppdaterade JSON-filen läses in när `idp`-containern startas första
gången i [10. Starta PoC:n](#10-starta-poc) — ingen `restart` behövs i
det här läget. Om du justerar realmen efteråt (när `idp` redan körs),
kör då:

```bash
podman compose -f docker-compose.idp.yml restart idp
```

## 10. Starta PoC:n

> **Användare:** Kör som `kravhantering` (växla först enligt
> [3.1](#31-byta-till-kravhantering-användaren)). Rootless `podman
> compose`, `npm ci` och `npm run start:prodlike` ska alla köras av
> PoC-användaren — inte med `sudo`.

Som `kravhantering`-användaren, från repots rotkatalog
(`~/Kravhantering/`, klonad i [7.1](#71-klona-projektet-i-kravhantering-användarens-hemkatalog)):

```bash
# 1. Installera beroenden
cd ~/Kravhantering
npm ci

# 2. Förbered env-filer
cp .env.sqlserver.example .env.sqlserver
$EDITOR .env.sqlserver           # MSSQL_SA_PASSWORD + SQLSERVER_HOST_PORT (se 7.2)
$EDITOR .env.idp                 # KEYCLOAK_HOST_PORT=127.0.0.1:8080 (se 7.2)
$EDITOR .env.prodlike.local      # se avsnitt 9

# 3. Starta SQL Server och Keycloak (Podman tar docker-compose-syntax)
podman compose -f docker-compose.sqlserver.yml \
               --env-file .env.sqlserver up -d
podman compose -f docker-compose.idp.yml \
               -f docker-compose.idp.override.yml \
               --env-file .env.idp up -d

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

> **Användare:** Kör som `kravhantering` (växla först enligt
> [3.1](#31-byta-till-kravhantering-användaren)). Quadlet-units läggs
> under `~/.config/containers/systemd/` och hanteras med
> `systemctl --user` — alltså utan `sudo`. `loginctl enable-linger`
> är redan satt i avsnitt 3 av admin-kontot.

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
- Firewalld släpper bara igenom SSH (helst nät-begränsad) och HTTPS.
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

## Appendix A: Self-signed certifikat för lokal test

> **Användare:** Kör som ditt admin-konto med `sudo` (filer hamnar
> under `/etc/pki/tls/` och `/etc/pki/ca-trust/source/anchors/`).
> Kommandona ersätter Steg 1 + Steg 2 i [8.1](#81-tls-certifikat-från-intern-windows-server-pki).
> Steg 3 (fullchain-bygge, nginx-konfig, `update-ca-trust`,
> `nginx -t`/`enable --now`/`reload`) körs sedan oförändrat.

Om du sätter upp PoC:n på en isolerad lab-värd utan tillgång till
AD CS kan du istället signera servercertifikatet med en **lokalt
genererad root-CA**. Resultatet blir samma filer i `/etc/pki/tls/`
som i 8.1, så resten av guiden (nginx-konfig, `update-ca-trust`,
`https://`-verifiering) fungerar utan ändringar.

> **Säkerhetsnot:** self-signed cert ska bara användas i en lab-/
> testmiljö där du själv kontrollerar både värden och klienterna.
> Den lokala root-CA:ns privata nyckel (`local-root-ca.key`) ger
> möjlighet att utfärda certifikat för **vilka** intern-namn som
> helst — låt den aldrig lämna labb-värden, och radera den när
> PoC:n är avvecklad.

### A.1 Skapa en lokal root-CA (engångssteg per lab-värd)

```bash
sudo install -d -m 0755 /etc/pki/tls/certs
sudo install -d -m 0700 /etc/pki/tls/private /etc/pki/tls/csr

# Privat nyckel för den lokala root-CA:n (10 års giltighet räcker
# gott och väl för en PoC).
sudo openssl genrsa -out /etc/pki/tls/private/local-root-ca.key 4096
sudo chmod 0600 /etc/pki/tls/private/local-root-ca.key

# Self-signed root-cert. CN/O sätts så att det är lätt att känna
# igen i klienternas trust store.
sudo openssl req -x509 -new -nodes -sha256 -days 3650 \
    -key  /etc/pki/tls/private/local-root-ca.key \
    -out  /etc/pki/tls/certs/local-root-ca.crt \
    -subj "/C=SE/O=Viscalyx/OU=Kravhantering PoC Lab/CN=Kravhantering Lab Root CA"
```

### A.2 Skapa nyckel + CSR för servern

Återanvänd samma OpenSSL-konfig som i [8.1 Steg 1](#steg-1-skapa-nyckel-och-csr-på-rhel)
(`/etc/pki/tls/csr/kravhantering.cnf` med `subjectAltName`,
`keyUsage` och `extendedKeyUsage = serverAuth`). Skapa sedan
servernyckeln och CSR:en på samma sätt:

```bash
sudo openssl req -new -newkey rsa:2048 -nodes \
    -keyout /etc/pki/tls/private/kravhantering.key \
    -out    /etc/pki/tls/csr/kravhantering.csr \
    -config /etc/pki/tls/csr/kravhantering.cnf

sudo chmod 0600 /etc/pki/tls/private/kravhantering.key
sudo chown root:root /etc/pki/tls/private/kravhantering.key
```

### A.3 Signera CSR:en med den lokala root-CA:n

SAN måste kopieras från CSR:en till det utfärdade certifikatet — det
sker via `-extfile`/`-extensions` som pekar på samma `req_ext`-block
i konfigfilen.

```bash
sudo openssl x509 -req -sha256 -days 825 \
    -in  /etc/pki/tls/csr/kravhantering.csr \
    -CA  /etc/pki/tls/certs/local-root-ca.crt \
    -CAkey /etc/pki/tls/private/local-root-ca.key \
    -CAcreateserial \
    -extfile /etc/pki/tls/csr/kravhantering.cnf \
    -extensions req_ext \
    -out /etc/pki/tls/certs/kravhantering.crt

sudo chmod 0644 /etc/pki/tls/certs/kravhantering.crt
```

> 825 dagar är max-giltighet som de flesta moderna klienter (inkl.
> webbläsare baserade på Apple/Mozilla/Chromium-policyn) accepterar
> för servercertifikat — håll dig under den gränsen även för
> self-signed cert i lab.

Verifiera att SAN finns med och att signaturen går att följa:

```bash
openssl x509 -in /etc/pki/tls/certs/kravhantering.crt \
    -noout -subject -issuer -dates -ext subjectAltName
openssl verify -CAfile /etc/pki/tls/certs/local-root-ca.crt \
    /etc/pki/tls/certs/kravhantering.crt
```

### A.4 Bygg fullchain och fortsätt med 8.1 Steg 3

För self-signed-fallet är "kedjan" bara den lokala root-CA:n. Bygg
fullchain-filen som nginx förväntar sig och hoppa sedan tillbaka in
i [8.1 Steg 3](#steg-3-konvertera-och-installera-på-rhel) från och
med nginx-konfigurationen:

```bash
sudo bash -c 'cat /etc/pki/tls/certs/kravhantering.crt \
                  /etc/pki/tls/certs/local-root-ca.crt \
                  > /etc/pki/tls/certs/kravhantering-fullchain.crt'
sudo chmod 0644 /etc/pki/tls/certs/kravhantering-fullchain.crt

# Lägg den lokala root-CA:n i RHEL:s system-trust så att lokala
# verktyg (curl, openssl, nodejs) litar på certifikatet.
sudo cp /etc/pki/tls/certs/local-root-ca.crt \
    /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust extract
```

### A.5 Förtroende på klientmaskinerna

Webbläsare och OS som ansluter till `https://kravhantering.poc.…`
kommer att varna tills du importerar `local-root-ca.crt` (filen
under `/etc/pki/tls/certs/`) i deras trust store:

- **Windows:** dubbelklicka på `.crt`-filen → *Install Certificate*
  → *Local Machine* → *Trusted Root Certification Authorities*.
- **macOS:** dubbelklicka → *Keychain Access* → *System* → markera
  certifikatet → *Get Info* → *Trust* → *Always Trust*.
- **Linux:** kopiera filen till `/etc/pki/ca-trust/source/anchors/`
  (RHEL/Fedora) eller `/usr/local/share/ca-certificates/` (Debian/
  Ubuntu) och kör `update-ca-trust extract` respektive
  `update-ca-certificates`.
- **Firefox** (alla OS) använder eget trust store: *Settings* →
  *Privacy & Security* → *Certificates* → *View Certificates* →
  *Authorities* → *Import…*.
