(function() {
  var _ab = document.getElementById("account-btn");
  var _dd = document.getElementById("account-dropdown");
  if (_ab && _dd) {
    _ab.addEventListener("click", function(e) {
      e.stopPropagation();
      _dd.classList.toggle("open");
    });
    document.addEventListener("click", function() {
      _dd.classList.remove("open");
    });
  }

  var _sb = document.getElementById("sign-out-btn");
  if (_sb) _sb.addEventListener("click", async function() {
    await supabaseClient.auth.signOut();
    window.location.href = "/login";
  });

  // ── TAB STATE MANAGEMENT ──
  // Detects tabs on the page, restores from hash or sessionStorage on load,
  // updates hash and sessionStorage on switch. Stores tab state before
  // topbar navigation so returning to a page restores the last active tab.
  // Supports: .stab[data-tab], .settings-tab[data-tab], .ptab[onclick]
  (function() {
    var storageKey = 'tab_state:' + window.location.pathname;
    var hasTabs = false;

    // Detect which tab system is present
    var stabTabs = document.querySelectorAll('.stab[data-tab]');
    var settingsTabs = document.querySelectorAll('.settings-tab[data-tab]');
    var ptabTabs = document.querySelectorAll('.ptab[onclick]');

    if (stabTabs.length > 0) {
      hasTabs = true;
      initHashTabs(stabTabs, function(tab) { return tab.getAttribute('data-tab'); });
    } else if (settingsTabs.length > 0) {
      hasTabs = true;
      initHashTabs(settingsTabs, function(tab) { return tab.getAttribute('data-tab'); });
    } else if (ptabTabs.length > 0) {
      hasTabs = true;
      initHashTabsPtab(ptabTabs);
    }

    // Store current tab state when any topbar link is clicked
    if (hasTabs) {
      document.querySelectorAll('.topbar a, .topbar-nav a, .topbar-nav-link').forEach(function(link) {
        link.addEventListener('click', function() {
          var hash = window.location.hash.replace('#', '');
          if (hash) {
            try { sessionStorage.setItem(storageKey, hash); } catch (e) {}
          }
        });
      });
    }

    function saveTabState(id) {
      if (id) {
        history.replaceState(null, '', '#' + id);
        try { sessionStorage.setItem(storageKey, id); } catch (e) {}
      }
    }

    // data-tab based systems (stab, settings-tab)
    function initHashTabs(tabs, getId) {
      // Restore: hash first, then sessionStorage
      var hash = window.location.hash.replace('#', '');
      var stored = '';
      try { stored = sessionStorage.getItem(storageKey) || ''; } catch (e) {}
      var restoreId = hash || stored;
      if (restoreId) {
        tabs.forEach(function(tab) {
          if (getId(tab) === restoreId) tab.click();
        });
      }
      // Update on tab switch
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          saveTabState(getId(tab));
        });
      });
    }

    // ptab onclick system (content-library)
    function initHashTabsPtab(tabs) {
      function getTabName(tab) {
        if (tab.dataset && tab.dataset.tab) return tab.dataset.tab;
        var onclick = tab.getAttribute('onclick') || '';
        var match = onclick.match(/switchPTab\(['"]([^'"]+)['"]\)/);
        return match ? match[1] : null;
      }
      // Restore: hash first, then sessionStorage
      var hash = window.location.hash.replace('#', '');
      var stored = '';
      try { stored = sessionStorage.getItem(storageKey) || ''; } catch (e) {}
      var restoreId = hash || stored;
      if (restoreId && typeof window.switchPTab === 'function') {
        var found = false;
        tabs.forEach(function(tab) {
          if (getTabName(tab) === restoreId) found = true;
        });
        if (found) window.switchPTab(restoreId);
      }
      // Update on tab click
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          saveTabState(getTabName(tab));
        });
      });
    }
  })();
})();
