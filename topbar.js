document.addEventListener("DOMContentLoaded", function() {
  var _ab = document.getElementById("account-btn");
  if (_ab) _ab.addEventListener("click", function(e) {
    e.stopPropagation();
    document.getElementById("account-dropdown").classList.toggle("open");
  });

  document.addEventListener("click", function() {
    document.getElementById("account-dropdown").classList.remove("open");
  });

  var _sb = document.getElementById("sign-out-btn");
  if (_sb) _sb.addEventListener("click", async function() {
    await supabaseClient.auth.signOut();
    window.location.href = "/login";
  });

  // ── TAB HASH MANAGEMENT ──
  // Detects tabs on the page, restores hash on load, updates hash on switch.
  // Supports: .stab[data-tab], .settings-tab[data-tab], .ptab[onclick]
  (function() {
    // Detect which tab system is present
    var stabTabs = document.querySelectorAll('.stab[data-tab]');
    var settingsTabs = document.querySelectorAll('.settings-tab[data-tab]');
    var ptabTabs = document.querySelectorAll('.ptab[onclick]');

    if (stabTabs.length > 0) {
      initHashTabs(stabTabs, function(tab) { return tab.getAttribute('data-tab'); });
    } else if (settingsTabs.length > 0) {
      initHashTabs(settingsTabs, function(tab) { return tab.getAttribute('data-tab'); });
    } else if (ptabTabs.length > 0) {
      initHashTabsPtab(ptabTabs);
    }

    // data-tab based systems (stab, settings-tab)
    function initHashTabs(tabs, getId) {
      // Restore from hash on load
      var hash = window.location.hash.replace('#', '');
      if (hash) {
        var found = false;
        tabs.forEach(function(tab) {
          if (getId(tab) === hash) { tab.click(); found = true; }
        });
      }
      // Update hash on tab switch
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          var id = getId(tab);
          if (id) history.replaceState(null, '', '#' + id);
        });
      });
    }

    // ptab onclick system (content-library)
    function initHashTabsPtab(tabs) {
      // Extract tab name from onclick="switchPTab('name')"
      function getTabName(tab) {
        var onclick = tab.getAttribute('onclick') || '';
        var match = onclick.match(/switchPTab\(['"]([^'"]+)['"]\)/);
        return match ? match[1] : null;
      }
      // Restore from hash on load
      var hash = window.location.hash.replace('#', '');
      if (hash && typeof window.switchPTab === 'function') {
        var found = false;
        tabs.forEach(function(tab) {
          if (getTabName(tab) === hash) found = true;
        });
        if (found) window.switchPTab(hash);
      }
      // Update hash on tab click
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          var name = getTabName(tab);
          if (name) history.replaceState(null, '', '#' + name);
        });
      });
    }
  })();
});
