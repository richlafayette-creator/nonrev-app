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

  it('reserves safe-area spacing for the docked composer and bottom navigation without covering content', () => {
    assert.match(globals, /--nonrevy-chat-composer-height:\s*4\.85rem/)
    assert.match(globals, /--nonrevy-mobile-nav-bottom-inset:\s*0\.45rem/)
    assert.match(globals, /--nonrevy-mobile-dock-offset:\s*0\.9rem/)
    assert.match(globals, /--nonrevy-mobile-control-stack:\s*calc\(var\(--nonrevy-mobile-nav-height\) \+ var\(--nonrevy-mobile-nav-bottom-inset\) \+ var\(--nonrevy-mobile-dock-offset\) \+ var\(--nonrevy-chat-composer-height\) \+ \(var\(--nonrevy-mobile-control-gap\) \* 2\)\)/)
    assert.match(css, /\.nonrevy-conversation\s*\{[\s\S]*padding:[\s\S]*var\(--nonrevy-mobile-control-stack/)
    assert.match(css, /\.nonrevy-conversation__messages\s*\{[\s\S]*padding:[\s\S]*var\(--nonrevy-chat-composer-height/)
    assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.nonrevy-conversation__composer\s*{[\s\S]*position:\s*fixed[\s\S]*bottom:\s*calc\(var\(--nonrevy-mobile-nav-height, 4\.05rem\) \+ var\(--nonrevy-mobile-nav-bottom-inset, 0\.45rem\) \+ var\(--nonrevy-mobile-dock-offset, 0\.9rem\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*html body \.nonrevy-conversation__composer\s*{[\s\S]*position:\s*fixed !important[\s\S]*bottom:\s*calc\(var\(--nonrevy-mobile-nav-height, 4\.05rem\) \+ var\(--nonrevy-mobile-nav-bottom-inset, 0\.45rem\) \+ var\(--nonrevy-mobile-dock-offset, 0\.9rem\)/)
    assert.match(css, /\.nonrevy-conversation__composer\s*{[\s\S]*box-sizing:\s*border-box/)
    assert.match(css, /\.nonrevy-conversation__composer\s*{[\s\S]*width:\s*min\(calc\(100% - 1rem\),\s*720px\)/)
    assert.match(css, /\.nonrevy-conversation__chat\s*{[\s\S]*backdrop-filter:\s*none !important/)
  })

  it('keeps the composer compact with one visible input and a send icon', () => {
    assert.match(component, /className="nonrevy-conversation__composer-label"/)
    assert.match(component, /placeholder=\{t\('whereNeedGo'\)\}/)
    assert.match(component, /rows=\{1\}/)
    assert.match(component, /function SendIcon/)
    assert.match(css, /\.nonrevy-conversation__composer textarea\s*{[\s\S]*min-height:\s*42px/)
    assert.match(css, /\.nonrevy-conversation__message\s*{[\s\S]*padding:\s*9px 11px/)
  })

  it('lets longer localized hero copy wrap without clipping behind the composer', () => {
    assert.match(css, /\.nonrevy-conversation__header\s*{[\s\S]*overflow:\s*visible/)
    assert.match(css, /html body \.nonrevy-conversation__header\s*{[\s\S]*overflow:\s*visible !important/)
    assert.match(css, /html body \.nonrevy-conversation__header h1\s*{[\s\S]*font-size:\s*clamp\(1\.45rem,\s*3\.7vw,\s*2\.2rem\)/)
    assert.match(css, /html body \.nonrevy-conversation__header h1\s*{[\s\S]*overflow-wrap:\s*anywhere/)
    assert.match(css, /html body \.nonrevy-conversation__header h1\s*{[\s\S]*text-wrap:\s*balance/)
    assert.match(css, /@media \(max-height: 760px\)[\s\S]*\.nonrevy-home__steps span small\s*{[\s\S]*display:\s*none/)
  })

  it('does not render provider validation failures twice as chat text and a large error panel', () => {
    assert.match(component, /addAssistantMessageOnce\(result\.message\)/)
    assert.doesNotMatch(component, /setError\(result\.message\)/)
    assert.match(component, /\{error \? <p className="nonrevy-conversation__error"/)
  })

  it('keeps diagnostics hidden unless developer mode explicitly enables them', () => {
    assert.match(component, /developerDiagnosticsEnabled/)
    assert.match(component, /if \(!enabled \|\| !diagnostics\.length\) return null/)
    assert.match(component, /Developer diagnostics/)
  })
})
