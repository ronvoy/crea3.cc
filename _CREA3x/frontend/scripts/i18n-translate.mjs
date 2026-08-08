#!/usr/bin/env node
/*
 * Auto-fill missing i18n translations for a language, from the English source,
 * via OpenRouter — writing INTO src/i18n.tsx (single source of truth, no drift).
 *
 *   npm run i18n:translate -- nl                 # fill Dutch (Belgium)
 *   npm run i18n:translate -- all                # fill every non-English locale
 *   npm run i18n:translate -- nl --limit=40      # only first 40 missing keys
 *   npm run i18n:translate -- nl --model=openai/gpt-4o-mini
 *   npm run i18n:translate -- nl --dry           # print, do not write
 *
 * The OpenRouter key is read from OPENROUTER_API_KEY env, or ../backend/.env.
 * Machine translations for SL/ET/LT/HR should get a native review before prod.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const I18N = path.resolve(here, '../src/i18n.tsx')

const LANG_NAMES = {
  it: 'Italian', sl: 'Slovenian', et: 'Estonian', be: 'French (Belgium)',
  nl: 'Dutch (Belgium / Flemish)', lt: 'Lithuanian', hr: 'Croatian',
}
const ALL = Object.keys(LANG_NAMES)

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]
}))
const targets = args.filter((a) => !a.startsWith('--'))
if (!targets.length) { console.error('Usage: i18n:translate <lang|all> [--limit=N] [--model=..] [--dry]'); process.exit(2) }
const langs = targets.includes('all') ? ALL : targets
const LIMIT = flags.limit ? Number(flags.limit) : Infinity
const DRY = !!flags.dry
// --sweep: beyond missing/changed keys, also RE-translate keys that were left
// untranslated (locale value still === English) or look truncated/bloated vs
// English (length ratio out of bounds). This repairs English-stubbed backlog.
const SWEEP = !!flags.sweep

// A value that is legitimately identical across languages (product name, code,
// acronym, number, all-caps label) — never counts as "untranslated".
function codeLike(v) {
  if (!v || v.length <= 3) return true
  if (/^[\d\s.,:%+\-–—/·&()]+$/.test(v)) return true // pure numbers/punct
  if (/^(CREA3|EUR-Lex|WP\d+|PDF|CSV|ODR|ECGAR|EU|WCAG|Jitsi|Keycloak|Ollama|Mailpit|API|ID|CREA2|CREA)\b/.test(v)) return true
  if (/^[A-Z0-9 .&+/·—–-]{1,16}$/.test(v)) return true // short all-caps/code label
  return false
}
// Prose long enough that a wildly shorter/longer translation is suspicious.
function lengthSuspect(enVal, locVal) {
  if (!enVal || !locVal || enVal.length < 40 || !/\s/.test(enVal)) return false
  const r = locVal.length / enVal.length
  return r < 0.5 || r > 2.6
}

// ── OpenRouter key + model ──────────────────────────────────────────────────
function readEnvKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  const envPath = path.resolve(here, '../../backend/.env')
  try {
    const m = fs.readFileSync(envPath, 'utf8').match(/^OPENROUTER_API_KEY=(.*)$/m)
    if (m) return m[1].trim()
  } catch {}
  return ''
}
const KEY = readEnvKey()
if (!KEY) { console.error('No OPENROUTER_API_KEY (env or backend/.env).'); process.exit(2) }
const MODEL = flags.model || process.env.TRANSLATE_MODEL || 'openai/gpt-4o-mini'
const BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '')

// ── parse i18n.tsx ──────────────────────────────────────────────────────────
function parse() {
  const src = fs.readFileSync(I18N, 'utf8')
  const bodyM = src.match(/const strings = \{([\s\S]*)\}\s*as const/)
  const body = bodyM[1]
  const blocks = {}
  const re = /\n {2}([a-z]{2}): \{/g
  let lm
  while ((lm = re.exec(body))) {
    const code = lm[1]
    let depth = 1, j = re.lastIndex
    while (depth && j < body.length) { const c = body[j++]; if (c === '{') depth++; else if (c === '}') depth-- }
    blocks[code] = { start: bodyM.index + '\nconst strings = {'.length - 0, openIdx: null }
    // record the absolute index right after `  code: {`
    const abs = src.indexOf(`\n  ${code}: {`)
    blocks[code].afterOpen = abs + `\n  ${code}: {`.length
    blocks[code].keys = new Set([...body.slice(re.lastIndex, j - 1).matchAll(/\n {4}([A-Za-z0-9_]+):/g)].map((x) => x[1]))
  }
  return { src, blocks }
}

// Extract simple single-line string values from a locale block (default EN).
function localeValues(src, lang = 'en') {
  const anchor = `\n  ${lang}: {`
  const abs = src.indexOf(anchor)
  if (abs < 0) return {}
  let depth = 1, j = abs + anchor.length
  while (depth && j < src.length) { const c = src[j++]; if (c === '{') depth++; else if (c === '}') depth-- }
  const block = src.slice(abs, j)
  const out = {}
  for (const line of block.split('\n')) {
    const m = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(['"])([\s\S]*)\2,?\s*$/)
    if (!m) continue
    const [, key, q, raw] = m
    // unescape based on quote type
    let val = raw
    if (q === "'") val = raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    else { try { val = JSON.parse('"' + raw.replace(/"/g, '\\"') + '"') } catch {} }
    out[key] = val
  }
  return out
}
const enValues = (src) => localeValues(src, 'en')

async function translateBatch(pairs, langName) {
  const sys = `You are a professional UI localizer for a civil dispute-resolution web app (CREA3). Translate the given English UI strings to ${langName}. Rules: keep meaning and tone; preserve placeholders like {x}, %s, \\n, punctuation and emoji; do NOT translate the product name "CREA3" or emails/URLs; keep it concise for buttons/labels. Return ONLY a compact JSON object mapping each original key to its translated string — no commentary, no code fences.`
  const user = 'Translate these (JSON key -> English text):\n' + JSON.stringify(pairs, null, 0)
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-Title': 'CREA3 i18n' },
    body: JSON.stringify({ model: MODEL, temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  let content = data?.choices?.[0]?.message?.content || ''
  content = content.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const s = content.indexOf('{'), e = content.lastIndexOf('}')
  return JSON.parse(content.slice(s, e + 1))
}

function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o }

// Manifest: last-seen English value per key, so we can detect EDITED strings and
// re-translate only those (plus any missing) — never re-translating unchanged text.
const MANIFEST = path.resolve(here, '.i18n-manifest.json')
function loadManifest() { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) } catch { return {} } }
function saveManifest(en) { fs.writeFileSync(MANIFEST, JSON.stringify(en, null, 0) + '\n') }

// Insert new keys after `  <lang>: {`; replace the line of changed (existing) keys.
function writeTranslations(src, lang, translated, existingKeys) {
  const anchor = `\n  ${lang}: {`
  const start = src.indexOf(anchor)
  let depth = 1, j = start + anchor.length
  while (depth && j < src.length) { const c = src[j++]; if (c === '{') depth++; else if (c === '}') depth-- }
  let block = src.slice(start, j)
  const inserts = []
  for (const [k, v] of Object.entries(translated)) {
    const line = `    ${k}: ${JSON.stringify(v)},`
    if (existingKeys.has(k)) {
      const re = new RegExp(`\\n {4}${k}: (?:'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"),?`)
      if (re.test(block)) block = block.replace(re, `\n${line}`); else inserts.push(line)
    } else inserts.push(line)
  }
  if (inserts.length) block = block.slice(0, anchor.length) + '\n' + inserts.join('\n') + block.slice(anchor.length)
  return src.slice(0, start) + block + src.slice(j)
}

async function run() {
  const manifest = loadManifest()
  let latestEn = null
  for (const lang of langs) {
    const name = LANG_NAMES[lang]
    if (!name) { console.error(`skip unknown locale ${lang}`); continue }
    let { src, blocks } = parse()
    const en = enValues(src)
    latestEn = en
    const have = blocks[lang]?.keys || new Set()
    const cur = localeValues(src, lang) // current values already in this locale
    // new = missing in this locale; changed = English value edited since last run.
    const missingNew = Object.keys(en).filter((k) => !have.has(k))
    const changed = Object.keys(en).filter((k) => have.has(k) && manifest[k] !== undefined && manifest[k] !== en[k])
    // sweep = keys present but never actually translated (still identical to EN)
    // or whose translation looks truncated/bloated relative to the English source.
    let untranslated = [], suspect = []
    if (SWEEP) {
      for (const k of Object.keys(en)) {
        if (!have.has(k) || missingNew.includes(k) || changed.includes(k)) continue
        if (cur[k] === en[k]) { if (!codeLike(en[k])) untranslated.push(k) }
        else if (lengthSuspect(en[k], cur[k])) suspect.push(k)
      }
    }
    let todo = [...new Set([...missingNew, ...changed, ...untranslated, ...suspect])]
    if (todo.length > LIMIT) todo = todo.slice(0, LIMIT)
    if (!todo.length) { console.log(`${lang}: up to date${SWEEP ? ' (fully translated, no suspects)' : ' (nothing new or changed)'}.`); continue }
    const sweepNote = SWEEP ? ` + ${untranslated.length} untranslated + ${suspect.length} suspect` : ''
    console.log(`\n${lang} (${name}): ${missingNew.length} new + ${changed.length} changed${sweepNote} → ${todo.length} keys via ${MODEL}…`)

    const translated = {}
    for (const batch of chunk(todo, 40)) {
      const pairs = Object.fromEntries(batch.map((k) => [k, en[k]]))
      try {
        const got = await translateBatch(pairs, name)
        for (const k of batch) if (typeof got[k] === 'string') translated[k] = got[k]
        process.stdout.write(`  +${Object.keys(got).length} `)
      } catch (e) { console.warn(`\n  batch failed: ${e.message}`) }
    }
    const keys = Object.keys(translated)
    console.log(`\n  got ${keys.length}/${todo.length} translations`)
    if (!keys.length) continue
    if (DRY) { console.log(JSON.stringify(translated, null, 2)); continue }
    src = writeTranslations(src, lang, translated, have)
    fs.writeFileSync(I18N, src)
    console.log(`  updated ${lang} block (${keys.length} keys).`)
  }
  if (!DRY && latestEn) { saveManifest(latestEn); console.log('\nUpdated .i18n-manifest.json (English snapshot).') }
  console.log('Done. Run `npm run i18n:coverage` to confirm, then rebuild.')
}
run().catch((e) => { console.error(e); process.exit(1) })
