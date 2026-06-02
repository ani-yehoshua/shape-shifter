import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    allowedDevOrigins: [
        '192.168.1.214', // Barn
        '172.20.10.11', // iPhone hotspot
        '192.168.99.39', // Parkey's house
    ],
    serverExternalPackages: ['resend'],
};

export default nextConfig;
