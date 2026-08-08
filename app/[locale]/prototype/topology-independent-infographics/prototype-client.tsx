'use client'

import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Code2,
  Database,
  FileCheck2,
  GitPullRequest,
  KeyRound,
  LayoutGrid,
  Monitor,
  Network,
  Play,
  ServerCog,
  ShieldCheck,
  Sparkles,
  TestTube2,
  UserRound,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { type ReactNode, useCallback, useEffect } from 'react'
import { usePathname, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'

type VariantKey = 'A' | 'B' | 'C'
type Accent = 'blue' | 'green' | 'amber' | 'violet' | 'slate'

interface VariantDefinition {
  key: VariantKey
  name: string
  description: string
}

const variants: VariantDefinition[] = [
  {
    key: 'A',
    name: 'Numrerad översikt',
    description:
      'Informationsrika paneler med tydlig läsordning, nära referensbildens redaktionella uttryck.',
  },
  {
    key: 'B',
    name: 'Utvecklarresan',
    description:
      'Arbetsflödet är ryggrad; komponenter och kontrakt förklaras där de används.',
  },
  {
    key: 'C',
    name: 'Arkitekturatlas',
    description:
      'Komponenter och kontrakt står i centrum för en mer tekniskt exakt läsning.',
  },
]

const coreComponents = [
  {
    anchor: 'Projektinstruktioner, Node.js och npm',
    icon: Code2,
    interface: 'Källkod, filer och kommandon',
    label: 'Utvecklingsarbetsyta',
    promise: 'Redigera, starta och kvalitetssäkra',
  },
  {
    anchor: 'Instruktioner, skills och behörigheter',
    icon: Bot,
    interface: 'Uppgift, ändringar och verifieringsevidens',
    label: 'AI-agentverktyg',
    promise: 'Genomföra uppgiften under mänsklig styrning',
  },
  {
    anchor: 'Applikationens publika adress',
    icon: Monitor,
    interface: 'UI och REST via HTTP(S)',
    label: 'Webbläsare',
    promise: 'Använda och prova Kravhantering',
  },
  {
    anchor: 'Miljövariabler eller monterade filer',
    icon: ServerCog,
    interface: 'UI, REST och MCP-slutpunkt',
    label: 'Kravhanteringsruntime',
    promise: 'Köra applikationens funktioner',
  },
  {
    anchor: 'DATABASE_URL',
    icon: Database,
    interface: 'SQL Server-anslutning och kompatibelt schema',
    label: 'Microsoft SQL Server',
    promise: 'Lagra beständig data',
  },
  {
    anchor: 'AUTH_OIDC_*',
    icon: KeyRound,
    interface: 'OIDC discovery, token och JWKS',
    label: 'OIDC-identitetsleverantör',
    promise: 'Autentisera användare och klienter',
  },
]

const workflow = [
  {
    detail: 'Redigera kod och dokumentation med stöd av AI-agentverktyget.',
    icon: Code2,
    label: 'Utveckla',
  },
  {
    detail:
      'Starta runtime, SQL Server och OIDC-förmåga med rätt konfiguration.',
    icon: Play,
    label: 'Köra',
  },
  {
    detail: 'Logga in i webbläsaren och prova funktionen med beständig data.',
    icon: Monitor,
    label: 'Använda',
  },
  {
    detail:
      'Kör kontroller och jämför kod, test och dokumentation mot uppgiften.',
    icon: ShieldCheck,
    label: 'Validera',
  },
]

const accentClasses: Record<Accent, string> = {
  amber:
    'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/35',
  blue: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/35',
  green:
    'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/35',
  slate: 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900',
  violet:
    'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-950/35',
}

function SlideFrame({
  children,
  index,
  subtitle,
  title,
}: {
  children: ReactNode
  index: number
  subtitle: string
  title: string
}) {
  return (
    <section
      aria-label={`Bild ${index}: ${title}`}
      className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-300 bg-slate-100 text-slate-950 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
    >
      <header className="absolute inset-x-0 top-0 flex h-[16%] items-center gap-[2.5%] bg-linear-to-r from-[#073d7a] to-[#0759a8] px-[3%] text-white">
        <div className="flex size-[clamp(2.4rem,5vw,4.6rem)] shrink-0 items-center justify-center rounded-full bg-white text-[#07509a] shadow-md">
          <LayoutGrid aria-hidden="true" className="size-[55%]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[clamp(0.48rem,0.82vw,0.72rem)] font-bold uppercase tracking-[0.18em] text-blue-100">
            Topologioberoende utvecklingsmiljö · bild {index} av 3
          </p>
          <h2 className="truncate text-[clamp(1.05rem,2.25vw,2rem)] font-black leading-tight tracking-tight">
            {title}
          </h2>
          <p className="truncate text-[clamp(0.48rem,0.85vw,0.75rem)] font-semibold text-blue-100">
            {subtitle}
          </p>
        </div>
        <span className="flex size-[clamp(2rem,4vw,3.6rem)] shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[clamp(0.8rem,1.6vw,1.35rem)] font-black">
          {index}
        </span>
      </header>
      <div className="absolute inset-x-[1.25%] bottom-[1.7%] top-[18%]">
        {children}
      </div>
    </section>
  )
}

function Panel({
  accent = 'slate',
  children,
  className = '',
  icon: Icon,
  number,
  title,
}: {
  accent?: Accent
  children: ReactNode
  className?: string
  icon?: typeof Code2
  number?: string
  title: string
}) {
  return (
    <div
      className={`min-h-0 rounded-2xl border p-[clamp(0.5rem,1vw,0.9rem)] shadow-sm ${accentClasses[accent]} ${className}`}
    >
      <div className="flex items-center gap-2">
        {number ? (
          <span className="flex size-[clamp(1.2rem,2vw,1.8rem)] shrink-0 items-center justify-center rounded-full bg-[#07509a] text-[clamp(0.48rem,0.8vw,0.7rem)] font-black text-white">
            {number}
          </span>
        ) : null}
        {Icon ? (
          <Icon
            aria-hidden="true"
            className="size-[clamp(0.9rem,1.5vw,1.3rem)] shrink-0 text-[#07509a] dark:text-blue-300"
          />
        ) : null}
        <h3 className="text-[clamp(0.58rem,1.08vw,0.94rem)] font-black text-[#083d78] dark:text-blue-200">
          {title}
        </h3>
      </div>
      <div className="mt-[clamp(0.3rem,0.7vw,0.65rem)] text-[clamp(0.41rem,0.68vw,0.61rem)] leading-snug">
        {children}
      </div>
    </div>
  )
}

function ComponentChip({
  index,
  item,
}: {
  index?: number
  item: (typeof coreComponents)[number]
}) {
  const Icon = item.icon
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-blue-200 bg-white px-[4%] py-[3%] shadow-sm dark:border-blue-800 dark:bg-slate-900">
      <Icon
        aria-hidden="true"
        className="size-[clamp(0.85rem,1.5vw,1.3rem)] shrink-0 text-[#07509a] dark:text-blue-300"
      />
      <div className="min-w-0">
        <p className="truncate font-black">
          {index ? `${index}. ` : ''}
          {item.label}
        </p>
        <p className="truncate text-[0.9em] text-slate-600 dark:text-slate-300">
          {item.promise}
        </p>
      </div>
    </div>
  )
}

