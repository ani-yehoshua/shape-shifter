// Port of ../../components/RootNoteButton.tsx. The web version anchors a
// popup under the button via a DOM portal + getBoundingClientRect; that
// positioning approach doesn't translate to React Native (no portal target,
// no bounding-rect-relative fixed positioning against the whole document),
// so this uses a centered Modal instead -- same picker content and
// behavior (sharp/flat toggle defaulting to flats unless the current root
// is already a sharp, 12-note grid, Random), just a platform-appropriate
// presentation.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { NOTES } from '../lib/fretboardMap';
import { colors, fonts, radius, spacing } from '../lib/theme';

// C -> B chromatic order (indices into NOTES, which starts at A=0)
const C_TO_B: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

type Props = {
    root: string;
    onSelect: (note: string) => void;
    onRandom: () => void;
    style?: object;
    textStyle?: object;
};

export default function RootNoteButton({ root, onSelect, onRandom, style, textStyle }: Props) {
    const [open, setOpen] = useState(false);
    const [useFlats, setUseFlats] = useState(() => !root.includes('#'));

    return (
        <>
            <TouchableOpacity onPress={() => setOpen(true)} style={style}>
                <Text style={textStyle}>{root}</Text>
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={styles.popup} onPress={() => {}}>
                        <View style={styles.header}>
                            <Text style={styles.headerLabel}>Root</Text>
                            <TouchableOpacity onPress={() => setUseFlats((f) => !f)}>
                                <Text style={styles.headerToggle}>
                                    {useFlats ? '♯ Sharps' : '♭ Flats'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.grid}>
                            {C_TO_B.map((idx) => {
                                const pair = NOTES[idx];
                                const label = pair.length > 1 && useFlats ? pair[1] : pair[0];
                                const isActive = pair.includes(root);
                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        onPress={() => {
                                            onSelect(label);
                                            setOpen(false);
                                        }}
                                        style={[styles.noteButton, isActive && styles.noteButtonActive]}
                                    >
                                        <Text style={[styles.noteText, isActive && styles.noteTextActive]}>
                                            {label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <TouchableOpacity
                            onPress={() => {
                                onRandom();
                                setOpen(false);
                            }}
                            style={styles.randomButton}
                        >
                            <Text style={styles.randomText}>Random</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    popup: {
        width: 232,
        backgroundColor: colors.sand1,
        borderRadius: radius.xl,
        padding: spacing.sm + 4,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    headerLabel: {
        fontFamily: fonts.sans.bold,
        fontSize: 10,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: `${colors.ink}4D`,
    },
    headerToggle: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    noteButton: {
        width: 48,
        height: 36,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteButtonActive: {
        backgroundColor: colors.ink,
    },
    noteText: {
        fontFamily: fonts.sans.bold,
        fontSize: 13,
        color: colors.ink,
    },
    noteTextActive: {
        color: colors.sand1,
    },
    randomButton: {
        marginTop: spacing.sm,
        paddingVertical: spacing.xs + 2,
        alignItems: 'center',
    },
    randomText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
    },
});
