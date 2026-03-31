window.CL_SETTINGS_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: {
    email_scan_frequency: 'manual',
    drive_scan_frequency: 'manual',
    website_scan_frequency: 'manual'
  },

  init: function(supabaseClient) {
    this._supabase = supabaseClient;
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
  },

  _loadSettings: function() {
    var self = this;
    return this._supabase
      .from('cl_settings')
      .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
      .eq('user_id', this._userId)
      .single()
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
    var self = this;
    var saveBtn = document.getElementById('save-settings-btn');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', function() {
      self._saveSettings();
    });
  },

  _saveSettings: function() {
    var self = this;
    var msg = document.getElementById('save-scan-msg');
    this._supabase
      .from('cl_settings')
      .upsert({
        user_id: this._userId,
        email_scan_frequency: this._settings.email_scan_frequency,
        drive_scan_frequency: this._settings.drive_scan_frequency,
        website_scan_frequency: this._settings.website_scan_frequency
      }, { onConflict: 'user_id' })
      .then(function(res) {
        self._showMsg(msg, res.error ? 'error' : 'ok');
      });
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
      .single()
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
      var isActive = active.indexOf(cat) > -1;
      html += '<div class="cat-item' + (isActive ? ' active' : '') + '" data-category="' + cat + '">' +
        '<span>' + cat + '</span>' +
        (defaults.indexOf(cat) === -1 ? '<button type="button" class="btn-remove-cat" data-category="' + cat + '">×</button>' : '') +
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
        var item = e.target.closest('.cat-item');
        var removeBtn = e.target.closest('.btn-remove-cat');
        if (removeBtn) {
          var cat = removeBtn.getAttribute('data-category');
          var el = grid.querySelector('.cat-item[data-category="' + cat + '"]');
          if (el) el.remove();
          return;
        }
        if (item) {
          item.classList.toggle('active');
        }
      });
    }

    if (addBtn && input) {
      addBtn.addEventListener('click', function() {
        var val = input.value.trim();
        if (!val || !grid) return;
        var exists = grid.querySelector('.cat-item[data-category="' + val + '"]');
        if (exists) { input.value = ''; return; }
        var div = document.createElement('div');
        div.className = 'cat-item active';
        div.setAttribute('data-category', val);
        div.innerHTML = '<span>' + val + '</span><button type="button" class="btn-remove-cat" data-category="' + val + '">×</button>';
        grid.appendChild(div);
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
        grid.querySelectorAll('.cat-item.active').forEach(function(el) {
          active.push(el.getAttribute('data-category'));
        });
        grid.querySelectorAll('.cat-item').forEach(function(el) {
          var cat = el.getAttribute('data-category');
          if (defaults.indexOf(cat) === -1) custom.push(cat);
        });
        self._supabase
          .from('profiles')
          .update({ cl_active_categories: active, cl_custom_categories: custom })
          .eq('id', self._userId)
          .then(function(res) {
            self._showMsg(msg, res.error ? 'error' : 'ok');
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
      .single()
      .then(function(res) {
        var data = res.data || {};
        renderEmailList(data.cl_connected_emails || [], self._supabase, self._userId);
        renderDriveList(data.cl_drive_connected || false, self._supabase, self._userId);
        renderWebsiteUrls(data.website_urls || [], self._supabase, self._userId);
      });
  }

};

// EMAIL

function renderEmailList(emails, supabase, userId) {
  var emailList = document.querySelector('.connection-list[data-type="email"]') ||
    document.getElementById('drive-connections-list');
  if (!emailList) return;
  if (!emails.length) {
    emailList.innerHTML = '<span class="connection-status">No email accounts connected</span>';
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
      disconnectEmail(btn.getAttribute('data-email'), emails, supabase, userId);
    });
  });
}

function disconnectEmail(email, emails, supabase, userId) {
  var updated = emails.filter(function(e) { return e !== email; });
  supabase.from('profiles').update({ cl_connected_emails: updated }).eq('id', userId)
    .then(function() { renderEmailList(updated, supabase, userId); });
}

function handleOAuthConnect(provider, supabase) {
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
}

// DRIVE

function renderDriveList(connected, supabase, userId) {
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
        .then(function() { renderDriveList(false, supabase, userId); });
    });
  } else {
    list.innerHTML = '<button type="button" class="btn-connect" id="add-drive-btn">Connect Google Drive</button>';
    handleOAuthConnect('google', supabase);
  }
}

// WEBSITE URLS

function renderWebsiteUrls(urls, supabase, userId) {
  var list = document.getElementById('website-urls-list');
  var addBtn = document.getElementById('add-website-btn');
  var saveBtn = document.getElementById('website-save-btn');
  if (!list) return;

  function render(currentUrls) {
    var html = '';
    currentUrls.forEach(function(url, idx) {
      html += '<div class="website-url-item">' +
        '<input type="url" class="website-url-input" value="' + url + '" data-index="' + idx + '">' +
        '<button type="button" class="btn-remove-url" data-index="' + idx + '">×</button>' +
        '</div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.btn-remove-url').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        currentUrls.splice(idx, 1);
        render(currentUrls);
      });
    });
  }

  render(urls);

  if (addBtn) {
    addBtn.addEventListener('click', function() {
      urls.push('');
      render(urls);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      var inputs = list.querySelectorAll('.website-url-input');
      var updated = [];
      inputs.forEach(function(inp) { if (inp.value.trim()) updated.push(inp.value.trim()); });
      supabase.from('profiles').update({ website_urls: updated }).eq('id', userId)
        .then(function(res) {
          if (!res.error) { urls = updated; render(urls); }
        });
    });
  }
}

// INIT

document.addEventListener('DOMContentLoaded', function() {
  if (window.supabase && window.CL_SETTINGS_LOGIC) {
    window.CL_SETTINGS_LOGIC.init(window.supabase);
  }
});
