#!/usr/bin/env node
/*
 * Localization QUALITY audit — beyond "is the key present?" (coverage) this asks
 * "is it actually translated, and is the translation sound?".
 *
 * For every non-English locale it reports three problem classes per key:
 *   • untranslated — value is byte-identical to English (a stubbed key), yet not
 *     a legit shared token (CREA3, EUR-Lex, numbers…). THE main silent gap.
 *   • length-suspect — prose whose translation is <0.5× or >2.6× the English
 *     length, i.e. likely truncated or bloated (e.g. a hero paragraph rendered
 *     as one short line).
 *   • empty — present but blank.
 *
 * Usage:
 *   npm run i18n:audit                 # heuristic report (fast, no API)
 *   npm run i18n:audit -- --list       # list the offending keys
 *   npm run i18n:audit -- --llm        # + LLM accuracy judge on flagged keys
 *   npm run i18n:audit -- --json       # machine-readable summary to stdout
 *
 * The heuristic pass is free; --llm calls OpenRouter (key from env or
 * ../backend/.env) only on the already-flagged subset, so it stays bounded.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const I18N = path.resolve(here, '../src/i18n.tsx')
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const LIST = has('--list'), LLM = has('--llm'), JSON_OUT = has('--json')

const LANG_NAMES = {
  it: 'Italian', sl: 'Slovenian', et: 'Estonian', be: 'French (Belgium)',
  nl: 'Dutch (Belgium / Flemish)', lt: 'Lithuanian', hr: 'Croatian',
}

// ── parse one locale block into {key: value} ────────────────────────────────
const SRC = fs.readFileSync(I18N, 'utf8')
function localeValues(lang) {
  const anchor = `\n  ${lang}: {`
  const abs = SRC.indexOf(anchor)
  if (abs < 0) return {}
  let depth = 1, j = abs + anchor.length
  while (depth && j < SRC.length) { const c = SRC[j++]; if (c === '{') depth++; else if (c === '}') depth-- }
  const block = SRC.slice(abs, j)
  const out = {}
  for (const line of block.split('\n')) {
    const m = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(['"])([\s\S]*)\2,?\s*$/)
    if (!m) continue
    const [, key, q, raw] = m
    let val = raw
    if (q === "'") val = raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    else { try { val = JSON.parse('"' + raw.replace(/"/g, '\\"') + '"') } catch {} }
    out[key] = val
  }
  return out
}
function codeLike(v) {
  if (!v || v.length <= 3) return true
  if (/^[\d\s.,:%+\-–—/·&()]+$/.test(v)) return true
  if (/^(CREA3|EUR-Lex|WP\d+|PDF|CSV|ODR|ECGAR|EU|WCAG|Jitsi|Keycloak|Ollama|Mailpit|API|ID|CREA2|CREA)\b/.test(v)) return true
  if (/^[A-Z0-9 .&+/·—–-]{1,16}$/.test(v)) return true
  return false
}
function lengthSuspect(enVal, locVal) {
  if (!enVal || !locVal || enVal.length < 40 || !/\s/.test(enVal)) return false
  const r = locVal.length / enVal.length
  return r < 0.5 || r > 2.6
}

// ── LLM judge (optional) ─────────────────────────────────────────────────────
function readEnvKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const m = fs.readFileSync(path.resolve(here, '../../backend/.env'), 'utf8').match(/^OPENROUTER_API_KEY=(.*)$/m)
    if (m) return m[1].trim()
  } catch {}
  return ''
}
async function judge(lang, langName, pairs) {
  const KEY = readEnvKey()
  if (!KEY) { console.warn('  (--llm skipped: no OPENROUTER_API_KEY)'); return {} }
  const BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  const MODEL = process.env.TRANSLATE_MODEL || 'openai/gpt-4o-mini'
  const sys = `You audit ${langName} translations of UI strings. For each entry you get the English source and the current ${langName} translation. Reply ONLY a compact JSON object mapping each key to "ok" if the translation is accurate and complete, or a SHORT reason (max 8 words) if it is wrong, truncated, or still English. No commentary, no code fences.`
  const user = JSON.stringify(pairs)
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'CREA3 i18n audit' },
    body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  })
  if (!res.ok) { console.warn(`  (--llm error ${res.status})`); return {} }
  let c = (await res.json())?.choices?.[0]?.message?.content || ''
  c = c.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  try { return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)) } catch { return {} }
}

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

// ── run ──────────────────────────────────────────────────────────────────────
const en = localeValues('en')
const enKeys = Object.keys(en)
const summary = {}
let worstTotal = 0

for (const lang of Object.keys(LANG_NAMES)) {
  const loc = localeValues(lang)
  const untranslated = [], suspect = [], empty = [], missing = []
  for (const k of enKeys) {
    if (loc[k] === undefined) { missing.push(k); continue }
    if (loc[k] === '') { empty.push(k); continue }
    if (loc[k] === en[k]) { if (!codeLike(en[k])) untranslated.push(k) }
    else if (lengthSuspect(en[k], loc[k])) suspect.push(k)
  }
  const flagged = untranslated.length + suspect.length + empty.length + missing.length
  worstTotal += flagged
  summary[lang] = { missing: missing.length, untranslated: untranslated.length, suspect: suspect.length, empty: empty.length, keys: { missing, untranslated, suspect, empty } }
}

if (JSON_OUT) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }

console.log('Localization quality audit (per non-English locale)')
console.log('  untranslated = identical to English · suspect = length off vs English · missing/empty = absent/blank\n')
console.log('locale  missing  untranslated  suspect  empty')
for (const [lang, s] of Object.entries(summary)) {
  console.log(`${lang.padEnd(6)}  ${String(s.missing).padStart(7)}  ${String(s.untranslated).padStart(12)}  ${String(s.suspect).padStart(7)}  ${String(s.empty).padStart(5)}`)
}
console.log(`\nTotal quality flags across all locales: ${worstTotal}`)

if (LIST) {
  for (const [lang, s] of Object.entries(summary)) {
    const all = [...s.keys.missing.map((k) => ['missing', k]), ...s.keys.untranslated.map((k) => ['untranslated', k]), ...s.keys.suspect.map((k) => ['suspect', k]), ...s.keys.empty.map((k) => ['empty', k])]
    if (!all.length) continue
    console.log(`\n── ${lang} (${LANG_NAMES[lang]}) — ${all.length} flags ──`)
    for (const [kind, k] of all) console.log(`  ${kind.padEnd(12)} ${k}  ${kind === 'suspect' ? `(en ${en[k].length} → ${lang} ${(localeValues(lang)[k] || '').length} chars)` : ''}`)
  }
}

if (LLM) {
  console.log('\n── LLM accuracy judge on flagged (non-missing) keys ──')
  for (const [lang, s] of Object.entries(summary)) {
    const loc = localeValues(lang)
    const cand = [...s.keys.untranslated, ...s.keys.suspect]
    if (!cand.length) continue
    const problems = {}
    for (const batch of chunk(cand, 30)) {
      const pairs = Object.fromEntries(batch.map((k) => [k, { en: en[k], [lang]: loc[k] }]))
      const verdict = await judge(lang, LANG_NAMES[lang], pairs)
      for (const k of batch) if (verdict[k] && verdict[k] !== 'ok') problems[k] = verdict[k]
    }
    const n = Object.keys(problems).length
    console.log(`\n  ${lang}: ${n} confirmed problem(s) of ${cand.length} checked`)
    if (LIST) for (const [k, why] of Object.entries(problems)) console.log(`    ${k}: ${why}`)
  }
}

console.log('\nFix: `./localization.sh --fullsweep` re-translates untranslated + suspect keys, then re-audits.')
