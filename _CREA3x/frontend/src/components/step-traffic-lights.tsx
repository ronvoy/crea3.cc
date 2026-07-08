import React from 'react'

export type StepStatus = 'done' | 'todo' | 'blocked'

export type Step = {
  key: string
  label: string
  status: StepStatus
  hint?: string
}

function dotClass(status: StepStatus) {
  if (status === 'done') return 'bg-emerald-500'
  if (status === 'todo') return 'bg-amber-400'
  return 'bg-rose-500'
}

export default function StepTrafficLights({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-wrap gap-3 items-center">
      {steps.map((s) => (
        <div key={s.key} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <span className={`h-3 w-3 rounded-full ${dotClass(s.status)}`} />
          <div className="text-sm text-slate-800">
            <span className="font-semibold">{s.label}</span>
            {s.hint ? <span className="text-slate-500"> · {s.hint}</span> : null}
          </div>
        </div>
      ))}
    </div>
  )
}
