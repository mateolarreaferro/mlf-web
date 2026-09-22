import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    /agents is the class site: a static three.js world copied into
    public/agents by `npm run sync:agents`. Next serves files in public/ but
    not a folder's index, so name it. The page sets its own <base>, which is
    what lets its relative URLs work without a trailing slash.
  */
  async rewrites() {
    return [{ source: "/agents", destination: "/agents/index.html" }];
  },
};

export default nextConfig;
