# Stabilt Krav-ID och versionerat innehåll

Status: Antagen 2026-06-05.

Ett `Krav` har ett stabilt `Krav-ID` över hela sin livstid, medan redigerbar
kravtext, verifieringsinformation och verksamhetsmetadata ligger i
`Kravversion`-rader. Ett nytt utkast eller en version i granskning ersätter
inte `Publicerad kravversion`; publicerad användning pekar fortsatt på den
senast publicerade versionen tills en annan version granskas och publiceras.

Livscykelstatus hör till kravversioner, inte bara till den stabila kravraden.
Listvyer och filtrering beräknar därför `Beräknad kravstatus` för ett krav när
flera versioner finns, i stället för att behandla den nyaste versionen som
automatiskt användbar.

Det bevarar stabil identitet för spårbarhet samtidigt som utkaständringar,
granskningsarbete och arkiveringsflöden kan fortsätta utan att tyst ändra den
version som redan är tillgänglig för kravunderlag och användare.

## Övervägda alternativ

- Bara lagra en föränderlig kravrad: avvisat eftersom utkast,
  granskningsändringar och historik skulle skriva över publicerat kravtillstånd.
- Behandla den nyaste versionen som användbar version: avvisat eftersom ett
  utkast eller en version i granskning inte får bli användbar före publicering.
- Bara lagra livscykelstatus på den stabila kravraden: avvisat eftersom olika
  versioner av samma krav kan vara utkast, granskning, publicerade eller
  arkiverade samtidigt.
