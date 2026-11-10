import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Dev-only plain React host of template-dashboard: serves host/index.html on
 * localhost. Not part of the template. The widget bundles are not part of the
 * host's build: the host serves what build-bundles.mjs wrote to the widgets
 * package's dist/ under /widgets/, read from disk on every request, so a
 * bundle rebuilt or added there shows on the next page load. `vite preview`
 * of the built host serves the same built bundles.
 */

const BUNDLES = path.resolve(import.meta.dirname, '../src-app/mfe_packages/widgets/dist');
const TYPES: Record<string, string> = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html' };

function widgetBundles(): Plugin {
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/widgets/')) return next();
    const file = path.join(BUNDLES, decodeURIComponent(url.pathname.slice('/widgets/'.length)));
    if (!file.startsWith(BUNDLES + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'widget-bundles',
    configureServer: (server) => void server.middlewares.use(serve),
    configurePreviewServer: (server) => void server.middlewares.use(serve),
  };
}

export default defineConfig({
  plugins: [react(), widgetBundles()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
  preview: { host: '127.0.0.1', port: 5197, strictPort: true },
});
