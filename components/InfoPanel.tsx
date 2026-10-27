"use client";

// The "Info" panel: explains what's on the fretboard right now. The text comes
// from lib/theory (explainChord / explainScale), which works it out from the
// selection and the dots on screen; this component only lays it out. Same
// behavior as the other panels: slides up on phones, in from the right on
// desktop. (The mobile app has the same thing: mobile/components/InfoSheet.tsx.)
import * as React from "react";
import type { InfoContent } from "@/lib/theory";
import DiagramView from "./DiagramView";

type Props = {
    open: boolean;
    onClose: () => void;
    /** called while the panel is open, so the text reflects the current selection */
    getContent: () => InfoContent | null;
};

export default function InfoPanel({ open, onClose, getContent }: Props) {
    // Keep the last content so the text doesn't vanish while the panel slides away.
    const [content, setContent] = React.useState<InfoContent | null>(null);
    React.useEffect(() => {
        if (open) setContent(getContent());
    }, [open, getContent]);

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
                role='dialog'
                aria-label='Info'
                aria-hidden={!open}
                className={`fixed z-50 bg-sand-1 shadow-xl transition-transform duration-300 flex flex-col
                    /* mobile: bottom sheet */
                    bottom-0 left-0 right-0 rounded-t-2xl max-h-[85dvh]
                    /* desktop: right drawer */
                    sm:bottom-0 sm:top-0 sm:left-auto sm:right-0 sm:w-96 sm:rounded-none sm:max-h-full
                    ${open ? "translate-y-0 sm:translate-x-0" : "translate-y-full sm:translate-y-0 sm:translate-x-full"}`}>
                {/* Header */}
                <div className='flex items-start justify-between gap-4 px-5 pt-5 pb-3 border-b border-ink/10 shrink-0'>
                    <div className='min-w-0'>
                        <h2 className='text-lg font-bold text-ink leading-tight'>
                            {content?.title ?? "Info"}
                        </h2>
                        {content?.subtitle && (
                            <p className='text-xs text-ink/60 mt-0.5'>
                                {content.subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        aria-label='Close'
                        className='text-ink/40 hover:text-ink transition-colors text-xl leading-none'>
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className='flex-1 overflow-y-auto px-5 py-4 pb-8 flex flex-col gap-6'>
                    {content ? (
                        content.sections.map(section => (
                            <section
                                key={section.title}
                                className='flex flex-col gap-2'>
                                <h3 className='text-[11px] font-bold uppercase tracking-wider text-ink/60'>
                                    {section.title}
                                </h3>
                                {section.kind === "text" ? (
                                    <>
                                        {section.paragraphs.map((p, i) => (
                                            <p
                                                key={i}
                                                className='text-sm leading-relaxed text-ink'>
                                                {p}
                                            </p>
                                        ))}
                                        {section.figures?.map((fig, i) => (
                                            <figure
                                                key={`fig${i}`}
                                                className='flex flex-col gap-2 rounded-xl bg-ink/5 p-3'>
                                                <figcaption className='text-[13px] leading-snug text-ink/80'>
                                                    {i + 1}. {fig.caption}
                                                </figcaption>
                                                <DiagramView spec={fig.diagram} />
                                            </figure>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        {section.intro && (
                                            <p className='text-sm leading-relaxed text-ink'>
                                                {section.intro}
                                            </p>
                                        )}
                                        {/* one grid per list so every value starts in the same column */}
                                        <ul className='grid grid-cols-[auto_1fr] gap-x-4 text-sm'>
                                            {section.items.map((item, i) => (
                                                <li
                                                    key={i}
                                                    className='col-span-2 grid grid-cols-subgrid py-1.5 border-b border-ink/10 last:border-b-0'>
                                                    <span className='min-w-16 font-semibold text-ink'>
                                                        {item.label}
                                                    </span>
                                                    <span className='whitespace-pre-line text-ink/80'>
                                                        {item.value}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </section>
                        ))
                    ) : (
                        <p className='text-sm text-ink/60'>
                            Pick a chord or scale to see what it is.
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}
