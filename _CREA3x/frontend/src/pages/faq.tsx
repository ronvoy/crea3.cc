import React, { useMemo, useState } from 'react'
import { Card, CardHeader, Input } from '../components/ui'
import { useI18n } from '../i18n'

type QA = { q: string; a: string }
type Category = { title: string; items: QA[] }

// Category → number of Q&A pairs. Keys follow faqCat{c}Q{n} / faqCat{c}A{n}.
const CAT_SIZES = [4, 6, 3, 4]

export default function FAQ() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const categories: Category[] = CAT_SIZES.map((size, ci) => ({
    title: t(`faqCat${ci + 1}Title` as any),
    items: Array.from({ length: size }, (_, i) => ({
      q: t(`faqCat${ci + 1}Q${i + 1}` as any),
      a: t(`faqCat${ci + 1}A${i + 1}` as any),
    })),
  }))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map((cat) => ({ ...cat, items: cat.items.filter((it) => (it.q + ' ' + it.a).toLowerCase().includes(q)) }))
      .filter((cat) => cat.items.length > 0)
  }, [categories, query])

  const hasResults = filtered.some((cat) => cat.items.length > 0)

  return (
    <div className="grid gap-4">
      <Card>
        <div className="p-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('faqSearchPlaceholder')} aria-label={t('faqSearchPlaceholder')} />
        </div>
      </Card>

      {!hasResults ? (
        <Card>
          <div className="p-6 text-sm text-slate-600">{t('faqEmpty')}</div>
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
