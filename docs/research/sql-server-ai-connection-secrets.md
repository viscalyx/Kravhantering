# Lagring av AI-anslutningars API-nycklar i SQL Server

## Fråga och förutsättningar

Administratörer ska kunna hantera flera AI-anslutningar med var sin API-nyckel. Flera
Node.js-noder, via TypeORM, `mssql` och Tedious, måste kunna använda samma anslutningar.
Hemligheten får inte lagras i klartext, visas igen i Admin Center eller hamna i loggar.

## Jämförelse

| Alternativ | Skyddar mot | Passar flera noder | Kostnad och begränsning |
| --- | --- | --- | --- |
| TDE | Stulna data- och loggfiler samt säkerhetskopior | Ja, genom SQL Server-driften | Kryptering sker vid sid-I/O. SQL Server och en användare som kan läsa tabellen ser klartext; därför räcker TDE inte som det enda skyddet för API-nycklar. Certifikatet och dess privata nyckel måste säkerhetskopieras för återställning. [Microsoft Learn: TDE](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/transparent-data-encryption?view=sql-server-ver17) |
| SQL-native cellkryptering (`EncryptByKey`) | Datakopior och läsare utan rätt att öppna den symmetriska nyckeln | Ja, om SQL Servers nyckelhierarki följer databasen | En autentiserare kan binda chiffertexten till anslutningsraden, men applikationen måste öppna nyckeln och anropa särskilda T-SQL-funktioner. En tillräckligt privilegierad databasadministratör kan normalt nå både nyckel och data. Nyckel-/certifikatsäkerhetskopiering och återställning blir en del av databaskontraktet. [Microsoft Learn: `EncryptByKey`](https://learn.microsoft.com/en-us/sql/t-sql/functions/encryptbykey-transact-sql?view=sql-server-ver17), [krypteringshierarkin](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/encryption-hierarchy?view=sql-server-ver17) |
| Always Encrypted | Även SQL Server och databasadministratörer utan åtkomst till den externa kolumnhuvudnyckeln | Ja, när alla noder når samma nyckellager | Starkast separation, men kräver ett Always Encrypted-kompatibelt klientlager, kolumnmetadata och ett externt nyckellager. Stödda frågor beror på deterministisk eller randomiserad kryptering; API-nycklar behöver normalt inte frågas efter innehåll. [Microsoft Learn: översikt](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/always-encrypted-database-engine?view=sql-server-ver17), [kolumnhuvudnycklar och nyckellager](https://learn.microsoft.com/en-us/sql/relational-databases/security/encryption/create-and-store-column-master-keys-always-encrypted?view=sql-server-ver17) |
| Applikationskryptering med AES-256-GCM | Databasinnehåll, säkerhetskopior och DB-läsare som saknar applikationens rot­nyckel | Ja, när varje nod får samma aktuella och tidigare rot­nyckelversioner | Minst koppling till SQL Server och TypeORM. GCM ger både sekretess och integritetskontroll, men applikationen äger korrekt nonce-hantering, nyckelrotation, minnes-/loggredaktion och återställning. Node har autentiserad kryptering via `createCipheriv`/`createDecipheriv` och auth-taggar. [Node.js: Crypto](https://nodejs.org/api/crypto.html#class-cipheriv) |

## Tedious i den här stacken

Projektet låser för närvarande Tedious 20.0.0 indirekt via `mssql`. Den versionens källa
innehåller Always Encrypted-flödet, konfigurationsflaggan `columnEncryptionSetting` och
stöd för nyckellagerleverantörer. Det finns bland annat en Azure Key Vault-leverantör.
Se den versionslåsta [anslutningskonfigurationen](https://github.com/tediousjs/tedious/blob/v20.0.0/src/connection.ts)
och [Azure Key Vault-leverantören](https://github.com/tediousjs/tedious/blob/v20.0.0/src/always-encrypted/keystore-provider-azure-key-vault.ts).
Always Encrypted är alltså tekniskt möjligt i drivrutinen, men inför ändå mer schema-,
nyckellager- och integrationsarbete än vad en enda hemlig kolumn motiverar. TypeORM-flödet
måste dessutom verifieras med ett integrationsprov innan lösningen väljs.

## Rekommendation

Använd applikationslagd AES-256-GCM och lagra endast chiffertext i SQL Server. Lagra per
hemlighet minst `ciphertext`, unik slumpad `nonce`, autentiseringstagg, algoritm-/formatversion
och `root_key_version`. Bind stabilt anslutnings-ID och relevant metadata som GCM AAD så att
en chiffertext inte kan flyttas till en annan anslutning utan att verifieringen misslyckas.

Tillför **en extern, versionshanterad 256-bitars rot­nyckel** till samtliga applikationsnoder.
Den ska aldrig ligga i samma databas. Det ger den enklaste lösningen här: administratören
kan skapa och byta de många leverantörsnycklarna i Admin Center, medan driften endast äger
den gemensamma kryptografiska rot­tilliten. Vid behov kan rot­nyckeln vara en KEK som kapslar
en slumpad DEK per hemlighet (envelope encryption); det förenklar gradvis rotation men ger
ytterligare fält och kod. Börja med ett versionshanterat format som tillåter denna övergång.

Viktiga villkor:

- en databasdump ensam ska vara oanvändbar, men en komprometterad applikationsnod kan
  dekryptera de nycklar den behöver;
- rotation kräver att gamla rot­nyckelversioner behålls tills alla rader har krypterats om;
- förlust av rot­nyckeln gör chiffertexten permanent oanvändbar, så säkerhetskopiering och
  åtkomstkontroll måste vara dokumenterade och testade;
- API-svar, loggar, åtgärdslogg, fel, telemetry och Admin Center får endast visa maskerat
  värde eller exempelvis ett fingerprint, aldrig klartext;
- TDE kan fortfarande användas som ett kompletterande, brett skydd för databasen, men
  ersätter inte kolumnens applikationskryptering.

Detta innebär en viktig produktgräns: demo-seed kan skapa ett nästan färdigt OpenRouter-
utkast, men det kan inte bli verifierat och aktivt med enbart databasändringar. Minst den
externa rot­nyckeln och administratörens leverantörsnyckel måste finnas, varefter verklig
verifiering kan aktivera anslutningen.
