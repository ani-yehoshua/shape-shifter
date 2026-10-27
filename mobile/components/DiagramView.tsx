// Draws a DiagramSpec from lib/theory (the piano strips and mini fretboard in
// the info sheet). The spec is plain shapes in a fixed coordinate space; this
// only maps its colour roles to the theme and draws them with react-native-svg.
// (Website twin: components/DiagramView.tsx.)
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { DiagramSpec, Paint } from '../lib/theory';
import { useTheme } from '../lib/theme-context';

const SCALE = 1.2;

/** Measures the space it's given and sizes the SVG in whole pixels: a percentage
 *  size inside an auto-height parent resolves to nothing and leaves a blank gap. */
export default function DiagramView({ spec }: { spec: DiagramSpec }) {
    const [available, setAvailable] = useState(0);
    const scale = available > 0 ? Math.min(SCALE, available / spec.width) : 0;
    return (
        <View style={{ alignSelf: 'stretch' }} onLayout={e => setAvailable(e.nativeEvent.layout.width)}>
            {scale > 0 && <DiagramSvg spec={spec} scale={scale} />}
        </View>
    );
}

function DiagramSvg({ spec, scale }: { spec: DiagramSpec; scale: number }) {
    const { colors } = useTheme();
    const paints: Record<Paint, string> = {
        paper: '#f7f7f5',
        key: '#1f2d3d',
        accent: colors.olive,
        moved: '#2563eb',
        onAccent: '#ffffff',
        text: colors.ink,
        line: `${colors.ink}99`,
        faint: `${colors.ink}59`,
    };
    const c = (p?: Paint) => (p ? paints[p] : 'none');

    return (
        <Svg
            width={spec.width * scale}
            height={spec.height * scale}
            viewBox={`0 0 ${spec.width} ${spec.height}`}>
            {spec.prims.map((p, i) => {
                switch (p.t) {
                    case 'rect':
                        return (
                            <Rect
                                key={i}
                                x={p.x}
                                y={p.y}
                                width={p.w}
                                height={p.h}
                                rx={p.r}
                                fill={c(p.fill)}
                                stroke={c(p.stroke)}
                                strokeWidth={p.stroke ? 1.2 : 0}
                                strokeDasharray={p.dash ? '3 2' : undefined}
                            />
                        );
                    case 'circle':
                        return (
                            <Circle
                                key={i}
                                cx={p.cx}
                                cy={p.cy}
                                r={p.r}
                                fill={c(p.fill)}
                                stroke={c(p.stroke)}
                                strokeWidth={p.stroke ? 1.4 : 0}
                                strokeDasharray={p.dash ? '3 2' : undefined}
                            />
                        );
                    case 'line':
                        return <Line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={c(p.stroke)} strokeWidth={p.w ?? 1} />;
                    case 'path':
                        return <Path key={i} d={p.d} fill={c(p.fill)} stroke={c(p.stroke)} strokeWidth={p.stroke ? p.w ?? 1 : 0} />;
                    case 'text':
                        return (
                            <SvgText
                                key={i}
                                x={p.x}
                                y={p.y}
                                fontSize={p.size}
                                fontWeight={p.bold ? '700' : '400'}
                                fill={c(p.fill)}
                                textAnchor={p.anchor ?? 'start'}>
                                {p.s}
                            </SvgText>
                        );
                }
            })}
        </Svg>
    );
}
