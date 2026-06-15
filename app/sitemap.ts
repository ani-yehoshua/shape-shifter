import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const BASE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://the-shape-shifter.com";

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${BASE_URL}/`, lastModified: new Date() },
        { url: `${BASE_URL}/signin`, lastModified: new Date() },
    ];
}
