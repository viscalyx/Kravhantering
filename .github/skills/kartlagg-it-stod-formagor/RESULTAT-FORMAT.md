# Resultatformat

Använd detta format för slutrapporten. Bygg rapporten från analysfilen och
komplettera bara med riktade kontroller där analysfilen visar osäkerhet.

## Inledning

Börja med kort avgränsning:

- analyserad kodbas och datum
- analyserade källor
- viktiga antaganden
- vad som uttryckligen inte har bedömts

Lägg sedan till en sammanfattning:

- antal identifierade förmågor
- antal identifierade funktionaliteter
- huvudsakliga domäner eller verksamhetsobjekt
- stora osäkerheter eller luckor i underlaget

## Förmågor

Använd dessa kolumner om användaren inte begär annat:

<!-- markdownlint-disable MD013 -->
| Kolumn | Innehåll |
| --- | --- |
| `Id` | Stabilt löpnummer, till exempel `F-001`. |
| `Domän` | Verksamhetsnära område eller informationsobjekt. |
| `Förmåga` | Kort namn i formen `verb + objekt`. |
| `Beskrivning` | Vad IT-stödet möjliggör, processagnostiskt. |
| `Verksamhetsnära resultat` | Det tillstånd, beslut, underlag, spår eller informationsvärde som skapas. |
| `Aktörer/roller` | Roller, användartyper eller systemaktörer som framgår av underlaget. |
| `Informationsobjekt` | Centrala objekt som krav, ärende, rapport, användare, roll, fil eller loggrad. |
| `Trigger eller händelse` | Vad som startar förmågan när det går att se. |
| `Mappningsnycklar` | Ord som hjälper senare koppling till processer eller delprocesser. |
| `Underlagsstatus` | `Implementerad`, `Delvis implementerad`, `Dokumenterad/planerad` eller `Kan ej bedömas`. |
| `Evidens` | Filer, rader, tester, docs, routes, tabeller eller konfiguration. |
| `Osäkerhet` | Saknat eller tvetydigt underlag. |
<!-- markdownlint-enable MD013 -->

## Funktionaliteter

Använd dessa kolumner om användaren inte begär annat:

<!-- markdownlint-disable MD013 -->
| Kolumn | Innehåll |
| --- | --- |
| `Id` | Stabilt löpnummer, till exempel `FN-001`. |
| `Förmåga` | Referens till förmåge-id och namn. |
| `Funktionalitet` | Konkret beteende eller åtgärd. |
| `Beskrivning` | Vad användaren eller systemet kan göra. |
| `Typ` | `UI`, `API`, `Rapport`, `Import/export`, `Integration`, `Batch`, `Behörighet`, `Audit/logg`, `Administration` eller annan tydlig typ. |
| `Aktör eller trigger` | Vem eller vad som utför beteendet. |
| `Ingående information` | Data, val, fil, status, identitet eller annan input. |
| `Utgående resultat` | Skapad, ändrad, visad, exporterad, loggad eller skickad information. |
| `Systemytor` | Sidor, komponenter, endpoints, tjänster, jobb eller kommandon. |
| `Underlagsstatus` | `Implementerad`, `Delvis implementerad`, `Dokumenterad/planerad` eller `Kan ej bedömas`. |
| `Evidens` | Relativa sökvägar och radnummer när möjligt. |
| `Osäkerhet` | Saknat eller tvetydigt underlag. |
<!-- markdownlint-enable MD013 -->

## Avslutning

Avsluta med:

- `Mappningsnoteringar`: kort lista över återkommande aktörer,
  informationsobjekt, triggers och resultat som är lämpliga kopplingspunkter.
- `Exkluderingar`: tekniska moduler eller interna detaljer som medvetet inte
  har listats som förmågor.
- `Rekommenderade nästa steg`: konkreta steg för att koppla inventeringen till
  externa processer, till exempel processworkshop, processlista,
  begreppsmappning eller verifiering med verksamhetsägare.
