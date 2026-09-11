"use client";

import * as React from "react";
import { createPortal } from "react-dom";

export default function CapoButton({
    capo,
    setCapo,
    size = "sm",
}: {
    capo: number;
    setCapo: (v: number | ((prev: number) => number)) => void;
    size?: "sm" | "md";
}) {
    const [open, setOpen] = React.useState(false);
    const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const btnRef = React.useRef<HTMLButtonElement>(null);
    const popupRef = React.useRef<HTMLDivElement>(null);
    const isActive = capo > 0;

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as Node;
            if (
                !wrapperRef.current?.contains(t) &&
                !popupRef.current?.contains(t)
            )
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

    const fretGrid = (
        <>
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 2rem)",
                    gap: "0.25rem",
                }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(f => (
                    <button
                        key={f}
                        onClick={() => {
                            setCapo(f);
                            setOpen(false);
                        }}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                            capo === f
                                ? "bg-ink text-sand-1"
                                : "text-ink hover:bg-ink/10"
                        }`}>
                        {f}
                    </button>
                ))}
            </div>
            {isActive && (
                <button
                    onClick={() => {
                        setCapo(0);
                        setOpen(false);
                    }}
                    className='mt-1 w-full text-[11px] font-semibold text-ink/50 hover:text-ink py-1 transition-colors'>
                    Remove Capo
                </button>
            )}
        </>
    );

    const mobilePopup =
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
                                  window.innerWidth - 160 - 8,
                                  anchorRect.left + anchorRect.width / 2 - 80,
                              ),
                          ),
                          width: 160,
                          zIndex: 9999,
                      }}>
                      {fretGrid}
                  </div>,
                  document.body,
              )
            : null;

    return (
        <div
            className='relative'
            ref={wrapperRef}>
            {size === "md" ? (
                <>
                    <button
                        ref={btnRef}
                        onClick={handleToggle}
                        title={isActive ? `Capo ${capo}` : "Capo"}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${
                            isActive
                                ? "bg-ink text-sand-1 border-ink"
                                : "bg-sand-2 text-ink border-ink hover:bg-sand-3"
                        }`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src='/capo.png'
                            className={`w-5 h-5 ${isActive ? "brightness-0 invert dark:invert-0" : "dark:brightness-0 dark:invert"}`}
                            alt='Capo'
                        />
                        {isActive ? `Capo ${capo}` : "Capo"}
                    </button>
                    {open && (
                        <div className='absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 z-50 bg-sand-1 border border-ink/20 rounded-xl shadow-lg p-2 w-max'>
                            {fretGrid}
                        </div>
                    )}
                </>
            ) : (
                <div className='relative'>
                    <button
                        ref={btnRef}
                        onClick={handleToggle}
                        title={isActive ? `Capo ${capo}` : "Capo"}
                        className={`w-9 h-9 flex items-center justify-center rounded-full border transition-colors ${
                            isActive
                                ? "bg-ink border-ink"
                                : "border-ink/40 text-ink hover:border-ink"
                        }`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src='/capo.png'
                            className={`w-5 h-5 ${isActive ? "brightness-0 invert dark:invert-0" : "dark:brightness-0 dark:invert"}`}
                            alt='Capo'
                        />
                    </button>
                    {isActive && (
                        <span className='absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-ink border border-sand-1 flex items-center justify-center text-[8px] font-bold text-sand-1 leading-none pointer-events-none'>
                            {capo}
                        </span>
                    )}
                    {mobilePopup}
                </div>
            )}
        </div>
    );
}
