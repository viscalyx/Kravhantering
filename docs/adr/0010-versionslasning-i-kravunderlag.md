# Versionslåsning i kravunderlag

Status: Antagen 2026-06-05.

Ett `Kravunderlag` är en spårad sammansättning av kravtillämpningar.
Bibliotekskrav läggs bara till genom en konkret `Publicerad kravversion`, och
den resulterande kravtillämpningen behåller den kravversionen som grund i
stället för att automatiskt följa senare publicerade versioner.

`Kravunderlagslokala krav` är separat kravunderlagsägt innehåll, inte dolda
bibliotekskrav. När ett lokalt krav lyfts till kravbiblioteket skapar
applikationen en ny utkastkopia av ett bibliotekskrav och lämnar det lokala
kravet kvar på plats i sitt ursprungliga kravunderlag.

Det bevarar ett granskningsbart innehållsunderlag för ett kravunderlag samtidigt
som kravbiblioteket kan utvecklas oberoende.

## Övervägda alternativ

- Alltid följa senaste publicerade biblioteksversion: avvisat eftersom ett
  kravunderlag då skulle ändras tyst efter senare publicering i kravbiblioteket.
- Kopiera all kravtext från biblioteket till en kravtillämpning: avvisat
  eftersom den rena länken till den kravversion i biblioteket som används som
  grund skulle gå förlorad.
- Flytta ett lokalt krav till biblioteket vid upphöjning: avvisat eftersom det
  ursprungliga kravunderlaget fortfarande behöver sin lokala historik och sitt
  sammanhang.
