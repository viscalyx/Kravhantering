# Språkparad taxonomi och källspråksinnehåll

Status: Antagen 2026-06-05.

Kravhantering behandlar svenska och engelska som förstklassiga UI locales.
Systemets UI-texter ligger i locale message files, och lookup- eller
taxonomirader som namnger applikationsägda klassningar använder språkparade
locale-fält som `name_sv` och `name_en`.

Författat innehåll och externt namngivet innehåll får inte tvingade
locale-par som standard. Kravpaket, normreferenser och liknande
källspråksvärden behåller ett faktiskt eller författat värde om domänen inte
uttryckligen kräver separat förvaltade översättningar.

Det gör återanvändbara klassningar tillgängliga på båda stödda UI-språken utan
att låtsas att varje författad fras, rättslig referens eller standardnamn har
en sanningsenlig applikationsägd översättning.

## Övervägda alternativ

- Lagra all användarvänd text som svenska och engelska par: avvisat eftersom
  författat innehåll och externa normnamn kan vara enspråkiga fakta snarare än
  översättbara etiketter.
- Lagra alla taxonomi- och lookup-namn som ett textvärde: avvisat eftersom
  applikationen måste presentera kärnklassningar konsekvent på båda stödda
  UI locales.
- Översätta externa normreferenser i applikationen: avvisat eftersom rättsliga
  namn och standardnamn på källspråk ska vara trogna sitt ursprungsdokument.
