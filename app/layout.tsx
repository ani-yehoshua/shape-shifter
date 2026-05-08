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

export const metadata: Metadata = {
    title: "Shape Shifter",
    description: "Everything you could ever learn about chords and scales.",
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