function WorkflowStrip({ detailed = false }: { detailed?: boolean }) {
  return (
    <div className="grid h-full grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-[0.7%]">
      {workflow.map(({ detail, icon: Icon, label }, index) => (
        <div className="contents" key={label}>
          <div className="flex min-w-0 flex-col justify-center rounded-xl border border-blue-300 bg-linear-to-b from-blue-500 to-blue-700 px-[6%] py-[4%] text-center text-white shadow-sm">
            <div className="flex items-center justify-center gap-2">
              <span className="flex size-[clamp(1rem,1.8vw,1.6rem)] items-center justify-center rounded-full bg-white font-black text-[#07509a]">
                {index + 1}
              </span>
              <Icon
                aria-hidden="true"
                className="size-[clamp(0.8rem,1.4vw,1.2rem)]"
              />
              <strong className="text-[clamp(0.48rem,0.82vw,0.72rem)]">
                {label}
              </strong>
            </div>
            {detailed ? (
              <p className="mt-1 text-[clamp(0.34rem,0.54vw,0.5rem)] text-blue-50">
                {detail}
              </p>
            ) : null}
          </div>
          {index < workflow.length - 1 ? (
            <ChevronRight
              aria-hidden="true"
              className="my-auto size-[clamp(0.8rem,1.6vw,1.4rem)] text-[#07509a] dark:text-blue-300"
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-[0.35em]">
      {items.map(item => (
        <li className="flex items-start gap-1.5" key={item}>
          <CheckCircle2
            aria-hidden="true"
            className="mt-[0.1em] size-[1.15em] shrink-0 text-green-700 dark:text-green-300"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function VariantANumberedOverview() {
  return (
    <div className="space-y-8">
      <SlideFrame
        index={1}
        subtitle="Från uppgift till fungerande och verifierad ändring"
        title="Den fulla normala utvecklingsloopen"
      >
        <div className="grid h-full grid-cols-12 grid-rows-[0.9fr_1.15fr_0.48fr] gap-[1.3%]">
          <Panel
            className="col-span-3"
            icon={UserRound}
            number="1"
            title="Utvecklaren styr"
          >
            <CheckList
              items={[
                'Sätter mål och prioriterar',
                'Fattar ansvariga beslut',
                'Godkänner känsliga och externa åtgärder',
              ]}
            />
          </Panel>
          <Panel
            className="col-span-9"
            number="2"
            title="Fyra steg bildar en sammanhängande loop"
          >
            <WorkflowStrip />
          </Panel>
          <Panel
            className="col-span-7"
            icon={ServerCog}
            number="3"
            title="Sex komponenter är alltid med"
          >
            <div className="grid grid-cols-3 gap-[2%]">
              {coreComponents.map((item, index) => (
                <ComponentChip index={index + 1} item={item} key={item.label} />
              ))}
            </div>
          </Panel>
          <Panel
            accent="green"
            className="col-span-5"
            icon={CheckCircle2}
            number="4"
            title="Loopen är klar när"
          >
            <CheckList
              items={[
                'Kravhantering kan startas',
                'Utvecklaren kan logga in och använda funktionen',
                'Data sparas i Microsoft SQL Server',
                'Grundläggande automatiserade kontroller är körda',
              ]}
            />
          </Panel>
          <Panel
            accent="blue"
            className="col-span-12"
            icon={Network}
            number="5"
            title="Fri placering — kontrakten styr"
          >
            <div className="flex items-center justify-between gap-4">
              <strong>
                Komponenterna får placeras tillsammans eller var för sig.
              </strong>
              <span>
                Relationer visar ansvar, beroenden och dataflöden — aldrig
                maskin-, container- eller nätverksgränser.
              </span>
            </div>
          </Panel>
        </div>
      </SlideFrame>

      <SlideFrame
        index={2}
        subtitle="Komponenterna ordnas efter ansvar i utvecklarens arbetsflöde"
        title="Den obligatoriska utvecklingskärnan"
      >
        <div className="grid h-full grid-cols-12 grid-rows-[0.74fr_1.28fr_0.5fr] gap-[1.3%]">
          <Panel
            className="col-span-12"
            number="1"
            title="Arbetsflödet fördelar ansvar mellan komponenterna"
          >
            <WorkflowStrip detailed />
          </Panel>
          <Panel
            className="col-span-8"
            icon={LayoutGrid}
            number="2"
            title="Komponenternas funktionella löften"
          >
            <div className="grid grid-cols-2 gap-[1.5%]">
              {coreComponents.map((item, index) => (
                <ComponentChip index={index + 1} item={item} key={item.label} />
              ))}
            </div>
          </Panel>
          <Panel
            accent="green"
            className="col-span-4"
            icon={FileCheck2}
            number="3"
            title="Specifikationsvalidering före överlämning"
          >
            <CheckList
              items={[
                'Jämför implementationen mot uppgiften',
                'Kontrollerar test och dokumentation',
                'Kör relevanta kontroller',
                'Redovisar avvikelser och osäkerheter',
                'Ersätter inte oberoende kodgranskning',
              ]}
            />
          </Panel>
          <Panel
            accent="violet"
            className="col-span-6"
            icon={Bot}
            number="4"
            title="AI-agentverktygets gräns"
          >
            Uppgift, kontext och godkännanden in. Frågor, ändringar och
            verifieringsevidens tillbaka. Arkitektur, säkerhet, dataskydd och
            release förblir mänskligt ansvar.
          </Panel>
          <Panel
            accent="amber"
            className="col-span-6"
            icon={ShieldCheck}
            number="5"
            title="Ingen produktionsåtkomst krävs"
          >
            Kärnloopen behöver varken produktionshemligheter, produktionsdata
            eller produktionsmiljöer. Den behöver endast sina beslutade
            utvecklingskontrakt.
          </Panel>
        </div>
      </SlideFrame>

      <SlideFrame
        index={3}
        subtitle="Kärnkontrakt, villkorade förmågor och utökad validering"
        title="Kontraktsstyrd nåbarhet"
      >
        <div className="grid h-full grid-cols-12 grid-rows-[0.68fr_1.42fr_0.48fr] gap-[1.3%]">
          <Panel
            className="col-span-12"
            icon={Network}
            number="1"
            title="Varje komponentkontrakt beskriver tre saker"
          >
            <div className="grid grid-cols-3 gap-[1.5%]">
              {[
                [
                  'Funktionellt löfte',
                  'Vad relationen gör för utvecklingsloopen.',
                ],
                ['Tekniskt gränssnitt', 'Hur komponenterna kommunicerar.'],
                [
                  'Konfigurationsankare',
                  'Var relationen konfigureras och styrs.',
                ],
              ].map(([heading, text]) => (
                <div
                  className="rounded-xl border border-blue-200 bg-white px-[4%] py-[3%] dark:border-blue-800 dark:bg-slate-900"
                  key={heading}
                >
                  <strong>{heading}</strong>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            className="col-span-6"
            icon={ServerCog}
            number="2"
            title="Kärnans viktigaste relationer"
          >
            <div className="space-y-[0.35em]">
              {[
                ['Arbetsyta → runtime', 'start, bygge och miljökonfiguration'],
                ['Webbläsare ↔ runtime', 'UI och REST via HTTP(S)'],
                ['Webbläsare ↔ identitet', 'OIDC-inloggning och utloggning'],
                [
                  'Runtime ↔ identitet',
                  'discovery, token och JWKS · AUTH_OIDC_*',
                ],
                [
                  'Arbetsyta → SQL Server',
                  'schema, seedning och integrationstest',
                ],
                ['Runtime ↔ SQL Server', 'beständig data · DATABASE_URL'],
              ].map(([from, contract]) => (
                <div
                  className="grid grid-cols-[1fr_auto_1.35fr] items-center gap-2 rounded-lg bg-slate-100 px-[3%] py-[1.8%] dark:bg-slate-800"
                  key={from}
                >
                  <strong>{from}</strong>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-[1.1em] text-[#07509a]"
                  />
                  <span>{contract}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            accent="violet"
            className="col-span-3"
            icon={Sparkles}
            number="3"
            title="Vid vald funktion"
          >
            <CheckList
              items={[
                'HSA-personuppslag · server-side REST',
                'AI-modelltjänst · hemlig leverantörsuppgift',
                'Extern MCP-klient · Streamable HTTP och Bearer-JWT',
              ]}
            />
            <p className="mt-2 font-bold">
              Ingår inte i normal startberedskap.
            </p>
          </Panel>
          <Panel
            accent="amber"
            className="col-span-3"
            icon={TestTube2}
            number="4"
            title="Utökad validering"
          >
            <CheckList
              items={[
                'Källkods- och granskningsplattform',
                'Pull request och mänsklig granskning',
                'CI/CD-körningar, loggar och artefakter',
                'Oberoende AI-assisterad kodgranskning',
              ]}
            />
          </Panel>
          <Panel
            accent="blue"
            className="col-span-12"
            icon={CircleDot}
            number="5"
            title="Nåbarheten är minimal och uttrycklig"
          >
            <div className="flex items-center justify-between gap-4">
              <strong>Endast beslutade relationer måste vara nåbara.</strong>
              <span>
                Webbläsaren behöver exempelvis ingen direktåtkomst till
                Microsoft SQL Server.
              </span>
              <span className="font-bold">
                Heldragen = kärna · streckad = funktionsvillkor · prickad =
                validering
              </span>
            </div>
          </Panel>
        </div>
      </SlideFrame>
    </div>
  )
}

function JourneyStage({ index }: { index: number }) {
  const stage = workflow[index]
  const Icon = stage.icon
  const componentSets = [
    [coreComponents[0], coreComponents[1]],
    [coreComponents[3], coreComponents[4], coreComponents[5]],
    [coreComponents[2], coreComponents[3], coreComponents[5]],
    [coreComponents[0], coreComponents[1]],
  ]
  const contractSets = [
    'Instruktioner, skills och avgränsade behörigheter',
    'Miljökonfiguration, DATABASE_URL och AUTH_OIDC_*',
    'Publik adress, HTTP(S) och OIDC-omdirigeringar',
    'Projektkontroller och beslutad specifikation',
  ]
  const resultSets = [
    'Ändrade filer, uppdaterade test och dokumentation',
    'Körande runtime, kompatibelt schema och tillgänglig identitet',
    'Provat användarflöde och beständigt sparad data',
    'Kontrollresultat, avvikelser och överlämningsevidens',
  ]
  return (
    <div className="relative flex min-w-0 flex-col rounded-2xl border-2 border-blue-300 bg-white p-[5%] shadow-sm dark:border-blue-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <span className="flex size-[clamp(1.3rem,2.3vw,2rem)] items-center justify-center rounded-full bg-[#07509a] font-black text-white">
          {index + 1}
        </span>
        <Icon
          aria-hidden="true"
          className="size-[clamp(1rem,1.8vw,1.6rem)] text-[#07509a] dark:text-blue-300"
        />
        <h3 className="text-[clamp(0.58rem,1vw,0.88rem)] font-black">
          {stage.label}
        </h3>
      </div>
      <p className="mt-2 text-[clamp(0.38rem,0.62vw,0.56rem)] text-slate-600 dark:text-slate-300">
        {stage.detail}
      </p>
      <div className="mt-3 space-y-2 text-[clamp(0.34rem,0.56vw,0.5rem)]">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 dark:border-blue-800 dark:bg-blue-950">
          <strong>Kontrakt</strong>
          <p className="mt-1">{contractSets[index]}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-2 dark:border-green-800 dark:bg-green-950">
          <strong>Resultat</strong>
          <p className="mt-1">{resultSets[index]}</p>
        </div>
      </div>
      <div className="mt-auto space-y-1 pt-2">
        {componentSets[index].map(item => (
          <div
            className="rounded-lg bg-blue-50 px-2 py-1 font-bold text-[#083d78] dark:bg-blue-950 dark:text-blue-200"
            key={item.label}
          >
            {item.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export function VariantBDeveloperJourney() {
  return (
    <div className="space-y-8">
      <SlideFrame
        index={1}
        subtitle="En berättelse där varje steg visar aktivitet, komponenter och resultat"
        title="Utvecklarens resa genom loopen"
      >
        <div className="grid h-full grid-cols-[0.23fr_1fr] gap-[1.3%]">
          <Panel accent="blue" icon={UserRound} number="1" title="Startpunkt">
            <p className="font-black">En uppgift och en ansvarig utvecklare</p>
            <CheckList
              items={[
                'Mål och kontext',
                'Beslut och godkännanden',
                'Ingen föreskriven placering',
              ]}
            />
          </Panel>
          <div className="grid min-h-0 grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-[0.7%]">
            {[0, 1, 2, 3].map((index, position) => (
              <div className="contents" key={index}>
                <JourneyStage index={index} />
                {position < 3 ? (
                  <ArrowRight
                    aria-hidden="true"
                    className="my-auto size-[clamp(1rem,2vw,1.8rem)] text-[#07509a]"
                  />
                ) : null}
              </div>
            ))}
          </div>
          <Panel
            accent="green"
            className="col-span-2"
            icon={CheckCircle2}
            number="2"
            title="Målpunkt: en verifierad ändring i fungerande Kravhantering"
          >
            <div className="grid grid-cols-4 gap-4">
              <span>✓ Runtime startar</span>
              <span>✓ OIDC-inloggning fungerar</span>
              <span>✓ Data är beständig i SQL Server</span>
              <span>✓ Kod, test och dokumentation är kontrollerade</span>
            </div>
          </Panel>
        </div>
      </SlideFrame>

      <SlideFrame
        index={2}
        subtitle="Fyra ansvarsspår visar samarbetet utan att antyda fysisk topologi"
        title="Komponenterna samverkar längs resan"
      >
        <div className="grid h-full grid-rows-[repeat(4,1fr)_0.4fr] gap-[1.2%]">
          {[
            [
              'Utvecklaren',
              UserRound,
              'Sätter mål → fattar beslut → provar funktionen → tar emot evidens',
              'Mänskligt ansvar hela vägen',
            ],
            [
              'AI-agentverktyg + arbetsyta',
              Bot,
              'Läser instruktioner → redigerar filer → kör kommandon → specifikationsvaliderar',
              'Styrd åtkomst, inga produktionshemligheter',
            ],
            [
              'Webbläsare + OIDC',
              Monitor,
              'Öppnar appen → omdirigeras för inloggning → använder UI och REST → loggar ut',
              'HTTP(S), OIDC och AUTH_OIDC_*',
            ],
            [
              'Runtime + SQL Server',
              ServerCog,
              'Startar med konfiguration → kör funktioner → läser och skriver data → provas i integrationstest',
              'DATABASE_URL och kompatibelt schema',
            ],
          ].map(([label, icon, flow, contract], index) => {
            const Icon = icon as typeof Code2
            return (
              <div
                className="grid grid-cols-[0.24fr_1fr_0.31fr] items-center gap-[1.5%] rounded-2xl border border-blue-200 bg-white px-[2%] shadow-sm dark:border-blue-800 dark:bg-slate-900"
                key={label as string}
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-[clamp(1.2rem,2vw,1.8rem)] items-center justify-center rounded-full bg-[#07509a] font-black text-white">
                    {index + 1}
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="size-[clamp(0.9rem,1.5vw,1.3rem)] text-[#07509a]"
                  />
                  <strong className="text-[clamp(0.48rem,0.82vw,0.72rem)]">
                    {label as string}
                  </strong>
                </div>
                <p className="text-[clamp(0.39rem,0.66vw,0.58rem)] font-semibold">
                  {flow as string}
                </p>
                <p className="rounded-lg bg-blue-50 px-[4%] py-[3%] text-[clamp(0.36rem,0.6vw,0.54rem)] text-[#083d78] dark:bg-blue-950 dark:text-blue-200">
                  {contract as string}
                </p>
              </div>
            )
          })}
          <Panel
            accent="blue"
            icon={Network}
            title="Läs spåren som ansvar och kontrakt — inte som maskiner, processer, containrar eller nätverkszoner"
          >
            Varje spår får placeras tillsammans med eller skilt från de andra så
            länge de riktade relationerna fungerar.
          </Panel>
        </div>
      </SlideFrame>

      <SlideFrame
        index={3}
        subtitle="Sidospår ansluter bara när funktionen eller valideringsnivån kräver dem"
        title="Kärnresan med villkorade tillägg"
      >
        <div className="grid h-full grid-cols-[0.7fr_1.55fr_0.8fr] gap-[1.3%]">
          <div className="grid grid-rows-3 gap-[2%]">
            <Panel
              accent="violet"
              icon={Network}
              number="1"
              title="HSA-personuppslag"
            >
              Runtime anropar server-side REST via{' '}
              <strong>HSA_PERSON_LOOKUP_URL</strong>, med mTLS eller OAuth2 när
              miljön kräver det.
            </Panel>
            <Panel
              accent="violet"
              icon={Sparkles}
              number="2"
              title="AI-modelltjänst"
            >
              Runtime anropar ett modell-API med en hemlig leverantörsuppgift.
              Leverantören är utbytbar.
            </Panel>
            <Panel
              accent="violet"
              icon={CircleDot}
              number="3"
              title="Extern MCP-klient"
            >
              Klienten anropar <strong>/api/mcp</strong> via Streamable HTTP och
              OIDC-baserad Bearer-JWT.
            </Panel>
          </div>
          <Panel
            className="h-full"
            icon={ServerCog}
            number="4"
            title="Kärnresan återanvänds"
          >
            <div className="mt-2 grid h-[32%] grid-cols-4 gap-[2%]">
              {workflow.map(({ icon: Icon, label }, index) => (
                <div
                  className="flex flex-col items-center justify-center rounded-xl bg-blue-50 text-center dark:bg-blue-950"
                  key={label}
                >
                  <span className="flex size-[clamp(1.5rem,3vw,2.7rem)] items-center justify-center rounded-full bg-[#07509a] text-white">
                    <Icon aria-hidden="true" className="size-1/2" />
                  </span>
                  <strong className="mt-2">
                    {index + 1}. {label}
                  </strong>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center font-bold">
              Funktionsberoenden ändrar inte kärnans normala startberedskap.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-[1.5%]">
              {[
                ['Arbetsyta → runtime', 'start, bygge och miljökonfiguration'],
                ['Webbläsare ↔ runtime', 'UI och REST via HTTP(S)'],
                ['Runtime ↔ identitet', 'discovery, token och JWKS'],
                [
                  'Runtime ↔ SQL Server',
                  'beständig data och kompatibelt schema',
                ],
                ['Agent ↔ arbetsyta', 'filer, kommandon och tester'],
                ['Agent ↔ webbläsare', 'UI-inspektion och Playwright'],
              ].map(([heading, text]) => (
                <div
                  className="rounded-lg border border-blue-200 bg-blue-50 px-[3%] py-[2%] dark:border-blue-800 dark:bg-blue-950"
                  key={heading}
                >
                  <strong>{heading}</strong>
                  <p>{text}</p>
                </div>
              ))}
            </div>
          </Panel>
          <div className="grid grid-rows-2 gap-[2%]">
            <Panel
              accent="amber"
              icon={GitPullRequest}
              number="5"
              title="Källkod och granskning"
            >
              <CheckList
                items={[
                  'Revisioner och ärenden',
                  'Pull requests',
                  'Mänskliga granskningsbeslut',
                  'Separat AI-granskningskontext',
                ]}
              />
            </Panel>
            <Panel
              accent="amber"
              icon={TestTube2}
              number="6"
              title="CI/CD-validering"
            >
              <CheckList
                items={[
                  'Bygge och kvalitet',
                  'Integration och prestanda',
                  'Säkerhet och release-smoke',
                  'Status, loggar och artefakter',
                ]}
              />
            </Panel>
          </div>
        </div>
      </SlideFrame>
    </div>
  )
}

function ContractTable({
  rows = coreComponents,
}: {
  rows?: typeof coreComponents
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
      <div className="grid grid-cols-[1fr_1.2fr_1.25fr_1.05fr] bg-[#0b2d59] px-[2%] py-[1.15%] font-black text-white">
        <span>Komponent</span>
        <span>Funktionellt löfte</span>
        <span>Tekniskt gränssnitt</span>
        <span>Konfigurationsankare</span>
      </div>
      {rows.map((item, index) => {
        const Icon = item.icon
        return (
          <div
            className={`grid grid-cols-[1fr_1.2fr_1.25fr_1.05fr] items-center px-[2%] py-[1.15%] ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-blue-50 dark:bg-blue-950/40'}`}
            key={item.label}
          >
            <strong className="flex items-center gap-2">
              <Icon
                aria-hidden="true"
                className="size-[1.2em] text-[#07509a]"
              />
              {item.label}
            </strong>
            <span>{item.promise}</span>
            <span>{item.interface}</span>
            <code>{item.anchor}</code>
          </div>
        )
      })}
    </div>
  )
}

export function VariantCArchitectureAtlas() {
  return (
    <div className="space-y-8">
      <SlideFrame
        index={1}
        subtitle="En tät systembild med kärnan, aktören, resultatet och placeringsregeln"
        title="Atlas över den fulla utvecklingsloopen"
      >
        <div className="grid h-full grid-cols-[0.7fr_2fr_0.75fr] grid-rows-[1fr_0.42fr] gap-[1.3%]">
          <Panel accent="blue" icon={UserRound} number="1" title="Utvecklaren">
            <CheckList
              items={[
                'Sätter mål',
                'Fattar beslut',
                'Godkänner åtgärder',
                'Provar resultatet',
              ]}
            />
          </Panel>
          <Panel
            icon={LayoutGrid}
            number="2"
            title="Obligatorisk utvecklingskärna"
          >
            <div className="grid grid-cols-3 gap-[2%]">
              {coreComponents.map((item, index) => (
                <ComponentChip index={index + 1} item={item} key={item.label} />
              ))}
            </div>
            <div className="mt-[2%] h-[27%]">
              <WorkflowStrip />
            </div>
            <div className="mt-[2%] grid grid-cols-3 gap-[2%] text-[clamp(0.34rem,0.56vw,0.5rem)]">
              <div className="rounded-lg bg-blue-50 p-[3%] dark:bg-blue-950">
                <strong>Skapa och styra</strong>
                <p>Arbetsyta och AI-agentverktyg</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-[3%] dark:bg-blue-950">
                <strong>Interagera och autentisera</strong>
                <p>Webbläsare, runtime och OIDC</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-[3%] dark:bg-blue-950">
                <strong>Köra och lagra</strong>
                <p>Runtime och Microsoft SQL Server</p>
              </div>
            </div>
          </Panel>
          <Panel accent="green" icon={CheckCircle2} number="3" title="Resultat">
            <CheckList
              items={[
                'Fungerande runtime',
                'OIDC-inloggning',
                'Beständig SQL-data',
                'Verifieringsevidens',
              ]}
            />
          </Panel>
          <Panel
            accent="blue"
            className="col-span-3"
            icon={Network}
            number="4"
            title="Den normativa regeln"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <strong>Placera tillsammans eller var för sig</strong>
              <ArrowRight
                aria-hidden="true"
                className="size-[1.5em] text-[#07509a]"
              />
              <span>
                Behåll endast de riktade relationer som komponentkontrakten
                kräver. Avstånd och gruppering är logiska, aldrig fysiska.
              </span>
            </div>
          </Panel>
        </div>
      </SlideFrame>

      <SlideFrame
        index={2}
        subtitle="Varje rad gör ansvar, gränssnitt och konfiguration spårbara"
        title="Komponentatlas för utvecklingskärnan"
      >
        <div className="grid h-full grid-rows-[0.2fr_1fr_0.3fr] gap-[1.3%] text-[clamp(0.34rem,0.59vw,0.53rem)]">
          <Panel
            accent="blue"
            icon={LayoutGrid}
            number="1"
            title="Sex logiska komponenter — sex självständiga ansvar"
          >
            En komponent får en egen rad när den har ett självständigt ansvar
            och ett uttryckligt kontrakt. UI, REST och MCP är interna
            kontraktsytor i runtime; TypeORM, DAL och autentiseringskod är
            interna lager.
          </Panel>
          <ContractTable />
          <div className="grid grid-cols-3 gap-[1.3%]">
            <Panel
              accent="green"
              icon={FileCheck2}
              number="2"
              title="Kärnvalidering"
            >
              Typkontroll, lintning, enhetstest, Playwright,
              SQL-integrationstest och AI-agentens specifikationsvalidering.
            </Panel>
            <Panel
              accent="amber"
              icon={GitPullRequest}
              number="3"
              title="Utanför kärnloopen"
            >
              Pull request, delad granskning och CI/CD höjer verifieringsgraden
              men krävs inte för normal start och användning.
            </Panel>
            <Panel
              accent="violet"
              icon={Network}
              number="4"
              title="Ingen standardtopologi"
            >
              Inga namngivna värdar, virtuella maskiner, containrar,
              devcontainers eller fjärrmiljöer visas.
            </Panel>
          </div>
        </div>
      </SlideFrame>

      <SlideFrame
        index={3}
        subtitle="En kontraktskarta visar exakt vad som måste nå vad — och varför"
        title="Kontraktsatlas med villkor och validering"
      >
        <div className="grid h-full grid-cols-[1.35fr_0.8fr_0.8fr] grid-rows-[1fr_0.34fr] gap-[1.3%]">
          <Panel icon={Network} number="1" title="Kärnkontrakt">
            <div className="grid grid-cols-2 gap-[1.5%]">
              {[
                ['Arbetsyta → runtime', 'Start, bygge och miljökonfiguration'],
                ['Webbläsare ↔ runtime', 'UI och REST via HTTP(S)'],
                ['Webbläsare ↔ identitet', 'OIDC-omdirigeringar'],
                [
                  'Runtime ↔ identitet',
                  'Discovery, token, JWKS och utloggning',
                ],
                [
                  'Arbetsyta → SQL Server',
                  'Schema, seedning och integrationstest',
                ],
                [
                  'Runtime ↔ SQL Server',
                  'Beständig data och kompatibelt schema',
                ],
                ['Agent ↔ arbetsyta', 'Filer, kommandon, tester och resultat'],
                ['Agent ↔ webbläsare', 'UI-inspektion och Playwright'],
              ].map(([heading, text]) => (
                <div
                  className="rounded-xl border border-blue-200 bg-white p-[3%] dark:border-blue-800 dark:bg-slate-900"
                  key={heading}
                >
                  <strong>{heading}</strong>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel
            accent="violet"
            icon={Sparkles}
            number="2"
            title="Funktionsspecifikt"
          >
            <CheckList
              items={[
                'HSA-personuppslag',
                'AI-modelltjänst',
                'Extern MCP-klient',
              ]}
            />
            <p className="mt-3 font-bold">
              Streckad relation. Aktiv endast när funktionen utvecklas eller
              provas.
            </p>
          </Panel>
          <Panel
            accent="amber"
            icon={TestTube2}
            number="3"
            title="Valideringstillägg"
          >
            <CheckList
              items={[
                'Källkodsplattform',
                'Mänsklig granskning',
                'CI/CD-motor',
                'Loggar och artefakter',
              ]}
            />
            <p className="mt-3 font-bold">
              Prickad relation. Återanvänder kärnans kontrakt för vald
              testomfattning.
            </p>
          </Panel>
          <Panel
            accent="blue"
            className="col-span-2"
            icon={ShieldCheck}
            number="4"
            title="Kontraktsstyrd nåbarhet"
          >
            <div className="flex justify-between gap-4">
              <strong>Minsta nödvändiga åtkomst</strong>
              <span>Ingen direkt webbläsare → SQL Server-relation</span>
              <span>Ingen produktionsåtkomst för AI-agentverktyget</span>
              <span>Inga implicita fullständiga nät</span>
            </div>
          </Panel>
          <Panel icon={CircleDot} number="5" title="Legend">
            <p>
              <strong>Heldragen:</strong> obligatorisk kärna
            </p>
            <p>
              <strong>Streckad:</strong> funktionsvillkor
            </p>
            <p>
              <strong>Prickad:</strong> utökad validering
            </p>
          </Panel>
        </div>
      </SlideFrame>
    </div>
  )
}

function PrototypeSwitcher({
  current,
  onSelect,
}: {
  current: VariantKey
  onSelect: (key: VariantKey) => void
}) {
  const currentIndex = variants.findIndex(variant => variant.key === current)
  const selectOffset = useCallback(
    (offset: number) => {
      const nextIndex =
        (currentIndex + offset + variants.length) % variants.length
      onSelect(variants[nextIndex].key)
    },
    [currentIndex, onSelect],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'ArrowLeft') selectOffset(-1)
      if (event.key === 'ArrowRight') selectOffset(1)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectOffset])

  if (process.env.NODE_ENV === 'production') return null
  const definition = variants[currentIndex]
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-full border border-white/20 bg-slate-950 px-2 py-1.5 text-white shadow-2xl">
        <button
          aria-label="Föregående variant"
          className="flex size-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => selectOffset(-1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-44 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            {definition.key} · {definition.name}
          </p>
        </div>
        <button
          aria-label="Nästa variant"
          className="flex size-9 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => selectOffset(1)}
          type="button"
        >
          <ArrowRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  )
}

export default function InfographicPrototypeClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const requestedVariant = searchParams.get('variant')?.toUpperCase()
  const current: VariantKey =
    requestedVariant === 'B' || requestedVariant === 'C'
      ? requestedVariant
      : 'A'
  const selectVariant = useCallback(
    (key: VariantKey) => {
      const next = new URLSearchParams(searchParams.toString())
      next.set('variant', key)
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return (
    <main
      className="min-h-screen bg-slate-300 px-3 pb-36 pt-8 dark:bg-slate-900 sm:px-6 lg:px-10"
      {...devMarker({
        context: 'infographic prototype',
        name: 'topology-independent infographic series',
        priority: 100,
        value: current,
      })}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 grid gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-black">
              PROTOTYP — bedöm innehållshierarki och komposition
            </p>
            <p className="text-sm">
              Alla tre alternativ är nu innehållsrika. De provar vad som
              prioriteras, hur informationen grupperas och hur den visuella
              grammatiken bär läsordningen.
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-black">
              Variant {current}:{' '}
              {variants.find(item => item.key === current)?.name}
            </p>
            <p>Tre bilder · 16:9 · svenska</p>
          </div>
        </div>
        {current === 'A' ? <VariantANumberedOverview /> : null}
        {current === 'B' ? <VariantBDeveloperJourney /> : null}
        {current === 'C' ? <VariantCArchitectureAtlas /> : null}
      </div>
      <PrototypeSwitcher current={current} onSelect={selectVariant} />
    </main>
  )
}
