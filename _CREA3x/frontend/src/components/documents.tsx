import React, { useEffect, useRef, useState } from 'react'
import { api, apiBlob, API_BASE, getAccessToken } from '../api/client'
import { useI18n } from '../i18n'
import { Button } from './ui'

type Doc = {
  id: number
  filename: string
  content_type: string
  size_bytes: number
  uploaded_by_user_id: number | null
  created_at: string
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentsPanel({ disputeId }: { disputeId: number | string }) {
  const { t } = useI18n()
  const [docs, setDocs] = useState<Doc[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const d = await api(`/api/disputes/${disputeId}/documents`)
      setDocs(Array.isArray(d) ? d : [])
    } catch (e: any) {
      setErr(e?.message || null)
    }
  }
  useEffect(() => { load() }, [disputeId]) // eslint-disable-line

  async function upload(file: File) {
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      // Multipart upload: let the browser set the Content-Type boundary; attach
      // the bearer token manually (api() is JSON-only).
      const token = getAccessToken()
      const res = await fetch(`${API_BASE}/api/disputes/${disputeId}/documents`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.detail || `Upload failed (${res.status})`)
      }
      await load()
    } catch (e: any) {
      setErr(e?.message || 'Upload failed')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function download(d: Doc) {
    try {
      const blob = await apiBlob(`/api/disputes/${disputeId}/documents/${d.id}/download`, { method: 'GET' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = d.filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setErr(e?.message || 'Download failed')
    }
  }

  async function remove(d: Doc) {
    try {
      await api(`/api/disputes/${disputeId}/documents/${d.id}`, { method: 'DELETE' })
      await load()
    } catch (e: any) {
      setErr(e?.message || 'Delete failed')
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-base font-semibold text-slate-900">{t('documentsTitle')}</div>
      <div className="text-sm text-slate-600 mt-1">{t('documentsHint')}</div>

      <div className="mt-3">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? t('uploadingWord') : t('uploadDocumentWord')}
        </Button>
      </div>

      {err ? <div className="mt-2 text-sm text-rose-700">{err}</div> : null}

      <div className="mt-3 space-y-2">
        {docs.length === 0 ? (
          <div className="text-sm text-slate-500">{t('noDocumentsYet')}</div>
        ) : (
          docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{d.filename}</div>
                <div className="text-xs text-slate-500">{humanSize(d.size_bytes)}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => download(d)} className="text-sm text-blue-700 hover:underline">{t('downloadWord')}</button>
                <button onClick={() => remove(d)} className="text-sm text-rose-600 hover:underline">{t('deleteWord')}</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
