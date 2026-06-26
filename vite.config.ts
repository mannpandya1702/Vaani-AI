import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

// HTTPS dev server is REQUIRED because browsers refuse getUserMedia()
// (microphone) on non-secure non-localhost origins. Without it, the
// VAPI web SDK silently fails on a LAN IP like http://10.5.0.2:8080.
//
// On first load the browser will show a self-signed-cert warning —
// click "Advanced → Proceed". The cert is regenerated each cold start.
export default defineConfig({
  // NOTE: do NOT add `https: true` here — Vite 5's type for server.https is
  // `https.ServerOptions | undefined`, not boolean (build breaks with TS2769).
  // The basicSsl() plugin below enables HTTPS + injects the self-signed cert
  // on its own, so the dev server is still https://localhost:8080.
  server: { host: true, port: 8080, strictPort: false },
  plugins: [react(), basicSsl()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
