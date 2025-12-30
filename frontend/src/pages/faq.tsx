import React from 'react'
import { Card, CardHeader } from '../components/ui'

export default function FAQ() {
  return (
    <div style={{ maxWidth: 820 }}>
      <Card>
        <CardHeader title="FAQs" subtitle="Quick answers to common questions." />
        <div style={{ padding: 16, lineHeight: 1.6 }}>
          <h3>How do I verify my email?</h3>
          <p>
            After registration you receive a verification token. Go to “Verify Email” and paste it to activate your account.
          </p>
          <h3>Why do I see 401 Unauthorized?</h3>
          <p>
            You’re not logged in or your session expired. Log in again.
          </p>
          <h3>Can I change my password?</h3>
          <p>Yes — open Account in the left menu.</p>
        </div>
      </Card>
    </div>
  )
}
