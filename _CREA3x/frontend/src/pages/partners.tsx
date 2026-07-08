import React from 'react'
import { Pill } from '../components/ui'
import EuropeMap from '../components/europe-map'
import { PINS } from '../data/europe-map'
import { useI18n } from '../i18n'

type Institution = {
  name: string
  short: string
  type: string
  url: string
  city: string
  country: string
  lead: boolean
}

// Single source of truth: derive the institution directory from the map data
// so the list and the map can never drift apart.
const INSTITUTIONS: Institution[] = PINS.flatMap((p) =>
  p.members.map((m) => ({ ...m, city: p.city, country: p.country, lead: p.lead })),
).sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name))

const CITY_COUNT = new Set(PINS.map((p) => p.city)).size
const COUNTRY_COUNT = new Set(PINS.map((p) => p.country)).size

export default function Partners() {
  const { t, lang } = useI18n()
  const it = lang === 'it'
  return (
    <div className="grid gap-6">
      {/* Intro + interactive map */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/55 shadow-2xl backdrop-blur">
        <div className="relative grid gap-8 p-6 text-white md:p-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="lg:self-center">
            <Pill className="border-sky-400/30 bg-sky-500/15 text-sky-200">{t('landingPartnersKicker')}</Pill>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{t('landingPartnersTitle')}</h1>
            <p className="mt-3 max-w-md text-white/75">
              {it
                ? `CREA3 è realizzata da una rete europea di sette università, una federazione forense continentale e un'associazione di consumatori, attiva in ${CITY_COUNT} città di ${COUNTRY_COUNT} Paesi.`
                : `CREA3 is built by a European network of seven universities, a continental bar federation, and a consumers' association — working together across ${CITY_COUNT} cities in ${COUNTRY_COUNT} countries.`}
            </p>
            <p className="mt-3 max-w-md text-sm text-white/55">
              {it
                ? 'Passa sopra, tocca o seleziona un segnaposto sulla mappa per vedere l\'istituzione di ciascuna città.'
                : 'Hover, tap, or focus a marker on the map to see the institution based in each city.'}
            </p>

            {/* Static logo wall */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/90 p-4 shadow-inner">
              <img
                src="/partners.png"
                alt="Logos of the CREA3 partner institutions"
                className="mx-auto h-auto w-full max-w-md object-contain"
                loading="lazy"
              />
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <EuropeMap />
          </div>
        </div>
      </section>

      {/* Institution directory */}
      <section aria-label={it ? "Istituzioni partner" : "Partner institutions"} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {INSTITUTIONS.map((inst) => (
          <a
            key={inst.name}
            href={inst.url}
            target="_blank"
            rel="noreferrer"
            className="group flex flex-col rounded-2xl border border-white/10 bg-white/5 p-4 text-white backdrop-blur transition hover:border-white/25 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/55">
                {inst.city}, {inst.country}
              </span>
              {inst.lead ? (
                <span className="ml-auto rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-400/30">
                  {it ? 'Coordinatore' : 'Coordinator'}
                </span>
              ) : null}
            </div>

            <div className="mt-1 font-medium leading-snug">{inst.name}</div>

            <div className="mt-auto flex items-center justify-between pt-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/70">
                {inst.type}
              </span>
              <span className="text-xs text-sky-300 opacity-0 transition group-hover:opacity-100">
                {it ? 'Visita il sito ↗' : 'Visit site ↗'}
              </span>
            </div>
          </a>
        ))}
      </section>
    </div>
  )
}
