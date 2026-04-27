# PoC på RHEL 10 med Podman

<!-- cSpell:ignore oprivilegierad Firewalld firewalld policycoreutils -->
<!-- cSpell:ignore repon repot subuid subgid subuids subgids usermod -->
<!-- cSpell:ignore Keycloaks företagsproxy npmjs blobbar rhsm Tidssync -->
<!-- cSpell:ignore relabelar mounten termering proxa setsebool -->
<!-- cSpell:ignore gitignoreras realmen Realmfilen Quadlet -->

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

## 2. Paket som måste installeras

Installera som `root` (eller via Ansible/Satellite) **innan** PoC-
användaren tar över:

```bash
sudo dnf install -y \
  podman podman-compose podman-plugins \
  container-selinux \
  git curl tar gzip \
  firewalld policycoreutils-python-utils \
  nginx \
  shadow-utils
```

Node.js 24 (krav från `package.json`/`.nvmrc`) installeras enklast via
`nodejs:24`-modulen eller NodeSource:

```bash
sudo dnf module enable -y nodejs:24
sudo dnf install -y nodejs
node --version   # ska visa v24.x
npm --version
```

Om `nodejs:24` inte finns i din kanal, använd NodeSource RPM-repot
eller [`nvm`](https://github.com/nvm-sh/nvm) installerat under
PoC-användaren (rekommenderat för låg-privilegierad körning).

Verktyg som **inte** behöver installeras på värden — de körs i
containrar:

- Microsoft SQL Server (image `mcr.microsoft.com/mssql/server:2022-latest`)
- `sqlcmd` används från host-sidan av `npm run db:*`-skripten via
  containern, men om du vill köra ad-hoc-queries direkt på värden går
  det att lägga till `mssql-tools18` från Microsofts repo (frivilligt).

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
| 80/tcp | HTTP | Användar-nät | **Endast** ACME/HTTP-01 för Let's Encrypt + redirect → 443. Stäng om ni använder DNS-01 eller en intern PKI. |

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
