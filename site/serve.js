const http = require('http');
const fs = require('fs');
const path = require('path');

const START_PORT = process.env.PORT || 3000;
const MAX_PORT = START_PORT + 20;
const DIST = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.csv': 'text/csv',
  '.sql': 'text/plain',
  '.py': 'text/plain',
  '.java': 'text/plain',
  '.md': 'text/plain',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function sanitizePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (e) {
    return null; // malformed URL (e.g. invalid % escape) — do not crash the server
  }
  const withoutLeadingSlash = decoded.replace(/^[\/\\]+/, '');
  const normalized = path.normalize(withoutLeadingSlash).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(DIST, normalized);
  // Final guard: the resolved path must stay inside DIST
  if (path.relative(DIST, filePath).startsWith('..')) return null;
  return filePath;
}

function sendError(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function resolveRequestedFile(urlPath, callback) {
  const filePath = sanitizePath(urlPath);
  if (!filePath) return callback(null);

  fs.stat(filePath, (err, stat) => {
    if (err) return callback(null);

    if (stat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      return fs.stat(indexPath, (idxErr, idxStat) => {
        if (idxErr || !idxStat.isFile()) return callback(null);
        return callback(indexPath);
      });
    }

    if (!stat.isFile()) return callback(null);
    return callback(filePath);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method Not Allowed');
    return;
  }

  const urlPath = (req.url || '/').split('?')[0].split('#')[0];
  resolveRequestedFile(urlPath === '/' ? '/index.html' : urlPath, (filePath) => {
    if (!filePath) {
      sendError(res, 404, '404 Not Found');
      return;
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      res.end();
      return;
    }

    // Stream the file asynchronously. readFileSync used to block the
    // event loop, serializing every request and keeping the browser
    // spinner going while large assets were served.
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        sendError(res, 500, '500 Internal Server Error');
      } else {
        res.end();
      }
    });
    stream.on('open', () => {
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    });
    stream.pipe(res);
  });
});

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

function tryListen(port) {
  // Use once() so failed listens never stack up error handlers on the
  // same server instance — stacking them multiplied the retries
  // (2, 4, 8...) on every EADDRINUSE and leaked listeners.
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < MAX_PORT) {
      console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}...`);
      tryListen(port + 1);
    } else if (err.code === 'EADDRINUSE') {
      console.error(`无法找到可用端口（已尝试 ${START_PORT}~${MAX_PORT}）`);
      process.exit(1);
    } else {
      console.error('服务器启动失败:', err);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    // Listening succeeded: replace the retry handler with a runtime
    // error logger so no stale retry logic stays attached.
    server.removeAllListeners('error');
    server.on('error', (err) => console.error('服务器运行错误:', err.message));
    console.log(`站点已启动: http://localhost:${port}`);
  });
}

tryListen(START_PORT);
