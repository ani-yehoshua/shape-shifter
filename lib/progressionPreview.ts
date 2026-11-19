// What a chord saved in a progression looks like: a mini fretboard with the
// note names on it, plus the notes written out low to high. Progression chords
// only store their dots, tuning and capo, so the names come from the tuning's
// own fretboard (the same map the main fretboard uses). Shared by the website's
// and the mobile app's progression sheets.
import { generateFretboardMap } from '@/lib/fretboardMap';
import type { NotePosition } from '@/lib/fretboardMap';
import { STANDARD_TUNING, TUNINGS } from '@/lib/tunings';
import { shapeDiagram } from '@/lib/theory/voicingFigures';
import type { DiagramSpec } from '@/lib/theory/voicingFigures';

export type ChordPreview = {
    diagram: DiagramSpec;
    /** note names, lowest string first, e.g. "C  E  G  B" */
    noteNames: string;
};

export function previewChord(chord: { notes: NotePosition[]; tuningName: string }): ChordPreview {
    const tuning = TUNINGS.find(t => t.name === chord.tuningName) ?? STANDARD_TUNING;
    const map = generateFretboardMap(tuning.notes, 24);
    const dots = chord.notes
        .filter(n => n.fret != null && n.fret >= 0)
        .map(n => ({
            string: n.string,
            fret: n.fret,
            label: (map[n.string]?.[n.fret] ?? '').split('/')[0],
        }));
    // higher string index = lower string
    const lowToHigh = [...dots].sort((a, b) => b.string - a.string);
    return {
        diagram: shapeDiagram(dots, tuning.notes.length),
        noteNames: lowToHigh.map(d => d.label).join('  '),
    };
}
