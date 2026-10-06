// Port of the website's next-themes setup (components/ThemeProvider +
// ThemeToggle): Light / Dark / System, persisted under next-themes' default
// "theme" key. "system" follows the OS scheme via useColorScheme. Consumers
// get the resolved palette and build their styles from it with
// useThemedStyles, since RN has no CSS custom properties to swap.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { darkColors, lightColors, type Palette } from './theme';

export type ThemeSetting = 'light' | 'dark' | 'system';

type ThemeContextValue = {
    theme: ThemeSetting;
    setTheme: (t: ThemeSetting) => void;
    isDark: boolean;
    colors: Palette;
};

const THEME_KEY = 'theme';

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'system',
    setTheme: () => {},
    isDark: false,
    colors: lightColors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const systemScheme = useColorScheme();
    const [theme, setThemeState] = useState<ThemeSetting>('system');

    useEffect(() => {
        AsyncStorage.getItem(THEME_KEY)
            .then((stored) => {
                if (stored === 'light' || stored === 'dark' || stored === 'system') setThemeState(stored);
            })
            .catch(() => {});
    }, []);

    const setTheme = (t: ThemeSetting) => {
        setThemeState(t);
        AsyncStorage.setItem(THEME_KEY, t).catch(() => {});
    };

    const isDark = theme === 'dark' || (theme === 'system' && systemScheme === 'dark');
    const value = useMemo(
        () => ({ theme, setTheme, isDark, colors: isDark ? darkColors : lightColors }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [theme, isDark],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}

// Builds a component's StyleSheet from the active palette, rebuilt only when
// the palette changes. Usage: `const styles = useThemedStyles(makeStyles);`
// with `const makeStyles = (colors: Palette) => StyleSheet.create({...})`.
export function useThemedStyles<T>(make: (colors: Palette) => T): T {
    const { colors } = useTheme();
    return useMemo(() => make(colors), [make, colors]);
}
