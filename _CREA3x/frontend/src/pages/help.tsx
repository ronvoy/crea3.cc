import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui'
import { useI18n } from '../i18n'

type QA = { q: string; a: string[] }

const EN: { title: string; subtitle: string; items: QA[] } = {
  title: 'Help & FAQ',
  subtitle: 'Quick answers and guidance for creating a dispute, setting preferences, and reaching a resolution.',
  items: [
    { q: 'What is a dispute?', a: [
      'A dispute on CREA3 is a structured procedure for resolving a conflict over how to divide goods. The platform guides every party with AI tools and game-theoretical algorithms toward a fair, efficient, tailored resolution.',
    ]},
    { q: 'How do parties express their preferences?', a: [
      'Each party rates every good on a 1–5 star scale to show how important it is to them. These ratings, together with each party’s entitlement share, feed the evaluation that produces the proposal.',
    ]},
    { q: 'How do I invite participants to a dispute?', a: [
      '1. Open your dispute and go to the Participants step.',
      '2. Add a participant by email, with their share of entitlement and an optional role (party or mediator).',
      '3. They receive an email invitation and an in-app notification, and can accept from the notifications area.',
    ]},
    { q: 'How do I add goods to a dispute?', a: [
      '1. During setup, open the Goods step.',
      '2. Add each good with a name and estimated value; optionally mark it as indivisible.',
      '3. Submit to include it in the case.',
    ]},
    { q: 'How does CREA3 produce a solution?', a: [
      'CREA3 combines the parties’ ratings and entitlement shares and applies AI and game-theoretical algorithms to generate an allocation that aims to satisfy everyone fairly.',
      'Parties can accept or decline the proposal. If it is declined, structured mediation — with video-conference scheduling — is available.',
    ]},
    { q: 'What happens once everyone accepts the proposal?', a: [
      'When all parties accept, CREA3 finalises the case and generates a downloadable report as certified proof of the resolution, designed for future smart-contract / blockchain certification workflows.',
    ]},
    { q: 'What is the CREA3 European project?', a: [
      'CREA3 builds on CREA (2017–19) and CREA2, introducing AI-driven tools that help users resolve disputes through innovative game-theoretical algorithms, a smart conversational interface, smart-contract certification design, and video-conferencing for mediation.',
      'You can read the full project scope on the Scope page.',
    ]},
  ],
}

const IT: { title: string; subtitle: string; items: QA[] } = {
  title: 'Aiuto e FAQ',
  subtitle: 'Risposte rapide e indicazioni per creare una controversia, impostare le preferenze e raggiungere una soluzione.',
  items: [
    { q: 'Che cos’è una controversia?', a: [
      'Una controversia su CREA3 è una procedura strutturata per risolvere un conflitto sulla divisione di beni. La piattaforma guida ogni parte con strumenti di IA e algoritmi di teoria dei giochi verso una soluzione equa, efficiente e su misura.',
    ]},
    { q: 'Come esprimono le parti le proprie preferenze?', a: [
      'Ogni parte valuta ciascun bene su una scala da 1 a 5 stelle per indicarne l’importanza. Queste valutazioni, insieme alla quota di spettanza di ciascuna parte, alimentano la valutazione che produce la proposta.',
    ]},
    { q: 'Come invito i partecipanti a una controversia?', a: [
      '1. Apri la controversia e vai al passo Partecipanti.',
      '2. Aggiungi un partecipante via email, con la sua quota di spettanza e un ruolo opzionale (parte o mediatore).',
      '3. Riceve un invito via email e una notifica in-app e può accettare dall’area notifiche.',
    ]},
    { q: 'Come aggiungo i beni a una controversia?', a: [
      '1. Durante l’impostazione, apri il passo Beni.',
      '2. Aggiungi ogni bene con un nome e un valore stimato; se vuoi, contrassegnalo come indivisibile.',
      '3. Conferma per includerlo nel caso.',
    ]},
    { q: 'Come produce una soluzione CREA3?', a: [
      'CREA3 combina le valutazioni delle parti e le quote di spettanza e applica IA e algoritmi di teoria dei giochi per generare un’allocazione che mira a soddisfare equamente tutti.',
      'Le parti possono accettare o rifiutare la proposta. In caso di rifiuto è disponibile la mediazione strutturata, con pianificazione della videoconferenza.',
    ]},
    { q: 'Cosa succede quando tutti accettano la proposta?', a: [
      'Quando tutte le parti accettano, CREA3 finalizza il caso e genera un report scaricabile come prova certificata della soluzione, pensato per futuri flussi di certificazione con smart-contract / blockchain.',
    ]},
    { q: 'Che cos’è il progetto europeo CREA3?', a: [
      'CREA3 si basa su CREA (2017–19) e CREA2, introducendo strumenti basati sull’IA che aiutano gli utenti a risolvere le controversie tramite innovativi algoritmi di teoria dei giochi, un’interfaccia conversazionale intelligente, la progettazione della certificazione con smart-contract e la videoconferenza per la mediazione.',
      'Puoi leggere l’ambito completo del progetto nella pagina Ambito del progetto.',
    ]},
  ],
}

function FAQItem({ item }: { item: QA }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 text-left">
        <span className="font-semibold text-slate-900">{item.q}</span>
        <span className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>⌄</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
          {item.a.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      ) : null}
    </div>
  )
}

export default function Help() {
  const { lang } = useI18n()
  const c = lang === 'it' ? IT : EN
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={c.title} subtitle={c.subtitle} />
        <div className="grid gap-3 p-4">
          {c.items.map((f, i) => <FAQItem key={i} item={f} />)}
        </div>
      </Card>
    </div>
  )
}
