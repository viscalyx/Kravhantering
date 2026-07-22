# Målstorlek enligt WCAG 2.5.8

Status: Antagen 2026-07-12.

För funktioner som kan aktiveras med pekdon utgår Kravhantering från
framgångskriterium 2.5.8 i WCAG 2.2. Huvudregeln är att varje mål ska ha en
aktiveringsyta på minst 24 gånger 24 CSS-pixlar. Ett mindre mål är tillåtet
endast när något av kriteriets normativa undantag gäller:

- det finns tillräckligt avstånd till andra mål (`spacing`),
- samma funktion kan utföras med en annan kontroll på samma sida som i sin tur
  uppfyller kriteriet (`equivalent`),
- målet ingår i löpande text eller begränsas av den omgivande textens radhöjd
  (`inline`),
- användaragenten bestämmer målets storlek och den som har skapat innehållet
  inte har ändrat den (`user-agent`), eller
- den aktuella utformningen är nödvändig för den information som förmedlas
  eller följer av ett rättsligt krav (`essential`).

Ett mål som omfattas av ett sådant undantag uppfyller kriteriet. Det ska därför
inte beskrivas som en accepterad avvikelse från WCAG.

Kravet på 44 gånger 44 CSS-pixlar hör till framgångskriterium 2.5.5 på nivå
AAA. Produktens krav på efterlevnad av nivå AA innebär därför varken en allmän
gräns eller en generell rekommendation på 44 pixlar. Enskilda komponenter får
ändå ha större mål när det passar utformningen, men tester och instruktioner
ska inte framställa 44 pixlar som ett generellt tillgänglighetskrav.

För nya, egenutvecklade kontroller är minst 24 gånger 24 CSS-pixlar
utgångspunkten. Om en sådan kontroll avsiktligt har ett mindre mål ska det valda
undantaget och underlaget för det dokumenteras vid den gemensamma
implementationen. Följande underlag krävs:

- Undantaget för avstånd ska styrkas med geometriska tester vid relevanta
  skärmstorlekar.
- Undantaget för en likvärdig kontroll ska styrkas med ett test som visar att
  den andra kontrollen både utför samma funktion och uppfyller kriteriet.
- Undantaget för nödvändig utformning ska styrkas med ett ADR eller en
  auktoritativ rätts- eller standardkälla.

Vanliga länkar i löpande text och oförändrade kontroller vars storlek bestäms
av användaragenten behöver inte märkas vid varje förekomst.

Policyn följs upp med en blockerande statisk kontroll som hittar uttryckligt
små, egenutvecklade mål. Därutöver används avgränsade tester som verifierar den
faktiska målytan eller det undantag som åberopas. Befintliga mål som behöver
utredas måste rättas innan kontrollen godkänns. På så sätt stoppar policyn
nya och befintliga överträdelser utan ett separat undantagsregister.

En kodgranskning kan inte ge dispens från kriteriet. Om ett mål varken
uppfyller storlekskravet eller omfattas av ett normativt undantag krävs ett
separat beslut av den ansvariga operatören. Beslutet ska ha rättsligt och
avtalsmässigt stöd och ange avgränsning, ansvarig, ett alternativ som uppfyller
tillgänglighetskraven, sista giltighetsdag och form för omprövning. Ett sådant
beslut gör inte målet WCAG-konformt och får inte märkas som ett normativt
undantag. Strängare krav i lag, avtal eller upphandling, liksom krav från den
ansvariga operatören, har alltid företräde framför produktens grundregel.

Det normativa underlaget och bedömningen av svensk rätt finns i
[analysen av målstorlekskrav för svensk regional drift](../research/issue-542-target-size-obligations.md).

## Övervägda alternativ

- **En generell regel på 44 pixlar:** Vi använder inte detta som gräns eftersom
  det skulle göra ett kriterium på nivå AAA till ett allmänt krav på nivå AA
  och motverka den informations- och kontrolltäthet som har valts för
  skrivbordsanvändning.
- **Obligatoriska `min-h-6 min-w-6` på varje interaktivt element:** Vi kräver
  inte bestämda klassnamn eftersom de varken bevisar den faktiska målytan eller
  hanterar kriteriets normativa undantag.
- **Odokumenterade kompakta mål:** Vi tillåter inte sådana mål eftersom det då
  inte går att granska och verifiera om ett undantag gäller eller om målet
  faktiskt bryter mot kriteriet.
