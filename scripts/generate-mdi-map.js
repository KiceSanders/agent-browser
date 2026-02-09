#!/usr/bin/env node

/**
 * Generate a compact codepoint → icon-name map from @mdi/svg meta.json.
 *
 * The output is a TypeScript file (src/mdi-codepoints.ts) that exports a
 * Map<number, string> for use in snapshot.ts to resolve PUA icon glyphs
 * to human-readable names like <paperclip> instead of <icon-u+f03e2>.
 *
 * Usage:
 *   node scripts/generate-mdi-map.js
 *
 * Requires @mdi/svg to be installed as a devDependency.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const metaPath = join(root, 'node_modules', '@mdi', 'svg', 'meta.json');
const outPath = join(root, 'src', 'mdi-codepoints.ts');

const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

// Build sorted entries: [numericCodepoint, iconName]
const entries = meta
  .filter((e) => e.codepoint && e.name && !e.deprecated)
  .map((e) => [parseInt(e.codepoint, 16), e.name])
  .sort((a, b) => a[0] - b[0]);

// Format as a compact TypeScript map
const lines = [
  '/**',
  ' * Auto-generated MDI codepoint → icon-name map.',
  ` * Generated from @mdi/svg meta.json (${entries.length} icons).`,
  ' * Do not edit manually — run: node scripts/generate-mdi-map.js',
  ' */',
  '',
  '// prettier-ignore',
  'export const MDI_CODEPOINT_NAMES: Record<number, string> = {',
];

// Group entries into compact lines (multiple per line to keep file reasonable)
const ENTRIES_PER_LINE = 4;
for (let i = 0; i < entries.length; i += ENTRIES_PER_LINE) {
  const chunk = entries.slice(i, i + ENTRIES_PER_LINE);
  const formatted = chunk.map(([cp, name]) => `0x${cp.toString(16).toUpperCase()}:"${name}"`).join(', ');
  lines.push(`  ${formatted},`);
}

lines.push('};');
lines.push('');

writeFileSync(outPath, lines.join('\n'), 'utf-8');

console.log(`Generated ${outPath} with ${entries.length} icon mappings.`);
