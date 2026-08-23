# Kravansvarsperson för HSA-uppslag

Status: Antagen 2026-06-08.

Kravhantering inför Kravansvarsperson som en lokal, HSA-id-nycklad personrad
för aktuella eller påbörjade kravansvarstilldelningar. Levande tilldelningar
lagrar bara HSA-id och pekar med foreign key mot Kravansvarsperson, medan
namnkomponenter och e-post sparas på personraden efter
behörighetskontrollerade serveruppslag mot HSA-katalogen.

Beslutet begränsar åtkomsten till personuppgifter: läsvyer gör inga
HSA-uppslag, och appen har ingen generell webbläsarnåbar personuppgiftssökning.
Redigeringsytor får däremot en tilldelningsbunden verifiering via servern.
När användaren lämnar ett HSA-id-fält återanvänds en befintlig lokal
Kravansvarsperson om den finns; annars gör servern ett HSA-uppslag. Den
manuella hämtningsåtgärden gör alltid ett nytt HSA-uppslag. Verifieringen
sparar aldrig personraden utan returnerar ett kortlivat signerat bevis bundet
till aktör, HSA-id, ändamål och behörighetssammanhang.

Den slutliga tilldelningsmutationen verifierar beviset och sparar
Kravansvarsperson och kravansvarstilldelning atomärt. Efter en sparad ändring
rensar tilldelningsflödet en person som inte längre pekas ut av någon levande
kravansvarstilldelning. En kvarvarande Kravansvarsperson utan
kravansvarstilldelning kan återanvändas vid en senare verifiering eller
kvalificera för gallring. Historiska bevis behåller sina egna
ögonblicksvärden.

Efter en lyckad auktoriserad mutationsförfrågan får servern också starta en
asynkron best-effort-uppdatering av den inloggade aktörens levande personrad.
Uppdateringen använder bara verifierade sessionsfält (`givenName`,
`familyName`, `displayName`, `email` och `hsaId`), kör inte i
inloggningsflödet, gör inget HSA-uppslag och får inte fördröja eller fälla den
ursprungliga åtgärden. Endast den aktuella aktörens rad i
`requirement_responsibility_people` uppdateras, och bara när samma HSA-id
fortfarande förekommer i en levande kravansvarstilldelning. Fel loggas
sanerat.
