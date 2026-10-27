// Draws a DiagramSpec from lib/theory (the piano strips and mini fretboard in
// the info panel). The spec is plain shapes in a fixed coordinate space; this
// only maps its colour roles to the theme and draws them as inline SVG.
// (The mobile app has the same thing: mobile/components/DiagramView.tsx.)
import * as React from "react";
import type { DiagramSpec, Paint } from "@/lib/theory";

const SCALE = 1.2;

const PAINTS: Record<Paint, string> = {
    paper: "#f7f7f5",
    key: "#1f2d3d",
    accent: "var(--color-olive)",
    moved: "#2563eb",
    onAccent: "#ffffff",
    text: "var(--color-ink)",
    line: "color-mix(in srgb, var(--color-ink) 60%, transparent)",
    faint: "color-mix(in srgb, var(--color-ink) 35%, transparent)",
};
const c = (p?: Paint) => (p ? PAINTS[p] : "none");

export default function DiagramView({ spec }: { spec: DiagramSpec }) {
    return (
        <svg
            viewBox={`0 0 ${spec.width} ${spec.height}`}
            width={spec.width * SCALE}
            height={spec.height * SCALE}
            className='max-w-full h-auto'
            role='img'
            aria-hidden='true'>
            {spec.prims.map((p, i) => {
                switch (p.t) {
                    case "rect":
                        return (
                            <rect
                                key={i}
                                x={p.x}
                                y={p.y}
                                width={p.w}
                                height={p.h}
                                rx={p.r}
                                style={{ fill: c(p.fill), stroke: c(p.stroke) }}
                                strokeWidth={p.stroke ? 1.2 : 0}
                                strokeDasharray={p.dash ? "3 2" : undefined}
                            />
                        );
                    case "circle":
                        return (
                            <circle
                                key={i}
                                cx={p.cx}
                                cy={p.cy}
                                r={p.r}
                                style={{ fill: c(p.fill), stroke: c(p.stroke) }}
                                strokeWidth={p.stroke ? 1.4 : 0}
                                strokeDasharray={p.dash ? "3 2" : undefined}
                            />
                        );
                    case "line":
                        return (
                            <line
                                key={i}
                                x1={p.x1}
                                y1={p.y1}
                                x2={p.x2}
                                y2={p.y2}
                                style={{ stroke: c(p.stroke) }}
                                strokeWidth={p.w ?? 1}
                            />
                        );
                    case "path":
                        return (
                            <path
                                key={i}
                                d={p.d}
                                style={{ fill: c(p.fill), stroke: c(p.stroke) }}
                                strokeWidth={p.stroke ? (p.w ?? 1) : 0}
                            />
                        );
                    case "text":
                        return (
                            <text
                                key={i}
                                x={p.x}
                                y={p.y}
                                fontSize={p.size}
                                fontWeight={p.bold ? 700 : 400}
                                textAnchor={p.anchor ?? "start"}
                                style={{ fill: c(p.fill) }}>
                                {p.s}
                            </text>
                        );
                }
            })}
        </svg>
    );
}
