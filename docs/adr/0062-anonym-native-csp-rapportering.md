# Anonym native CSP-rapportering inom REST-registret

Status: Antagen 2026-09-09.

Webbläsarens native CSP-rapportering kan inte sätta applikationens
`X-Requested-With` och kan leverera efter att en session har upphört. Vi inför
därför den explicita transportpolicyn `native-csp-report` enbart för
`POST /api/security/csp-reports`, med publik autentisering, `no-store` och
observerbar wrappermärkning. Registervalidering och fullständighetstester hindrar
att undantaget används för andra operationer. Ordinarie Admin-inställningar
behåller sessionsautentisering, CSRF och transaktionell åtgärdslogg.

Applikationen tar emot obetrodd telemetri utan att tolka medskickade cookies som
identitet. Fasta resursgränser tillämpas före databasarbete, och endast tillåtna
kategorier skickas anonymt till Säkerhetslogg. Vi avstår från en separat insamlare
och från att behandla rapporten som en verifierad verksamhetsåtgärd. Driftens
befintliga process äger logginsamling, åtkomst och retention. Avstängd loggning
påverkar varken webbläsarens rapportkö eller CSP-skyddet.

Se [operatörskontraktet](../operations/csp-reporting.md) för exakta gränser,
integritetsskydd och felbeteende. Beslutet kompletterar
[ADR 0044](0044-rest-registret-som-auktoritativ-transportpolicy.md).
