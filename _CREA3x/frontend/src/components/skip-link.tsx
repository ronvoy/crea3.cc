import React from 'react'
import { useI18n } from '../i18n'

export default function SkipLink({ targetId = 'main-content' }: { targetId?: string }) {
  const { t } = useI18n()
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:rounded-xl focus:bg-slate-50 focus:px-4 focus:py-3 focus:text-slate-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {t('skipToMain')}
    </a>
  )
}
