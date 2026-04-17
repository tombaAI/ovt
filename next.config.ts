import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    serverExternalPackages: ["postgres", "pdf-parse"],
    transpilePackages: ["react-markdown", "remark-gfm", "remark-parse", "unified", "vfile", "vfile-message", "unist-util-visit", "unist-util-is", "mdast-util-from-markdown", "mdast-util-to-hast", "hast-util-to-jsx-runtime", "hast-util-whitespace", "property-information", "space-separated-tokens", "comma-separated-tokens", "devlop"],
};

export default nextConfig;
