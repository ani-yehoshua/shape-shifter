// Port of ../../lib/guitarAudio.ts. The website synthesizes plucked strings
// (Karplus-Strong) in real time against the Web Audio API, which React
// Native doesn't have. Same algorithm here, but rendered offline in JS into
// a 16-bit PCM WAV, written to the cache directory, and played with
// expo-audio (the only way to play a generated buffer without
// AudioContext). The website's two post-effects are approximated in the
// same pass: a -6dB high-shelf at 4kHz and a 60ms echo at 0.18 gain.
//
// Rendering costs a few tens of ms, so every distinct note/chord is cached
// as a file + a ready player; repeat plays just seek to 0 and play. The
// cache is capped (LRU) so it can't grow without bound.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';

const SAMPLE_RATE = 44100;
const DURATION_S = 3;
const DECAY = 0.4985;
const MAX_CACHED = 40;

const OPEN_STRING_FREQS = [329.63, 246.94, 196.0, 146.83, 110.0, 82.41];

export function noteFrequency(
    stringIndex: number,
    fret: number,
    tuning = OPEN_STRING_FREQS,
): number {
    const open = tuning[stringIndex] ?? 329.63;
    return open * Math.pow(2, fret / 12);
}

// Karplus-Strong: a noise-seeded delay line fed back through a low-pass
// average, summed into `out` at `gain`.
function renderPluck(out: Float32Array, frequency: number, gain: number) {
    const N = Math.max(2, Math.round(SAMPLE_RATE / frequency));
    const delayLine = new Float32Array(N);
    for (let i = 0; i < N; i++) delayLine[i] = Math.random() * 2 - 1;
    let prev = delayLine[N - 1];
    for (let i = 0; i < out.length; i++) {
        const idx = i % N;
        const current = delayLine[idx];
        out[i] += current * gain;
        delayLine[idx] = DECAY * (current + prev);
        prev = current;
    }
}

// Approximates the website's effect chain on the summed signal: high-shelf
// cut (-6dB above ~4kHz) then dry + 60ms echo at 0.18.
function applyEffects(samples: Float32Array): Float32Array {
    const shelfed = new Float32Array(samples.length);
    const a = 1 - Math.exp((-2 * Math.PI * 4000) / SAMPLE_RATE);
    let lp = 0;
    for (let i = 0; i < samples.length; i++) {
        lp += a * (samples[i] - lp);
        shelfed[i] = lp + 0.5 * (samples[i] - lp);
    }
    const echoSamples = Math.round(0.06 * SAMPLE_RATE);
    const result = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
        result[i] = shelfed[i] + (i >= echoSamples ? 0.18 * shelfed[i - echoSamples] : 0);
    }
    return result;
}

function toWav(samples: Float32Array): Uint8Array {
    let peak = 1;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const dataBytes = samples.length * 2;
    const bytes = new Uint8Array(44 + dataBytes);
    const view = new DataView(bytes.buffer);
    const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, dataBytes, true);
    for (let i = 0; i < samples.length; i++) {
        // Scale down only if the sum would clip, instead of hard clipping.
        view.setInt16(44 + i * 2, Math.round((samples[i] / peak) * 32767), true);
    }
    return bytes;
}

type CacheEntry = { file: File; player: AudioPlayer };
const cache = new Map<string, CacheEntry>();
let audioModeSet = false;

function evictOldest() {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) return;
    const entry = cache.get(oldest)!;
    cache.delete(oldest);
    try {
        entry.player.remove();
    } catch {}
    try {
        entry.file.delete();
    } catch {}
}

function playFrequencies(freqs: number[], gain: number) {
    if (!freqs.length) return;
    try {
        if (!audioModeSet) {
            audioModeSet = true;
            setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
        }
        const key = freqs
            .map((f) => f.toFixed(2))
            .sort()
            .join('|');
        let entry = cache.get(key);
        if (entry) {
            // refresh LRU position
            cache.delete(key);
            cache.set(key, entry);
            entry.player.seekTo(0);
            entry.player.play();
            return;
        }
        const samples = new Float32Array(SAMPLE_RATE * DURATION_S);
        for (const f of freqs) renderPluck(samples, f, gain);
        const file = new File(Paths.cache, `ss-${cache.size}-${Date.now()}.wav`);
        file.create({ overwrite: true });
        file.write(toWav(applyEffects(samples)));
        const player = createAudioPlayer(file.uri);
        entry = { file, player };
        cache.set(key, entry);
        if (cache.size > MAX_CACHED) evictOldest();
        player.play();
    } catch (e) {
        console.warn('guitarAudio: playback failed', e);
    }
}

export function playNote(
    stringIndex: number,
    fret: number,
    tuningFreqs?: number[],
): void {
    playFrequencies([noteFrequency(stringIndex, fret, tuningFreqs)], 0.6);
}

export function playChord(
    notes: { string: number; fret: number }[],
    tuningFreqs?: number[],
): void {
    playFrequencies(
        notes.map((n) => noteFrequency(n.string, n.fret, tuningFreqs)),
        0.55,
    );
}
