// cl-settings-logic.js — Content Library Settings logic
// Part of Content Library split architecture
// window.CL_SETTINGS_LOGIC handles scan frequency, categories, and connections

window.CL_SETTINGS_LOGIC = {

  // ── STATE
  _supabase: null,
  _userId: null,
  _settings: {},
  _activeCategories: [],
  _customCategories: [],

  // ── ENTRY POINT
  init: function(supabase) {
    this._supabase = supabase;
    this._loadAll();
  },

  // ── ORCHESTRATION
  _loadAll: async function() {
    var self = this;
    try {
      var authResp = await self._supabase.auth.getUser();
      if (!authResp.data || !authResp.data.user) return;
      self._userId = authResp.data.user.id;
      await Promise.all([
        self._loadSettings(),
        self._loadCategories(),
        self._renderWebsiteUrls()
      ]);
      self._bindAll();
    } catch (e) {
      console.error('CL_SETTINGS_LOGIC._loadAll error:', e);
    }
  },

  // ── BIND ALL — called after _loadAll resolves, _userId guaranteed set
  _bindAll: function() {
    this._bindToggleButtons();
    this._bindSaveSettings();
    this._bindCategoriesUI();
    this._bindConnections();
  },

  // ── SCAN SETTINGS

  _loadSettings: async function() {
    var self = this;
    var resp = await self._supabase
      .from('cl_settings')
      .select('email_scan_frequency, drive_scan_frequency, website_scan_frequency')
      .eq('user_id', self._userId)
      .maybeSingle();
    if (resp.data) {
      self._settings = resp.data;
    } else {
      self._settings = {
        email_scan_frequency: 'daily',
        drive_scan_frequency: 'weekly',
        website_scan_frequency: 'weekly'
      };
    }
    self._applySettingsToUI();
  },

  _applySettingsToUI: function() {
    var self = this;
    document.querySelectorAll('.freq-btn').forEach(function(btn) {
      var field = btn.getAttribute('data-field');
      var value = btn.getAttribute('data-value');
      if (field && value) {
        btn.classList.toggle('active', self._settings[field] === value);
      }
    });
  },

  _saveSettings: async function() {
    var self = this;
    var resp = await self._supabase
      .from('cl_settings')
      .upsert({
        user_id: self._userId,
        email_scan_frequency: self._settings.email_scan_frequency || 'daily',
        drive_scan_frequency: self._settings.drive_scan_frequency || 'weekly',
        website_scan_frequency: self._settings.website_scan_frequency || 'weekly',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    if (resp.error) {
      self._showMsg('save-scan-msg', 'Error saving settings.', 'error');
    } else {
      self._showMsg('save-scan-msg', 'Saved.', 'success');
    }
  },

  _bindSaveSettings: function() {
    var self = this;
    var btn = document.getElementById('save-settings-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        self._saveSettings();
      });
    }
  },

  _bindToggleButtons: function() {
    var self = this;
    var card = document.getElementById('scan-frequency-card');
    if (!card) return;
    card.addEventListener('click', function(e) {
      var btn = e.target.closest('.freq-btn');
      if (!btn) return;
      var field = btn.getAttribute('data-field');
      var value = btn.getAttribute('data-value');
      if (!field || !value) return;
      self._settings[field] = value;
      card.querySelectorAll('.freq-btn[data-field="' + field + '"]').forEach(function(b) {
        b.classList.toggle('active', b.getAttribute('data-value') === value);
      });
    });
  },

  // ── CATEGORIES

  _loadCategories: async function() {
    var self = this;
    var defaultCategories = [
      'Services', 'Products', 'Pricing', 'Process',
      'Compliance', 'Team', 'Projects', 'Testimonials'
    ];
    var resp = await self._supabase
      .from('profiles')
      .select('cl_active_categories, cl_custom_categories')
      .eq('user_id', self._userId)
      .maybeSingle();
    if (resp.data) {
      self._activeCategories = resp.data.cl_active_categories || defaultCategories.slice();
      self._customCategories = resp.data.cl_custom_categories || [];
    } else {
      self._activeCategories = defaultCategories.slice();
      self._customCategories = [];
    }
    self._renderCategories();
  },

  _renderCategories: function() {
    var self = this;
    var grid = document.getElementById('category-grid');
    if (!grid) return;
    var defaultCategories = [
      'Services', 'Products', 'Pricing', 'Process',
      'Compliance', 'Team', 'Projects', 'Testimonials'
    ];
    var html = '';
    // Default categories — toggle only, no remove
    defaultCategories.forEach(function(cat) {
      var isActive = self._activeCategories.indexOf(cat) > -1;
      html += '<div class="category-row">' +
        '<span class="category-label">' + cat + '</span>' +
        '<div class="category-toggle-group">' +
        '<button class="category-toggle-btn' + (isActive ? ' active' : '') + '" data-category="' + cat + '" data-state="on">On</button>' +
        '<button class="category-toggle-btn' + (!isActive ? ' active' : '') + '" data-category="' + cat + '" data-state="off">Off</button>' +
        '</div>' +
        '</div>';
    });
    // Custom categories — toggle + remove
    self._customCategories.forEach(function(cat) {
      var isActive = self._activeCategories.indexOf(cat) > -1;
      html += '<div class="category-row">' +
        '<span class="category-label">' + cat + '</span>' +
        '<div class="category-toggle-group">' +
        '<button class="category-toggle-btn' + (isActive ? ' active' : '') + '" data-category="' + cat + '" data-state="on">On</button>' +
        '<button class="category-toggle-btn' + (!isActive ? ' active' : '') + '" data-category="' + cat + '" data-state="off">Off</button>' +
        '</div>' +
        '<button class="btn-remove-category" data-category="' + cat + '" title="Remove">&#10005;</button>' +
        '</div>';
    });
    grid.innerHTML = html;
  },

  _saveCategories: async function() {
    var self = this;
    if (!self._userId) return;
    var resp = await self._supabase
      .from('profiles')
      .update({
        cl_active_categories: self._activeCategories,
        cl_custom_categories: self._customCategories
      })
      .eq('user_id', self._userId);
    if (resp.error) {
      self._showMsg('save-categories-msg', 'Error saving categories.', 'error');
    } else {
      self._showMsg('save-categories-msg', 'Saved.', 'success');
    }
  },

  _bindCategoriesUI: function() {
    var self = this;

    // Toggle and remove — event delegation on category-grid
    var grid = document.getElementById('category-grid');
    if (grid) {
      grid.addEventListener('click', function(e) {
        // Toggle On/Off
        var toggleBtn = e.target.closest('.category-toggle-btn');
        if (toggleBtn) {
          var cat = toggleBtn.getAttribute('data-category');
          var state = toggleBtn.getAttribute('data-state');
          if (!cat || !state) return;
          var idx = self._activeCategories.indexOf(cat);
          if (state === 'on' && idx === -1) {
            self._activeCategories.push(cat);
          } else if (state === 'off' && idx > -1) {
            self._activeCategories.splice(idx, 1);
          }
          var row = toggleBtn.closest('.category-row');
          if (row) {
            var isNowActive = self._activeCategories.indexOf(cat) > -1;
            row.querySelectorAll('.category-toggle-btn').forEach(function(b) {
              b.classList.toggle('active', (b.getAttribute('data-state') === 'on') === isNowActive);
            });
          }
          return;
        }
        // Remove custom category
        var removeBtn = e.target.closest('.btn-remove-category');
        if (removeBtn) {
          var cat = removeBtn.getAttribute('data-category');
          if (!cat) return;
          self._customCategories = self._customCategories.filter(function(c) { return c !== cat; });
          self._activeCategories = self._activeCategories.filter(function(c) { return c !== cat; });
          self._renderCategories();
        }
      });
    }

    // Add custom category
    var addBtn = document.getElementById('add-category-btn');
    var input = document.getElementById('category-custom-input');
    if (addBtn && input) {
      addBtn.addEventListener('click', function() {
        var val = input.value.trim();
        if (!val) return;
        if (self._customCategories.indexOf(val) > -1 || self._activeCategories.indexOf(val) > -1) return;
        self._customCategories.push(val);
        self._activeCategories.push(val);
        input.value = '';
        self._renderCategories();
      });
    }

    // Save categories
    var saveBtn = document.getElementById('save-categories-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        self._saveCategories();
      });
    }
  },

  // ── CONNECTIONS / WEBSITE

  _renderWebsiteUrls: async function() {
    var self = this;
    var list = document.getElementById('website-urls-list');
    if (!list) return;
    var resp = await self._supabase
      .from('profiles')
      .select('website_urls')
      .eq('user_id', self._userId)
      .maybeSingle();
    var urls = (resp.data && resp.data.website_urls) ? resp.data.website_urls : [];
    var html = '';
    urls.forEach(function(url) {
      html += '<div class="website-url-item">' +
        '<span class="website-url-text">' + url + '</span>' +
        '<button class="btn-remove-url" data-url="' + url + '">Remove</button>' +
        '</div>';
    });
    list.innerHTML = html;
  },

  _saveWebsiteUrl: async function(url) {
    var self = this;
    if (!url) return;
    var resp = await self._supabase
      .from('profiles')
      .select('website_urls')
      .eq('user_id', self._userId)
      .maybeSingle();
    var existing = (resp.data && resp.data.website_urls) ? resp.data.website_urls : [];
    if (existing.indexOf(url) > -1) return;
    existing.push(url);
    await self._supabase
      .from('profiles')
      .update({ website_urls: existing })
      .eq('user_id', self._userId);
    self._renderWebsiteUrls();
  },

  _bindConnections: function() {
    var self = this;

    // Website save
    var websiteSaveBtn = document.getElementById('website-save-btn');
    var websiteInput = document.getElementById('website-url-input');
    if (websiteSaveBtn && websiteInput) {
      websiteSaveBtn.addEventListener('click', function() {
        var url = websiteInput.value.trim();
        if (!url) return;
        self._saveWebsiteUrl(url).then(function() {
          websiteInput.value = '';
        });
      });
    }

    // Website remove — event delegation
    var urlsList = document.getElementById('website-urls-list');
    if (urlsList) {
      urlsList.addEventListener('click', async function(e) {
        var btn = e.target.closest('.btn-remove-url');
        if (!btn) return;
        var url = btn.getAttribute('data-url');
        var resp = await self._supabase
          .from('profiles')
          .select('website_urls')
          .eq('user_id', self._userId)
          .maybeSingle();
        var existing = (resp.data && resp.data.website_urls) ? resp.data.website_urls : [];
        existing = existing.filter(function(u) { return u !== url; });
        await self._supabase
          .from('profiles')
          .update({ website_urls: existing })
          .eq('user_id', self._userId);
        self._renderWebsiteUrls();
      });
    }
  },

  // ── UTILITIES

  _showMsg: function(id, text, type) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = type === 'error' ? '#c0392b' : '#27ae60';
    el.style.display = 'inline';
    setTimeout(function() { el.style.display = 'none'; }, 3000);
  }

};
