// studio/server.js — Local development server
// Serves the IaC Studio and provides file read/write API for the editor

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT     = 3333;
const STUDIO   = __dirname;
const ROOT     = path.resolve(__dirname, '..');  // Repo root

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // --- API: List terraform files ---
  if (url.pathname === '/api/files' && req.method === 'GET') {
    const files = walkTfFiles(ROOT);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(files));
    return;
  }

  // --- API: Read a file ---
  if (url.pathname === '/api/read' && req.method === 'GET') {
    const file = url.searchParams.get('file');
    const full = path.resolve(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(fs.readFileSync(full, 'utf8'));
    return;
  }

  // --- API: Save a file ---
  if (url.pathname === '/api/save' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { file, content } = JSON.parse(body);
        const full = path.resolve(ROOT, file);
        if (!full.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

  // --- Static files ---
  let filePath = path.join(STUDIO, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const ext  = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

function walkTfFiles(dir, base = '') {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.terraform', 'node_modules', '.git'].includes(entry.name)) continue;
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) { results.push(...walkTfFiles(path.join(dir, entry.name), rel)); }
    else if (entry.name.endsWith('.tf') || entry.name.endsWith('.tfvars') || entry.name.endsWith('.sh')) { results.push(rel); }
  }
  return results;
}

server.listen(PORT, () => {
  console.log(`\n⬡  IaC Studio running at http://localhost:${PORT}\n`);
});
