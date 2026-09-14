/**
 * Cookie-consent state shared by modules that must not import the React
 * component (e.g. i18n, which the consent UI itself depends on).
 *
 * Only the NECESSARY category is implied; everything else is opt-in. The
 * "preferences" category governs remembering UI choices such as language.
 */
export const CONSENT_KEY = 'crea3_cookie_consent_v1'
export const CONSENT_EVENT = 'crea3-consent-changed'

export type ConsentChoice = { preferences: boolean; analytics: boolean; marketing: boolean }

export function getConsent(): (ConsentChoice & { necessary: true }) | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return { necessary: true, preferences: !!p.preferences, analytics: !!p.analytics, marketing: !!p.marketing }
  } catch { return null }
}

/** True only when the visitor allowed preference cookies. */
export function preferencesAllowed(): boolean {
  return !!getConsent()?.preferences
}
