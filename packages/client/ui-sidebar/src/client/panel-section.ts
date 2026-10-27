/** Persisted expansion preference for the sidebar's global-panel section. */

/** Storage namespace; the value records only the collapsed choice. */
const storageKey = 'dsh.sidebar.panel-section.v1'

/**
 * Read the saved section preference.
 * @returns false only when a collapsed choice was saved; missing, unreadable,
 * or malformed storage expands the section.
 */
export function readPanelSectionExpanded(): boolean {
  if (typeof localStorage === 'undefined') return true
  let raw: string | null
  try { raw = localStorage.getItem(storageKey) }
  catch (_storageUnavailable) { return true }
  return raw !== 'collapsed'
}

/**
 * Persist the section preference. The expanded state is the default, so it
 * clears the key instead of writing a value.
 * @param expanded - whether the global-panel section shows its rows.
 */
export function writePanelSectionExpanded(expanded: boolean): void {
  try {
    if (expanded) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, 'collapsed')
  }
  catch (_storageUnavailable) { /* The preference stays window-local. */ }
}
