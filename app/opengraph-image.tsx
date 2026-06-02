import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const alt = "Shape Shifter — Guitar Chords & Scales";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
    const [logoData, fontData] = await Promise.all([
        readFile(join(process.cwd(), "public/logo.png")),
        readFile(join(process.cwd(), "public/fonts/Montserrat-Bold.ttf")),
    ]);

    const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

    return new ImageResponse(
        (
            <div
                style={{
                    width: "1200px",
                    height: "630px",
                    background: "#1f2d3d",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "32px",
                    fontFamily: "Montserrat",
                }}>
                {/* Logo */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={logoSrc}
                    width={140}
                    height={140}
                    alt=''
                />

                {/* Title */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "12px",
                    }}>
                    <span
                        style={{
                            fontSize: "72px",
                            fontWeight: 700,
                            color: "#f7f7f5",
                            letterSpacing: "-1px",
                            lineHeight: 1,
                        }}>
                        Shape Shifter
                    </span>
                    <span
                        style={{
                            fontSize: "28px",
                            fontWeight: 700,
                            color: "#d1d1cc",
                            letterSpacing: "0px",
                        }}>
                        Guitar Chords &amp; Scales
                    </span>
                </div>

                {/* URL pill */}
                <div
                    style={{
                        display: "flex",
                        padding: "10px 28px",
                        borderRadius: "999px",
                        border: "2px solid #d1d1cc",
                        color: "#d1d1cc",
                        fontSize: "20px",
                        fontWeight: 700,
                        letterSpacing: "0.5px",
                    }}>
                    the-shape-shifter.com
                </div>
            </div>
        ),
        {
            ...size,
            fonts: [
                {
                    name: "Montserrat",
                    data: fontData,
                    style: "normal",
                    weight: 700,
                },
            ],
        },
    );
}
