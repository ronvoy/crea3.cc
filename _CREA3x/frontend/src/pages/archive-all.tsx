import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiBlob } from '../api/client'
import { Card, CardHeader } from '../components/ui'
import { useI18n } from '../i18n'

type ArchiveItem = {
  dispute_id: number
  title: string
  status: string
  is_closed: boolean
  has_report: boolean
  history: { event: string; at: string }[]
}

export default function ArchiveAll() {
  const nav = useNavigate()
  const { t } = useI18n()
  const [items, setItems] = useState<ArchiveItem[] | null>(null)

  useEffect(() => {
    api('/api/disputes/archive/list').then((d: any) => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([]))
  }, [])

  async function downloadPdf(id: number, title: string) {
    try {
      const blob = await apiBlob(`/api/disputes/${id}/report`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title || 'report'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title={t('archivePageTitle')} subtitle={t('archivePageSubtitle')} />
        <div className="p-4">
          {items === null ? (
            <div className="text-sm text-slate-500">…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-slate-600">{t('archiveEmpty')}</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.dispute_id} className="py-3 flex items-center justify-between gap-3">
                  <button className="min-w-0 text-left" onClick={() => nav(`/app/disputes/${it.dispute_id}`)}>
                    <div className="truncate font-medium text-slate-800">{it.title}</div>
                    <div className="text-xs text-slate-500">#{it.dispute_id} · {it.status}</div>
                  </button>
                  {it.has_report ? (
                    <button
                      onClick={() => downloadPdf(it.dispute_id, it.title)}
                      className="shrink-0 text-xs px-2 py-1 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                    >
                      PDF
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
