# SQL Server And TypeORM Persistence Stack

Status: Accepted on 2026-06-05.

Kravhantering uses Microsoft SQL Server and TypeORM Data Mapper as its sole
persistence stack. TypeORM entities and hand-authored migrations define the
schema contract, while repositories and QueryBuilder are the default access
pattern for ordinary CRUD and lookup flows.

Parameterized raw SQL is a first-class option for complex projections,
SQL Server-specific behavior, atomic multi-table mutations, reporting/export
matrices and performance-sensitive paths. Stored procedures remain selective,
not the default CRUD abstraction.

## Considered Options

- Keep database access database-agnostic: rejected because the application
  already relies on SQL Server behavior, explicit migrations and SQL Server
  performance checks.
- Use stored procedures as the primary CRUD abstraction: rejected because most
  application logic remains clearer and easier to test in TypeScript services
  and DAL helpers.
