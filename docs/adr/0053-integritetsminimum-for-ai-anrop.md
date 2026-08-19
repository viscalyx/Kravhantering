# Integritetsminimum för AI-anrop

Status: Antagen 2026-08-19.

Kravhantering tillämpar ett administratörsägt integritetsminimum på varje
serverägt AI-anrop: datainsamling är förbjuden och nollagring krävs. Minimumet
verkställs i AI-integrationslagret, mappas uttryckligen av varje adapter och
kan inte försvagas av anropare eller adapterkonfiguration; ofullständig eller
svagare policybevisning stoppar anropet före egress.

Delad referensdata för AI-assisterad kravimport innehåller endast nödvändiga
icke-personliga paketuppgifter. MCP-klienten äger eventuell egen AI-egress;
Kravhantering tillhandahåller ingen MCP-baserad modellkörning och kan därför
inte verkställa sitt integritetsminimum efter att referensdata har lämnats ut.
Allowlisting av leverantörer och modeller är en separat kontroll och
dupliceras inte av integritetsminimumet.
