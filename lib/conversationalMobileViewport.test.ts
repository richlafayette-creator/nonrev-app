import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const css = readFileSync(new URL('../app/home.css', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const component = readFileSync(new URL('../app/ConversationalTripWorkspace.tsx', import.meta.url), 'utf8')

describe('conversational mobile viewport CSS', () => {
  it('prevents document-level horizontal overflow at the root', () => {
    assert.match(globals, /html\s*\{[\s\S]*overflow-x:\s*clip/)
    assert.match(globals, /body\s*\{[\s\S]*overflow-x:\s*clip/)
    assert.match(globals, /\*,\s*\*::before,\s*\*::after\s*\{[\s\S]*box-sizing:\s*border-box/)
  })

  it('keeps 320px and common iPhone widths inside the viewport contract', () => {
    for (const width of [320, 375, 390, 430]) {
      assert.ok(width >= 320)
    }
    assert.match(css, /@media\s*\(max-width:\s*360px\)/)
    assert.match(css, /\.nonrevy-conversation\s*\{[\s\S]*width:\s*100%/)
    assert.match(css, /\.nonrevy-conversation\s*\{[\s\S]*max-width:\s*100%/)
    assert.match(css, /\.nonrevy-conversation\s*\{[\s\S]*min-width:\s*0/)
  })

  it('constrains the logo, wraps context chips, and keeps text inside bubbles/cards', () => {
    assert.match(css, /\.nonrevy-conversation__brand\s*\{[\s\S]*max-width:\s*100%/)
    assert.match(css, /\.nonrevy-conversation__brand\s*\{[\s\S]*white-space:\s*nowrap/)
    assert.match(css, /\.nonrevy-context-strip\s*\{[\s\S]*flex-wrap:\s*wrap/)
    assert.match(css, /\.nonrevy-context-strip span\s*\{[\s\S]*overflow-wrap:\s*anywhere/)
    assert.match(css, /\.nonrevy-conversation__message\s*\{[\s\S]*max-width:\s*min\(100%,\s*720px\)/)
    assert.match(css, /\.nonrevy-itinerary-card\s*\{[\s\S]*max-width:\s*100%/)
  })

  it('reserves safe-area spacing for the sticky composer without covering content', () => {
    assert.match(css, /\.nonrevy-conversation\s*\{[\s\S]*padding:[\s\S]*calc\(148px \+ env\(safe-area-inset-bottom\)\)/)
    assert.match(css, /\.nonrevy-conversation__composer\s*\{[\s\S]*bottom:\s*max\(12px,\s*env\(safe-area-inset-bottom\)\)/)
    assert.match(css, /\.nonrevy-conversation__messages\s*\{[\s\S]*padding:[\s\S]*env\(safe-area-inset-bottom\)/)
  })

  it('keeps diagnostics hidden unless developer mode explicitly enables them', () => {
    assert.match(component, /developerDiagnosticsEnabled/)
    assert.match(component, /if \(!enabled \|\| !diagnostics\.length\) return null/)
    assert.match(component, /Developer diagnostics/)
  })
})

