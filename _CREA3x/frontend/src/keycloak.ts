import Keycloak from 'keycloak-js'

// Keycloak is reached at the CURRENT origin (the backend proxies /realms and
// /resources to it), so login/verification works on localhost:8000 and on any
// tunnel domain. Override with VITE_KEYCLOAK_URL only if you run Keycloak on a
// separate host.
const KC_URL =
  (import.meta.env.VITE_KEYCLOAK_URL as string) ||
  (typeof window !== 'undefined' ? window.location.origin : '')

export const keycloak = new Keycloak({
  url: KC_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
})
