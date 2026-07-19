# Servergenererad PDF som rapportformat

Status: Antagen 2026-06-27.

Kravhantering använder servergenererad PDF som leveransform för rapporter och
rapportmenyer ska öppna servergenererade PDF-rapporter direkt. Menytexter
visar endast rapportnamnet.

Beslutet ger central kontroll över filnamn, sidbrytningar och stabil
återgivning för arkivering. React-PDF hålls fortsatt på serversidan så att
produktens strikta CSP inte behöver undantag för klientkörd PDF-rendering.

[ADR 0042](./0042-begransade-synkrona-exporter-och-rapporter.md) begränsar
den stora kravliste-PDF:en och isolerar dess rendering i en terminerbar
server-worker. Övriga små PDF-rapporter använder fortsatt den gemensamma
serverrenderaren.
