import { useI18n } from '../i18n'
import {
  disputeStatusInfo,
  TONE_DOT,
  TONE_DOT_RING,
  TONE_TEXT,
  TONE_SEG_ON,
  type DisputeTone,
} from '../utils/disputeStatus'

// One badge, used everywhere a dispute status is shown (center header, the
// center "active disputes" list, and the recent-disputes sidebar) so the
// indicator is identical across the app.

const TONE_TEXT_LIGHT: Record<DisputeTone, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  sky: 'text-sky-700',
  rose: 'text-rose-700',
  slate: 'text-slate-600',
}

export default function DisputeStatusBadge({
  status,
  theme = 'light',
  showSteps = true,
  className = '',
}: {
  status?: string
  theme?: 'light' | 'dark'
  showSteps?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const info = disputeStatusInfo(status)
  const labelCls = theme === 'dark' ? TONE_TEXT[info.tone] : TONE_TEXT_LIGHT[info.tone]
  const offSeg = theme === 'dark' ? 'bg-white/15' : 'bg-slate-200'
  const stepText = theme === 'dark' ? 'text-white/50' : 'text-slate-500'
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[info.tone]} ${TONE_DOT_RING[info.tone]}`}
        aria-hidden
      />
      <span className={`text-[11px] font-semibold ${labelCls}`}>{t(info.labelKey)}</span>
      {showSteps && info.step > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center gap-0.5" aria-hidden>
            {Array.from({ length: info.steps }).map((_, i) => (
              <span
                key={i}
                className={`h-1 w-2.5 rounded-full ${i < info.step ? TONE_SEG_ON[info.tone] : offSeg}`}
              />
            ))}
          </span>
          <span className={`whitespace-nowrap text-[10px] ${stepText}`}>
            {t('workflowPagePhase')} {info.step}/{info.steps}
          </span>
        </span>
      ) : null}
    </span>
  )
}
