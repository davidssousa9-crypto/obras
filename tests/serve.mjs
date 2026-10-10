import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Dev-only static file server for the Playwright verification harness.
 * Serves the repo root on an ephemeral port with no-store caching.
 */
export function createStaticServer(root) {
  const rootNorm = normalize(root).replace(/[\\/]+$/, '');
  const server = createServer(async (req, res) => {
    let filePath;
    try {
      const url = new URL(req.url, 'http://localhost');
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      filePath = normalize(join(rootNorm, pathname));
      if (filePath !== rootNorm && !filePath.startsWith(rootNorm + sep)) {
        res.writeHead(403, { 'Cache-Control': 'no-store' });
        res.end('Forbidden');
        return;
      }
    } catch {
      res.writeHead(400, { 'Cache-Control': 'no-store' });
      res.end('Bad request');
      return;
    }
    try {
      const data = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        baseURL: `http://127.0.0.1:${port}/`,
        close: () => new Promise((res) => server.close(res)),
      });
    });
  });
}