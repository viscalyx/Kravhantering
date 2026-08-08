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
  GitPullRequest,
  KeyRound,
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

interface VariantDefinition {
  key: VariantKey
  name: string
}

const variants: VariantDefinition[] = [
  { key: 'A', name: 'Orbit' },
  { key: 'B', name: 'Transit' },
  { key: 'C', name: 'Fältguide' },
]

const coreComponents = [
  { icon: Code2, label: 'Utvecklingsarbetsyta' },
  { icon: Bot, label: 'AI-agentverktyg' },
  { icon: Monitor, label: 'Webbläsare' },
  { icon: ServerCog, label: 'Kravhanteringsruntime' },
  { icon: Database, label: 'Microsoft SQL Server' },
  { icon: KeyRound, label: 'OIDC-identitetsleverantör' },
]

const workflow = ['Utveckla', 'Köra', 'Använda', 'Validera']

function SlideFrame({
  children,
  eyebrow,
  index,
  title,
}: {
  children: ReactNode
  eyebrow: string
  index: number
  title: string
}) {
  return (
    <section
      aria-label={`Bild ${index}: ${title}`}
      className="relative aspect-video w-full overflow-hidden rounded-3xl border border-slate-300 bg-slate-50 text-slate-950 shadow-xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
    >
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-6 px-[4%] pt-[3%]">
        <div>
          <p className="text-[clamp(0.55rem,1vw,0.85rem)] font-bold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300">
            {eyebrow}
          </p>
          <h2 className="mt-1 max-w-[38ch] text-[clamp(1.05rem,2.4vw,2rem)] font-black leading-tight tracking-tight">
            {title}
          </h2>
        </div>
        <span className="flex size-[clamp(2rem,4vw,3.5rem)] shrink-0 items-center justify-center rounded-full border-2 border-current text-[clamp(0.8rem,1.8vw,1.4rem)] font-black">
          {index}
        </span>
      </div>
      {children}
    </section>
  )
}

