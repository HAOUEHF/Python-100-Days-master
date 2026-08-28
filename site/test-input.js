const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'dist', 'Day01-20', '07.分支和循环结构实战.html');
const runnerPath = path.join(__dirname, 'runner.js');
const runnerCode = fs.readFileSync(runnerPath, 'utf-8');

const html = fs.readFileSync(htmlPath, 'utf-8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost:3000/Day01-20/02.第一个Python程序.html',
  beforeParse(window) {
    // Fake pyodide: records every runPythonAsync call and setStdin call.
    window.__pyCalls = [];
    window.__stdinOpts = null;
    window.loadPyodide = async () => {
      const fake = {
        async runPythonAsync(code) {
          window.__pyCalls.push(code);
          // When user code starts running, the output area must still
          // show the "code needs input" hint (it gets replaced by the
          // result only after execution finishes).
          if (window.__pyCalls.length === 2 && typeof window.__snapshotOutput === 'function') {
            window.__outputAtRun = window.__snapshotOutput();
          }
        },
        async loadPackagesFromImports() {},
        setStdin(opts) {
          window.__stdinOpts = opts;
        },
      };
      return fake;
    };
    // Stub prompt so the init code path runs without a real dialog.
    let promptCount = 0;
    window.prompt = (msg) => {
      promptCount++;
      window.__lastPromptMsg = msg;
      return '12345'; // simulated user input
    };
    window.__promptCount = () => promptCount;
  },
});

const win = dom.window;
const doc = win.document;

// Boot the runner the same way the page does.
win.eval(runnerCode);

// jsdom parses asynchronously: fire DOMContentLoaded so runner.js's
// ready() callback adds the toolbars/run buttons to the code blocks.
if (doc.readyState === 'loading') {
  doc.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true }));
}

let failed = 0;
function check(name, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + name);
  if (!cond) failed++;
}

(async () => {
  // Give the runner's init a tick to create the toolbars.
  await new Promise((r) => setTimeout(r, 100));

  // Find a python code block with input() in the generated page.
  const pre = Array.from(doc.querySelectorAll('pre[data-lang="python"]'))
    .find((p) => /\binput\s*\(/.test(p.querySelector('code').textContent));
  check('测试页包含带 input() 的 Python 代码块', !!pre);
  if (!pre) {
    console.log('❌ 无法继续测试');
    process.exit(1);
  }

  const runBtn = pre.querySelector('.run-btn');
  win.__snapshotOutput = () => {
    const out = doc.querySelector('.code-output.visible');
    return out ? out.textContent : '';
  };
  runBtn.click();

  // Wait for the async run to settle.
  await new Promise((r) => setTimeout(r, 300));

  const initCode = win.__pyCalls[0] || '';
  check('初始化时注入了 input() 覆盖代码', initCode.includes('builtins.input = _browser_input'));
  check('覆盖代码用 window.prompt 实现输入', initCode.includes('window.prompt'));
  check('取消输入时抛出 EOFError', initCode.includes('EOFError'));
  check('已设置 sys.stdin 兜底 (setStdin)', !!win.__stdinOpts && typeof win.__stdinOpts.stdin === 'function');

  const userCode = win.__pyCalls[1] || '';
  check('用户代码随后被执行', /\binput\s*\(/.test(userCode));

  const output = pre.nextElementSibling;
  check('用户代码执行时输出区显示输入提示', /输入/.test(win.__outputAtRun || ''));
  check('执行完成后输出区显示运行结果', /（代码执行完毕，无输出）/.test(output.textContent));

  // sys.stdin fallback returns the prompt() result.
  check('sys.stdin 兜底读取返回输入值', win.__stdinOpts.stdin() === '12345');

  console.log(failed === 0 ? '\ninput() 支持测试全部通过' : '\n存在 ' + failed + ' 项失败');
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试异常:', e);
  process.exit(1);
});
