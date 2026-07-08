import React from 'react'
import { Box, Paper } from '@mui/material'
import { Card, CardHeader } from '../components/ui'

type FAQ = { q: string; a: React.ReactNode }

const faqs: FAQ[] = [
  {
    q: 'What is a dispute?',
    a: (
      <p>
        A dispute on CREA3 is a structured legal procedure to resolve conflicts over division.
        The platform guides users with AI tools and game-theoretical algorithms to help all parties reach a fair, efficient and tailored resolution.
      </p>
    ),
  },
  {
    q: 'What are the resolution methods “Bids” and “Rates”?',
    a: (
      <ul className="list-disc pl-5">
        <li><b>Bids method</b> — users distribute virtual money across goods to reflect preferences.</li>
        <li><b>Rates method</b> — users rate each good on a 1–5 scale to show importance.</li>
      </ul>
    ),
  },
  {
    q: 'How do I invite agents to join a dispute?',
    a: (
      <ol className="list-decimal pl-5">
        <li>Open your dispute and go to the <b>Agents</b> section.</li>
        <li>Click <b>Add New Agent</b>.</li>
        <li>Fill in name, email, share of entitlement, and an optional role (agent / mediator).</li>
        <li>Submit to add them. They will receive an in-app notification when they log in.</li>
      </ol>
    ),
  },
  {
    q: 'How can I add goods to a dispute?',
    a: (
      <ol className="list-decimal pl-5">
        <li>During setup, navigate to the <b>Goods</b> section.</li>
        <li>Click <b>Add New Good</b>.</li>
        <li>Enter the good’s name and estimated value, and optionally mark it as indivisible.</li>
        <li>Submit to include the good in the dispute.</li>
      </ol>
    ),
  },
  {
    q: 'What are agent preferences?',
    a: (
      <p>
        Agent preferences reflect how each agent values the goods in the dispute.
        They are input using either the Bids or Rates method selected during dispute setup.
      </p>
    ),
  },
  {
    q: 'How does CREA3 provide a solution to my dispute?',
    a: (
      <p>
        CREA3 uses agents’ preferences and applies AI and game-theoretical algorithms to generate an allocation that aims to fairly satisfy all parties.
        Parties can accept or decline the proposed solution. If declined, mediation (with videoconference scheduling) is available.
      </p>
    ),
  },
  {
    q: 'What happens once all agents agree on the proposed solution?',
    a: (
      <p>
        When all parties accept the solution, CREA3 finalizes the case.
        A downloadable report is generated as certified proof of resolution, designed for future smart-contract / blockchain-backed certification workflows.
      </p>
    ),
  },
  {
    q: 'What is the CREA2 European project?',
    a: (
      <div className="space-y-2">
        <p>
          CREA2 builds on CREA (2017–19) and introduces AI-driven tools to assist users in resolving disputes through innovative game-theoretical algorithms.
          It also supports a smart conversational interface, smart-contract certification design, and videoconferencing for mediation.
        </p>
        <p>
          Read the full project scope on the <a className="text-blue-700 hover:underline" href="/scope">Scope</a> page.
        </p>
      </div>
    ),
  },
]

function FAQItem({ item }: { item: FAQ }) {
  // MUI Paper + theme colors so the card follows light/dark mode (the old
  // Tailwind bg-white/70 stayed light-grey in dark mode).
  return (
    <Paper variant="outlined" component="details" sx={{ borderRadius: 3, p: 2 }}>
      <Box
        component="summary"
        sx={{ cursor: 'pointer', fontWeight: 700, color: 'text.primary', listStyle: 'none' }}
      >
        {item.q}
      </Box>
      <Box sx={{ mt: 1.5, color: 'text.secondary', fontSize: 14, lineHeight: 1.7 }}>{item.a}</Box>
    </Paper>
  )
}

export default function Help() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Help & FAQ" subtitle="Quick answers and guidance for dispute creation, preferences and resolution." />
        <div className="p-4 grid gap-3">
          {faqs.map((f, i) => <FAQItem key={i} item={f} />)}
        </div>
      </Card>
    </div>
  )
}
