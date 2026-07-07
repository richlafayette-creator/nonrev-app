import {
  expect,
  type Locator,
  type Page,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType
} from '@playwright/test'

type BrowserSmokeTest = TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>

const smokeSearches = {
  itineraryCards: 'SFO to HNL',
  originCoverage: 'MRY to OGG'
} as const

function futureDate(daysFromNow: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return date.toISOString().slice(0, 10)
}

export class NonrevyBrowserSmokeHarness {
  constructor(readonly page: Page) {}

  async resetFirstRunState() {
    await this.page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
  }

  async goto(path: string) {
    await this.page.goto(path)
    await this.page.waitForLoadState('domcontentloaded')
  }

  async expectHomepageLoads() {
    await this.goto('/')
    await expect(this.page.getByRole('form', { name: /search itineraries/i })).toBeVisible()
    await expect(this.page.getByLabel(/search actions/i)).toBeVisible()
  }

  async expectPlannerRenders() {
    await this.goto('/plan')
    await expect(this.page.getByText(/search and itinerary planner/i)).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /plan your nonrevy route/i })).toBeVisible()
    await expect(this.page.locator('.nonrevy-planner-card')).toBeVisible()
  }

  async expectItineraryCardsRender() {
    await this.goto(`/results?q=${encodeURIComponent(smokeSearches.itineraryCards)}&date=${futureDate(35)}`)
    await this.waitForSearchToSettle()
    await expect(this.itineraryCards().first()).toBeVisible()
  }

  async expectOriginCoverageNoticeRenders() {
    await this.goto(`/results?q=${encodeURIComponent(smokeSearches.originCoverage)}&date=${futureDate(35)}`)
    await this.waitForSearchToSettle()
    await expect(this.page.getByText(/origin coverage/i).first()).toBeVisible()
    await expect(this.page.getByText(/provider coverage is limited from MRY/i)).toBeVisible()
  }

  async expectFirstRunOnboardingAppears() {
    await this.resetFirstRunState()
    await this.goto('/onboarding')
    await expect(this.page.getByText(/first-run onboarding/i).first()).toBeVisible()
    await expect(this.page.getByText(/screen 1 of 3/i)).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /confidence scores are planning signals/i })).toBeVisible()
    await expect(this.page.getByRole('button', { name: /^skip$/i }).first()).toBeVisible()
  }

  async expectFeedbackButtonsRender() {
    await this.goto('/')
    await expect(this.page.getByRole('link', { name: /report issue/i })).toBeVisible()
    await expect(this.page.getByRole('link', { name: /send feedback/i })).toBeVisible()
  }

  itineraryCards(): Locator {
    return this.page.locator('.nonrevy-flight-board-row')
  }

  private async waitForSearchToSettle() {
    await expect(this.page.getByText(/searching/i)).toHaveCount(0, { timeout: 30_000 })
  }
}

export function createNonrevyBrowserSmokeHarness(page: Page) {
  return new NonrevyBrowserSmokeHarness(page)
}

export function defineNonrevyBrowserSmokeTests(test: BrowserSmokeTest) {
  test.describe('NONREVY browser smoke harness', () => {
    test('homepage loads', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectHomepageLoads()
    })

    test('planner renders', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectPlannerRenders()
    })

    test('itinerary cards render', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectItineraryCardsRender()
    })

    test('origin coverage notice renders', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectOriginCoverageNoticeRenders()
    })

    test('onboarding appears for first-time users', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectFirstRunOnboardingAppears()
    })

    test('feedback buttons render', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectFeedbackButtonsRender()
    })
  })
}
