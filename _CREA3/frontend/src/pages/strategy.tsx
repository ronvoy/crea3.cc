import React from 'react'

export default function Strategy() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Strategy &amp; Evaluation</h2>
      <p className="mt-2 text-sm text-slate-600">
        The game-theoretical strategy module becomes available once all parties have completed their
        preferences and the dispute has entered the evaluation phase.
      </p>
      <div className="my-4 h-px bg-slate-200" />
      <p className="text-sm text-slate-700">
        Please open a specific dispute from <strong>My Disputes</strong> to review recorded
        preferences, run the evaluation step, and generate proposals when the eligibility criteria
        are satisfied.
      </p>
    </div>
  )
}
