"use client";

type Props = {
    showIntervals: boolean;
    onToggle: (val: boolean) => void;
};

function NoteIcon() {
    return (
        <svg
            aria-hidden='true'
            className='w-4 h-4'
            fill='currentColor'
            focusable='false'
            viewBox='0 0 512 512'>
            <path d='M499.1 6.3c8.1 6 12.9 15.6 12.9 25.7l0 72 0 264c0 44.2-43 80-96 80s-96-35.8-96-80s43-80 96-80c11.2 0 22 1.6 32 4.6L448 147 192 223.8l0 192.7c0 44.2-43 80-96 80s-96-35.8-96-80s43-80 96-80c11.2 0 22 1.6 32 4.6L128 200l0-72c0-14.1 9.3-26.6 22.8-30.7l320-96c9.7-2.9 20.2-1.1 28.3 5z' />
        </svg>
    );
}

function IntervalsIcon() {
    return (
        <svg
            aria-hidden='true'
            className='w-4 h-4'
            fill='none'
            focusable='false'
            stroke='currentColor'
            strokeWidth={2.5}
            viewBox='0 0 24 24'>
            <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M3 7h18M3 12h12M3 17h6'
            />
        </svg>
    );
}

export default function NotesIntervalsToggle({
    showIntervals,
    onToggle,
}: Props) {
    return (
        <div className='flex items-center gap-1.5'>
            {/* Mobile: single square toggle button */}
            <button
                onClick={() => onToggle(!showIntervals)}
                className='sm:hidden w-9 h-9 flex items-center justify-center rounded-full border border-ink/40 text-ink hover:border-ink transition-colors active:opacity-80'
                title={showIntervals ? "Show note names" : "Show intervals"}>
                {showIntervals ? <IntervalsIcon /> : <NoteIcon />}
            </button>

            {/* Tablet/desktop: pill button matching Shuffle / Right hand */}
            <button
                onClick={() => onToggle(!showIntervals)}
                className='hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-ink bg-sand-2 text-ink text-sm font-semibold hover:bg-sand-3 transition-colors'>
                {showIntervals ? <IntervalsIcon /> : <NoteIcon />}
                {showIntervals ? "Intervals" : "Notes"}
            </button>
        </div>
    );
}
