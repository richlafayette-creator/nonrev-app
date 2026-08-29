import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
const conversation = readFileSync(new URL('../app/ConversationalTripWorkspace.tsx', import.meta.url), 'utf8')
const navigation = readFileSync(new URL('../app/AppNavigation.tsx', import.meta.url), 'utf8')
const selector = readFileSync(new URL('../app/LanguageSelector.tsx', import.meta.url), 'utf8')
const provider = readFileSync(new URL('../app/I18nProvider.tsx', import.meta.url), 'utf8')
const messagesModule = readFileSync(new URL('./i18n/messages.ts', import.meta.url), 'utf8')
const verify = readFileSync(new URL('../app/verify/page.tsx', import.meta.url), 'utf8')
const resultsClient = readFileSync(new URL('../app/results/SearchResultsClient.tsx', import.meta.url), 'utf8')
const profile = readFileSync(new URL('../app/profile/page.tsx', import.meta.url), 'utf8')
const savedSearches = readFileSync(new URL('../app/saved-searches/page.tsx', import.meta.url), 'utf8')
const watchlist = readFileSync(new URL('../app/watchlist/page.tsx', import.meta.url), 'utf8')
const myRequests = readFileSync(new URL('../app/my-requests/page.tsx', import.meta.url), 'utf8')
const feedback = readFileSync(new URL('../app/beta-feedback/page.tsx', import.meta.url), 'utf8')
const membership = readFileSync(new URL('../app/MembershipBillingContent.tsx', import.meta.url), 'utf8')
const globals = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'))
const es = JSON.parse(readFileSync(new URL('../messages/es.json', import.meta.url), 'utf8'))
const de = JSON.parse(readFileSync(new URL('../messages/de.json', import.meta.url), 'utf8'))
const fr = JSON.parse(readFileSync(new URL('../messages/fr.json', import.meta.url), 'utf8'))
const itDict = JSON.parse(readFileSync(new URL('../messages/it.json', import.meta.url), 'utf8'))
const pt = JSON.parse(readFileSync(new URL('../messages/pt.json', import.meta.url), 'utf8'))
const ja = JSON.parse(readFileSync(new URL('../messages/ja.json', import.meta.url), 'utf8'))
const ko = JSON.parse(readFileSync(new URL('../messages/ko.json', import.meta.url), 'utf8'))
const zh = JSON.parse(readFileSync(new URL('../messages/zh.json', import.meta.url), 'utf8'))

const dictionaries = { en, es, fr, de, it: itDict, pt, ja, ko, zh }
const launchLocales = Object.keys(dictionaries)
const requiredKeys = Object.keys(en.common).sort()

function placeholders(value: string) {
  return Array.from(value.matchAll(/\{[a-zA-Z0-9_]+\}/g)).map((match) => match[0]).sort()
}

