#!/usr/bin/env node
/**
 * Generates the mobile app's copy of the shared chord/scale logic from the
 * website's lib/ -- the website is the ONE place these files are edited.
 *
 *   npm run sync:mobile          write mobile/lib/<file> for every shared file
 *   npm run check:mobile-sync    exit 1 if any generated copy is out of date
 *
 * Why a generated copy and not a direct import: it keeps mobile/ fully
 * self-contained for store builds (EAS may only archive the app directory)
 * and avoids bundler config, while still meaning a fix is made once.
 *
 * What the transform does to each file:
 *   - rewrites `@/lib/...` imports (the website's alias, which mobile
 *     doesn't have) to relative paths;
 *   - prepends a GENERATED header so nobody edits the copy by hand;
 *   - refuses files that import anything else (these must stay pure
 *     TypeScript: no React, no Next, no Supabase, no other aliases).
 *
 * To share another file, add it to SHARED below.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

// Paths relative to lib/. Only pure-logic files belong here.
const SHARED = [
    'chordQualities.ts',
    'fretboardMap.ts',
    'MusicTheory.ts',
    'scaleAlgorithms.ts',
    'tunings.ts',
    'Shapes/Chords.ts',
    'Shapes/Scales.ts',
];

if (!existsSync(join(root, 'mobile', 'lib'))) {
    console.log('sync-mobile-lib: no mobile/lib here (not on the mobile branch) -- nothing to do.');
    process.exit(0);
}

function transform(file, source) {
    const dir = posix.dirname(file); // directory of this file, relative to lib/
    let out = source.replace(
        /(from\s+|import\s+|import\()(['"])@\/lib\/([^'"]+)\2/g,
        (_m, lead, quote, target) => {
            let rel = posix.relative(dir, target);
            if (!rel.startsWith('.')) rel = `./${rel}`;
            return `${lead}${quote}${rel}${quote}`;
        },
    );
    // Anything still imported that isn't a relative path is not pure logic.
    for (const m of out.matchAll(/(?:from\s+|import\s+|import\()(['"])([^'"]+)\1/g)) {
        if (!m[2].startsWith('.')) {
            throw new Error(
                `${file}: imports "${m[2]}". Shared files may only import other lib/ files ` +
                    `(via @/lib/... or relative). Remove it or don't share this file.`,
            );
        }
    }
    const header =
        `// GENERATED FILE -- do not edit. Source: lib/${file} (the website's lib is the single source).\n` +
        `// Edit that file, then run \`npm run sync:mobile\` from the repo root.\n`;
    return header + out;
}

const stale = [];
for (const file of SHARED) {
    const src = join(root, 'lib', file);
    const dest = join(root, 'mobile', 'lib', file);
    const next = transform(file, readFileSync(src, 'utf8'));
    const current = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    if (current === next) continue;
    if (checkOnly) {
        stale.push(file);
    } else {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, next);
        console.log(`  wrote mobile/lib/${file}`);
    }
}

if (checkOnly) {
    if (stale.length) {
        console.error(
            `sync-mobile-lib: out of date: ${stale.map(f => `mobile/lib/${f}`).join(', ')}\n` +
                `Run \`npm run sync:mobile\` and commit the result (never edit mobile/lib copies by hand).`,
        );
        process.exit(1);
    }
    console.log('sync-mobile-lib: mobile/lib is up to date.');
} else {
    console.log('sync-mobile-lib: done.');
}
