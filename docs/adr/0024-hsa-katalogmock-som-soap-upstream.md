# HSA-katalogmock som SOAP-upstream

Status: Antagen 2026-06-08.

Kravhantering inför HSA-katalogmocken som en fristående upstream bakom Kong i
devcontainer. Mocken implementerar `GetHsaPerson` nära det riktiga HSA Web
Service-kontraktet och erbjuder även en smal dev-only REST/JSON-fasad för
personuppslag.

Beslutet gör mocken flyttbar till ett eget repository och låter Kong verifiera
API-management-routning utan att dölja SOAP-kontraktets faktiska fel- och
svarsbeteenden. REST-fasaden finns för att Kravhantering ska kunna ha ett
konfigurerbart JSON-anrop mot Kong i lokal utveckling. Den är inte ett
slutgiltigt beslut om hur test eller produktion transformerar mellan REST och
HSA SOAP; den delen ägs av respektive integrationsplattform när miljöernas
API-management-kontrakt fastställs.
