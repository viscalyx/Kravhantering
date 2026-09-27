# Analysformat

Använd detta format för den persistenta arbetsanalysen. Om användaren inte
anger analysfil, använd målrapportens namn med suffixet `-analys`, till exempel
`docs/it-stod-formagor-analys.md`.

Håll filen användbar som återupptagningspunkt efter kontextkomprimering. Lägg
den korta lägesbilden och källstatusen överst.

## Struktur

```markdown
# IT-stödets förmågor - arbetsanalys

## Lägesbild
- Status:
- Målrapport:
- Senast granskade källkluster:
- Nästa källkluster:
- Viktiga öppna frågor:

## Källstatus
| Id | Källkluster | Status | Granskade filer eller sökningar | Nästa steg |
| --- | --- | --- | --- | --- |

## Förmågekandidater
| Id | Kandidat | Resultat | Aktörer | Informationsobjekt | Evidens | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Funktionalitetskandidater
| Id | Förmågekandidat | Funktionalitet | Typ | Input | Resultat | Evidens | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Dubbletter och bortval
| Kandidat eller källa | Beslut | Motivering | Evidens |
| --- | --- | --- | --- |

## Öppna frågor
| Fråga | Påverkan | Var ska den utredas? |
| --- | --- | --- |
```

## Fältregler

- `Status` i `Källstatus`: använd `Ej påbörjat`, `Pågår`, `Granskat`,
  `Behöver återbesök` eller `Bortvalt`.
- `Status` i kandidatlistor: använd `Kandidat`, `Verifierad`, `Sammanslagen`,
  `Bortvald`, `Dokumenterad/planerad` eller `Osäker`.
- `Evidens`: skriv korta ankare som relativa sökvägar, radnummer, testnamn,
  route-namn, tabellnamn eller sökningar. Klistra inte in långa kodutdrag.
- `Nästa steg`: ange bara nästa konkreta kontroll, inte en full arbetsplan.
- `Dubbletter och bortval`: skriv varför källan eller kandidaten inte ska
  analyseras igen.

## Uppdateringsregler

- Uppdatera `Lägesbild` efter varje granskat källkluster.
- Lägg nya kandidater i analysfilen direkt när de hittas.
- Skriv sammanslagningar och bortval innan du går vidare till nästa kluster.
- Vid återupptagning, läs `Lägesbild`, `Källstatus` och relevanta rader med
  `rg` innan ny kod öppnas.
