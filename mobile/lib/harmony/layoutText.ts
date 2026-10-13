// GENERATED FILE -- do not edit. Source: lib/harmony/layoutText.ts (the website's lib is the single source).
// Edit that file, then run `npm run sync:mobile` from the repo root.
// Reads the notes text used in the layout tables (Chords.layouts.ts /
// ScaleChords.layouts.ts), e.g. '1:3@1  2:7  3:5  4:1', back into a layout.
//
// Each token is  string:chordTone[@octave]. The chord tone is named for the
// base 1-3-5-7 chord (1 = first voice, 3 = second, 5 = third, 7 = fourth), so
// it maps to a slot by its position in [1, 3, 5, 7].
import type { LayoutNote, VoicingLayout } from './layouts';

export const BASE_CHORD_TONES = [1, 3, 5, 7];

export function parseLayoutNotes(text: string, chordTones: number[] = BASE_CHORD_TONES): LayoutNote[] {
    return text
        .trim()
        .split(/\s+/)
        .map(token => {
            const [string, rest] = token.split(':');
            const [tone, octave] = rest.split('@');
            return {
                string: Number(string),
                slot: chordTones.indexOf(Number(tone)),
                octave: octave ? Number(octave) : 0,
            };
        });
}

/** A table row, [rootString, notesText, cells], as a layout. */
export function layoutFromRow(
    row: readonly [number, string, ...unknown[]],
    chordTones: number[] = BASE_CHORD_TONES,
): VoicingLayout {
    return { rootString: row[0], notes: parseLayoutNotes(row[1], chordTones) };
}
