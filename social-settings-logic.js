window.SM_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  init: async function(supabase, user) {
    if (!supabase || !user) return;
    this._supabase = supabase;
    this._userId = user.id;
    this._bindTabs();
    this._bindFreqButtons();
    this._bindToneDropdown();
    this._bindSave();
    this._bindConnections();
    await this._loadSettings();
  },

  _bindTabs: function() {
    var self = this;
    document.querySelectorAll('.ptab[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._switchTab(btn.dataset.tab);
      });
    });
  },

  _switchTab: function(tabId) {
    document.querySelectorAll('.ptab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
      btn.classList.toggle('settings-active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.ptab-content').forEach(function(panel) {
      panel.classList.remove('active');
    });
    var target = document.getElementById('tab-' + tabId);
    if (target) target.classList.add('active');
  },

  _loadSettings: async function() {
    var result = await this._supabase
      .from('social_settings')
      .select('*')
      .eq('user_id', this._userId)
      .maybeSingle();

    if (result.error) {
      console.error('[SM Settings] Load error:', result.error.message);
      return;
    }

    this._settings = result.data || {};
    this._applySettings();
  },

  _applySettings: function() {
    var s = this._settings;

    var fbStatus = document.getElementById('fb-connection-status');
    var fbBtn = document.getElementById('fb-connect-btn');
    if (s.facebook_connected) {
      if (fbStatus) fbStatus.innerHTML = '<span class="badge badge-green">Connected</span>' +
        (s.meta_page_name ? '<span style="margin-left:8px;font-size:var(--note-font-size);color:var(--text-muted)">' + window.escHtml(s.meta_page_name) + '</span>' : '');
      if (fbBtn) { fbBtn.textContent = 'Disconnect'; fbBtn.classList.add('disconnect'); }
    }

    var igStatus = document.getElementById('ig-connection-status');
    var igBtn = document.getElementById('ig-connect-btn');
    if (s.instagram_connected) {
      if (igStatus) igStatus.innerHTML = '<span class="badge badge-green">Connected</span>' +
        (s.instagram_username ? '<span style="margin-left:8px;font-size:var(--note-font-size);color:var(--text-muted)">@' + window.escHtml(s.instagram_username) + '</span>' : '');
      if (igBtn) { igBtn.textContent = 'Disconnect'; igBtn.classList.add('disconnect'); }
    }

    if (s.default_tone) {
      var toneBtn = document.getElementById('tone-dropdown-btn');
      if (toneBtn) {
        var toneLabels = { professional: 'Professional', friendly: 'Friendly', casual: 'Casual', bold: 'Bold', helpful: 'Helpful' };
        toneBtn.innerHTML = (toneLabels[s.default_tone] || 'Friendly') + ' &#9662;';
      }
      document.querySelectorAll('#tone-dropdown-menu .lookback-dropdown-item').forEach(function(item) {
        item.classList.toggle('active', item.dataset.value === s.default_tone);
      });
    }

    this._setFreqActive('hashtags-ctrl', s.include_hashtags === false ? 'no' : 'yes');
    this._setFreqActive('autopublish-ctrl', s.auto_publish === false ? 'no' : 'yes');
  },

  _setFreqActive: function(ctrlId, value) {
    var ctrl = document.getElementById(ctrlId);
    if (!ctrl) return;
    ctrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  },

  _bindFreqButtons: function() {
    var self = this;
    document.querySelectorAll('.freq-btn[data-field]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ctrl = btn.closest('.settings-row-control');
        if (ctrl) {
          ctrl.querySelectorAll('.freq-btn').forEach(function(b) { b.classList.remove('active'); });
        }
        btn.classList.add('active');
        var payload = {};
        payload[btn.dataset.field] = btn.dataset.value === 'yes';
        self._saveToSettings(payload);
      });
    });
  },

  _bindToneDropdown: function() {
    var self = this;
    var btn = document.getElementById('tone-dropdown-btn');
    var menu = document.getElementById('tone-dropdown-menu');
    if (!btn || !menu) return;

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });

    menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
      item.addEventListener('click', function() {
        menu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
        var toneLabels = { professional: 'Professional', friendly: 'Friendly', casual: 'Casual', bold: 'Bold', helpful: 'Helpful' };
        btn.innerHTML = (toneLabels[item.dataset.value] || item.dataset.value) + ' &#9662;';
        menu.classList.remove('open');
        self._saveToSettings({ default_tone: item.dataset.value });
      });
    });

    document.addEventListener('click', function() {
      menu.classList.remove('open');
    });
  },

  _bindSave: function() {
    var self = this;
    var saveBtn = document.getElementById('save-prefs-btn');
    var msgEl = document.getElementById('save-settings-msg');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        window.handleSave(saveBtn, async function() {
          await self._saveToSettings({
            updated_at: new Date().toISOString()
          });
        }, msgEl);
      });
    }
  },

  _saveToSettings: async function(payload) {
    payload.user_id = this._userId;
    payload.updated_at = new Date().toISOString();
    var result = await this._supabase
      .from('social_settings')
      .upsert(payload, { onConflict: 'user_id' });
    if (result.error) {
      console.error('[SM Settings] Save error:', result.error.message);
      throw new Error('Could not save settings. Please try again.');
    }
    Object.assign(this._settings, payload);
  },

  _bindConnections: function() {
    var self = this;

    document.getElementById('fb-connect-btn').addEventListener('click', function() {
      if (self._settings.facebook_connected) {
        self._disconnectFacebook();
      } else {
        self._connectFacebook();
      }
    });

    document.getElementById('ig-connect-btn').addEventListener('click', function() {
      if (self._settings.instagram_connected) {
        self._disconnectInstagram();
      } else {
        self._connectInstagram();
      }
    });
  },

  _connectFacebook: async function() {
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) return;

      var res = await fetch('/api/meta-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ action: 'get-auth-url', platform: 'facebook' })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        this._showError(errData.error || 'Could not start Facebook connection.');
        return;
      }

      var data = await res.json();
      if (data.auth_url) {
        window.location.href = data.auth_url;
      }
    } catch (err) {
      this._showError('Could not connect to Facebook. Please try again.');
    }
  },

  _disconnectFacebook: async function() {
    await this._saveToSettings({
      facebook_connected: false,
      meta_page_id: null,
      meta_page_name: null,
      meta_page_token: null
    });
    window.location.reload();
  },

  _connectInstagram: async function() {
    if (!this._settings.facebook_connected) {
      this._showError('Please connect your Facebook Page first. Instagram Business accounts connect through Facebook.');
      return;
    }
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) return;

      var res = await fetch('/api/meta-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ action: 'get-pages' })
      });

      if (!res.ok) {
        this._showError('Could not retrieve Instagram account. Please try again.');
        return;
      }

      var data = await res.json();
      if (data.instagram_account_id) {
        await this._saveToSettings({
          instagram_connected: true,
          instagram_account_id: data.instagram_account_id,
          instagram_username: data.instagram_username || ''
        });
        window.location.reload();
      } else {
        this._showError('No Instagram Business account found linked to your Facebook Page. Please link one in Facebook settings first.');
      }
    } catch (err) {
      this._showError('Could not connect to Instagram. Please try again.');
    }
  },

  _disconnectInstagram: async function() {
    await this._saveToSettings({
      instagram_connected: false,
      instagram_account_id: null,
      instagram_username: null
    });
    window.location.reload();
  },

  _showError: function(msg) {
    var modal = document.getElementById('save-settings-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = msg;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }
};
