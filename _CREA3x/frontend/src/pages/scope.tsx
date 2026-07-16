import React from 'react'
import { useI18n } from '../i18n'

const stroke = (d: string, cls = 'h-6 w-6') => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const SCALE = 'M12 3v18M5 7h14M7 7l-3 6a3 3 0 006 0L7 7zM17 7l-3 6a3 3 0 006 0l-3-6z'
const CHAT = 'M7.5 8h9M7.5 12h6M21 12a8 8 0 01-8 8H5l-2 2V12a8 8 0 018-8h0a8 8 0 018 8z'
const LAYERS = 'M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4'
const VIDEO = 'M3 6h12v12H3zM15 10l6-3v10l-6-3'
const DOC = 'M7 3h7l5 5v13H7zM14 3v5h5'
const USERS = 'M9 11a3 3 0 100-6 3 3 0 000 6zM2 20a7 7 0 0114 0M17 11a3 3 0 10-1-5.8M22 20a7 7 0 00-5-6.7'
const CAP = 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c0 1.5 3 2.5 6 2.5s6-1 6-2.5v-5'
const BOOK = 'M4 19V6a2 2 0 012-2h12v15H6a2 2 0 00-2 2zM4 19a2 2 0 002 2h12'
const BUILDING = 'M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M8 8h2M8 12h2M8 16h2M16 21V9h3v12'
const LANDMARK = 'M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M3 10l9-6 9 6'

const WP_ICONS = [SCALE, CHAT, LAYERS]
const STAT_ICONS = [SCALE, DOC, CHAT, USERS, CAP, BOOK, BUILDING, LANDMARK]

type Content = {
  kicker: string
  title: string
  tagline: string
  chips: string[]
  intro: string[]
  ecgarTitle: string
  ecgarText: string
  wpHeading: string
  wps: { tag: string; title: string; body: string }[]
  videoNote: string
  audienceHeading: string
  audienceNote: string
  stats: { n: string; label: string }[]
  closing: string
}

const EN: Content = {
  kicker: 'Project scope',
  title: 'CREA3 — Conflict Resolution with Equitative Algorithms',
  tagline: 'AI-assisted, game-theoretical online dispute resolution for Europe.',
  chips: ['Builds on CREA & CREA2', 'EU JUST Programme', 'Open source'],
  intro: [
    'CREA3 brings AI-driven tools and game-theoretical algorithms to civil dispute resolution. It guides people step by step toward a fair, efficient and tailored outcome, helping them find the information they need along the way.',
    'In parallel, it tackles the differences between the national legal systems of the EU Member States so that cross-border disputes can be handled on common ground.',
  ],
  ecgarTitle: 'European Common Ground of Available Rights (ECGAR)',
  ecgarText:
    'The mandatory rules of each Member State are set aside and the procedure operates on the remaining “available rights”. The goal is to widen access to Online Dispute Resolution (ODR) and reduce structural barriers to justice.',
  wpHeading: 'Three innovations',
  wps: [
    { tag: 'WP2', title: 'Law & AI standards', body: 'Links the ECGAR to the game-theoretical model to set precise standards for integrating law and AI.' },
    { tag: 'WP3', title: 'Smart conversational interface', body: 'Machine-learning tools power an assistant that guides practitioners, legal professionals and ordinary users through the whole procedure.' },
    { tag: 'WP4', title: 'Blockchain certification', body: 'Smart-contract technology, built with a DApp design methodology, certifies the agreement reached between the parties.' },
  ],
  videoNote: 'A built-in videoconferencing function lets the mediator meet both parties inside the platform (WP3).',
  audienceHeading: 'Who it is for',
  audienceNote: 'CREA3 improves the existing CREA platform and is released as open source, for a broad range of EU stakeholders.',
  stats: [
    { n: '150+', label: 'Lawyers' },
    { n: '30', label: 'Notaries' },
    { n: '50', label: 'Mediators' },
    { n: '5', label: 'Consumer associations' },
    { n: '100', label: 'Academics' },
    { n: '300', label: 'Students' },
    { n: '5', label: 'Legal-tech companies' },
    { n: '5', label: 'Policymakers' },
  ],
  closing: 'Open-source software, distributed for reuse across the European justice community.',
}

