(function () {
  'use strict';

  const RUNNABLE_LANGS = ['python', 'javascript', 'js', 'html', 'css', 'sql'];
  let pyodide = null;
  let pyodidePromise = null;
  let sqlDb = null;
  let sqlJsPromise = null;

  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function detectLang(pre) {
    const code = pre.querySelector('code');
    if (!code) return '';
    const cls = code.className || '';
    const m = cls.match(/language-(\S+)/);
    return m ? m[1].toLowerCase() : (pre.dataset.lang || '');
  }

  function createToolbar(pre, lang) {
    const toolbar = document.createElement('div');
    toolbar.className = 'code-toolbar';

    const langLabel = document.createElement('span');
    langLabel.className = 'code-lang';
    langLabel.textContent = lang || 'code';
    toolbar.appendChild(langLabel);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = '复制';
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', () => copyCode(pre, copyBtn));
    toolbar.appendChild(copyBtn);

    if (RUNNABLE_LANGS.includes(lang)) {
      const runBtn = document.createElement('button');
      runBtn.className = 'run-btn';
      runBtn.type = 'button';
      runBtn.innerHTML = '<span>▶</span> <span>运行</span>';
      runBtn.addEventListener('click', () => runCode(pre, lang, runBtn));
      toolbar.appendChild(runBtn);
    }

    return toolbar;
  }

  function createOutput(pre) {
    let output = pre.nextElementSibling;
    if (!output || !output.classList.contains('code-output')) {
      output = document.createElement('div');
      output.className = 'code-output';
      pre.parentNode.insertBefore(output, pre.nextSibling);
    }
    output.innerHTML = '';
    output.classList.remove('error');
    output.classList.add('visible');
    return output;
  }

  function setOutput(output, content, isError) {
    output.innerHTML = content;
    if (isError) {
      output.classList.add('error');
    } else {
      output.classList.remove('error');
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function copyCode(pre, btn) {
    const code = pre.querySelector('code');
    const text = code ? code.textContent : '';
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => (btn.textContent = original), 1500);
    } catch (err) {
      btn.textContent = '复制失败';
      setTimeout(() => (btn.textContent = '复制'), 1500);
    }
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> <span>运行中</span>';
    } else {
      btn.disabled = false;
      btn.innerHTML = '<span>▶</span> <span>运行</span>';
    }
  }

  async function runCode(pre, lang, btn) {
    const output = createOutput(pre);
    const code = pre.querySelector('code').textContent;
    setLoading(btn, true);

    try {
      if (lang === 'python') {
        await runPython(code, output);
      } else if (lang === 'javascript' || lang === 'js') {
        runJavaScript(code, output);
      } else if (lang === 'html' || lang === 'css') {
        runHtmlCss(code, output, lang);
      } else if (lang === 'sql') {
        await runSql(code, output);
      } else {
        setOutput(output, '<span class="output-label">提示</span>暂不支持在浏览器中运行该语言代码。', false);
      }
    } catch (err) {
      setOutput(output, '<span class="output-label">错误</span>' + escapeHtml(String(err)), true);
    } finally {
      setLoading(btn, false);
    }
  }

  function getPyodide() {
    if (pyodide) return Promise.resolve(pyodide);
    if (!pyodidePromise) {
      pyodidePromise = (async () => {
        if (typeof window.loadPyodide !== 'function') {
          await loadScript('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');
        }
        let py;
        py = await window.loadPyodide({
          stdout: (text) => {
            if (py && py._captureStdout) py._captureStdout(text);
          },
          stderr: (text) => {
            if (py && py._captureStderr) py._captureStderr(text);
          },
        });
        pyodide = py;
        return py;
      })();
      // On failure clear the cached promise so the next click can retry,
      // instead of polling forever while "pyodideLoading" stays stuck.
      pyodidePromise.catch(() => {
        pyodidePromise = null;
      });
    }
    return pyodidePromise;
  }

  async function runPython(code, output) {
    output.innerHTML = '<span class="output-label">输出</span>正在加载 Python 运行环境（首次加载约需几秒）...';
    const py = await getPyodide();

    let stdout = '';
    let stderr = '';
    py._captureStdout = (text) => (stdout += text + '\n');
    py._captureStderr = (text) => (stderr += text + '\n');

    try {
      await py.loadPackagesFromImports(code);
      await py.runPythonAsync(code);
      const text = stdout || stderr || '（代码执行完毕，无输出）';
      const isError = !!stderr && !stdout;
      setOutput(output, '<span class="output-label">输出</span><pre>' + escapeHtml(text) + '</pre>', isError);
    } catch (err) {
      setOutput(output, '<span class="output-label">错误</span><pre>' + escapeHtml(String(err)) + '</pre>', true);
    } finally {
      py._captureStdout = null;
      py._captureStderr = null;
    }
  }

  function runJavaScript(code, output) {
    let result = '';
    const originalLog = console.log;
    const originalError = console.error;
    const logs = [];

    console.log = function (...args) {
      logs.push(args.map(String).join(' '));
    };
    console.error = function (...args) {
      logs.push('[error] ' + args.map(String).join(' '));
    };

    try {
      const fn = new Function(code);
      const ret = fn();
      if (ret !== undefined) {
        logs.push('=> ' + String(ret));
      }
      result = logs.join('\n') || '（代码执行完毕，无输出）';
      setOutput(output, '<span class="output-label">输出</span><pre>' + escapeHtml(result) + '</pre>', false);
    } catch (err) {
      setOutput(output, '<span class="output-label">错误</span><pre>' + escapeHtml(String(err)) + '</pre>', true);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  }

  function runHtmlCss(code, output, lang) {
    const label = '<span class="output-label">预览</span>';
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-scripts';
    output.innerHTML = label;
    output.appendChild(iframe);

    // Ensure HTML is complete; if it's CSS-only, wrap in a basic page
    let html = code;
    if (!/<html[\s>]/.test(html) && !/<body[\s>]/.test(html) && lang === 'css') {
      html = `<!DOCTYPE html><html><head><style>${code}</style></head><body><div class="css-preview">CSS 样式预览区域</div></body></html>`;
    } else if (!/<html[\s>]/.test(html) && !/<body[\s>]/.test(html)) {
      html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${code}</body></html>`;
    }

    iframe.srcdoc = html;
    // Auto-resize iframe height
    iframe.onload = function () {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        const height = Math.max(doc.body.scrollHeight + 20, 120);
        iframe.style.height = Math.min(height, 600) + 'px';
      } catch (e) {
        iframe.style.height = '300px';
      }
    };
  }

  function loadSqlJs() {
    if (sqlDb) return Promise.resolve(sqlDb);
    if (!sqlJsPromise) {
      sqlJsPromise = (async () => {
        if (typeof initSqlJs !== 'function') {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.min.js');
        }
        const SQL = await initSqlJs({
          locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`,
        });
        sqlDb = new SQL.Database();
        return sqlDb;
      })();
      // Allow retrying after a failed load instead of dead-ending.
      sqlJsPromise.catch(() => {
        sqlJsPromise = null;
      });
    }
    return sqlJsPromise;
  }

  async function runSql(code, output) {
    output.innerHTML = '<span class="output-label">输出</span>正在加载 SQL 运行环境...';
    const db = await loadSqlJs();

    try {
      const statements = code.split(';').map((s) => s.trim()).filter(Boolean);
      const results = [];

      for (const stmt of statements) {
        const res = db.exec(stmt + ';');
        if (res && res.length > 0) {
          res.forEach((r) => results.push(r));
        }
      }

      if (results.length === 0) {
        setOutput(output, '<span class="output-label">输出</span>SQL 执行成功（无结果集）', false);
        return;
      }

      let html = '<span class="output-label">结果</span>';
      results.forEach((r) => {
        html += '<table><thead><tr>';
        r.columns.forEach((col) => {
          html += `<th>${escapeHtml(String(col))}</th>`;
        });
        html += '</tr></thead><tbody>';
        r.values.forEach((row) => {
          html += '<tr>';
          row.forEach((cell) => {
            html += `<td>${escapeHtml(cell === null ? 'NULL' : String(cell))}</td>`;
          });
          html += '</tr>';
        });
        html += '</tbody></table>';
      });
      setOutput(output, html, false);
    } catch (err) {
      setOutput(output, '<span class="output-label">错误</span><pre>' + escapeHtml(String(err)) + '</pre>', true);
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('无法加载脚本: ' + src));
      document.head.appendChild(s);
    });
  }

  function init() {
    document.querySelectorAll('pre').forEach((pre) => {
      // Skip already processed
      if (pre.dataset.processed === 'true') return;
      pre.dataset.processed = 'true';

      const lang = detectLang(pre);
      pre.dataset.lang = lang;

      const toolbar = createToolbar(pre, lang);
      pre.insertBefore(toolbar, pre.firstChild);
    });

    // Highlight any unhighlighted code blocks
    if (typeof hljs !== 'undefined') {
      document.querySelectorAll('pre code').forEach((block) => {
        if (!block.dataset.highlighted) {
          try {
            hljs.highlightElement(block);
          } catch (e) {
            // Ignore highlight errors so the page remains usable
          }
        }
      });
    }
  }

  // Suppress non-fatal script errors from CDN dependencies in preview environments
  window.addEventListener('error', (e) => {
    if (e.filename && e.filename.includes('highlight')) {
      e.preventDefault();
    }
  });

  ready(init);
})();
