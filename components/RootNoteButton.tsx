"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { NOTES } from "@/lib/fretboardMap";

// C → B chromatic order (indices into NOTES, which starts at A=0)
const C_TO_B: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

interface Props {
    root: string;
    onSelect: (note: string) => void;
    onRandom: () => void;
    className?: string;
}

export default function RootNoteButton({
    root,
    onSelect,
    onRandom,
    className,
}: Props) {
    const [open, setOpen] = React.useState(false);
    const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
    const [useFlats, setUseFlats] = React.useState(() => root.includes("b"));
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const popupRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!btnRef.current?.contains(t) && !popupRef.current?.contains(t))
                setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const handleToggle = () => {
        if (!open && btnRef.current)
            setAnchorRect(btnRef.current.getBoundingClientRect());
        setOpen(o => !o);
    };

    // popup width: 4 cols × 40px + 3 gaps × 4px + 2 × 12px padding = 208px
    const POPUP_W = 208;

    const popup =
        open && anchorRect
            ? createPortal(
                  <div
                      ref={popupRef}
                      className='bg-sand-1 border border-ink/20 rounded-xl shadow-lg p-2'
                      style={{
                          position: "fixed",
                          bottom: window.innerHeight - anchorRect.top + 8,
                          left: Math.max(
                              8,
                              Math.min(
                                  window.innerWidth - POPUP_W - 8,
                                  anchorRect.left +
                                      anchorRect.width / 2 -
                                      POPUP_W / 2,
                              ),
                          ),
                          width: POPUP_W,
                          zIndex: 9999,
                      }}>
                      {/* Sharp / flat toggle */}
                      <div className='flex items-center justify-between mb-2'>
                          <span className='text-[10px] font-bold uppercase tracking-widest text-ink/30'>
                              Root
                          </span>
                          <button
                              onClick={() => setUseFlats(f => !f)}
                              className='text-[11px] font-semibold text-ink/50 hover:text-ink transition-colors px-1 py-0.5 rounded'>
                              {useFlats ? "♯ Sharps" :"♭ Flats"}
                          </button>
                      </div>
                      <div
                          style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(4, 2.75rem)",
                              gap: "0.25rem",
                          }}>
                          {C_TO_B.map(idx => {
                              const pair = NOTES[idx];
                              const label =
                                  pair.length > 1 && useFlats
                                      ? pair[1]
                                      : pair[0];
                              const isActive = pair.includes(root);
                              return (
                                  <button
                                      key={idx}
                                      onClick={() => {
                                          onSelect(label);
                                          setOpen(false);
                                      }}
                                      className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                                          isActive
                                              ? "bg-ink text-sand-1"
                                              : "text-ink hover:bg-ink/10"
                                      }`}>
                                      {label}
                                  </button>
                              );
                          })}
                      </div>
                      <button
                          onClick={() => {
                              onRandom();
                              setOpen(false);
                          }}
                          className='mt-2 w-full text-[11px] font-semibold text-ink/50 hover:text-ink py-1 transition-colors'>
                          Random
                      </button>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <>
            <button
                ref={btnRef}
                onClick={handleToggle}
                className={className}>
                {root}
            </button>
            {popup}
        </>
    );
}
