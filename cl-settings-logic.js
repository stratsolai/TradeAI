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

  // -- Supabase client --
  const supabase = window.supabase;
  if (!supabase) return;

  // -- Auth check --
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { window.location.href = '/login.html'; return; }

  // -- Account dropdown --
  const emailEl = document.getElementById('user-email');
  if (emailEl) emailEl.textContent = user.email || 'Account';

  const acctBtn = document.getElementById('account-btn');
  const acctDropdown = document.getElementById('account-dropdown');
  if (acctBtn && acctDropdown) {
    acctBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      acctDropdown.classList.toggle('open');
    });
    document.addEventListener('click', function() {
      acctDropdown.classList.remove('open');
    });
  }

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', async function() {
      await supabase.auth.signOut();
      window.location.href = '/login.html';
    });
  }

  // -- Load existing connection status from profiles --
  const { data: profile } = await supabase
    .from('profiles')
    .select('cl_gmail_connected, cl_gmail_email, cl_outlook_connected, cl_outlook_email, cl_drive_connected, website_urls')
    .eq('user_id', user.id)
    .single();

  if (profile) {
    renderConnectionStatus('gmail', profile.cl_gmail_connected, profile.cl_gmail_email);
    renderConnectionStatus('outlook', profile.cl_outlook_connected, profile.cl_outlook_email);
    renderConnectionStatus('drive', profile.cl_drive_connected, null);
    if (profile.website_urls && profile.website_urls.length > 0) {
      const websiteInput = document.getElementById('website-url-input');
      if (websiteInput) websiteInput.value = profile.website_urls[0];
    }
  }

  // -- Render connection status helper --
  function renderConnectionStatus(provider, isConnected, email) {
    const statusEl = document.getElementById(provider + '-status');
    const btn = document.getElementById(provider + '-btn');
    if (!statusEl || !btn) return;
    if (isConnected) {
      statusEl.textContent = email ? 'Connected: ' + email : 'Connected';
      statusEl.className = 'connection-status connected';
      btn.textContent = 'Disconnect';
      btn.className = 'btn-connect disconnect';
      btn.onclick = function() { handleDisconnect(provider); };
    } else {
      statusEl.textContent = 'Not connected';
      statusEl.className = 'connection-status';
      btn.textContent = 'Connect';
      btn.className = 'btn-connect';
      btn.onclick = function() { handleConnect(provider); };
    }
  }

  // -- OAuth connect --
  async function handleConnect(provider) {
    let oauthProvider, scopes, redirectTo;
    redirectTo = window.location.origin + '/api/auth/cl-oauth-callback.js?provider=' + provider;

    if (provider === 'gmail') {
      oauthProvider = 'google';
      scopes = 'email profile https://www.googleapis.com/auth/gmail.readonly';
    } else if (provider === 'outlook') {
      oauthProvider = 'azure';
      scopes = 'email offline_access Mail.Read';
    } else if (provider === 'drive') {
      oauthProvider = 'google';
      scopes = 'email profile https://www.googleapis.com/auth/drive.readonly';
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: {
        scopes: scopes,
        redirectTo: redirectTo,
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    });
    if (error) console.error('OAuth error:', error.message);
  }

  // -- Disconnect --
  async function handleDisconnect(provider) {
    const update = {};
    if (provider === 'gmail') {
      update.cl_gmail_connected = false;
      update.cl_gmail_email = null;
    } else if (provider === 'outlook') {
      update.cl_outlook_connected = false;
      update.cl_outlook_email = null;
    } else if (provider === 'drive') {
      update.cl_drive_connected = false;
    }
    const { error } = await supabase.from('profiles').update(update).eq('user_id', user.id);
    if (!error) renderConnectionStatus(provider, false, null);
  }

  // -- Website URL save --
  const websiteSaveBtn = document.getElementById('website-save-btn');
  if (websiteSaveBtn) {
    websiteSaveBtn.addEventListener('click', async function() {
      const urlInput = document.getElementById('website-url-input');
      const url = urlInput ? urlInput.value.trim() : '';
      if (!url) return;
      const { error } = await supabase
        .from('profiles')
        .update({ website_urls: [url] })
        .eq('user_id', user.id);
      if (!error) {
        websiteSaveBtn.textContent = 'Saved';
        setTimeout(function() { websiteSaveBtn.textContent = 'Save'; }, 2000);
      }
    });
  }

});
