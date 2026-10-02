import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { spawn, ChildProcess } from 'node:child_process';
import http from 'node:http';

let backendProcess: ChildProcess | null = null;

function startBackend() {
  if (backendProcess) return;
  const checkReq = http.get('http://127.0.0.1:5000/api/health', () => {
    // Backend is already alive
  });

  checkReq.on('error', () => {
    if (!backendProcess) {
      backendProcess = spawn('npx', ['tsx', 'backend/src/server.ts'], {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          PORT: '5000',
          BACKEND_PORT: '5000',
        },
      });

      backendProcess.on('exit', () => {
        backendProcess = null;
      });

      backendProcess.on('error', (err) => {
        console.error('[Vite] Failed to spawn backend process:', err);
        backendProcess = null;
      });
    }
  });
}

function backendRunnerPlugin(): Plugin {
  return {
    name: 'gramyatra-backend-runner',
    configureServer(server) {
      startBackend();

      server.httpServer?.on('close', () => {
        if (backendProcess) {
          backendProcess.kill();
          backendProcess = null;
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), backendRunnerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res: any) => {
              startBackend();
              if (res && !res.headersSent && typeof res.writeHead === 'function') {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(
                  JSON.stringify({
                    success: false,
                    error: 'Backend is initializing, please retry.',
                  })
                );
              }
            });
          },
        },
      },
    },
  };
});
