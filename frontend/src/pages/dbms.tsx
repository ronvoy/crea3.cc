import React from 'react'
import { API_BASE } from '../api/client'

// Frontend route for the database browser. It embeds the backend's /dbms page
// (same content as <backend>/dbms) so it's reachable at localhost:5173/dbms.
// The backend page renders its own ADMIN username + password login (DBMS_USER /
// DBMS_PASS in .env). API_BASE points at the backend origin the browser can
// reach directly (set via VITE_API_BASE), which is same-site on localhost so the
// session cookie works inside the iframe.
export default function DbmsPage() {
  const src = `${API_BASE || ''}/dbms`
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d1117' }}>
      <iframe
        title="CREA3 Database Browser"
        src={src}
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </div>
  )
}
