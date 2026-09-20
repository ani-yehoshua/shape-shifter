export type NotePosition = {
    string: number;
    fret: number;
    semitones: number | null;
    degree: number | null;
    isTonic?: boolean;
};

export type ShapeFormula = {
    name?: string;
    rootString: number;
    pattern: Array<{
        string: number;
        fretOffset: number;
        semitones: number;
        degree: number;
    }>;
    altShapes?: ShapeFormula[];
};

export const NOTES: string[][] = [
    ['A'],
    ['A#', 'Bb'],
    ['B'],
    ['C'],
    ['C#', 'Db'],
    ['D'],
    ['D#', 'Eb'],
    ['E'],
    ['F'],
    ['F#', 'Gb'],
    ['G'],
    ['G#', 'Ab'],
];

export function shiftTuning(tuning: string[], capo: number): string[] {
    if (!capo) return tuning;
    return tuning.map(note => {
        const idx = NOTES.findIndex(pair => pair.includes(note));
        return NOTES[(idx + capo) % NOTES.length][0];
    });
}

export function generateFretboardMap(
    tuning: string[],
    numFrets: number,
): string[][] {
    return tuning.map(openStringNote => {
        const startNoteIndex = NOTES.findIndex(pair =>
            pair.includes(openStringNote),
        );
        return Array.from({ length: numFrets + 1 }, (_, fret) => {
            const noteIndex = (startNoteIndex + fret) % NOTES.length;
            return NOTES[noteIndex].join('/');
        });
    });
}

// Standard EADGBE MIDI numbers, index 0 = high e
export const STANDARD_MIDI = [64, 59, 55, 50, 45, 40];

export function generateAllVoicingsForShape(
    rootNote: string,
    shapeFormula: ShapeFormula,
    fretboardMap: string[][],
    tuningMidi?: number[],
): NotePosition[][] {
    if (!shapeFormula || !fretboardMap) return [];

    const { rootString, pattern } = shapeFormula;
    const stringsCount = fretboardMap.length;
    const maxFret = fretboardMap[0]?.length ?? 0;

    if (
        typeof rootString !== 'number' ||
        rootString < 0 ||
        rootString >= stringsCount ||
        !Array.isArray(pattern) ||
        !Array.isArray(fretboardMap[rootString])
    ) {
        return [];
    }

    // delta[s] = how many semitones string s is tuned away from standard
    const delta = STANDARD_MIDI.map((std, s) =>
        tuningMidi ? (tuningMidi[s] ?? std) - std : 0,
    );

    const stringNotes = fretboardMap[rootString];
    const allVoicings: NotePosition[][] = [];

    for (let rootFret = 0; rootFret < stringNotes.length; rootFret++) {
        const cell = stringNotes[rootFret];
        if (!String(cell).split('/').includes(rootNote)) continue;

        let valid = true;
        const newShape: NotePosition[] = pattern
            .map(note => {
                if (!note || note.fretOffset == null) {
                    return {
                        string: note?.string,
                        fret: null,
                        semitones: null,
                        degree: null,
                    } as unknown as NotePosition;
                }
                // Compensate for per-string tuning differences so the same
                // musical interval lands on the correct fret regardless of tuning
                const adjustedOffset =
                    note.fretOffset +
                    (delta[rootString] ?? 0) -
                    (delta[note.string] ?? 0);
                const finalFret = rootFret + adjustedOffset;
                if (finalFret < 0 || finalFret >= maxFret) {
                    valid = false;
                    return null;
                }
                return {
                    string: note.string,
                    fret: finalFret,
                    semitones: note.semitones,
                    degree: note.degree,
                };
            })
            .filter(Boolean) as NotePosition[];

        if (valid && newShape.some(n => n.fret != null)) {
            allVoicings.push(newShape);
        }
    }

    return allVoicings;
}

export function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    let currentIndex = arr.length;
    while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [arr[currentIndex], arr[randomIndex]] = [
            arr[randomIndex],
            arr[currentIndex],
        ];
    }
    return arr;
}
