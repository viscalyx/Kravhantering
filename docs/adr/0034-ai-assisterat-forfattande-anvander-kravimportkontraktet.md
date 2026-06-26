# AI-assisterat författande använder kravimportkontraktet

Status: Antagen 2026-06-25.

AI-assisterat författande producerar en `Kravimportfil` enligt samma
importkontrakt som extern kravimport i stället för att använda ett separat
AI-specifikt outputschema och en separat sparväg. Användaren kan granska
AI-genererade kandidater, justera författarinstruktionen och generera om innan
valda rader skickas till importens redigerbara granskningsyta; först där sparas
krav genom ordinarie importflöde.

Beslutet gör `Importinstruktion och schema` till den kanoniska strukturregeln
för både extern AI-genererad import och inbyggt AI-assisterat författande. Den
användarstyrda `AI-instruktion` får styra innehåll, omfattning, språk och stil,
men den kan inte upphäva importkontraktet, destinationsregler eller
servervalidering.

## Övervägda alternativ

- Behålla ett separat AI-outputschema och direkt skapande av valda krav:
  avvisat eftersom det skapar parallella regler för klassning, normreferenser,
  validering och sparbeteende.
- Låta användaren redigera AI-resultatet i AI-dialogen: avvisat eftersom det
  skulle duplicera importens redigerbara granskningsyta och göra gränsen mellan
  generering och skapande otydlig.
- Göra importkontraktet redigerbart genom användarens AI-instruktion: avvisat
  eftersom format, schemaVersion, tillåtna fält och destinationskontext måste
  vara stabila för att samma fil ska kunna användas av både kravbiblioteksimport
  och kravunderlagsimport.
