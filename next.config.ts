import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    allowedDevOrigins: [
        '172.20.10.11', // iPhone hotspot
        '192.168.1.214', // Barn
        '192.168.1.215', // My house
        '192.168.1.222', // Jackson house
        '192.168.99.39', // Parkey house
    ],
    serverExternalPackages: ['resend'],
};

export default nextConfig;
