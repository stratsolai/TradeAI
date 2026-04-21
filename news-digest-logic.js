window.ND_LOGIC = {

  _supabase: null,
  _userId: null,
  _token: null,
  _briefings: [],
  _tenders: [],
  _lastRefreshed: null,

  CATEGORIES: [
    { id: 'regulatory', label: 'Regulatory & Compliance' },
    { id: 'industry-news', label: 'Industry News' },
    { id: 'suppliers', label: 'Supplier & Materials' },
    { id: 'economic', label: 'Economic & Market' },
    { id: 'technology', label: 'Technology & Innovation' }
  ],

  init: async function(supabase, user) {
    if (!supabase || !user) {
      console.error('[ND] supabase client or user not provided');
      return;
    }
    this._supabase = supabase;
    this._userId = user.id;
    try {
      var sessionRes = await supabase.auth.getSession();
      this._token = (sessionRes.data && sessionRes.data.session) ? sessionRes.data.session.access_token : null;
    } catch (e) {
      console.error('[ND] Session fetch error:', e.message);
    }
    this._bindTabs();
    this._bindRefresh();
    await this._loadData();
  },

  // ── TAB SWITCHING ────────────────────────────────────────────────────

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
    });
    document.querySelectorAll('.ptab-content').forEach(function(panel) {
      panel.classList.remove('active');
    });
    var target = document.getElementById('nd-tab-' + tabId);
    if (target) target.classList.add('active');
  },

  // ── REFRESH ──────────────────────────────────────────────────────────

  _bindRefresh: function() {
    var self = this;
    var btn = document.getElementById('nd-refresh-btn');
    if (btn) {
      btn.addEventListener('click', function() { self._refresh(); });
    }
  },

  _refresh: async function() {
    var btn = document.getElementById('nd-refresh-btn');
    var tsEl = document.getElementById('nd-last-refreshed');
    if (btn) { btn.textContent = 'Refreshing...'; btn.disabled = true; }
    try {
      var res = await fetch('/api/news-digest-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this._token
        },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function() { return {}; });
        throw new Error(errBody.error || 'Refresh failed (' + res.status + ')');
      }
      await this._loadData();
    } catch (e) {
      console.error('[ND] Refresh error:', e.message);
      if (tsEl) tsEl.textContent = 'Refresh failed. Please try again.';
    }
    if (btn) { btn.textContent = 'Refresh Now'; btn.disabled = false; }
  },

  // ── DATA LOADING ─────────────────────────────────────────────────────

  _loadData: async function() {
    await Promise.all([
      this._loadBriefings(),
      this._loadTenders(),
      this._loadSettings()
    ]);
    this._renderAll();
  },

  _loadBriefings: async function() {
    try {
      var res = await this._supabase
        .from('news_digest_briefings')
        .select('*')
        .eq('user_id', this._userId);
      if (res.error) {
        console.error('[ND] Load briefings error:', res.error.message);
        this._briefings = [];
        return;
      }
      this._briefings = res.data || [];
    } catch (e) {
      console.error('[ND] Load briefings exception:', e.message);
      this._briefings = [];
    }
  },

  _loadTenders: async function() {
    try {
      var res = await this._supabase
        .from('news_digest_tenders')
        .select('*')
        .eq('user_id', this._userId)
        .order('close_date', { ascending: true });
      if (res.error) {
        console.error('[ND] Load tenders error:', res.error.message);
        this._tenders = [];
        return;
      }
      this._tenders = res.data || [];
    } catch (e) {
      console.error('[ND] Load tenders exception:', e.message);
      this._tenders = [];
    }
  },

  _loadSettings: async function() {
    try {
      var res = await this._supabase
        .from('news_digest_settings')
        .select('summary_generated_at')
        .eq('user_id', this._userId)
        .maybeSingle();
      if (res.error) {
        console.error('[ND] Load settings error:', res.error.message);
        this._lastRefreshed = null;
        return;
      }
      this._lastRefreshed = (res.data && res.data.summary_generated_at) ? new Date(res.data.summary_generated_at) : null;
    } catch (e) {
      console.error('[ND] Load settings exception:', e.message);
      this._lastRefreshed = null;
    }
  },

  // ── RENDERING ────────────────────────────────────────────────────────

  _renderAll: function() {
    this._renderTimestamp();
    this._renderSummary();
    var self = this;
    this.CATEGORIES.forEach(function(cat) {
      self._renderCategory(cat.id);
    });
    this._renderGrantsTenders();
  },

  _renderTimestamp: function() {
    var el = document.getElementById('nd-last-refreshed');
    if (!el) return;
    el.textContent = this._lastRefreshed
      ? 'Last refreshed: ' + this._relativeTime(this._lastRefreshed)
      : '';
  },

  // ── SUMMARY TAB ──────────────────────────────────────────────────────

  _renderSummary: function() {
    var content = document.getElementById('nd-content-summary');
    var empty = document.getElementById('nd-empty-summary');
    if (!content) return;

    var hasBriefings = this._briefings.length > 0;
    var hasTenders = this._tenders.length > 0;

    if (!hasBriefings && !hasTenders) {
      if (empty) empty.hidden = false;
      content.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';

    this.CATEGORIES.forEach(function(cat) {
      var briefing = self._getBriefing(cat.id);
      html += '<div class="settings-card">'
        + '<div class="settings-card-header">'
        + '<div class="settings-card-title">' + escHtml(cat.label) + '</div>';
      if (briefing && briefing.headline) {
        html += '<div class="settings-card-hint">' + escHtml(briefing.headline) + '</div>';
      } else {
        html += '<div class="settings-card-hint">No updates available for this category.</div>';
      }
      html += '</div>';
      if (briefing && briefing.headline) {
        html += '<div class="settings-rows"><div class="settings-row">'
          + '<a href="#" class="nd-view-link" data-tab="' + cat.id + '">View full briefing &#8250;</a>'
          + '</div></div>';
      }
      html += '</div>';
    });

    var gtBriefing = self._getBriefing('grants-tenders');
    html += '<div class="settings-card">'
      + '<div class="settings-card-header">'
      + '<div class="settings-card-title">Grants &amp; Tenders</div>';
    if (gtBriefing && gtBriefing.headline) {
      html += '<div class="settings-card-hint">' + escHtml(gtBriefing.headline) + '</div>';
    } else if (hasTenders) {
      html += '<div class="settings-card-hint">' + self._tenders.length + ' active tender' + (self._tenders.length !== 1 ? 's' : '') + ' found.</div>';
    } else {
      html += '<div class="settings-card-hint">No updates available for this category.</div>';
    }
    html += '</div>';
    if ((gtBriefing && gtBriefing.headline) || hasTenders) {
      html += '<div class="settings-rows"><div class="settings-row">'
        + '<a href="#" class="nd-view-link" data-tab="grants-tenders">View full briefing &#8250;</a>'
        + '</div></div>';
    }
    html += '</div>';

    content.innerHTML = html;

    content.querySelectorAll('.nd-view-link').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        self._switchTab(link.dataset.tab);
      });
    });
  },

  // ── CATEGORY TABS ────────────────────────────────────────────────────

  _renderCategory: function(categoryId) {
    var content = document.getElementById('nd-content-' + categoryId);
    var empty = document.getElementById('nd-empty-' + categoryId);
    if (!content) return;

    var briefing = this._getBriefing(categoryId);
    if (!briefing || !briefing.headline) {
      if (empty) empty.hidden = false;
      content.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;

    var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];
    var html = '<h3>' + escHtml(briefing.headline) + '</h3>'
      + '<p></p>';

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var sources = Array.isArray(bullet.sources) ? bullet.sources : [];
      var bulletId = categoryId + '-bullet-' + i;

      html += '<div class="item-card">'
        + '<div class="item-card-header">'
        + '<span>' + escHtml(bullet.text || '') + '</span>'
        + '<div class="item-card-btns">'
        + '<button class="source-btn nd-toggle-sources" data-target="' + bulletId + '">&#9654; Sources (' + sources.length + ')</button>'
        + '</div>'
        + '</div>'
        + '<div class="item-section" id="' + bulletId + '" hidden>'
        + '<div class="item-section-head"><span class="section-head-label">Sources</span></div>'
        + '<div class="source-detail">' + this._renderSources(sources) + '</div>'
        + '</div>'
        + '</div>';
    }

    content.innerHTML = html;
    this._bindBulletEvents(content);
  },

  _renderSources: function(sources) {
    if (!sources.length) return '<div>No sources available.</div>';
    var html = '';
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      var name = escHtml(src.name || 'Unknown source');
      var domain = escHtml(src.domain || '');
      var url = src.url || '';
      var type = src.type || 'secondary';
      var badgeClass = type === 'primary' ? 'badge-green'
        : type === 'email' ? 'badge-blue'
        : 'badge-grey';
      var badgeLabel = type === 'primary' ? 'Primary'
        : type === 'email' ? 'Email'
        : 'Secondary';

      html += '<div>';
      if (url) {
        html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + name + '</a>';
      } else {
        html += '<span>' + name + '</span>';
      }
      if (domain) {
        html += ' <span class="source-detail-label">' + domain + '</span>';
      }
      html += ' <span class="badge ' + badgeClass + '">' + badgeLabel + '</span>';
      html += '</div>';
    }
    return html;
  },

  _bindBulletEvents: function(container) {
    container.querySelectorAll('.nd-toggle-sources').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(btn.dataset.target);
        if (!target) return;
        var isOpen = !target.hidden;
        target.hidden = isOpen;
        btn.classList.toggle('open', !isOpen);
        btn.innerHTML = (!isOpen ? '&#9660;' : '&#9654;') + ' Sources (' + (target.querySelectorAll('.source-detail > div').length) + ')';
      });
    });
  },

  // ── GRANTS & TENDERS TAB ─────────────────────────────────────────────

  _renderGrantsTenders: function() {
    var content = document.getElementById('nd-content-grants-tenders');
    var empty = document.getElementById('nd-empty-grants-tenders');
    if (!content) return;

    var briefing = this._getBriefing('grants-tenders');
    var hasBriefing = briefing && briefing.headline;
    var hasTenders = this._tenders.length > 0;

    if (!hasBriefing && !hasTenders) {
      if (empty) empty.hidden = false;
      content.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;

    var html = '';

    if (hasBriefing) {
      var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];
      html += '<h3>' + escHtml(briefing.headline) + '</h3><p></p>';

      for (var i = 0; i < bullets.length; i++) {
        var bullet = bullets[i];
        var sources = Array.isArray(bullet.sources) ? bullet.sources : [];
        var bulletId = 'gt-bullet-' + i;

        html += '<div class="item-card">'
          + '<div class="item-card-header">'
          + '<span>' + escHtml(bullet.text || '') + '</span>'
          + '<div class="item-card-btns">'
          + '<button class="source-btn nd-toggle-sources" data-target="' + bulletId + '">&#9654; Sources (' + sources.length + ')</button>'
          + '</div>'
          + '</div>'
          + '<div class="item-section" id="' + bulletId + '" hidden>'
          + '<div class="item-section-head"><span class="section-head-label">Sources</span></div>'
          + '<div class="source-detail">' + this._renderSources(sources) + '</div>'
          + '</div>'
          + '</div>';
      }
    }

    html += '<div class="section-label">Active Government Tenders</div>';

    if (!hasTenders) {
      html += '<div class="list-empty">No active government tenders found for your industry at this time.</div>';
    } else {
      for (var t = 0; t < this._tenders.length; t++) {
        html += this._renderTenderCard(this._tenders[t]);
      }
    }

    html += '<p class="page-subtitle">Additional state and territory tender sources coming soon.</p>';

    content.innerHTML = html;
    this._bindBulletEvents(content);
  },

  _renderTenderCard: function(tender) {
    var title = escHtml(tender.title || 'Untitled tender');
    var agency = escHtml(tender.agency || '');
    var location = escHtml(tender.location || '');
    var description = escHtml(tender.description || '');
    var url = tender.url || '';
    var source = tender.source || 'AusTender';
    var closeDate = tender.close_date || '';

    var isUrgent = false;
    var closeDateDisplay = '';
    if (closeDate) {
      var closeObj = new Date(closeDate);
      if (!isNaN(closeObj.getTime())) {
        closeDateDisplay = closeObj.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        var daysUntil = Math.ceil((closeObj.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        isUrgent = daysUntil >= 0 && daysUntil <= 7;
      }
    }

    var sourceBadgeClass = source === 'NSW eTendering' ? 'badge-purple' : 'badge-blue';
    var sourceBadgeLabel = source === 'NSW eTendering' ? 'NSW' : 'Federal';

    var html = '<div class="item-card">'
      + '<div class="item-card-header">';

    if (url) {
      html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener"><strong>' + title + '</strong></a>';
    } else {
      html += '<strong>' + title + '</strong>';
    }

    html += '<div class="item-card-btns">'
      + '<span class="badge ' + sourceBadgeClass + '">' + sourceBadgeLabel + '</span>'
      + '</div>'
      + '</div>';

    html += '<div class="source-detail">';
    if (agency) html += '<div><span class="source-detail-label">Agency:</span> ' + agency + '</div>';
    if (closeDateDisplay) {
      html += '<div><span class="source-detail-label">Closes:</span> '
        + '<span class="badge ' + (isUrgent ? 'badge-red' : 'badge-grey') + '">' + closeDateDisplay + '</span>';
      if (isUrgent) html += ' <span class="badge badge-red">Closing soon</span>';
      html += '</div>';
    }
    if (location) html += '<div><span class="source-detail-label">Location:</span> ' + location + '</div>';
    if (description) html += '<div>' + description + '</div>';
    html += '</div>'
      + '</div>';

    return html;
  },

  // ── UTILITIES ────────────────────────────────────────────────────────

  _getBriefing: function(categoryId) {
    return this._briefings.find(function(b) { return b.category === categoryId; }) || null;
  },

  _relativeTime: function(date) {
    var diffMs = Date.now() - date.getTime();
    var diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return diffMins + ' min' + (diffMins !== 1 ? 's' : '') + ' ago';
    var diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
    var diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

};
