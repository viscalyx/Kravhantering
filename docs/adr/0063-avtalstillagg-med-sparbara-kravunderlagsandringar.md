# Avtalstillägg med spårbara kravunderlagsändringar

Status: Antagen 2026-09-10. Införandet preciseras i
[#1323](https://github.com/viscalyx/Kravhantering/issues/1323).

Ett kravunderlag får en separat `Fastställelsestatus`, oberoende av dess
livscykelstatus. Innehållet låses när kravunderlaget blir del av ett avtal;
utlämning för upphandling utlöser inte i sig låsningen. Låsningen omfattar
versionsbyten, tillägg och borttagning av krav samt ändringar i
kravunderlagslokala kravtexter. Implementerings- och verifieringsuppföljning
kan fortsätta mot det fastställda innehållet.

Befintliga kravunderlag utan känt avtalsläge kräver en uttrycklig
fastställelsebedömning. Innehåll och uppföljning bevaras, men
innehållsändringar och radering spärras tills kravunderlagsansvarig anger
att underlaget är redigerbart arbetsmaterial eller fastställer dess
avtalssammanhang. Nya kravunderlag börjar som redigerbart arbetsmaterial.
Avtalsläget får inte härledas enbart från befintlig livscykelstatus.

Ett fastställt kravunderlag hör till ett leverantörsavtal. Olika avtal kan
utgå från samma krav, men deras fastställda kravunderlag och avtalstillägg
hålls åtskilda så att avtalat innehåll och senare ändringar är entydiga.

Kravunderlagsansvarig fastställer kravunderlaget och registrerar att ett
avtalstillägg börjar gälla. Kravunderlagsmedförfattare får bereda
avtalstillägg. Fastställelsen respektive avtalstillägget ska ha en
motivering, en avtalsreferens och ett datum för ikraftträdande.

Senare ändringar samlas i `Avtalstillägg` med en gemensam motivering, till
exempel ett nytt behov eller en förbättrad funktion. Varje
`Kravunderlagsändring` anger vilket krav som läggs till, ändras eller tas bort
och vilket avtalstillägg ändringen tillhör. Kravunderlaget behåller sin
identitet utan separat förvaltade revisioner av hela kravunderlaget.

Samtliga kravunderlagsändringar i ett avtalstillägg börjar gälla tillsammans
på det avtalade datumet för ikraftträdande. Fram till dess gäller det
aktuella avtalade innehållet. Ett beslutat avtalstillägg är låst;
innehållsändringar kräver ett uttryckligt rättelseförfarande.

Den första versionen stöder avtalstillägg med ikraftträdande idag eller
ett framtida datum, inte bakdaterade tillägg. Dagens ändring börjar gälla
vid beslutet; framtida ändringar börjar gälla vid midnatt i
`Europe/Stockholm` på avtalat datum. Registreringstidpunkten bevaras
separat. Ett befintligt avtals historiska datum får registreras, men
fastställelsen dokumenterar det kända innehållet utan att skapa påhittad
historik.

Före ikraftträdandet rättas ett beslutat avtalstillägg genom uttryckligt
avbrott och ett länkat ersättande avtalstillägg. Efter ikraftträdandet
hanteras rättelsen genom ett nytt avtalstillägg. Originalet bevaras i båda
fallen.

Ett krav får omfattas av högst en beslutad framtida kravunderlagsändring åt
gången. Från beslutet till ikraftträdandet spärras nya aktiva avsteg för
det berörda kravet. Spärren upphör när ändringen börjar gälla eller det
beslutade avtalstillägget avbryts.

Ursprungligen avtalat innehåll, aktuellt innehåll och ändringshistorik ska
kunna visas utifrån ursprunget och de registrerade kravunderlagsändringarna.
Borttagna krav bevaras i historiken. Vid versionsbyte bevaras den tidigare
versionsbindningens tillämpningssammanhang och avstegsbeslut; de får inte
skrivas om till att avse den nya versionen. Ändrade krav ska kunna härledas
till sitt avtalstillägg.

Ett ändrat krav kräver en uttrycklig omprövning innan det får räknas som
implementerat eller verifierat. Tidigare resultat bevaras som underlag för
omprövningen, men ger inte automatiskt den nya tillämpningen dessa
användningsstatusar. Oförändrade krav behåller sin användningsstatus.
Det ändrade kravet återgår till `Inkluderad` och visar `Omprövning krävs`
under omprövningen.

Ett godkänt avsteg kräver ett nytt beslut innan det får gälla det ändrade
kravet. Det ursprungliga beslutet bevaras i sitt ursprungliga
versionssammanhang. Ett nytt avsteg får hänvisa till det tidigare beslutet
men ska följa den befintliga beslutsprocessen.

Alla aktiva avsteg, även avstegsutkast, måste uttryckligen avbrytas innan
det berörda kravet får ändras eller tas bort. Ändringen får inte
automatiskt avbryta avsteget eller lämna det aktivt mot en ersatt version.
Avbrott följer befintlig författarbehörighet för avsteg och kräver en
motivering. Aktör, tidpunkt, motivering och tidigare sammanhang bevaras i
historiken. Återgång till utkast får inte kringgå spärren.

Ett aktivt avtal skyddar sitt kravunderlag mot radering och gallring,
oberoende av livscykelstatus och inaktivitet. Ursprungligt innehåll och
avtalstilläggens historik bevaras tillsammans med kravunderlaget och ingår
i den obligatoriska JSON-exporten inför en eventuell senare gallring.

Kravunderlagsansvarig får registrera att avtalet har upphört, med datum och
motivering. Det tar bort skyddet som följer av ett aktivt avtal, men
utlöser ingen radering. Ordinarie gallringsregler och gallringsundantag
gäller fortsatt.

Beslutade framtida avtalstillägg måste uttryckligen avbrytas innan avtalet
får markeras som upphört. Det avtalade innehållet förblir historiskt låst.

Beslutet kompletterar
[ADR 0010](0010-versionslasning-i-kravunderlag.md): publicering i
kravbiblioteket får aldrig automatiskt ändra ett kravunderlag.

## Övervägda alternativ

- Revisioner av hela kravunderlaget: avvisat eftersom ändringar ska följas
  per krav och grupperas genom det avtalstillägg de tillhör, med ett
  sammanhållet kravunderlag över tid.
- Fri redigering av fastställt innehåll: avvisat eftersom den tidigare
  avtalade specifikationen och ändringarnas samband måste förbli spårbara.
