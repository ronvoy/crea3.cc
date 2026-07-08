import React, { useMemo, useState } from 'react'
import { Card, CardHeader, Input } from '../components/ui'
import { useI18n } from '../i18n'

type QA = { q: string; a: string }
type Category = { title: string; items: QA[] }

const CONTENT: Record<'en' | 'it', { intro: string; searchPlaceholder: string; empty: string; categories: Category[] }> = {
  en: {
    intro: 'Answers to common questions about accounts, running a dispute, and the platform.',
    searchPlaceholder: 'Search the FAQs…',
    empty: 'No questions match your search.',
    categories: [
      {
        title: 'Getting started',
        items: [
          { q: 'How do I create an account?', a: 'Open “Register”, enter your email and a password, and submit. Registration and identity are handled by our secure sign-in service (Keycloak).' },
          { q: 'How do I verify my email?', a: 'After registering you receive a verification email. Open the link it contains to activate your account. Verification is mandatory before you can sign in.' },
          { q: 'I didn’t receive the verification email — what now?', a: 'Check your spam folder first. If it still hasn’t arrived after a few minutes, try signing in: the platform will offer to resend the verification message.' },
          { q: 'Why do I see “401 Unauthorized”?', a: 'Your session has expired or you are not signed in. Sign in again; if it persists, sign out fully and sign back in to refresh your session.' },
        ],
      },
      {
        title: 'Running a dispute',
        items: [
          { q: 'How do I start a dispute?', a: 'From “My disputes”, create a new dispute, give it a title, then define the items in scope and record your baseline valuations.' },
          { q: 'Who can invite the other parties?', a: 'Only the dispute creator can invite parties. Any party may invite a mediator. Invitations are sent by email and can be accepted from the notifications area.' },
          { q: 'What are “goods” and “preferences”?', a: 'Goods are the items being divided or negotiated. Preferences are each party’s per-item star ratings, which capture priorities and acceptable ranges.' },
          { q: 'How is the proposal generated?', a: 'Once parties are ready, a game-theoretic engine combines everyone’s preferences into a balanced, evidence-based proposal that you can review side by side.' },
          { q: 'What happens if we don’t accept the proposal?', a: 'Any party may decline. The case can then move to structured mediation, where a mediator coordinates and you can meet over built-in video.' },
          { q: 'Can I export the outcome?', a: 'Yes. Each dispute can produce a PDF report of the proposal and a CSV audit trail of the actions taken, for your records.' },
        ],
      },
      {
        title: 'The assistant',
        items: [
          { q: 'What can the in-dispute assistant do?', a: 'It explains terms (“What is mediation?”), suggests next steps, and clarifies outputs (“Explain the proposal in simple terms”). It runs locally via Ollama.' },
          { q: 'Is the assistant the same as the Legal AI page?', a: 'No. The in-dispute assistant helps you operate the platform. For legal questions, use the dedicated Legal AI Assistant page.' },
          { q: 'Are my chat messages stored?', a: 'Assistant messages are kept in your browser for the current dispute, so you can return to them. They are not shared with other parties.' },
        ],
      },
      {
        title: 'Account, language & privacy',
        items: [
          { q: 'How do I change my password or email?', a: 'Open “Account” from the menu. You can update your email and change your password there.' },
          { q: 'Can I change the interface language?', a: 'Yes — use the language selector. The interface is available in the consortium’s seven working languages, and switching does not end your session.' },
          { q: 'How do I delete my data or account?', a: 'In “Account” you can delete the dispute data you created, or permanently delete your whole account and its related data.' },
          { q: 'Is the platform accessible?', a: 'Yes. It targets WCAG AA, is fully keyboard-navigable, and offers high-contrast and reduced-motion options in settings.' },
        ],
      },
    ],
  },
  it: {
    intro: 'Risposte alle domande più frequenti su account, gestione di una controversia e piattaforma.',
    searchPlaceholder: 'Cerca nelle FAQ…',
    empty: 'Nessuna domanda corrisponde alla ricerca.',
    categories: [
      {
        title: 'Per iniziare',
        items: [
          { q: 'Come creo un account?', a: 'Apri “Registrati”, inserisci email e password e conferma. Registrazione e identità sono gestite dal nostro servizio di accesso sicuro (Keycloak).' },
          { q: 'Come verifico la mia email?', a: 'Dopo la registrazione ricevi un’email di verifica. Apri il link che contiene per attivare l’account. La verifica è obbligatoria prima dell’accesso.' },
          { q: 'Non ho ricevuto l’email di verifica: cosa faccio?', a: 'Controlla prima la cartella spam. Se dopo qualche minuto non è arrivata, prova ad accedere: la piattaforma proporrà di reinviare il messaggio di verifica.' },
          { q: 'Perché vedo “401 Unauthorized”?', a: 'La sessione è scaduta o non hai effettuato l’accesso. Accedi di nuovo; se persiste, esci completamente e rientra per aggiornare la sessione.' },
        ],
      },
      {
        title: 'Gestire una controversia',
        items: [
          { q: 'Come avvio una controversia?', a: 'Da “Le mie controversie” crea una nuova controversia, assegna un titolo, poi definisci i beni in ambito e registra le valutazioni iniziali.' },
          { q: 'Chi può invitare le altre parti?', a: 'Solo il creatore della controversia può invitare le parti. Ogni parte può invitare un mediatore. Gli inviti arrivano via email e si accettano dalle notifiche.' },
          { q: 'Cosa sono “beni” e “preferenze”?', a: 'I beni sono gli elementi da dividere o negoziare. Le preferenze sono le valutazioni a stelle di ciascuna parte per ogni bene, che esprimono priorità e margini accettabili.' },
          { q: 'Come viene generata la proposta?', a: 'Quando le parti sono pronte, un motore di teoria dei giochi combina le preferenze in una proposta equilibrata e basata sui dati, da confrontare punto per punto.' },
          { q: 'Cosa succede se non accettiamo la proposta?', a: 'Ogni parte può rifiutare. Il caso può passare alla mediazione strutturata, dove un mediatore coordina e ci si può incontrare in videoconferenza integrata.' },
          { q: 'Posso esportare l’esito?', a: 'Sì. Ogni controversia può produrre un report PDF della proposta e un tracciato CSV delle azioni svolte, per i tuoi archivi.' },
        ],
      },
      {
        title: 'L’assistente',
        items: [
          { q: 'Cosa può fare l’assistente nella controversia?', a: 'Spiega i termini (“Cos’è la mediazione?”), suggerisce i passi successivi e chiarisce gli esiti (“Spiega la proposta in modo semplice”). Funziona localmente tramite Ollama.' },
          { q: 'È lo stesso dell’Assistente AI Legale?', a: 'No. L’assistente nella controversia ti aiuta a usare la piattaforma. Per domande legali usa la pagina dedicata Assistente AI Legale.' },
          { q: 'I miei messaggi vengono salvati?', a: 'I messaggi dell’assistente restano nel tuo browser per la controversia corrente, così puoi riprenderli. Non sono condivisi con le altre parti.' },
        ],
      },
      {
        title: 'Account, lingua e privacy',
        items: [
          { q: 'Come cambio password o email?', a: 'Apri “Account” dal menu: lì puoi aggiornare l’email e modificare la password.' },
          { q: 'Posso cambiare la lingua dell’interfaccia?', a: 'Sì, usa il selettore della lingua. L’interfaccia è disponibile nelle sette lingue di lavoro del consorzio e il cambio non interrompe la sessione.' },
          { q: 'Come elimino i miei dati o l’account?', a: 'In “Account” puoi eliminare i dati delle controversie che hai creato, oppure cancellare definitivamente l’intero account e i dati collegati.' },
          { q: 'La piattaforma è accessibile?', a: 'Sì. Punta al livello WCAG AA, è completamente navigabile da tastiera e offre opzioni di alto contrasto e riduzione del movimento nelle impostazioni.' },
        ],
      },
    ],
  },
}

