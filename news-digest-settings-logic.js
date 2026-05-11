window.ND_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  init: async function(supabase, user) {
    if (!supabase || !user) {
      console.error('[ND Settings] supabase client or user not provided');
      return;
    }
    if (!(await window.checkToolAccess('news-digest', supabase, user))) return;
    this._supabase = supabase;
    this._userId = user.id;

    try {
      var res = await supabase
        .from('news_digest_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (res.error) console.error('[ND Settings] Load settings error:', res.error.message);
      if (res.data) this._settings = res.data;
    } catch (e) {
      console.error('[ND Settings] Load settings exception:', e.message);
    }

    this._bindTabs();
    this._bindCadence();
    this._bindLookback();
  },

  _saveToSettings: async function(payload) {
    var result;
    if (this._settings.id) {
      result = await this._supabase.from('news_digest_settings').update(payload).eq('id', this._settings.id);
    } else {
      payload.user_id = this._userId;
      payload.created_at = new Date().toISOString();
      result = await this._supabase.from('news_digest_settings').insert(payload).select('id').single();
      if (!result.error && result.data) this._settings.id = result.data.id;
    }
    if (result.error) throw new Error(result.error.message);
  },

  // ── TAB SWITCHING ────────────────────────────────────────────────────

  _bindTabs: function() {
    document.querySelectorAll('.ptab[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('active', 'settings-active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active', 'settings-active');
        var panel = document.getElementById('tab-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  },

  // ── SCAN FREQUENCY ───────────────────────────────────────────────────

  _bindCadence: function() {
    var self = this;
    var cadenceCtrl = document.getElementById('cadence-ctrl');
    if (!cadenceCtrl) return;

    var savedCadence = this._settings.cadence || 'weekly';
    cadenceCtrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === savedCadence);
    });

    cadenceCtrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        cadenceCtrl.querySelectorAll('.freq-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    var scanSaveBtn = document.getElementById('save-scan-btn');
    if (scanSaveBtn) {
      scanSaveBtn.addEventListener('click', function() {
        var msgEl = document.getElementById('save-settings-msg');
        var activeFreqBtn = document.querySelector('#cadence-ctrl .freq-btn.active');
        var currentCadence = activeFreqBtn ? activeFreqBtn.getAttribute('data-value') : 'weekly';
        window.handleSave(scanSaveBtn, async function() {
          await self._saveToSettings({
            cadence: currentCadence,
            updated_at: new Date().toISOString()
          });
        }, msgEl);
      });
    }
  },

  // ── LOOKBACK RETENTION ───────────────────────────────────────────────

  _bindLookback: function() {
    var self = this;
    var lookbackDays = parseInt(this._settings.lookback_days) || 180;
    var lookbackBtn = document.getElementById('lookback-btn');
    var lookbackMenu = document.getElementById('lookback-menu');
    if (!lookbackBtn || !lookbackMenu) return;

    var lookbackLabels = { '30': '1 month', '90': '3 months', '180': '6 months' };
    lookbackBtn.innerHTML = lookbackLabels[String(lookbackDays)] || '6 months';
    lookbackMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-value') === String(lookbackDays));
    });

    lookbackBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      lookbackMenu.classList.toggle('open');
      lookbackBtn.classList.toggle('active');
    });

    lookbackMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
      item.addEventListener('click', async function() {
        var val = parseInt(item.getAttribute('data-value')) || 180;
        lookbackBtn.innerHTML = item.textContent;
        lookbackMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(it) { it.classList.remove('active'); });
        item.classList.add('active');
        lookbackMenu.classList.remove('open');
        lookbackBtn.classList.remove('active');
        try {
          await self._saveToSettings({
            lookback_days: val,
            updated_at: new Date().toISOString()
          });
        } catch (err) {
          console.error('[ND Settings] Lookback save error:', err.message);
        }
      });
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.lookback-dropdown-wrap')) {
        lookbackMenu.classList.remove('open');
        lookbackBtn.classList.remove('active');
      }
    });
  },

  // Source Preferences UI was removed in Phase 5 — the Shared
  // Research Layer curates against its own validation rules and no
  // longer accepts user-supplied source domains (spec §16.1). The
  // existing news_digest_settings.preferred_sources column is left
  // untouched in the database; the owner can drop it separately.

};
