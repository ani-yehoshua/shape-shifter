"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { playChord } from "@/lib/guitarAudio";
import {
    fetchProgressions,
    saveProgression,
    updateProgression,
    deleteProgression,
    type Progression,
    type ProgressionChord,
} from "@/lib/progressions";

type CurrentChord = {
    label: string;
    notes: import("@/lib/fretboardMap").NotePosition[];
    tuningName: string;
    tuningFreqs?: number[];
    capo: number;
};

function randomId() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const DRAFT_KEY = "shapeshifter_draft_progression";

type Props = {
    open: boolean;
    onClose: () => void;
    currentChord: CurrentChord | null;
    userId: string | null;
    onAuthRequired: () => void;
    onRequestOpen?: () => void;
    pendingChord?: CurrentChord | null;
    onPendingConsumed?: () => void;
};

// ── small icons ───────────────────────────────────────────────────────────────

function TrashIcon() {
    return (
        <svg className='w-3.5 h-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
            <polyline points='3 6 5 6 21 6' />
            <path d='M19 6l-1 14H6L5 6' />
            <path d='M10 11v6M14 11v6' />
            <path d='M9 6V4h6v2' />
        </svg>
    );
}

function ChevronUpIcon() {
    return (
        <svg className='w-3.5 h-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round'>
            <path d='M18 15l-6-6-6 6' />
        </svg>
    );
}

function ChevronDownIcon() {
    return (
        <svg className='w-3.5 h-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2} strokeLinecap='round'>
            <path d='M6 9l6 6 6-6' />
        </svg>
    );
}

function PlayIcon() {
    return (
        <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'>
            <polygon points='5 3 19 12 5 21 5 3' />
        </svg>
    );
}

function StopIcon() {
    return (
        <svg className='w-4 h-4' viewBox='0 0 24 24' fill='currentColor'>
            <rect x='5' y='5' width='14' height='14' rx='2' />
        </svg>
    );
}

// ── BPM picker popup ──────────────────────────────────────────────────────────