const IT: Content = {
  kicker: 'Ambito del progetto',
  title: 'CREA3 — Conflict Resolution with Equitative Algorithms',
  tagline: 'Risoluzione delle controversie online assistita dall’IA e basata sulla teoria dei giochi, per l’Europa.',
  chips: ['Si basa su CREA e CREA2', 'Programma UE JUST', 'Open source'],
  intro: [
    'CREA3 porta strumenti basati sull’IA e algoritmi di teoria dei giochi nella risoluzione delle controversie civili. Guida le persone passo dopo passo verso un esito equo, efficiente e su misura, aiutandole a trovare le informazioni necessarie lungo il percorso.',
    'In parallelo affronta le differenze tra i sistemi giuridici nazionali degli Stati membri dell’UE, così che le controversie transfrontaliere possano essere trattate su un terreno comune.',
  ],
  ecgarTitle: 'Terreno Comune Europeo dei Diritti Disponibili (ECGAR)',
  ecgarText:
    'Le norme imperative di ciascuno Stato membro vengono messe da parte e la procedura opera sui restanti “diritti disponibili”. L’obiettivo è ampliare l’accesso alla Risoluzione delle Controversie Online (ODR) e ridurre le barriere strutturali alla giustizia.',
  wpHeading: 'Tre innovazioni',
  wps: [
    { tag: 'WP2', title: 'Standard tra diritto e IA', body: 'Collega l’ECGAR al modello di teoria dei giochi per definire standard precisi di integrazione tra diritto e IA.' },
    { tag: 'WP3', title: 'Interfaccia conversazionale intelligente', body: 'Strumenti di apprendimento automatico alimentano un assistente che guida professionisti, operatori del diritto e utenti comuni lungo l’intera procedura.' },
    { tag: 'WP4', title: 'Certificazione blockchain', body: 'La tecnologia smart-contract, realizzata con una metodologia di progettazione DApp, certifica l’accordo raggiunto tra le parti.' },
  ],
  videoNote: 'Una funzione di videoconferenza integrata consente al mediatore di incontrare entrambe le parti all’interno della piattaforma (WP3).',
  audienceHeading: 'A chi si rivolge',
  audienceNote: 'CREA3 migliora la piattaforma CREA esistente ed è rilasciata come open source, per un’ampia gamma di portatori di interesse dell’UE.',
  stats: [
    { n: '150+', label: 'Avvocati' },
    { n: '30', label: 'Notai' },
    { n: '50', label: 'Mediatori' },
    { n: '5', label: 'Associazioni di consumatori' },
    { n: '100', label: 'Accademici' },
    { n: '300', label: 'Studenti' },
    { n: '5', label: 'Aziende legal-tech' },
    { n: '5', label: 'Responsabili politici' },
  ],
  closing: 'Software open source, distribuito per il riuso nella comunità europea della giustizia.',
}

export default function Scope() {
  const { lang } = useI18n()
  const c = lang === 'it' ? IT : EN

  return (
    <div className="grid gap-4">
      {/* Header */}
      <section className="wf-hero relative overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-blue-600 to-indigo-700 p-7 text-white shadow-sm md:p-10">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/80">{c.kicker}</div>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">{c.title}</h1>
          <p className="mt-3 max-w-2xl text-white/85">{c.tagline}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {c.chips.map((chip) => (
              <span key={chip} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Intro + ECGAR */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 shadow-sm">
          <div className="space-y-3 text-sm leading-relaxed text-slate-700">
            {c.intro.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
        <div className="rounded-[24px] border border-blue-200 bg-blue-50/70 p-6 shadow-sm">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-700">{stroke(SCALE, 'h-5 w-5')}</div>
          <div className="mt-3 font-semibold text-slate-900">{c.ecgarTitle}</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{c.ecgarText}</p>
        </div>
      </section>

      {/* Three innovations */}
      <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-slate-900">{c.wpHeading}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {c.wps.map((wp, i) => (
            <div key={wp.tag} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  {stroke(WP_ICONS[i])}
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{wp.tag}</span>
              </div>
              <div className="mt-3 font-semibold text-slate-900">{wp.title}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{wp.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">{stroke(VIDEO, 'h-5 w-5')}</div>
          <p className="text-sm text-slate-700">{c.videoNote}</p>
        </div>
      </section>

      {/* Audience */}
      <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-6 shadow-sm md:p-8">
        <h2 className="text-lg font-semibold text-slate-900">{c.audienceHeading}</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{c.audienceNote}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {c.stats.map((s, i) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
              <div className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                {stroke(STAT_ICONS[i], 'h-5 w-5')}
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{s.n}</div>
              <div className="text-xs text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-500">{c.closing}</p>
      </section>
    </div>
  )
}
