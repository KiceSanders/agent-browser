# Scratch Pad Requirement

Use this file as a scratch pad. Constantly update it after every interaction with helpful, actionable information (new findings, failures, fixes, commands run, and follow-up notes). Keep newest interaction notes at the top of the interaction log.

# Recent Interaction Log

## 2026-02-09

- Implemented icon-label normalization for Myhelo snapshot output in `src/snapshot.ts`:
  - Added PUA icon detection (`U+E000..U+F8FF`, `U+F0000..U+FFFFD`, `U+100000..U+10FFFD`).
  - Added display normalization for interactive labels:
    - icon-only -> semantic `<...>` when inferred, else `<icon-u+...>`
    - mixed icon+text -> strip leading icon glyphs (e.g., `󰋘 Projects` -> `Projects`)
  - Applied normalization to both:
    - cursor-interactive lines (`clickable ...`)
    - ARIA interactive lines (`button ...`, etc.)
  - Kept raw names in refs/selectors for stability (`refs[ref].name` and `buildSelector(role, rawName)` unchanged).
- Added TDD coverage in `src/browser.test.ts`:
  - `should normalize myhelo-style icon-only labels to angle-bracket names`
  - Covers:
    - semantic class token icon-only -> `clickable "<menu>"`
    - unknown icon-only -> `clickable "<icon-u+f0156>"`
    - mixed icon+text -> `clickable "Projects"`
    - ARIA icon-only button -> `button "<icon-u+f0415>"`
  - Includes negative assertions to ensure raw glyph labels are absent.
- Confirmed red-state before fix:
  - `pnpm vitest run src/browser.test.ts -t "normalize myhelo-style icon-only labels"` ❌
  - Failure showed raw output (`clickable "󰇙"`, `button "󰐕"`, etc.) instead of `<...>`.
- Post-fix verification commands and results:
  - `pnpm vitest run src/browser.test.ts -t "normalize myhelo-style icon-only labels"` ✅
  - `pnpm vitest run src/browser.test.ts -t "icon-only|styx-style nav buttons|cursor"` ✅
  - `pnpm vitest run src/browser.test.ts -t "partition myhelo layout|skip sidebar and drawer sections"` ✅
  - `pnpm build` ✅
  - `agent-browser close` ✅
  - `bash myhelo/workflows/chat.sh` ✅
  - `agent-browser snapshot -i -C` ✅
- Live Myhelo validation after fix:
  - Top-level icon-only clickable now renders as `<icon-u+f0156>`.
  - Sidebar menu icon now renders as `<menu>`.
  - ARIA FAB icon button now renders as `<icon-u+f0415>`.
  - Mixed sidebar labels now render readable text without leading icon glyphs (`Projects`, `Files`, etc.).

## 2026-02-08

- Restarted daemon after latest build to ensure new snapshot logic is active:
  - `agent-browser close`
- FAB visibility regression reported by user: FAB was visible in live Myhelo but `snapshot -i -C` omitted `# FAB:`.
- Live repro details:
  - `agent-browser snapshot -i -C` output included `# Sidebar:` + `# Contents:` only.
  - `agent-browser eval` found a visible floating button:
    - `tag=button`, `class=circle`
    - `position=fixed`, `width/height=48x48`, `borderRadius=24px`, `zIndex=100`
    - `left/top/right/bottom=1200/592/1248/640` within `1280x672` viewport
    - no `fab` token in id/class
- Added failing TDD test in `src/browser.test.ts`:
  - `should include FAB section for myhelo floating circle button without fab class token`
  - Red-state command:
    - `pnpm vitest run src/browser.test.ts -t "floating circle button without fab class token"` (failed; no `# FAB:`)
- Fix in `src/snapshot.ts` (`getMyheloActiveRegions`):
  - Kept existing token detection (`fab` in id/class).
  - Added fallback FAB heuristic for floating controls:
    - visible + on-screen
    - fixed/sticky (or absolute with high z-index)
    - compact dimensions (32..120 px)
    - near bottom-right corner
    - interactive (`button/a`, role button/link, pointer/onclick/tabindex)
    - rounded (`circle` class token or border-radius threshold)
- Updated assertion in the new test to match actual ARIA output (`button "+"` rather than title text).
- Post-fix verification:
  - `pnpm vitest run src/browser.test.ts -t "floating circle button without fab class token|partition myhelo layout|skip sidebar and drawer sections"` ✅
  - `pnpm build` ✅
