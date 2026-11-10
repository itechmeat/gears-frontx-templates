import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev-only plain React host of template-dashboard: serves host/index.html on localhost. Not part of the template.
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5198, strictPort: true },
});
