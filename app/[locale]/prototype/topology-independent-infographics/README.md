# Prototype: topologioberoende infografikserie

Tre visuellt olika varianter av samma serie med tre 16:9-bilder, växlingsbara
med `?variant=A`, `?variant=B` och `?variant=C` på den nya prototyprouten.

## Fråga

Vilken informationshierarki, komposition och visuell grammatik gör den fulla
normala utvecklingsloopen begriplig för en bred mottagargrupp utan att tappa de
komponentkontrakt som utvecklare samt plattforms- och drifttekniker behöver?

Prototypen är skrivskyddad och tillfällig. Den provar en realistisk
informationsdensitet, innehållets struktur, läsordning, panelindelning och
visuella grammatik; den är inte en publiceringsfärdig bild.

## Körning

```sh
npm run dev
```

Öppna sedan:

```text
http://localhost:3000/sv/prototype/topology-independent-infographics?variant=A
```

Växla mellan:

- A — Numrerad översikt: informationsrika paneler med en redaktionell,
  referensnära komposition.
- B — Utvecklarresan: arbetsflödet är ryggrad och varje steg visar aktivitet,
  komponenter, kontrakt och resultat.
- C — Arkitekturatlas: komponenter och kontrakt prioriteras för en mer tekniskt
  exakt läsning.

Prototyprouten returnerar 404 i produktionsbyggen.
