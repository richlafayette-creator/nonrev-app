import { test } from '@playwright/test'
import { defineNonrevyBrowserSmokeTests } from './smokeHarness'

defineNonrevyBrowserSmokeTests(test)
