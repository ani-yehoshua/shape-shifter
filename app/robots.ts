import type { MetadataRoute } from "next";

const BASE_URL = "https://the-shape-shifter.com";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/", "/auth/"],
        },
        sitemap: `${BASE_URL}/sitemap.xml`,
    };
}
