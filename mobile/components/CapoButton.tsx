// Port of ../../components/CapoButton.tsx (the "sm" icon-button variant --
// the "md" labeled-pill variant isn't used by Chords mode). Same fret grid
// + Remove Capo popup, presented as a centered Modal instead of a DOM-
// portal-anchored popup (see RootNoteButton.tsx for why). The web version
// recolors its capo.png icon for the active/dark states via CSS invert()
// filters, which produced an off-white tint rather than true white (fixed
// on the website by forcing brightness-0 first); RN's Image has a native
// tintColor prop that recolors exactly, so none of that is needed here.
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radius, spacing } from '../lib/theme';

const FRETS = Array.from({ length: 12 }, (_, i) => i + 1);

type Props = {
    capo: number;
    setCapo: (v: number) => void;
};

export default function CapoButton({ capo, setCapo }: Props) {
    const [open, setOpen] = useState(false);
    const isActive = capo > 0;

    return (
        <View>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                style={[styles.button, isActive && styles.buttonActive]}
            >
                <Image
                    source={require('../assets/images/capo.png')}
                    style={styles.icon}
                    tintColor={isActive ? colors.sand1 : colors.ink}
                />
            </TouchableOpacity>
            {isActive && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{capo}</Text>
                </View>
            )}

            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
                    <Pressable style={styles.popup} onPress={() => {}}>
                        <View style={styles.grid}>
                            {FRETS.map((f) => (
                                <TouchableOpacity
                                    key={f}
                                    onPress={() => {
                                        setCapo(f);
                                        setOpen(false);
                                    }}
                                    style={[styles.fretButton, capo === f && styles.fretButtonActive]}
                                >
                                    <Text style={[styles.fretText, capo === f && styles.fretTextActive]}>
                                        {f}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {isActive && (
                            <TouchableOpacity
                                onPress={() => {
                                    setCapo(0);
                                    setOpen(false);
                                }}
                                style={styles.removeButton}
                            >
                                <Text style={styles.removeText}>Remove Capo</Text>
                            </TouchableOpacity>
                        )}
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    button: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${colors.ink}66`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonActive: {
        backgroundColor: colors.ink,
        borderColor: colors.ink,
    },
    icon: {
        width: 20,
        height: 20,
    },
    badge: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.ink,
        borderWidth: 1,
        borderColor: colors.sand1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        fontFamily: fonts.sans.bold,
        fontSize: 8,
        color: colors.sand1,
    },
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    popup: {
        backgroundColor: colors.sand1,
        borderRadius: radius.xl,
        padding: spacing.sm + 4,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: 4 * 32 + 3 * 4,
        gap: 4,
    },
    fretButton: {
        width: 32,
        height: 32,
        borderRadius: radius.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fretButtonActive: {
        backgroundColor: colors.ink,
    },
    fretText: {
        fontFamily: fonts.sans.bold,
        fontSize: 12,
        color: colors.ink,
    },
    fretTextActive: {
        color: colors.sand1,
    },
    removeButton: {
        marginTop: spacing.xs + 2,
        paddingVertical: spacing.xs + 2,
        alignItems: 'center',
    },
    removeText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
    },
});
