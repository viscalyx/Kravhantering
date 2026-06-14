# Kravansvarsperson för HSA-uppslag

Status: Antagen 2026-06-08. Uppdaterad 2026-06-13.

Kravhantering inför Kravansvarsperson som en lokal, HSA-id-nycklad personrad
för aktuella eller påbörjade kravansvarstilldelningar. Levande tilldelningar
lagrar bara HSA-id och pekar med foreign key mot Kravansvarsperson, medan
namnkomponenter och e-post sparas på personraden efter
behörighetskontrollerade serveruppslag mot HSA-katalogen.

Beslutet begränsar åtkomsten till personuppgifter: läsvyer gör inga
HSA-uppslag, och appen får ingen generell browser-nåbar personuppgiftssök.
Redigeringsytor får däremot en tilldelningsbunden verifiering via servern.
När användaren lämnar ett HSA-id-fält återanvänds befintlig lokal
Kravansvarsperson om den finns; annars gör servern ett HSA-uppslag och sparar
personraden. Den manuella hämta-ikonen gör alltid ett nytt HSA-uppslag och
uppdaterar personraden. Sparande gör inget HSA-uppslag, utan kräver att lokal
Kravansvarsperson finns för HSA-id:t och läser om kort om verifieringen nyss
slutfördes. En Kravansvarsperson tas bort när ingen levande
kravansvarstilldelning längre pekar på HSA-id:t efter en sparad ändring;
historiska audit- och beslutssnapshots behåller sina egna punkt-i-tid-värden.

Efter en lyckad auktoriserad mutationsförfrågan får servern också starta en
asynkron best-effort-uppdatering av den inloggade aktörens levande personrad.
Uppdateringen använder bara verifierade sessionsfält (`givenName`,
`familyName`, `displayName`, `email` och `hsaId`), kör inte i
inloggningsflödet, gör inget HSA-uppslag och får inte fördröja eller fälla den
ursprungliga åtgärden. Endast den aktuella aktörens rad i
`requirement_responsibility_people` uppdateras, och bara när samma HSA-id
fortfarande förekommer i en levande kravansvarstilldelning. Fel loggas
sanerat.
