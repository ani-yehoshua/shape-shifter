// The website's ../../lib/guitarAudio.ts does real-time Karplus-Strong
// plucked-string synthesis directly against the Web Audio API
// (AudioContext, createBufferSource, createBiquadFilter, ...) -- none of
// which exist in React Native. Porting that synthesis (likely via
// expo-audio writing a generated PCM/WAV buffer to a temp file, since RN
// has no raw AudioContext equivalent) is real, separate work, not a
// find-and-replace.
//
// Stubbed as no-ops for now with the same signatures so the fretboard UI
// (tap-to-hear-a-note) compiles and works everywhere else -- sound is a
// follow-up, tracked separately, not silently dropped.
export function noteFrequency(
    stringIndex: number,
    fret: number,
    tuning?: number[],
): number {
    const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];
    const open = (tuning ?? OPEN_STRING_FREQS)[stringIndex] ?? 329.63;
    return open * Math.pow(2, fret / 12);
}

export function playNote(
    _stringIndex: number,
    _fret: number,
    _tuningFreqs?: number[],
): void {
    // TODO: real playback via expo-audio.
}

export function playChord(
    _notes: { string: number; fret: number }[],
    _tuningFreqs?: number[],
): void {
    // TODO: real playback via expo-audio.
}
