import type { I18nKey } from '../i18n'

// Single source of truth for how a dispute's status is shown everywhere
// (recent-disputes sidebar, dispute header, ...), so the indicators stay
// identical across the app.

export type DisputeTone = 'emerald' | 'amber' | 'sky' | 'rose' | 'slate'

export type DisputeStatusInfo = {
  tone: DisputeTone
  labelKey: I18nKey
  step: number // 0 = stopped/abandoned; otherwise 1..steps
  steps: number
}

const STEPS = 5

export function disputeStatusInfo(status?: string): DisputeStatusInfo {
  const s = (status || '').toLowerCase()
  switch (s) {
    case 'draft':
      return { tone: 'slate', labelKey: 'dispStatusDraft', step: 1, steps: STEPS }
    case 'collecting':
      return { tone: 'amber', labelKey: 'dispStatusCollecting', step: 2, steps: STEPS }
    case 'reconciling':
      return { tone: 'amber', labelKey: 'dispStatusReconciling', step: 3, steps: STEPS }
    case 'proposed':
      return { tone: 'sky', labelKey: 'dispStatusProposed', step: 4, steps: STEPS }
    case 'mediation':
      return { tone: 'amber', labelKey: 'dispStatusMediation', step: 5, steps: STEPS }
    case 'accepted':
      return { tone: 'emerald', labelKey: 'dispStatusAccepted', step: 5, steps: STEPS }
    case 'finalized':
      return { tone: 'emerald', labelKey: 'dispStatusFinalized', step: 5, steps: STEPS }
    case 'abandoned':
      return { tone: 'rose', labelKey: 'dispStatusAbandoned', step: 0, steps: STEPS }
    default:
      return { tone: 'slate', labelKey: 'dispStatusDraft', step: 1, steps: STEPS }
  }
}

// Tailwind class maps (kept explicit so the classes survive purge).
export const TONE_DOT: Record<DisputeTone, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  sky: 'bg-sky-400',
  rose: 'bg-rose-400',
  slate: 'bg-slate-400',
}
export const TONE_DOT_RING: Record<DisputeTone, string> = {
  emerald: 'shadow-[0_0_0_3px_rgba(52,211,153,0.18)]',
  amber: 'shadow-[0_0_0_3px_rgba(251,191,36,0.18)]',
  sky: 'shadow-[0_0_0_3px_rgba(56,189,248,0.18)]',
  rose: 'shadow-[0_0_0_3px_rgba(251,113,133,0.18)]',
  slate: 'shadow-[0_0_0_3px_rgba(148,163,184,0.18)]',
}
export const TONE_TEXT: Record<DisputeTone, string> = {
  emerald: 'text-emerald-300',
  amber: 'text-amber-300',
  sky: 'text-sky-300',
  rose: 'text-rose-300',
  slate: 'text-slate-300',
}
export const TONE_SEG_ON: Record<DisputeTone, string> = {
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  sky: 'bg-sky-400',
  rose: 'bg-rose-400',
  slate: 'bg-slate-400',
}
