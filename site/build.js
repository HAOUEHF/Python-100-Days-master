const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const { execSync } = require('child_process');
const { marked } = require('marked');
const { markedHighlight } = require('marked-highlight');
const hljs = require('highlight.js');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(__dirname, 'dist');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');

const EXCLUDE_DIRS = new Set([
  'dist',
  'node_modules',
  '.git',
  '.codebuddy',
]);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function isMarkdown(file) {
  return file.toLowerCase().endsWith('.md');
}

function getLanguage(codeBlock) {
  const match = codeBlock.className && codeBlock.className.match(/language-(\S+)/);
  return match ? match[1].toLowerCase() : '';
}

function buildTree(dir, relativeTo = ROOT) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const children = [];

  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(relativeTo, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const childTree = buildTree(fullPath, relativeTo);
      if (childTree.children.length > 0) {
        children.push({
          name: entry.name,
          path: null,
          isDir: true,
          children: childTree.children,
        });
      }
    } else if (isMarkdown(entry.name)) {
      const htmlPath = relPath.replace(/\.md$/i, '.html');
      children.push({
        name: entry.name.replace(/\.md$/i, ''),
        path: htmlPath,
        isDir: false,
        children: [],
      });
    }
  }

  // Sort: directories first, then files; both alphabetically
  children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return { name: path.basename(dir), path: null, isDir: true, children };
}

function serializeTreeForTemplate(tree, basePath) {
  // href: site-root relative URL (leading "/") so it works from any page depth
  // canonicalPath: site-root relative path used to identify the current page
  function walk(node) {
    const rootPath = node.path && !node.path.startsWith('http')
      ? '/' + path.posix.normalize(node.path)
      : node.path;
    const canonicalPath = node.path && !node.path.startsWith('http')
      ? path.posix.normalize(node.path)
      : node.path;
    return {
      name: node.name,
      path: rootPath,
      canonicalPath,
      isDir: node.isDir,
      children: node.children.map(walk),
    };
  }
  return walk(tree);
}

function buildMarkdown(srcPath, relativePath, navTree) {
  const markdown = fs.readFileSync(srcPath, 'utf-8');

  const renderer = new marked.Renderer();
  const originalCode = renderer.code.bind(renderer);
  renderer.code = function (code, language, escaped) {
    const lang = (language || '').toLowerCase();
    const runSupported = ['python', 'javascript', 'js', 'html', 'css', 'sql'].includes(lang);
    const attrs = runSupported ? `data-runnable="true" data-lang="${lang}"` : `data-lang="${lang}"`;
    return `<pre ${attrs}><code class="language-${lang}">${escaped ? code : escapeHtml(code)}</code></pre>`;
  };

  renderer.link = function (href, title, text) {
    // Convert relative .md links to .html links; preserve other relative paths
    if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:')) {
      if (href.toLowerCase().endsWith('.md')) {
        href = href.replace(/\.md$/i, '.html');
      }
    }
    return `<a href="${href}"${title ? ` title="${title}"` : ''}>${text}</a>`;
  };

  renderer.image = function (href, title, text) {
    // Image paths in Markdown are already relative to the Markdown file.
    // Since HTML is generated in the same directory, keep paths unchanged.
    return `<img src="${href}" alt="${text}"${title ? ` title="${title}"` : ''}>`;
  };

  marked.setOptions({
    renderer,
    headerIds: true,
    gfm: true,
    breaks: false,
  });

  const htmlBody = marked.parse(markdown);

  const titleMatch = markdown.match(/^#+\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Python-100-Days';

  const depth = relativePath.split(/[\\/]/).length - 1;
  const basePath = depth > 0 ? Array(depth).fill('..').join('/') : '.';
  const htmlPath = relativePath.replace(/\.md$/i, '.html').replace(/\\/g, '/');
  const isHome = htmlPath === 'README.html';

  const resolvedNavTree = serializeTreeForTemplate(navTree, basePath);

  // IMPORTANT: use function replacements. A plain string replacement
  // interprets "$&", "$`", "$'" and "$1"-style sequences inside the
  // replacement (markdown content contains them, e.g. in regex/shell
  // lessons), which corrupted or duplicated whole chunks of the page.
  const html = TEMPLATE
    .replace(/\{\{TITLE\}\}/g, () => title)
    .replace(/\{\{BASE_PATH\}\}/g, () => basePath)
    .replace(/\{\{CONTENT\}\}/g, () => htmlBody)
    .replace(/\{\{HAS_SIDEBAR\}\}/g, () => (isHome ? 'false' : 'true'))
    .replace(/\{\{CURRENT_PATH\}\}/g, () => escapeHtml(htmlPath))
    .replace(/\{\{NAV_TREE\}\}/g, () => escapeHtml(JSON.stringify(resolvedNavTree)));

  const destPath = path.join(DIST, relativePath.replace(/\.md$/i, '.html'));
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, html, 'utf-8');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function walkDir(dir, callback, relativeTo = ROOT) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(relativeTo, fullPath);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walkDir(fullPath, callback, relativeTo);
    } else {
      callback(fullPath, relPath);
    }
  }
}

