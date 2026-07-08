import React from 'react'
import WorkflowInfo from '../components/workflow-info'
import { useI18n } from '../i18n'

export default function Mediation() {
  const { t } = useI18n()
  return (
    <WorkflowInfo
      icon={
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h13a2 2 0 012 2v6a2 2 0 01-2 2H8l-4 3V6zM7 10h8M7 13h5" />
        </svg>
      }
      title={t('wfMediationTitle')}
      intro={t('wfMediationIntro')}
      points={[t('wfMediationP1'), t('wfMediationP2'), t('wfMediationP3')]}
      activeStep={4}
    />
  )
}
