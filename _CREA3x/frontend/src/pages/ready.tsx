import React from 'react'
import WorkflowInfo from '../components/workflow-info'
import { useI18n } from '../i18n'

export default function Ready() {
  const { t } = useI18n()
  return (
    <WorkflowInfo
      icon={
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      }
      title={t('wfReadyTitle')}
      intro={t('wfReadyIntro')}
      points={[t('wfReadyP1'), t('wfReadyP2'), t('wfReadyP3')]}
      activeStep={2}
    />
  )
}
