# Agent Note: Mermaid fences render as diagrams in the web client

Status: implemented

English | [中文](2026-08-15-mermaid-fence-rendering.zh.md)

## Problem

Assistant replies carrying ` ```mermaid ` fences rendered as plain code blocks. The web client's markdown renderer (`MarkdownText`, `packages/client/ui-primitives`) maps every fence language to `CodeBlock`; only `math` has a semantic rendering. A user asking the agent to draw a flowchart or sequence diagram got source text they had to copy into an external renderer, even though the fence language already declares the intent.

## Decision

`renderCode` (`ui-primitives/src/markdown/render.tsx`) gains a settled-only branch: a fence whose info string is `mermaid` renders through the new `MermaidBlock` component; while streaming it stays a source `CodeBlock` like every other fence, so the frozen-block streaming cache never bakes in async work.

`MermaidBlock` (`ui-primitives/src/markdown/MermaidBlock.tsx`):

- loads mermaid behind a dynamic import — the ~500 KB module stays out of the boot chunk, and a session without diagrams never pays it — and initializes it once with `startOnLoad: false`, `securityLevel: 'strict'`, the built-in `neutral` palette, and `fontFamily: 'var(--dsw-font-family)'`;
- validates the source with `mermaid.parse` before `mermaid.render`;
- on any failure — chunk load, parse, or render — falls back to the source `CodeBlock` (never throws, matching the unknown-grammar rule in `highlight.ts`); a failed chunk import is not cached, so a later fence retries;
- keys the settled outcome to the source it came from, so an edited fence renders the loading `CodeBlock` until the new diagram lands rather than flashing a stale SVG;
- injects mermaid's own SVG output through `dangerouslySetInnerHTML` — with `securityLevel: 'strict'` mermaid runs labels through DOMPurify before emitting, so this is the same sanctioned consumption path shiki's generated span tree uses.

The theme is `neutral`, a deliberate choice: `base` is the only mermaid theme that reads `themeVariables`, and its color math (khroma) cannot parse CSS `var()` references, while literal colors would violate the tokens-only styling rule and freeze diagrams against light/dark switches. Diagram colors are mermaid-internal runtime configuration, not component CSS; the font still follows the app through the `var()` font-family, which mermaid writes verbatim into the SVG.

## Alternatives considered

**A fence-renderer registry so client plugins own diagram rendering.** Rejected: `ui-primitives` is deliberately cordis-free, and the `math` fence branch is the standing precedent — fence semantics belong to the one renderer, which is where the untrusted-output policy lives.

**`theme: 'base'` with `themeVariables` mapped to `--dsw-*` tokens.** Rejected: khroma's color parser rejects `var()` strings at render time, so diagrams would fall back to source or crash depending on the diagram type.

**Render mermaid to an image on the host and attach it.** Rejected: markdown never renders local-path images (the untrusted-content policy), so the diagram would need attachment plumbing the text channel does not have, and the result loses copyable source and text accessibility.

## Consequences

A settled ` ```mermaid ` fence renders as a diagram in every `MarkdownText` surface (chat, plan review, question detail, trajectory). Sessions without mermaid fences never load the module. A broken diagram degrades to its source block with the copy control intact. The DOM-parity fixtures are untouched: the corpus contains no mermaid fence, and the streaming DOM for one is the same plain `CodeBlock` as before.

## Testing

`packages/client/ui-primitives/tests/mermaid.client.spec.tsx` mocks the mermaid module and pins: the settled render with the strict-sandbox initialize config; parse-failure and render-failure fallback; streaming fences never loading mermaid; re-render on source change with no stale flash; unmount-before-settle on both the success and failure arms; and chunk-load failure falling back on a fresh module graph. `MermaidBlock.tsx` and `render.tsx` hold 100% line/branch coverage; the full 22-file ui-primitives suite, including the byte-pinned DOM-parity fixtures, stays green.

The assembled-browser transcript is `apps/web/tests/mermaid-fence.e2e.ts`: a hand-authored keyless fixture (one closed text-only turn whose assistant message wraps one mermaid fence) seeded through the real backend, opened in Playwright Chromium, asserting the mermaid SVG replaces the source `CodeBlock` with no console warnings, and pinning the conversation aria golden (`snapshots/mermaid-fence/ui.expected.md`), where the diagram surfaces as its accessible `document` subtree of node labels.

## Related

- [Web markdown incremental AST renderer](../architecture/2026-08-06-web-markdown-incremental-ast-renderer.md) — the streaming/frozen-block pipeline this branch hooks into.
