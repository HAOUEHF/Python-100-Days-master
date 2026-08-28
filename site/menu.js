(function () {
  'use strict';

  const body = document.body;
  const hasSidebar = body.dataset.hasSidebar === 'true';
  const currentPath = body.dataset.currentPath || '';
  const basePath = body.dataset.basePath || '';
  const navTreeJson = body.dataset.navTree;

  // Resolve a site-root relative path (e.g. "Day01-20/03.xx.html")
  // to an absolute URL based on the current page's base path.
  // Works for both root and sub-path (GitHub Pages) deployments and
  // avoids relying on ".." relative resolution which can fail.
  function resolveHref(canonicalPath) {
    if (!canonicalPath) return '#';
    const base = basePath === '.' ? '' : (basePath.replace(/\/$/, '') + '/');
    // Build an absolute URL so navigation never depends on relative ".." parsing.
    return new URL(base + canonicalPath, location.origin + '/').href;
  }

  if (!hasSidebar || !navTreeJson) {
    body.classList.add('no-sidebar');
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
    const toggle = document.querySelector('.sidebar-toggle');
    if (toggle) toggle.style.display = 'none';
    return;
  }

  let navTree;
  try {
    navTree = JSON.parse(navTreeJson);
  } catch (e) {
    console.error('无法解析导航树:', e);
    return;
  }

  const menu = document.getElementById('tree-menu');
  const sidebar = document.getElementById('sidebar');
  const toggle = document.querySelector('.sidebar-toggle');
  const STORAGE_KEY = 'sidebar-collapsed';

  function normalizePath(p) {
    return p ? p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/#.*$/, '') : '';
  }

  function isCurrent(path) {
    return normalizePath(path) === normalizePath(currentPath);
  }

  function createTreeNode(node, level) {
    const item = document.createElement('div');
    item.className = 'tree-node' + (node.isDir ? ' tree-dir' : ' tree-file');
    item.dataset.level = level;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.style.paddingLeft = (level * 14 + 8) + 'px';

    const isCurrentFile = !node.isDir && isCurrent(node.canonicalPath || node.path);

    if (node.isDir) {
      const expander = document.createElement('span');
      expander.className = 'tree-expander';
      expander.innerHTML = '▶';
      expander.setAttribute('aria-label', '展开/收起');
      expander.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNode(item);
      });
      row.appendChild(expander);

      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.name;
      row.appendChild(label);

      row.addEventListener('click', () => toggleNode(item));
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-spacer';
      row.appendChild(spacer);

      const link = document.createElement('a');
      link.className = 'tree-link' + (isCurrentFile ? ' is-current' : '');
      link.href = resolveHref(node.canonicalPath || node.path);
      link.textContent = node.name;
      if (isCurrentFile) {
        link.setAttribute('aria-current', 'page');
      }
      row.appendChild(link);
    }

    item.appendChild(row);

    if (node.isDir && node.children && node.children.length > 0) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      node.children.forEach((child) => {
        children.appendChild(createTreeNode(child, level + 1));
      });
      item.appendChild(children);
    }

    return item;
  }

  function toggleNode(item, forceState) {
    const isExpanded = item.classList.contains('expanded');
    const shouldExpand = forceState !== undefined ? forceState : !isExpanded;
    item.classList.toggle('expanded', shouldExpand);
    item.classList.toggle('collapsed', !shouldExpand);
  }

  function expandToCurrent() {
    const currentLink = menu.querySelector('.tree-link.is-current');
    if (!currentLink) return;

    // Walk up the DOM from the current link and expand every ancestor
    // directory. Note: closest() also matches the element itself, so it
    // must never be called on a node that already is a .tree-children —
    // doing so returned the same element forever and froze the page.
    let el = currentLink.parentElement;
    while (el && el !== menu) {
      if (el.classList.contains('tree-dir')) {
        toggleNode(el, true);
      }
      el = el.parentElement;
    }

    // Scroll current item into view (guarded: jsdom/older browsers
    // don't implement scrollIntoView)
    setTimeout(() => {
      if (typeof currentLink.scrollIntoView === 'function') {
        currentLink.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }, 0);
  }

  function render() {
    if (!navTree || !navTree.children) return;
    navTree.children.forEach((child) => {
      menu.appendChild(createTreeNode(child, 0));
    });
  }

  function initSidebarToggle() {
    if (!toggle || !sidebar) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
      body.classList.add('sidebar-collapsed');
    }

    toggle.addEventListener('click', () => {
      body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(STORAGE_KEY, body.classList.contains('sidebar-collapsed'));
    });
  }

  render();
  expandToCurrent();
  initSidebarToggle();
})();
