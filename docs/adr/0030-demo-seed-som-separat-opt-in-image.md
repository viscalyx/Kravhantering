# Demo-seed som separat opt-in-image

Status: Antagen 2026-06-16.

Kravhantering publicerar demo-seed som en separat container image med namnet
`kravhantering-demo-seed` i stället för att lägga demo-seed-filer i
produktionspaketet eller baka in dem i `kravhantering-db-job`.
`kravhantering-db-job` fortsätter innehålla migrationer, required seed och
produktionssäkra databasjobb. Både `seed:demo` och
`demo:clear --confirm-clear-non-required-data` hör till demo-seed-image som ett
uttryckligt opt-in-stöd för disponibla demo- och testmiljöer.

Beslutet gör destruktiv demodata synlig som ett separat demonstrationsartefakt
i GitHub Release-noter, men håller den borta från `container-stack.lock.json`,
`release.env.template`, standardflöden för deploy och upgrade samt standard
disconnected-bundles. Operatörer som vill köra demo-seed väljer och hämtar den
separata image avsiktligt, utan seed-filer monterade från produktionspaketet.
