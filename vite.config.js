import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// 版本号单一来源：package.json（避免 UI 里再出现写死的占位符，爹地 10-08 抓到 v0.1）
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: 'localhost',
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2022',
  },
});
