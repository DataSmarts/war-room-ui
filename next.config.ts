import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The front door is the sweep index, so `/` is a routing fact rather than a page.
   *
   * Here rather than in a `page.tsx` that exists only to throw: it is resolved before any
   * render, and Next puts `/` into the generated `RedirectRoutes`, so the wordmark's `href="/"`
   * stays a route the type checker knows about the day `typedRoutes` is turned on.
   *
   * **`permanent: false` deliberately.** A 308 is cached by browsers long past the point anyone
   * remembers setting it, and `/` becomes a real dashboard the moment there is a funnel to put
   * there. A temporary redirect is the one that can be taken back.
   */
  async redirects() {
    return [{ source: "/", destination: "/sweeps", permanent: false }];
  },
};

export default nextConfig;
