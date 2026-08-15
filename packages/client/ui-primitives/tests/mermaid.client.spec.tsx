// @vitest-environment jsdom
// MermaidBlock + the renderCode ```mermaid branch: the mermaid module is
// mocked (its ~500 KB of layout code has no place in a unit run), so these
// tests pin the loading/fallback contract — settled fences render the
// diagram, any failure degrades to the source CodeBlock, streaming fences
// never touch mermaid.
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}))

vi.mock('mermaid', () => ({ default: mermaidMock }))

afterEach(cleanup)

const FENCE = '```mermaid\ngraph TD\n  A-->B\n```'

beforeEach(() => {
  mermaidMock.parse.mockReset()
  mermaidMock.render.mockReset()
  mermaidMock.parse.mockResolvedValue({})
  mermaidMock.render.mockImplementation(async (_id: string, code: string) => ({
    svg: `<svg data-testid="mermaid-diagram" data-code="${encodeURIComponent(code)}"></svg>`,
  }))
})

describe('MarkdownText mermaid fences', () => {
  it('a settled mermaid fence renders the diagram SVG with a strict sandbox', async () => {
    const { container } = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(container.querySelector('svg[data-testid="mermaid-diagram"]')).not.toBeNull()
    })
    expect(container.querySelector('.md-code-block')).toBeNull()
    expect(mermaidMock.initialize).toHaveBeenCalledWith(expect.objectContaining({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
    }))
    expect(mermaidMock.parse).toHaveBeenCalledWith('graph TD\n  A-->B')
  })

  it('a source that fails to parse falls back to the source CodeBlock', async () => {
    mermaidMock.parse.mockRejectedValue(new Error('Parse error on line 1'))
    const { container } = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(container.querySelector('.md-code-block')).not.toBeNull()
    })
    expect(container.querySelector('pre code')?.textContent).toContain('graph TD')
    expect(container.querySelector('svg[data-testid="mermaid-diagram"]')).toBeNull()
  })

  it('a render failure also falls back to the source CodeBlock', async () => {
    mermaidMock.render.mockRejectedValue(new Error('layout failed'))
    const { container } = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(container.querySelector('.md-code-block')).not.toBeNull()
    })
    expect(container.querySelector('pre code')?.textContent).toContain('graph TD')
  })

  it('a streaming fence renders the plain source and never loads mermaid', () => {
    const { container } = render(<MarkdownText text={FENCE} streaming />)
    expect(container.querySelector('pre code')?.textContent).toContain('graph TD')
    expect(container.querySelector('svg[data-testid="mermaid-diagram"]')).toBeNull()
    expect(mermaidMock.parse).not.toHaveBeenCalled()
    expect(mermaidMock.render).not.toHaveBeenCalled()
  })

  it('re-renders when the fence source changes, never flashing a stale diagram', async () => {
    const view = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(view.container.querySelector(
        'svg[data-code="' + encodeURIComponent('graph TD\n  A-->B') + '"]',
      )).not.toBeNull()
    })
    const edited = '```mermaid\ngraph TD\n  A-->C\n```'
    view.rerender(<MarkdownText text={edited} />)
    await waitFor(() => {
      expect(view.container.querySelector(
        'svg[data-code="' + encodeURIComponent('graph TD\n  A-->C') + '"]',
      )).not.toBeNull()
    })
    expect(mermaidMock.render).toHaveBeenCalledWith(expect.any(String), 'graph TD\n  A-->C')
    expect(view.container.querySelector(
      'svg[data-code="' + encodeURIComponent('graph TD\n  A-->B') + '"]',
    )).toBeNull()
  })

  it('an unmount before the diagram lands applies no state update', async () => {
    let resolveRender: ((value: { svg: string }) => void) | undefined
    mermaidMock.render.mockImplementation(
      () => new Promise<{ svg: string }>((resolve) => { resolveRender = resolve }),
    )
    const view = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(mermaidMock.render).toHaveBeenCalled()
    })
    view.unmount()
    resolveRender?.({ svg: '<svg data-testid="mermaid-diagram"></svg>' })
    // Let the settled promise flush; nothing may render after the unmount.
    await waitFor(() => {
      expect(view.container.querySelector('svg')).toBeNull()
    })
  })

  it('an unmount before a failure lands applies no state update either', async () => {
    let rejectParse: ((reason: Error) => void) | undefined
    mermaidMock.parse.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectParse = reject }),
    )
    const view = render(<MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(mermaidMock.parse).toHaveBeenCalled()
    })
    view.unmount()
    rejectParse?.(new Error('late parse failure'))
    await waitFor(() => {
      expect(view.container.querySelector('.md-code-block')).toBeNull()
    })
  })

  it('falls back to the source CodeBlock when the mermaid chunk fails to load', async () => {
    // A fresh module graph gives MermaidBlock a fresh singleton whose dynamic
    // import rejects; the fence must degrade instead of throwing.
    vi.resetModules()
    vi.doMock('mermaid', () => {
      throw new Error('chunk load failed')
    })
    const fresh = await import('@deepseek-ai/dsh-client-ui-primitives')
    const view = render(<fresh.MarkdownText text={FENCE} />)
    await waitFor(() => {
      expect(view.container.querySelector('.md-code-block')).not.toBeNull()
    })
    expect(view.container.querySelector('pre code')?.textContent).toContain('graph TD')
    // Restore the working mock for any later import in this file.
    vi.doMock('mermaid', () => ({ default: mermaidMock }))
  })
})
