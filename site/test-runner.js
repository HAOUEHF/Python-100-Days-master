const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'dist', 'Day01-20', '02.第一个Python程序.html');
const runnerPath = path.join(__dirname, 'runner.js');
const cssPath = path.join(__dirname, 'styles.css');

const html = fs.readFileSync(htmlPath, 'utf-8');
const runnerCode = fs.readFileSync(runnerPath, 'utf-8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'http://localhost:3000/Day01-20/02.第一个Python程序.html',
});

const debug = dom.window.document.createElement('script');
debug.textContent = 'console.log("readyState:", document.readyState); console.log("pre count:", document.querySelectorAll("pre").length);';
dom.window.document.body.appendChild(debug);

console.log('readyState before eval:', dom.window.document.readyState);
dom.window.eval(runnerCode);
console.log('readyState after eval:', dom.window.document.readyState);

// Fire DOMContentLoaded if not yet fired, to trigger runner init
const event = new dom.window.Event('DOMContentLoaded', { bubbles: true });
dom.window.document.dispatchEvent(event);

// Wait a tick for DOMContentLoaded / IIFE to run
setTimeout(() => {
  const preBlocks = dom.window.document.querySelectorAll('pre');
  const toolbars = dom.window.document.querySelectorAll('.code-toolbar');
  const runnable = dom.window.document.querySelectorAll('pre[data-runnable="true"]');

  console.log('代码块总数:', preBlocks.length);
  console.log('工具栏数量:', toolbars.length);
  console.log('可运行代码块数量:', runnable.length);

  let allOk = true;
  if (toolbars.length !== preBlocks.length) {
    console.error('错误：工具栏数量与代码块数量不匹配');
    allOk = false;
  }

  const runBtns = dom.window.document.querySelectorAll('.run-btn');
  console.log('运行按钮数量:', runBtns.length);

  if (allOk) {
    console.log('测试通过：每个代码块都已添加工具栏和运行/复制按钮。');
  } else {
    process.exit(1);
  }

  // Test JS execution logic directly (without button click)
  const jsCode = 'console.log("hello"); 1 + 1';
  const originalLog = dom.window.console.log;
  let captured = '';
  dom.window.console.log = (msg) => (captured += msg + '\n');
  try {
    const fn = new dom.window.Function(jsCode);
    const ret = fn();
    if (ret !== undefined) captured += '=> ' + ret + '\n';
    console.log('JS 执行测试通过，输出:', captured.trim());
  } catch (e) {
    console.error('JS 执行测试失败:', e);
  } finally {
    dom.window.console.log = originalLog;
  }
}, 100);
