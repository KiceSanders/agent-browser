# Iframe Support Fix

## Problem

After calling `frame <selector>` to switch into an iframe, only 4 places were updated to use `getFrame()` instead of `getPage()`: `getSnapshot()`, `getLocator()`, `getLocatorFromRef()` in `browser.ts`, and `handleEvaluate()` in `actions.ts`. The remaining ~30 handlers in `actions.ts` still called `browser.getPage()` directly, meaning those commands continued to operate on the main page even after switching to an iframe.

## Solution

The `getFrame()` method already falls back to `page.mainFrame()` when no iframe is selected, so switching handlers from `getPage()` to `getFrame()` (or from `page.locator()` to `browser.getLocator()`) is fully backward-compatible.

## Changes

### `src/browser.ts`

- **`switchToFrame()`**: Changed `page.$(options.selector)` to `this.getFrame().$(options.selector)` so that nested iframe selection searches from the current frame, not always from the main page.
- **`getSnapshot()`**: Uses `this.getFrame()` instead of `this.getPage()`.
- **`getLocatorFromRef()`**: Uses `this.getFrame()` instead of `this.getPage()`.
- **`getLocator()`**: Uses `this.getFrame()` instead of `this.getPage()`.

### `src/snapshot.ts`

- **`findCursorInteractiveElements()`**: Accept `Page | Frame` parameter type.
- **`getEnhancedSnapshot()`**: Accept `Page | Frame` parameter type.

### `src/actions.ts`

#### Category A: Handlers using `page.locator()` -- changed to `browser.getLocator()`

These handlers created locators via `page.locator(selector)` which always targets the main page. Changed to `browser.getLocator(selector)` which routes through `getFrame()` internally.

- `handleCount`
- `handleBoundingBox`
- `handleHighlight`
- `handleClear`
- `handleSelectAll`
- `handleInnerText`
- `handleInnerHtml`
- `handleSetValue`
- `handleDispatch`
- `handleScrollIntoView`
- `handleMultiSelect`
- `handleNth`
- `handleScroll` (element case: `page.locator(selector)` to `browser.getLocator(selector)`)
- `handleWheel` (hover case: `page.locator(selector)` to `browser.getLocator(selector)`)
- `handleContent` (selector case: `page.locator(selector).innerHTML()` to `browser.getLocator(selector).innerHTML()`)
- `handleTap`

#### Category B: Handlers using `page.getByRole/Text/Label/etc` -- changed to `browser.getFrame()`

These handlers used `browser.getPage()` to get `page`, then called `page.getByRole()` etc. Changed to use `browser.getFrame()` so the getBy* methods search within the active frame.

- `handleGetByRole`
- `handleGetByText`
- `handleGetByLabel`
- `handleGetByPlaceholder`
- `handleGetByAltText`
- `handleGetByTitle`
- `handleGetByTestId`

#### Category C: Handlers using `page.evaluate/waitForSelector/etc` -- changed to `browser.getFrame()`

These handlers used page-level methods that should operate within the active frame context.

- `handleEvaluate` (`page.evaluate` to `frame.evaluate`)
- `handleWait` (`page.waitForSelector`, `page.waitForTimeout`, `page.waitForLoadState` to frame equivalents)
- `handleScroll` (page-level `page.evaluate('window.scrollBy(...)')` to `frame.evaluate(...)`)
- `handleContent` (no-selector case: `page.content()` to `frame.content()`)
- `handleEvalHandle` (`page.evaluateHandle` to `frame.evaluateHandle`)
- `handleWaitForFunction` (`page.waitForFunction` to `frame.waitForFunction`)
- `handlePress` (with selector: `page.press(selector, key)` to `browser.getLocator(selector).press(key)`)
- `handleStyles` (CSS selector path: `page.$$eval` to `frame.$$eval`)

### Handlers left at page level (correctly page-scoped)

These handlers operate on page-level concepts that don't change with iframe context:

- `handleNavigate`, `handleBack`, `handleForward`, `handleReload`
- `handleScreenshot`
- `handleUrl`, `handleTitle`
- Tab/window management (`handleTabNew`, `handleTabSwitch`, `handleTabClose`, `handleTabList`)
- Cookies/storage (`handleCookiesGet/Set/Clear`, `handleStorageGet/Set/Clear`)
- Dialog/route/network handlers
- `handleMouseMove`, `handleMouseDown`, `handleMouseUp` (coordinate-based, page-level)
- `handleKeyboard`, `handleKeyDown`, `handleKeyUp`, `handleInsertText` (keyboard input goes to focused element regardless of frame)
- `handleClipboard`
- Screencast/recording handlers
- `handlePdf`, `handleDownload`, `handleExpose`, `handleAddScript`, `handleAddStyle`
- `handleEmulateMedia`, `handlePause`, `handleBringToFront`
- `handleSetContent`, `handleWaitForUrl`, `handleWaitForLoadState`

## Testing

Tests are in `test/iframe-handlers.test.ts`. They set up a main page with an embedded iframe, switch to the iframe via `browser.switchToFrame()`, and verify each handler operates on iframe content rather than main page content.

```bash
pnpm test                                    # run all tests
pnpm vitest run test/iframe-handlers.test.ts  # run iframe tests only
```
