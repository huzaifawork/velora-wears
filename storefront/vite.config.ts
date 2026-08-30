import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      /*
       * The admin dashboard (requirements section 8). It keeps its own folder
       * at the repository root — it is a separate body of work with its own
       * README — but it is COMPILED INTO THIS APPLICATION rather than deployed
       * as a second one.
       *
       * That is what makes a single sign-in possible. A Supabase session lives
       * in the browser's storage for ONE ORIGIN; two deployments mean two
       * origins and therefore two sessions, and no amount of redirecting
       * between them shares a login. One app, one origin, one session.
       *
       * It costs the shop nothing: every `/admin` route is lazily imported, so
       * a customer never downloads a byte of it (check the chunk list after a
       * build).
       */
      "@admin": fileURLToPath(new URL("../admin/src", import.meta.url)),
    },
  },
  build: {
    // Split vendor code so app updates don't invalidate the whole cached bundle.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react")) return "react";
          if (id.includes("node_modules/@supabase")) return "supabase";
          return undefined;
        },
      },
    },
  },
});
