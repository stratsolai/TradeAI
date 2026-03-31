window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {
    email_scan_frequency: 'manual',
    drive_scan_frequency: 'manual',
    website_scan_frequency: 'manual'
  },

  init: function() {
    this._supabase = window.supabaseClient;
    var self = this;
    this._supabase.auth.getUser().then(function(res) {
      if (!res.data || !res.data.user) {
        window.location.href = '/login.html';
        return;
      }
      self._userId = res.data.user.id;
      self._loadSettings().then(function() {
        self._bindToggleButtons();
        self._bindSave();
      });
      self._loadCategories();
      self._loadConnections();
    });

    var _ab = document.getElementById("account-btn"); if (_ab) _ab.addEventListener("click", function(e) { e.stopPropagation(); document.getElementById("account-dropdown").classList.toggle("open"); });
    document.addEventListener("click", function() { document.getElementById("account-dropdown").classList.remove("open"); });
    var _sb = document.getElementById("sign-out-btn"); if (_sb) _sb.addEventListener("click", async function() { await supabaseClient.auth.signOut(); window.location.href = "/login"; });
  },

  _loadSettings: function() {
    var self = this;
    return this._supabase
      .from('cl_settings')
      .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
      .eq('user_id', this._userId)
      .maybeSingle()
      .then(function(res) {
        if (res.data) {
          self._settings.email_scan_frequency = res.data.email_scan_frequency || 'manual';
          self._settings.drive_scan_frequency = res.data.drive_scan_frequency || 'manual';
          self._settings.website_scan_frequency = res.data.website_scan_frequency || 'manual';
        }
        self._applyToUI();
      });
  },

  _applyToUI: function() {
    var self = this;
    ['email_scan_frequency', 'drive_scan_frequency', 'website_scan_frequency'].forEach(function(field) {
      var val = self._settings[field];
      var btns = document.querySelectorAll('.freq-btn[data-field="' + field + '"]');
      btns.forEach(function(btn) {
        btn.classList.toggle('active', btn.getAttribute('data-value') === val);
      });
    });
  },

  _bindToggleButtons: function() {
    var self = this;
    var btns = document.querySelectorAll('.freq-btn');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var field = btn.getAttribute('data-field');
        var val = btn.getAttribute('data-value');
        self._settings[field] = val;
        document.querySelectorAll('.freq-btn[data-field="' + field + '"]').forEach(function(b) {
          b.classList.toggle('active', b === btn);
        });
      });
    });
  },

  _bindSave: function() {
    var saveBtn = document.getElementById('save-settings-btn');
    var self = this;
    saveBtn.addEventListener('click', async function() {
      await self._saveSettings();
    saveBtn.textContent = 'Saved';
    saveBtn.style.color = '#4A6D8C';
    saveBtn.style.borderColor = '#4A6D8C';
    document.querySelectorAll('#scan-frequency-card .freq-btn').forEach(function(el) { el.addEventListener('click', function() { saveBtn.textContent = 'Save'; saveBtn.style.color = ''; saveBtn.style.borderColor = ''; }, { once: true }); });
    var websiteBtn = document.getElementById('website-save-btn');
    if (websiteBtn) {
      websiteBtn.addEventListener('click', async function() {
        await self._saveSettings();
        websiteBtn.textContent = 'Saved';
        websiteBtn.style.color = '#4A6D8C';
        websiteBtn.style.borderColor = '#4A6D8C';
        var revertFn = function() { websiteBtn.textContent = 'Save'; websiteBtn.style.color = ''; websiteBtn.style.borderColor = ''; };
        ['add-gmail-btn', 'add-outlook-btn', 'add-drive-btn', 'add-website-btn'].forEach(function(btnId) {
          var el = document.getElementById(btnId);
          if (el) el.addEventListener('click', revertFn, { once: true });
        });
      });
    }
    });
  },

  _saveSettings: async function() {
    var self = this;
    var msg = document.getElementById('save-scan-msg');
    const { data: existingRow } = await this._supabase
      .from('cl_settings')
      .select('user_id')
      .eq('user_id', this._userId)
      .maybeSingle();
    const payload = {
        user_id: this._userId,
        email_scan_frequency: this._settings.email_scan_frequency,
        drive_scan_frequency: this._settings.drive_scan_frequency,
        website_scan_frequency: this._settings.website_scan_frequency
    };
    let res;
    if (existingRow) {
      const { error } = await this._supabase
        .from('cl_settings')
        .update(payload)
        .eq('user_id', this._userId);
      res = { error };
    } else {
      const { error } = await this._supabase
        .from('cl_settings')
        .insert(payload);
      res = { error };
    }
  },

  _showMsg: function(el, type) {
    if (!el) return;
    el.className = 'save-msg ' + (type === 'ok' ? 'save-msg-ok' : 'save-msg-error');
    el.textContent = type === 'ok' ? 'Saved' : 'Error saving';
    el.style.display = 'inline';
    setTimeout(function() { el.style.display = 'none'; }, 3000);
  },

  // CATEGORIES

  _loadCategories: function() {
    var self = this;
    this._supabase
      .from('profiles')
      .select('cl_active_categories, cl_custom_categories')
      .eq('id', this._userId)
      .maybeSingle()
      .then(function(res) {
        var active = (res.data && res.data.cl_active_categories) || [];
        var custom = (res.data && res.data.cl_custom_categories) || [];
        self._renderCategories(active, custom);
        self._bindCategories();
      });
  },

  _renderCategories: function(active, custom) {
    var grid = document.getElementById('category-grid');
    if (!grid) return;
    var defaults = [
      'Services & Pricing', 'Projects & Portfolio', 'Team & Culture',
      'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials',
      'Tips & How-To', 'Industry News', 'Company Updates', 'Seasonal Content'
    ];
    var all = defaults.concat(custom);
    var html = '';
    all.forEach(function(cat) {
      var isOn = active.indexOf(cat) > -1;
      var isCustom = defaults.indexOf(cat) === -1;
      html += '<div class="settings-row cat-row" data-category="' + cat + '">' +
        '<div>' +
          '<div class="settings-row-label">' + cat + '</div>' +
          (isCustom ? '<div class="settings-row-desc">Custom category</div>' : '') +
        '</div>' +
        '<div class="settings-row-control">' +
          (isCustom ? '<button type="button" class="btn-remove-url" data-cat-remove="' + cat + '">Remove</button>' : '') +
          '<button type="button" class="freq-btn' + (isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="on">On</button>' +
          '<button type="button" class="freq-btn' + (!isOn ? ' active' : '') + '" data-cat="' + cat + '" data-val="off">Off</button>' +
          '</div>' +
      '</div>';
    });
    grid.innerHTML = html;
  },

  _bindCategories: function() {
    var self = this;
    var grid = document.getElementById('category-grid');
    var input = document.getElementById('category-custom-input');
    var addBtn = document.getElementById('add-category-btn');
    var saveBtn = document.getElementById('save-categories-btn');
    var msg = document.getElementById('save-categories-msg');

    if (grid) {
      grid.addEventListener('click', function(e) {
        var removeBtn = e.target.closest('[data-cat-remove]');
        if (removeBtn) {
          var catVal = removeBtn.getAttribute('data-cat-remove');
          var row = grid.querySelector('.cat-row[data-category="' + catVal + '"]');
          if (!row) { var cl = document.getElementById('custom-categories-list'); if (cl) row = cl.querySelector('.cat-row[data-category="' + catVal + '"]'); }
          if (row) row.remove();
          return;
        }
        var btn = e.target.closest('.freq-btn[data-cat]');
        if (btn) {
          var cat = btn.getAttribute('data-cat');
          grid.querySelectorAll('.freq-btn[data-cat="' + cat + '"]').forEach(function(b) {
            b.classList.toggle('active', b === btn);
          });
        }
      });
    }

    var customList = document.getElementById('custom-categories-list');
    if (customList) {
      customList.addEventListener('click', function(e) {
        var removeBtn = e.target.closest('[data-cat-remove]');
        if (removeBtn) {
          var row = removeBtn.closest('.cat-row');
          if (row) row.remove();
        }
        var btn = e.target.closest('.freq-btn[data-cat]');
        if (btn) {
          var cat = btn.getAttribute('data-cat');
          customList.querySelectorAll('.freq-btn[data-cat="' + cat + '"]').forEach(function(b) {
            b.classList.toggle('active', b === btn);
          });
        }
      });
    }

    if (addBtn && input) {
      addBtn.addEventListener('click', function() {
        var val = input.value.trim();
        if (!val || !grid) return;
        if (grid.querySelector('.cat-row[data-category="' + val + '"]')) {
          input.value = '';
          return;
        }
        var row = document.createElement('div');
        row.className = 'settings-row cat-row';
        row.setAttribute('data-category', val);
        row.innerHTML =
          '<div><div class="settings-row-label">' + val + '</div><div class="settings-row-desc">Custom category</div></div>' +
          '<div class="settings-row-control">' +
          '<button type="button" class="btn-remove-url" data-cat-remove="' + val + '">Remove</button>' +
          '<button type="button" class="freq-btn active" data-cat="' + val + '" data-val="on">On</button>' +
          '<button type="button" class="freq-btn" data-cat="' + val + '" data-val="off">Off</button>' +
          '</div>';
        var customList = document.getElementById('custom-categories-list');
        (customList || grid).appendChild(row);;
        input.value = '';
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        if (!self._userId || !grid) return;
        var active = [];
        var custom = [];
        var defaults = [
          'Services & Pricing', 'Projects & Portfolio', 'Team & Culture',
          'Products & Equipment', 'Promotions & Offers', 'Customer Testimonials',
          'Tips & How-To', 'Industry News', 'Company Updates', 'Seasonal Content'
        ];
        grid.querySelectorAll('.cat-row').forEach(function(row) {
          var cat = row.getAttribute('data-category');
          var onBtn = row.querySelector('.freq-btn[data-val="on"]');
          if (onBtn && onBtn.classList.contains('active')) active.push(cat);
          if (defaults.indexOf(cat) === -1) custom.push(cat);
        });
        self._supabase
          .from('profiles')
          .update({ cl_active_categories: active, cl_custom_categories: custom })
          .eq('id', self._userId)
          .then(function(res) {
            if (!res.error) {
              saveBtn.textContent = 'Saved';
              saveBtn.style.color = '#4A6D8C';
              saveBtn.style.borderColor = '#4A6D8C';
              document.querySelectorAll('#tab-categories input, #tab-categories select').forEach(function(el) { el.addEventListener('input', function() { saveBtn.textContent = 'Save'; saveBtn.style.color = ''; saveBtn.style.borderColor = ''; }, { once: true }); });
            }
          });
      });
    }
  },

  // CONNECTIONS

  _loadConnections: function() {
    var self = this;
    this._supabase
      .from('profiles')
      .select('cl_connected_emails, cl_drive_connected, website_urls')
      .eq('id', this._userId)
      .maybeSingle()
      .then(function(res) {
        var data = res.data || {};
        self.renderEmailList(data.cl_connected_emails || [], self._supabase, self._userId, self);
        self.renderDriveList(data.cl_drive_connected || false, self._supabase, self._userId);
        self.renderWebsiteUrls(data.website_urls || [], self._supabase, self._userId, "");
      });
  }

,

  renderEmailList: function(emails, supabase, userId, self) {
  var emailList = document.querySelector('.connection-list[data-type="email"]') ||
    document.getElementById('gmail-connections-list');
  if (!emailList) return;
  if (!emails.length) {
    return;
  }
  var html = '';
  emails.forEach(function(email) {
    html += '<div class="connection-item">' +
      '<span class="connection-item-email">' + email + '</span>' +
      '<button type="button" class="btn-disconnect" data-email="' + email + '">Disconnect</button>' +
      '</div>';
  });
  emailList.innerHTML = html;
  emailList.querySelectorAll('.btn-disconnect').forEach(function(btn) {
    btn.addEventListener('click', function() {
      self.disconnectEmail(btn.getAttribute('data-email'), emails, supabase, userId);
    });
  });
},

  disconnectEmail: function(email, emails, supabase, userId) {
  var updated = emails.filter(function(e) { return e !== email; });
  supabase.from('profiles').update({ cl_connected_emails: updated }).eq('id', userId)
    .then(function() { renderEmailList(updated, supabase, userId); });
},

  handleOAuthConnect: function(provider, supabase) {
  var btn = document.getElementById('add-' + provider + '-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        scopes: provider === 'google'
          ? 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/drive.readonly'
          : 'Mail.Read'
      }
    });
  });
},

  renderDriveList: function(connected, supabase, userId) {
    var self = this;
  var list = document.getElementById('drive-connections-list');
  if (!list) return;
  if (connected) {
    list.innerHTML = '<div class="connection-item">' +
      '<span class="connection-status connected">Connected</span>' +
      '<button type="button" class="btn-disconnect" id="disconnect-drive-btn">Disconnect</button>' +
      '</div>';
    var btn = document.getElementById('disconnect-drive-btn');
    if (btn) btn.addEventListener('click', function() {
      supabase.from('profiles').update({ cl_drive_connected: false }).eq('id', userId)
        .then(function() { self.renderDriveList(false, supabase, userId); });
    });
  } else {
    list.innerHTML = '';
    self.handleOAuthConnect('google', supabase);
  }
},

  renderWebsiteUrls: function(urls, supabase, userId, businessWebsite) {
    var self = this;
    var list = document.getElementById('website-urls-list');
    var addBtn = document.getElementById('add-website-btn');
    var saveBtn = document.getElementById('website-save-btn');
    if (!list) return;

    var current = urls.slice();

    function render() {
      var html = '';
      if (businessWebsite) {
        html += '<div class="website-url-item"><input type="url" class="website-url-input" value="' + businessWebsite + '" placeholder="https://example.com.au" readonly style="opacity:0.7"><span style="font-size:12px;color:#4A6D8C;margin-left:8px">From Business Profile</span></div>';
      }
      current.forEach(function(url, idx) {
        html += '<div class="website-url-item">';
        html += '<input type="url" class="website-url-input" value="' + url + '" placeholder="https://example.com.au" data-index="' + idx + '">';
        html += '<button type="button" class="btn-remove-url" data-index="' + idx + '">Remove</button>';
        html += '</div>';
      });
      list.innerHTML = html;
      list.querySelectorAll('.btn-remove-url').forEach(function(btn) {
        btn.addEventListener('click', function() {
          current.splice(parseInt(btn.getAttribute('data-index')), 1);
          render();
          addBtn.disabled = false;
          addBtn.style.opacity = '';
        });
      });
      list.querySelectorAll('.website-url-input:not([readonly])').forEach(function(input) {
        input.addEventListener('input', function() {
          current[parseInt(input.getAttribute('data-index'))] = input.value.trim();
        });
      });
    }

    render();

    if (addBtn) {
      addBtn.onclick = function() {
        current.push('');
        render();
        addBtn.disabled = true;
        addBtn.style.opacity = '0.5';
        // Re-enable when user types a valid URL in the new empty input
        var newInput = list.querySelector('.website-url-input[value=""]');
        if (newInput) {
          newInput.addEventListener('input', function() {
            var val = newInput.value.trim();
            if (val.length > 3) {
              addBtn.disabled = false;
              addBtn.style.opacity = '';
            } else {
              addBtn.disabled = true;
              addBtn.style.opacity = '0.5';
            }
          });
        }
      };
    }

    if (saveBtn) {
      saveBtn.onclick = async function() {
        var vals = Array.from(list.querySelectorAll('.website-url-input:not([readonly])')).map(function(i) {
        var v = i.value.trim();
        if (!v) return '';
        if (v.match(/^www\./i)) v = 'https://' + v;
        else if (!v.match(/^https?:\/\//i)) v = 'https://' + v;
        return v;
      }).filter(function(v) { return v; });
        await supabase.from('profiles').update({ website_urls: vals }).eq('id', userId);
        saveBtn.textContent = 'Saved';
        saveBtn.style.color = '#4A6D8C';
        saveBtn.style.borderColor = '#4A6D8C';
        if (addBtn) addBtn.addEventListener('click', function() {
          saveBtn.textContent = 'Save';
          saveBtn.style.color = '';
          saveBtn.style.borderColor = '';
        }, { once: true });
      };
    }
  }

};



// INIT

document.addEventListener('DOMContentLoaded', function() {
  if (window.supabaseClient && window.CL_SETTINGS_LOGIC) {
    window.CL_SETTINGS_LOGIC.init();
  }
});
