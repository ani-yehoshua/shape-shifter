"use client";

// Draw Mode's "Shapes" panel: change the matched drawing without leaving Draw
// Mode (a chord's inversion and alternate shape, a scale's pattern, variant and
// box). DrawMode builds the groups and applies the choices; this only lays them
// out. It sits at the bottom (phone) or bottom-right (desktop) and leaves the
// fretboard visible, since changes show on it straight away.
// (The mobile app has the same thing: mobile/components/ShapesSheet.tsx.)
import * as React from "react";
import { createPortal } from "react-dom";

export type ShapeGroup = {
    title: string;
    options: { label: string; selected: boolean; onSelect: () => void }[];
};

type Props = {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    groups: ShapeGroup[];
};

export default function ShapesPanel({
    open,
    onClose,
    title,
    subtitle,
    groups,
}: Props) {
    if (!open || typeof document === "undefined") return null;
    return createPortal(
        <div
            className='fixed inset-0 z-[9999]'
            onClick={onClose}>
            <div
                role='dialog'
                aria-label='Shapes'
                className='absolute bottom-0 left-0 right-0 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 max-h-[50dvh] flex flex-col bg-sand-2 rounded-t-2xl sm:rounded-2xl shadow-xl border border-ink/10'
                onClick={e => e.stopPropagation()}>
                <div className='flex items-start justify-between gap-3 px-4 pt-3 pb-2 shrink-0'>
                    <div className='min-w-0'>
                        <p className='text-sm font-bold text-ink leading-tight'>
                            {title}
                        </p>
                        {subtitle && (
                            <p className='text-[11px] text-ink/60 leading-tight mt-0.5'>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label='Close'
                        className='text-ink/40 hover:text-ink transition-colors text-lg leading-none'>
                        ✕
                    </button>
                </div>
                <div className='overflow-y-auto px-4 pb-4 flex flex-col gap-3'>
                    {groups.map(group => (
                        <div
                            key={group.title}
                            className='flex flex-col gap-1.5'>
                            <span className='text-[10px] font-bold uppercase tracking-wider text-ink/50'>
                                {group.title}
                            </span>
                            <div className='flex flex-wrap gap-1.5'>
                                {group.options.map(option => (
                                    <button
                                        key={option.label}
                                        onClick={option.onSelect}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                                            option.selected
                                                ? "bg-ink text-sand-1 border-ink"
                                                : "border-ink/40 text-ink hover:border-ink"
                                        }`}>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>,
        document.body,
    );
}