function CoreChip({
  compact = false,
  icon: Icon,
  label,
}: {
  compact?: boolean
  icon: typeof Code2
  label: string
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border border-slate-300 bg-white/90 font-semibold shadow-sm dark:border-slate-700 dark:bg-slate-900/90 ${
        compact
          ? 'px-2 py-1 text-[clamp(0.45rem,0.8vw,0.68rem)]'
          : 'px-3 py-2 text-[clamp(0.55rem,1.05vw,0.82rem)]'
      }`}
    >
      <Icon
        aria-hidden="true"
        className="size-[1.4em] shrink-0 text-cyan-700 dark:text-cyan-300"
      />
      <span>{label}</span>
    </div>
  )
}

export function VariantAOrbit() {
  return (
    <div className="space-y-8">
      <SlideFrame
        eyebrow="Översikt · en full normal loop"
        index={1}
        title="Från idé till verifierad ändring"
      >
        <div className="absolute inset-x-[6%] bottom-[7%] top-[27%] grid grid-cols-[0.7fr_2fr_0.7fr] items-center gap-[4%]">
          <div className="flex flex-col items-center text-center">
            <div className="flex size-[clamp(3rem,7vw,6rem)] items-center justify-center rounded-full bg-cyan-700 text-white shadow-lg">
              <UserRound aria-hidden="true" className="size-1/2" />
            </div>
            <p className="mt-2 text-[clamp(0.55rem,1.2vw,1rem)] font-bold">
              Utvecklaren
            </p>
            <p className="text-[clamp(0.45rem,0.8vw,0.72rem)] text-slate-600 dark:text-slate-300">
              sätter mål och fattar beslut
            </p>
          </div>

          <div className="relative mx-auto aspect-2/1 w-full rounded-[50%] border-[clamp(3px,0.5vw,7px)] border-cyan-700/25">
            <div className="absolute inset-[18%] flex items-center justify-center rounded-[50%] bg-cyan-100 text-center dark:bg-cyan-950">
              <div>
                <ServerCog
                  aria-hidden="true"
                  className="mx-auto size-[clamp(1.5rem,3vw,2.8rem)] text-cyan-800 dark:text-cyan-200"
                />
                <p className="mt-1 text-[clamp(0.6rem,1.25vw,1rem)] font-black">
                  Kravhantering fungerar
                </p>
                <p className="text-[clamp(0.42rem,0.75vw,0.68rem)]">
                  inloggning · beständig data · kontroller
                </p>
              </div>
            </div>
            {workflow.map((item, index) => {
              const positions = [
                'left-[3%] top-[42%]',
                'left-[34%] top-[-9%]',
                'right-[3%] top-[42%]',
                'bottom-[-9%] left-[34%]',
              ]
              return (
                <div
                  className={`absolute flex w-[31%] items-center justify-center gap-1 rounded-full bg-slate-950 px-2 py-2 text-[clamp(0.5rem,1vw,0.85rem)] font-bold text-white dark:bg-white dark:text-slate-950 ${positions[index]}`}
                  key={item}
                >
                  <span>{index + 1}</span>
                  <ChevronRight aria-hidden="true" className="size-[1em]" />
                  <span>{item}</span>
                </div>
              )
            })}
          </div>

          <div className="space-y-2 text-center">
            <CheckCircle2
              aria-hidden="true"
              className="mx-auto size-[clamp(2rem,5vw,4.5rem)] text-emerald-600 dark:text-emerald-400"
            />
            <p className="text-[clamp(0.55rem,1.15vw,0.95rem)] font-black">
              Verifierad ändring
            </p>
            <p className="text-[clamp(0.43rem,0.78vw,0.68rem)] text-slate-600 dark:text-slate-300">
              kod · test · dokumentation
            </p>
          </div>
        </div>
      </SlideFrame>

      <SlideFrame
        eyebrow="Fördjupning · obligatorisk kärna"
        index={2}
        title="Sex logiska komponenter bär loopen"
      >
        <div className="absolute inset-x-[5%] bottom-[8%] top-[27%]">
          <div className="grid h-full grid-cols-[0.75fr_2.7fr] gap-[4%]">
            <div className="flex flex-col justify-center rounded-3xl bg-slate-900 p-[8%] text-white dark:bg-cyan-950">
              <UserRound
                aria-hidden="true"
                className="size-[clamp(1.8rem,4vw,3.5rem)]"
              />
              <p className="mt-2 text-[clamp(0.55rem,1.2vw,1rem)] font-black">
                Utvecklaren leder
              </p>
              <p className="mt-1 text-[clamp(0.42rem,0.77vw,0.68rem)] text-slate-300">
                Mål, beslut och godkännanden in. Frågor, ändringar och evidens
                tillbaka.
              </p>
            </div>
            <div className="relative rounded-[50%] border-[clamp(4px,0.65vw,9px)] border-dashed border-cyan-700/45 bg-cyan-50/70 dark:bg-cyan-950/35">
              <div className="absolute inset-[28%] flex flex-col items-center justify-center rounded-full bg-cyan-700 text-center text-white shadow-xl">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-[clamp(1.2rem,2.4vw,2.2rem)]"
                />
                <p className="text-[clamp(0.5rem,1vw,0.85rem)] font-black">
                  Kontrakten uppfylls
                </p>
              </div>
              {coreComponents.map(({ icon, label }, index) => {
                const positions = [
                  'left-[4%] top-[14%]',
                  'left-[37%] top-[2%]',
                  'right-[3%] top-[16%]',
                  'right-[3%] bottom-[14%]',
                  'left-[37%] bottom-[2%]',
                  'left-[4%] bottom-[14%]',
                ]
                return (
                  <div
                    className={`absolute w-[29%] ${positions[index]}`}
                    key={label}
                  >
                    <CoreChip icon={icon} label={label} />
                  </div>
                )
              })}
            </div>
          </div>
          <p className="absolute inset-x-0 bottom-[-2%] text-center text-[clamp(0.44rem,0.8vw,0.7rem)] font-bold text-cyan-800 dark:text-cyan-200">
            Logiska komponenter kan placeras tillsammans eller var för sig —
            relationerna visar ansvar och kontrakt, inte topologi.
          </p>
        </div>
      </SlideFrame>

      <SlideFrame
        eyebrow="Fördjupning · kontraktsstyrd nåbarhet"
        index={3}
        title="Bara beslutade relationer behöver vara nåbara"
      >
        <div className="absolute inset-x-[4%] bottom-[7%] top-[27%] grid grid-cols-[1.4fr_1fr_1fr] gap-[3%]">
          <div className="grid grid-cols-2 content-center gap-2 rounded-3xl border-2 border-cyan-700/50 bg-cyan-50 p-[5%] dark:bg-cyan-950/30">
            <p className="col-span-2 text-[clamp(0.55rem,1.15vw,1rem)] font-black">
              Obligatorisk utvecklingskärna
            </p>
            {coreComponents.map(item => (
              <CoreChip compact key={item.label} {...item} />
            ))}
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-3xl border-2 border-dashed border-violet-500/60 bg-violet-50 p-[7%] dark:bg-violet-950/25">
            <p className="text-[clamp(0.52rem,1vw,0.88rem)] font-black">
              Vid vald funktion
            </p>
            <p className="text-[clamp(0.44rem,0.82vw,0.72rem)]">
              <Network
                aria-hidden="true"
                className="mr-1 inline size-[1.2em]"
              />{' '}
              HSA-personuppslag
            </p>
            <p className="text-[clamp(0.44rem,0.82vw,0.72rem)]">
              <Sparkles
                aria-hidden="true"
                className="mr-1 inline size-[1.2em]"
              />{' '}
              AI-modelltjänst
            </p>
            <p className="text-[clamp(0.44rem,0.82vw,0.72rem)]">
              <CircleDot
                aria-hidden="true"
                className="mr-1 inline size-[1.2em]"
              />{' '}
              Extern MCP-klient
            </p>
            <p className="mt-1 text-[clamp(0.4rem,0.68vw,0.6rem)]">
              Villkorade kontrakt — inte normal startberedskap.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-2 rounded-3xl border-2 border-dotted border-amber-600/60 bg-amber-50 p-[7%] dark:bg-amber-950/25">
            <p className="text-[clamp(0.52rem,1vw,0.88rem)] font-black">
              Utökad validering
            </p>
            <p className="text-[clamp(0.44rem,0.82vw,0.72rem)]">
              <GitPullRequest
                aria-hidden="true"
                className="mr-1 inline size-[1.2em]"
              />{' '}
              Källkod och granskning
            </p>
            <p className="text-[clamp(0.44rem,0.82vw,0.72rem)]">
              <TestTube2
                aria-hidden="true"
                className="mr-1 inline size-[1.2em]"
              />{' '}
              CI/CD-validering
            </p>
            <p className="mt-1 text-[clamp(0.4rem,0.68vw,0.6rem)]">
              Oberoende granskning kompletterar specifikationsvalideringen.
            </p>
          </div>
        </div>
      </SlideFrame>
    </div>
  )
}

function TransitStation({
  detail,
  index,
  label,
}: {
  detail?: string
  index: number
  label: string
}) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center">
      <span className="flex size-[clamp(1.7rem,3.4vw,3rem)] items-center justify-center rounded-full border-[clamp(3px,0.45vw,6px)] border-cyan-700 bg-white text-[clamp(0.55rem,1vw,0.85rem)] font-black text-cyan-900 dark:bg-slate-950 dark:text-cyan-100">
        {index}
      </span>
      <strong className="mt-2 text-[clamp(0.48rem,0.95vw,0.8rem)]">
        {label}
      </strong>
      {detail ? (
        <span className="mt-1 max-w-[16ch] text-[clamp(0.38rem,0.65vw,0.58rem)] text-slate-600 dark:text-slate-300">
          {detail}
        </span>
      ) : null}
    </div>
  )
}

export function VariantBTransit() {
  return (
    <div className="space-y-8">
      <SlideFrame
        eyebrow="Linje 1 · den normala utvecklingsloopen"
        index={1}
        title="Fyra stationer till fungerande Kravhantering"
      >
        <div className="absolute inset-x-[7%] bottom-[10%] top-[36%] flex items-center">
          <div className="absolute inset-x-[7%] top-[28%] h-[clamp(5px,0.7vw,10px)] rounded-full bg-cyan-700" />
          <div className="grid w-full grid-cols-4">
            <TransitStation
              detail="Källkod, uppgift och konfiguration"
              index={1}
              label="Utveckla"
            />
            <TransitStation
              detail="Runtime och databas startar"
              index={2}
              label="Köra"
            />
            <TransitStation
              detail="Logga in och arbeta i appen"
              index={3}
              label="Använda"
            />
            <TransitStation
              detail="Kontroller och evidens"
              index={4}
              label="Validera"
            />
          </div>
        </div>
        <p className="absolute bottom-[6%] left-[7%] flex items-center gap-2 text-[clamp(0.42rem,0.75vw,0.68rem)] font-bold">
          <UserRound aria-hidden="true" className="size-[1.4em]" /> Utvecklaren
          ansvarar för resan
        </p>
      </SlideFrame>

      <SlideFrame
        eyebrow="Linje 2 · obligatorisk utvecklingskärna"
        index={2}
        title="Sex komponentstationer — en sammanhängande loop"
      >
        <div className="absolute inset-x-[6%] bottom-[8%] top-[29%]">
          <div className="absolute left-[5%] right-[5%] top-[38%] h-[clamp(5px,0.7vw,10px)] rounded-full bg-cyan-700" />
          <div className="grid h-full grid-cols-6 items-center gap-2">
            {coreComponents.map(({ icon: Icon, label }, index) => (
              <div
                className="relative z-10 flex flex-col items-center text-center"
                key={label}
              >
                <div className="flex size-[clamp(2.4rem,5vw,4.4rem)] items-center justify-center rounded-2xl border-[clamp(3px,0.45vw,6px)] border-cyan-700 bg-white shadow-md dark:bg-slate-950">
                  <Icon
                    aria-hidden="true"
                    className="size-1/2 text-cyan-800 dark:text-cyan-200"
                  />
                </div>
                <p className="mt-2 max-w-[15ch] text-[clamp(0.43rem,0.78vw,0.68rem)] font-black">
                  {index + 1}. {label}
                </p>
              </div>
            ))}
          </div>
          <div className="absolute inset-x-[8%] bottom-[2%] flex justify-between text-[clamp(0.4rem,0.7vw,0.62rem)] font-bold text-slate-600 dark:text-slate-300">
            <span>skapa och styra</span>
            <span>använda och autentisera</span>
            <span>köra och lagra</span>
          </div>
        </div>
      </SlideFrame>

      <SlideFrame
        eyebrow="Linje 3 · kontrakt och tillägg"
        index={3}
        title="Kärnlinjen får grenar — aldrig topologizoner"
      >
        <div className="absolute inset-x-[5%] bottom-[7%] top-[28%]">
          <div className="absolute left-[2%] right-[2%] top-[42%] h-[clamp(5px,0.7vw,10px)] rounded-full bg-cyan-700" />
          <div className="absolute left-[35%] top-[12%] h-[30%] w-[clamp(4px,0.55vw,8px)] bg-violet-600" />
          <div className="absolute right-[22%] top-[45%] h-[35%] w-[clamp(4px,0.55vw,8px)] bg-amber-600" />
          <div className="absolute inset-x-0 top-[35%] grid grid-cols-6 gap-2">
            {coreComponents.map(({ icon: Icon, label }, index) => (
              <div
                className="relative z-10 flex flex-col items-center text-center"
                key={label}
              >
                <span className="flex size-[clamp(1.8rem,3.7vw,3.2rem)] items-center justify-center rounded-full border-[clamp(3px,0.45vw,6px)] border-cyan-700 bg-white dark:bg-slate-950">
                  <Icon aria-hidden="true" className="size-1/2" />
                </span>
                <span className="mt-1 max-w-[14ch] text-[clamp(0.35rem,0.62vw,0.54rem)] font-bold">
                  {index + 1}. {label}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute left-[17%] top-0 flex items-center gap-2 rounded-2xl border-2 border-violet-600 bg-violet-50 px-[2%] py-[1.5%] dark:bg-violet-950">
            <Network
              aria-hidden="true"
              className="size-[clamp(1rem,2vw,1.8rem)]"
            />
            <div>
              <p className="text-[clamp(0.44rem,0.8vw,0.7rem)] font-black">
                Villkorad gren
              </p>
              <p className="text-[clamp(0.35rem,0.6vw,0.52rem)]">
                HSA · AI-modell · extern MCP
              </p>
            </div>
          </div>
          <div className="absolute right-[4%] bottom-0 flex items-center gap-2 rounded-2xl border-2 border-amber-600 bg-amber-50 px-[2%] py-[1.5%] dark:bg-amber-950">
            <GitPullRequest
              aria-hidden="true"
              className="size-[clamp(1rem,2vw,1.8rem)]"
            />
            <div>
              <p className="text-[clamp(0.44rem,0.8vw,0.7rem)] font-black">
                Valideringsgren
              </p>
              <p className="text-[clamp(0.35rem,0.6vw,0.52rem)]">
                granskning · CI/CD
              </p>
            </div>
          </div>
          <div className="absolute bottom-[1%] left-[1%] max-w-[45%] text-[clamp(0.36rem,0.63vw,0.56rem)]">
            <p className="font-black">Linjetyper visar kontrakt</p>
            <p>
              Heldragen = kärna · streckad = funktionsvillkor · prickad = utökad
              validering
            </p>
          </div>
        </div>
      </SlideFrame>
    </div>
  )
}

function NumberedPanel({
  children,
  index,
  title,
}: {
  children: ReactNode
  index: number
  title: string
}) {
  return (
    <div className="relative border-l-[clamp(4px,0.6vw,8px)] border-cyan-700 bg-white p-[5%] shadow-sm dark:bg-slate-900">
      <span className="absolute right-[4%] top-[4%] text-[clamp(1.4rem,3vw,2.6rem)] font-black text-cyan-700/20">
        {index}
      </span>
      <h3 className="relative text-[clamp(0.52rem,1.05vw,0.9rem)] font-black">
        {title}
      </h3>
      <div className="relative mt-2 text-[clamp(0.4rem,0.7vw,0.62rem)] text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </div>
  )
}

export function VariantCFieldGuide() {
  return (
    <div className="space-y-8">
      <SlideFrame
        eyebrow="Fältguide · orientera först"
        index={1}
        title="En utvecklingsloop, fyra ansvarsfält"
      >
        <div className="absolute inset-x-[5%] bottom-[8%] top-[29%] grid grid-cols-4 gap-[2%]">
          <NumberedPanel index={1} title="Utveckla">
            <p>Källkod, konfiguration och lokala verktyg.</p>
            <Code2
              aria-hidden="true"
              className="mt-3 size-[clamp(1.4rem,3vw,2.8rem)] text-cyan-700"
            />
          </NumberedPanel>
          <NumberedPanel index={2} title="Köra">
            <p>Applikation, identitet och beständig data.</p>
            <Play
              aria-hidden="true"
              className="mt-3 size-[clamp(1.4rem,3vw,2.8rem)] text-cyan-700"
            />
          </NumberedPanel>
          <NumberedPanel index={3} title="Använda">
            <p>Webbläsare, inloggning och funktioner.</p>
            <Monitor
              aria-hidden="true"
              className="mt-3 size-[clamp(1.4rem,3vw,2.8rem)] text-cyan-700"
            />
          </NumberedPanel>
          <NumberedPanel index={4} title="Validera">
            <p>Tester, specifikation och evidens.</p>
            <ShieldCheck
              aria-hidden="true"
              className="mt-3 size-[clamp(1.4rem,3vw,2.8rem)] text-cyan-700"
            />
          </NumberedPanel>
        </div>
      </SlideFrame>

      <SlideFrame
        eyebrow="Fältguide · komponentblad"
        index={2}
        title="Kärnan ordnas efter ansvar — inte placering"
      >
        <div className="absolute inset-x-[5%] bottom-[8%] top-[28%] grid grid-cols-[1.1fr_1fr_1fr] gap-[2%]">
          <div className="grid grid-rows-2 gap-[4%] rounded-2xl bg-cyan-100 p-[5%] dark:bg-cyan-950/50">
            <NumberedPanel index={1} title="Skapa">
              <CoreChip compact {...coreComponents[0]} />
              <div className="mt-2">
                <CoreChip compact {...coreComponents[1]} />
              </div>
            </NumberedPanel>
            <div className="flex items-center gap-2 px-[4%] text-[clamp(0.4rem,0.7vw,0.62rem)] font-bold">
              <UserRound aria-hidden="true" className="size-[1.5em]" />{' '}
              Utvecklaren styr mål och beslut
            </div>
          </div>
          <div className="grid grid-rows-2 gap-[4%] rounded-2xl bg-sky-100 p-[5%] dark:bg-sky-950/50">
            <NumberedPanel index={2} title="Interagera">
              <CoreChip compact {...coreComponents[2]} />
              <div className="mt-2">
                <CoreChip compact {...coreComponents[5]} />
              </div>
            </NumberedPanel>
            <p className="px-[4%] text-[clamp(0.4rem,0.7vw,0.62rem)] font-bold">
              HTTP(S) och OIDC är kontrakt — inte platsangivelser
            </p>
          </div>
          <div className="grid grid-rows-2 gap-[4%] rounded-2xl bg-emerald-100 p-[5%] dark:bg-emerald-950/50">
            <NumberedPanel index={3} title="Köra och lagra">
              <CoreChip compact {...coreComponents[3]} />
              <div className="mt-2">
                <CoreChip compact {...coreComponents[4]} />
              </div>
            </NumberedPanel>
            <p className="px-[4%] text-[clamp(0.4rem,0.7vw,0.62rem)] font-bold">
              Runtime och schema binds av `DATABASE_URL`
            </p>
          </div>
        </div>
      </SlideFrame>

      <SlideFrame
        eyebrow="Fältguide · kontraktsmatris"
        index={3}
        title="Läs relationen i tre delar"
      >
        <div className="absolute inset-x-[4%] bottom-[7%] top-[28%] grid grid-cols-[1.35fr_0.9fr] gap-[3%]">
          <div className="overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-700">
            <div className="grid grid-cols-[1.2fr_1fr_1fr] bg-slate-900 px-[3%] py-[2%] text-[clamp(0.42rem,0.75vw,0.65rem)] font-black text-white">
              <span>Relation</span>
              <span>Tekniskt gränssnitt</span>
              <span>Konfigurationsankare</span>
            </div>
            {[
              [
                'Webbläsare ↔ runtime',
                'UI och REST via HTTP(S)',
                'Publik adress',
              ],
              [
                'Runtime ↔ identitet',
                'OIDC discovery, token, JWKS',
                'AUTH_OIDC_*',
              ],
              [
                'Runtime ↔ SQL Server',
                'Beständig data och schema',
                'DATABASE_URL',
              ],
              [
                'Agent ↔ arbetsyta',
                'Filer, kommandon och tester',
                'Repoinstruktioner + skills',
              ],
            ].map((row, index) => (
              <div
                className={`grid grid-cols-[1.2fr_1fr_1fr] gap-[2%] px-[3%] py-[2.5%] text-[clamp(0.36rem,0.67vw,0.58rem)] ${index % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'}`}
                key={row[0]}
              >
                <strong>{row[0]}</strong>
                <span>{row[1]}</span>
                <code>{row[2]}</code>
              </div>
            ))}
          </div>
          <div className="grid grid-rows-2 gap-[4%]">
            <div className="rounded-2xl border-2 border-dashed border-violet-600 bg-violet-50 p-[6%] dark:bg-violet-950/30">
              <h3 className="text-[clamp(0.48rem,0.9vw,0.78rem)] font-black">
                Funktionsspecifika beroenden
              </h3>
              <p className="mt-2 text-[clamp(0.36rem,0.67vw,0.58rem)]">
                HSA-personuppslag · AI-modelltjänst · extern MCP-klient
              </p>
            </div>
            <div className="rounded-2xl border-2 border-dotted border-amber-600 bg-amber-50 p-[6%] dark:bg-amber-950/30">
              <h3 className="text-[clamp(0.48rem,0.9vw,0.78rem)] font-black">
                Valideringstillägg
              </h3>
              <p className="mt-2 text-[clamp(0.36rem,0.67vw,0.58rem)]">
                Källkod och granskning · CI/CD-validering
              </p>
            </div>
          </div>
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
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-white/20 bg-slate-950 px-3 py-2 text-white shadow-2xl">
        <button
          aria-label="Föregående variant"
          className="flex size-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          onClick={() => selectOffset(-1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-40 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-400">
            Prototypvariant
          </p>
          <p className="font-bold">
            {definition.key} — {definition.name}
          </p>
        </div>
        <button
          aria-label="Nästa variant"
          className="flex size-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
      className="min-h-screen bg-slate-200 px-3 pb-32 pt-8 dark:bg-slate-900 sm:px-6 lg:px-10"
      {...devMarker({
        context: 'infographic prototype',
        name: 'topology-independent infographic series',
        priority: 100,
        value: current,
      })}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-black">PROTOTYP — ska kastas</p>
            <p className="text-sm">
              Bedöm hierarki, komposition, läsordning och legend. Inte slutlig
              illustration eller typografisk finish.
            </p>
          </div>
          <p className="text-sm font-bold">
            Tre bilder · 16:9 · svenska · variant {current}
          </p>
        </div>
        {current === 'A' ? <VariantAOrbit /> : null}
        {current === 'B' ? <VariantBTransit /> : null}
        {current === 'C' ? <VariantCFieldGuide /> : null}
      </div>
      <PrototypeSwitcher current={current} onSelect={selectVariant} />
    </main>
  )
}
