"use client";

import * as React from "react";
import type { SavedChord } from "@/lib/savedChords";
import { fetchSavedChords, deleteChord, renameChord } from "@/lib/savedChords";

type Props = {
    open: boolean;
    onClose: () => void;
    onLoad: (chord: SavedChord) => void;
    /** incremented by parent to trigger a refresh after a save */
    refreshKey?: number;
    /** called after a chord is deleted, so the parent can re-sync its own
     *  "is this chord saved?" state (e.g. a bookmark icon's filled state) */
    onChange?: () => void;
};

export default function SavedChordsPanel({
    open,
    onClose,
    onLoad,
    refreshKey = 0,
    onChange,
}: Props) {
    const [chords, setChords] = React.useState<SavedChord[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editLabel, setEditLabel] = React.useState("");

    React.useEffect(() => {
        if (!open) return;
        setLoading(true);
        fetchSavedChords()
            .then(setChords)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [open, refreshKey]);

    async function handleDelete(id: string) {
        await deleteChord(id).catch(console.error);
        setChords(prev => prev.filter(c => c.id !== id));
        onChange?.();
    }

    async function handleRename(id: string) {
        const label = editLabel.trim();
        if (!label) return;
        await renameChord(id, label).catch(console.error);
        setChords(prev => prev.map(c => (c.id === id ? { ...c, label } : c)));
        setEditingId(null);
    }

    const sourceLabel = (chord: SavedChord) => {
        const ctx = chord.context;
        if (ctx.source === "draw") return "Draw Mode";
        if (ctx.mode === "scales") return "Scale";
        return "Library";
    };

    // Panel slides up on mobile, in from right on desktop
    return (
        <>
            {/* Backdrop */}
            {open && (
                <div
                    className='fixed inset-0 z-40 bg-ink/30'
                    onClick={onClose}
                />
            )}

            {/* Panel */}
            <div
                className={`fixed z-50 bg-sand-1 shadow-xl transition-transform duration-300 flex flex-col
                    /* mobile: bottom sheet */
                    bottom-0 left-0 right-0 rounded-t-2xl max-h-[80dvh]
                    /* desktop: right drawer */
                    sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:w-80 sm:rounded-none sm:max-h-full
                    ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}>
                {/* Header */}
                <div className='flex items-center justify-between px-5 pt-5 pb-3 border-b border-ink/10 shrink-0'>
                    <h2 className='text-base font-bold text-ink'>
                        Saved Chords
                    </h2>
                    <button
                        onClick={onClose}
                        className='text-ink/40 hover:text-ink transition-colors text-xl leading-none'>
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='flex-1 overflow-y-auto pb-6'>
                    {loading ? (
                        <p className='text-center text-ink/40 text-sm py-10'>
                            Loading…
                        </p>
                    ) : chords.length === 0 ? (
                        <p className='text-center text-ink/40 text-sm py-10 px-6'>
                            No saved chords yet. Hit the bookmark icon to save
                            one.
                        </p>
                    ) : (
                        <ul className='divide-y divide-ink/10'>
                            {chords.map(chord => (
                                <li
                                    key={chord.id}
                                    className='px-5 py-3 flex flex-col gap-1'>
                                    {/* Label row */}
                                    <div className='flex items-center gap-2 min-w-0'>
                                        {editingId === chord.id ? (
                                            <input
                                                autoFocus
                                                className='flex-1 text-sm font-semibold text-ink bg-sand-2 rounded px-2 py-0.5 border border-ink/20 outline-none min-w-0'
                                                value={editLabel}
                                                onChange={e =>
                                                    setEditLabel(e.target.value)
                                                }
                                                onKeyDown={e => {
                                                    if (e.key === "Enter")
                                                        handleRename(chord.id);
                                                    if (e.key === "Escape")
                                                        setEditingId(null);
                                                }}
                                            />
                                        ) : (
                                            <span className='flex-1 text-sm font-semibold text-ink truncate'>
                                                {chord.label}
                                            </span>
                                        )}

                                        {/* Edit / confirm */}
                                        {editingId === chord.id ? (
                                            <button
                                                onClick={() =>
                                                    handleRename(chord.id)
                                                }
                                                className='text-xs text-olive font-semibold shrink-0'>
                                                Save
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setEditingId(chord.id);
                                                    setEditLabel(chord.label);
                                                }}
                                                title='Rename'
                                                className='text-ink/30 hover:text-ink/60 transition-colors shrink-0'>
                                                <svg
                                                    className='w-5 h-5'
                                                    viewBox='0 0 24 24'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    strokeWidth={2}>
                                                    <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                                                    <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
                                                </svg>
                                            </button>
                                        )}
                                    </div>

                                    {/* Source tag + actions */}
                                    <div className='flex items-center gap-2'>
                                        <span className='text-[10px] font-bold uppercase tracking-widest text-ink/40'>
                                            {sourceLabel(chord)}
                                        </span>
                                        <span className='text-[10px] text-ink/25'>
                                            {new Date(
                                                chord.created_at,
                                            ).toLocaleDateString()}
                                        </span>

                                        <div className='flex-1' />

                                        <button
                                            onClick={() =>
                                                handleDelete(chord.id)
                                            }
                                            title='Delete'
                                            className='text-ink/25 hover:text-red-500 transition-colors'>
                                            <svg
                                                className='w-5 h-5'
                                                viewBox='0 0 24 24'
                                                fill='none'
                                                stroke='currentColor'
                                                strokeWidth={2}
                                                strokeLinecap='round'
                                                strokeLinejoin='round'>
                                                <polyline points='3 6 5 6 21 6' />
                                                <path d='M19 6l-1 14H6L5 6' />
                                                <path d='M10 11v6M14 11v6' />
                                                <path d='M9 6V4h6v2' />
                                            </svg>
                                        </button>

                                        <button
                                            onClick={() => {
                                                onLoad(chord);
                                                onClose();
                                            }}
                                            className='text-sm font-semibold text-sand-1 bg-ink px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity'>
                                            Load
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </>
    );
}
