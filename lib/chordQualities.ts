export type ChordQuality = {
    intervals: number[]; // semitones from root for each chord tone
    degrees: number[];   // scale degree labels (1, 3, 5, 7, etc.)
};

// ── Chord quality registry ────────────────────────────────────────────────────

export const CHORD_QUALITIES: Record<string, ChordQuality> = {
    // Triads
    Maj:  { intervals: [0, 4, 7],  degrees: [1, 3, 5] },
    Min:  { intervals: [0, 3, 7],  degrees: [1, 3, 5] },
    Aug:  { intervals: [0, 4, 8],  degrees: [1, 3, 5] },
    Dim:  { intervals: [0, 3, 6],  degrees: [1, 3, 5] },

    // Seventh chords
    Maj7:    { intervals: [0, 4, 7, 11], degrees: [1, 3, 5, 7] },
    Min7:    { intervals: [0, 3, 7, 10], degrees: [1, 3, 5, 7] },
    Dom7:    { intervals: [0, 4, 7, 10], degrees: [1, 3, 5, 7] },
    Min7b5:  { intervals: [0, 3, 6, 10], degrees: [1, 3, 5, 7] },
    mMaj7:   { intervals: [0, 3, 7, 11], degrees: [1, 3, 5, 7] },
    'Maj7#5': { intervals: [0, 4, 8, 11], degrees: [1, 3, 5, 7] },
    Dim7:    { intervals: [0, 3, 6, 9],  degrees: [1, 3, 5, 7] },
    Dom7b5:  { intervals: [0, 4, 6, 10], degrees: [1, 3, 5, 7] },
    Dom7s5:  { intervals: [0, 4, 8, 10], degrees: [1, 3, 5, 7] }, // Dom7#5 / Aug7
    Maj6:    { intervals: [0, 4, 7, 9],  degrees: [1, 3, 5, 6] },
    Min6:    { intervals: [0, 3, 7, 9],  degrees: [1, 3, 5, 6] },

    // Extended / altered dominants (Advanced territory)
    Dom9:     { intervals: [0, 4, 7, 10, 14], degrees: [1, 3, 5, 7, 9] },
    Dom7b9:   { intervals: [0, 4, 7, 10, 13], degrees: [1, 3, 5, 7, 9] },
    Dom7s9:   { intervals: [0, 4, 7, 10, 15], degrees: [1, 3, 5, 7, 9] },
    Dom7s11:  { intervals: [0, 4, 6, 7, 10],  degrees: [1, 3, 5, 7, 11] }, // Lydian dominant (tritone sub)
    Dom7alt:  { intervals: [0, 4, 8, 10, 13], degrees: [1, 3, 5, 7, 9] }, // b9#5 core
    Maj7s11:  { intervals: [0, 4, 6, 7, 11],  degrees: [1, 3, 5, 7, 11] }, // Lydian Maj7

    // Sus / quartal-adjacent
    Dom7sus4: { intervals: [0, 5, 7, 10], degrees: [1, 4, 5, 7] },
    Sus2:     { intervals: [0, 2, 7],     degrees: [1, 2, 5] },
    Sus4:     { intervals: [0, 5, 7],     degrees: [1, 4, 5] },

    // Quartal (4th-based)
    Quartal3: { intervals: [0, 5, 10], degrees: [1, 4, 7] }, // 3 stacked 4ths
    Quartal4: { intervals: [0, 5, 10, 15], degrees: [1, 4, 7, 11] }, // 4 stacked 4ths (mod 12: [0,5,10,3])
};

// ── Shell quality helper ───────────────────────────────────────────────────────
// Extracts the root, 3rd, and 7th from a 4-note chord (drops the 5th).
// Assumes standard interval ordering: [root, 3rd, 5th, 7th].
export function toShellQuality(quality: ChordQuality): ChordQuality {
    if (quality.intervals.length < 4) return quality;
    return {
        intervals: [quality.intervals[0], quality.intervals[1], quality.intervals[3]],
        degrees:   [quality.degrees[0],   quality.degrees[1],   quality.degrees[3]],
    };
}

// ── Tuning ────────────────────────────────────────────────────────────────────
// Standard EADGBE, string 0 = high E (MIDI 64), string 5 = low E (MIDI 40).
export const STANDARD_TUNING_SEMITONES = [64, 59, 55, 50, 45, 40];

// ── String set definitions ────────────────────────────────────────────────────

export const TRIAD_STRING_SETS: Record<string, number[]> = {
    '1st String Set': [0, 1, 2],
    '2nd String Set': [1, 2, 3],
    '3rd String Set': [2, 3, 4],
    '4th String Set': [3, 4, 5],
};

export const SEVENTH_STRING_SETS: Record<string, number[]> = {
    'High String Set':   [0, 1, 2, 3],
    'Middle String Set': [1, 2, 3, 4],
    'Low String Set':    [2, 3, 4, 5],
};

// All 3-string sets across the neck (for shells)
export const SHELL_STRING_SETS: Record<string, number[]> = {
    ...TRIAD_STRING_SETS,
};
