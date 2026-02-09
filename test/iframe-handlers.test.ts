/**
 * Tests that action handlers operate on the currently selected iframe (via `frame` command),
 * not always on the main page. These tests follow TDD -- they are written to fail first,
 * then the handlers are fixed to make them pass.
 *
 * Test setup: a main page containing two iframes (a realistic portal layout).
 * After calling browser.switchToFrame() on the visible iframe, every handler should
 * target the iframe content.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../src/browser.js';
import { executeCommand } from '../src/actions.js';

const MAIN_PAGE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Iframe Test Case</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif;
      background: #f5f5f5;
    }
    nav {
      background: #333;
      color: #fff;
      padding: 12px 24px;
      display: flex;
      gap: 24px;
      align-items: center;
    }
    nav span { cursor: pointer; }
    .frame-container {
      position: relative;
      width: 100%;
      height: calc(100vh - 48px);
    }
    .frame-container iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
  </style>
</head>
<body>

<nav>
  <span>Modules</span>
  <span>Support request</span>
  <span>Chat &amp; teams</span>
  <span>Logout</span>
  <span>Training Center</span>
</nav>

<div class="frame-container">
  <!-- Hidden iframe (landing page) -->
  <iframe
    class="light"
    name='{"code":"styx.landing","uuid":"17705520418590.982498907591759"}'
    srcdoc='
      <!DOCTYPE html>
      <html>
      <head><title>Landing</title></head>
      <body style="font-family:sans-serif; padding:24px;">
        <h1>Good morning, TestUser!</h1>
        <h3>Welcome to myhELO!</h3>
        <h4>Getting started is easy!</h4>
        <p>Access all of your modules by clicking the "modules" button.</p>
        <button>Dismiss</button>
        <h3>Recent modules</h3>
        <p>Timeclock &bull; Chat &amp; teams &bull; Training Center</p>
        <h3>Items that need your attention</h3>
        <p>Nothing left</p>
      </body>
      </html>
    '
    style="visibility: hidden;"
  ></iframe>

  <!-- Visible iframe (training center) -->
  <iframe
    class="light"
    name='{"code":"training_center","uuid":"17705520418640.43614286751540854"}'
    srcdoc='
      <!DOCTYPE html>
      <html>
      <head><title>Training Center</title></head>
      <body style="font-family:sans-serif; padding:24px;">
        <img src="" alt="myhELO" style="width:80px; height:24px; background:#ccc;">
        <h3>Hi, TestUser! Let&apos;s get started.</h3>
        <h5>We&apos;ve picked out some training paths to help you get familiar with myhELO.</h5>
        <h3>Required training paths</h3>
        <label for="tc-filter">Filter:</label>
        <select id="tc-filter">
          <option value="all">All paths</option>
          <option value="required">Required</option>
          <option value="optional">Optional</option>
        </select>
        <p>Role: Core Platform Access and Communication</p>
        <p>Next training on this path...</p>
        <p data-testid="tc-progress" title="Course Progress">Creating a support task — 14% complete</p>
        <div id="tc-modules" style="height:50px;overflow:auto;">
          <div style="height:500px;">Module 1: Getting started</div>
        </div>
        <label for="search">Search training:</label>
        <input id="search" type="text" placeholder="Search...">
        <button>Start next</button>
      </body>
      </html>
    '
    style="visibility: visible;"
  ></iframe>
</div>

</body>
</html>`;


async function setupIframePage(browser: BrowserManager) {
  const page = browser.getPage();
  await page.setContent(MAIN_PAGE_HTML);
  // Wait for the visible (training center) iframe to load
  const iframeSelector = 'iframe:nth-of-type(2)';
  await page.waitForSelector(iframeSelector);
  const iframeEl = await page.$(iframeSelector);
  const frame = await iframeEl!.contentFrame();
  await frame!.waitForSelector('#search');
  // Switch to the visible iframe
  await browser.switchToFrame({ selector: iframeSelector });
}

async function loadMainPageWithVisibleIframe(browser: BrowserManager) {
  const page = browser.getPage();
  await page.setContent(MAIN_PAGE_HTML);
  const visibleIframeSelector = 'iframe:nth-of-type(2)';
  await page.waitForSelector(visibleIframeSelector);
  const iframeEl = await page.$(visibleIframeSelector);
  const frame = await iframeEl!.contentFrame();
  await frame!.waitForSelector('#search');
}

async function setupNestedIframePage(browser: BrowserManager) {
  const page = browser.getPage();
  await page.setContent(`
    <html>
      <body>
        <iframe id="outer-iframe"></iframe>
      </body>
    </html>
  `);

  await page.waitForSelector('#outer-iframe');
  const outerFrameEl = await page.$('#outer-iframe');
  const outerFrame = await outerFrameEl?.contentFrame();
  if (!outerFrame) {
    throw new Error('Failed to resolve #outer-iframe frame');
  }

  await outerFrame.setContent(`
    <html>
      <body>
        <iframe
          id="inner-iframe-hidden"
          title="Landing"
          name='{"code":"styx.landing","uuid":"17705520418590.982498907591759"}'
          srcdoc='<html><head><title>Landing</title></head><body><h1>Hidden Landing</h1></body></html>'
          style="visibility: hidden;"
        ></iframe>
        <iframe
          id="inner-iframe"
          title="Training Center"
          name='{"code":"training_center","uuid":"17705520418640.43614286751540854"}'
          srcdoc='<html><head><title>Training Center</title></head><body><h1 id="training-heading">Training Content</h1></body></html>'
          style="visibility: visible;"
        ></iframe>
      </body>
    </html>
  `);

  await outerFrame.waitForSelector('#inner-iframe');
  const innerFrameEl = await outerFrame.$('#inner-iframe');
  const innerFrame = await innerFrameEl?.contentFrame();
  if (!innerFrame) {
    throw new Error('Failed to resolve #inner-iframe frame');
  }
  await innerFrame.waitForSelector('#training-heading');
}

// ---------------------------------------------------------------
// 1. switchToFrame nested iframe support
// ---------------------------------------------------------------
describe('switchToFrame nested selection', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(() => {
    browser.switchToMainFrame();
  });

  it('should search for frames from the current frame, not main page', async () => {
    const page = browser.getPage();
    await page.setContent(`
      <html><body>
        <iframe id="outer" srcdoc='
          <html><body>
            <h1>Outer Iframe</h1>
            <iframe id="inner" srcdoc="<html><body><h1>Inner Iframe</h1></body></html>"></iframe>
          </body></html>
        '></iframe>
      </body></html>
    `);
    await page.waitForSelector('iframe#outer');
    const outerEl = await page.$('iframe#outer');
    const outerFrame = await outerEl!.contentFrame();
    await outerFrame!.waitForSelector('iframe#inner');

    // Switch to outer iframe first
    await browser.switchToFrame({ selector: 'iframe#outer' });
    const outerContent = await browser.getFrame().evaluate(() => document.querySelector('h1')?.textContent);
    expect(outerContent).toBe('Outer Iframe');

    // Now switch to inner iframe (nested) -- should search from current frame, not main page
    await browser.switchToFrame({ selector: 'iframe#inner' });
    const innerContent = await browser.getFrame().evaluate(() => document.querySelector('h1')?.textContent);
    expect(innerContent).toBe('Inner Iframe');
  });

  it('should allow frame sub/main toggling with MAIN_PAGE_HTML', async () => {
    await loadMainPageWithVisibleIframe(browser);

    const subFrameResponse = await executeCommand(
      { id: '1', action: 'frame', selector: 'sub' },
      browser
    );
    expect(subFrameResponse.success).toBe(true);

    const subTitle = await browser.getFrame().evaluate(() => document.title);
    expect(subTitle).toBe('Training Center');

    const mainFrameResponse = await executeCommand(
      { id: '2', action: 'mainframe' },
      browser
    );
    expect(mainFrameResponse.success).toBe(true);

    const mainTitle = await browser.getFrame().evaluate(() => document.title);
    expect(mainTitle).toBe('Iframe Test Case');
  });

  it('should let frame "#inner-iframe" select the visible nested iframe', async () => {
    await setupNestedIframePage(browser);

    const outerResponse = await executeCommand(
      { id: '1', action: 'frame', selector: '#outer-iframe' },
      browser
    );
    expect(outerResponse.success).toBe(true);

    const innerResponse = await executeCommand(
      { id: '2', action: 'frame', selector: '#inner-iframe' },
      browser
    );
    expect(innerResponse.success).toBe(true);

    const [title, frameVisibility] = await Promise.all([
      browser.getFrame().evaluate(() => document.title),
      browser.getFrame().frameElement().then((el) => el.evaluate((node) => getComputedStyle(node).visibility)),
    ]);

    expect(title).toBe('Training Center');
    expect(frameVisibility).toBe('visible');
  });

  it('should include nested iframe node in snapshot from outer frame', async () => {
    await setupNestedIframePage(browser);

    const frameResponse = await executeCommand(
      { id: '1', action: 'frame', selector: '#outer-iframe' },
      browser
    );
    expect(frameResponse.success).toBe(true);

    const snapshotResponse = await executeCommand(
      { id: '2', action: 'snapshot' },
      browser
    );
    expect(snapshotResponse.success).toBe(true);
    // Playwright's ariaSnapshot() reports iframe nodes but does not include
    // their title/name attribute, so we can only verify the node is present.
    expect((snapshotResponse as any).data.snapshot).toContain('- iframe');
  });
});

// ---------------------------------------------------------------
// Category A: Handlers that create locators via page.locator()
// ---------------------------------------------------------------
describe('Category A: Locator-based handlers in iframe', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    browser.switchToMainFrame();
    await setupIframePage(browser);
  });

  it('handleCount should count elements inside iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'count', selector: 'button' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.count).toBe(1);
  });

  it('handleBoundingBox should get bounding box of iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'boundingbox', selector: 'button' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.box).not.toBeNull();
  });

  it('handleClear should clear iframe input', async () => {
    const frame = browser.getFrame();
    await frame.fill('#search', 'test-clear');

    const response = await executeCommand(
      { id: '1', action: 'clear', selector: '#search' },
      browser
    );
    expect(response.success).toBe(true);

    const value = await frame.inputValue('#search');
    expect(value).toBe('');
  });

  it('handleInnerText should get inner text from iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'innertext', selector: '[data-testid="tc-progress"]' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.text).toContain('14% complete');
  });

  it('handleInnerHtml should get inner HTML from iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'innerhtml', selector: '[data-testid="tc-progress"]' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.html).toContain('14% complete');
  });

  it('handleSetValue should set value on iframe input', async () => {
    const response = await executeCommand(
      { id: '1', action: 'setvalue', selector: '#search', value: 'new-search-value' },
      browser
    );
    expect(response.success).toBe(true);

    const frame = browser.getFrame();
    const value = await frame.inputValue('#search');
    expect(value).toBe('new-search-value');
  });

  it('handleDispatch should dispatch event on iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'dispatch', selector: 'button', event: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.dispatched).toBe('click');
  });

  it('handleScrollIntoView should scroll iframe element into view', async () => {
    const response = await executeCommand(
      { id: '1', action: 'scrollintoview', selector: '#tc-modules' },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleMultiSelect should select options in iframe select', async () => {
    const response = await executeCommand(
      { id: '1', action: 'multiselect', selector: '#tc-filter', values: ['all'] },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleNth should operate on iframe elements', async () => {
    const response = await executeCommand(
      { id: '1', action: 'nth', selector: 'option', index: 0, subaction: 'text' },
      browser
    );
    expect(response.success).toBe(true);
    // Should get text from the training center iframe's first option
    expect((response as any).data.text).toBe('All paths');
  });

  it('handleScroll with selector should scroll iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'scroll', selector: '#tc-modules', y: 50 },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleWheel with selector should hover iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'wheel', selector: 'button', deltaY: 10 },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleContent with selector should get innerHTML from iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'content', selector: '[data-testid="tc-progress"]' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.html).toContain('14% complete');
  });

  it('handleTap should tap iframe element', async () => {
    // tap requires hasTouch context; verify the command reaches the iframe
    // (it may fail with "page.tap: Tapping is not supported" in non-touch contexts)
    const response = await executeCommand(
      { id: '1', action: 'tap', selector: 'button' },
      browser
    );
    // If success, the tap worked; if error, verify it's a touch-support error, not a selector error
    if (response.success) {
      expect((response as any).data.tapped).toBe(true);
    } else {
      // Should not be a "not found" error -- the locator was created in the iframe
      expect((response as any).error).toContain('does not support tap');
    }
  });
});

// ---------------------------------------------------------------
// Category B: getBy* handlers
// ---------------------------------------------------------------
describe('Category B: getBy* handlers in iframe', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    browser.switchToMainFrame();
    await setupIframePage(browser);
  });

  it('handleGetByRole should find role in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbyrole', role: 'button', name: 'Start next', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByText should find text in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbytext', text: 'Required training paths', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByLabel should find label in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbylabel', label: 'Search training:', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByPlaceholder should find placeholder in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbyplaceholder', placeholder: 'Search...', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByAltText should find alt text in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbyalttext', text: 'myhELO', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByTitle should find title in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbytitle', text: 'Course Progress', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });

  it('handleGetByTestId should find test id in iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'getbytestid', testId: 'tc-progress', subaction: 'click' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.clicked).toBe(true);
  });
});

// ---------------------------------------------------------------
// Category C: evaluate/wait/etc handlers
// ---------------------------------------------------------------
describe('Category C: evaluate/wait/etc handlers in iframe', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    browser.switchToMainFrame();
    await setupIframePage(browser);
  });

  it('handleWait with selector should wait for iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'wait', selector: '#search', state: 'visible', timeout: 5000 },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.waited).toBe(true);
  });

  it('handleScroll page-level should scroll within iframe', async () => {
    const response = await executeCommand(
      { id: '1', action: 'scroll', direction: 'down', amount: 50 },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleContent without selector should get iframe content', async () => {
    const response = await executeCommand(
      { id: '1', action: 'content' },
      browser
    );
    expect(response.success).toBe(true);
    // Should contain iframe content, not main page content
    expect((response as any).data.html).toContain('Training Center');
    expect((response as any).data.html).not.toContain('Iframe Test Case');
  });

  it('handleEvalHandle should evaluate in iframe context', async () => {
    const response = await executeCommand(
      { id: '1', action: 'evalhandle', script: 'document.title' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.result).toBe('Training Center');
  });

  it('handleWaitForFunction should evaluate in iframe context', async () => {
    const response = await executeCommand(
      { id: '1', action: 'waitforfunction', expression: '() => document.title === "Training Center"', timeout: 5000 },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handlePress with selector should press key on iframe element', async () => {
    // Clear the search input first
    const frame = browser.getFrame();
    await frame.fill('#search', '');

    const response = await executeCommand(
      { id: '1', action: 'press', key: 'a', selector: '#search' },
      browser
    );
    expect(response.success).toBe(true);
  });

  it('handleStyles with CSS selector should get styles from iframe element', async () => {
    const response = await executeCommand(
      { id: '1', action: 'styles', selector: 'button' },
      browser
    );
    expect(response.success).toBe(true);
    expect((response as any).data.elements).toBeDefined();
    expect((response as any).data.elements.length).toBeGreaterThan(0);
  });
});
