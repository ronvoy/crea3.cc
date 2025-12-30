import React from 'react'
import { Card, CardHeader } from '../components/ui'

export default function Partners() {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Partners" subtitle="CREA2 is developed with a network of European academic and professional partners." />
        <div className="p-4 space-y-4">
          <img
            src="/partners.png"
            alt="CREA2 partners"
            className="w-full rounded-2xl border border-slate-200 bg-white"
          />
          <div className="text-sm text-slate-700 leading-relaxed">
            CREA2 will improve the existing CREA platform. The software will be distributed as an open-source project.
            The project will involve – as main target groups – a wide range of EU stakeholders, including over 150 lawyers,
            30 notaries, 50 mediators, 5 consumer associations, 100 academics, 300 students, 5 legal tech companies, 5 policymakers.
          </div>
        </div>
      </Card>
    </div>
  )
}
