# Separat release-låst teststöd för HSA-demo

Status: Antagen 2026-06-12.

Kravhantering publicerar och låser teststödet för HSA-demo separat från
containerstacken för produktion. Produktionslåset
`container-stack.lock.json` fortsätter beskriva de tjänster som krävs för
produktion: `app-runtime`, `db-job`, nginx, SQL Server och Keycloak.
Teststödet beskrivs i `container-test-support.lock.json` och innehåller Kong
och den project-owned HSA-katalogmocken.

Beslutet inför en test-only topologi, `single-node-demo`, för release-test och
disponibla demo-miljöer. Den topologin startar ordinarie single-node-stack och
lägger till Kong samt `hsa-directory-mock` på samma interna Compose-nät.
Kong publicerar inga host-portar i den topologin. Applikationen pekar då
`HSA_PERSON_LOOKUP_URL` mot
`http://kong:8000/hsa/person-records/lookup`, vilket gör att demo-HSA-id:n kan
verifieras utan en riktig HSA-integration.

Kong är fortsatt en vendor image och uppdateras av vendor-image-uppdateraren.
HSA-katalogmocken är däremot project-owned teststöd och byggs, publiceras,
får SBOM och attesteras av container-release-workflow med samma release-tags
som `app-runtime` och `db-job`. Den ska därför inte ingå i
vendor-image-uppdateraren.

Konsekvensen är att produktionsoperatörer får en oförändrad single-node-väg
utan Kong eller HSA-mock, medan release-test kan verifiera hela HSA-uppslaget
mot låsta artefakter. Disconnected-flöden kan exportera och ladda
`single-node-demo` genom att ange både produktionslåset och teststödslåset.
