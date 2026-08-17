// Web e2e scenario: a settled ```mermaid fence in an assistant message renders
// as a diagram, not a code block. The hand-authored fixture carries one closed
// text-only turn whose assistant message is prose around one fence, so the
// scenario needs no model call: it seeds the session, opens it, and pins the
// assembled browser DOM — the diagram SVG present, the source CodeBlock gone —
// plus the conversation aria golden.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden, fixtureUserPrompts,
  launchWebScaffold, seedSession, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const FIXTURE = fileURLToPath(new URL('./snapshots/mermaid-fence/session.jsonl', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/mermaid-fence', import.meta.url))
const UI_EXPECTED = join(SNAPSHOT_DIR, 'ui.expected.md')
const MODE = webSnapshotMode()
const SEED_ID = 'mermaid-fence-web-e2e'
const PROMPT = 'Draw a small flowchart with one decision loop.'

describe.skipIf(MODE === 'record')('web e2e: mermaid fence renders as a diagram', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    const fixture = await readFile(FIXTURE, 'utf8')
    expect(fixtureUserPrompts(fixture)).toEqual([PROMPT])
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, fixture, SEED_ID)
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })

    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    // Mermaid sets an aria roledescription on its SVG; the dynamic import and
    // layout make the swap from the loading CodeBlock asynchronous.
    await page.locator('svg[aria-roledescription]').first().waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the diagram and retires the source CodeBlock', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-mermaid-fence'))
    // The fixture's only fence is the mermaid one, so a page-level absence of
    // the CodeBlock chrome means the fallback did not engage.
    await expect.poll(() => page.locator('.md-code-block').count()).toBe(0)
    // The node labels land in the diagram's accessible tree.
    await expect.poll(() => page.locator('svg[aria-roledescription]').count()).toBe(1)

    const snapshot = (await captureStableAria(page, '[class*="centerCol"]', scaffold.workspaceCwd))
      .replace(/\b\d{1,2}\/\d{1,2}(?= \{\{clock\}\})/g, '{{date}}')
      .split(SEED_ID).join('{{seededId}}')
    await compareOrRefreshGolden(UI_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['session.jsonl', 'ui.expected.md'])
  })
})
