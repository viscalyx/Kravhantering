# Tidsbegränsat SQL-lager för AI-forensisk evidens

Status: Antagen 2026-08-15.

Kravhantering behåller metadata om AI-säkerhetsblockeringar i
säkerhetsloggen. AI-forensisk evidensinsamling är i stället ett
undantagsflöde för incidentutredning: en administratör begär en avgränsad
insamlingsperiod och en annan person med rollen dataskyddshandläggare
godkänner den. Endast en väntande begäran eller pågående insamlingsperiod får
finnas åt gången, och perioden begränsas till en beslutad AI-operation,
riktning och 5–60 minuter.

Evidensen skrivs till ett AI-forensiskt evidenslager i SQL Server som
applikationen äger och får aldrig gå via vanlig applikationsloggning,
säkerhetsloggen eller åtgärdsloggen. Lagret innehåller endast deterministiskt
valda utdrag centrerade kring regelträffen efter maskering av kända
strukturerade identifierare och hemlighetsmönster. Innehållet betraktas
fortfarande som känsligt och inte som anonymiserat. Varje händelse och
insamlingsperiod har fasta innehålls-, antal- och lagringsgränser.

SQL Servers tid styr aktivering och utgång. Evidens blir läsbar först när
insamlingen har stoppats och endast för den begärande administratören och den
godkännande dataskyddshandläggaren. Levande SQL-data gallras 72 timmar efter
stopp genom den schemalagda, begränsade gallringstjänsten; manuell gallring
och gallring vid en ny aktivering är kompletterande skydd. Databaslagring och
backup ska vara krypterade, men befintliga backuper följer driftorganisationens
separata retention och ska gallras från återställd aktiv data innan trafik
släpps fram.

Dataskyddsflöden visar endast säker metadata om evidensinsamlingen, aldrig
utdrag. Radering som träffar en begärande eller godkännande aktör stoppar och
gallrar hela insamlingen; en exakt träff på en insamlad aktörs
insamlingsspecifika fingeravtryck gallrar den aktörens evidenshändelser.
Okända personuppgifter i utdrag kan inte utlovas vara sökbara via HSA-id.
Admin Centers arkiveringsflöde visar endast aggregerad metadata om föråldrad
evidens och ger dataskyddshandläggaren en manuell gallringsväg utan
arkivexport.

## Övervägda alternativ

- Den tidigare separata stdout-kanalen avvisas eftersom rått innehåll då
  redan har nått processloggen innan plattformen kan styra det vidare, och
  applikationen kan inte garantera åtkomst, utgång eller gallring.
- Ett externt evidenslager kan senare ersätta SQL-lagret bakom samma
  beteendekontrakt, men skjuts upp tills ett konkret integrations- och
  driftkontrakt behövs.

## Konsekvenser

Den globala inställningen och stdout-skrivaren för forensisk AI-loggning tas
bort. Alla styråtgärder, läsningar, fel och gallringar ger endast avgränsade
metadatahändelser. Fel i maskering, lagring eller retention ger ingen
reservväg för innehåll utan faller tillbaka till enbart metadata.
