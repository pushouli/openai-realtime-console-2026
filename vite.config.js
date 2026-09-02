import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Inject the portal stylesheet the page header borrows from
 * (.page-header, .logo, .logo-pic, .logo-text).
 *
 * It lives here rather than in index.html so each deployment can aim it
 * somewhere different: a relative path when the build is served by the portal
 * itself, an absolute one for a standalone site. Leave VITE_SITE_CSS unset and
 * no tag is emitted at all - which an href in the HTML could not express.
 *
 * `order: "pre"` matters. Vite appends the bundled CSS to <head> during its own
 * HTML transform, and this has to land ahead of that or the portal styles would
 * win the cascade over the app's own.
 */
function siteStylesheet(href) {
  return {
    name: "inject-site-stylesheet",
    transformIndexHtml: {
      order: "pre",
      handler: () =>
        href
          ? [
              {
                tag: "link",
                attrs: { rel: "stylesheet", href },
                injectTo: "head",
              },
            ]
          : [],
    },
  };
}

export default defineConfig(({ mode }) => {
  // envDir is the project root rather than the Vite root (client/), so .env
  // sits next to package.json instead of being buried under the source tree.
  const env = loadEnv(mode, projectRoot, "");

  const proxy = {};

  // Production serves the app and /api from the same origin. In development
  // they are split, and every backend call sends cookies, so proxy instead of
  // relying on CORS.
  if (env.API_PROXY_TARGET) {
    proxy["/api"] = {
      target: env.API_PROXY_TARGET,
      changeOrigin: true,
      secure: false,
    };
  }

  return {
    base: './',
    root: join(projectRoot, "client"),
    envDir: projectRoot,
    plugins: [react(), siteStylesheet(env.VITE_SITE_CSS)],
    server: { proxy },
    build: {
      minify: false,
      outDir: join(projectRoot, "dist"),
      emptyOutDir: true,
    },
  };
});
