# HSA-katalogmock som SOAP-upstream

Status: Antagen 2026-06-08.

Kravhantering inför HSA-katalogmocken som en fristående SOAP-upstream för
test- och demomiljöer. Mocken implementerar `GetHsaPerson` nära det riktiga
HSA Web Service-kontraktet.

Beslutet gör mocken flyttbar till ett eget repository och låter test- och
demomiljöer verifiera SOAP-kontraktets faktiska fel- och svarsbeteenden utan
beroende till den riktiga HSA-katalogen.

Mocken får bara aktiveras bakom den strikta, tredelade mTLS-topologin:
App–Kong, Kong–Adapter och Adapter–mock använder separata privata CA:er,
rollspecifika identiteter och exakta stabila server- eller klientidentiteter.
En provisioneringstjänst skapar materialet före start och väljer isolerade
rollpaket som monteras skrivskyddade. Delade certifikatvolymer,
klartextstrafik, certifikatgenerering i runtime och TLS-bypass ingår inte i
beslutet.

Test- och demoscenarier måste verifiera nekad åtkomst för oautentiserade,
korskopplade och korrekt-CA-men-fel-identitet-certifikat på alla tre länkar.
Rotation stoppar klienter före servrar och startar servrar före klienter;
rollback återväljer föregående generation med samma ordning. Den stödda
produktions-Compose-topologin är fortsatt oberoende av Kong, Adapter, mock och
detta test-PKI.
