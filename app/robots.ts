import type { MetadataRoute } from "next";

const BASE_URL = "https://shapeshifter.djoshware.com";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/", "/auth/", "/reset-password"],
        },
        sitemap: `${BASE_URL}/sitemap.xml`,
    };
}
