# Kortlivade och klientbundna MCP-tjänsttoken

Status: Antagen 2026-08-14.

Kravhantering accepterar endast MCP-tjänsttoken vars skyddade JWT-huvud anger
`typ: at+jwt`, vars `client_id` matchar den konfigurerade MCP-tjänstklienten
och som innehåller alla konfigurerade MCP-åtkomstomfång. Tokenen måste ha
giltiga `exp`, `sub` och `iat` och får som standard vara högst fem minuter
gammal med trettio sekunders klocktolerans. Även den deklarerade livslängden
mellan `iat` och `exp` måste rymmas inom samma gräns. OAuth-claimen `scope`
följer projektets övriga integrationer och är en blankstegsseparerad sträng,
inte en JSON-array.

MCP använder en separat konfigurerad rollclaim. En saknad eller tom rollista
ger inga globala roller, och en okänd eller felformaterad post gör att hela
rollistan ger noll roller. Vi avvisar `azp`-fallback, ID-tokenformade
inloggningsbevis och partiell matchning av åtkomstomfång för att hålla
tjänstegränsen entydig och oberoende av webbläsarens OIDC-konfiguration.

MCP är valfritt på installationsnivå. Om ingen MCP-tjänstklient är
konfigurerad förblir MCP-ytan inaktiverad utan att övrig
applikationskonfiguration underkänns. När MCP är aktiverat valideras all
MCP-specifik konfiguration strikt. `MCP_CLIENT_ID` både aktiverar MCP och
anger MCP-tjänstklientens OAuth-klient-id; variabeln identifierar den
anropande klienten, inte MCP-servern. Servern representeras separat av tokenens
audience.

När `MCP_CLIENT_ID` saknas svarar MCP-ytan med ett stabilt `404` utan
tokenverifiering, OIDC-anrop, audit eller databasarbete. När klient-id finns
men övrig MCP-konfiguration är ogiltig underkänns readiness och MCP-ytan ger
ett stabilt konfigurationsfel före databasarbete.

En aktiverad MCP-yta kräver minst ett uttryckligt konfigurerat
åtkomstomfång. Maximal tokenålder är som standard 300 sekunder och
kan konfigureras mellan 60 och 900 sekunder. Rollclaimen heter som standard
`roles`; klientclaimen `client_id` och tokenklassen `at+jwt` är fasta
kontraktsdelar. Det lokala tokenverktyget kräver samma `MCP_CLIENT_ID` och har
inget eget implicit klient-id.

Alla ogiltiga token ger samma externa autentiseringssvar. Säkerhetsloggen
skiljer orsaker med tillåtna, värdefria orsakskoder och registrerar en token
som accepterad först efter samtliga kontroller. Det lokala tokenverktyget
begär rätt åtkomstomfång och kontrollerar tokenens icke-hemliga form innan
den skrivs ut; MCP-servern är fortfarande den kryptografiska
verifieringsgränsen.
