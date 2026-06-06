# Persistensstack med SQL Server och TypeORM

Status: Antagen 2026-06-05.

Kravhantering använder Microsoft SQL Server och TypeORM Data Mapper som sin
enda persistensstack. TypeORM-entiteter och handskrivna migreringar definierar
schemakontraktet, medan repositories och QueryBuilder är standardmönstret för
vanliga CRUD- och lookup-flöden.

Parametriserad raw SQL är ett förstahandsalternativ för komplexa projektioner,
SQL Server-specifikt beteende, atomära mutationer över flera tabeller,
rapport-/exportmatriser och prestandakänsliga vägar. Stored procedures används
selektivt och är inte standardabstraktionen för CRUD.

## Övervägda alternativ

- Hålla databasåtkomst databasagnostisk: avvisat eftersom applikationen redan
  bygger på SQL Server-beteende, uttryckliga migreringar och SQL
  Server-prestandakontroller.
- Använda stored procedures som primär CRUD-abstraktion: avvisat eftersom den
  mesta applikationslogiken förblir tydligare och enklare att testa i
  TypeScript-tjänster och DAL-hjälpare.
