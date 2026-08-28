const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const innerHtmlPath = path.join(__dirname, 'dist', 'Day01-20', '02.第一个Python程序.html');
const homeHtmlPath = path.join(__dirname, 'dist', 'README.html');
const menuPath = path.join(__dirname, 'menu.js');
const menuCode = fs.readFileSync(menuPath, 'utf-8');

function testPage(htmlPath, expectSidebar) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost:3000/' + path.relative(path.join(__dirname, 'dist'), htmlPath).replace(/\\/g, '/'),
  });

  dom.window.eval(menuCode);

  const body = dom.window.document.body;
  const hasSidebar = body.classList.contains('no-sidebar') === false;
  const menu = dom.window.document.getElementById('tree-menu');
  const nodes = menu ? menu.querySelectorAll('.tree-node') : [];
  const currentLink = menu ? menu.querySelector('.tree-link.is-current') : null;
  const expandedDirs = menu ? menu.querySelectorAll('.tree-dir.expanded') : [];

  console.log('\n测试页面:', path.basename(htmlPath));
  console.log('期望有侧边栏:', expectSidebar, '| 实际:', hasSidebar);
  console.log('树节点数量:', nodes.length);
  console.log('当前选中项:', currentLink ? currentLink.textContent : '无');
  console.log('已展开目录数:', expandedDirs.length);

  const ok = hasSidebar === expectSidebar &&
    (!expectSidebar || (currentLink && expandedDirs.length > 0));

  if (ok) {
    console.log('✅ 通过');
  } else {
    console.log('❌ 失败');
    process.exitCode = 1;
  }
}

testPage(homeHtmlPath, false);
testPage(innerHtmlPath, true);
