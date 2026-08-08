# Separata SQL-identiteter och explicit runtime-manifest

Status: Antagen 2026-08-08.

Applikationens runtime och databasjobb använder separata SQL
Server-identiteter i samma databas och med `dbo` som standardschema.
Databasjobbet har `db_owner`
för TypeORM-migrering och obligatorisk seedning. Runtime får den stabila
projektrollen `kravhantering_runtime`. Runtime-användare ska inte vara medlemmar
i de breda rollerna `db_datareader` eller `db_datawriter`.

Den versionssatta manifestfilen
`typeorm/runtime-permission-manifest.mjs` är auktoritativ för varje
fullständigt kvalificerat objekt, tillåten operation och eventuell
kolumnbegränsad uppdatering. Nya objekt får ingen implicit runtime-behörighet.
Databasjobbet kör avstämning när migreringen är klar, tar bort oväntade direkta
behörigheter från projektrollen och verifierar manifestets digest samt
deklarerade runtime-användares medlemskap. Om en runtime-användare är medlem i
`db_datareader` eller `db_datawriter` tar avstämningen bort medlemskapet först
när projektrollens behörigheter och medlemskap verifierar korrekt.

Avstämningen ändrar inte andra användarroller, direkta användarbehörigheter
eller lokalt ägda tilläggsroller. Verifieringen misslyckas dock om sådana
behörigheter ger en runtime-användare faktisk rätt att migrera schemat eller
ändra skyddad revisionshistorik. Extern DBA äger login, användare, lösenord och
initialt medlemskap; självförsörjande topologier automatiserar samma
principalsteg.
`DB_RUNTIME_USER` är endast ett icke-hemligt verifieringsnamn och ger varken
behörighet att ansluta som användaren eller rotera dess autentiseringsuppgifter.
