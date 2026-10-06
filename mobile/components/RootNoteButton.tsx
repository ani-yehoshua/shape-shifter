// Port of ../../components/RootNoteButton.tsx. The web version anchors a
// popup under the button via a DOM portal + getBoundingClientRect; RN has
// no portal target or fixed-relative-to-document positioning, but the same
// effect is reachable with `measureInWindow` (RN's equivalent of
// getBoundingClientRect for screen-space coordinates) plus a transparent,
// non-centered Modal -- so the popup is anchored directly above the button,
// same as the website, instead of sitting in the middle of the screen.
// Same picker content and behavior otherwise (sharp/flat toggle defaulting
// to flats unless the current root is already a sharp, 12-note grid,
// Random).
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { NOTES } from '../lib/fretboardMap';
import { fonts, radius, spacing, type Palette } from '../lib/theme';
import { useThemedStyles } from '../lib/theme-context';

// C -> B chromatic order (indices into NOTES, which starts at A=0)
const C_TO_B: number[] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

const POPUP_WIDTH = 232;
const GAP = 8;
const MARGIN = 8;

type Props = {
    root: string;
    onSelect: (note: string) => void;
    onRandom: () => void;
    style?: object;
    textStyle?: object;
};

type Anchor = { x: number; y: number; width: number; height: number };

export default function RootNoteButton({ root, onSelect, onRandom, style, textStyle }: Props) {
    const styles = useThemedStyles(makeStyles);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const [useFlats, setUseFlats] = useState(() => !root.includes('#'));
    const buttonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();

    const handleOpen = () => {
        buttonRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
            setOpen(true);
        });
    };

    const popupPosition = anchor
        ? {
              position: 'absolute' as const,
              bottom: screenHeight - anchor.y + GAP,
              left: Math.max(
                  MARGIN,
                  Math.min(screenWidth - POPUP_WIDTH - MARGIN, anchor.x + anchor.width / 2 - POPUP_WIDTH / 2),
              ),
          }
        : null;

    return (
        <>
            <TouchableOpacity ref={buttonRef} onPress={handleOpen} style={style}>
                <Text style={textStyle}>{root}</Text>
            </TouchableOpacity>

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={[styles.popup, popupPosition]} onPress={() => {}}>
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

const makeStyles = (colors: Palette) => StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
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