- Additional note:
  - `pnpm vitest run src/browser.test.ts -t "snapshot"` surfaced pre-existing environment issues (`test_styx_buttons.html` file not found and a separate timeout in locator-resolution after fixture failure), not introduced by this FAB fix.
- Post-cleanup verification:
  - Removed accidental unused `windowRef` declaration from cursor-interactive evaluator.
  - Re-ran `pnpm build` ✅
  - Re-ran `pnpm vitest run src/browser.test.ts -t "partition myhelo layout|skip sidebar and drawer sections"` ✅
- Live regression check after detector update:
  - `bash myhelo/workflows/login.sh && agent-browser snapshot -i -C && agent-browser click @e3 && agent-browser wait 500 && agent-browser frame sub && agent-browser snapshot -i -C`
  - Sub-frame output is now regioned with `# Sidebar:` and `# Contents:` sections.
  - Hidden off-screen drawer is excluded (no `# Drawer:` section when drawer is not active).
- Added Myhelo detector support for alternate content layout IDs/classes:
  - `#panel-header`, `#panel-center`, `#panel-footer`, `.component.reverb.threads`
  - Existing selectors retained: `#contents-*`, `.component.reverb.messages`
- Root cause for initial live mismatch after first implementation:
  - Chat-thread list state used `#panel-center` instead of `#contents-center`, so strict `#contents-center` gate prevented sectioning.
- Additional verification commands:
  - `agent-browser snapshot` ✅ regioned
  - `agent-browser snapshot --compact` ✅ regioned
  - `pnpm build` ✅
- Note: `agent-browser click @e19` failed once with strict-selector ambiguity on a duplicated icon label; unrelated to region visibility gating.
- Rebuilt TypeScript and restarted daemon after test updates:
  - `pnpm build`
  - `agent-browser close`
- Updated TDD: off-screen sidebar/drawer test now also hides FAB and asserts `# FAB:` is absent.
- Verified region partitioning passes with:
  - `pnpm vitest run src/browser.test.ts -t "partition myhelo layout|skip sidebar and drawer sections"`
- Noted user confirmation: FAB is not visible on the current chat-thread screen; region logic already excludes hidden/off-screen FAB candidates.
- Added TDD tests in `src/browser.test.ts` for Myhelo region partitioning:
  - `should partition myhelo layout into sidebar/contents/drawer/fab across snapshot modes`
  - `should skip sidebar and drawer sections when they are off-screen`
- Confirmed red-state via:
  - `pnpm vitest run src/browser.test.ts -t "partition myhelo layout|skip sidebar and drawer sections"`
- Failure baseline (expected):
  - Snapshot output is still a flat list (`- document: ...`) with no `# Sidebar:`/`# Contents:`/`# Drawer:`/`# FAB:` sections.
  - Hidden/off-screen sidebar/drawer are still included because region visibility filtering is not implemented yet.
- Ran `bash myhelo/workflows/chat.sh` (escalated due socket dir write) to reproduce chat-thread state in live Myhelo.
- Observed current `snapshot -i -C` in sub-frame is flat (not region-partitioned): clickables and thread/sidebar items are mixed in one list.
- Confirmed Myhelo sub-frame region IDs/classes exist:
  - Sidebar: `#sidebar-header`, `#sidebar-center`, `#sidebar-footer`, `.component.reverb.sidebar`
  - Contents: `#contents-header`, `#contents-center`, `#contents-footer`
  - Drawer: `#drawer-container`, `#drawer-header`, `#drawer-center`, `#drawer-footer`
- Verified hidden drawer behavior in chat view:
  - `#drawer-container` rect is off-screen (`left=1280`, `right=1640` with viewport width `1280`) and transformed (`matrix(..., 360, 0)`), so it should be treated as inactive.
- Checked for FAB naming hooks in live chat DOM (`id/class` matching `fab`) and found none in this state.
- `agent-browser frame sub` failed once with `Visible subframe not found` because current context was already inside the sub frame.
- Validated command syntax in live session: `agent-browser wait --fn "document.querySelectorAll('.component.loading').length === 0"` returned `✓ Done`.
- Confirmed `agent-browser wait --fn "<js expression>"` is the right way to replace fixed sleep in `myhelo/workflows/login.sh` for loader disappearance; `wait` action supports selector state internally (`attached|detached|visible|hidden`) but CLI parser currently does not expose a `--state` flag.
- Suggested waiting on `.component.loading` elements via JS condition (e.g., zero matches or all hidden/off-screen) instead of `agent-browser wait 3000`.
- Ran `agent-browser snapshot` from repo root on user request; output showed:
  - `document` with text including `Modules`, `Support request`, `Chat & teams`, `Logout`, and `Training Center`
  - one `iframe` node
