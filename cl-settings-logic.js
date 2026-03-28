// cl-settings-logic.js — Content Library Settings logic
// Part of Content Library split architecture
// Step 6: New file. window.CL_SETTINGS_LOGIC = { init: function(supabase) {} } pattern.
// Reads/writes cl_settings table. Handles auto-scan frequency toggles.

window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  init: function(supabase) {
    this._supabase = supabase;
    this._bindToggleButtons();
    this._bindSave();
    this._loadSettings();
  },

  // ── BIND TOGGLE BUTTONS ─────────────────────────────────────────────────

  _bindToggleButtons: function() {
    var self = this;
    var allBtns = document.querySelectorAll('.freq-btn');
    allBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var field = btn.getAttribute('data-field');
        var value = btn.getAttribute('data-value');
        var ctrl = btn.parentElement;
        if (ctrl) {
          ctrl.querySelectorAll('.freq-btn').forEach(function(b) {
            b.classList.remove('active');
          });
        }
        btn.classList.add('active');
        self._settings[field] = value;
      });
    });
  },

  // ── BIND SAVE ───────────────────────────────────────────────────────────

  _bindSave: function() {
    var self = this;
    var saveBtn = document.getElementById('save-scan-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        self._saveSettings();
      });
    }
  },

  // ── LOAD SETTINGS ────────────────────────────────────────────────────

  _loadSettings: async function() {
    var supabase = this._supabase;
    if (!supabase) return;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data.user;
      if (!user) return;
      this._userId = user.id;

      var resp = await supabase
        .from('cl_settings')
        .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
        .eq('user_id', user.id)
        .maybeSingle();

      if (resp.data) {
        this._settings = {
          email_scan_frequency: resp.data.email_scan_frequency || 'daily',
          drive_scan_frequency: resp.data.drive_scan_frequency || 'weekly',
          website_scan_frequency: resp.data.website_scan_frequency || 'weekly'
        };
      } else {
        this._settings = {
          email_scan_frequency: 'daily',
          drive_scan_frequency: 'weekly',
          website_scan_frequency: 'weekly'
        };
      }

      this._applyToUI();

    } catch (err) {
      console.error('CL_SETTINGS_LOGIC load error:', err);
    }
  },

  // ── APPLY TO UI ─────────────────────────────────────────────────────────

  _applyToUI: function() {
    var self = this;
    var fields = ['email_scan_frequency', 'drive_scan_frequency', 'website_scan_frequency'];
    fields.forEach(function(field) {
      var value = self._settings[field];
      var btns = document.querySelectorAll('.freq-btn[Data-field="' + field + '"]');
      btns.forEach(function(btn) {
        if (btn.getAttribute('data-value') === value) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    });
  },

  // ── SAVE SETTINGS ──────────────────────────────────────────────────────

  _saveSettings: async function() {
    var supabase = this._supabase;
    var userId = this._userId;
    if (!supabase || !userId) return;

    var saveBtn = document.getElementById('save-scan-btn');
    var saveMsg = document.getElementById('save-scan-msg');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    try {
      var updates = {
        user_id: userId,
        email_scan_frequency: this._settings.email_scan_frequency || 'daily',
        drive_scan_frequency: this._settings.drive_scan_frequency || 'weekly',
        website_scan_frequency: this._settings.website_scan_frequency || 'weekly',
        updated_at: new Date().toISOString()
      };

      var resp = await supabase
        .from('cl_settings')
        .upsert(updates, { onConflict: 'user_id' });

      if (resp.error) throw resp.error;
      this._showMsg(saveMsg, 'Saved', false);

    } catch (err) {
      console.error('CL_SETTINGS_LOGIC save error:', err);
      this._showMsg(saveMsg, 'Save failed. Please try again.', true);
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Settings'; }
    }
  },

  // ── HELPERS ──────────────────────────────────────────────────────────────────

  _showMsg: function(msgEl, text, isError) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = isError ? 'save-msg save-msg-error' : 'save-msg save-msg-ok';
    msgEl.style.display = 'inline';
    setTimeout(function() { msgEl.style.display = 'none'; }, 3500);
  }

};


// ---- CL Settings: Auth, Account Dropdown & Connections ----

document.addEventListener('DOMContentLoaded', async function() {

  const supabase = window.supabaseClient;
  if (!supabase) { console.error('Supabase not available'); return; }

  // -- Auth --
  const { data: authData } = await supabase.auth.getUser();
  if (!authData || !authData.user) { window.location.href = '/login.html'; return; }
  const user = authData.user;



  // -- Load profile --
  const { data: profile } = await supabase
    .from('profiles')
    .select('cl_connected_emails, cl_drive_connected, website_urls')
    .eq('user_id', user.id)
    .single();

  const connectedEmails = (profile && profile.cl_connected_emails) ? profile.cl_connected_emails : [];
  const driveConnected = profile && profile.cl_drive_connected;
  const websiteUrls = (profile && profile.website_urls) ? profile.website_urls : [];
  renderWebsiteUrls();

  // -- Render Gmail connections --
  function renderEmailList(provider) {
    const listEl = document.getElementById(provider + '-connections-list');
    if (!listEl) return;
    const providerEmails = connectedEmails.filter(function(e) { return e.provider === provider; });

// -- Account dropdown --
function wireDropdown() {
  var btn = document.getElementById("account-btn");
  var menu = document.getElementById("account-menu");
  if (!btn || !menu) return;
  btn.addEventListener("click", function(e) {
    e.stopPropagation();
    menu.classList.toggle("open");
  });
  document.addEventListener("click", function() {
    menu.classList.remove("open");
  });
  menu.addEventListener("click", function(e) {
    e.stopPropagation();
  });
  var signOutBtn = document.getElementById("sign-out-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", function() {
      window.supabaseClient.auth.signOut().then(function() {
        window.location.href = "/login";
      });
    });
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireDropdown);
} else {
  wireDropdown();
}
    });
  }
});
