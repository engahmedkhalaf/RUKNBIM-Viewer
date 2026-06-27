// Workaround: @thatopen/components, components-front, fragments define class
// methods named `import`, `export`, and `new`. These are valid ES syntax but
// trigger "Unexpected token '('" in some browser parsers. This script rewrites
// them to quoted-name methods ("import", "export", "new"), which behave
// identically but avoid the keyword ambiguity. Idempotent.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const targets = [
  'node_modules/@thatopen/components-front/dist/index.js',
  'node_modules/@thatopen/components/dist/index.mjs',
  'node_modules/@thatopen/fragments/dist/index.mjs',
];

// Also patch the Vite pre-bundle cache if it exists.
const viteDeps = 'node_modules/.vite/deps';
if (existsSync(viteDeps)) {
  for (const f of readdirSync(viteDeps)) {
    if (f.endsWith('.js') && (f.includes('thatopen') || f.startsWith('dist-'))) {
      targets.push(join(viteDeps, f));
    }
  }
}

const KEYWORDS = ['import', 'export', 'new'];
const pattern = new RegExp(
  String.raw`^(\s+)(` + KEYWORDS.join('|') + String.raw`)(\([^)]*\)\s*\{)`,
  'gm'
);

let totalEdits = 0;
for (const rel of targets) {
  if (!existsSync(rel)) continue;
  const src = readFileSync(rel, 'utf8');
  let edits = 0;
  const out = src.replace(pattern, (_m, ws, kw, rest) => {
    edits++;
    return `${ws}"${kw}"${rest}`;
  });
  if (edits > 0) {
    writeFileSync(rel, out);
    console.log(`patched ${edits} in ${rel}`);
    totalEdits += edits;
  }
}
console.log(`thatopen-keywords patch: ${totalEdits} edits`);