describe('traveler localization foundation', () => {
  it('parses all 9 launch dictionaries and defines html language mapping', () => {
    assert.deepEqual(launchLocales, ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'])
    for (const locale of launchLocales) {
      assert.equal(typeof dictionaries[locale as keyof typeof dictionaries].common.homeHeadline, 'string')
    }
    assert.match(messagesModule, /locales = \['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'\]/)
    assert.match(messagesModule, /de: 'Deutsch'/)
    assert.match(messagesModule, /ko: '한국어'/)
    assert.match(messagesModule, /ja: '日本語'/)
    assert.match(messagesModule, /zh: '简体中文'/)
    assert.match(messagesModule, /zh: 'zh-Hans'/)
    assert.match(messagesModule, /function normalizeLocale/)
  })

  it('keeps every locale on the same required key set with valid interpolation placeholders', () => {
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      assert.deepEqual(Object.keys(dictionary.common).sort(), requiredKeys, locale)
      for (const key of requiredKeys) {
        assert.equal(typeof dictionary.common[key], 'string', `${locale}.${key}`)
        assert.notEqual(dictionary.common[key].trim(), '', `${locale}.${key}`)
        assert.deepEqual(placeholders(dictionary.common[key]), placeholders(en.common[key]), `${locale}.${key}`)
      }
    }
  })

  it('falls back to English safely without exposing raw keys', () => {
    assert.equal(es.common.homeHeadline, 'Encuentra la ruta non-rev con más probabilidades de llevarte.')
    assert.equal(de.common.homeStepBackups, 'Backups kennen')
    assert.equal(ja.common.homeStepCompare, '可能性を比較')
    assert.equal(zh.common.homeStepSearch, '搜索行程')
    assert.equal(fr.common.notVerified, 'Non vérifié')
    assert.match(messagesModule, /if \(normalized\.startsWith\('zh'\)\) return 'zh'/)
    assert.match(messagesModule, /return isLocale\(base\) \? base : DEFAULT_LOCALE/)
    assert.match(messagesModule, /return typeof fallback === 'string' && fallback\.trim\(\) \? fallback : ''/)
  })

  it('keeps canonical operational identifiers untranslated', () => {
    assert.match(es.common.previewLockedMessage, /ZED/)
    assert.match(ja.common.previewLockedMessage, /ZED/)
    assert.match(es.common.airlineSearchPlaceholder, /IATA/)
    assert.match(es.common.airlineSearchPlaceholder, /ICAO/)
    assert.match(ja.common.airlineSearchPlaceholder, /IATA/)
    assert.match(ja.common.airlineSearchPlaceholder, /ICAO/)
    assert.match(zh.common.exampleSbaHnl, /SBA/)
    assert.match(zh.common.exampleSbaHnl, /HNL/)
    assert.match(de.common.exampleLaxTokyo, /LAX/)
    for (const dictionary of Object.values(dictionaries)) {
      assert.match(dictionary.common.verificationRetentionCopy, /ZED/)
      assert.match(dictionary.common.airlineSearchPlaceholder, /IATA/)
      assert.match(dictionary.common.airlineSearchPlaceholder, /ICAO/)
    }
  })

  it('renders a persistent accessible language selector in the shared shell', () => {
    assert.match(selector, /aria-label=\{t\('language'\)\}/)
    assert.match(selector, /locales\.map/)
    assert.match(provider, /localeStorageKey/)
    assert.match(provider, /document\.documentElement\.lang/)
    assert.match(navigation, /<LanguageSelector compact \/>/)
    assert.match(navigation, /<LanguageSelector mobile \/>/)
    assert.match(navigation, /<LanguageSelector \/>/)
    for (const label of ['English', 'Español', 'Français', 'Deutsch', 'Italiano', 'Português', '日本語', '한국어', '简体中文']) {
      assert.match(messagesModule, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  })

  it('provides a mobile language selector with all launch languages and immediate selection', () => {
    assert.match(selector, /mobile = false/)
    assert.match(selector, /className="nonrevy-mobile-language"/)
    assert.match(selector, /aria-haspopup="listbox"/)
    assert.match(selector, /role="listbox"/)
    assert.match(selector, /role="option"/)
    assert.match(selector, /localeLabels\[item\]/)
    assert.match(selector, /item\.toUpperCase\(\)/)
    assert.match(selector, /setLocale\(item\)/)
    assert.match(selector, /setOpen\(false\)/)
    assert.match(globals, /\.nonrevy-mobile-language\s*{[\s\S]*display:\s*none/)
    assert.match(globals, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-global-nav__actions \.nonrevy-mobile-language\s*{[\s\S]*display:\s*block/)
    assert.match(globals, /\.nonrevy-mobile-language__sheet\s*{[\s\S]*width:\s*min\(18rem,\s*calc\(100vw - 1\.5rem\)\)/)
  })

  it('localizes the homepage value proposition and compact explainer', () => {
    assert.match(home, /t\('homeHeadline'\)/)
    assert.match(home, /t\('homeSupport'\)/)
    assert.match(home, /t\('homePreviewMessage'\)/)
    assert.match(conversation, /t\('homeHeadline'\)/)
    assert.match(conversation, /t\('homeWorkflowCompare'\)/)
    assert.match(conversation, /examplePromptKeys/)
    assert.match(globals, /\.nonrevy-home__steps--workflow|\.nonrevy-home__steps span small/)
  })

  it('localizes public preview, results, and verification email-challenge surfaces', () => {
    assert.match(resultsClient, /t\('publicSchedulePreview'\)/)
    assert.match(resultsClient, /t\('previewLockedMessage'\)/)
    assert.match(verify, /t\('verifyHeadline'\)/)
    assert.match(verify, /t\('companyEmailNotMapped'\)/)
    assert.match(verify, /t\('sendVerificationCode'\)/)
    assert.match(verify, /t\('enterSixDigitCode'\)/)
    assert.match(verify, /t\('resendCode'\)/)
    assert.match(verify, /t\('codeExpiresManualFallback'\)/)
    assert.match(es.common.sendVerificationCode, /código/)
    assert.match(de.common.verificationEmailSent, /Verifizierungs-E-Mail/)
    assert.match(ja.common.resendCode, /再送信/)
  })

  it('localizes required traveler account, saved, watchlist, request, feedback, and membership surfaces', () => {
    assert.match(profile, /t\('profileTitle'\)/)
    assert.match(profile, /t\('employeeVerification'\)/)
    assert.match(profile, /t\('noZedAgreements'\)/)
    assert.match(savedSearches, /t\('savedSearchesTitle'\)/)
    assert.match(savedSearches, /t\('noSavedSearches'\)/)
    assert.match(watchlist, /t\('watchlistTitle'\)/)
    assert.match(watchlist, /t\('noWatchedTrips'\)/)
    assert.match(myRequests, /t\('myRequestsTitle'\)/)
    assert.match(myRequests, /t\('noLoadRequests'\)/)
    assert.match(feedback, /t\('feedbackTitle'\)/)
    assert.match(feedback, /t\('noFeedbackTitle'\)/)
    assert.match(membership, /t\('membershipBillingTitle'\)/)
    assert.match(membership, /t\('coreFoundingMembership'\)/)
    assert.match(de.common.membershipBillingTitle, /Mitgliedschaft/)
    assert.match(ja.common.noSavedSearches, /保存済み検索/)
    assert.match(zh.common.noWatchedTrips, /关注/)
  })

  it('does not require internal or operator translation and does not expose raw locale/debug state', () => {
    assert.doesNotMatch(navigation, /diagnostics|operator|data-health/i)
    assert.doesNotMatch(home, /localeStorageKey|DEFAULT_LOCALE|nonrevy.locale.v1/)
    assert.doesNotMatch(navigation, /localeStorageKey|DEFAULT_LOCALE|debug/i)
  })

  it('keeps mobile language and explainer layout bounded by structure rather than clipping content', () => {
    assert.match(globals, /\.nonrevy-language-selector select\s*{[\s\S]*max-width:\s*10\.5rem/)
    assert.match(globals, /\.nonrevy-mobile-language__button\s*{[\s\S]*min-height:\s*2\.35rem/)
    assert.match(globals, /\.nonrevy-mobile-language__option\s*{[\s\S]*min-height:\s*2\.6rem/)
    assert.match(globals, /@media \(max-width: 760px\)[\s\S]*\.nonrevy-home__steps span\s*{[\s\S]*flex:\s*1 1 8\.4rem/)
    assert.match(globals, /\.nonrevy-conversation__header h1\s*{[\s\S]*font-size:\s*clamp\(1\.45rem,\s*3\.7vw,\s*2\.2rem\)/)
    assert.match(globals, /\.nonrevy-conversation__header h1\s*{[\s\S]*overflow-wrap:\s*anywhere/)
    assert.match(globals, /@media \(max-height: 760px\)[\s\S]*\.nonrevy-home__steps span small\s*{[\s\S]*display:\s*none/)
  })
})
