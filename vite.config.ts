import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promisify } from 'node:util';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { scanIconDirectory } from './scripts/icon-scanner/scan';

const execFileAsync = promisify(execFile);
const appTitle = 'SVG workspace';
const appDescription =
  'Browse, preview, and convert SVG assets for React Native, React, and raw SVG workflows.';
const appKeywords = [
  'SVG workspace',
  'SVG converter',
  'SVG to React',
  'SVG to React Native',
  'React SVG icons',
  'React Native SVG icons',
  'SVG icon catalog',
  'free SVG tool'
];
const appRoutes = ['/', '/converter', '/guide'];

export default defineConfig({
  plugins: [react(), productionSeoPlugin(), iconSourceApiPlugin()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true
  }
});

function productionSeoPlugin(): Plugin {
  const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL ?? process.env.SITE_URL);
  const ogImageUrl = siteUrl ? `${siteUrl}/og-image.svg` : '/og-image.svg';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: appTitle,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    description: appDescription,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    },
    ...(siteUrl
      ? {
          url: siteUrl,
          image: ogImageUrl
        }
      : {})
  };

  return {
    name: 'production-seo',
    transformIndexHtml() {
      return [
        { tag: 'meta', attrs: { name: 'description', content: appDescription } },
        { tag: 'meta', attrs: { name: 'keywords', content: appKeywords.join(', ') } },
        { tag: 'meta', attrs: { name: 'author', content: appTitle } },
        { tag: 'meta', attrs: { name: 'robots', content: 'index, follow, max-image-preview:large' } },
        { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
        { tag: 'meta', attrs: { property: 'og:title', content: appTitle } },
        { tag: 'meta', attrs: { property: 'og:description', content: appDescription } },
        { tag: 'meta', attrs: { property: 'og:image', content: ogImageUrl } },
        ...(siteUrl ? [{ tag: 'meta', attrs: { property: 'og:url', content: siteUrl } }] : []),
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:title', content: appTitle } },
        { tag: 'meta', attrs: { name: 'twitter:description', content: appDescription } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: ogImageUrl } },
        { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
        ...(siteUrl ? [{ tag: 'link', attrs: { rel: 'canonical', href: siteUrl } }] : []),
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: JSON.stringify(jsonLd)
        }
      ];
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: [
          'User-agent: *',
          'Allow: /',
          siteUrl ? `Sitemap: ${siteUrl}/sitemap.xml` : ''
        ].filter(Boolean).join('\n') + '\n'
      });

      if (!siteUrl) {
        return;
      }

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: makeSitemap(siteUrl)
      });
    }
  };
}

function normalizeSiteUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().replace(/\/+$/, '');
}

function makeSitemap(siteUrl: string): string {
  const now = new Date().toISOString();
  const urls = appRoutes
    .map((route) => {
      return [
        '  <url>',
        `    <loc>${siteUrl}${route === '/' ? '' : route}</loc>`,
        `    <lastmod>${now}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        route === '/' ? '    <priority>1.0</priority>' : '    <priority>0.8</priority>',
        '  </url>'
      ].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    ''
  ].join('\n');
}

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
  const script = 'POSIX path of (choose folder with prompt "Select SVG source folder")';
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
