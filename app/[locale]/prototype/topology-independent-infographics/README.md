# Prototype: topologioberoende infografikserie

Tre visuellt olika varianter av samma serie med tre 16:9-bilder, växlingsbara
med `?variant=A`, `?variant=B` och `?variant=C` på den nya prototyprouten.

## Fråga

Vilken informationshierarki, komposition och visuell grammatik gör den fulla
normala utvecklingsloopen begriplig för en bred mottagargrupp utan att tappa de
komponentkontrakt som utvecklare samt plattforms- och drifttekniker behöver?

Prototypen är avsiktligt enkel, skrivskyddad och tillfällig. Den provar
innehållets struktur och läsordning; den är inte en publiceringsfärdig bild.

## Körning

```sh
npm run dev
```

Öppna sedan:

```text
http://localhost:3000/sv/prototype/topology-independent-infographics?variant=A
```

Växla mellan:

- A — Orbit: en människa och en loop i centrum.
- B — Transit: en numrerad linje som växer med berättelsen.
- C — Fältguide: lager, kontraktskort och tydliga läsfält.

Prototyprouten returnerar 404 i produktionsbyggen.
