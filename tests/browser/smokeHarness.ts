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
import {
  emptyStateFixture,
  originCoverageFixture,
  plannerItineraryFixture,
  plannerSmokeFixtureDate,
  plannerSmokeSearches
} from './plannerFixtures'

type BrowserSmokeTest = TestType<PlaywrightTestArgs & PlaywrightTestOptions, PlaywrightWorkerArgs & PlaywrightWorkerOptions>

type ItineraryFixtureKind = 'itineraryCards' | 'originCoverage' | 'emptyState'

const completedOnboardingState = {
  employeeAirline: 'United',
  travelerType: 'Employee',
  passPriority: 'SA2',
  homeAirport: 'SFO',
  preferredDestinations: ['HNL', 'NRT'],
  completedAt: '2026-07-07T00:00:00.000Z',
  updatedAt: '2026-07-07T00:00:00.000Z'
}

export class NonrevyBrowserSmokeHarness {
  constructor(readonly page: Page) {}

  async resetFirstRunState() {
    await this.page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })
  }

  async markOnboardingComplete() {
    await this.page.addInitScript((state) => {
      window.localStorage.clear()
      window.sessionStorage.clear()
      window.localStorage.setItem('nonrevy.onboarding', JSON.stringify(state))
    }, completedOnboardingState)
  }

  async installPlannerFixture(kind: ItineraryFixtureKind) {
    await this.page.route('**/api/itinerary/search?**', async (route) => {
      const fixture = kind === 'itineraryCards'
        ? plannerItineraryFixture()
        : kind === 'originCoverage'
          ? originCoverageFixture()
          : emptyStateFixture()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
    })
  }

  async goto(path: string) {
    await this.page.goto(path, { waitUntil: 'domcontentloaded' })
  }

  async expectHomepageLoads() {
    await this.goto('/')
    await expect(this.page.getByRole('form', { name: /search itineraries/i })).toBeVisible()
    await expect(this.page.getByLabel(/search actions/i)).toBeVisible()
  }

  async expectPlannerPageLoads() {
    await this.goto('/plan')
    await expect(this.page.getByText(/search and itinerary planner/i)).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /plan your nonrevy route/i })).toBeVisible()
    await expect(this.page.locator('.nonrevy-planner-card')).toBeVisible()
  }

  async expectSearchFormRenders() {
    await this.goto('/results')
    await expect(this.page.getByRole('form', { name: /edit itinerary search/i })).toBeVisible()
    await expect(this.page.getByLabel(/search itinerary/i)).toBeVisible()
    await expect(this.page.getByRole('button', { name: /^search$/i })).toBeVisible()
  }

  async expectItineraryCardsRenderFromFixture() {
    await this.installPlannerFixture('itineraryCards')
    await this.goto(`/results?q=${encodeURIComponent(plannerSmokeSearches.itineraryCards)}&date=${plannerSmokeFixtureDate}`)
    await this.waitForSearchToSettle()
    await expect(this.itineraryCards().first()).toBeVisible()
    await expect(this.page.getByText(/SFO → HNL/).first()).toBeVisible()
    await expect(this.page.getByText(/Live provider API data/).first()).toBeVisible()
  }

  async expectOriginCoverageNoticeRenders() {
    await this.installPlannerFixture('originCoverage')
    await this.goto(`/results?q=${encodeURIComponent(plannerSmokeSearches.originCoverage)}&date=${plannerSmokeFixtureDate}`)
    await this.waitForSearchToSettle()
    await expect(this.page.getByText(/origin coverage/i).first()).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /provider coverage is limited from MRY/i })).toBeVisible()
    await expect(this.page.getByText(/nearest supported airports to try/i)).toBeVisible()
    await expect(this.page.getByRole('link', { name: /SJC · 54 mi/i })).toBeVisible()
    await expect(this.page.getByText(/not fabricating flights from MRY/i)).toBeVisible()
    await expect(this.page.getByText(/not claiming standby availability/i)).toBeVisible()
  }

  async expectEmptyStateRenders() {
    await this.installPlannerFixture('emptyState')
    await this.goto(`/results?q=${encodeURIComponent(plannerSmokeSearches.emptyState)}&date=${plannerSmokeFixtureDate}`)
    await this.waitForSearchToSettle()
    await expect(this.page.getByText(/search results/i).first()).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /no current live rows for SBP → NRT yet/i })).toBeVisible()
    await expect(this.page.getByText(/will not relabel stale, demo, historical, or positioning guidance as live availability/i)).toBeVisible()
  }

  async expectFeedbackButtonsRender() {
    await this.goto('/')
    await expect(this.page.getByRole('link', { name: /report issue/i })).toBeVisible()
    await expect(this.page.getByRole('link', { name: /send feedback/i })).toBeVisible()
  }

  async expectOnboardingAppearsOnlyForFirstTimeUsers() {
    await this.resetFirstRunState()
    await this.goto('/profile')
    await expect(this.page.getByRole('link', { name: /start onboarding/i })).toBeVisible()
    await expect(this.page.getByRole('link', { name: /review onboarding/i })).toHaveCount(0)

    await this.markOnboardingComplete()
    await this.goto('/profile')
    await expect(this.page.getByRole('link', { name: /review onboarding/i })).toBeVisible()
    await expect(this.page.getByRole('link', { name: /start onboarding/i })).toHaveCount(0)
  }

  async expectFirstRunOnboardingAppears() {
    await this.resetFirstRunState()
    await this.goto('/onboarding')
    await expect(this.page.getByText(/first-run onboarding/i).first()).toBeVisible()
    await expect(this.page.getByText(/screen 1 of 3/i)).toBeVisible()
    await expect(this.page.getByRole('heading', { name: /confidence scores are planning signals/i })).toBeVisible()
    await expect(this.page.getByRole('button', { name: /^skip$/i }).first()).toBeVisible()
  }

  async expectOnboardingSkipWorks() {
    await this.resetFirstRunState()
    await this.goto('/onboarding')
    await this.page.getByRole('button', { name: /^skip$/i }).first().click()
    await expect(this.page).toHaveURL(/\/plan$/)
    await expect(this.page.getByRole('heading', { name: /plan your nonrevy route/i })).toBeVisible()
    await expect.poll(async () => this.page.evaluate(() => Boolean(window.localStorage.getItem('nonrevy.onboardingSkippedAt')))).toBe(true)
  }

  async expectMobileViewportRendersWithoutOverflow() {
    await this.installPlannerFixture('itineraryCards')
    await this.page.setViewportSize({ width: 390, height: 844 })
    await this.goto(`/results?q=${encodeURIComponent(plannerSmokeSearches.itineraryCards)}&date=${plannerSmokeFixtureDate}`)
    await this.waitForSearchToSettle()
    await expect(this.itineraryCards().first()).toBeVisible()
    const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
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
  test.describe('NONREVY reusable browser smoke tests', () => {
    test('homepage loads successfully', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectHomepageLoads()
    })

    test('planner page loads', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectPlannerPageLoads()
    })

    test('search form renders', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectSearchFormRenders()
    })

    test('itinerary cards render when supplied fixture data', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectItineraryCardsRenderFromFixture()
    })

    test('origin coverage notice displays correctly', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectOriginCoverageNoticeRenders()
    })

    test('empty state renders correctly', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectEmptyStateRenders()
    })

    test('feedback button renders', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectFeedbackButtonsRender()
    })

    test('onboarding appears only for first-time users', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectOnboardingAppearsOnlyForFirstTimeUsers()
    })

    test('onboarding skip works', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectOnboardingSkipWorks()
    })

    test('mobile viewport renders without overflow', async ({ page }) => {
      await createNonrevyBrowserSmokeHarness(page).expectMobileViewportRendersWithoutOverflow()
    })
  })
}
