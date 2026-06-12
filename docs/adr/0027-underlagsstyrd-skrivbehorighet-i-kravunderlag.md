# Underlagsstyrd skrivbehörighet i kravunderlag

Status: Antagen 2026-06-12.

Skrivbehörighet i ett `Kravunderlag` styrs av kravunderlagets egna uppdrag:
`Kravunderlagsansvarig`, `Kravunderlagsmedförfattare` och `Admin`.
`Kravområdesägare` och `Kravområdesmedförfattare` får förvalta
kravbibliotekets innehåll inom sina kravområden, men får inte automatiskt ändra
eller läsa hela kravunderlag där krav från deras områden används.

Publicerade bibliotekskrav får läggas till i ett kravunderlag från alla
kravområden av den som har skrivbehörighet i kravunderlaget. Valet att använda
ett redan publicerat bibliotekskrav är en del av kravunderlagets sammansättning,
inte en ändring av kravområdet.

När ett kravunderlagslokalt krav lyfts till kravbiblioteket krävs behörighet i
båda sammanhangen: skrivbehörighet i kravunderlaget som källa och
författarbehörighet i målkravområdet. Kravunderlagsmedförfattare får ändra
kravunderlagets innehåll men inte ändra själva uppdragstilldelningen; byte av
kravunderlagsansvarig och hantering av kravunderlagsmedförfattare hör till
`Kravunderlagsansvarig` och `Admin`.

## Övervägda alternativ

- Låta kravområdesägare ändra kravunderlag när deras krav används: avvisat
  eftersom det flyttar kontrollen över kravunderlagets sammansättning från
  kravunderlagsansvarig till kravområdena.
- Begränsa tillägg av bibliotekskrav till aktörens egna kravområden: avvisat
  eftersom kravunderlag ofta behöver samla publicerade krav över flera
  kravområden och användningen av publicerade krav inte ändrar
  kravbibliotekets innehåll.
- Låta kravunderlagsmedförfattare delegera vidare: avvisat eftersom
  kravunderlagsansvarig ska avgöra vilka som får ändra kravunderlaget.
