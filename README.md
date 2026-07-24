# Shape Shifter

**Shape Shifter** is an interactive guitar chords and scales app. Explore chord voicings, scale patterns, modes, and diatonic scale chords across an interactive fretboard, in any key, any tuning, any handedness.

🔗 **[the-shape-shifter.com](https://the-shape-shifter.com)**

## Features

- **Chords** — Browse chord voicings by category, voicing type, string set, quality, and inversion, with alternate fingerings for many shapes.
- **Scales** — Explore scale patterns and positions across the fretboard, including modes.
- **Scale Chords** — See the diatonic chords built from any scale or mode, in every inversion, with alternate voicings.
- **Draw Mode** — Build your own custom chord shapes from scratch.
- **Chord progressions** — Save chords and chain them into progressions.
- **Randomizer** — Randomize root notes, scales, chord shapes, and more for practice, with fine-grained control over what gets randomized.
- **Customizable fretboard** — Left- or right-handed orientation, alternate tunings, capo support, note/interval display.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

The main app UI lives in `app/page.tsx`. Chord and scale shape data lives under `lib/Shapes/`.

## Tech Stack

- [Next.js](https://nextjs.org) (App Router)
- React
- Supabase (auth, saved chords/progressions)
- Stripe (subscriptions)
