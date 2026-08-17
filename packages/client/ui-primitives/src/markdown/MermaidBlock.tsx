/**
 * Settled ```mermaid fences render as diagrams. The mermaid module (~500 KB)
 * stays behind a dynamic import so a session without diagrams never pays it;
 * the fence shows its source CodeBlock while the module loads. A source that
 * fails to parse or render, or a module that fails to load, falls back to the
 * same CodeBlock — an assistant-authored diagram is untrusted input and a
 * broken one must degrade, never throw, matching the unknown-grammar rule in
 * highlight.ts.
 *
 * Security: `securityLevel: 'strict'` sanitizes labels through DOMPurify
 * before mermaid returns the SVG; the resulting string is mermaid's own
 * output, the same sanctioned innerHTML consumption path shiki's output uses.
 * The theme is mermaid's built-in `neutral` palette — diagram colors are
 * mermaid-internal runtime configuration, not component CSS, so the
 * tokens-only styling rule does not apply; the font still follows
 * `--dsw-font-family` through a `var()` reference.
 */

import { useEffect, useState } from 'react'
import { CodeBlock } from './CodeBlock.tsx'
import css from './MermaidBlock.module.css'

/** The mermaid API surface this component consumes. */
interface MermaidApi {
  initialize(config: Record<string, unknown>): void
  parse(text: string): Promise<unknown>
  render(id: string, text: string): Promise<{ svg: string }>
}

let mermaidSingleton: Promise<MermaidApi> | undefined

/**
 * Load and initialize mermaid once per session; a failed import is not cached
 * so a later fence retries the (possibly transient) chunk load.
 * @returns the initialized mermaid API.
 */
function loadMermaid(): Promise<MermaidApi> {
  mermaidSingleton ??= import('mermaid').then(
    (module) => {
      const api = module.default as unknown as MermaidApi
      api.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        fontFamily: 'var(--dsw-font-family)',
      })
      return api
    },
    (error: unknown) => {
      mermaidSingleton = undefined
      throw error
    },
  )
  return mermaidSingleton
}

/** Unique ids for mermaid.render's temporary mount point. */
let renderCounter = 0

/** One diagram render's outcome. */
type MermaidOutcome = { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'error' }

export interface MermaidBlockProps {
  /** The mermaid source, without the trailing newline parity shim. */
  code: string
  /** Copy-button idle label for the loading/fallback source CodeBlock. */
  copyLabel?: string | undefined
  /** Copy-button confirmation label for the loading/fallback source CodeBlock. */
  copiedLabel?: string | undefined
}

/**
 * Render one mermaid diagram; while the module loads, after a source change,
 * or on any parse/render failure, the source CodeBlock stands in.
 * @param props - the fence source and CodeBlock labels.
 * @returns the diagram, or its source CodeBlock.
 */
export function MermaidBlock({ code, copyLabel, copiedLabel }: MermaidBlockProps) {
  // The settled outcome keyed to the source it was produced from; a source
  // change renders the loading CodeBlock until the new diagram lands, so a
  // stale diagram never flashes against edited source.
  const [outcome, setOutcome] = useState<{ code: string; result: MermaidOutcome }>({
    code,
    result: { status: 'loading' },
  })
  useEffect(() => {
    let cancelled = false
    loadMermaid()
      .then(async (api) => {
        await api.parse(code)
        const { svg } = await api.render(`dsh-mermaid-${renderCounter++}`, code)
        return svg
      })
      .then((svg) => {
        if (!cancelled) setOutcome({ code, result: { status: 'ready', svg } })
      })
      .catch(() => {
        if (!cancelled) setOutcome({ code, result: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [code])
  const result: MermaidOutcome = outcome.code === code ? outcome.result : { status: 'loading' }
  if (result.status === 'ready') {
    return (
      <div className={css.block}>
        <div className={css.diagram} dangerouslySetInnerHTML={{ __html: result.svg }} />
      </div>
    )
  }
  return (
    <CodeBlock
      code={`${code}\n`}
      lang="mermaid"
      copyLabel={copyLabel}
      copiedLabel={copiedLabel}
    />
  )
}
