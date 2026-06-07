# Dagre som layoutmotor för kravurvalsfrågehierarki

Status: Antagen 2026-06-07.

Kravurvalsfrågehierarkin ska visas som en läsbar översiktskarta i
kravbiblioteksförvaltningen, med en nod per kravurvalsfråga och faktiska
kopplingsstreck mellan överliggande och underordnade kravurvalsfrågor. För
första versionen använder vi `@dagrejs/dagre` som layoutmotor, men renderar
själva noderna med React/HTML och kopplingsstrecken med ett dekorativt
SVG-lager. Layoutkod och grafbyggande hålls i en separat adapter så att
layoutmotorn kan bytas, till exempel till `elkjs`, om verkliga
multi-parent-hierarkier senare kräver mer avancerad layout.

Beslutet undviker en full grafkomponent för ett flöde som i första versionen
bara är läsbart och inte ska ha pan, zoom, redigering eller interaktiva noder.
Det undviker också en helt handskriven layout, eftersom hierarkin kan vara en
acyklisk graf med flera överliggande frågor till samma underordnade fråga.

## Övervägda alternativ

- Full grafkomponent som React Flow, G6, Cytoscape eller Reaflow: avvisat för
  första versionen eftersom ytan är en läsbar orienteringsvy, inte en
  grafarbetsyta.
- `elkjs`: avvisat som förstahandsval för första versionen eftersom den extra
  layoutkraften inte behövs ännu, men adaptergränsen ska göra ett byte möjligt.
- Mermaid eller annan text-till-diagram-renderer: avvisat eftersom detta är
  produkt-UI med lokaliserad React-rendering, inte dokumentationsdiagram.
- Helt egen layout: avvisat eftersom flera överliggande frågor till samma nod
  gör en robust och läsbar top-down-layout onödigt riskabel att handkoda för
  första versionen.
