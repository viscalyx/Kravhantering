# HSA-katalogmock som SOAP-upstream

Status: Antagen 2026-06-08.

Kravhantering inför HSA-katalogmocken som en fristående SOAP-upstream för
test- och demomiljöer. Mocken implementerar `GetHsaPerson` nära det riktiga
HSA Web Service-kontraktet.

Beslutet gör mocken flyttbar till ett eget repository och låter test- och
demomiljöer verifiera SOAP-kontraktets faktiska fel- och svarsbeteenden utan
beroende till den riktiga HSA-katalogen.
