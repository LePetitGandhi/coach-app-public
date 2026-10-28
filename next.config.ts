import type { NextConfig } from "next";

/**
 * Export statique : l'app tourne entièrement dans le navigateur. Cloudflare sert
 * les fichiers de `out/` ; le Worker (`worker/index.js`) ajoute l'API de
 * synchronisation D1 et les anciennes redirections.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
