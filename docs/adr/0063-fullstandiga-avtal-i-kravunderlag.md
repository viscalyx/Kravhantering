# Fullständiga avtal i kravunderlag

Ett kravunderlag fortsätter genom avtal som var och en omfattar hela
kravuppsättningen. Bekräftelsen låser innehållet direkt, medan ett senare
avtalsutkast äger de förberedda ändringarna. Fullständiga avtalsuppsättningar gör
valt avtal entydigt i kravlistan, avstegshanteringen och rapporterna; en samling
fristående ändringsförslag ger inte samma avgränsning.

Status: Antagen 2026-09-14 enligt den slutliga designen i
[#1323](https://github.com/viscalyx/Kravhantering/issues/1323).

## Identitet och historik

Oförändrade bibliotekskrav behåller sin valda version enligt
[ADR 0010](0010-versionslasning-i-kravunderlag.md). Manuell redigering i ett senare
avtalsutkast skapar ett lokalt krav med nytt Krav-ID och sparad ursprungsreferens.
Fortsatta lokala ändringar behåller den lokala identiteten. Därmed kan en lokalt
förhandlad lydelse inte förväxlas med bibliotekskravet. Varje ändringskedja
följer sin avtalsrad, så att två lokala krav med samma biblioteksursprung inte
får gemensam innehållshistorik.

Avtalens innehåll, uppföljning och giltighet måste kunna skiljas åt.
Oförändrade krav ärver den senaste uppföljningen vid nästa ikraftträdande;
tidigare avtals resultat fryses. Avsteg delas endast för oförändrat granskat
innehåll. Ett planerat eller genomfört avslut är en separat händelse och ändrar
aldrig det ursprungliga godkännandet.

Rättelser av avtalsuppgifter bevarar exakta tidigare och nya värden som
affärshistorik, med aktör och tid. Den vanliga åtgärdsloggen sammanfattar
åtgärden men kan inte ersätta denna historik, eftersom den begränsar textlängd.

## Ansvar och bevarande

Författarbehörigheten följer
[ADR 0027](0027-underlagsstyrd-skrivbehorighet-i-kravunderlag.md), med avtalsbeslut
och godkännande av avstegsavslut förbehållna tilldelad kravunderlagsansvarig.
Innehållsändringen och dess avstegsavslut sparas i samma transaktion.

Ett borttaget utkast saknar fortsatt affärsgiltighet och tas bort med sina egna
ärenden. Ett avbrutet bekräftat kommande avtal bevaras däremot, eftersom
bekräftelsen är en affärshändelse. Upphörande fryser resultat och avslutar
avsteg utan att hindra en senare förlängning av samma kravunderlag. Denna modell
kräver uttryckliga relationer mellan avtal, kravinnehåll och uppföljning, men
bevarar både tidigare överenskommelser och beslutens faktiska tidsordning.
