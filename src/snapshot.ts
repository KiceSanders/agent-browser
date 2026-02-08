/**
 * Enhanced snapshot with element refs for deterministic element selection.
 *
 * This module generates accessibility snapshots with embedded refs that can be
 * used to click/fill/interact with elements without re-querying the DOM.
 *
 * Example output:
 *   - heading "Example Domain" [ref=e1] [level=1]
 *   - paragraph: Some text content
 *   - button "Submit" [ref=e2]
 *   - textbox "Email" [ref=e3]
 *
 * Usage:
 *   agent-browser snapshot              # Full snapshot
 *   agent-browser snapshot -i           # Interactive elements only
 *   agent-browser snapshot --depth 3    # Limit depth
 *   agent-browser click @e2             # Click element by ref
 */

import type { Page, Frame, Locator } from 'playwright-core';

export interface RefMap {
  [ref: string]: {
    selector: string;
    role: string;
    name?: string;
    /** Index for disambiguation when multiple elements have same role+name */
    nth?: number;
  };
}

export interface EnhancedSnapshot {
  tree: string;
  refs: RefMap;
}

export interface SnapshotOptions {
  /** Only include interactive elements (buttons, links, inputs, etc.) */
  interactive?: boolean;
  /** Include cursor-interactive elements (cursor:pointer, onclick, tabindex) */
  cursor?: boolean;
  /** Maximum depth of tree to include (0 = root only) */
  maxDepth?: number;
  /** Remove structural elements without meaningful content */
  compact?: boolean;
  /** CSS selector to scope the snapshot */
  selector?: string;
}

interface SnapshotRegion {
  key: 'sidebar' | 'contents' | 'drawer' | 'fab';
  title: string;
  selectors: string[];
}

// Counter for generating refs
let refCounter = 0;

/**
 * Reset ref counter (call at start of each snapshot)
 */
export function resetRefs(): void {
  refCounter = 0;
}

/**
 * Generate next ref ID
 */
function nextRef(): string {
  return `e${++refCounter}`;
}

/**
 * Roles that are interactive and should get refs
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

/**
 * Roles that provide structure/context (get refs for text extraction)
 */
const CONTENT_ROLES = new Set([
  'heading',
  'cell',
  'gridcell',
  'columnheader',
  'rowheader',
  'listitem',
  'article',
  'region',
  'main',
  'navigation',
]);

/**
 * Roles that are purely structural (can be filtered in compact mode)
 */
const STRUCTURAL_ROLES = new Set([
  'generic',
  'group',
  'list',
  'table',
  'row',
  'rowgroup',
  'grid',
  'treegrid',
  'menu',
  'menubar',
  'toolbar',
  'tablist',
  'tree',
  'directory',
  'document',
  'application',
  'presentation',
  'none',
]);

/**
 * Build a selector string for storing in ref map
 */
