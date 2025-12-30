import React from 'react'
import { Card, CardHeader } from '../components/ui'

export default function Others() {
  return (
    <div style={{ maxWidth: 820 }}>
      <Card>
        <CardHeader title="Others" subtitle="Extra options and info." />
        <div style={{ padding: 16, lineHeight: 1.6 }}>
          <p>
            This section is a placeholder for any additional pages or settings you want in the sidebar.
          </p>
        </div>
      </Card>
    </div>
  )
}