// Development-only files inside site/ that must not be copied into dist.
// Pages only reference runtime assets (styles.css, menu.js, runner.js,
// theme.js, vendor/); the raw template still containing {{PLACEHOLDERS}}
// and the build/test scripts would only confuse IDE previews that try
// to resolve every file under dist as a real page.
const SITE_DEV_FILES = new Set([
  'build.js',
  'serve.js',
  'template.html',
]);

function isSiteDevFile(relSlash) {
  if (!relSlash.startsWith('site/')) return false;
  const name = relSlash.split('/').pop();
  return SITE_DEV_FILES.has(name) || /^test-.*\.js$/.test(name);
}

function copyStaticAssets() {
  walkDir(ROOT, (fullPath, relPath) => {
    if (isMarkdown(fullPath)) return;
    if (isSiteDevFile(relPath.replace(/\\/g, '/'))) return;
    const ext = path.extname(fullPath).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.css', '.js', '.csv', '.sql', '.py', '.java', '.html'].includes(ext)) {
      copyFile(fullPath, path.join(DIST, relPath));
    }
  });
}

const VENDOR_ASSETS = [
  {
    name: 'highlight.min.js',
    url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js',
  },
  {
    name: 'github.min.css',
    url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github.min.css',
  },
  {
    name: 'github-dark.min.css',
    url: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css',
  },
  {
    name: 'pyodide.js',
    url: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js',
  },
  {
    name: 'sql-wasm.min.js',
    url: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.min.js',
  },
];

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(destPath, buf);
        resolve(buf.length);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout for ' + url)));
  });
}

async function downloadVendorAssets(vendorBackup) {
  const vendorDir = path.join(DIST, 'site', 'vendor');
  ensureDir(vendorDir);
  for (const asset of VENDOR_ASSETS) {
    const dest = path.join(vendorDir, asset.name);
    try {
      const bytes = await downloadFile(asset.url, dest);
      console.log('已下载依赖:', asset.name, '(' + Math.round(bytes / 1024) + ' KB)');
    } catch (e) {
      // Fall back to the previous build's copy so an offline rebuild
      // does not ship a site with missing highlight.js etc.
      const backupFile = vendorBackup ? path.join(vendorBackup, asset.name) : null;
      if (backupFile && fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, dest);
        console.log('下载失败，已复用上一次构建的', asset.name, '-', e.message);
      } else {
        console.warn('下载失败（页面将降级运行）:', asset.name, '-', e.message);
      }
    }
  }
}

// Back up the existing vendor dir before dist is wiped clean, so a
// rebuild without network access can still restore the libraries.
function backupVendorAssets() {
  const vendorDir = path.join(DIST, 'site', 'vendor');
  if (!fs.existsSync(vendorDir)) return null;
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p100d-vendor-'));
  fs.cpSync(vendorDir, backupDir, { recursive: true });
  return backupDir;
}

function build() {
  console.log('开始构建站点...');
  ensureDir(DIST);

  // Back up vendor libraries before the dist directory is wiped clean
  const vendorBackup = backupVendorAssets();

  // Clean dist using a shell command to avoid Node fs bulk-delete guards
  if (fs.existsSync(DIST)) {
    if (process.platform === 'win32') {
      execSync(`rmdir /s /q "${DIST}"`);
    } else {
      execSync(`rm -rf "${DIST}"`);
    }
  }
  ensureDir(DIST);

  // Build navigation tree from markdown files
  const navTree = buildTree(ROOT);

  // Build markdown files
  walkDir(ROOT, (fullPath, relPath) => {
    if (isMarkdown(fullPath)) {
      buildMarkdown(fullPath, relPath, navTree);
      console.log('已生成:', relPath.replace(/\\/g, '/'));
    }
  });

  // Copy static assets
  copyStaticAssets();

  // Create index redirect to README
  const indexHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=README.html">
  <title>Python-100-Days</title>
</head>
<body>
  <p>正在跳转至 <a href="README.html">README.html</a>...</p>
</body>
</html>`;
  fs.writeFileSync(path.join(DIST, 'index.html'), indexHtml, 'utf-8');

  // Download vendor libraries (highlight.js etc.) so the site works offline
  downloadVendorAssets(vendorBackup).then(() => {
    console.log('构建完成，输出目录:', DIST);
    if (vendorBackup) {
      fs.rmSync(vendorBackup, { recursive: true, force: true });
    }
  });
}

build();
