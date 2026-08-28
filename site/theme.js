(function () {
  'use strict';

  var STORAGE_KEY = 'theme-preference';
  var root = document.documentElement;

  function getStoredTheme() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);

    // Swap the highlight.js color scheme together with the page theme.
    // The `disabled` property of <link> is the standard way to toggle
    // stylesheets on and off at runtime.
    var light = document.getElementById('hljs-light');
    var dark = document.getElementById('hljs-dark');
    if (light) light.disabled = theme === 'dark';
    if (dark) dark.disabled = theme !== 'dark';

    var toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.title = theme === 'dark' ? '切换到白天主题' : '切换到夜间主题';
      toggle.setAttribute('aria-label', toggle.title);
    }
  }

  // The inline <head> script already set data-theme before first paint;
  // sync the highlight stylesheets and button label with it.
  applyTheme(currentTheme());

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) { /* ignore */ }
      applyTheme(next);
    });
  }

  // Follow OS-level theme changes while the user has not made an
  // explicit choice in this site.
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mq) {
    var onChange = function (e) {
      if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
    } else if (typeof mq.addListener === 'function') {
      mq.addListener(onChange);
    }
  }
})();
