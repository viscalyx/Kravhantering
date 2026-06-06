# Katalog för produktionskonfiguration

Status: Antagen 2026-05-26. Uppföljning spåras i
[issue #251](https://github.com/viscalyx/Kravhantering/issues/251).

Produktionskonfiguration är host-wide configuration som ägs av drift/root, inte
rootless Podman user configuration. Vi behåller `/etc/kravhantering` som
kanonisk sökväg för kopierade miljöfiler, TLS-filer och platsspecifik Keycloak
realm-konfiguration, medan oföränderliga releaseartefakter ligger under
`/opt/kravhantering/releases/<version>` med `/opt/kravhantering/current` som
pekar på aktiv release.

Sökvägen är avsiktligt inte `$HOME/.config/...`: tjänsteanvändarens
XDG-konfigurationskatalog hör till rootless Podman user configuration som
`storage.conf`, medan dessa filer definierar Kravhanterings host-wide
driftsättning och innehåller hemligheter, certifikat och platsspecifika
runtime-värden. Det striktare Filesystem Hierarchy Standard-alternativet för
tilläggsprogramvara installerad under `/opt` är `/etc/opt/kravhantering`. Vi
flyttar inte dit nu eftersom `/etc/kravhantering` är tydligare för operatörer
och redan används i produktionsguider, Compose-filer, systemd units,
hjälpskript, tester, uppgraderingar och avinstallationsflöden.

Vi kan ompröva `/etc/opt/kravhantering` för host-specifik konfiguration och
`/var/opt/kravhantering` för framtida variabel paketdata, om paketering,
regelefterlevnad eller driftsbehov motiverar migreringen.

## Övervägda alternativ

- `/etc/kravhantering`: antaget som nuvarande standard för host-wide
  driftsättningskonfiguration.
- `/etc/opt/kravhantering`: mer formell FHS-anpassning för en applikation vars
  releaseartefakter ligger under `/opt/kravhantering`, men uppskjutet eftersom
  migreringskostnaden är verklig och operatörsnyttan ännu inte är tydlig.
- `/home/kravhantering/.config/...`: avvisat som primär plats för dessa filer
  eftersom de inte är vanlig rootless-user configuration.
- `/var/opt/kravhantering`: reserverat för framtida variabel paketdata om vi
  lägger till host-hanterat föränderligt tillstånd utanför Podman volumes.
