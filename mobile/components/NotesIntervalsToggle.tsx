// Port of ../../components/NotesIntervalsToggle.tsx -- the mobile (single
// square button) variant only, since the web version's desktop/tablet pill
// variant doesn't apply here.
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../lib/theme-context';

type Props = {
    showIntervals: boolean;
    onToggle: (val: boolean) => void;
};

function NoteIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} fill={colors.ink} viewBox="0 0 512 512">
            <Path d="M499.1 6.3c8.1 6 12.9 15.6 12.9 25.7l0 72 0 264c0 44.2-43 80-96 80s-96-35.8-96-80s43-80 96-80c11.2 0 22 1.6 32 4.6L448 147 192 223.8l0 192.7c0 44.2-43 80-96 80s-96-35.8-96-80s43-80 96-80c11.2 0 22 1.6 32 4.6L128 200l0-72c0-14.1 9.3-26.6 22.8-30.7l320-96c9.7-2.9 20.2-1.1 28.3 5z" />
        </Svg>
    );
}

function IntervalsIcon() {
    const { colors } = useTheme();
    return (
        <Svg width={16} height={16} fill="none" stroke={colors.ink} strokeWidth={2.5} viewBox="0 0 24 24">
            <Path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h12M3 17h6" />
        </Svg>
    );
}

export default function NotesIntervalsToggle({ showIntervals, onToggle }: Props) {
    const { colors } = useTheme();
    return (
        <TouchableOpacity
            onPress={() => onToggle(!showIntervals)}
            style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: `${colors.ink}66`,
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            {showIntervals ? <IntervalsIcon /> : <NoteIcon />}
        </TouchableOpacity>
    );
}
