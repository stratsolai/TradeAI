window.CB_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {},

  DAYS: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  DAY_LABELS: { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' },

  // ── INIT ──────────────────────────────────────────────────────────────

  init: async function(supabase, user) {
    if (!supabase || !user) return;
    if (!(await window.checkToolAccess('chatbot', supabase, user))) return;
    this._supabase = supabase;
    this._userId = user.id;

    await this._loadSettings();
    this._bindTabs();
    this._populateWidget();
    this._populateBehaviour();
    this._populateAppointments();
    this._populateEmbed();
    this._bindWidgetSave();
    this._bindBehaviourSave();
    this._bindAppointmentSave();
    this._bindNotifSave();
    this._bindDomains();
    this._bindEmbedActions();
  },

  _loadSettings: async function() {
    try {
      var res = await this._supabase
        .from('chatbot_settings')
        .select('*')
        .eq('user_id', this._userId)
        .maybeSingle();
      if (res.error) console.error('[CB Settings] Load error:', res.error.message);
      if (res.data) this._settings = res.data;
    } catch (e) {
      console.error('[CB Settings] Load exception:', e.message);
    }
  },

  _saveSettings: async function(payload) {
    var result;
    if (this._settings.id) {
      result = await this._supabase.from('chatbot_settings').update(payload).eq('id', this._settings.id);
    } else {
      payload.user_id = this._userId;
      result = await this._supabase.from('chatbot_settings').insert(payload).select().single();
      if (!result.error && result.data) {
        this._settings = result.data;
      }
    }
    if (result.error) throw new Error(result.error.message);
    Object.assign(this._settings, payload);
  },

  // ── TABS ──────────────────────────────────────────────────────────────

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

  // ── WIDGET TAB — APPEARANCE ───────────────────────────────────────────

  _populateWidget: function() {
    var s = this._settings;
    var titleEl = document.getElementById('cb-widget-title');
    var greetEl = document.getElementById('cb-greeting');
    var colourEl = document.getElementById('cb-widget-colour');
    if (titleEl) titleEl.value = s.widget_title || '';
    if (greetEl) greetEl.value = s.greeting_message || '';
    if (colourEl) colourEl.value = s.widget_colour || '#4A6D8C';
  },

  _bindWidgetSave: function() {
    var self = this;
    var btn = document.getElementById('cb-save-widget');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var msgEl = document.getElementById('cb-settings-msg');
      window.handleSave(btn, async function() {
        await self._saveSettings({
          widget_title: (document.getElementById('cb-widget-title').value || '').trim() || null,
          greeting_message: (document.getElementById('cb-greeting').value || '').trim() || null,
          widget_colour: document.getElementById('cb-widget-colour').value || '#4A6D8C',
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  },

  // ── WIDGET TAB — BEHAVIOUR ────────────────────────────────────────────

  _populateBehaviour: function() {
    var s = this._settings;
    this._setFreqBtn('cb-pricing-ctrl', s.pricing_disclosure || 'none');
    this._setFreqBtn('cb-dv-ctrl', s.dv_mode || 'off');
  },

  _setFreqBtn: function(ctrlId, value) {
    var ctrl = document.getElementById(ctrlId);
    if (!ctrl) return;
    ctrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.getAttribute('data-value') === value);
    });
    ctrl.querySelectorAll('.freq-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        ctrl.querySelectorAll('.freq-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  },

  _getFreqValue: function(ctrlId) {
    var active = document.querySelector('#' + ctrlId + ' .freq-btn.active');
    return active ? active.getAttribute('data-value') : null;
  },

  _bindBehaviourSave: function() {
    var self = this;
    var btn = document.getElementById('cb-save-behaviour');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var msgEl = document.getElementById('cb-settings-msg');
      window.handleSave(btn, async function() {
        await self._saveSettings({
          pricing_disclosure: self._getFreqValue('cb-pricing-ctrl') || 'none',
          dv_mode: self._getFreqValue('cb-dv-ctrl') || 'off',
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  },

  // ── APPOINTMENTS TAB ──────────────────────────────────────────────────

  _populateAppointments: function() {
    var s = this._settings;
    var toggle = document.getElementById('cb-appt-toggle');
    var config = document.getElementById('cb-appt-config');
    var label = document.getElementById('cb-appt-toggle-label');
    var self = this;

    if (toggle) {
      toggle.checked = !!s.appointment_booking_enabled;
      if (label) label.textContent = toggle.checked ? 'Enabled' : 'Disabled';
      if (config) config.style.display = toggle.checked ? '' : 'none';
      toggle.addEventListener('change', function() {
        if (config) config.style.display = toggle.checked ? '' : 'none';
        if (label) label.textContent = toggle.checked ? 'Enabled' : 'Disabled';
      });
    }

    var timeLabels = s.time_labels || ['Morning', 'Afternoon', 'Evening'];
    for (var t = 0; t < 3; t++) {
      var tEl = document.getElementById('cb-time-' + t);
      if (tEl) tEl.value = timeLabels[t] || '';
    }

    this._buildAvailGrid(s.availability || {}, timeLabels);
  },

  _buildAvailGrid: function(availability, timeLabels) {
    var grid = document.getElementById('cb-avail-grid');
    if (!grid) return;
    var self = this;
    var html = '';

    this.DAYS.forEach(function(day) {
      var slots = availability[day] || [];
      var isAvail = slots.length > 0;
      html += '<div class="cb-avail-day">'
        + '<span class="cb-avail-day-name">' + self.DAY_LABELS[day] + '</span>'
        + '<label class="cb-avail-toggle"><input type="checkbox" data-day="' + day + '"' + (isAvail ? ' checked' : '') + '> Available</label>'
        + '<div class="cb-avail-slots' + (isAvail ? ' visible' : '') + '" id="cb-slots-' + day + '">';
      for (var s = 0; s < 3; s++) {
        var checked = slots.indexOf(s) !== -1;
        html += '<label class="cb-avail-slot"><input type="checkbox" data-day="' + day + '" data-slot="' + s + '"' + (checked ? ' checked' : '') + '> ' + (timeLabels[s] || 'Slot ' + (s + 1)) + '</label>';
      }
      html += '</div></div>';
    });

    grid.innerHTML = html;

    grid.querySelectorAll('.cb-avail-toggle input').forEach(function(toggle) {
      toggle.addEventListener('change', function() {
        var slotsEl = document.getElementById('cb-slots-' + toggle.dataset.day);
        if (slotsEl) {
          if (toggle.checked) slotsEl.classList.add('visible');
          else slotsEl.classList.remove('visible');
        }
      });
    });
  },

  _readAvailability: function() {
    var avail = {};
    var self = this;
    this.DAYS.forEach(function(day) {
      var dayToggle = document.querySelector('.cb-avail-toggle input[data-day="' + day + '"]');
      if (!dayToggle || !dayToggle.checked) return;
      var slots = [];
      for (var s = 0; s < 3; s++) {
        var slotEl = document.querySelector('.cb-avail-slot input[data-day="' + day + '"][data-slot="' + s + '"]');
        if (slotEl && slotEl.checked) slots.push(s);
      }
      if (slots.length > 0) avail[day] = slots;
    });
    return avail;
  },

  _bindAppointmentSave: function() {
    var self = this;
    var btn = document.getElementById('cb-save-appt');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var msgEl = document.getElementById('cb-settings-msg');
      var toggle = document.getElementById('cb-appt-toggle');
      window.handleSave(btn, async function() {
        var timeLabels = [];
        for (var t = 0; t < 3; t++) {
          var tEl = document.getElementById('cb-time-' + t);
          timeLabels.push(tEl ? (tEl.value.trim() || ['Morning', 'Afternoon', 'Evening'][t]) : ['Morning', 'Afternoon', 'Evening'][t]);
        }
        await self._saveSettings({
          appointment_booking_enabled: toggle ? toggle.checked : false,
          time_labels: timeLabels,
          availability: self._readAvailability(),
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  },

  // ── EMBED TAB — NOTIFICATION ──────────────────────────────────────────

  _bindNotifSave: function() {
    var self = this;
    var btn = document.getElementById('cb-save-notif');
    var emailEl = document.getElementById('cb-notif-email');
    if (!btn || !emailEl) return;
    emailEl.value = this._settings.notification_email || '';
    btn.addEventListener('click', function() {
      var msgEl = document.getElementById('cb-settings-msg');
      window.handleSave(btn, async function() {
        await self._saveSettings({
          notification_email: (emailEl.value || '').trim() || null,
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  },

  // ── EMBED TAB — DOMAINS ───────────────────────────────────────────────

  _bindDomains: function() {
    var self = this;
    var domains = this._settings.allowed_domains || [];
    this._renderDomains(domains);

    var addBtn = document.getElementById('cb-add-domain');
    if (addBtn) addBtn.addEventListener('click', function() { self._addDomainRow(''); });

    var saveBtn = document.getElementById('cb-save-domains');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var msgEl = document.getElementById('cb-settings-msg');
        window.handleSave(saveBtn, async function() {
          var list = document.getElementById('cb-domain-list');
          var vals = [];
          if (list) {
            list.querySelectorAll('.cb-domain-input').forEach(function(input) {
              var v = input.value.trim();
              if (v) vals.push(v);
            });
          }
          await self._saveSettings({
            allowed_domains: vals,
            updated_at: new Date().toISOString()
          });
        }, msgEl);
      });
    }
  },

  _renderDomains: function(domains) {
    var list = document.getElementById('cb-domain-list');
    if (!list) return;
    list.innerHTML = '';
    var self = this;
    if (domains.length === 0) {
      self._addDomainRow('');
      return;
    }
    domains.forEach(function(d) { self._addDomainRow(d); });
  },

  _addDomainRow: function(value) {
    var list = document.getElementById('cb-domain-list');
    if (!list) return;
    var row = document.createElement('div');
    row.className = 'cb-domain-row';
    row.innerHTML = '<input type="text" class="form-input cb-domain-input" placeholder="e.g. yourbusiness.com.au" value="' + escHtml(value) + '">'
      + '<button class="btn-remove-url cb-remove-domain">Remove</button>';
    list.appendChild(row);
    row.querySelector('.cb-remove-domain').addEventListener('click', function() {
      row.remove();
    });
  },

  // ── EMBED TAB — EMBED CODE ────────────────────────────────────────────

  _populateEmbed: function() {
    var widgetId = this._settings.widget_id || '';
    var codeEl = document.getElementById('cb-embed-code');
    if (codeEl) {
      if (widgetId) {
        codeEl.value = '<script src="https://staxai.com.au/widget.js" data-widget-id="' + widgetId + '"><\/script>';
      } else {
        codeEl.value = 'Widget ID not generated yet. Save your settings to generate one.';
      }
    }
  },

  _bindEmbedActions: function() {
    var self = this;

    // Copy code
    var copyBtn = document.getElementById('cb-copy-embed');
    if (copyBtn) {
      copyBtn.addEventListener('click', function() {
        var codeEl = document.getElementById('cb-embed-code');
        if (codeEl && codeEl.value) {
          navigator.clipboard.writeText(codeEl.value).then(function() {
            copyBtn.textContent = 'Copied';
            setTimeout(function() { copyBtn.textContent = 'Copy Code'; }, 2000);
          });
        }
      });
    }

    // Email modal
    var emailBtn = document.getElementById('cb-email-embed');
    var emailModal = document.getElementById('cb-email-modal');
    var emailCancel = document.getElementById('cb-email-cancel');
    var emailSend = document.getElementById('cb-email-send');

    if (emailBtn && emailModal) {
      emailBtn.addEventListener('click', function() { emailModal.classList.add('open'); });
      if (emailCancel) emailCancel.addEventListener('click', function() { emailModal.classList.remove('open'); });
      emailModal.addEventListener('click', function(e) { if (e.target === emailModal) emailModal.classList.remove('open'); });

      if (emailSend) {
        emailSend.addEventListener('click', async function() {
          var recipient = document.getElementById('cb-email-recipient');
          var email = recipient ? recipient.value.trim() : '';
          if (!email) { if (recipient) recipient.classList.add('input-error'); return; }
          if (recipient) recipient.classList.remove('input-error');

          emailSend.textContent = 'Sending...';
          emailSend.disabled = true;
          try {
            var sessionRes = await self._supabase.auth.getSession();
            var session = sessionRes.data && sessionRes.data.session;
            if (!session) throw new Error('Session expired.');

            var profileRes = await self._supabase.from('profiles').select('business_name').eq('id', self._userId).maybeSingle();
            var businessName = (profileRes.data && profileRes.data.business_name) || 'StaxAI';
            var widgetId = self._settings.widget_id || '';
            var embedCode = '<script src="https://staxai.com.au/widget.js" data-widget-id="' + widgetId + '"><\/script>';

            var smtp2goKey = null;
            var res = await fetch('/api/chatbot', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
              body: JSON.stringify({ action: 'send_embed_email', recipient: email, businessName: businessName, embedCode: embedCode })
            });

            emailModal.classList.remove('open');
            emailSend.textContent = 'Send Email';
            emailSend.disabled = false;

            if (!res.ok) {
              self._showError('Could not send email. Please copy the code and send it manually.');
            }
          } catch(e) {
            emailModal.classList.remove('open');
            emailSend.textContent = 'Send Email';
            emailSend.disabled = false;
            console.error('[CB Settings] Email send error:', e.message);
            self._showError('Could not send email. Please copy the code and send it manually.');
          }
        });
      }
    }

    // Regenerate widget ID
    var regenBtn = document.getElementById('cb-regen-id');
    var confirmModal = document.getElementById('cb-confirm-modal');
    var regenCancel = document.getElementById('cb-regen-cancel');
    var regenConfirm = document.getElementById('cb-regen-confirm');

    if (regenBtn && confirmModal) {
      regenBtn.addEventListener('click', function() { confirmModal.classList.add('open'); });
      if (regenCancel) regenCancel.addEventListener('click', function() { confirmModal.classList.remove('open'); });
      confirmModal.addEventListener('click', function(e) { if (e.target === confirmModal) confirmModal.classList.remove('open'); });

      if (regenConfirm) {
        regenConfirm.addEventListener('click', async function() {
          confirmModal.classList.remove('open');
          try {
            var newId = 'wid_' + crypto.randomUUID().replace(/-/g, '').substring(0, 20);
            await self._saveSettings({ widget_id: newId, updated_at: new Date().toISOString() });
            self._populateEmbed();
          } catch(e) {
            console.error('[CB Settings] Regenerate error:', e.message);
            self._showError('Could not regenerate widget ID. Please try again.');
          }
        });
      }
    }
  },

  // ── ERROR DISPLAY ─────────────────────────────────────────────────────

  _showError: function(message) {
    var modal = document.getElementById('cb-settings-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }

};
