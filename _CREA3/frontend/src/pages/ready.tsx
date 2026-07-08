import React from 'react'

export default function Ready() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Initialization Status</h2>
      <p className="mt-2 text-sm text-slate-600">
        Parties may edit agents, goods, and preferences until the dispute enters evaluation and
        the initialization procedure ends.
      </p>
      <div className="my-4 h-px w-full bg-slate-200" />
      <p className="text-sm text-slate-700">
        Use <strong>My Disputes</strong> to open a dispute and verify whether all invited parties
        have accessed the case and provided their preferences.
      </p>
    </div>
  )
}