export default function FAQ() {
  const { lang } = useI18n()
  const c = CONTENT[lang === 'it' ? 'it' : 'en']
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return c.categories
    return c.categories
      .map((cat) => ({ ...cat, items: cat.items.filter((it) => (it.q + ' ' + it.a).toLowerCase().includes(q)) }))
      .filter((cat) => cat.items.length > 0)
  }, [c.categories, query])

  const hasResults = filtered.some((cat) => cat.items.length > 0)

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={lang === 'it' ? 'Domande frequenti' : 'FAQs'} subtitle={c.intro} />
        <div className="p-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={c.searchPlaceholder} aria-label={c.searchPlaceholder} />
        </div>
      </Card>

      {!hasResults ? (
        <Card>
          <div className="p-6 text-sm text-slate-600">{c.empty}</div>
        </Card>
      ) : (
        filtered.map((cat) => (
          <Card key={cat.title}>
            <div className="border-b border-slate-200/60 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {cat.title}
            </div>
            <div className="divide-y divide-slate-100">
              {cat.items.map((it) => {
                const id = cat.title + '::' + it.q
                const isOpen = open === id
                return (
                  <div key={id}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span className="font-medium text-slate-900">{it.q}</span>
                      <span className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden>
                        ⌄
                      </span>
                    </button>
                    {isOpen ? <div className="px-5 pb-4 text-sm leading-relaxed text-slate-600">{it.a}</div> : null}
                  </div>
                )
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  )
}
