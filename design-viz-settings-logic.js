window.DV_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  init: async function(supabase, user) {
    if (!supabase || !user) {
      console.error('[DV Settings] supabase client or user not provided');
      return;
    }
    this._supabase = supabase;
    this._userId = user.id;

    try {
      var res = await supabase
        .from('dv_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (res.error) console.error('[DV Settings] Load error:', res.error.message);
      if (res.data) this._settings = res.data;
    } catch (e) {
      console.error('[DV Settings] Load exception:', e.message);
    }

    this._bindCbMode();
    this._bindSave();
  },

  _saveSettings: async function(payload) {
    var result;
    if (this._settings.id) {
      result = await this._supabase.from('dv_settings').update(payload).eq('id', this._settings.id);
    } else {
      payload.user_id = this._userId;
      result = await this._supabase.from('dv_settings').insert(payload).select('id').single();
      if (!result.error && result.data) this._settings.id = result.data.id;
    }
    if (result.error) throw new Error(result.error.message);
  },

  _bindCbMode: function() {
    var ctrl = document.getElementById('cb-mode-ctrl');
    var hintRow = document.getElementById('watermark-hint-row');
    if (!ctrl) return;

    var savedMode = this._settings.cb_mode || 'off';

    ctrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === savedMode);
    });

    if (hintRow) hintRow.style.display = savedMode === 'watermarked' ? '' : 'none';

    ctrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        ctrl.querySelectorAll('.freq-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (hintRow) hintRow.style.display = btn.getAttribute('data-value') === 'watermarked' ? '' : 'none';
      });
    });
  },

  _bindSave: function() {
    var self = this;
    var saveBtn = document.getElementById('save-cb-btn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', function() {
      var msgEl = document.getElementById('dv-settings-msg');
      var activeBtn = document.querySelector('#cb-mode-ctrl .freq-btn.active');
      var mode = activeBtn ? activeBtn.getAttribute('data-value') : 'off';

      window.handleSave(saveBtn, async function() {
        await self._saveSettings({
          cb_mode: mode,
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  }

};
