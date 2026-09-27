# Manuella testfall för {{område}}

{{Beskriv vilka arbetsflöden testfallen omfattar.}}
Anteckna commit, webbläsare och godkänt eller underkänt resultat vid körning.

## Konfigurerade användare

{{Ange testanvändare, roller, tillgång till hushållet och hur de loggar in.}}

## Allmän förberedelse

1. {{Ange testmiljö, testdata och nödvändiga förberedelser.}}
2. {{Beskriv återställning mellan körningar och vad som ska behållas.}}

## {{Delområde}}

### {{OMRÅDE-01}}: {{arbetsflöde och förväntat utfall}}

**Syfte:** {{Beskriv beteendet som testfallet ska verifiera.}}

**Användare:** {{Ange användare och roller från förberedelsen.}}

**Förutsättningar:** {{Ange testfallets utgångsläge och särskilda testdata.}}

**Integrationstest:**
[{{filnamn}}.spec.ts](../../tests/integration/{{filnamn}}.spec.ts),
testfallet “{{OMRÅDE-01}}: {{exakt scenariotitel}}”.

**Steg:**

1. {{Beskriv en handling genom det publika användargränssnittet.}}
2. {{Beskriv nästa handling och vad användaren ska kontrollera.}}

**Förväntat resultat:**

- {{Ange observerbart resultat för respektive steg.}}
- {{Ange slutligt tillstånd och relevanta åtkomstgränser.}}
