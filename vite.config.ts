import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { scanIconDirectory } from './scripts/icon-scanner/scan';

const execFileAsync = promisify(execFile);

export default defineConfig({
  plugins: [react(), iconSourceApiPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true
  }
});

function iconSourceApiPlugin(): Plugin {
  return {
    name: 'icon-source-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/select-icon-folder', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          writeJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const sourceDir = await chooseFolderPath();
          const catalog = await scanIconDirectory(sourceDir);
          writeJson(response, 200, { sourceDir, catalog });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeJson(response, message === 'Folder selection cancelled.' ? 499 : 500, { error: message });
        }
      });

      server.middlewares.use('/api/scan-icon-folder', async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== 'POST') {
          writeJson(response, 405, { error: 'Method not allowed' });
          return;
        }

        try {
          const body = await readJsonBody(request);
          const sourceDir = typeof body.sourceDir === 'string' ? body.sourceDir : '';
          if (!sourceDir) {
            writeJson(response, 400, { error: 'sourceDir is required' });
            return;
          }

          const catalog = await scanIconDirectory(sourceDir);
          writeJson(response, 200, { sourceDir, catalog });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          writeJson(response, 500, { error: message });
        }
      });
    }
  };
}

async function chooseFolderPath() {
  const script = 'POSIX path of (choose folder with prompt "Select React Native SVG icon folder")';
  let stdout = '';

  try {
    ({ stdout } = await execFileAsync('osascript', ['-e', script]));
  } catch (error) {
    const stderr = typeof (error as { stderr?: unknown }).stderr === 'string' ? (error as { stderr: string }).stderr : '';
    if (stderr.includes('User canceled') || stderr.includes('-128')) {
      throw new Error('Folder selection cancelled.');
    }

    throw error;
  }

  const sourceDir = stdout.trim();

  if (!sourceDir) {
    throw new Error('No folder selected');
  }

  return sourceDir.replace(/\/$/, '');
}

function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += String(chunk);
    });

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}
