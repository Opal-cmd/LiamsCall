/**
 * Shared sidebar collapse/expand for content pages, blog, and chat shell.
 * Persists preference in localStorage. Desktop only — mobile keeps its drawer.
 */
(function () {
  var KEY = 'lc-sidebar-collapsed';
  var mq = window.matchMedia('(max-width: 767px)');
  var pageShell = document.querySelector('.page-shell');
  var chatShell = document.getElementById('chat-shell');
  var toggle = document.getElementById('sidebar-collapse-toggle');
  if (!toggle) return;

  function targetShell() {
    if (pageShell) return pageShell;
    if (chatShell && chatShell.classList.contains('is-expanded')) return chatShell;
    return chatShell || null;
  }

  function setCollapsed(collapsed) {
    var shell = targetShell();
    if (!shell) return;
    shell.classList.toggle('is-sidebar-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    );
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch (err) {
      /* ignore */
    }
  }

  function readPref() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  function applyForViewport() {
    if (mq.matches) {
      // Mobile drawer owns the sidebar — clear desktop collapse state visually.
      if (pageShell) pageShell.classList.remove('is-sidebar-collapsed');
      if (chatShell) chatShell.classList.remove('is-sidebar-collapsed');
      toggle.setAttribute('aria-expanded', 'true');
      return;
    }
    setCollapsed(readPref());
  }

  toggle.addEventListener('click', function () {
    if (mq.matches) return;
    var shell = targetShell();
    if (!shell) return;
    setCollapsed(!shell.classList.contains('is-sidebar-collapsed'));
  });

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', applyForViewport);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(applyForViewport);
  }

  applyForViewport();
})();