function buildSelector(role: string, name?: string): string {
  if (name) {
    const escapedName = name.replace(/"/g, '\\"');
    return `getByRole('${role}', { name: "${escapedName}", exact: true })`;
  }
  return `getByRole('${role}')`;
}

/**
 * Query the page for clickable elements that might not have proper ARIA roles.
 * This finds elements with cursor: pointer or onclick handlers.
 */
async function findCursorInteractiveElements(
  page: Page | Frame,
  selector?: string
): Promise<
  Array<{
    selector: string;
    text: string;
    tagName: string;
    hasOnClick: boolean;
    hasCursorPointer: boolean;
    hasTabIndex: boolean;
  }>
> {
  const rootSelector = selector || 'body';

  try {
    return await page.evaluate((rootSel) => {
      interface Candidate {
        element: any;
        selector: string;
        text: string;
        tagName: string;
        hasOnClick: boolean;
        hasCursorPointer: boolean;
        hasTabIndex: boolean;
        hasTitle: boolean;
        hasAriaLabel: boolean;
        hasDirectCursorPointer: boolean;
        depth: number;
        order: number;
      }

      const interactiveRoles = new Set([
        'button',
        'link',
        'textbox',
        'checkbox',
        'radio',
        'combobox',
        'listbox',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'option',
        'searchbox',
        'slider',
        'spinbutton',
        'switch',
        'tab',
        'treeitem',
      ]);

      const interactiveTags = new Set([
        'a',
        'button',
        'input',
        'select',
        'textarea',
        'details',
        'summary',
      ]);

      const doc = (globalThis as any).document as any;
      const getComputedStyle = (globalThis as any).getComputedStyle as (el: any) => any;
      const cssApi = (globalThis as any).CSS as { escape?: (value: string) => string } | undefined;
      const escapeCss = (value: string): string =>
        cssApi?.escape ? cssApi.escape(value) : value.replace(/["\\]/g, '\\$&');

      const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

      const getVisibleText = (el: any): string => {
        if (!el || typeof el.innerText !== 'string') return '';
        const innerText = normalizeText(el.innerText);
        return innerText;
      };

      const getBestText = (el: any): string => {
        const title = normalizeText(el.getAttribute('title') || '');
        if (title) return title;

        const ariaLabel = normalizeText(el.getAttribute('aria-label') || '');
        if (ariaLabel) return ariaLabel;

        const visibleText = getVisibleText(el);
        if (visibleText) return visibleText;

        return normalizeText(el.textContent || '');
      };

      const getDepth = (el: any): number => {
        let depth = 0;
        let current: any = el;
        while (current?.parentElement) {
          depth += 1;
          current = current.parentElement;
        }
        return depth;
      };

      const buildSelector = (el: any): string => {
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid=${JSON.stringify(testId)}]`;
        if (el.id) return `#${escapeCss(el.id)}`;

        const path: string[] = [];
        let current: any = el;
        while (current && current !== doc.body) {
          let segment = current.tagName.toLowerCase();
          const classNames = (Array.from(current.classList ?? []) as string[]).filter(
            (className) => className.trim().length > 0
          );
          const firstClass = classNames[0];
          if (firstClass) segment += `.${escapeCss(firstClass)}`;

          const parent = current.parentElement;
          if (parent) {
            const sameTagSiblings = (Array.from(parent.children ?? []) as any[]).filter(
              (sib) => sib.tagName === current.tagName
            );
            if (sameTagSiblings.length > 1) {
              const idx = sameTagSiblings.indexOf(current) + 1;
              segment += `:nth-of-type(${idx})`;
            }
          }

          path.unshift(segment);
          current = current.parentElement;

          if (path.length >= 6) break;
        }

        if (path.length === 0) {
          return el.tagName.toLowerCase();
        }

        return path.join(' > ');
      };

      const root = doc.querySelector(rootSel) ?? doc.body;
      const allElements: any[] = [root, ...(Array.from(root.querySelectorAll('*')) as any[])];

      const candidates: Candidate[] = [];
      let order = 0;

      for (const el of allElements) {
        if (!el || el.nodeType !== 1) continue;

        const tagName = el.tagName.toLowerCase();
        if (interactiveTags.has(tagName)) continue;

        const role = el.getAttribute('role');
        if (role && interactiveRoles.has(role.toLowerCase())) continue;

        const computedStyle = getComputedStyle(el);
        const hasCursorPointer = computedStyle.cursor === 'pointer';
        const hasDirectCursorPointer = el.style?.cursor === 'pointer';
        const hasOnClick = el.hasAttribute('onclick') || typeof (el as any).onclick === 'function';

        const tabIndex = el.getAttribute('tabindex');
        const hasTabIndex = tabIndex !== null && Number.parseInt(tabIndex, 10) >= 0;

        if (!hasCursorPointer && !hasOnClick && !hasTabIndex) continue;

        if (
          computedStyle.display === 'none' ||
          computedStyle.visibility === 'hidden' ||
          computedStyle.opacity === '0'
        ) {
          continue;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const text = getBestText(el).slice(0, 100);
        if (!text) continue;

        const hasTitle = normalizeText(el.getAttribute('title') || '').length > 0;
        const hasAriaLabel = normalizeText(el.getAttribute('aria-label') || '').length > 0;

        candidates.push({
          element: el,
          selector: buildSelector(el),
          text,
          tagName,
          hasOnClick,
          hasCursorPointer,
          hasTabIndex,
          hasTitle,
          hasAriaLabel,
          hasDirectCursorPointer,
          depth: getDepth(el),
          order: order++,
        });
      }

      const scoreCandidate = (candidate: Candidate): number => {
        let score = 0;
        if (candidate.hasTitle) score += 16;
        else if (candidate.hasAriaLabel) score += 8;
        if (candidate.hasDirectCursorPointer) score += 4;
        if (candidate.hasOnClick) score += 2;
        if (candidate.hasTabIndex) score += 1;
        return score;
      };

      const sorted = [...candidates].sort((a, b) => {
        const scoreDiff = scoreCandidate(b) - scoreCandidate(a);
        if (scoreDiff !== 0) return scoreDiff;

        const aLabeled = a.hasTitle || a.hasAriaLabel;
        const bLabeled = b.hasTitle || b.hasAriaLabel;
        if (aLabeled && bLabeled) {
          if (a.depth !== b.depth) return a.depth - b.depth; // Prefer titled ancestors
        } else if (a.depth !== b.depth) {
          return b.depth - a.depth; // Prefer deepest unlabeled candidate
        }

        return a.order - b.order;
      });

      const selected: Candidate[] = [];
      for (const candidate of sorted) {
        const overlaps = selected.some(
          (chosen) =>
            chosen.element.contains(candidate.element) || candidate.element.contains(chosen.element)
        );
        if (overlaps) continue;
        selected.push(candidate);
      }

      selected.sort((a, b) => a.order - b.order);

      return selected.map((candidate) => ({
        selector: candidate.selector,
        text: candidate.text,
        tagName: candidate.tagName,
        hasOnClick: candidate.hasOnClick,
        hasCursorPointer: candidate.hasCursorPointer,
        hasTabIndex: candidate.hasTabIndex,
      }));
    }, rootSelector);
  } catch (error) {
    console.error('findCursorInteractiveElements failed:', error);
    return [];
  }
}

/**
 * Detect active Myhelo sub-frame regions and return unique selectors for each.
 */
async function getMyheloActiveRegions(page: Page | Frame): Promise<SnapshotRegion[]> {
  try {
    return await page.evaluate(() => {
      type RegionKey = 'sidebar' | 'contents' | 'drawer' | 'fab';

      interface RegionDefinition {
        key: RegionKey;
        title: string;
        candidates: string[];
      }

      interface RegionResult {
        key: RegionKey;
        title: string;
        selectors: string[];
      }

      const doc = (globalThis as any).document as any;
      const windowRef = globalThis as any;
      const getComputedStyle = (globalThis as any).getComputedStyle as (el: any) => any;
      const cssApi = (globalThis as any).CSS as { escape?: (value: string) => string } | undefined;
      const escapeCss = (value: string): string =>
        cssApi?.escape ? cssApi.escape(value) : value.replace(/["\\]/g, '\\$&');

      const definitions: RegionDefinition[] = [
        {
          key: 'sidebar',
          title: 'Sidebar',
          candidates: [
            '#sidebar-header',
            '#sidebar-center',
            '#sidebar-footer',
            '.component.reverb.sidebar',
          ],
        },
        {
          key: 'contents',
          title: 'Contents',
          candidates: [
            '#panel-header',
            '#panel-center',
            '#panel-footer',
            '#contents-header',
            '#contents-center',
            '#contents-footer',
            '.component.reverb.threads',
            '.component.reverb.messages',
          ],
        },
        {
          key: 'drawer',
          title: 'Drawer',
          candidates: ['#drawer-container', '#drawer-header', '#drawer-center', '#drawer-footer'],
        },
      ];

      const hasMyheloSubLayout =
        !!(
          doc.querySelector('#panel-center') ||
          doc.querySelector('#contents-center') ||
          doc.querySelector('.component.reverb.threads') ||
          doc.querySelector('.component.reverb.messages')
        ) &&
        !!(
          doc.querySelector('#sidebar-center') ||
          doc.querySelector('#drawer-container') ||
          doc.querySelector('.component.reverb.sidebar')
        );

      if (!hasMyheloSubLayout) {
        return [] as RegionResult[];
      }

      const getDepth = (el: any): number => {
        let depth = 0;
        let current: any = el;
        while (current?.parentElement) {
          depth += 1;
          current = current.parentElement;
        }
        return depth;
      };

      const isOnScreenAndVisible = (el: any): boolean => {
        if (!el || el.nodeType !== 1) return false;

        const style = getComputedStyle(el);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0' ||
          style.pointerEvents === 'none'
        ) {
          return false;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;

        const intersectionWidth =
          Math.min(rect.right, windowRef.innerWidth) - Math.max(rect.left, 0);
        const intersectionHeight =
          Math.min(rect.bottom, windowRef.innerHeight) - Math.max(rect.top, 0);
        return intersectionWidth > 1 && intersectionHeight > 1;
      };

      const buildUniqueSelector = (el: any): string => {
        if (el.id) {
          const idSelector = `#${escapeCss(el.id)}`;
          if (doc.querySelectorAll(idSelector).length === 1) {
            return idSelector;
          }
        }

        const testId = el.getAttribute('data-testid');
        if (testId) {
          const testIdSelector = `[data-testid=${JSON.stringify(testId)}]`;
          if (doc.querySelectorAll(testIdSelector).length === 1) {
            return testIdSelector;
          }
        }

        const path: string[] = [];
        let current: any = el;
        while (current && current !== doc.body && current.nodeType === 1) {
          let segment = current.tagName.toLowerCase();
          const classNames = (Array.from(current.classList ?? []) as string[]).filter(
            (className) => className.trim().length > 0
          );
          const firstClass = classNames[0];
          if (firstClass) segment += `.${escapeCss(firstClass)}`;

          const parent = current.parentElement;
          if (parent) {
            const sameTagSiblings = (Array.from(parent.children ?? []) as any[]).filter(
              (sib) => sib.tagName === current.tagName
            );
            if (sameTagSiblings.length > 1) {
              const idx = sameTagSiblings.indexOf(current) + 1;
              segment += `:nth-of-type(${idx})`;
            }
          }

          path.unshift(segment);
          current = current.parentElement;
        }

        if (path.length === 0) {
          return el.tagName.toLowerCase();
        }

        return path.join(' > ');
      };

      const dedupeTopLevelElements = (elements: any[]): any[] => {
        const uniqueElements = Array.from(new Set(elements));
        uniqueElements.sort((a, b) => getDepth(a) - getDepth(b));

        const selected: any[] = [];
        for (const candidate of uniqueElements) {
          const nestedInSelected = selected.some((picked) => picked.contains(candidate));
          if (nestedInSelected) continue;
          selected.push(candidate);
        }

        return selected;
      };

      const collectRegionSelectors = (candidateSelectors: string[]): string[] => {
        const matches: any[] = [];
        for (const selector of candidateSelectors) {
          const elements = Array.from(doc.querySelectorAll(selector));
          for (const el of elements) {
            if (isOnScreenAndVisible(el)) {
              matches.push(el);
            }
          }
        }

        const selected = dedupeTopLevelElements(matches);
        return selected.map((el) => buildUniqueSelector(el));
      };

      const fabTokenPattern = /(^|[-_])fab($|[-_])/i;
      const circleTokenPattern = /(^|[-_])circle($|[-_])/i;
      const parseRadius = (raw: string, minDimension: number): number => {
        if (!raw) return 0;
        const token = raw.split(/\s+/)[0];
        if (token.endsWith('%')) {
          const percent = Number.parseFloat(token.slice(0, -1));
          if (Number.isFinite(percent)) return (percent / 100) * minDimension;
          return 0;
        }
        const px = Number.parseFloat(token);
        if (Number.isFinite(px)) return px;
        return 0;
      };
      const isInteractiveElement = (el: any, style: any): boolean => {
        const tagName = String(el.tagName || '').toLowerCase();
        if (tagName === 'button' || tagName === 'a') return true;

        const role = String(el.getAttribute('role') || '').toLowerCase();
        if (role === 'button' || role === 'link') return true;

        if (style.cursor === 'pointer') return true;
        if (el.hasAttribute('onclick') || typeof el.onclick === 'function') return true;

        const tabIndexAttr = el.getAttribute('tabindex');
        if (tabIndexAttr !== null && Number.parseInt(tabIndexAttr, 10) >= 0) return true;

        return false;
      };
      const isFabLikeFloatingControl = (el: any): boolean => {
        if (!isOnScreenAndVisible(el)) return false;

        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const minDimension = Math.min(rect.width, rect.height);
        const maxDimension = Math.max(rect.width, rect.height);

        const zIndex = Number.parseInt(style.zIndex || '0', 10);
        const floatingPosition =
          style.position === 'fixed' ||
          style.position === 'sticky' ||
          (style.position === 'absolute' && Number.isFinite(zIndex) && zIndex >= 20);
        if (!floatingPosition) return false;

        if (minDimension < 32 || maxDimension > 120) return false;

        const viewportWidth = (globalThis as any).innerWidth as number;
        const viewportHeight = (globalThis as any).innerHeight as number;
        const nearBottomRight =
          rect.right >= viewportWidth - 200 && rect.bottom >= viewportHeight - 200;
        if (!nearBottomRight) return false;

        if (!isInteractiveElement(el, style)) return false;

        const classes = Array.from(el.classList ?? []) as string[];
        const hasCircleClass = classes.some((className) => circleTokenPattern.test(className));
        const radius = parseRadius(
          style.borderRadius || style.borderTopLeftRadius || '',
          minDimension
        );
        const isRounded = hasCircleClass || radius >= minDimension * 0.35;
        if (!isRounded) return false;

        return true;
      };
      const collectFabSelectors = (): string[] => {
        const fabElements = (Array.from(doc.querySelectorAll('*')) as any[]).filter((el) => {
          if (!isOnScreenAndVisible(el)) return false;

          const id = String(el.id || '');
          const classes = Array.from(el.classList ?? []) as string[];

          if (fabTokenPattern.test(id)) return true;
          if (classes.some((className) => fabTokenPattern.test(className))) return true;

          return isFabLikeFloatingControl(el);
        });

        const selected = dedupeTopLevelElements(fabElements);
        return selected.map((el) => buildUniqueSelector(el));
      };

      const regions: RegionResult[] = [];

      for (const definition of definitions) {
        const selectors = collectRegionSelectors(definition.candidates);
        if (selectors.length > 0) {
          regions.push({
            key: definition.key,
            title: definition.title,
            selectors,
          });
        }
      }

      const fabSelectors = collectFabSelectors();
      if (fabSelectors.length > 0) {
        regions.push({
          key: 'fab',
          title: 'FAB',
          selectors: fabSelectors,
        });
      }

      return regions;
    });
  } catch (error) {
    console.error('getMyheloActiveRegions failed:', error);
    return [];
  }
}

async function getEnhancedSnapshotForScope(
  page: Page | Frame,
  options: SnapshotOptions,
  refs: RefMap,
  tracker: RoleNameTracker
): Promise<string> {
  let enhancedTree = '(empty)';
  try {
    const locator = options.selector ? page.locator(options.selector) : page.locator(':root');
    const ariaTree = await locator.ariaSnapshot();
    if (ariaTree) {
      enhancedTree = processAriaTree(ariaTree, refs, options, tracker, false);
    } else if (options.interactive) {
      enhancedTree = '(no interactive elements)';
    }
  } catch (error) {
    // Ignore strict/selector errors for scoped region snapshots and treat as empty.
    enhancedTree = options.interactive ? '(no interactive elements)' : '(empty)';
  }

  if (options.cursor) {
    const cursorElements = await findCursorInteractiveElements(page, options.selector);
    const additionalLines: string[] = [];

    for (const el of cursorElements) {
      const ref = nextRef();
      const role = el.hasCursorPointer ? 'clickable' : el.hasOnClick ? 'clickable' : 'focusable';

      refs[ref] = {
        selector: el.selector,
        role,
        name: el.text,
      };

      const hints: string[] = [];
      if (el.hasCursorPointer) hints.push('cursor:pointer');
      if (el.hasOnClick) hints.push('onclick');
      if (el.hasTabIndex) hints.push('tabindex');

      additionalLines.push(`- ${role} "${el.text}" [ref=${ref}] [${hints.join(', ')}]`);
    }

    if (additionalLines.length > 0) {
      const separator =
        enhancedTree === '(no interactive elements)' || enhancedTree === '(empty)'
          ? ''
          : '\n# Cursor-interactive elements:\n';
      const base =
        enhancedTree === '(no interactive elements)' || enhancedTree === '(empty)'
          ? ''
          : enhancedTree;
      return base + separator + additionalLines.join('\n');
    }
  }

  return enhancedTree;
}

async function buildMyheloRegionSection(
  page: Page | Frame,
  options: SnapshotOptions,
  refs: RefMap,
  tracker: RoleNameTracker,
  selectors: string[]
): Promise<string> {
  const sectionParts: string[] = [];

  for (const selector of selectors) {
    const scopedTree = await getEnhancedSnapshotForScope(
      page,
      { ...options, selector },
      refs,
      tracker
    );
    if (!scopedTree || scopedTree === '(empty)' || scopedTree === '(no interactive elements)') {
      continue;
    }
    sectionParts.push(scopedTree);
  }

  if (sectionParts.length > 0) {
    return sectionParts.join('\n');
  }

  return options.interactive ? '(no interactive elements)' : '(empty)';
}

/**
 * Get enhanced snapshot with refs and optional filtering
 */
export async function getEnhancedSnapshot(
  page: Page | Frame,
  options: SnapshotOptions = {}
): Promise<EnhancedSnapshot> {
  resetRefs();
  const refs: RefMap = {};
  const tracker = createRoleNameTracker();

  if (!options.selector) {
    const regions = await getMyheloActiveRegions(page);
    if (regions.length > 0) {
      const sections: string[] = [];

      for (const region of regions) {
        const sectionTree = await buildMyheloRegionSection(
          page,
          options,
          refs,
          tracker,
          region.selectors
        );
        sections.push(`# ${region.title}:\n${sectionTree}`);
      }

      removeNthFromNonDuplicates(refs, tracker);

      return {
        tree: sections.join('\n\n'),
        refs,
      };
    }
  }

  const enhancedTree = await getEnhancedSnapshotForScope(page, options, refs, tracker);
  removeNthFromNonDuplicates(refs, tracker);

  return { tree: enhancedTree, refs };
}

/**
 * Track role+name combinations to detect duplicates
 */
interface RoleNameTracker {
  counts: Map<string, number>;
  /** Maps role+name key to array of ref IDs that use it */
  refsByKey: Map<string, string[]>;
  getKey(role: string, name?: string): string;
  getNextIndex(role: string, name?: string): number;
  trackRef(role: string, name: string | undefined, ref: string): void;
  /** Get all role+name keys that have duplicates */
  getDuplicateKeys(): Set<string>;
}

function createRoleNameTracker(): RoleNameTracker {
  const counts = new Map<string, number>();
  const refsByKey = new Map<string, string[]>();
  return {
    counts,
    refsByKey,
    getKey(role: string, name?: string): string {
      return `${role}:${name ?? ''}`;
    },
    getNextIndex(role: string, name?: string): number {
      const key = this.getKey(role, name);
      const current = counts.get(key) ?? 0;
      counts.set(key, current + 1);
      return current;
    },
    trackRef(role: string, name: string | undefined, ref: string): void {
      const key = this.getKey(role, name);
      const refs = refsByKey.get(key) ?? [];
      refs.push(ref);
      refsByKey.set(key, refs);
    },
    getDuplicateKeys(): Set<string> {
      const duplicates = new Set<string>();
      for (const [key, refs] of refsByKey) {
        if (refs.length > 1) {
          duplicates.add(key);
        }
      }
      return duplicates;
    },
  };
}

/**
 * Process ARIA snapshot: add refs and apply filters
 */
function processAriaTree(
  ariaTree: string,
  refs: RefMap,
  options: SnapshotOptions,
  tracker: RoleNameTracker = createRoleNameTracker(),
  finalizeNth: boolean = true
): string {
  const lines = ariaTree.split('\n');
  const result: string[] = [];

  // For interactive-only mode, we collect just interactive elements
  if (options.interactive) {
    for (const line of lines) {
      const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
      if (!match) continue;

      const [, , role, name, suffix] = match;
      const roleLower = role.toLowerCase();

      if (INTERACTIVE_ROLES.has(roleLower)) {
        const ref = nextRef();
        const nth = tracker.getNextIndex(roleLower, name);
        tracker.trackRef(roleLower, name, ref);
        refs[ref] = {
          selector: buildSelector(roleLower, name),
          role: roleLower,
          name,
          nth, // Always store nth, we'll use it for duplicates
        };

        let enhanced = `- ${role}`;
        if (name) enhanced += ` "${name}"`;
        enhanced += ` [ref=${ref}]`;
        // Only show nth in output if it's > 0 (for readability)
        if (nth > 0) enhanced += ` [nth=${nth}]`;
        if (suffix && suffix.includes('[')) enhanced += suffix;

        result.push(enhanced);
      }
    }

    if (finalizeNth) {
      // Post-process: remove nth from refs that don't have duplicates
      removeNthFromNonDuplicates(refs, tracker);
    }

    return result.join('\n') || '(no interactive elements)';
  }

  // Normal processing with depth/compact filters
  for (const line of lines) {
    const processed = processLine(line, refs, options, tracker);
    if (processed !== null) {
      result.push(processed);
    }
  }

  if (finalizeNth) {
    // Post-process: remove nth from refs that don't have duplicates
    removeNthFromNonDuplicates(refs, tracker);
  }

  // If compact mode, remove empty structural elements
  if (options.compact) {
    return compactTree(result.join('\n'));
  }

  return result.join('\n');
}

/**
 * Remove nth from refs that ended up not having duplicates
 * This keeps single-element locators simple (no unnecessary .nth(0))
 */
function removeNthFromNonDuplicates(refs: RefMap, tracker: RoleNameTracker): void {
  const duplicateKeys = tracker.getDuplicateKeys();

  for (const [ref, data] of Object.entries(refs)) {
    const key = tracker.getKey(data.role, data.name);
    if (!duplicateKeys.has(key)) {
      // Not a duplicate, remove nth to keep locator simple
      delete refs[ref].nth;
    }
  }
}

/**
 * Get indentation level (number of spaces / 2)
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? Math.floor(match[1].length / 2) : 0;
}

/**
 * Process a single line: add ref if needed, filter if requested
 */
function processLine(
  line: string,
  refs: RefMap,
  options: SnapshotOptions,
  tracker: RoleNameTracker
): string | null {
  const depth = getIndentLevel(line);

  // Check max depth
  if (options.maxDepth !== undefined && depth > options.maxDepth) {
    return null;
  }

  // Match lines like:
  //   - button "Submit"
  //   - heading "Title" [level=1]
  //   - link "Click me":
  const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);

  if (!match) {
    // Metadata lines (like /url:) or text content
    if (options.interactive) {
      // In interactive mode, only keep metadata under interactive elements
      return null;
    }
    return line;
  }

  const [, prefix, role, name, suffix] = match;
  const roleLower = role.toLowerCase();

  // Skip metadata lines (like /url:)
  if (role.startsWith('/')) {
    return line;
  }

  const isInteractive = INTERACTIVE_ROLES.has(roleLower);
  const isContent = CONTENT_ROLES.has(roleLower);
  const isStructural = STRUCTURAL_ROLES.has(roleLower);

  // In interactive-only mode, filter non-interactive elements
  if (options.interactive && !isInteractive) {
    return null;
  }

  // In compact mode, skip unnamed structural elements
  if (options.compact && isStructural && !name) {
    return null;
  }

  // Add ref for interactive or named content elements
  const shouldHaveRef = isInteractive || (isContent && name);

  if (shouldHaveRef) {
    const ref = nextRef();
    const nth = tracker.getNextIndex(roleLower, name);
    tracker.trackRef(roleLower, name, ref);

    refs[ref] = {
      selector: buildSelector(roleLower, name),
      role: roleLower,
      name,
      nth, // Always store nth, we'll clean up non-duplicates later
    };

    // Build enhanced line with ref
    let enhanced = `${prefix}${role}`;
    if (name) enhanced += ` "${name}"`;
    enhanced += ` [ref=${ref}]`;
    // Only show nth in output if it's > 0 (for readability)
    if (nth > 0) enhanced += ` [nth=${nth}]`;
    if (suffix) enhanced += suffix;

    return enhanced;
  }

  return line;
}

/**
 * Remove empty structural branches in compact mode
 */
function compactTree(tree: string): string {
  const lines = tree.split('\n');
  const result: string[] = [];

  // Simple pass: keep lines that have content or refs
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Always keep lines with refs
    if (line.includes('[ref=')) {
      result.push(line);
      continue;
    }

    // Keep lines with text content (after :)
    if (line.includes(':') && !line.endsWith(':')) {
      result.push(line);
      continue;
    }

    // Check if this structural element has children with refs
    const currentIndent = getIndentLevel(line);
    let hasRelevantChildren = false;

    for (let j = i + 1; j < lines.length; j++) {
      const childIndent = getIndentLevel(lines[j]);
      if (childIndent <= currentIndent) break;
      if (lines[j].includes('[ref=')) {
        hasRelevantChildren = true;
        break;
      }
    }

    if (hasRelevantChildren) {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Parse a ref from command argument (e.g., "@e1" -> "e1")
 */
export function parseRef(arg: string): string | null {
  if (arg.startsWith('@')) {
    return arg.slice(1);
  }
  if (arg.startsWith('ref=')) {
    return arg.slice(4);
  }
  if (/^e\d+$/.test(arg)) {
    return arg;
  }
  return null;
}

/**
 * Get snapshot statistics
 */
export function getSnapshotStats(
  tree: string,
  refs: RefMap
): {
  lines: number;
  chars: number;
  tokens: number;
  refs: number;
  interactive: number;
} {
  const interactive = Object.values(refs).filter((r) => INTERACTIVE_ROLES.has(r.role)).length;

  return {
    lines: tree.split('\n').length,
    chars: tree.length,
    tokens: Math.ceil(tree.length / 4),
    refs: Object.keys(refs).length,
    interactive,
  };
}
