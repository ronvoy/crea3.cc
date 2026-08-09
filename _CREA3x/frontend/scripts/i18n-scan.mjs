#!/usr/bin/env node
// Static scan for user-facing text that BYPASSES the central i18n system — the
// root cause of "some pages don't change language". Run whenever a page/
// component is added or edited:  npm run i18n:scan   (fast, heuristic)
//                               npm run i18n:scan -- --full   (deep audit)
//
// TWO classes of gap are detected:
//   (A) Hardcoded English strings not wrapped in t()  — JSX text nodes + common
//       UI attributes (placeholder/label/title/aria-label/subtitle/helperText).
//   (B) i18n-BYPASS patterns — pages carrying their own language-keyed content
//       instead of going through t(): `lang === '..' ? .. : ..` ternaries,
//       `Record<'en'..>` / `{ en: .., it: .. }` content maps, direct
//       `strings.en[..]` / `strings[lang]` / `CONTENT[..]` access. These render
//       English for every locale the local dict doesn't define, yet never show
//       up as a "missing key" — so only a full audit catches them.
//
// Flags:
//   --full     Deep audit: run BOTH detectors (A + B) across EVERY page/route,
//              INCLUDING admin-* files. Use this to sweep all corners.
//   --admin    Include admin-* files in the class-A scan (implied by --full).
//   --list     Print each individual finding (file + snippet), not just counts.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '../src')
const roots = ['pages', 'components'].map((d) => path.resolve(srcRoot, d))
const FULL = process.argv.includes('--full')
const LIST = process.argv.includes('--list')
const includeAdmin = FULL || process.argv.includes('--admin')

// ── Class A: hardcoded-string heuristics ────────────────────────────────────
const attrRe = /\b(placeholder|label|title|aria-label|subtitle|helperText)="([A-Z][^"{}]{3,})"/g
const textRe = />\s*([A-Z][a-zA-Z][^<>{}]{4,})\s*</g

// ── Class B: i18n-bypass patterns ───────────────────────────────────────────
// Each entry: [label, regex]. `lineOf` turns an index into a 1-based line no.
// `skip(match)` returns true for known false positives — code/data maps that key
// on locale but hold NON-display values (BCP-47 tags, ISO codes, code→code).
const isCodeVal = (v) => /^['"`]?[a-z]{2}(-[A-Z]{2})?['"`]?$/i.test(v.trim()) // 'en', 'nl-BE'
const bypassPatterns = [
  // Any `lang === 'xx'` comparison — catches inline ternaries AND lang-derived
  // booleans like `const it = lang === 'it'` then `it ? 'A' : 'B'` (which the
  // ternary-only pattern missed and let untranslated copy through, e.g. partners).
  ['lang-compare', /\blang\s*===?\s*['"][a-z-]{2,5}['"]/g, null],
  ['lang-switch', /\bswitch\s*\(\s*lang\s*\)/g, null],
  ['en-it-typed-map', /Record<\s*['"]en['"]/g, null],
  // `{ en: 'nl-BE' }` is a code map, not copy → skip when the value is a code.
  ['inline-lang-map', /\{\s*en\s*:\s*(`[^`]*`|'[^']*'|"[^"]*"|[{[])/g, (m) => isCodeVal(m[1])],
  ['direct-strings-access', /\bstrings\s*[.[]\s*(en\b|lang\b|['"][a-z-]{2,5}['"])/g, null],
  // `SPEECH_LANG[lang]`, `LANG_NAMES[lang]` etc. are data maps → skip _LANG/_NAMES.
  ['content-lang-index', /\b([A-Z][A-Za-z0-9_]*)\s*\[\s*(lang\b|lang\s*===)/g, (m) => /_(LANG|NAMES|CODES?)$|LANG$/.test(m[1])],
]

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const lineOf = (txt, idx) => txt.slice(0, idx).split('\n').length

// ── Class A scan ────────────────────────────────────────────────────────────
let totalA = 0
const perFileA = []
for (const root of roots) {
  for (const p of walk(root)) {
    const rel = path.relative(srcRoot, p)
    if (!includeAdmin && /admin/i.test(rel)) continue
    const txt = fs.readFileSync(p, 'utf8')
    const hits = []
    for (const m of txt.matchAll(attrRe)) {
      const v = m[2]
      if (v.startsWith('http') || v.startsWith('/') || v.startsWith('#')) continue
      hits.push(`${m[1]}="${v}"`)
    }
    for (const m of txt.matchAll(textRe)) {
      const v = m[1].trim()
      if (/[=/]|\.tsx/.test(v)) continue
      if (v.includes(' ') || ['Support', 'Settings', 'Language', 'Accessibility', 'Create', 'Send', 'Refresh'].includes(v)) hits.push(`>${v}<`)
    }
    if (hits.length) { perFileA.push([rel, hits]); totalA += hits.length }
  }
}
perFileA.sort((a, b) => b[1].length - a[1].length)

console.log(`Class A — hardcoded user-facing string candidates: ${totalA} across ${perFileA.length} files`)
console.log(`(heuristic — review each; admin-* ${includeAdmin ? 'INCLUDED' : 'skipped'})\n`)
for (const [rel, hits] of perFileA) {
  console.log(`${String(hits.length).padStart(4)}  ${rel}`)
  if (LIST) for (const h of hits) console.log('        ' + h.slice(0, 100))
}

// ── Class B scan (only in --full, but always runs so it's discoverable) ──────
if (FULL) {
  let totalB = 0
  const perFileB = []
  // Class B covers pages + components + top-level src files, but NOT i18n.tsx
  // itself (the central dict legitimately owns `strings`, `lang`, en/it maps).
  const bFiles = [...walk(path.resolve(srcRoot, 'pages')), ...walk(path.resolve(srcRoot, 'components')), ...walk(srcRoot)]
  const seen = new Set()
  for (const p of bFiles) {
    if (seen.has(p)) continue
    seen.add(p)
    const rel = path.relative(srcRoot, p)
    if (/(^|\/)i18n\.tsx?$/.test(rel)) continue // the dictionary itself is exempt
    const txt = fs.readFileSync(p, 'utf8')
    const hits = []
    for (const [label, re, skip] of bypassPatterns) {
      for (const m of txt.matchAll(re)) {
        if (skip && skip(m)) continue // known code/data-map false positive
        hits.push(`${label} @L${lineOf(txt, m.index)}: ${m[0].replace(/\s+/g, ' ').slice(0, 60)}`)
      }
    }
    if (hits.length) { perFileB.push([rel, hits]); totalB += hits.length }
  }
  perFileB.sort((a, b) => b[1].length - a[1].length)

  console.log(`\nClass B — i18n-BYPASS patterns (page-local language dicts / lang ternaries): ${totalB} across ${perFileB.length} files`)
  console.log('(these render English for locales the local dict omits — migrate into i18n.tsx + t())\n')
  for (const [rel, hits] of perFileB) {
    console.log(`${String(hits.length).padStart(4)}  ${rel}`)
    if (LIST) for (const h of hits) console.log('        ' + h)
  }
  console.log(`\nTotal localization findings (A+B): ${totalA + totalB}`)
}

console.log('\nWire class-A strings to {t(\'key\')}; migrate class-B page dicts INTO i18n.tsx and drive them from t().')
console.log('Then `./localization.sh --full` fills every language and `npm run i18n:coverage` confirms 100%.')
