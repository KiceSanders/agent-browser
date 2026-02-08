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
