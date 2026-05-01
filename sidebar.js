/**
 * sidebar.js
 * Platform-wide collapsible left sidebar.
 * All styles live in staxai-auth.css. Loaded on every authenticated page after topbar.js.
 */
(function() {
  'use strict';

  var SIDEBAR_NAV = [
    { type: 'standalone', id: 'cl', label: 'Content Library', icon: '📚', url: '/content-library.html' },
    { type: 'category', label: 'Marketing', items: [
      { id: 'social',     label: 'Marketing & Social', icon: '📱', url: '/social' },
      { id: 'chatbot',    label: 'Website Chatbot',    icon: '💬', url: '/chatbot' },
      { id: 'design-viz', label: 'Design Visualiser',  icon: '🎨', url: '/design' }
    ]},
    { type: 'category', label: 'Operations', items: [
      { id: 'email', label: 'Email Assistant', icon: '📧', url: '/email' }
    ]},
    { type: 'category', label: 'Business Intelligence', items: [
      { id: 'strategic-plan', label: 'Strategic Plan',         icon: '📝', url: '/strategy' },
      { id: 'news-digest',    label: 'Industry News Digest',   icon: '📰', url: '/news' },
      { id: 'bi',             label: 'BI Dashboard',           icon: '🧠', url: '/bi.html' }
    ]}
  ];

  var COLLAPSED_KEY = 'stax_sidebar_collapsed';
  var MOBILE_OPEN = false;

  function isCollapsed() {
    try { return sessionStorage.getItem(COLLAPSED_KEY) === '1'; } catch (e) { return false; }
  }

  function setCollapsed(v) {
    try { sessionStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function currentPath() {
    var p = window.location.pathname;
    if (!p) return '';
    return p.replace(/\.html$/, '').replace(/\/$/, '').toLowerCase();
  }

  function isActive(url) {
    var u = url.replace(/\.html$/, '').replace(/\/$/, '').toLowerCase();
    return u === currentPath();
  }

  function buildHtml() {
    var html = '<aside class="stax-sidebar" id="stax-sidebar" aria-label="Tool navigation">';
    html += '<div class="stax-sidebar-toggle">';
    html += '<button type="button" class="stax-sidebar-toggle-btn" id="stax-sidebar-toggle-btn" aria-label="Collapse sidebar" title="Collapse">&laquo;</button>';
    html += '</div>';
    html += '<nav class="stax-sidebar-nav">';

    SIDEBAR_NAV.forEach(function(group) {
      if (group.type === 'standalone') {
        html += itemHtml(group);
        html += '<div class="stax-sidebar-divider"></div>';
      } else if (group.type === 'category') {
        html += '<div class="section-label">' + window.escHtml(group.label) + '</div>';
        group.items.forEach(function(item) { html += itemHtml(item); });
      }
    });

    html += '</nav>';
    html += '</aside>';
    html += '<div class="stax-sidebar-backdrop" id="stax-sidebar-backdrop"></div>';
    return html;
  }

  function itemHtml(item) {
    var active = isActive(item.url) ? ' active' : '';
    return '<a href="' + window.escHtml(item.url) + '" class="stax-sidebar-item' + active + '" data-tool="' + window.escHtml(item.id) + '" title="' + window.escHtml(item.label) + '">'
      + '<span class="stax-sidebar-icon" aria-hidden="true">' + item.icon + '</span>'
      + '<span class="stax-sidebar-label">' + window.escHtml(item.label) + '</span>'
      + '</a>';
  }

  function applyCollapsed(collapsed) {
    var sb = document.getElementById('stax-sidebar');
    if (!sb) return;
    if (collapsed) {
      sb.classList.add('collapsed');
      document.body.classList.add('stax-sidebar-collapsed');
    } else {
      sb.classList.remove('collapsed');
      document.body.classList.remove('stax-sidebar-collapsed');
    }
    var btn = document.getElementById('stax-sidebar-toggle-btn');
    if (btn) {
      btn.innerHTML = collapsed ? '&raquo;' : '&laquo;';
      btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      btn.setAttribute('title', collapsed ? 'Expand' : 'Collapse');
    }
  }

  function wireEvents() {
    var btn = document.getElementById('stax-sidebar-toggle-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        var sidebar = document.getElementById('stax-sidebar');
        var nowCollapsed = !sidebar.classList.contains('collapsed');
        // Clear transient hover state so the click result is authoritative —
        // otherwise `hover-expanded` overrides can leave the visual stuck.
        sidebar.classList.remove('hover-expanded');
        setCollapsed(nowCollapsed);
        applyCollapsed(nowCollapsed);
      });
    }

    var hamburger = document.getElementById('stax-sidebar-hamburger');
    var backdrop = document.getElementById('stax-sidebar-backdrop');
    var sb = document.getElementById('stax-sidebar');

    function closeMobile() {
      MOBILE_OPEN = false;
      if (sb) sb.classList.remove('mobile-open');
      if (backdrop) backdrop.classList.remove('open');
    }
    function openMobile() {
      MOBILE_OPEN = true;
      if (sb) sb.classList.add('mobile-open');
      if (backdrop) backdrop.classList.add('open');
    }

    if (hamburger) {
      hamburger.addEventListener('click', function(e) {
        e.stopPropagation();
        if (MOBILE_OPEN) closeMobile(); else openMobile();
      });
    }
    if (backdrop) backdrop.addEventListener('click', closeMobile);

    document.querySelectorAll('.stax-sidebar-item').forEach(function(a) {
      a.addEventListener('click', function() {
        if (window.innerWidth <= 900) closeMobile();
      });
    });

    // Hover-expand on desktop — visually widens a collapsed sidebar while the
    // cursor is over it, without changing body padding (content stays put).
    // The persistent collapsed state from the toggle button is unaffected;
    // hover is an additive transient override.
    if (sb) {
      sb.addEventListener('mouseenter', function() {
        if (window.innerWidth <= 900) return;
        sb.classList.add('hover-expanded');
      });
      sb.addEventListener('mouseleave', function() {
        sb.classList.remove('hover-expanded');
      });
    }
  }

  function injectHamburger() {
    var topbar = document.querySelector('.topbar');
    if (!topbar) return;
    if (document.getElementById('stax-sidebar-hamburger')) return;
    var btn = document.createElement('button');
    btn.id = 'stax-sidebar-hamburger';
    btn.className = 'stax-sidebar-hamburger';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open navigation');
    btn.innerHTML = '&#9776;';
    topbar.insertBefore(btn, topbar.firstChild);
  }

  function init() {
    var mount = document.createElement('div');
    mount.innerHTML = buildHtml();
    while (mount.firstChild) document.body.insertBefore(mount.firstChild, document.body.firstChild);

    document.body.classList.add('stax-has-sidebar');
    injectHamburger();
    applyCollapsed(isCollapsed());
    wireEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
