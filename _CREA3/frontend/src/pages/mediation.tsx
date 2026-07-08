import React from 'react'

export default function Mediation() {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Mediation</h2>
      <p className="mt-2 text-sm text-slate-600">
        Select a mediator and propose a meeting slot. The mediator may confirm or suggest
        alternatives.
      </p>
      <div className="my-5 h-px w-full bg-slate-200" />
      <p className="text-sm text-slate-700">
        You can also access mediation from the video-conferencing icon in the chatbot panel.
      </p>
    </div>
  )
}
