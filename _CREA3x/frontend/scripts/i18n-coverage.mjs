#!/usr/bin/env node
// i18n coverage report: which keys each locale is missing vs English (the source
// of truth). Run:  npm run i18n:coverage
// Exit code is non-zero if any locale is below the --min threshold (default 0).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const file = path.resolve(here, '../src/i18n.tsx')
const src = fs.readFileSync(file, 'utf8')

// Extract the `const strings = { ... } as const` object body.
const m = src.match(/const strings = \{([\s\S]*)\}\s*as const/)
if (!m) { console.error('Could not find `const strings` in i18n.tsx'); process.exit(2) }
const body = m[1]

// Split into top-level locale blocks: `  xx: {` ... matching brace.
const locales = {}
const re = /\n {2}([a-z]{2}): \{/g
let lm
while ((lm = re.exec(body))) {
  const code = lm[1]
  let depth = 1, j = re.lastIndex
  while (depth && j < body.length) {
    const c = body[j++]
    if (c === '{') depth++
    else if (c === '}') depth--
  }
  const block = body.slice(re.lastIndex, j - 1)
  const keys = new Set([...block.matchAll(/\n {4}([A-Za-z0-9_]+):/g)].map((x) => x[1]))
  locales[code] = keys
}

const en = locales.en || new Set()
const order = ['it', 'sl', 'et', 'be', 'nl', 'lt', 'hr']
const min = Number((process.argv.find((a) => a.startsWith('--min=')) || '').split('=')[1] || 0)
const showMissing = process.argv.includes('--list')

console.log(`English source keys: ${en.size}\n`)
console.log('locale  present  missing  coverage')
let worst = 100
for (const code of order) {
  const k = locales[code] || new Set()
  const present = [...k].filter((x) => en.has(x)).length
  const missing = [...en].filter((x) => !k.has(x))
  const cov = en.size ? (100 * present) / en.size : 0
  worst = Math.min(worst, cov)
  console.log(`${code.padEnd(6)}  ${String(present).padStart(7)}  ${String(missing.length).padStart(7)}  ${cov.toFixed(1)}%`)
  if (showMissing && missing.length) {
    console.log('    missing: ' + missing.join(', '))
  }
}
console.log('\nTip: `npm run i18n:coverage -- --list` prints the missing key names per locale.')
process.exit(worst < min ? 1 : 0)
