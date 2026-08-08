import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '../components/ui'
import { useI18n } from '../i18n'

type QA = { q: string; a: string[] }

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
  const { t } = useI18n()
  // 7 Q&A entries; answers store paragraphs joined with a blank line.
  const items: QA[] = Array.from({ length: 7 }, (_, i) => ({
    q: t(`helpQ${i + 1}` as any),
    a: t(`helpA${i + 1}` as any).split('\n\n'),
  }))
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t('helpTitle')} subtitle={t('helpSubtitle')} />
        <div className="grid gap-3 p-4">
          {items.map((f, i) => <FAQItem key={i} item={f} />)}
        </div>
      </Card>
    </div>
  )
}
