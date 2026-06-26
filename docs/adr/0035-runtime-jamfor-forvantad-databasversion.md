# Runtime jämför förväntad databasversion

Status: Antagen 2026-06-26.

`db-job` äger TypeORM-migrationskedjan, preflight och verifiering efter
migrering. `app-runtime` bär inte migrationsfiler och kör inte migreringar; den
jämför i stället sin förväntade databasversion från build metadata med senaste
`name` i TypeORMs `migrations`-tabell via `/api/ready`.

Det bevarar gränsen mellan databasuppgradering och applikationens runtime
samtidigt som driftsättning kan stoppas när databasen inte matchar den
appversion som ska ta trafik.