- Reproduced real workflow issue on `https://provider.myhelo.com` where `agent-browser snapshot -i -C` returned `(no interactive elements)` after login even though nav controls (Modules, Support request, Chat & teams) were visibly clickable.
- Verified live DOM had many `cursor:pointer` nodes post-login via `agent-browser eval`, proving page-side detection signals existed.
- Identified root cause: `cursor` was dropped during protocol parsing because `snapshotSchema` in `src/protocol.ts` did not include `cursor`.
- Added protocol-level tests in `src/protocol.test.ts` for snapshot cursor parsing; confirmed they failed before the fix.
- Fixed schema/type path:
  - Added `cursor?: boolean` to `snapshotSchema` in `src/protocol.ts`.
  - Expanded `SnapshotCommand` in `src/types.ts` to include `interactive`, `cursor`, `maxDepth`, `compact`, and `selector`.
- Rebuilt/restarted and re-ran full login script; `snapshot -i -C` now correctly returns clickable refs including:
  - `Modules`
  - `Support request`
  - `Chat & teams`
  - `Logout`
- Test/verification commands run:
  - `pnpm vitest run src/protocol.test.ts`
  - `pnpm vitest run src/browser.test.ts -t "cursor|styx"`
  - `pnpm build`
  - `agent-browser close`
- Additional note: current environment does not have `cargo`; `pnpm build:native` cannot run until Rust toolchain is installed.

# Agent Guidelines for agent-browser

## Project Overview

Headless browser automation CLI for AI agents. Rust CLI frontend with a Node.js daemon backend that wraps Playwright.

## Architecture

```
CLI (Rust or Node.js fallback)
  ↓ Unix socket / TCP (JSON protocol)
daemon.ts — manages sessions, dispatches commands
  ↓
actions.ts — executeCommand() switch dispatches to ~60 handler functions
  ↓
browser.ts — BrowserManager class wrapping Playwright (pages, frames, tabs, CDP)
snapshot.ts — Accessibility tree snapshots with ref-based element addressing
protocol.ts — Zod schemas for command validation, JSON serialization
types.ts — TypeScript interfaces for all commands and responses
```

### Key Files

| File | Purpose |
|------|---------|
| `src/browser.ts` | `BrowserManager` class — browser lifecycle, page/frame/tab management, CDP session, screencast, recording |
| `src/actions.ts` | `executeCommand()` + ~60 `handle*()` functions — one per CLI action |
| `src/types.ts` | TypeScript interfaces for every command and response type |
| `src/protocol.ts` | Zod schemas mirroring `types.ts`, plus `parseCommand()`/`serializeResponse()` |
| `src/snapshot.ts` | `getEnhancedSnapshot()` — accessibility tree with `@e1`-style refs |
| `src/daemon.ts` | Unix socket/TCP server, session management, stream server integration |
| `src/stream-server.ts` | WebSocket server for live browser viewport streaming |
| `src/ios-manager.ts` | iOS Simulator browser control via Appium |
| `src/ios-actions.ts` | iOS-specific command handlers |
| `bin/agent-browser.js` | Node.js CLI entry point (fallback when native binary unavailable) |
| `cli/src/` | Rust CLI source code |

### Data Flow for a Command

1. CLI parses args → builds JSON command → sends to daemon socket
2. `daemon.ts` receives JSON → `parseCommand()` validates via Zod schemas
3. `executeCommand(command, browser)` in `actions.ts` — big switch on `command.action`
4. Individual `handle*()` function runs Playwright operations via `BrowserManager`
5. Returns `Response` object → serialized as JSON → sent back to CLI

## Build & Test

```bash
pnpm install          # Install dependencies
pnpm build            # TypeScript compile (tsc) → dist/
pnpm test             # Run all tests (vitest run)
pnpm test:watch       # Watch mode
pnpm typecheck        # Type-check without emitting
pnpm format           # Prettier
pnpm build:native     # Build Rust CLI (requires rustup)
```

