import path from 'path';
import { createHash } from 'crypto';
import { readFileSync, writeFileSync } from 'fs';
import { Plugin, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Gives the service worker (public/sw.js) this build's files and an id made
 * from them, so it caches the new version on install and deletes the old one.
 */
const serviceWorkerBuild = (): Plugin => ({
  name: 'runway-service-worker',
  apply: 'build',
  writeBundle(options, bundle) {
    const file = path.join(options.dir ?? 'dist', 'sw.js');
    const assets = Object.keys(bundle).filter((name) => name.startsWith('assets/')).sort().map((name) => `/${name}`);
    const id = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
    const placeholder = "const BUILD = { id: 'dev', assets: [] };";
    const source = readFileSync(file, 'utf8');
    if (!source.includes(placeholder)) throw new Error(`${file} no longer has the line: ${placeholder}`);
    writeFileSync(file, source.replace(placeholder, `const BUILD = ${JSON.stringify({ id, assets })};`));
  },
});

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), serviceWorkerBuild()],
      build: {
        rollupOptions: {
          output: {
            // Libraries change far less often than the app, so keep them cached separately.
            manualChunks: {
              react: ['react', 'react-dom'],
              supabase: ['@supabase/supabase-js'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
