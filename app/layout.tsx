import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import Providers from "@/components/Providers";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

const montserrat = Montserrat({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-montserrat",
    display: "swap",
});

const BASE_URL = "https://the-shape-shifter.com";

export const metadata: Metadata = {
    metadataBase: new URL(BASE_URL),
    title: {
        default: "Shape Shifter — Interactive Guitar Chords & Scales",
        template: "%s | Shape Shifter",
    },
    description:
        "Explore guitar chords and scales in every key and position. Interactive fretboard with chord voicings, scale patterns, modes, Draw Mode, and chord progressions.",
    keywords: [
        "guitar chords",
        "guitar scales",
        "fretboard",
        "chord voicings",
        "scale positions",
        "guitar modes",
        "music theory",
        "interactive guitar",
        "chord diagrams",
        "guitar learning",
        "chord progressions",
        "draw mode guitar",
    ],
    authors: [{ name: "dJoshware", url: BASE_URL }],
    creator: "dJoshware",
    publisher: "dJoshware",
    applicationName: "Shape Shifter",
    referrer: "origin-when-cross-origin",
    alternates: { canonical: BASE_URL },
    openGraph: {
        type: "website",
        url: BASE_URL,
        siteName: "Shape Shifter",
        title: "Shape Shifter — Interactive Guitar Chords & Scales",
        description:
            "Explore guitar chords and scales in every key and position. Interactive fretboard with chord voicings, scale patterns, modes, Draw Mode, and chord progressions.",
    },
    twitter: {
        card: "summary_large_image",
        title: "Shape Shifter — Interactive Guitar Chords & Scales",
        description:
            "Explore guitar chords and scales in every key and position. Interactive fretboard with chord voicings, scale patterns, modes, Draw Mode, and chord progressions.",
    },
    icons: {
        icon: "/favicon.ico",
        apple: "/logo.png",
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
};

export default function RootLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <html
            lang='en'
            className={montserrat.variable}>
            <body className='h-dvh overflow-hidden sm:h-auto sm:min-h-dvh sm:overflow-visible flex flex-col bg-sand-1 text-ink'>
                <Providers>
                    <Suspense>
                        <Header />
                    </Suspense>
                    <main className='flex flex-col flex-1 min-h-0'>
                        {children}
                    </main>
                    <div className='hidden sm:block'>
                        <Footer />
                    </div>
                </Providers>
            </body>
        </html>
    );
}
