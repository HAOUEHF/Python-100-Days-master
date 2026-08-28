const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, 'dist', 'Day01-20', '02.第一个Python程序.html');
const themePath = path.join(__dirname, 'theme.js');
const themeCode = fs.readFileSync(themePath, 'utf-8');

const html = fs.readFileSync(htmlPath, 'utf-8');

// jsdom does not implement window.matchMedia; theme.js must treat that
// as "no system preference" and default to the light theme.
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost:3000/Day01-20/02.第一个Python程序.html',
});

const win = dom.window;
const doc = win.document;
let failed = 0;

function check(name, cond) {
  console.log((cond ? '✅' : '❌') + ' ' + name);
  if (!cond) failed++;
}

// The inline <head> script should have run during parsing (empty
// localStorage + no matchMedia -> light theme).
check('内联脚本默认应用浅色主题 (data-theme=light)',
  doc.documentElement.getAttribute('data-theme') === 'light');

// Evaluate theme.js and verify initialization
win.eval(themeCode);

const lightLink = doc.getElementById('hljs-light');
const darkLink = doc.getElementById('hljs-dark');
check('浅色模式下 hljs 亮色样式表启用', lightLink && lightLink.disabled === false);
check('浅色模式下 hljs 暗色样式表禁用', darkLink && darkLink.disabled === true);
check('主题切换按钮存在', !!doc.querySelector('.theme-toggle'));
check('浅色模式按钮提示为切换到夜间',
  doc.querySelector('.theme-toggle').title === '切换到夜间主题');

// Click the toggle -> dark theme
doc.querySelector('.theme-toggle').click();
check('点击后切换为深色主题 (data-theme=dark)',
  doc.documentElement.getAttribute('data-theme') === 'dark');
check('深色主题已写入 localStorage',
  win.localStorage.getItem('theme-preference') === 'dark');
check('深色模式下 hljs 亮色样式表禁用', lightLink.disabled === true);
check('深色模式下 hljs 暗色样式表启用', darkLink.disabled === false);
check('深色模式按钮提示为切换到白天',
  doc.querySelector('.theme-toggle').title === '切换到白天主题');

// Click again -> back to light
doc.querySelector('.theme-toggle').click();
check('再次点击恢复浅色主题',
  doc.documentElement.getAttribute('data-theme') === 'light');
check('localStorage 同步更新为 light',
  win.localStorage.getItem('theme-preference') === 'light');

// Simulate a fresh visit with a saved dark preference: the inline head
// script must apply dark before theme.js runs.
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost:3000/Day01-20/02.第一个Python程序.html',
  beforeParse(window) {
    window.localStorage.setItem('theme-preference', 'dark');
  },
});
check('保存过偏好后新页面直接应用深色主题',
  dom2.window.document.documentElement.getAttribute('data-theme') === 'dark');

console.log(failed === 0 ? '\n主题功能测试全部通过' : '\n存在 ' + failed + ' 项失败');
process.exit(failed === 0 ? 0 : 1);
