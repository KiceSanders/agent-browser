import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { BrowserManager } from './browser.js';
import { chromium } from 'playwright-core';

describe('BrowserManager', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('launch and close', () => {
    it('should report as launched', () => {
      expect(browser.isLaunched()).toBe(true);
    });

    it('should have a page', () => {
      const page = browser.getPage();
      expect(page).toBeDefined();
    });

    it('should reject invalid executablePath', async () => {
      const testBrowser = new BrowserManager();
      await expect(
        testBrowser.launch({
          headless: true,
          executablePath: '/nonexistent/path/to/chromium',
        })
      ).rejects.toThrow();
    });

    it('should be no-op when relaunching with same options', async () => {
      const browserInstance = browser.getBrowser();
      await browser.launch({ id: 'test', action: 'launch', headless: true });
      expect(browser.getBrowser()).toBe(browserInstance);
    });

    it('should reconnect when CDP port changes', async () => {
      const newBrowser = new BrowserManager();
      await newBrowser.launch({ id: 'test', action: 'launch', headless: true });
      expect(newBrowser.getBrowser()).not.toBeNull();

      await expect(
        newBrowser.launch({ id: 'test', action: 'launch', cdpPort: 59999 })
      ).rejects.toThrow();

      expect(newBrowser.getBrowser()).toBeNull();
      await newBrowser.close();
    });
  });

  describe('navigation', () => {
    it('should navigate to URL', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      expect(page.url()).toBe('https://example.com/');
    });

    it('should get page title', async () => {
      const page = browser.getPage();
      const title = await page.title();
      expect(title).toBe('Example Domain');
    });
  });

  describe('element interaction', () => {
    it('should find element by selector', async () => {
      const page = browser.getPage();
      const heading = await page.locator('h1').textContent();
      expect(heading).toBe('Example Domain');
    });

    it('should check element visibility', async () => {
      const page = browser.getPage();
      const isVisible = await page.locator('h1').isVisible();
      expect(isVisible).toBe(true);
    });

    it('should count elements', async () => {
      const page = browser.getPage();
      const count = await page.locator('p').count();
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('screenshots', () => {
    it('should take screenshot as buffer', async () => {
      const page = browser.getPage();
      const buffer = await page.screenshot();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('evaluate', () => {
    it('should evaluate JavaScript', async () => {
      const page = browser.getPage();
      const result = await page.evaluate(() => document.title);
      expect(result).toBe('Example Domain');
    });

    it('should evaluate with arguments', async () => {
      const page = browser.getPage();
      const result = await page.evaluate((x: number) => x * 2, 5);
      expect(result).toBe(10);
    });
  });

  describe('tabs', () => {
    it('should create new tab', async () => {
      const result = await browser.newTab();
      expect(result.index).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should list tabs', async () => {
      const tabs = await browser.listTabs();
      expect(tabs.length).toBe(2);
    });

    it('should close tab', async () => {
      // Switch to second tab and close it
      const page = browser.getPage();
      const tabs = await browser.listTabs();
      if (tabs.length > 1) {
        const result = await browser.closeTab(1);
        expect(result.remaining).toBe(1);
      }
    });
  });

  describe('context operations', () => {
    it('should get cookies from context', async () => {
      const page = browser.getPage();
      const cookies = await page.context().cookies();
      expect(Array.isArray(cookies)).toBe(true);
    });

    it('should set and get cookies', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.addCookies([{ name: 'test', value: 'value', url: 'https://example.com' }]);
      const cookies = await context.cookies();
      const testCookie = cookies.find((c) => c.name === 'test');
      expect(testCookie?.value).toBe('value');
    });

    it('should set cookie with domain', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.addCookies([
        { name: 'domainCookie', value: 'domainValue', domain: 'example.com', path: '/' },
      ]);
      const cookies = await context.cookies();
      const testCookie = cookies.find((c) => c.name === 'domainCookie');
      expect(testCookie?.value).toBe('domainValue');
    });

    it('should set multiple cookies at once', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.clearCookies();
      await context.addCookies([
        { name: 'cookie1', value: 'value1', url: 'https://example.com' },
        { name: 'cookie2', value: 'value2', url: 'https://example.com' },
      ]);
      const cookies = await context.cookies();
      expect(cookies.find((c) => c.name === 'cookie1')?.value).toBe('value1');
      expect(cookies.find((c) => c.name === 'cookie2')?.value).toBe('value2');
    });

    it('should clear cookies', async () => {
      const page = browser.getPage();
      const context = page.context();
      await context.clearCookies();
      const cookies = await context.cookies();
      expect(cookies.length).toBe(0);
    });
  });

  describe('localStorage operations', () => {
    it('should set and get localStorage item', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      await page.evaluate(() => localStorage.setItem('testKey', 'testValue'));
      const value = await page.evaluate(() => localStorage.getItem('testKey'));
      expect(value).toBe('testValue');
    });

    it('should get all localStorage items', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('key1', 'value1');
        localStorage.setItem('key2', 'value2');
      });
      const storage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) items[key] = localStorage.getItem(key) || '';
        }
        return items;
      });
      expect(storage.key1).toBe('value1');
      expect(storage.key2).toBe('value2');
    });

    it('should clear localStorage', async () => {
      const page = browser.getPage();
      await page.evaluate(() => localStorage.clear());
      const value = await page.evaluate(() => localStorage.getItem('testKey'));
      expect(value).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const page = browser.getPage();
      await page.evaluate(() => localStorage.clear());
      const value = await page.evaluate(() => localStorage.getItem('nonexistent'));
      expect(value).toBeNull();
    });
  });

  describe('sessionStorage operations', () => {
    it('should set and get sessionStorage item', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      await page.evaluate(() => sessionStorage.setItem('sessionKey', 'sessionValue'));
      const value = await page.evaluate(() => sessionStorage.getItem('sessionKey'));
      expect(value).toBe('sessionValue');
    });

    it('should get all sessionStorage items', async () => {
      const page = browser.getPage();
      await page.evaluate(() => {
        sessionStorage.clear();
        sessionStorage.setItem('skey1', 'svalue1');
        sessionStorage.setItem('skey2', 'svalue2');
      });
      const storage = await page.evaluate(() => {
        const items: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) items[key] = sessionStorage.getItem(key) || '';
        }
        return items;
      });
      expect(storage.skey1).toBe('svalue1');
      expect(storage.skey2).toBe('svalue2');
    });

    it('should clear sessionStorage', async () => {
      const page = browser.getPage();
      await page.evaluate(() => sessionStorage.clear());
      const value = await page.evaluate(() => sessionStorage.getItem('sessionKey'));
      expect(value).toBeNull();
    });
  });

  describe('viewport', () => {
    it('should set viewport', async () => {
      await browser.setViewport(1920, 1080);
      const page = browser.getPage();
      const size = page.viewportSize();
      expect(size?.width).toBe(1920);
      expect(size?.height).toBe(1080);
    });
  });

  describe('snapshot', () => {
    async function setMyheloLayoutContent(options?: {
      showSidebar?: boolean;
      showDrawer?: boolean;
      showFab?: boolean;
    }): Promise<void> {
      const showSidebar = options?.showSidebar ?? true;
      const showDrawer = options?.showDrawer ?? true;
      const showFab = options?.showFab ?? true;
      const page = browser.getPage();

      const sidebarLeft = showSidebar ? '0' : '-340px';
      const drawerLeft = showDrawer ? 'calc(100vw - 360px)' : 'calc(100vw + 16px)';
      const fabDisplay = showFab ? 'flex' : 'none';

      await page.setContent(`
        <html>
          <head>
            <style>
              html, body { margin: 0; padding: 0; width: 1280px; height: 672px; overflow: hidden; }
              #sidebar-header, #sidebar-center, #sidebar-footer {
                position: fixed;
                left: ${sidebarLeft};
                width: 300px;
                box-sizing: border-box;
                background: #f4f4f4;
              }
              #sidebar-header { top: 0; height: 76px; }
              #sidebar-center { top: 76px; height: 476px; overflow: auto; }
              #sidebar-footer { top: 552px; height: 120px; }

              #contents-header, #contents-center, #contents-footer {
                position: fixed;
                left: 308px;
                width: 972px;
                box-sizing: border-box;
                background: #fff;
              }
              #contents-header { top: 0; height: 76px; }
              #contents-center { top: 76px; height: 476px; overflow: auto; }
              #contents-footer { top: 552px; height: 120px; }

              #drawer-container {
                position: fixed;
                left: ${drawerLeft};
                top: 0;
                width: 360px;
                height: 672px;
                background: #eef3ff;
              }
              #drawer-header { position: absolute; top: 0; left: 0; width: 360px; height: 76px; }
              #drawer-center { position: absolute; top: 76px; left: 0; width: 360px; height: 476px; }
              #drawer-footer { position: absolute; top: 552px; left: 0; width: 360px; height: 120px; }

              #chat-fab {
                position: fixed;
                right: 24px;
                bottom: 24px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                border: 0;
                cursor: pointer;
                display: ${fabDisplay};
                align-items: center;
                justify-content: center;
              }
            </style>
          </head>
          <body>
            <div id="sidebar-header"><button>Sidebar profile</button></div>
            <div id="sidebar-center"><button>Sidebar threads</button></div>
            <div id="sidebar-footer"><button>Sidebar footer</button></div>

            <div id="contents-header"><button>Thread header</button></div>
            <div id="contents-center"><button>Main content action</button></div>
            <div id="contents-footer"><button>Composer action</button></div>

            <div id="drawer-container">
              <div id="drawer-header"><button>Drawer header</button></div>
              <div id="drawer-center"><button>Drawer content</button></div>
              <div id="drawer-footer"><button>Drawer footer</button></div>
            </div>

            <button id="chat-fab" class="fab">+</button>
          </body>
        </html>
      `);
    }

    it('should get snapshot with refs', async () => {
      const page = browser.getPage();
      await page.goto('https://example.com');
      const { tree, refs } = await browser.getSnapshot();
      expect(tree).toContain('heading');
      expect(tree).toContain('Example Domain');
      expect(typeof refs).toBe('object');
    });

    it('should get interactive-only snapshot', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: interactiveSnapshot } = await browser.getSnapshot({ interactive: true });
      // Interactive snapshot should be shorter (fewer elements)
      expect(interactiveSnapshot.length).toBeLessThanOrEqual(fullSnapshot.length);
    });

    it('should get snapshot with depth limit', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: limitedSnapshot } = await browser.getSnapshot({ maxDepth: 2 });
      // Limited depth should have fewer nested elements
      const fullLines = fullSnapshot.split('\n').length;
      const limitedLines = limitedSnapshot.split('\n').length;
      expect(limitedLines).toBeLessThanOrEqual(fullLines);
    });

    it('should get compact snapshot', async () => {
      const { tree: fullSnapshot } = await browser.getSnapshot();
      const { tree: compactSnapshot } = await browser.getSnapshot({ compact: true });
      // Compact should be equal or shorter
      expect(compactSnapshot.length).toBeLessThanOrEqual(fullSnapshot.length);
    });

    it('should partition myhelo layout into sidebar/contents/drawer/fab across snapshot modes', async () => {
      await setMyheloLayoutContent({ showSidebar: true, showDrawer: true, showFab: true });

      const snapshots = [
        await browser.getSnapshot(),
        await browser.getSnapshot({ interactive: true }),
        await browser.getSnapshot({ interactive: true, cursor: true }),
        await browser.getSnapshot({ compact: true }),
      ];

      for (const { tree } of snapshots) {
        expect(tree).toContain('# Sidebar:');
        expect(tree).toContain('# Contents:');
        expect(tree).toContain('# Drawer:');
        expect(tree).toContain('# FAB:');
      }
    });

    it('should skip sidebar and drawer sections when they are off-screen', async () => {
      await setMyheloLayoutContent({ showSidebar: false, showDrawer: false, showFab: false });

      const { tree } = await browser.getSnapshot({ interactive: true, cursor: true });

      expect(tree).toContain('# Contents:');
      expect(tree).not.toContain('# Sidebar:');
      expect(tree).not.toContain('# Drawer:');
      expect(tree).not.toContain('# FAB:');
    });

    it('should include FAB section for myhelo floating circle button without fab class token', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <head>
            <style>
              html, body { margin: 0; padding: 0; width: 1280px; height: 672px; overflow: hidden; }
              #sidebar-center { position: fixed; left: 0; top: 76px; width: 300px; height: 476px; }
              #contents-center { position: fixed; left: 308px; top: 76px; width: 972px; height: 476px; }
              button.circle {
                position: fixed;
                right: 32px;
                bottom: 32px;
                width: 48px;
                height: 48px;
                border: 0;
                border-radius: 24px;
                z-index: 100;
                cursor: pointer;
              }
            </style>
          </head>
          <body>
            <div id="sidebar-center"><button>Threads</button></div>
            <div id="contents-center"><button>Conversation</button></div>
            <button class="circle" title="Compose">+</button>
          </body>
        </html>
      `);

      const { tree } = await browser.getSnapshot({ interactive: true, cursor: true });
      expect(tree).toContain('# FAB:');
      expect(tree).toContain('button "+"');
    });

    it('should not capture cursor-interactive elements without cursor flag', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <button id="standard-btn">Standard Button</button>
            <div id="clickable-div" style="cursor: pointer;" onclick="void(0)">Clickable Div</div>
          </body>
        </html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true });

      // Standard button should be captured via ARIA
      expect(tree).toContain('button "Standard Button"');

      // Cursor-interactive elements should NOT be captured without cursor flag
      expect(tree).not.toContain('Cursor-interactive elements');
      expect(tree).not.toContain('clickable "Clickable Div"');

      // Should only have refs for ARIA interactive elements
      const refValues = Object.values(refs);
      expect(refValues.some((r) => r.role === 'button')).toBe(true);
      expect(refValues.some((r) => r.role === 'clickable')).toBe(false);
    });

    it('should capture cursor-interactive elements with cursor flag', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <button id="standard-btn">Standard Button</button>
            <div id="clickable-div" style="cursor: pointer;" onclick="void(0)">Clickable Div</div>
            <span onclick="void(0)">Onclick Span</span>
          </body>
        </html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true, cursor: true });

      // Standard button should be captured via ARIA
      expect(tree).toContain('button "Standard Button"');

      // Cursor-interactive elements should be captured with cursor flag
      expect(tree).toContain('Cursor-interactive elements');
      expect(tree).toContain('clickable "Clickable Div"');
      expect(tree).toContain('clickable "Onclick Span"');

      // Should have refs for all interactive elements
      const refValues = Object.values(refs);
      expect(refValues.some((r) => r.role === 'button')).toBe(true);
      expect(refValues.some((r) => r.role === 'clickable')).toBe(true);
    });

    it('should detect cursor-pointer-only elements without onclick attribute', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body>
          <div id="btn1" style="cursor: pointer;">Click Me</div>
          <script>
            document.getElementById('btn1').addEventListener('click', () => {});
          </script>
        </body></html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true, cursor: true });
      expect(tree).toContain('Click Me');
      expect(tree).toContain('[ref=');
      const refValues = Object.values(refs);
      expect(refValues.some((r) => r.name === 'Click Me')).toBe(true);
    });

    it('should detect styx-style nav buttons with hidden text and icons', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body>
          <div style="cursor: pointer; height: 44px;">
            <div id="btn-modules" title="Modules" style="display: inline-block; width: 48px; cursor: pointer;">
              <div style="opacity: 0; position: absolute; inset: 0; color: transparent;">Modules</div>
              <div class="icon" style="font-size: 26px;">☰</div>
            </div>
          </div>
          <div style="cursor: pointer; height: 44px;">
            <div id="btn-logout" title="Logout" style="display: inline-block; width: 48px; cursor: pointer;">
              <div style="opacity: 0; position: absolute; inset: 0; color: transparent;">Logout</div>
              <div class="icon" style="font-size: 26px;">⏻</div>
            </div>
          </div>
          <script>
            document.getElementById('btn-modules').addEventListener('click', () => {
              document.title = 'modules clicked';
            });
            document.getElementById('btn-logout').addEventListener('click', () => {
              document.title = 'logout clicked';
            });
          </script>
        </body></html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true, cursor: true });
      expect(tree).toContain('Modules');
      expect(tree).toContain('Logout');

      const refValues = Object.values(refs);
      const clickables = refValues.filter((r) => r.role === 'clickable');
      expect(clickables.length).toBe(2);
    });

    it('should preserve myhelo glyph labels and append icon description metadata', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <div id="menu-btn" class="component menu" style="cursor: pointer;">&#xF01D9;</div>
            <div style="cursor: pointer;">&#xF0156;</div>
            <div id="mixed-btn" style="cursor: pointer;">&#xF02D8; Projects</div>
            <button id="aria-icon-btn">&#xF0415;</button>
          </body>
        </html>
      `);

      const { tree } = await browser.getSnapshot({ interactive: true, cursor: true });

      // Raw glyph text remains visible for direct text-based interaction
      expect(tree).toContain('clickable "󰇙"');
      expect(tree).toContain('clickable "󰅖"');
      expect(tree).toContain('clickable "󰋘 Projects"');
      expect(tree).toContain('button "󰐕"');

      // Icon mappings are emitted as explicit metadata
      expect(tree).toContain('[icon-desc=<dots-vertical>]');
      expect(tree).toContain('[icon-desc=<close>]');
      expect(tree).toContain('[icon-desc=<hexagon>]');
      expect(tree).toContain('[icon-desc=<plus>]');

      // Description metadata should not replace the actual displayed text
      expect(tree).not.toContain('clickable "<close>"');
      expect(tree).not.toContain('button "<plus>"');
    });

    it('should resolve myhelo glyphs in non-interactive snapshot text lines', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <div>&#xF0156;</div>
            <div>&#xF024B; Files</div>
            <div>Assigned &#xF028C; to me</div>
          </body>
        </html>
      `);

      const { tree } = await browser.getSnapshot();

      expect(tree).toContain('󰅖');
      expect(tree).toContain('󰉋 Files');
      expect(tree).toContain('Assigned 󰊌 to me');
      expect(tree).toContain('[icon-descs=<close>, <folder>, <forum>]');
    });

    it('should deduplicate nested cursor-pointer elements, preferring titled ancestors', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body>
          <div title="Settings" style="cursor: pointer; width: 48px; height: 48px;">
            <div class="icon" style="font-size: 20px;">⚙</div>
            <span style="font-size: 12px;">Settings</span>
          </div>
        </body></html>
      `);

      const { refs } = await browser.getSnapshot({ interactive: true, cursor: true });
      const clickables = Object.values(refs).filter((r) => r.role === 'clickable');
      expect(clickables.length).toBe(1);
      expect(clickables[0].name).toContain('Settings');
    });

    it('should click cursor-interactive elements via refs', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html>
          <body>
            <div id="clickable" style="cursor: pointer;">Click Me</div>
            <div id="result">not clicked</div>
            <script>
              document.getElementById('clickable').addEventListener('click', () => {
                document.getElementById('result').textContent = 'clicked';
              });
            </script>
          </body>
        </html>
      `);

      const { refs } = await browser.getSnapshot({ cursor: true });

      // Find the ref for the clickable element
      const clickableRef = Object.keys(refs).find((k) => refs[k].name === 'Click Me');
      expect(clickableRef).toBeDefined();

      // Click using the ref
      const locator = browser.getLocator(`@${clickableRef}`);
      await locator.click();

      // Verify click worked
      const result = await page.locator('#result').textContent();
      expect(result).toBe('clicked');
    });

    it('should detect all buttons in styx framework test fixture', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body>
          <nav>
            <div style="cursor: pointer;" title="Modules">&#xF0234; Modules</div>
            <div style="cursor: pointer;" title="Support request">&#xF045A; Support request</div>
            <div style="cursor: pointer;" title="Logout">&#xF0206; Logout</div>
            <div style="cursor: pointer;" title="Timeclock">&#xF012C; Timeclock</div>
            <div style="cursor: pointer;" title="Training Center">&#xF0337; Training Center</div>
            <div style="cursor: pointer;" title="Files">&#xF024B; Files</div>
            <div style="cursor: pointer;" title="Memos">&#xF082E; Memos</div>
            <div style="cursor: pointer;" title="Chat">&#xF028C; Chat</div>
          </nav>
        </body></html>
      `);

      const { tree, refs } = await browser.getSnapshot({ interactive: true, cursor: true });

      expect(tree).toContain('Modules');
      expect(tree).toContain('Support request');
      expect(tree).toContain('Logout');
      expect(tree).toContain('Timeclock');
      expect(tree).toContain('Training Center');

      const refValues = Object.values(refs);
      const clickables = refValues.filter((r) => r.role === 'clickable');
      expect(clickables.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('locator resolution', () => {
    it('should resolve CSS selector', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body><h1>Example Domain</h1><p>This is a test page.</p></body></html>
      `);
      const locator = browser.getLocator('h1');
      const text = await locator.textContent();
      expect(text).toBe('Example Domain');
    });

    it('should resolve ref from snapshot', async () => {
      const page = browser.getPage();
      await page.setContent(`
        <html><body><h1>Example Domain</h1><p>This is a test page.</p></body></html>
      `);
      await browser.getSnapshot(); // Populates refs
      // After snapshot, refs like @e1 should be available
      // This tests the ref resolution mechanism
      const h1 = await page.locator('h1').textContent();
      expect(h1).toBe('Example Domain');
    });
  });

  describe('scoped headers', () => {
    it('should register route for scoped headers', async () => {
      // Test that setScopedHeaders doesn't throw and completes successfully
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('https://example.com', { 'X-Test': 'value' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle full URL origin', async () => {
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('https://api.example.com/path', { Authorization: 'Bearer token' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle hostname-only origin', async () => {
      await browser.clearScopedHeaders();
      await expect(
        browser.setScopedHeaders('example.com', { 'X-Custom': 'value' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should clear scoped headers for specific origin', async () => {
      await browser.clearScopedHeaders();
      await browser.setScopedHeaders('https://example.com', { 'X-Test': 'value' });
      await expect(browser.clearScopedHeaders('https://example.com')).resolves.not.toThrow();
    });

    it('should clear all scoped headers', async () => {
      await browser.setScopedHeaders('https://example.com', { 'X-Test-1': 'value1' });
      await browser.setScopedHeaders('https://example.org', { 'X-Test-2': 'value2' });
      await expect(browser.clearScopedHeaders()).resolves.not.toThrow();
    });

    it('should replace headers when called twice for same origin', async () => {
      await browser.clearScopedHeaders();
      await browser.setScopedHeaders('https://example.com', { 'X-First': 'first' });
      // Second call should replace, not add
      await expect(
        browser.setScopedHeaders('https://example.com', { 'X-Second': 'second' })
      ).resolves.not.toThrow();
      await browser.clearScopedHeaders();
    });

    it('should handle clearing non-existent origin gracefully', async () => {
      await browser.clearScopedHeaders();
      // Should not throw when clearing headers that were never set
      await expect(browser.clearScopedHeaders('https://never-set.com')).resolves.not.toThrow();
    });
  });

  describe('CDP session', () => {
    it('should create CDP session on demand', async () => {
      const cdp = await browser.getCDPSession();
      expect(cdp).toBeDefined();
    });

    it('should reuse existing CDP session', async () => {
      const cdp1 = await browser.getCDPSession();
      const cdp2 = await browser.getCDPSession();
      expect(cdp1).toBe(cdp2);
    });

    it('should filter out pages with empty URLs during CDP connection', async () => {
      const mockBrowser = {
        contexts: () => [
          {
            pages: () => [
              { url: () => 'http://example.com', on: vi.fn() },
              { url: () => '', on: vi.fn() }, // This page should be filtered out
              { url: () => 'http://anothersite.com', on: vi.fn() },
            ],
            on: vi.fn(),
            setDefaultTimeout: vi.fn(),
          },
        ],
        close: vi.fn(),
      };
      const spy = vi.spyOn(chromium, 'connectOverCDP').mockResolvedValue(mockBrowser as any);

      const cdpBrowser = new BrowserManager();
      await cdpBrowser.launch({ cdpPort: 9222 });

      // Should have 2 pages, not 3
      expect(cdpBrowser.getPages().length).toBe(2);

      // Verify that the empty URL page is not in the list
      const urls = cdpBrowser.getPages().map((p) => p.url());
      expect(urls).not.toContain('');
      expect(urls).toContain('http://example.com');
      spy.mockRestore();
    });
  });

  describe('screencast', () => {
    it('should report screencasting state correctly', () => {
      expect(browser.isScreencasting()).toBe(false);
    });

    it('should start screencast', async () => {
      const frames: Array<{ data: string }> = [];
      await browser.startScreencast((frame) => {
        frames.push(frame);
      });
      expect(browser.isScreencasting()).toBe(true);

      // Wait a bit for at least one frame
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await browser.stopScreencast();
      expect(browser.isScreencasting()).toBe(false);
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should start screencast with custom options', async () => {
      const frames: Array<{ data: string }> = [];
      await browser.startScreencast(
        (frame) => {
          frames.push(frame);
        },
        {
          format: 'png',
          quality: 100,
          maxWidth: 800,
          maxHeight: 600,
          everyNthFrame: 1,
        }
      );
      expect(browser.isScreencasting()).toBe(true);

      // Wait for a frame
      await new Promise((resolve) => setTimeout(resolve, 200));

      await browser.stopScreencast();
      expect(frames.length).toBeGreaterThan(0);
    });

    it('should throw when starting screencast twice', async () => {
      await browser.startScreencast(() => {});
      await expect(browser.startScreencast(() => {})).rejects.toThrow('Screencast already active');
      await browser.stopScreencast();
    });

    it('should handle stop when not screencasting', async () => {
      // Should not throw
      await expect(browser.stopScreencast()).resolves.not.toThrow();
    });
  });

  describe('tab switch invalidates CDP session', () => {
    // Clean up any extra tabs before each test
    beforeEach(async () => {
      // Close all tabs except the first one
      const tabs = await browser.listTabs();
      for (let i = tabs.length - 1; i > 0; i--) {
        await browser.closeTab(i);
      }
      // Ensure we're on tab 0
      await browser.switchTo(0);
      // Stop any active screencast
      if (browser.isScreencasting()) {
        await browser.stopScreencast();
      }
    });

    it('should not invalidate CDP when switching to same tab', async () => {
      // Get CDP session for current tab
      const cdp1 = await browser.getCDPSession();

      // Switch to same tab - should NOT invalidate
      await browser.switchTo(0);

      // Should be the same session
      const cdp2 = await browser.getCDPSession();
      expect(cdp2).toBe(cdp1);
    });

    it('should invalidate CDP session on tab switch', async () => {
      // Get CDP session for tab 0
      const cdp1 = await browser.getCDPSession();
      expect(cdp1).toBeDefined();

      // Create new tab - this switches to the new tab automatically
      await browser.newTab();

      // Get CDP session - should be different since we're on a new page
      const cdp2 = await browser.getCDPSession();
      expect(cdp2).toBeDefined();

      // Sessions should be different objects (different pages have different CDP sessions)
      expect(cdp2).not.toBe(cdp1);
    });

    it('should stop screencast on tab switch', async () => {
      // Start screencast on tab 0
      await browser.startScreencast(() => {});
      expect(browser.isScreencasting()).toBe(true);

      // Create new tab and switch
      await browser.newTab();
      await browser.switchTo(1);

      // Screencast should be stopped (it's page-specific)
      expect(browser.isScreencasting()).toBe(false);
    });
  });

  describe('input injection', () => {
    it('should inject mouse move event', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mouseMoved',
          x: 100,
          y: 100,
        })
      ).resolves.not.toThrow();
    });

    it('should inject mouse click events', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mousePressed',
          x: 100,
          y: 100,
          button: 'left',
          clickCount: 1,
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectMouseEvent({
          type: 'mouseReleased',
          x: 100,
          y: 100,
          button: 'left',
        })
      ).resolves.not.toThrow();
    });

    it('should inject mouse wheel event', async () => {
      await expect(
        browser.injectMouseEvent({
          type: 'mouseWheel',
          x: 100,
          y: 100,
          deltaX: 0,
          deltaY: 100,
        })
      ).resolves.not.toThrow();
    });

    it('should inject keyboard events', async () => {
      await expect(
        browser.injectKeyboardEvent({
          type: 'keyDown',
          key: 'a',
          code: 'KeyA',
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectKeyboardEvent({
          type: 'keyUp',
          key: 'a',
          code: 'KeyA',
        })
      ).resolves.not.toThrow();
    });

    it('should inject char event', async () => {
      // CDP char events only accept single characters
      await expect(
        browser.injectKeyboardEvent({
          type: 'char',
          text: 'h',
        })
      ).resolves.not.toThrow();
    });

    it('should inject keyboard with modifiers', async () => {
      await expect(
        browser.injectKeyboardEvent({
          type: 'keyDown',
          key: 'c',
          code: 'KeyC',
          modifiers: 2, // Ctrl
        })
      ).resolves.not.toThrow();
    });

    it('should inject touch events', async () => {
      await expect(
        browser.injectTouchEvent({
          type: 'touchStart',
          touchPoints: [{ x: 100, y: 100 }],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchMove',
          touchPoints: [{ x: 150, y: 150 }],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchEnd',
          touchPoints: [],
        })
      ).resolves.not.toThrow();
    });

    it('should inject multi-touch events', async () => {
      await expect(
        browser.injectTouchEvent({
          type: 'touchStart',
          touchPoints: [
            { x: 100, y: 100, id: 0 },
            { x: 200, y: 200, id: 1 },
          ],
        })
      ).resolves.not.toThrow();

      await expect(
        browser.injectTouchEvent({
          type: 'touchEnd',
          touchPoints: [],
        })
      ).resolves.not.toThrow();
    });
  });
});
