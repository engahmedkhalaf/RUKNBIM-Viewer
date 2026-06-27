import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  worker: {
    format: 'es',
    plugins: () => [
      wasm(),
      topLevelAwait()
    ]
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['web-ifc']
  }
});
