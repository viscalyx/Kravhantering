# Gränser för applikationsägd referensdata

Status: Antagen 2026-06-05. Uppdaterad 2026-06-13.

Kravhantering äger den `Referensdata` som formar kravarbete i applikationen.
Det omfattar taxonomi som kravområden, kategorier, typer,
kvalitetsegenskaper, risknivåer, styrningsobjektstyper och
implementationstyper, samt statusar och arbetsflöden som
kravversionsstatusar, användningsstatusar och livscykelstatusar för
kravunderlag. Normreferensposter hör till normbiblioteket även när krav pekar
på dem.

Dessa kataloger administreras i Kravhantering eftersom de direkt påverkar
kravklassning, filtrering, rapportering, AI prompt context och
förvaltningsflöden. I Admin Center delas
referensdata i `Taxonomi` för klassningar och `Statusar och arbetsflöden` för
livscykel- och användningsstatusar. `Referensdata` kvarstår som
samlingsbegrepp, inte som synlig flik.

Kravområdesägarskap är en kravansvarstilldelning på kravområdet. Själva
ägaruppdraget är inte en fristående referensdatakatalog eller personkatalog.
När HSA-uppslag behövs kan uppdraget peka på en lokal `Kravansvarsperson`
enligt ADR 0025; den personraden stödjer verifiering och visning men ersätter
inte uppdraget eller HSA-katalogen.

Kravpaket och kravurvalsfrågor är innehåll i kravbiblioteksförvaltningen, inte
referensdata i Admin Center. De stödjer kravurval och filtrering, men
kravpaketsansvariga och kravområdesägare måste kunna underhålla dem utan bred
administrationsbehörighet.

Kravhantering behandlar inte externa IdP-roller, plattformsloggar, juridiska
källtexter, organisationens masterdata för personal eller formellt
informationsägarskap som applikationsägd referensdata. Applikationen kan lagra
lokala referenser, ögonblicksbilder, etiketter, ordning, ikoner och uppdrag för
sina arbetsflöden, men dessa poster ersätter inte den externa källan med
mandat.

## Övervägda alternativ

- Bara hålla all referensdata i seed files: avvisat eftersom förvaltare och
  administratörer behöver justera klassning och urvalsstöd utan driftsättning.
- Behandla all omgivande organisationsdata som referensdata i appen: avvisat
  eftersom identitet, plattformsloggning, personaldata och formellt ägarskap
  har externa ägare och styrningsprocesser.
- Lägga varje katalog bakom Admin-only CRUD: avvisat eftersom kravpaket och
  kravurvalsfrågor är del av kravbiblioteksförvaltning, inte generisk
  systemadministration.
