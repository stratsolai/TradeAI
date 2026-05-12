window.ND_LOGIC = {

  _supabase: null,
  _userId: null,
  _briefings: [],
  _curatedItems: {},
  _tenders: [],
  _lastRefreshed: null,

  // _briefings (old) feeds Summary only — that tab is out of scope
  // for Phase 5 and continues to render against the soon-to-be-empty
  // briefing source.
  // _curatedItems (new) feeds the five category tabs. Keyed by
  // category (regulatory / industry-news / suppliers / economic /
  // technology), each value is an array of shared_research rows
  // for this user where is_current = true.

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
    if (!(await window.checkToolAccess('news-digest', supabase, user))) return;
    this._supabase = supabase;
    this._userId = user.id;
    this._bindTabs();
    this._bindRefresh();
    await this._loadData();
    this._applyInitialTab();
  },

  _applyInitialTab: function() {
    var hash = (window.location.hash || '').replace('#', '');
    if (!hash) return;
    var allowed = ['summary', 'regulatory', 'industry-news', 'suppliers', 'economic', 'technology', 'grants-tenders'];
    if (allowed.indexOf(hash) !== -1) this._switchTab(hash);
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
    var self = this;
    this._setRefreshButton(true);

    var sessionRes = await this._supabase.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session || !session.access_token) {
      this._showError('Could not verify your session. Please refresh the page and try again.');
      this._setRefreshButton(false);
      return;
    }
    var token = session.access_token;

    // Progressive rendering — tender fetch (~few seconds) and the
    // Shared Research Layer refresh (~17-35s) fire in parallel. Each
    // one renders its own portion as soon as it returns. The five
    // news tabs show a loading placeholder until the shared refresh
    // completes; the Grants & Tenders tab populates on the tender
    // call's return.
    this._showNewsTabsLoading();

    var tenderPromise = this._refreshTenders(token).catch(function(e) {
      console.error('[ND] Tender refresh error:', e && e.message);
      self._showError('Could not refresh tenders. Please try again.');
    });
    var sharedPromise = this._refreshSharedResearch(token).catch(function(e) {
      console.error('[ND] Shared research refresh error:', e && e.message);
      self._showNewsTabsError('Could not refresh news. Please try again.');
    });

    await Promise.allSettled([tenderPromise, sharedPromise]);
    this._setRefreshButton(false);
  },

  _setRefreshButton: function(busy) {
    var btn = document.getElementById('nd-refresh-btn');
    if (!btn) return;
    btn.textContent = busy ? 'Refreshing...' : 'Refresh Now';
    btn.disabled = !!busy;
  },

  _refreshTenders: async function(token) {
    var res = await fetch('/api/news-digest-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function() { return {}; });
      throw new Error(errBody.error || ('Tender refresh returned ' + res.status));
    }
    // Re-read tenders + settings (for timestamp) from the DB and
    // rerender the Grants & Tenders tab. Don't rerender Summary or
    // category tabs here — Grants & Tenders is the only thing this
    // call updates.
    await this._loadTenders();
    await this._loadSettings();
    this._renderTimestamp();
    this._renderGrantsTenders();
  },

  _refreshSharedResearch: async function(token) {
    // No force_refresh: the spec mandates ID respects the shared
    // 24-hour cache. force_refresh is diagnostic-only.
    var res = await fetch('/api/shared-research-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ triggered_by_tool: 'id' })
    });
    if (!res.ok) {
      var errBody = await res.json().catch(function() { return {}; });
      throw new Error(errBody.error || ('Shared research returned ' + res.status));
    }
    var body = await res.json();
    // Spec §12.1 — response.items is grouped by category. Empty
    // object on no_results / zero-curated outcomes; either way it's
    // the correct shape for the category render.
    //
    // Listings Addendum §6.1 — drop any item_type = 'listing' rows
    // from each category bucket before populating the tabs. Mirrors
    // the item_type = 'content' predicate added to _loadCuratedItems
    // so the initial-load path and the Refresh path agree.
    var rawItems = (body && body.items) || {};
    var filteredItems = {};
    for (var catKey in rawItems) {
      if (!Object.prototype.hasOwnProperty.call(rawItems, catKey)) continue;
      var bucket = rawItems[catKey] || [];
      filteredItems[catKey] = bucket.filter(function(it) {
        return it && it.item_type === 'content';
      });
    }
    this._curatedItems = filteredItems;
    this._renderAllNewsCategories();
  },

  _showNewsTabsLoading: function() {
    var self = this;
    this.CATEGORIES.forEach(function(cat) {
      var content = document.getElementById('nd-content-' + cat.id);
      var empty = document.getElementById('nd-empty-' + cat.id);
      if (empty) empty.hidden = true;
      if (content) {
        content.innerHTML = '<div class="nd-tab-loading">Loading latest ' + self._escSafe(cat.label.toLowerCase()) + ' updates&hellip;</div>';
      }
    });
  },

  _showNewsTabsError: function(message) {
    this.CATEGORIES.forEach(function(cat) {
      var content = document.getElementById('nd-content-' + cat.id);
      var empty = document.getElementById('nd-empty-' + cat.id);
      if (empty) empty.hidden = true;
      if (content) {
        content.innerHTML = '<div class="nd-tab-loading">' + (window.escHtml ? window.escHtml(message) : message) + '</div>';
      }
    });
  },

  _escSafe: function(s) {
    return window.escHtml ? window.escHtml(s) : String(s == null ? '' : s);
  },

  _renderAllNewsCategories: function() {
    var self = this;
    this.CATEGORIES.forEach(function(cat) { self._renderCategory(cat.id); });
  },

  _showError: function(message) {
    var modal = document.getElementById('nd-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  },

  // ── DATA LOADING ─────────────────────────────────────────────────────

  _loadData: async function() {
    await Promise.all([
      this._loadBriefings(),
      this._loadCuratedItems(),
      this._loadTenders(),
      this._loadSettings()
    ]);
    this._renderAll();
  },

  _loadCuratedItems: async function() {
    // Initial page load: read shared_research rows for this user
    // where is_current = true. Group by category in JS. The Refresh
    // button uses the endpoint response directly (see
    // _refreshSharedResearch) and doesn't re-read the DB.
    //
    // Listings Addendum §6.1 — ID renders factual briefings only and
    // must not show marketplace listings. The third predicate filters
    // listings out at the DB read; the Refresh response path applies
    // the same filter in JS (see _refreshSharedResearch).
    try {
      var res = await this._supabase
        .from('shared_research')
        .select('title, summary, url, source_name, source_domain, source_type, lens, category, published_date')
        .eq('user_id', this._userId)
        .eq('is_current', true)
        .eq('item_type', 'content');
      if (res.error) {
        console.error('[ND] Load curated items error:', res.error.message);
        this._curatedItems = {};
        return;
      }
      var grouped = {};
      var rows = res.data || [];
      for (var i = 0; i < rows.length; i++) {
        var c = rows[i].category;
        if (!c) continue;
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(rows[i]);
      }
      this._curatedItems = grouped;
    } catch (e) {
      console.error('[ND] Load curated items exception:', e.message);
      this._curatedItems = {};
    }
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
    if (!this._lastRefreshed) { el.textContent = ''; return; }
    var d = this._lastRefreshed;
    var date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    var time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
    el.textContent = 'Last refreshed: ' + date + ' at ' + time;
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
    var html = '<div class="tile-grid">';

    this.CATEGORIES.forEach(function(cat) {
      var briefing = self._getBriefing(cat.id);
      html += self._renderSummaryTile(cat, briefing);
    });

    var gtBriefing = self._getBriefing('grants-tenders');
    var gtCat = { id: 'grants-tenders', label: 'Tenders' };
    if (gtBriefing && gtBriefing.headline) {
      html += self._renderSummaryTile(gtCat, gtBriefing);
    } else if (hasTenders) {
      html += '<div class="tile-card nd-tile">'
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
    var tileClass = 'tile-card nd-tile' + (!hasBriefing ? ' tile-card-empty' : '');
    var html = '<div class="' + tileClass + '">'
      + '<div class="nd-tile-label">' + escHtml(cat.label) + '</div>';

    if (!hasBriefing) {
      html += '<div class="nd-tile-headline">No updates available</div></div>';
      return html;
    }

    html += '<div class="nd-tile-headline">' + escHtml(briefing.headline) + '</div>';

    var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];
    if (bullets.length > 0) {
      var previewCount = Math.min(bullets.length, 3);
      var totalSources = 0;
      html += '<ul class="nd-tile-bullets">';
      for (var i = 0; i < previewCount; i++) {
        var summary = this._summaryLine(bullets[i]);
        html += '<li>' + escHtml(summary) + '</li>';
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

    // Phase 5 — data source switched from news_digest_briefings to
    // shared_research (curated items grouped by category). Each
    // shared_research item renders as one tile. No category-level
    // headline — the curation layer produces individual items, not
    // synthesised category summaries.
    var items = (this._curatedItems && this._curatedItems[categoryId]) || [];
    if (items.length === 0) {
      if (empty) empty.hidden = false;
      content.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;

    var html = '<div class="tile-grid">';
    for (var i = 0; i < items.length; i++) {
      html += this._renderCuratedItemTile(items[i]);
    }
    html += '</div>';
    content.innerHTML = html;
  },

  _renderCuratedItemTile: function(item) {
    var title = escHtml(item.title || '');
    var summary = escHtml(item.summary || '');
    var sourceName = item.source_name || '';
    var sourceDomain = item.source_domain || '';
    var url = item.url || '';
    var type = item.source_type || 'secondary';

    // Source-type badge — maps shared_research source_type to the
    // existing badge palette in staxai-auth.css.
    //   primary     -> green  (government / regulator)
    //   association -> purple (industry body / peak association)
    //   secondary   -> grey   (trade press / general media)
    // 'association' uses badge-purple, which already exists on the
    // platform (currently used for the NSW tender source tag); no
    // new CSS classes are introduced.
    var badgeClass = type === 'primary' ? 'badge-green'
      : type === 'association' ? 'badge-purple'
      : 'badge-grey';
    var badgeLabel = type === 'primary' ? 'Primary'
      : type === 'association' ? 'Association'
      : 'Secondary';

    var dateDisplay = '';
    if (item.published_date) {
      var d = new Date(item.published_date);
      if (!isNaN(d.getTime())) {
        dateDisplay = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }

    var html = '<div class="tile-card nd-tile">'
      + '<div class="nd-tile-heading">' + title + '</div>';

    if (summary) {
      html += '<div class="nd-tile-summary">' + summary + '</div>';
    }

    html += '<div class="nd-tile-footer">';
    if (url) {
      html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" class="nd-source-link">'
        + escHtml(sourceName || sourceDomain || 'View source')
        + '</a>';
    } else if (sourceName) {
      html += '<span class="nd-source-plain">' + escHtml(sourceName) + '</span>';
    }
    html += '<span class="badge ' + badgeClass + '">' + badgeLabel + '</span>';
    html += '</div>';

    if (dateDisplay) {
      html += '<div class="nd-tile-date">' + escHtml(dateDisplay) + '</div>';
    }

    html += '</div>';
    return html;
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
        + '<div class="tile-grid">';

      for (var i = 0; i < bullets.length; i++) {
        var bullet = bullets[i];
        var sources = Array.isArray(bullet.sources) ? bullet.sources : [];
        var bulletId = 'gt-bullet-' + i;
        var heading = bullet.title || this._fallbackHeading(bullet.text || '');
        var points = this._splitBullets(bullet.text || '');

        html += '<div class="tile-card nd-tile">'
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

  _summaryLine: function(bullet) {
    var raw = bullet.title || '';
    if (!raw) raw = bullet.text || '';
    if (!raw) return '';
    raw = raw.replace(/\.+$/, '');
    var words = raw.split(/\s+/);
    if (words.length <= 8) return raw;
    return words.slice(0, 8).join(' ');
  },

  _fallbackHeading: function(text) {
    if (!text) return '';
    var end = text.indexOf('. ');
    if (end > 0 && end <= 80) return text.substring(0, end);
    var comma = text.indexOf(', ');
    if (comma > 15 && comma <= 60) return text.substring(0, comma);
    if (text.length <= 60) return text.replace(/\.+$/, '');
    var cut = text.lastIndexOf(' ', 57);
    if (cut < 20) cut = 57;
    return text.substring(0, cut);
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
  }

};