function BpmButton({ bpm, onChange }: { bpm: number; onChange: (v: number) => void }) {
    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const popupRef = React.useRef<HTMLDivElement>(null);
    const [rect, setRect] = React.useState<DOMRect | null>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!btnRef.current?.contains(e.target as Node) && !popupRef.current?.contains(e.target as Node))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const popup =
        open && rect
            ? createPortal(
                  <div
                      ref={popupRef}
                      className='bg-sand-1 border border-ink/20 rounded-xl shadow-lg px-4 py-3'
                      style={{
                          position: "fixed",
                          bottom: window.innerHeight - rect.top + 8,
                          left: Math.max(8, Math.min(window.innerWidth - 192 - 8, rect.left + rect.width / 2 - 96)),
                          width: 192,
                          zIndex: 9999,
                      }}>
                      <p className='text-[10px] font-bold uppercase tracking-widest text-ink/40 mb-1 text-center'>
                          {bpm} BPM
                      </p>
                      <input
                          type='range'
                          min={40}
                          max={200}
                          step={5}
                          value={bpm}
                          onChange={e => onChange(Number(e.target.value))}
                          className='w-full accent-ink'
                      />
                      <div className='flex justify-between text-[10px] text-ink/40 font-semibold mt-1'>
                          <span>Slow</span>
                          <span>Fast</span>
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={btnRef}
                onClick={() => {
                    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
                    setOpen(o => !o);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${open ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                <svg className='w-3 h-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
                    <circle cx='12' cy='12' r='10' />
                    <polyline points='12 6 12 12 16 14' />
                </svg>
                {bpm} BPM
            </button>
            {popup}
        </>
    );
}

// ── main panel ────────────────────────────────────────────────────────────────

export default function ProgressionPanel({ open, onClose, currentChord, userId, onAuthRequired, onRequestOpen, pendingChord, onPendingConsumed }: Props) {
    const [progressions, setProgressions] = React.useState<Progression[]>([]);
    const [activeId, setActiveId] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // local working copy of the active progression
    const [name, setName] = React.useState("My Progression");
    const [bpm, setBpm] = React.useState(80);
    const [chords, setChords] = React.useState<ProgressionChord[]>([]);
    const [dirty, setDirty] = React.useState(false);

    const hasRestoredDraft = React.useRef(false);

    // inline rename
    const [editingChordId, setEditingChordId] = React.useState<string | null>(null);
    const [editingChordLabel, setEditingChordLabel] = React.useState("");

    // playback
    const playTimers = React.useRef<ReturnType<typeof setTimeout>[]>([]);
    const [playingIndex, setPlayingIndex] = React.useState<number | null>(null);

    const isPlaying = playingIndex !== null;

    // Restore draft persisted before a sign-in redirect
    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw) as { name: string; bpm: number; chords: ProgressionChord[] };
            localStorage.removeItem(DRAFT_KEY);
            setName(draft.name);
            setBpm(draft.bpm);
            setChords(draft.chords);
            setDirty(true);
            hasRestoredDraft.current = true;
            onRequestOpen?.();
        } catch {}
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    React.useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetchProgressions()
            .then(data => {
                setProgressions(data);
                // Don't overwrite a just-restored draft with the first saved progression
                if (!activeId && data.length > 0 && !hasRestoredDraft.current) {
                    loadProgression(data[0]);
                }
                hasRestoredDraft.current = false;
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    function loadProgression(p: Progression) {
        setActiveId(p.id);
        setName(p.name);
        setBpm(p.bpm);
        setChords(p.chords);
        setDirty(false);
    }

    function newProgression() {
        setActiveId(null);
        setName("My Progression");
        setBpm(80);
        setChords([]);
        setDirty(false);
    }

    function addCurrentChord() {
        if (!currentChord) return;
        const slot: ProgressionChord = {
            id: randomId(),
            ...currentChord,
        };
        setChords(prev => [...prev, slot]);
        setDirty(true);
    }

    React.useEffect(() => {
        if (!pendingChord) return;
        const slot: ProgressionChord = {
            id: randomId(),
            ...pendingChord,
        };
        setChords(prev => [...prev, slot]);
        setDirty(true);
        onPendingConsumed?.();
    }, [pendingChord]); // eslint-disable-line react-hooks/exhaustive-deps

    function confirmRename(id: string) {
        const label = editingChordLabel.trim();
        if (!label) { setEditingChordId(null); return; }
        setChords(prev => prev.map(c => c.id === id ? { ...c, label } : c));
        setDirty(true);
        setEditingChordId(null);
    }

    function removeChord(id: string) {
        setChords(prev => prev.filter(c => c.id !== id));
        setDirty(true);
    }

    function moveChord(index: number, dir: -1 | 1) {
        setChords(prev => {
            const next = [...prev];
            const target = index + dir;
            if (target < 0 || target >= next.length) return prev;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
        setDirty(true);
    }

    function persistDraftAndPromptAuth() {
        try {
            localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, bpm, chords }));
        } catch {}
        onAuthRequired();
    }

    async function handleSave() {
        if (!userId) {
            persistDraftAndPromptAuth();
            return;
        }
        setSaving(true);
        try {
            if (activeId) {
                await updateProgression(activeId, { name: name.trim() || "My Progression", bpm, chords });
                setProgressions(prev => prev.map(p => p.id === activeId ? { ...p, name, bpm, chords } : p));
            } else {
                const saved = await saveProgression({ name: name.trim() || "My Progression", bpm, chords });
                setProgressions(prev => [saved, ...prev]);
                setActiveId(saved.id);
            }
            setDirty(false);
        } catch (e: unknown) {
            if (e instanceof Error && e.message === "Not signed in") {
                persistDraftAndPromptAuth();
            } else {
                console.error(e);
            }
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id: string) {
        await deleteProgression(id).catch(console.error);
        const remaining = progressions.filter(p => p.id !== id);
        setProgressions(remaining);
        if (activeId === id) {
            if (remaining.length > 0) loadProgression(remaining[0]);
            else newProgression();
        }
    }

    function stopPlayback() {
        playTimers.current.forEach(clearTimeout);
        playTimers.current = [];
        setPlayingIndex(null);
    }

    function startPlayback() {
        if (chords.length === 0) return;
        stopPlayback();
        const msPerBeat = 60000 / bpm;
        const msPerChord = msPerBeat * 4; // one bar per chord

        chords.forEach((chord, i) => {
            const t = setTimeout(() => {
                setPlayingIndex(i);
                playChord(chord.notes, chord.tuningFreqs);
                if (i === chords.length - 1) {
                    const end = setTimeout(() => setPlayingIndex(null), msPerChord);
                    playTimers.current.push(end);
                }
            }, i * msPerChord);
            playTimers.current.push(t);
        });
    }

    // stop on close/unmount
    React.useEffect(() => { if (!open) stopPlayback(); }, [open]);

    return (
        <>
            {open && <div className='fixed inset-0 z-40 bg-ink/30' onClick={onClose} />}

            <div className={`fixed z-50 bg-sand-1 shadow-xl transition-transform duration-300 flex flex-col
                bottom-0 left-0 right-0 rounded-t-2xl max-h-[85dvh]
                sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:w-96 sm:rounded-none sm:max-h-full
                ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}>

                {/* Header */}
                <div className='flex items-center justify-between px-5 pt-5 pb-3 border-b border-ink/10 shrink-0'>
                    <h2 className='text-base font-bold text-ink'>Progression Builder</h2>
                    <button onClick={onClose} className='text-ink/40 hover:text-ink transition-colors text-xl leading-none'>✕</button>
                </div>

                {/* Saved progressions list */}
                {progressions.length > 0 && (
                    <div className='shrink-0 border-b border-ink/10 px-5 py-2 flex gap-2 overflow-x-auto no-scrollbar'>
                        <button
                            onClick={newProgression}
                            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeId === null && !dirty ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                            + New
                        </button>
                        {progressions.map(p => (
                            <button
                                key={p.id}
                                onClick={() => loadProgression(p)}
                                className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${activeId === p.id ? "bg-ink text-sand-1 border-ink" : "border-ink/40 text-ink hover:border-ink"}`}>
                                {p.name}
                            </button>
                        ))}
                    </div>
                )}

                {/* Name + BPM */}
                <div className='shrink-0 px-5 pt-3 pb-2 flex items-center gap-2'>
                    <input
                        className='flex-1 bg-sand-2 border border-ink/20 rounded-xl px-3 py-1.5 text-sm text-ink outline-none focus:border-ink transition-colors font-semibold'
                        value={name}
                        onChange={e => { setName(e.target.value); setDirty(true); }}
                        placeholder='Progression name…'
                    />
                    <BpmButton bpm={bpm} onChange={v => { setBpm(v); setDirty(true); }} />
                </div>

                {/* Chord list */}
                <div className='flex-1 overflow-y-auto'>
                    {loading ? (
                        <p className='text-center text-ink/40 text-sm py-10'>Loading…</p>
                    ) : chords.length === 0 ? (
                        <p className='text-center text-ink/40 text-sm py-10 px-6'>
                            No chords yet. Hit "Add Chord" to get started.
                        </p>
                    ) : (
                        <ul className='divide-y divide-ink/10'>
                            {chords.map((chord, i) => (
                                <li
                                    key={chord.id}
                                    className={`px-5 py-3 flex items-center gap-3 transition-colors ${playingIndex === i ? "bg-ink/5" : ""}`}>
                                    {/* Position indicator */}
                                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${playingIndex === i ? "bg-ink text-sand-1" : "bg-ink/10 text-ink/50"}`}>
                                        {i + 1}
                                    </span>

                                    {/* Label */}
                                    <div className='flex-1 min-w-0'>
                                        {editingChordId === chord.id ? (
                                            <input
                                                autoFocus
                                                className='w-full text-sm font-semibold text-ink bg-sand-2 rounded px-2 py-0.5 border border-ink/20 outline-none min-w-0'
                                                value={editingChordLabel}
                                                onChange={e => setEditingChordLabel(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === "Enter") confirmRename(chord.id);
                                                    if (e.key === "Escape") setEditingChordId(null);
                                                }}
                                                onBlur={() => confirmRename(chord.id)}
                                            />
                                        ) : (
                                            <p className='text-sm font-semibold text-ink truncate'>{chord.label}</p>
                                        )}
                                        <p className='text-[10px] text-ink/40'>
                                            {chord.tuningName}{chord.capo > 0 ? ` · Capo ${chord.capo}` : ""}
                                        </p>
                                    </div>

                                    {/* Reorder */}
                                    <div className='flex flex-col gap-0.5 shrink-0'>
                                        <button
                                            onClick={() => moveChord(i, -1)}
                                            disabled={i === 0}
                                            className='text-ink/30 hover:text-ink/70 disabled:opacity-20 transition-colors'>
                                            <ChevronUpIcon />
                                        </button>
                                        <button
                                            onClick={() => moveChord(i, 1)}
                                            disabled={i === chords.length - 1}
                                            className='text-ink/30 hover:text-ink/70 disabled:opacity-20 transition-colors'>
                                            <ChevronDownIcon />
                                        </button>
                                    </div>

                                    {/* Rename */}
                                    {editingChordId === chord.id ? (
                                        <button
                                            onClick={() => confirmRename(chord.id)}
                                            className='shrink-0 text-xs text-olive font-semibold'>
                                            Save
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setEditingChordId(chord.id); setEditingChordLabel(chord.label); }}
                                            title='Rename'
                                            className='shrink-0 text-ink/30 hover:text-ink/60 transition-colors'>
                                            <svg className='w-3.5 h-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth={2}>
                                                <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                                                <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
                                            </svg>
                                        </button>
                                    )}

                                    {/* Delete */}
                                    <button
                                        onClick={() => removeChord(chord.id)}
                                        className='shrink-0 text-ink/25 hover:text-red-500 transition-colors'>
                                        <TrashIcon />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Footer actions */}
                <div className='shrink-0 border-t border-ink/10 px-5 pt-3 pb-5 flex flex-col gap-2'>
                    {/* Add + Play row */}
                    <div className='flex gap-2'>
                        <button
                            onClick={addCurrentChord}
                            disabled={!currentChord}
                            className='flex-1 py-2 rounded-full border border-ink/40 text-ink text-sm font-semibold hover:border-ink disabled:opacity-40 transition-colors'>
                            + Add Chord
                        </button>
                        <button
                            onClick={isPlaying ? stopPlayback : startPlayback}
                            disabled={chords.length === 0}
                            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-40 ${isPlaying ? "bg-ink text-sand-1 hover:opacity-80" : "bg-ink text-sand-1 hover:opacity-90"}`}>
                            {isPlaying ? <StopIcon /> : <PlayIcon />}
                            {isPlaying ? "Stop" : "Play"}
                        </button>
                    </div>

                    {/* Save row */}
                    <div className='flex gap-2'>
                        {activeId && (
                            <button
                                onClick={() => handleDelete(activeId)}
                                className='px-4 py-2 rounded-full border border-red-500 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors'>
                                Delete
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving || !dirty}
                            className='flex-1 py-2 bg-ink text-sand-1 rounded-full text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-opacity'>
                            {saving ? "Saving…" : "Save Progression"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
