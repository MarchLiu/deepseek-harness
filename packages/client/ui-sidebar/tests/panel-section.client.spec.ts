// @vitest-environment jsdom
/** Persisted global-panel section preference: storage round-trip and failure arms. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPanelSectionExpanded, writePanelSectionExpanded } from '../src/client/panel-section.ts'

const KEY = 'dsh.sidebar.panel-section.v1'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('panel-section preference', () => {
  it('starts expanded without a stored choice and round-trips the collapse choice', () => {
    expect(readPanelSectionExpanded()).toBe(true)
    writePanelSectionExpanded(false)
    expect(localStorage.getItem(KEY)).toBe('collapsed')
    expect(readPanelSectionExpanded()).toBe(false)
    // Expanded is the default, so it clears the key instead of writing a value.
    writePanelSectionExpanded(true)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(readPanelSectionExpanded()).toBe(true)
  })

  it('treats a malformed stored value as expanded', () => {
    localStorage.setItem(KEY, 'opened')
    expect(readPanelSectionExpanded()).toBe(true)
  })

  it('starts expanded where no localStorage exists at all', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(readPanelSectionExpanded()).toBe(true)
    expect(() => { writePanelSectionExpanded(false) }).not.toThrow()
  })

  it('keeps the preference window-local when storage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readPanelSectionExpanded()).toBe(true)
  })

  it('keeps the preference window-local when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => { writePanelSectionExpanded(false) }).not.toThrow()
  })
})
