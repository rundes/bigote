import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    setupFiles: ["tests/setup.ts"],
    // Los tests corren contra el Supabase hosted real: en paralelo, los
    // sign-ins de todos los archivos juntos pisan el rate limit de auth.
    // Secuencial + sesiones cacheadas en helpers.ts mantienen la suite
    // dentro del límite (y de paso eliminan las carreras de clock skew).
    fileParallelism: false,
  },
});
