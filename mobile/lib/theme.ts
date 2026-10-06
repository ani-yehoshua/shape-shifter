// Mirrors the design tokens in app/globals.css on the website (the @theme
// block) so the app matches the real palette instead of an eyeballed
// approximation. React Native has no CSS custom properties, so this is the
// plain-object equivalent -- update both places together if the site's
// tokens change.
//
// Dark mode is the site's full inversion of this ramp (`:root.dark` in
// globals.css): same hexes with roles swapped, accents unchanged. Both
// palettes live here; components read the active one through useTheme()
// (see ./theme-context) rather than importing a static object.
export const lightColors = {
    // Slate + Amber palette, named exactly as in globals.css so this file
    // can be diffed directly against the site's tokens.
    sand1: '#f7f7f5',
    sand2: '#eeeeec',
    sand3: '#d1d1cc',
    sand4: '#1f2d3d',
    ink: '#1f2d3d',
    rootRed: '#dc2626',
    olive: '#d97706',
    green: '#b45309',

    // Semantic aliases -- same names/mapping as globals.css's --color-bg /
    // --color-surface / --color-on-surface / --color-border.
    bg: '#f7f7f5', // sand-1
    surface: '#1f2d3d', // sand-4
    onSurface: '#f7f7f5', // sand-1
    border: '#1f2d3d', // ink
};

export type Palette = typeof lightColors;

// `:root.dark` -- sand-1/2/3 and sand-4/ink swap; accents are unchanged.
export const darkColors: Palette = {
    sand1: '#1f2d3d',
    sand2: '#28384a',
    sand3: '#3c5066',
    sand4: '#f7f7f5',
    ink: '#f7f7f5',
    rootRed: '#dc2626',
    olive: '#d97706',
    green: '#b45309',

    bg: '#1f2d3d', // sand-1
    surface: '#f7f7f5', // sand-4
    onSurface: '#1f2d3d', // sand-1
    border: '#f7f7f5', // ink
};

// Tailwind v4's default radius scale -- this app doesn't override --radius-*
// in its @theme block, so these are the values actually in effect (rounded
// -full is by far the most common class in the codebase; -xl/-lg/-2xl/-3xl
// cover the rest).
export const radius = {
    sm: 4,
    md: 6,
    lg: 8,
    xl: 12,
    '2xl': 16,
    '3xl': 24,
    pill: 9999,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

// app/layout.tsx loads Montserrat (weights 400/500/600/700) via
// next/font/google and applies it to the whole <body> in globals.css --
// it's the site's actual base font everywhere, not just a heading accent,
// so all four weights are bundled here too. (It's the *only* font the site
// loads -- no other next/font/google calls anywhere in app/ or
// components/ -- so there's no dead weight to skip, unlike a site that
// loads fonts it never actually references.)
export const fonts = {
    sans: {
        regular: 'Montserrat_400Regular',
        medium: 'Montserrat_500Medium',
        semiBold: 'Montserrat_600SemiBold',
        bold: 'Montserrat_700Bold',
    },
};
