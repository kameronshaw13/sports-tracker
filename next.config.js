/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // ESPN headshots / logos
      { protocol: "https", hostname: "a.espncdn.com" },
      // v21: MLB official headshot CDN. Used as a fallback when a 40-man
      // player has no ESPN profile data (typical for fresh September
      // call-ups). URL pattern: midfield.mlbstatic.com/v1/people/{id}/spots/120
      { protocol: "https", hostname: "midfield.mlbstatic.com" },
      // Generic MLB content CDN — covers a few less-common headshot paths.
      { protocol: "https", hostname: "img.mlbstatic.com" },
      { protocol: "https", hostname: "content.mlb.com" },
    ],
  },
};

module.exports = nextConfig;
