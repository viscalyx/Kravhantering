# Kravansvarsperson för HSA-uppslag

Status: Antagen 2026-06-08. Uppdaterad 2026-06-09.

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

Applikationen anropar HSA-integrationen via ett konfigurerbart appnära
REST/JSON-kontrakt. I lokal utveckling pekar den konfigurationen på Kong, som
skickar vidare till fasaden för personuppslag i HSA-mocken. Test- och
produktionsmiljöer kan peka på den API-hanterare eller integrationsplattform
som gäller där utan att Kravhanterings interna kontrakt ändras.
