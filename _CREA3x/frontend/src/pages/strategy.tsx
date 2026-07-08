import React from 'react'
import WorkflowInfo from '../components/workflow-info'
import { useI18n } from '../i18n'

export default function Strategy() {
  const { t } = useI18n()
  return (
    <WorkflowInfo
      icon={
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V5m0 14h16M8 16l3-4 3 2 4-6" />
        </svg>
      }
      title={t('wfStrategyTitle')}
      intro={t('wfStrategyIntro')}
      points={[t('wfStrategyP1'), t('wfStrategyP2'), t('wfStrategyP3')]}
      activeStep={3}
    />
  )
}
