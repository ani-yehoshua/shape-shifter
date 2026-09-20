// Port of ../../components/CapoButton.tsx (the "sm" icon-button variant --
// the "md" labeled-pill variant isn't used by Chords mode). Same fret grid
// + Remove Capo popup, anchored above the button the same way the website
// positions it: `btnRef.current.getBoundingClientRect()` there becomes
// `measureInWindow` here, and the same
// `bottom: screenHeight - anchorY + gap` / clamped-left math is used so the
// popup sits directly above the button instead of a plain screen-centered
// Modal. The web version recolors its capo.png icon for the active/dark
// states via CSS invert() filters, which produced an off-white tint rather
// than true white (fixed on the website by forcing brightness-0 first);
// RN's Image has a native tintColor prop that recolors exactly, so none of
// that is needed here.
import { useRef, useState } from "react";
import {
    Image,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from "react-native";
import { colors, fonts, radius, spacing } from "../lib/theme";

const FRETS = Array.from({ length: 12 }, (_, i) => i + 1);

// Matches the website's mobilePopup sizing exactly (see CapoButton.tsx there).
const POPUP_WIDTH = 160;
const GAP = 8;
const MARGIN = 8;

type Props = {
    capo: number;
    setCapo: (v: number) => void;
};

type Anchor = { x: number; y: number; width: number; height: number };

export default function CapoButton({ capo, setCapo }: Props) {
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const buttonRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const isActive = capo > 0;

    const handleOpen = () => {
        buttonRef.current?.measureInWindow((x, y, width, height) => {
            setAnchor({ x, y, width, height });
            setOpen(true);
        });
    };

    const popupPosition = anchor
        ? {
              position: "absolute" as const,
              width: POPUP_WIDTH,
              bottom: screenHeight - anchor.y + GAP,
              left: Math.max(
                  MARGIN,
                  Math.min(
                      screenWidth - POPUP_WIDTH - MARGIN,
                      anchor.x + anchor.width / 2 - POPUP_WIDTH / 2,
                  ),
              ),
          }
        : null;

    return (
        <View>
            <TouchableOpacity
                ref={buttonRef}
                onPress={handleOpen}
                style={[styles.button, isActive && styles.buttonActive]}>
                <Image
                    source={require("../assets/images/capo.png")}
                    style={styles.icon}
                    tintColor={isActive ? colors.sand1 : colors.ink}
                />
            </TouchableOpacity>
            {isActive && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{capo}</Text>
                </View>
            )}

            <Modal
                visible={open}
                transparent
                animationType='fade'
                onRequestClose={() => setOpen(false)}>
                <Pressable
                    style={styles.backdrop}
                    onPress={() => setOpen(false)}>
                    <Pressable
                        style={[styles.popup, popupPosition]}
                        onPress={() => {}}>
                        <View style={styles.grid}>
                            {FRETS.map(f => (
                                <TouchableOpacity
                                    key={f}
                                    onPress={() => {
                                        setCapo(f);
                                        setOpen(false);
                                    }}
                                    style={[
                                        styles.fretButton,
                                        capo === f && styles.fretButtonActive,
                                    ]}>
                                    <Text
                                        style={[
                                            styles.fretText,
                                            capo === f && styles.fretTextActive,
                                        ]}>
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
                                style={styles.removeButton}>
                                <Text style={styles.removeText}>
                                    Remove Capo
                                </Text>
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
        alignItems: "center",
        justifyContent: "center",
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
        position: "absolute",
        bottom: -2,
        right: -2,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: colors.ink,
        borderWidth: 1,
        borderColor: colors.sand1,
        alignItems: "center",
        justifyContent: "center",
    },
    badgeText: {
        fontFamily: fonts.sans.bold,
        fontSize: 8,
        color: colors.sand1,
    },
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    popup: {
        backgroundColor: colors.sand1,
        borderRadius: radius.xl,
        // 8px (not the sm+4=12 used elsewhere) so the 4-column, 32px fret
        // grid actually fits inside the fixed POPUP_WIDTH -- matches the
        // website's p-2 padding on this same popup.
        padding: spacing.xs + 4,
        borderWidth: 1,
        borderColor: `${colors.ink}33`,
    },
    grid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 4,
    },
    fretButton: {
        width: 32,
        height: 32,
        borderRadius: radius.lg,
        alignItems: "center",
        justifyContent: "center",
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
        alignItems: "center",
    },
    removeText: {
        fontFamily: fonts.sans.semiBold,
        fontSize: 11,
        color: `${colors.ink}80`,
    },
});
