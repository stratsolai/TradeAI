window.ND_LOGIC = {

  _supabase: null,
  _userId: null,
  _briefings: [],
  _tenders: [],
  _lastRefreshed: null,

  CATEGORIES: [
    { id: 'regulatory', label: 'Rules' },
    { id: 'industry-news', label: 'News' },
    { id: 'suppliers', label: 'Supply' },
    { id: 'economic', label: 'Markets' },
    { id: 'technology', label: 'Tech' }
  ],

  init: async function(supabase, user) {
    if (!supabase || !user) {
      console.error('[ND] supabase client or user not provided');
      return;
    }
    this._supabase = supabase;
    this._userId = user.id;
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
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) {
        throw new Error('Your session has expired. Please sign out and sign back in.');
      }
      var res = await fetch('/api/news-digest-refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
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
      if (tsEl) tsEl.textContent = e.message;
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
    var html = '<div class="nd-tile-grid">';

    this.CATEGORIES.forEach(function(cat) {
      var briefing = self._getBriefing(cat.id);
      html += self._renderSummaryTile(cat, briefing);
    });

    var gtBriefing = self._getBriefing('grants-tenders');
    var gtCat = { id: 'grants-tenders', label: 'Tenders' };
    if (gtBriefing && gtBriefing.headline) {
      html += self._renderSummaryTile(gtCat, gtBriefing);
    } else if (hasTenders) {
      html += '<div class="nd-tile">'
        + '<div class="nd-tile-label">' + escHtml(gtCat.label) + '</div>'
        + '<div class="nd-tile-headline">' + self._tenders.length + ' active tender' + (self._tenders.length !== 1 ? 's' : '') + ' found</div>'
        + '<div class="nd-tile-footer">'
        + '<a href="#" class="nd-view-link" data-tab="grants-tenders">View tenders &#8250;</a>'
        + '</div></div>';
    } else {
      html += self._renderSummaryTile(gtCat, null);
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

  _renderSummaryTile: function(cat, briefing) {
    var hasBriefing = briefing && briefing.headline;
    var tileClass = 'nd-tile' + (!hasBriefing ? ' nd-tile-empty' : '');
    var html = '<div class="' + tileClass + '">'
      + '<div class="nd-tile-label">' + escHtml(cat.label) + '</div>';

    if (!hasBriefing) {
      html += '<div class="nd-tile-headline">No updates available</div></div>';
      return html;
    }

    html += '<div class="nd-tile-headline">' + escHtml(this._shortHeadline(briefing.headline, 8)) + '</div>';

    var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];
    if (bullets.length > 0) {
      var previewCount = Math.min(bullets.length, 3);
      var totalSources = 0;
      html += '<ul class="nd-tile-bullets">';
      for (var i = 0; i < previewCount; i++) {
        var text = bullets[i].text || '';
        if (text.length > 120) text = text.substring(0, 117) + '...';
        html += '<li>' + escHtml(text) + '</li>';
      }
      html += '</ul>';
      for (var s = 0; s < bullets.length; s++) {
        totalSources += Array.isArray(bullets[s].sources) ? bullets[s].sources.length : 0;
      }
      html += '<div class="nd-tile-footer">'
        + '<a href="#" class="nd-view-link" data-tab="' + cat.id + '">View full briefing &#8250;</a>'
        + '<span class="nd-tile-source-count">' + totalSources + ' source' + (totalSources !== 1 ? 's' : '') + '</span>'
        + '</div>';
    }

    html += '</div>';
    return html;
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
    var html = '<div class="nd-detail-headline">' + escHtml(briefing.headline) + '</div>'
      + '<div class="nd-tile-grid">';

    for (var i = 0; i < bullets.length; i++) {
      var bullet = bullets[i];
      var sources = Array.isArray(bullet.sources) ? bullet.sources : [];
      var bulletId = categoryId + '-bullet-' + i;
      var heading = this._shortHeadline(bullet.text || '', 10);
      var points = this._splitBullets(bullet.text || '');

      html += '<div class="nd-tile">'
        + '<div class="nd-tile-heading">' + escHtml(heading) + '</div>'
        + '<ul class="nd-tile-bullet-list">';
      for (var p = 0; p < points.length; p++) {
        html += '<li>' + escHtml(points[p]) + '</li>';
      }
      html += '</ul>'
        + '<div class="nd-tile-footer">'
        + '<button class="source-btn nd-toggle-sources" data-target="' + bulletId + '">&#9654; Sources (' + sources.length + ')</button>'
        + '</div>'
        + '<div class="nd-source-panel" id="' + bulletId + '" hidden>'
        + this._renderSources(sources)
        + '</div>'
        + '</div>';
    }

    html += '</div>';
    content.innerHTML = html;
    this._bindSourceToggles(content);
  },

  _renderSources: function(sources) {
    if (!sources.length) return '<div class="nd-source-plain">No sources available.</div>';
    var html = '';
    for (var i = 0; i < sources.length; i++) {
      var src = sources[i];
      var name = src.name || 'Unknown source';
      var domain = src.domain || '';
      var url = src.url || '';
      var linkText = name;
      var type = src.type || 'secondary';
      var badgeClass = type === 'primary' ? 'badge-green'
        : type === 'email' ? 'badge-blue'
        : 'badge-grey';
      var badgeLabel = type === 'primary' ? 'Primary'
        : type === 'email' ? 'Email'
        : 'Secondary';

      html += '<div class="nd-source-row">';
      if (url) {
        html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" class="nd-source-link">'
          + escHtml(linkText) + '</a>';
        if (domain) html += ' <span class="nd-source-plain">' + escHtml(domain) + '</span>';
      } else if (domain) {
        html += '<span class="nd-source-plain">' + escHtml(name) + ' (' + escHtml(domain) + ')</span>';
      } else {
        html += '<span class="nd-source-plain">' + escHtml(name) + '</span>';
      }
      html += ' <span class="badge ' + badgeClass + '">' + badgeLabel + '</span>';
      html += '</div>';
    }
    return html;
  },

  _bindSourceToggles: function(container) {
    container.querySelectorAll('.nd-toggle-sources').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = document.getElementById(btn.dataset.target);
        if (!target) return;
        var isOpen = !target.hidden;
        target.hidden = isOpen;
        btn.classList.toggle('open', !isOpen);
        var count = target.querySelectorAll('.nd-source-row').length;
        btn.innerHTML = (!isOpen ? '&#9660;' : '&#9654;') + ' Sources (' + count + ')';
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
      html += '<div class="nd-detail-headline">' + escHtml(briefing.headline) + '</div>'
        + '<div class="nd-tile-grid">';

      for (var i = 0; i < bullets.length; i++) {
        var bullet = bullets[i];
        var sources = Array.isArray(bullet.sources) ? bullet.sources : [];
        var bulletId = 'gt-bullet-' + i;
        var heading = this._shortHeadline(bullet.text || '', 10);
        var points = this._splitBullets(bullet.text || '');

        html += '<div class="nd-tile">'
          + '<div class="nd-tile-heading">' + escHtml(heading) + '</div>'
          + '<ul class="nd-tile-bullet-list">';
        for (var p = 0; p < points.length; p++) {
          html += '<li>' + escHtml(points[p]) + '</li>';
        }
        html += '</ul>'
          + '<div class="nd-tile-footer">'
          + '<button class="source-btn nd-toggle-sources" data-target="' + bulletId + '">&#9654; Sources (' + sources.length + ')</button>'
          + '</div>'
          + '<div class="nd-source-panel" id="' + bulletId + '" hidden>'
          + this._renderSources(sources)
          + '</div>'
          + '</div>';
      }

      html += '</div>';
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
    this._bindSourceToggles(content);
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

  _shortHeadline: function(text, maxWords) {
    if (!text) return '';
    var words = text.split(/\s+/);
    var limit = maxWords || 8;
    if (words.length <= limit) return text.replace(/\.+$/, '');
    return words.slice(0, limit).join(' ') + '...';
  },

  _splitBullets: function(text) {
    if (!text) return [];
    var sentences = text.split(/(?<=[.?])\s+/);
    var points = [];
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (s.length > 10) points.push(s);
    }
    if (points.length <= 1) {
      var parts = text.split(/\s*(?:—|–|\bbut\b|\bhowever\b)\s*/i);
      if (parts.length > 1) return parts.filter(function(p) { return p.trim().length > 10; });
    }
    return points.length > 0 ? points : [text];
  },

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
