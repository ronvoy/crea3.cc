import React from 'react'
import { Card, CardHeader, Button, Pill } from '../components/ui'
import { API_BASE } from '../api/client'
import { useA11y } from '../components/a11y-provider'
import { useI18n, Lang } from '../i18n'
import { Select } from '../components/ui'

export default function SettingsPage() {
  const { highContrast, reduceMotion, fontScale, setHighContrast, setReduceMotion, setFontScale, reset } = useA11y()
  const { lang, setLang } = useI18n()

  const langOptions: Array<{ code: Lang; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
    { code: 'sl', label: 'Slovenščina' },
    { code: 'et', label: 'Eesti' },
    { code: 'be', label: 'Belgium (French)' },
    { code: 'nl', label: 'Belgium (Dutch)' },
    { code: 'lt', label: 'Lietuvių' },
    { code: 'hr', label: 'Hrvatski' },
  ]

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="Settings" subtitle="Environment and preferences." />
        <div className="p-4 text-sm text-slate-700 space-y-2">
          <div>
            <b>API base</b>: {API_BASE}
          </div>
          <div className="text-slate-600">
            To change backend URL, set <code>VITE_API_BASE</code> in <code>frontend/.env</code>.
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Accessibility" subtitle="WCAG-oriented settings stored on this device." />
        <div className="p-4 space-y-3 text-sm text-slate-700">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={highContrast ? 'primary' : 'outline'} onClick={() => setHighContrast(!highContrast)}>
              High contrast <Pill>{highContrast ? 'ON' : 'OFF'}</Pill>
            </Button>
            <Button variant={reduceMotion ? 'primary' : 'outline'} onClick={() => setReduceMotion(!reduceMotion)}>
              Reduce motion <Pill>{reduceMotion ? 'ON' : 'OFF'}</Pill>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="font-semibold">Font size</div>
            <Button variant="outline" onClick={() => setFontScale(fontScale === 100 ? 100 : fontScale === 112 ? 100 : fontScale === 125 ? 112 : 125)}>
              A−
            </Button>
            <Pill>{fontScale}%</Pill>
            <Button variant="outline" onClick={() => setFontScale(fontScale === 150 ? 150 : fontScale === 125 ? 150 : fontScale === 112 ? 125 : 112)}>
              A+
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset
            </Button>
          </div>

          <div className="text-xs text-slate-600">
            Note: full WCAG 2.1 AA compliance depends on content and ongoing validation (keyboard-only, screen readers, contrast checks).
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Language" subtitle="Switch without losing your session." />
        <div className="p-4 grid gap-2 text-sm text-slate-700 max-w-md">
          <Select value={lang} onChange={e => setLang(e.target.value as Lang)}>
            {langOptions.map(o => (
              <option key={o.code} value={o.code}>{o.label}</option>
            ))}
          </Select>
        </div>
      </Card>
    </div>
  )
}
