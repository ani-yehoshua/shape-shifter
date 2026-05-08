import type { ShapeFormula } from '@/lib/fretboardMap';
import type { ChordQuality } from '@/lib/chordQualities';
import { STANDARD_TUNING_SEMITONES } from '@/lib/chordQualities';

// ── Utilities ─────────────────────────────────────────────────────────────────

function permutations(n: number): number[][] {
    if (n === 0) return [[]];
    const result: number[][] = [];
    const indices = Array.from({ length: n }, (_, i) => i);
    function recurse(current: number[], remaining: number[]) {
        if (remaining.length === 0) {
            result.push(current);
            return;
        }
        for (let i = 0; i < remaining.length; i++) {
            recurse(
                [...current, remaining[i]],
                [...remaining.slice(0, i), ...remaining.slice(i + 1)],
            );
        }
    }
    recurse([], indices);
    return result;
}

// Cartesian product of `options` repeated `length` times.
function cartesianProduct(options: number[], length: number): number[][] {
    if (length === 0) return [[]];
    const rest = cartesianProduct(options, length - 1);
    return options.flatMap(o => rest.map(r => [o, ...r]));
}

// ── Core formula ──────────────────────────────────────────────────────────────
// The fret offset of a note with `interval` semitones above root, placed on
// `targetString`, when the root sits on `rootString`, with an optional octave
// shift applied to the note.
function computeFretOffset(
    interval: number,
    targetString: number,
    rootString: number,
    tuning: number[],
    octaveShift: number = 0,
): number {
    const stringInterval = tuning[targetString] - tuning[rootString];
    return interval - stringInterval + octaveShift * 12;
}

// ── Inversion classification ───────────────────────────────────────────────────
// Determines which chord tone is the lowest-pitched note in the voicing.
// Uses conceptual pitch (tuning[string] + fretOffset) at rootFret = 0 for
// comparison; relative ordering is all that matters.
function lowestDegree(
    pattern: ShapeFormula['pattern'],
    tuning: number[],
): number {
    const withPitch = pattern.map(n => ({
        degree: n.degree,
        pitch: tuning[n.string] + n.fretOffset,
    }));
    return withPitch.reduce((low, n) => (n.pitch < low.pitch ? n : low)).degree;
}

const INVERSION_NAMES: Record<number, string> = {
    1: 'Root',
    3: '1st Inv.',
    5: '2nd Inv.',
    7: '3rd Inv.',
    4: '2nd Inv.', // sus4 "2nd Inv."
    6: '3rd Inv.', // 6th chord bass
    2: '1st Inv.', // sus2
};

function inversionName(bassDegree: number): string {
    return INVERSION_NAMES[bassDegree] ?? `${bassDegree}th Inv.`;
}

// ── Main generator ────────────────────────────────────────────────────────────
// Generates every playable voicing of `quality` across the given `strings`
// within `maxSpan` frets. Each returned ShapeFormula is one unique voicing;
// its `name` field contains the inversion label.
export function generateVoicings(
    quality: ChordQuality,
    strings: number[],
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    maxSpan: number = 5,
): ShapeFormula[] {
    const { intervals, degrees } = quality;
    if (intervals.length !== strings.length) {
        throw new Error(
            `generateVoicings: ${intervals.length} intervals but ${strings.length} strings`,
        );
    }

    const n = intervals.length;
    const results: ShapeFormula[] = [];
    const seen = new Set<string>();

    const octaveShifts = [-3, -2, -1, 0, 1, 2];

    for (const perm of permutations(n)) {
        // perm[i] = interval index assigned to strings[i]
        // Find which string position carries the root (interval index 0)
        const rootPos = perm.indexOf(0);
        const rootString = strings[rootPos];

        // For each non-root string, enumerate octave shifts
        const nonRootPositions = perm
            .map((_, i) => i)
            .filter(i => i !== rootPos);

        for (const shifts of cartesianProduct(
            octaveShifts,
            nonRootPositions.length,
        )) {
            const pattern: ShapeFormula['pattern'] = [];

            // Root note always at fretOffset 0
            pattern.push({
                string: rootString,
                fretOffset: 0,
                semitones: 0,
                degree: 1,
            });

            // Non-root notes
            for (let k = 0; k < nonRootPositions.length; k++) {
                const pos = nonRootPositions[k];
                const intervalIdx = perm[pos];
                const str = strings[pos];
                const interval = intervals[intervalIdx];
                const degree = degrees[intervalIdx];
                const fretOffset = computeFretOffset(
                    interval,
                    str,
                    rootString,
                    tuning,
                    shifts[k],
                );
                pattern.push({
                    string: str,
                    fretOffset,
                    semitones: interval,
                    degree,
                });
            }

            // Check playability: span of all fretOffsets must be within maxSpan
            const offsets = pattern.map(n => n.fretOffset);
            const span = Math.max(...offsets) - Math.min(...offsets);
            if (span > maxSpan) continue;

            // Canonicalize by sorting on string index for deduplication
            const sorted = [...pattern].sort((a, b) => a.string - b.string);
            const key = JSON.stringify(sorted);
            if (seen.has(key)) continue;
            seen.add(key);

            const bassD = lowestDegree(sorted, tuning);
            results.push({
                name: inversionName(bassD),
                rootString,
                pattern: sorted,
            });
        }
    }

    // Sort by span ascending so the most compact voicing for each inversion
    // becomes the primary shape when grouped.
    return results.sort((a, b) => {
        const span = (v: typeof a) => {
            const offs = v.pattern.map(n => n.fretOffset);
            return Math.max(...offs) - Math.min(...offs);
        };
        return span(a) - span(b);
    });
}

