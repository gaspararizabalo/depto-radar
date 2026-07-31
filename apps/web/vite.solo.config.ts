import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Build del modo un jugador como archivo unico y autocontenido.
 *
 * Todo va inline (JS, CSS, SVG) porque el destino es un entorno con CSP
 * estricta que bloquea cualquier pedido a otro host: sin CDN, sin fuentes
 * externas, sin imagenes remotas. Ver scripts/build-solo.mjs.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-solo',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    // Fuerza que cualquier asset chico termine embebido en vez de ser un archivo.
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'solo.html'),
      output: {
        // Un solo chunk: nada de imports dinamicos que despues no podriamos inline.
        inlineDynamicImports: true,
      },
    },
  },
})