- **Package manager**: pnpm
- **Module system**: ESM (`"type": "module"` in package.json)
- **TypeScript**: Strict mode, target ES2022, NodeNext module resolution
- **Test framework**: Vitest v4 with `globals: true`
- **Test files**: `src/**/*.test.ts` and `test/**/*.test.ts`
- **Test timeout**: 30 seconds (browser tests need time)
- **Imports**: Must use `.js` extension for local imports (ESM + NodeNext)

### Applying Source Changes

After editing any TypeScript files in `src/`, you must rebuild and restart the daemon for changes to take effect:

```bash
pnpm build            # Recompile src/ → dist/
agent-browser close   # Stop the running daemon (picks up new code on next command)
```

The daemon auto-starts on the next `agent-browser` command, so there is no separate "start" step — just close the old one and run any command.

If you haven't linked the package globally yet (so `agent-browser` is available in your PATH), run this once:

```bash
pnpm link --global    # Makes `agent-browser` available system-wide
```

## Patterns & Conventions

### Adding a New Command

1. **Define the type** in `src/types.ts` — add a command interface extending `BaseCommand` and add it to the `Command` union type
2. **Add Zod schema** in `src/protocol.ts` — mirror the interface, add to the `commandSchema` discriminated union
3. **Add handler** in `src/actions.ts` — write `async function handleFoo(command: FooCommand, browser: BrowserManager): Promise<Response>`, add case to `executeCommand()` switch
4. **Write tests** — unit tests in `src/actions.test.ts` or integration tests in `test/`

### Handler Pattern

Every handler follows the same signature:

```typescript
async function handleFoo(command: FooCommand, browser: BrowserManager): Promise<Response> {
  // ... do work with browser ...
  return successResponse(command.id, { /* data */ });
}
```

- Use `successResponse(id, data)` and `errorResponse(id, message)` from `protocol.ts`
- The outer `try/catch` in `executeCommand()` catches thrown errors automatically
- Use `toAIFriendlyError()` to convert Playwright errors to helpful messages (for element interaction handlers)

### Page vs Frame Scoping

`BrowserManager` has two key methods:
- `getPage()` — always returns the active Playwright `Page`
- `getFrame()` — returns the active `Frame` (or `page.mainFrame()` if no frame is selected)

**Use `getFrame()` / `browser.getLocator()`** for handlers that interact with page content (clicking, reading text, evaluating JS, waiting for selectors, etc.). This ensures commands work inside iframes after `frame <selector>`.

**Use `getPage()`** for page-level operations that don't change with iframe context: navigation, screenshots, tabs, cookies, storage, keyboard/mouse input, CDP sessions, etc.

The `getLocator(selector)` method on `BrowserManager` handles both ref resolution (`@e1`) and CSS selectors, routing through `getFrame()` internally.

### Snapshot & Refs

- `getEnhancedSnapshot()` walks the accessibility tree and assigns refs like `e1`, `e2`
- Refs are stored in `BrowserManager.refMap` and resolved via `getLocatorFromRef()`
- `getLocator()` tries ref resolution first, then falls back to CSS selector
- Snapshot accepts `Page | Frame` so it works in both main page and iframe contexts

### Response Types

Some handlers return typed data — define the data interface in `types.ts` and use it in the response:

```typescript
// In types.ts
export interface FooData { bar: string; }

// In actions.ts
async function handleFoo(...): Promise<Response<FooData>> {
  return successResponse(command.id, { bar: 'baz' });
}
```

## Testing

- Tests launch real Chromium via Playwright — they're integration tests, not unit tests
- Use `browser.launch({ headless: true })` in `beforeAll`, `browser.close()` in `afterAll`
- Use `page.setContent(html)` to set up test pages with inline HTML
- For iframe tests, use `srcdoc` attribute and wait for iframe content to load
- Test commands via `executeCommand({ id: '1', action: 'foo', ... }, browser)`
- Check `response.success` and `(response as any).data.*` for results
- Tests that need network (e.g., `page.goto('https://...')`) work in the existing test suite
- The serverless test (`test/serverless.test.ts`) only runs on Linux and is skipped elsewhere

## Important Notes

- The Rust CLI (`cli/`) and Node.js code share version numbers — `scripts/sync-version.js` keeps them in sync
- `dist/` is the compiled output; `src/` is the source of truth
- Cloud providers (Browserbase, Browser Use, Kernel) connect via CDP — handled in `BrowserManager.launch()`
- iOS support is a separate code path (`ios-manager.ts` + `ios-actions.ts`) that uses Appium/WebDriverIO instead of Playwright
- Husky + lint-staged runs Prettier on commit
