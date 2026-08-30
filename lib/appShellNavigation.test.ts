import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const navigation = readFileSync(new URL('../app/AppNavigation.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const homeCss = readFileSync(new URL('../app/home.css', import.meta.url), 'utf8')

describe('global traveler app shell navigation', () => {
  it('exposes the standard traveler destinations', () => {
    ;[
      ["label: 'Search'", "href: '/'"],
      ["label: 'Saved'", "href: '/saved-searches'"],
      ["label: 'Watchlist'", "href: '/watchlist'"],
      ["label: 'Requests'", "href: '/my-requests'"],
      ["label: 'Profile'", "href: '/profile'"]
    ].forEach(([label, href]) => {
      assert.match(navigation, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      assert.match(navigation, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    })
  })

  it('uses inline vector icons instead of placeholder text symbols', () => {
    assert.match(navigation, /function NavIcon/)
    assert.match(navigation, /<NavIcon name=\{item\.icon\}/)
    assert.match(navigation, /<svg \{\.\.\.common\}>/)
    ;[
      "icon: '?'",
      "icon: '*'",
      "icon: 'o'",
      "icon: '>'",
      "icon: '@'",
      "{open ? 'x' : '='}"
    ].forEach((placeholder) => {
      assert.doesNotMatch(navigation, new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    })
  })

  it('keeps mobile language selection separate from the five-item bottom navigation', () => {
    assert.match(navigation, /<LanguageSelector compact \/>/)
    assert.match(navigation, /<LanguageSelector mobile \/>/)
    assert.match(navigation, /<\/header>\s*<nav className="nonrevy-mobile-nav"/)
    assert.match(css, /\.nonrevy-mobile-nav\s*{[\s\S]*display:\s*none/)
    assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-global-nav__actions \.nonrevy-language-selector\s*{[\s\S]*display:\s*none/)
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-global-nav__actions \.nonrevy-mobile-language\s*{[\s\S]*display:\s*block/)
    assert.doesNotMatch(navigation, /label: 'Language'/)
  })

  it('does not expose internal diagnostic or operator routes in normal navigation', () => {
    ;[
      "'/agent'",
      "'/operator'",
      "'/diagnostics'",
      "'/data-health'",
      "'/outcome-diagnostics'",
      "'/notification-diagnostics'",
      "'/requests'"
    ].forEach((route) => assert.doesNotMatch(navigation, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))))
  })

  it('renders one shared masthead brand and active navigation state', () => {
    const brandMatches = navigation.match(/className="nonrevy-global-nav__brand"/g) || []
    assert.equal(brandMatches.length, 1)
    assert.match(navigation, /className="nonrevy-global-nav__brand-text"/)
    assert.match(navigation, /aria-current=\{active \? 'page' : undefined\}/)
    assert.match(navigation, /itemIsActive/)
  })

    it('reserves mobile bottom-nav space and keeps the content safe-area aware', () => {
      assert.match(css, /--nonrevy-mobile-nav-height:\s*4\.05rem/)
      assert.match(css, /--nonrevy-mobile-nav-bottom-inset:\s*0\.45rem/)
      assert.match(css, /--nonrevy-mobile-dock-offset:\s*0\.9rem/)
      assert.match(css, /--nonrevy-mobile-control-stack:\s*calc\(var\(--nonrevy-mobile-nav-height\) \+ var\(--nonrevy-mobile-nav-bottom-inset\) \+ var\(--nonrevy-mobile-dock-offset\) \+ var\(--nonrevy-chat-composer-height\) \+ \(var\(--nonrevy-mobile-control-gap\) \* 2\)\)/)
      assert.match(css, /padding-bottom:\s*calc\(var\(--nonrevy-mobile-nav-height\) \+ var\(--nonrevy-mobile-nav-bottom-inset\) \+ var\(--nonrevy-mobile-control-gap\) \+ env\(safe-area-inset-bottom/)
      assert.match(css, /\.nonrevy-mobile-nav\s*{[\s\S]*display:\s*none/)
      assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-mobile-nav\s*{[\s\S]*position:\s*fixed/)
    })

  it('uses a dark primary text token and restrained blue active state', () => {
    assert.match(css, /--nonrevy-text:\s*#111827/)
    assert.match(css, /--nonrevy-primary-blue:\s*#2563eb/)
    assert.match(css, /\.nonrevy-global-nav__menu-button,[\s\S]*color:\s*var\(--nonrevy-text\) !important/)
    assert.match(css, /\.nonrevy-global-nav__menu-button\s*{[\s\S]*background:\s*var\(--nonrevy-surface\) !important/)
    assert.match(css, /\.nonrevy-top-nav__link\[aria-current="page"\],[\s\S]*background:\s*var\(--nonrevy-primary-blue-soft\)/)
  })

  it('keeps global page headings restrained under the shared shell', () => {
    assert.match(css, /--nonrevy-type-title:\s*clamp\(1\.8rem,\s*4\.5vw,\s*2\.7rem\)/)
    assert.match(css, /main\.app-shell:not\(\.nonrevy-home\):not\(\.nonrevy-results-page\):not\(\.nonrevy-conversation\) h1,[\s\S]*font-size:\s*var\(--nonrevy-type-title\)/)
    assert.match(css, /\.nonrevy-conversation__brand\s*{[\s\S]*font-size:\s*clamp\(2rem,\s*8vw,\s*3rem\)/)
    assert.match(homeCss, /html body \.nonrevy-conversation__brand\s*{[\s\S]*font-size:\s*clamp\(2rem,\s*8vw,\s*3rem\)/)
    assert.match(homeCss, /html body main\.nonrevy-home \.nonrevy-home__logo\s*{[\s\S]*font-size:\s*clamp\(2\.15rem,\s*8vw,\s*3rem\)/)
    assert.match(homeCss, /html body \.nonrevy-global-nav__brand\s*{[\s\S]*color:\s*var\(--nonrevy-text,\s*#111827\)/)
    assert.match(homeCss, /html body \.nonrevy-global-nav__brand-text\s*{[\s\S]*color:\s*var\(--nonrevy-text,\s*#111827\)/)
    assert.match(css, /main\.nonrevy-results-page h1,[\s\S]*font-size:\s*var\(--nonrevy-type-title\)/)
  })

  it('hides legacy per-page top nav rows behind the shared shell', () => {
    assert.match(css, /\.top-nav\s*{[\s\S]*display:\s*none !important/)
  })
})
