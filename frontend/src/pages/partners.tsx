import React from 'react'
import { Card, CardHeader } from '../components/ui'

const partners = [
  "Università degli Studi di Napoli Federico II",
  "Vrije Universiteit Brussel (VUB)",
  "University of Zagreb – Faculty of Law",
  "Vilnius University",
  "Università degli Studi Suor Orsola Benincasa",
  "TalTech – Tallinn University of Technology",
  "Adiconsum – Associazione Difesa Consumatori e Ambiente",
  "FBE – Federation des Barreaux d'Europe",
  "University of Ljubljana",
]

export default function Partners() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader
          title="Partners"
          subtitle="CREA3 is developed with a network of European academic and professional partners."
        />
        <div className="p-4 space-y-4">
          <img
            src="/partners.png"
            alt="CREA3 partners"
            className="w-full rounded-2xl border border-slate-200 bg-white"
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Institutions</div>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
              {partners.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </div>

          <div className="text-sm text-slate-700 leading-relaxed">
            CREA3 improves the existing CREA platform and is designed for international legal, academic, and consumer-protection projects.
            The project involves a wide range of EU stakeholders, including lawyers, notaries, mediators, consumer associations, academics,
            students, legal tech companies, and policymakers.
          </div>
        </div>
      </Card>
    </div>
  )
}
