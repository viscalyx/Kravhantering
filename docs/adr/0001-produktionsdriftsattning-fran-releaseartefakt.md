# Produktionsdriftsättning från releaseartefakt

Produktionsdriftsättning ska kunna göras från en GitHub Release och ett internt
artefaktregister utan att klona kodbasen på målhosten med RHEL. Vi publicerar
ett versionssatt driftsättningspaket med Compose-filer,
konfigurationsmallar, driftsättningsguide, release-metadata och checksummor.
Varje publicerat driftsättningspaket har också en identitetsbunden attestering
med ett projekthanterat predikat samt en nedladdningsbar Sigstore-bunt och
aktuellt betrott rotmaterial. Attesteringsverifiering är ett obligatoriskt
operatörssteg före extrahering. Frånkopplade platser använder den procedur för
offlineverifiering som följer med releasen; endast ett dokumenterat och godkänt
undantag för frånkopplad drift får avstå från verifieringen. Checksumman används
fortsatt för överföringsintegritet, medan attesteringen styrker ursprung från
förväntat repository, release-workflow, käll-commit, käll-ref och
releaseidentitet.

Release-låset registrerar varje images registry manifest digest för
proveniens, signering, attestations och upstream release smoke tests, och
registrerar varje image-ID för runtime equivalence checks efter spegling till
internt registry eller frånkopplad transport. Produktionsreferenser i
`release.env` använder formen `image:tag`, härledd från
`container-stack.lock.json` eller från platsgodkända interna mirror refs.
Operatörer hämtar dessa tag refs när registry-åtkomst finns, eller läser in ett
frånkopplat image bundle och taggar inlästa image-ID:n till konfigurerade refs.
Operatörer verifierar de konfigurerade runtime image refs mot låsta image-ID:n
före första start och uppgraderingsmigreringar.

Det gör runtime-kontraktet granskningsbart och repeterbart även när
tredjeparts upstream tags flyttas efter release. Produktionsplatser bör föredra
release-specifika interna mirror tags för vendor images, medan platsspecifika
hemligheter, certifikat och registry-drift ligger kvar under driftansvar.
