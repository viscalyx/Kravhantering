# Synlighetsvillkor för kravurvalsfrågor

Status: Antagen 2026-06-07.

Kravurvalsfrågor kan vara fristående eller underordnade. En fristående
kravurvalsfråga har inga synlighetsvillkor och visas som tidigare. En
underordnad kravurvalsfråga visas bara när minst en villkorsgrupp matchar.
Inuti en villkorsgrupp måste varje överliggande kravurvalsfråga ha minst ett av
gruppens definierade kravurvalssvar valt.

Synlighetsvillkor får referera till kravurvalsfrågor och kravurvalssvar över
kravområdesgränser. `Utan kravurval` får användas som utlösande svar eftersom
det fortfarande uttrycker kravunderlagets kontext, även när svaret inte bidrar
krav till kravurvalsfiltret. Cykler i frågeberoenden är förbjudna vid sparning.

I kravunderlag påverkar synlighetsvillkor presentation och vilka sparade svar
som får bidra till kravurvalsfiltret. De gör inte frågorna obligatoriska och
förändrar inte beslutet att kravurvalsfiltret aktiveras uttryckligen av
användaren. När en användare ändrar ett överliggande svar så att redan besvarade
underfrågor blir dolda måste ändringen bekräftas; därefter rensas de aktuella
svaren på den dolda grenen rekursivt. Detta behandlas som en ändring av
kravunderlagets aktuella kontext.

När förvaltningen ändrar synlighetsvillkor, eller när frågor eller svar som
används i villkor inaktiveras eller arkiveras, ska befintliga sparade svar som
inte längre hör till synlig kontext markeras som historiska. Det följer den
befintliga principen att förvaltningsändringar bevarar spårbarhet men tar bort
filtereffekt.

## Övervägda alternativ

- En enkel parent/child-relation: avvisat eftersom en underfråga kan behöva
  bero på flera frågor och flera svarsalternativ.
- Enbart AND-logik mellan alla överliggande frågor: avvisat eftersom vissa
  verksamhetsfall behöver alternativa vägar till samma följdfråga.
- Fullt fritt regeluttryck: avvisat eftersom det blir svårare att förvalta,
  granska och förklara i UI.
- Begränsa beroenden till samma kravområde: avvisat eftersom urvalskontext i
  ett kravunderlag ofta skär över kravområden.
- Behålla dolda svar som aktuella men ignorera dem: avvisat eftersom det gör
  kravunderlagets aktuella kontext svår att förstå och kan återaktivera svar
  utan tydlig användarhandling.
