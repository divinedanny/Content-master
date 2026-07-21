/** @type {import('next').NextConfig} */

// The Django backend origin, reached server-side by the Next.js proxy below.
// Only needs changing if the backend runs somewhere other than localhost:8000.
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // Django's API paths end in a slash; don't let Next redirect it away before
  // the rewrite forwards the request, which would cause a redirect loop.
  skipTrailingSlashRedirect: true,
  // Proxy API + webhook calls to Django so the whole app is served from a
  // single origin. This is what makes one exposed port (e.g. an ngrok /
  // cloudflared tunnel to :3000) enough for an external tester — the browser
  // only ever talks to the frontend origin, and Next forwards /api server-side.
  async rewrites() {
    // Django requires the trailing slash; :path* drops it, so re-append it on
    // the destination (with skipTrailingSlashRedirect keeping the client URL
    // intact). Every Django API/webhook path ends in a slash, so this is safe.
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*/` },
      { source: "/webhooks/:path*", destination: `${BACKEND_ORIGIN}/webhooks/:path*/` },
    ];
  },
};

export default nextConfig;
