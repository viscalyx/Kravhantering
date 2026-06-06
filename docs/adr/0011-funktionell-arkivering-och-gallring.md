# Funktionell arkivering och gallring

Status: Antagen 2026-06-05.

Kravhantering skiljer funktionell `Arkivering` från retention-driven
`Gallring`. Funktionell arkivering avgör om en kravversion, kravurvalsfråga,
kravurvalssvar eller ett relaterat verksamhetsobjekt fortfarande är aktivt
användbart.
Retention avgör vilken information som får finnas kvar i aktiv Kravhantering,
när den får gallras och om en `Arkivexport` krävs före gallring.

Retentionsbeslut tas per informationstillgång med verksamhetskriterier som
livscykel eller statusålder, aktiva referenser, kravunderlagshistorik, legal
hold och operativa undantag. Radering av personuppgifter och
personuppgiftsutdrag förblir separata dataskyddsflöden även när samma
informationskategorier innehåller personuppgifter.

Arkitekturen dokumenterar därför policygränser, kvalificeringskriterier och
blockerare för gallring, medan förhandsgranskning, exportbekräftelse,
raderingsmekanik och presentation i Admin Center är implementationsdetaljer.

## Övervägda alternativ

- Behandla livscykelarkivering som kvalificering för radering: avvisat
  eftersom arkiverade krav och kravversioner fortfarande kan behövas för
  spårbarhet.
- Använda en retentionsregel för all data: avvisat eftersom innehåll i
  kravbiblioteket, kravunderlag, behörighetsöversyner, ägaruppdrag, taxonomi
  och bevisunderlag har olika behov av verksamhetshistorik.
- Blanda radering av personuppgifter med gallring: avvisat eftersom
  registrerades rättigheter och verksamhetens retentionspolicy har olika
  mandat, triggers och beviskrav.