// ── Grouping ──────────────────────────────────────────────────────────────────
// Groups flat voicings by inversion name. Within each group the first voicing
// becomes the primary shape and the rest become altShapes.
export function groupByInversion(
    voicings: ShapeFormula[],
): Record<string, ShapeFormula> {
    const groups: Record<string, ShapeFormula[]> = {};
    for (const v of voicings) {
        const key = v.name ?? 'Root';
        (groups[key] ??= []).push(v);
    }

    const result: Record<string, ShapeFormula> = {};
    for (const [name, group] of Object.entries(groups)) {
        const [primary, ...alts] = group;
        result[name] = {
            ...primary,
            altShapes: alts.length > 0 ? alts : undefined,
        };
    }
    return result;
}

// ── Bass-anchored generator ───────────────────────────────────────────────────
// Fixes a bass string and enumerates all C(k,2) upper-string combinations,
// keeping only voicings where the lowest-pitched note lands on the bass string.
// This matches the architecture of Beginner.ts where each "string set" is
// really a bass-string anchor with all reachable upper-string combinations.
export function generateBassAnchoredTriadVoicings(
    quality: ChordQuality,
    bassString: number,
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    maxSpan: number = 7,
): ShapeFormula[] {
    const upperStrings = Array.from({ length: bassString }, (_, i) => i);
    if (upperStrings.length < 2) return [];

    const results: ShapeFormula[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < upperStrings.length - 1; i++) {
        for (let j = i + 1; j < upperStrings.length; j++) {
            const strings = [upperStrings[i], upperStrings[j], bassString];
            const voicings = generateVoicings(
                quality,
                strings,
                tuning,
                maxSpan,
            );

            for (const v of voicings) {
                const lowestStr = v.pattern.reduce((low, n) =>
                    tuning[n.string] + n.fretOffset <
                    tuning[low.string] + low.fretOffset
                        ? n
                        : low,
                ).string;
                if (lowestStr !== bassString) continue;

                const key = JSON.stringify(v.pattern);
                if (seen.has(key)) continue;
                seen.add(key);
                results.push(v);
            }
        }
    }

    return results.sort((a, b) => {
        const span = (v: typeof a) => {
            const offs = v.pattern.map(n => n.fretOffset);
            return Math.max(...offs) - Math.min(...offs);
        };
        return span(a) - span(b);
    });
}

// ── Convenience wrappers ──────────────────────────────────────────────────────

export function generateTriadVoicings(
    quality: ChordQuality,
    strings: number[],
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    maxSpan: number = 5,
): ShapeFormula[] {
    if (quality.intervals.length !== 3) {
        throw new Error(
            'generateTriadVoicings: quality must have exactly 3 intervals',
        );
    }
    return generateVoicings(quality, strings, tuning, maxSpan);
}

export function generateShellVoicings(
    quality: ChordQuality,
    strings: number[],
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    maxSpan: number = 5,
): ShapeFormula[] {
    if (quality.intervals.length !== 3) {
        throw new Error(
            'generateShellVoicings: pass a shell quality (3 intervals). Use toShellQuality() first.',
        );
    }
    return generateVoicings(quality, strings, tuning, maxSpan);
}

export function generateSeventhVoicings(
    quality: ChordQuality,
    strings: number[],
    tuning: number[] = STANDARD_TUNING_SEMITONES,
    maxSpan: number = 5,
): ShapeFormula[] {
    if (quality.intervals.length !== 4) {
        throw new Error(
            'generateSeventhVoicings: quality must have exactly 4 intervals',
        );
    }
    return generateVoicings(quality, strings, tuning, maxSpan);
}

// ── Drop voicing transforms ───────────────────────────────────────────────────
// Takes a close-position 4-note voicing (sorted low to high) and applies
// Drop 2 or Drop 3 by lowering the specified voice by an octave.
// These operate on interval arrays, not ShapeFormulas, and are used to
// pre-filter which interval orderings to consider before calling generateVoicings.

// Drop 2: lower the 2nd-highest note by an octave.
export function drop2(closePosition: number[]): number[] {
    const sorted = [...closePosition].sort((a, b) => a - b);
    const idx = sorted.length - 2;
    sorted[idx] -= 12;
    return sorted.sort((a, b) => a - b);
}

// Drop 3: lower the 3rd-highest note by an octave.
export function drop3(closePosition: number[]): number[] {
    const sorted = [...closePosition].sort((a, b) => a - b);
    const idx = sorted.length - 3;
    sorted[idx] -= 12;
    return sorted.sort((a, b) => a - b);
}

// Drop 2 of 2: apply Drop 2 twice.
export function drop2of2(closePosition: number[]): number[] {
    return drop2(drop2(closePosition));
}

// Drop 3 of 2: apply Drop 3 to the Drop 2 result.
export function drop3of2(closePosition: number[]): number[] {
    return drop3(drop2(closePosition));
}

// Raise 3/1 of 2: raise the 1st and 3rd voices from the top each by an octave.
export function raise3and1of2(voicing: number[]): number[] {
    const sorted = [...voicing].sort((a, b) => a - b);
    const n = sorted.length;
    sorted[n - 1] += 12;
    sorted[n - 3] += 12;
    return sorted.sort((a, b) => a - b);
}
