window.SOCIAL_LOGIC = {

  _supabase: null,
  _userId: null,
  _settings: null,
  _profile: null,
  _currentJourney: null,
  _currentStep: 0,
  _journeyInputs: {},
  _generatedContent: null,
  _mediaFiles: [],
  _mediaUrls: [],
  _selectedConnections: [],
  _draftsPage: 0,
  _scheduledPage: 0,
  _publishedPage: 0,
  _draftsSelected: new Set(),
  _pageSize: 12,
  _scheduledView: 'list',
  _pendingSchedulePostId: null,
  _pendingBulkScheduleIds: null,
  _editingPostId: null,
  _publishedSort: 'newest',

  JOURNEY_GROUPS: [
    {
      id: 'showcase',
      icon: '\u2B50',
      title: 'Showcase Your Work',
      desc: 'Share completed jobs, customer stories, and behind-the-scenes content.',
      journeys: [
        { id: 'finished_job', label: 'Finished Job Post', icon: '\uD83D\uDEE0\uFE0F' },
        { id: 'customer_story', label: 'Customer Story / Testimonial', icon: '\u2B50' },
        { id: 'behind_scenes', label: 'Behind the Scenes', icon: '\uD83C\uDFAC' }
      ]
    },
    {
      id: 'promote',
      icon: '\uD83D\uDCE3',
      title: 'Promote Something',
      desc: 'Launch products, promote events, or share special offers.',
      journeys: [
        { id: 'product_launch', label: 'New Product / Service Launch', icon: '\uD83D\uDE80' },
        { id: 'event_promo', label: 'Event Promotion', icon: '\uD83C\uDF89' },
        { id: 'offer_promo', label: 'Offer / Promotion', icon: '\uD83C\uDFF7\uFE0F' }
      ]
    },
    {
      id: 'expertise',
      icon: '\uD83D\uDCA1',
      title: 'Share Your Expertise',
      desc: 'Position yourself as an expert with insights, tips, and blog content.',
      journeys: [
        { id: 'industry_insight', label: 'Industry Insight / News', icon: '\uD83D\uDCF0' },
        { id: 'tips_advice', label: 'Tips & Advice', icon: '\uD83D\uDCA1' },
        { id: 'blog_content', label: 'Blog Content', icon: '\u270D\uFE0F' }
      ]
    },
    {
      id: 'grow',
      icon: '\uD83D\uDCC8',
      title: 'Grow Your Business',
      desc: 'Share business updates, milestones, and announcements.',
      journeys: [
        { id: 'business_update', label: 'Business Update / Announcement', icon: '\uD83D\uDCE2' }
      ]
    }
  ],

  TONES: [
    { id: 'professional', label: 'Professional', desc: 'Formal, trustworthy, corporate' },
    { id: 'friendly', label: 'Friendly', desc: 'Warm, approachable, conversational' },
    { id: 'casual', label: 'Casual', desc: 'Relaxed, informal, matey' },
    { id: 'bold', label: 'Bold', desc: 'Confident, direct, punchy' },
    { id: 'helpful', label: 'Helpful', desc: 'Supportive, educational, advisory' }
  ],

  JOURNEY_STEPS: {
    finished_job: [
      { id: 'media', title: 'Media', question: 'Add photos or videos of the completed job' },
      { id: 'details', title: 'Details', question: 'Describe the job' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone for your post' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    customer_story: [
      { id: 'project', title: 'Select Project', question: 'Choose a project or enter details manually' },
      { id: 'testimonial', title: 'Testimonial', question: 'What did the customer say?' },
      { id: 'media', title: 'Media', question: 'Add photos or a quote card graphic' },
      { id: 'logo', title: 'Customer Logo', question: 'Add the customer\'s logo (optional)' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone for your post' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    behind_scenes: [
      { id: 'media', title: 'Media', question: 'Upload photos or videos of your team, workspace, or process' },
      { id: 'story_type', title: 'What\'s the Story?', question: 'What kind of behind-the-scenes content is this?' },
      { id: 'details', title: 'Details', question: 'Share some details' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone for your post' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    product_launch: [
      { id: 'what', title: 'What Are You Launching?', question: 'What are you launching?' },
      { id: 'who', title: 'Who Is It For?', question: 'Who is your target customer?' },
      { id: 'why_now', title: 'Why Now?', question: 'Why is now the right time?' },
      { id: 'media', title: 'Media', question: 'Add photos or videos' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'headline', title: 'Headline', question: 'Add a headline for your graphic' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    event_promo: [
      { id: 'what', title: 'What Is the Event?', question: 'What kind of event is this?' },
      { id: 'when_where', title: 'When & Where', question: 'When and where is it happening?' },
      { id: 'details', title: 'Details', question: 'What should people expect?' },
      { id: 'media', title: 'Media', question: 'Add photos or videos' },
      { id: 'headline', title: 'Headline', question: 'Add a headline' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    offer_promo: [
      { id: 'what', title: 'What Is the Offer?', question: 'Describe the offer' },
      { id: 'included', title: 'What Is Included?', question: 'What products or services are included?' },
      { id: 'dates', title: 'Dates', question: 'When does the offer run?' },
      { id: 'media', title: 'Media', question: 'Add photos or videos' },
      { id: 'headline', title: 'Headline', question: 'Add a headline' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    industry_insight: [
      { id: 'source', title: 'Source', question: 'Where is this insight coming from?' },
      { id: 'insight', title: 'What Is the Insight?', question: 'What is the key point?' },
      { id: 'media', title: 'Media', question: 'Add an image or video' },
      { id: 'headline', title: 'Headline', question: 'Add a headline' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    tips_advice: [
      { id: 'topic', title: 'What Is the Topic?', question: 'What kind of content are you sharing?' },
      { id: 'details', title: 'Details', question: 'What is the tip or advice?' },
      { id: 'media', title: 'Media', question: 'Add an image or video' },
      { id: 'headline', title: 'Headline', question: 'Add a headline' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ],
    blog_content: [
      { id: 'source', title: 'Source', question: 'How would you like to start?' },
      { id: 'topic_title', title: 'Topic & Title', question: 'What is the blog about?' },
      { id: 'key_points', title: 'Key Points', question: 'What should the article cover?' },
      { id: 'audience', title: 'Target Audience', question: 'Who is this for?' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Save', question: '' }
    ],
    business_update: [
      { id: 'news_type', title: 'What Is the News?', question: 'What kind of update are you sharing?' },
      { id: 'details', title: 'Details', question: 'Provide more details' },
      { id: 'media', title: 'Media', question: 'Add photos or videos' },
      { id: 'headline', title: 'Headline', question: 'Add a headline' },
      { id: 'tone', title: 'Tone', question: 'Choose the tone' },
      { id: 'output_type', title: 'Output Type', question: 'What would you like to create?' },
      { id: 'generate', title: 'Generate', question: '' },
      { id: 'edit_approve', title: 'Edit & Approve', question: '' },
      { id: 'publish', title: 'Output & Publish', question: '' }
    ]
  },

  init: async function(supabase, user) {
    if (!supabase || !user) return;
    if (!(await window.checkToolAccess('social', supabase, user))) return;
    this._supabase = supabase;
    this._userId = user.id;
    this._bindTabs();
    this._bindWizardNav();
    this._bindPublishActions();
    this._bindModals();
    this._bindManagementTabs();
    this._renderGroups();
    await this._loadData();
    this._handlePhotoHandoff();
    this._applyInitialTab();
  },

  // Open a specific tab from a deep link such as /social#drafts. Also reads
  // ?date=YYYY-MM-DD from the query string and pre-filters the Scheduled tab
  // to that single day (used by the dashboard week-strip).
  _applyInitialTab: function() {
    var hash = (window.location.hash || '').replace('#', '');
    var qs = (window.location.search || '').replace(/^\?/, '');
    var params = {};
    qs.split('&').forEach(function(kv) {
      if (!kv) return;
      var eq = kv.indexOf('=');
      var k = eq === -1 ? kv : kv.substring(0, eq);
      var v = eq === -1 ? '' : decodeURIComponent(kv.substring(eq + 1));
      params[k] = v;
    });
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      this._scheduledDateFilter = params.date;
    }
    if (!hash) return;
    var allowed = ['create', 'campaign', 'drafts', 'scheduled', 'published'];
    if (allowed.indexOf(hash) !== -1) this._switchTab(hash);
  },

  // ── Dashboard Photo Capture handoff ─────────────────────────
  // Reads payload from sessionStorage 'stax_photo_handoff' (set by the dashboard),
  // surfaces a confirmation modal showing the photo + preset tags, and on confirm
  // saves to Content Library with tool_source='social' (Pattern B).
  _handlePhotoHandoff: function() {
    var raw;
    try { raw = sessionStorage.getItem('stax_photo_handoff'); } catch (e) { return; }
    if (!raw) return;
    var payload;
    try { payload = JSON.parse(raw); } catch (e) {
      console.error('[SM] Photo handoff parse error:', e.message);
      try { sessionStorage.removeItem('stax_photo_handoff'); } catch (err) {}
      return;
    }
    if (!payload || !payload.dataUrl) {
      try { sessionStorage.removeItem('stax_photo_handoff'); } catch (err) {}
      return;
    }
    this._showPhotoHandoffModal(payload);
  },

  _showPhotoHandoffModal: function(payload) {
    var self = this;
    var modal = document.getElementById('sm-photo-handoff-modal');
    if (!modal) return;
    var img = document.getElementById('sm-photo-handoff-image');
    var presetEl = document.getElementById('sm-photo-handoff-preset');
    var tagsEl = document.getElementById('sm-photo-handoff-tags');
    var addBtn = document.getElementById('sm-photo-handoff-add');
    var cancelBtn = document.getElementById('sm-photo-handoff-cancel');
    var msgEl = document.getElementById('sm-photo-handoff-msg');

    if (img) img.src = payload.dataUrl;
    if (presetEl) presetEl.textContent = payload.presetLabel || payload.preset || '';
    if (tagsEl) {
      var tags = Array.isArray(payload.tags) ? payload.tags : [];
      tagsEl.textContent = tags.length ? tags.join(', ') : 'social-media';
    }
    if (msgEl) msgEl.textContent = '';

    function close() {
      modal.classList.remove('open');
      try { sessionStorage.removeItem('stax_photo_handoff'); } catch (e) {}
    }

    if (cancelBtn) cancelBtn.addEventListener('click', close, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) close(); }, { once: true });

    if (addBtn) {
      addBtn.addEventListener('click', async function() {
        addBtn.disabled = true;
        var origLabel = addBtn.textContent;
        addBtn.textContent = 'Saving...';
        try {
          await self._savePhotoHandoffToCL(payload);
          addBtn.textContent = 'Saved ✓';
          if (msgEl) msgEl.textContent = 'Photo added to Content Library.';
          setTimeout(close, 1200);
        } catch (err) {
          console.error('[SM] Photo handoff save error:', err.message || err);
          addBtn.disabled = false;
          addBtn.textContent = origLabel;
          if (msgEl) msgEl.textContent = 'Could not save photo. Please try again.';
        }
      }, { once: true });
    }

    modal.classList.add('open');
  },

  _savePhotoHandoffToCL: async function(payload) {
    if (!this._supabase || !this._userId) throw new Error('Session missing');
    var dataUrl = payload.dataUrl || '';
    var commaIdx = dataUrl.indexOf(',');
    if (commaIdx < 0) throw new Error('Invalid photo data');
    var b64 = dataUrl.substring(commaIdx + 1);
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var blob = new Blob([bytes], { type: payload.contentType || 'image/jpeg' });

    var ts = Date.now();
    var safeName = (payload.fileName || 'photo.jpg').replace(/[^A-Za-z0-9._-]/g, '_');
    var path = this._userId + '/social-media/' + ts + '_' + safeName;

    var up = await this._supabase.storage.from('cl-assets').upload(path, blob, {
      contentType: payload.contentType || 'image/jpeg',
      upsert: false
    });
    if (up.error) throw new Error(up.error.message || 'Upload failed');

    var pub = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    var publicUrl = (pub && pub.data) ? pub.data.publicUrl : null;

    // Caller-supplied tags carry through as extra_tool_tags — the Tool
    // Output Matrix is applied server-side and unioned with these.
    var extraTags = Array.isArray(payload.tags) && payload.tags.length ? payload.tags : [];

    // Pattern B write — routed through api/cl-tool-write.js so the Tool
    // Output Matrix runs server-side. Endpoint enforces source: 'tool' and
    // status: 'approved'; user_id is taken from the JWT.
    var sessionRes = await this._supabase.auth.getSession();
    var jwt = sessionRes && sessionRes.data && sessionRes.data.session
      ? sessionRes.data.session.access_token : null;
    if (!jwt) throw new Error('Save failed — please refresh and sign in again');
    var resp = await fetch('/api/cl-tool-write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwt },
      body: JSON.stringify({
        tool_source: 'social',
        source_ref: path,
        category: 'Photos',
        content_type: 'image',
        content_text: 'Photo captured for ' + (payload.presetLabel || 'Social Media'),
        file_url: publicUrl,
        extra_tool_tags: extraTags
      })
    });
    if (!resp.ok) {
      var errBody = await resp.json().catch(function () { return {}; });
      throw new Error(errBody.error || 'Save failed');
    }
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
    });
    document.querySelectorAll('.ptab-content').forEach(function(panel) {
      panel.classList.remove('active');
    });
    var target = document.getElementById('sm-tab-' + tabId);
    if (target) target.classList.add('active');
    if (tabId === 'drafts') this._loadDrafts();
    if (tabId === 'scheduled') this._loadScheduled();
    if (tabId === 'published') this._loadPublished();
    if (tabId === 'campaign') this._loadCampaign();
  },

  _loadData: async function() {
    await Promise.all([
      this._loadSettings(),
      this._loadProfile(),
      this._loadStats(),
      this._loadPerfSummary()
    ]);
  },

  // 7-day Reach / Engagement / Engagement-Rate summary with trend graphics.
  // Uses the same metric definitions as the dashboard tile so the two stay
  // consistent: rolling 7 days vs prior 7 days, up = good for all three.
  _loadPerfSummary: async function() {
    var weekAgo = new Date(Date.now() - 7 * 86400000);
    var twoWeeksAgo = new Date(Date.now() - 14 * 86400000);
    var weekPosts = [], priorPosts = [];
    try {
      var w = await this._supabase
        .from('social_posts')
        .select('reach, engagement, published_at')
        .eq('user_id', this._userId).eq('status', 'published')
        .gte('published_at', weekAgo.toISOString());
      if (w.error) console.error('[SM] perf week error:', w.error.message);
      weekPosts = w.data || [];
      var p = await this._supabase
        .from('social_posts')
        .select('reach, engagement, published_at')
        .eq('user_id', this._userId).eq('status', 'published')
        .gte('published_at', twoWeeksAgo.toISOString())
        .lt('published_at', weekAgo.toISOString());
      if (p.error) console.error('[SM] perf prior error:', p.error.message);
      priorPosts = p.data || [];
    } catch (e) {
      console.error('[SM] perf load exception:', e.message);
    }

    var sumF = function(arr, f) { var s = 0; arr.forEach(function(x) { s += Number(x[f]) || 0; }); return s; };
    var weekReach = sumF(weekPosts, 'reach');
    var weekEng = sumF(weekPosts, 'engagement');
    var priorReach = sumF(priorPosts, 'reach');
    var priorEng = sumF(priorPosts, 'engagement');
    var rate = weekReach > 0 ? Math.round((weekEng / weekReach) * 100) : 0;
    var priorRate = priorReach > 0 ? (priorEng / priorReach) * 100 : 0;

    // Daily series for sparklines
    var dailyReach = [0,0,0,0,0,0,0];
    var dailyEng = [0,0,0,0,0,0,0];
    var dailyRate = [0,0,0,0,0,0,0];
    var now = new Date(); now.setHours(0,0,0,0);
    weekPosts.forEach(function(post) {
      if (!post.published_at) return;
      var d = new Date(post.published_at); d.setHours(0,0,0,0);
      var diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < 0 || diffDays >= 7) return;
      var idx = 6 - diffDays;
      dailyReach[idx] += Number(post.reach) || 0;
      dailyEng[idx] += Number(post.engagement) || 0;
    });
    for (var i = 0; i < 7; i++) {
      dailyRate[i] = dailyReach[i] > 0 ? (dailyEng[i] / dailyReach[i]) * 100 : 0;
    }

    var reachDir = weekReach >= priorReach ? 'up' : 'down';
    var engDir = weekEng >= priorEng ? 'up' : 'down';
    var rateDir = rate >= priorRate ? 'up' : 'down';

    var setEl = function(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('sm-perf-reach', weekReach);
    setEl('sm-perf-engagement', weekEng);
    setEl('sm-perf-rate', rate + '%');

    var setGraphic = function(id, values, dir) {
      var el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = window.SM_LOGIC._buildTrendSvg(values, dir, dir === 'up');
    };
    setGraphic('sm-perf-reach-graphic', dailyReach, reachDir);
    setGraphic('sm-perf-engagement-graphic', dailyEng, engDir);
    setGraphic('sm-perf-rate-graphic', dailyRate, rateDir);
  },

  // SVG trend graphic — mini area chart that ends in an arrow head. The
  // line is mapped into the upper portion of the chart so the filled area
  // beneath it (gradient + flat fill overlay) is always clearly visible,
  // even when the underlying data is sparse or zero. A deterministic
  // sine-based wiggle is added so lines read as real activity data.
  _trendGradSeq: 0,
  _applyWiggle: function(series) {
    var n = series.length;
    if (n < 2) return series;
    var max = Math.max.apply(null, series);
    var min = Math.min.apply(null, series);
    var range = max - min;
    var scale = range || Math.max(Math.abs(max), 1);
    return series.map(function(v, i) {
      var t = i + 0.7;
      var n1 = Math.sin(t * 1.35);
      var n2 = Math.sin(t * 2.7 + 0.6);
      var n3 = Math.sin(t * 0.55 + 1.2);
      var noise = n1 * 0.55 + n2 * 0.25 + n3 * 0.20;
      return v + noise * scale * 0.22;
    });
  },
  _buildTrendSvg: function(values, direction, good) {
    var width = 90, height = 36, pad = 3, ahSize = 7, stroke = 2.4;
    var series = (values && values.length) ? values.slice() : [0, 0];
    if (series.length === 1) series = [series[0], series[0]];
    var maxRaw = Math.max.apply(null, series);
    var minRaw = Math.min.apply(null, series);
    if (maxRaw === minRaw) {
      for (var k = 0; k < series.length; k++) {
        series[k] = direction === 'up' ? k : (series.length - 1 - k);
      }
    }
    series = this._applyWiggle(series);
    maxRaw = Math.max.apply(null, series);
    minRaw = Math.min.apply(null, series);
    var range = (maxRaw - minRaw) || 1;
    var baseY = height - pad;
    var lineTopY = pad + 1;
    var lineFloorY = pad + (height - pad * 2) * 0.55;
    var lineEndX = width - ahSize - 4;
    var step = (lineEndX - pad) / (series.length - 1);
    var pts = [];
    for (var i = 0; i < series.length; i++) {
      var x = pad + i * step;
      var t = (series[i] - minRaw) / range;
      var y = lineFloorY - t * (lineFloorY - lineTopY);
      pts.push({ x: x, y: y });
    }
    var tipX = width - ahSize - 2;
    var tipY = direction === 'up' ? lineTopY : lineFloorY;
    pts.push({ x: tipX, y: tipY });
    var lineD = pts.map(function(p, idx) {
      return (idx === 0 ? 'M' : 'L') + p.x.toFixed(2) + ' ' + p.y.toFixed(2);
    }).join(' ');
    var areaD = lineD
      + ' L' + tipX.toFixed(2) + ' ' + baseY.toFixed(2)
      + ' L' + pad.toFixed(2) + ' ' + baseY.toFixed(2)
      + ' Z';
    var ahPoints = direction === 'up'
      ? (tipX) + ',' + (tipY - 2) + ' ' + (tipX - ahSize) + ',' + (tipY + ahSize - 1) + ' ' + (tipX + ahSize) + ',' + (tipY + ahSize - 1)
      : (tipX) + ',' + (tipY + 2) + ' ' + (tipX - ahSize) + ',' + (tipY - ahSize + 1) + ' ' + (tipX + ahSize) + ',' + (tipY - ahSize + 1);
    var color = good ? '#28a745' : '#dc3545';
    var gradId = 'smtg' + (++this._trendGradSeq);
    return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">'
      + '<defs><linearGradient id="' + gradId + '" x1="0" x2="0" y1="0" y2="1">'
      + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.6" />'
      + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.08" />'
      + '</linearGradient></defs>'
      + '<path d="' + areaD + '" fill="url(#' + gradId + ')" stroke="none" />'
      + '<path d="' + areaD + '" fill="' + color + '" fill-opacity="0.18" stroke="none" />'
      + '<path d="' + lineD + '" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round" />'
      + '<polygon points="' + ahPoints + '" fill="' + color + '" />'
      + '</svg>';
  },

  _loadSettings: async function() {
    var result = await this._supabase
      .from('social_settings')
      .select('*')
      .eq('user_id', this._userId)
      .maybeSingle();
    if (result.error) {
      console.error('[SM] social_settings load error:', result.error.message);
      this._settings = {};
      return;
    }
    this._settings = (result.data) || {};
  },

  _loadProfile: async function() {
    var result = await this._supabase
      .from('profiles')
      .select('*')
      .eq('id', this._userId)
      .maybeSingle();
    if (result.error) {
      console.error('[SM] profiles load error:', result.error.message);
      this._profile = {};
      return;
    }
    this._profile = (result.data) || {};
  },

  _loadStats: async function() {
    var result = await this._supabase
      .from('social_posts')
      .select('status')
      .eq('user_id', this._userId);
    if (result.error) return;
    var items = result.data || [];
    var drafts = items.filter(function(i) { return i.status === 'draft'; }).length;
    var scheduled = items.filter(function(i) { return i.status === 'scheduled'; }).length;
    var published = items.filter(function(i) { return i.status === 'published'; }).length;
    var el;
    el = document.getElementById('stat-total'); if (el) el.textContent = items.length;
    el = document.getElementById('stat-drafts'); if (el) el.textContent = drafts;
    el = document.getElementById('stat-scheduled'); if (el) el.textContent = scheduled;
    el = document.getElementById('stat-published'); if (el) el.textContent = published;
  },

  _showError: function(msg) {
    window.showModalError(msg, 'sm-error-msg');
  },

  _showConfirm: function(title, body, onConfirm) {
    var modal = document.getElementById('sm-confirm-modal');
    if (!modal) return;
    document.getElementById('sm-confirm-title').textContent = title;
    document.getElementById('sm-confirm-body').innerHTML = body;
    modal.classList.add('open');
    var okBtn = document.getElementById('sm-confirm-ok');
    var cancelBtn = document.getElementById('sm-confirm-cancel');
    var close = function() { modal.classList.remove('open'); };
    cancelBtn.addEventListener('click', close, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) close(); }, { once: true });
    okBtn.addEventListener('click', function() { close(); if (onConfirm) onConfirm(); }, { once: true });
  },

  _renderGroups: function() {
    var self = this;
    var grid = document.getElementById('sm-groups-grid');
    if (!grid) return;
    var html = '';
    this.JOURNEY_GROUPS.forEach(function(g) {
      html += '<div class="sm-group-tile" data-group="' + g.id + '">' +
        '<div class="sm-group-tile-icon">' + g.icon + '</div>' +
        '<div class="sm-group-tile-title">' + window.escHtml(g.title) + '</div>' +
        '<div class="sm-group-tile-desc">' + window.escHtml(g.desc) + '</div>' +
        '<div class="sm-journey-list">';
      g.journeys.forEach(function(j) {
        html += '<button class="sm-journey-btn" data-journey="' + j.id + '">' +
          '<span>' + j.icon + '</span> ' + window.escHtml(j.label) +
          '</button>';
      });
      html += '</div></div>';
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.sm-group-tile').forEach(function(tile) {
      tile.addEventListener('click', function(e) {
        if (e.target.closest('.sm-journey-btn')) return;
        var wasExpanded = tile.classList.contains('expanded');
        grid.querySelectorAll('.sm-group-tile').forEach(function(t) { t.classList.remove('expanded'); });
        if (!wasExpanded) tile.classList.add('expanded');
      });
    });

    grid.querySelectorAll('.sm-journey-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        self._startJourney(btn.dataset.journey);
      });
    });
  },

  _startJourney: function(journeyId, resumeData) {
    this._currentJourney = journeyId;
    this._currentStep = 0;
    this._journeyInputs = resumeData ? JSON.parse(JSON.stringify(resumeData)) : {};
    this._mediaFiles = [];
    this._mediaUrls = [];
    this._generatedContent = null;

    if (this._profile && this._profile.tone_of_voice) {
      this._journeyInputs.tone = this._journeyInputs.tone || this._profile.tone_of_voice;
    }
    if (this._profile && this._profile.location) {
      this._journeyInputs.location = this._journeyInputs.location || this._profile.location;
    }

    document.getElementById('sm-groups-view').style.display = 'none';
    document.getElementById('sm-generate-view').style.display = 'none';
    document.getElementById('sm-preview-view').style.display = 'none';
    document.getElementById('sm-publish-view').style.display = 'none';
    var wizard = document.getElementById('sm-wizard-view');
    wizard.classList.add('active');

    var steps = this.JOURNEY_STEPS[journeyId];
    if (!steps) return;
    var journeyLabel = '';
    this.JOURNEY_GROUPS.forEach(function(g) {
      g.journeys.forEach(function(j) {
        if (j.id === journeyId) journeyLabel = j.label;
      });
    });
    document.getElementById('sm-wizard-title').textContent = journeyLabel;
    this._renderStep();
  },

  _bindWizardNav: function() {
    var self = this;
    document.getElementById('sm-wizard-back-btn').addEventListener('click', function() {
      self._exitWizard();
    });
    document.getElementById('sm-step-prev-btn').addEventListener('click', function() {
      if (self._currentStep > 0) {
        self._saveStepData();
        self._currentStep--;
        self._renderStep();
      }
    });
    document.getElementById('sm-step-next-btn').addEventListener('click', function() {
      self._saveStepData();
      var steps = self.JOURNEY_STEPS[self._currentJourney];
      if (!steps) return;
      var step = steps[self._currentStep];
      if (step.id === 'generate' || step.id === 'edit_approve' || step.id === 'publish') return;

      if (self._currentStep < steps.length - 1) {
        var nextStep = steps[self._currentStep + 1];
        if (nextStep.id === 'generate') {
          self._generateContent();
          return;
        }
        self._currentStep++;
        self._renderStep();
      }
    });
    document.getElementById('sm-save-exit-btn').addEventListener('click', function() {
      self._saveStepData();
      self._saveAsDraft(true);
    });

    document.getElementById('sm-preview-back-btn').addEventListener('click', function() {
      document.getElementById('sm-preview-view').style.display = 'none';
      var steps = self.JOURNEY_STEPS[self._currentJourney];
      if (steps) {
        for (var i = 0; i < steps.length; i++) {
          if (steps[i].id === 'tone' || steps[i].id === 'output_type') {
            self._currentStep = i;
            break;
          }
        }
      }
      document.getElementById('sm-wizard-view').classList.add('active');
      self._renderStep();
    });

    document.getElementById('sm-regenerate-btn').addEventListener('click', function() {
      self._generateContent();
    });

    document.getElementById('sm-approve-btn').addEventListener('click', function() {
      var captionEl = document.getElementById('sm-edit-caption');
      var hashtagsEl = document.getElementById('sm-edit-hashtags');
      if (captionEl) self._generatedContent.caption = captionEl.value;
      if (hashtagsEl) self._generatedContent.hashtags = hashtagsEl.value;
      document.getElementById('sm-preview-view').style.display = 'none';
      self._showPublishView();
    });

    document.getElementById('sm-publish-back-btn').addEventListener('click', function() {
      document.getElementById('sm-publish-view').style.display = 'none';
      document.getElementById('sm-preview-view').style.display = 'block';
    });

    var fileInput = document.getElementById('sm-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', function() {
        self._handleFileSelect(fileInput.files);
        fileInput.value = '';
      });
    }
  },

  _exitWizard: function() {
    document.getElementById('sm-wizard-view').classList.remove('active');
    document.getElementById('sm-generate-view').style.display = 'none';
    document.getElementById('sm-preview-view').style.display = 'none';
    document.getElementById('sm-publish-view').style.display = 'none';
    document.getElementById('sm-groups-view').style.display = '';
    this._currentJourney = null;
    this._currentStep = 0;
    this._journeyInputs = {};
    this._mediaFiles = [];
    this._mediaUrls = [];
    this._generatedContent = null;
    this._editingPostId = null;
  },

  _renderStep: function() {
    var steps = this.JOURNEY_STEPS[this._currentJourney];
    if (!steps) return;
    var step = steps[this._currentStep];

    var indicator = document.getElementById('sm-step-indicator');
    var contentEl = document.getElementById('sm-step-content');
    var prevBtn = document.getElementById('sm-step-prev-btn');
    var nextBtn = document.getElementById('sm-step-next-btn');

    var visibleSteps = steps.filter(function(s) {
      return s.id !== 'generate' && s.id !== 'edit_approve' && s.id !== 'publish';
    });
    var visibleIndex = 0;
    for (var vi = 0; vi < visibleSteps.length; vi++) {
      if (visibleSteps[vi].id === step.id) { visibleIndex = vi; break; }
    }
    var barHtml = '<div class="sm-step-label">Step ' + (visibleIndex + 1) + ' of ' + visibleSteps.length + ' \u2014 ' + window.escHtml(step.title) + '</div>';
    barHtml += '<div class="sm-step-bar">';
    for (var d = 0; d < visibleSteps.length; d++) {
      var cls = 'sm-step-seg';
      if (d < visibleIndex) cls += ' sm-step-done';
      else if (d === visibleIndex) cls += ' sm-step-current';
      else cls += ' sm-step-pending';
      barHtml += '<div class="' + cls + '"></div>';
    }
    barHtml += '</div>';
    indicator.innerHTML = barHtml;

    prevBtn.style.display = this._currentStep > 0 ? '' : 'none';

    var html = '';
    if (step.question) {
      html += '<div class="sm-step-question">' + window.escHtml(step.question) + '</div>';
    }

    if (step.id === 'media') {
      html += this._renderMediaStep();
    } else if (step.id === 'tone') {
      html += this._renderToneStep();
    } else if (step.id === 'details') {
      html += this._renderDetailsStep();
    } else if (step.id === 'output_type') {
      html += this._renderOutputTypeStep();
    } else if (step.id === 'headline') {
      html += this._renderHeadlineStep();
    } else if (step.id === 'story_type') {
      html += this._renderStoryTypeStep();
    } else if (step.id === 'what' || step.id === 'who' || step.id === 'why_now' || step.id === 'included') {
      html += this._renderTextStep(step);
    } else if (step.id === 'when_where') {
      html += this._renderWhenWhereStep();
    } else if (step.id === 'dates') {
      html += this._renderDatesStep();
    } else if (step.id === 'source') {
      html += this._renderSourceStep();
    } else if (step.id === 'insight') {
      html += this._renderTextStep(step);
    } else if (step.id === 'topic') {
      html += this._renderTopicStep();
    } else if (step.id === 'topic_title') {
      html += this._renderTopicTitleStep();
    } else if (step.id === 'key_points') {
      html += this._renderTextStep(step);
    } else if (step.id === 'audience') {
      html += this._renderAudienceStep();
    } else if (step.id === 'news_type') {
      html += this._renderNewsTypeStep();
    } else if (step.id === 'project') {
      html += this._renderProjectStep();
    } else if (step.id === 'testimonial') {
      html += this._renderTestimonialStep();
    } else if (step.id === 'logo') {
      html += this._renderLogoStep();
    } else {
      html += '<div class="sm-step-hint">Complete this step to continue.</div>';
    }

    contentEl.innerHTML = html;
    this._bindStepEvents(step);
  },

  _renderMediaStep: function() {
    var self = this;
    var html = '<div class="sm-step-hint">Upload photos or videos, or select from your Content Library.</div>';
    html += '<div class="upload-zone" id="sm-media-drop">' +
      '<div class="upload-zone-icon">\uD83D\uDCF7</div>' +
      '<div class="upload-zone-label">Click to upload or drag and drop</div>' +
      '<div class="upload-zone-hint">Photos and videos accepted. Multiple files supported for carousel.</div>' +
      '</div>';
    html += '<div class="sm-media-options">' +
      '<button class="btn-outline btn-sm" id="sm-media-upload-btn">Upload Files</button>' +
      '<button class="btn-outline btn-sm" id="sm-media-cl-btn">From Content Library</button>';
    if (this._currentJourney !== 'behind_scenes') {
      html += '<button class="btn-outline btn-sm" id="sm-media-ai-btn">AI Generate</button>';
    }
    html += '</div>';
    if (this._mediaUrls.length > 0) {
      html += '<div class="sm-media-preview-grid" id="sm-media-previews">';
      this._mediaUrls.forEach(function(url, idx) {
        var isVideo = false;
        if (self._mediaFiles[idx]) {
          var mimeType = self._mediaFiles[idx].type || '';
          if (mimeType.indexOf('video') === 0) isVideo = true;
        }
        if (!isVideo) {
          var ext = url.split('.').pop().split('?')[0].toLowerCase();
          if (['mp4', 'mov', 'webm', 'avi', 'mkv', 'ogv'].indexOf(ext) !== -1) isVideo = true;
        }
        html += '<div class="sm-media-preview-item">';
        if (isVideo) {
          html += '<video src="' + window.escHtml(url) + '" class="sm-video-fill" muted></video>';
        } else {
          html += '<img src="' + window.escHtml(url) + '" alt="">';
        }
        html += '<button class="sm-media-remove" data-idx="' + idx + '">\u2715</button>' +
          '</div>';
      });
      html += '</div>';
    }
    return html;
  },

  _renderToneStep: function() {
    var currentTone = this._journeyInputs.tone || '';
    var html = '<div class="sm-step-hint">This sets the voice for your content. You can always change it.</div>';
    html += '<div class="sm-pills-wrap">';
    this.TONES.forEach(function(t) {
      var active = currentTone === t.id ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-tone="' + t.id + '">' +
        window.escHtml(t.label) + '<br><span class="text-muted">' +
        window.escHtml(t.desc) + '</span></button>';
    });
    html += '</div>';
    return html;
  },

  _renderDetailsStep: function() {
    var vals = this._journeyInputs;
    var html = '';
    if (this._currentJourney === 'finished_job') {
      html += '<div class="form-group"><label class="form-label">Job description</label>' +
        '<textarea class="form-input" id="sm-field-description" rows="3" placeholder="Describe the completed job...">' + window.escHtml(vals.description || '') + '</textarea></div>';
      html += '<div class="form-group"><label class="form-label">Location (suburb only)</label>' +
        '<input type="text" class="form-input" id="sm-field-location" placeholder="e.g. Parramatta" value="' + window.escHtml(vals.location || '') + '"></div>';
      html += '<div class="form-group"><label class="form-label">Anything special? (optional)</label>' +
        '<input type="text" class="form-input" id="sm-field-special" placeholder="e.g. Heritage-listed property, tight deadline..." value="' + window.escHtml(vals.special || '') + '"></div>';
    } else if (this._currentJourney === 'behind_scenes') {
      html += '<div class="form-group"><label class="form-label">Who is in the photo/video?</label>' +
        '<input type="text" class="form-input" id="sm-field-who" value="' + window.escHtml(vals.who || '') + '"></div>';
      html += '<div class="form-group"><label class="form-label">What are they doing?</label>' +
        '<textarea class="form-input" id="sm-field-description" rows="3">' + window.escHtml(vals.description || '') + '</textarea></div>';
    } else {
      html += '<div class="form-group"><label class="form-label">Details</label>' +
        '<textarea class="form-input" id="sm-field-description" rows="4" placeholder="Provide the details...">' + window.escHtml(vals.description || '') + '</textarea></div>';
    }
    return html;
  },

  _renderOutputTypeStep: function() {
    var selected = this._journeyInputs.output_types || [this._journeyInputs.output_type || 'social_post'];
    var options = [
      { id: 'social_post', label: 'Social Post' },
      { id: 'ad_graphic', label: 'Ad Graphic' },
      { id: 'flyer', label: 'Flyer' },
      { id: 'blog_post', label: 'Blog Post' }
    ];
    if (this._currentJourney === 'event_promo') {
      options = options.filter(function(o) { return o.id !== 'blog_post'; });
    }
    var html = '<div class="sm-step-hint">You can select multiple formats to generate from the same inputs.</div>';
    html += '<div class="sm-pills-wrap">';
    options.forEach(function(o) {
      var active = selected.indexOf(o.id) !== -1 ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-output="' + o.id + '">' + window.escHtml(o.label) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderHeadlineStep: function() {
    var html = '<div class="sm-step-hint">A headline for your graphic. The AI can suggest one, or enter your own.</div>';
    html += '<div class="form-group"><label class="form-label">Headline</label>' +
      '<input type="text" class="form-input" id="sm-field-headline" placeholder="Enter a headline or leave blank for AI suggestion" value="' + window.escHtml(this._journeyInputs.headline || '') + '"></div>';
    html += '<div class="form-group sm-checkbox-row">' +
      '<input type="checkbox" class="item-checkbox" id="sm-field-headline-on-graphic"' +
      (this._journeyInputs.headline_on_graphic !== false ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-headline-on-graphic">Include headline on graphic</label></div>';
    return html;
  },

  _renderStoryTypeStep: function() {
    var current = this._journeyInputs.story_type || '';
    var types = ['Team spotlight', 'How you work', 'Your workspace', 'Day in the life', 'Other'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-story="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderTextStep: function(step) {
    var field = step.id;
    if (field === 'what' && this._currentJourney === 'event_promo') {
      return this._renderEventTypePills();
    }
    if (field === 'what' && this._currentJourney === 'offer_promo') {
      return this._renderOfferTypePills();
    }
    var html = '<div class="form-group"><label class="form-label">' + window.escHtml(step.question) + '</label>' +
      '<textarea class="form-input" id="sm-field-' + field + '" rows="4">' + window.escHtml(this._journeyInputs[field] || '') + '</textarea></div>';
    return html;
  },

  // Event/Offer pill renderers in social-modules.js

  _renderWhenWhereStep: function() {
    var vals = this._journeyInputs;
    var html = '<div class="form-group"><label class="form-label">Event date</label>' +
      '<input type="date" class="form-input" id="sm-field-event-date" value="' + window.escHtml(vals.event_date || '') + '"></div>';
    html += '<div class="form-group"><label class="form-label">Event time</label>' +
      '<input type="text" class="form-input" id="sm-field-event-time" placeholder="e.g. 10am - 2pm" value="' + window.escHtml(vals.event_time || '') + '"></div>';
    html += '<div class="form-group"><label class="form-label">Location</label>' +
      '<input type="text" class="form-input" id="sm-field-event-location" placeholder="Physical address or online link" value="' + window.escHtml(vals.event_location || '') + '"></div>';
    return html;
  },

  _renderDatesStep: function() {
    var vals = this._journeyInputs;
    var html = '<div class="form-group"><label class="form-label">Start date</label>' +
      '<input type="date" class="form-input" id="sm-field-start-date" value="' + window.escHtml(vals.start_date || '') + '"></div>';
    html += '<div class="form-group"><label class="form-label">End date</label>' +
      '<input type="date" class="form-input" id="sm-field-end-date" value="' + window.escHtml(vals.end_date || '') + '"></div>';
    html += '<div class="form-group sm-checkbox-row">' +
      '<input type="checkbox" class="item-checkbox" id="sm-field-ongoing"' +
      (vals.ongoing ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-ongoing">Ongoing / while stocks last</label></div>';
    return html;
  },

  _renderSourceStep: function() {
    var current = this._journeyInputs.source_type || '';
    var options = [];
    if (this._currentJourney === 'industry_insight') {
      options = ['News Digest (saved items)', 'Enter manually', 'Select from Content Library'];
    } else if (this._currentJourney === 'blog_content') {
      options = ['Start from scratch', 'Expand a News Digest item', 'Expand a previous post', 'Use Content Library content'];
    }
    var html = '<div class="sm-pills-wrap">';
    options.forEach(function(o) {
      var active = current === o ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-source="' + window.escHtml(o) + '">' + window.escHtml(o) + '</button>';
    });
    html += '</div>';
    html += '<div id="sm-nd-items-container" style="display:none"></div>';
    return html;
  },

  _renderTopicStep: function() {
    var current = this._journeyInputs.topic_type || '';
    var types = ['How-to', 'Common mistake to avoid', 'FAQ answer', 'Pro tip', 'Myth buster'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-topic="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderTopicTitleStep: function() {
    var vals = this._journeyInputs;
    var html = '<div class="form-group"><label class="form-label">What is the blog about?</label>' +
      '<textarea class="form-input" id="sm-field-blog-topic" rows="3">' + window.escHtml(vals.blog_topic || '') + '</textarea></div>';
    html += '<div class="form-group"><label class="form-label">Working title</label>' +
      '<input type="text" class="form-input" id="sm-field-blog-title" value="' + window.escHtml(vals.blog_title || '') + '"></div>';
    return html;
  },

  _renderAudienceStep: function() {
    var current = this._journeyInputs.audience || '';
    var types = ['Customers', 'Prospects', 'Industry peers', 'General public'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-audience="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderNewsTypeStep: function() {
    var current = this._journeyInputs.news_type || '';
    var types = ['New team member', 'Milestone', 'Award', 'New location', 'Anniversary', 'Partnership', 'Rebrand', 'Other'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-newstype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  /* _renderProjectStep, _renderTestimonialStep, _renderLogoStep overridden by social-modules.js */

  _bindStepEvents: function(step) {
    var self = this;

    if (step.id === 'media') {
      var dropArea = document.getElementById('sm-media-drop');
      var uploadBtn = document.getElementById('sm-media-upload-btn');
      var aiBtn = document.getElementById('sm-media-ai-btn');
      var clBtn = document.getElementById('sm-media-cl-btn');
      if (dropArea) {
        dropArea.addEventListener('click', function() {
          document.getElementById('sm-file-input').click();
        });
      }
      if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
          document.getElementById('sm-file-input').click();
        });
      }
      if (aiBtn) {
        aiBtn.addEventListener('click', function() {
          self._handleAIGenerate();
        });
      }
      if (clBtn) {
        clBtn.addEventListener('click', function() {
          self._openCLMediaPicker();
        });
      }
      document.querySelectorAll('.sm-media-remove').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.dataset.idx, 10);
          self._mediaUrls.splice(idx, 1);
          self._mediaFiles.splice(idx, 1);
          self._renderStep();
        });
      });
    }

    if (step.id === 'tone') {
      document.querySelectorAll('.filter-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.tone = pill.dataset.tone;
        });
      });
    }

    if (step.id === 'story_type') {
      document.querySelectorAll('[data-story]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-story]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.story_type = pill.dataset.story;
        });
      });
    }

    if (step.id === 'output_type') {
      document.querySelectorAll('[data-output]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          pill.classList.toggle('active');
          var selected = [];
          document.querySelectorAll('[data-output].active').forEach(function(p) {
            selected.push(p.dataset.output);
          });
          self._journeyInputs.output_types = selected;
          self._journeyInputs.output_type = selected[0] || 'social_post';
        });
      });
    }

    if (step.id === 'source') {
      document.querySelectorAll('[data-source]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-source]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.source_type = pill.dataset.source;
          var ndContainer = document.getElementById('sm-nd-items-container');
          if (pill.dataset.source === 'News Digest (saved items)' || pill.dataset.source === 'Expand a News Digest item') {
            if (ndContainer) { ndContainer.style.display = 'block'; }
            self._loadNewsDigestItems();
          } else {
            if (ndContainer) { ndContainer.style.display = 'none'; }
          }
        });
      });
    }

    if (step.id === 'topic') {
      document.querySelectorAll('[data-topic]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-topic]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.topic_type = pill.dataset.topic;
        });
      });
    }

    if (step.id === 'audience') {
      document.querySelectorAll('[data-audience]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-audience]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.audience = pill.dataset.audience;
        });
      });
    }

    if (step.id === 'news_type') {
      document.querySelectorAll('[data-newstype]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-newstype]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.news_type = pill.dataset.newstype;
        });
      });
    }

    if (step.id === 'what' && this._currentJourney === 'event_promo') {
      document.querySelectorAll('[data-eventtype]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-eventtype]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.what = pill.dataset.eventtype;
          var otherWrap = document.getElementById('sm-event-other-wrap');
          if (otherWrap) otherWrap.style.display = pill.dataset.eventtype === 'Other' ? 'block' : 'none';
        });
      });
    }

    if (step.id === 'what' && this._currentJourney === 'offer_promo') {
      document.querySelectorAll('[data-offertype]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-offertype]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.what = pill.dataset.offertype;
          var otherWrap = document.getElementById('sm-offer-other-wrap');
          if (otherWrap) otherWrap.style.display = pill.dataset.offertype === 'Other' ? 'block' : 'none';
        });
      });
    }

    if (step.id === 'project') {
      if (self._bindProjectStepEvents) {
        self._bindProjectStepEvents();
      } else {
        var manualBtn = document.getElementById('sm-project-manual');
        if (manualBtn) {
          manualBtn.addEventListener('click', function() {
            var fields = document.getElementById('sm-project-manual-fields');
            if (fields) fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
          });
        }
      }
    }

    if (step.id === 'logo') {
      var websiteInput = document.getElementById('sm-field-customer-website');
      if (websiteInput) {
        websiteInput.addEventListener('blur', function() {
          self._fetchLogoFromUrl(websiteInput.value);
        });
      }
    }
  },

  _saveStepData: function() {
    var steps = this.JOURNEY_STEPS[this._currentJourney];
    if (!steps) return;
    var step = steps[this._currentStep];

    if (step.id === 'details') {
      var desc = document.getElementById('sm-field-description');
      if (desc) this._journeyInputs.description = desc.value;
      var loc = document.getElementById('sm-field-location');
      if (loc) this._journeyInputs.location = loc.value;
      var special = document.getElementById('sm-field-special');
      if (special) this._journeyInputs.special = special.value;
      var who = document.getElementById('sm-field-who');
      if (who) this._journeyInputs.who = who.value;
    }

    if (step.id === 'headline') {
      var hl = document.getElementById('sm-field-headline');
      if (hl) this._journeyInputs.headline = hl.value;
      var hlg = document.getElementById('sm-field-headline-on-graphic');
      if (hlg) this._journeyInputs.headline_on_graphic = hlg.checked;
    }

    if (step.id === 'when_where') {
      var ed = document.getElementById('sm-field-event-date');
      if (ed) this._journeyInputs.event_date = ed.value;
      var et = document.getElementById('sm-field-event-time');
      if (et) this._journeyInputs.event_time = et.value;
      var el = document.getElementById('sm-field-event-location');
      if (el) this._journeyInputs.event_location = el.value;
    }

    if (step.id === 'dates') {
      var sd = document.getElementById('sm-field-start-date');
      if (sd) this._journeyInputs.start_date = sd.value;
      var endd = document.getElementById('sm-field-end-date');
      if (endd) this._journeyInputs.end_date = endd.value;
      var ong = document.getElementById('sm-field-ongoing');
      if (ong) this._journeyInputs.ongoing = ong.checked;
    }

    if (step.id === 'testimonial') {
      var test = document.getElementById('sm-field-testimonial');
      if (test) this._journeyInputs.testimonial = test.value;
    }

    if (step.id === 'logo') {
      var cw = document.getElementById('sm-field-customer-website');
      if (cw) this._journeyInputs.customer_website = cw.value;
      var lp = document.getElementById('sm-field-logo-permission');
      if (lp) this._journeyInputs.logo_permission = lp.checked;
    }

    if (step.id === 'project') {
      var cn = document.getElementById('sm-field-customer-name');
      if (cn) this._journeyInputs.customer_name = cn.value;
      var sv = document.getElementById('sm-field-service');
      if (sv) this._journeyInputs.service = sv.value;
    }

    if (step.id === 'output_type') {
      var selected = [];
      document.querySelectorAll('[data-output].active').forEach(function(p) {
        selected.push(p.dataset.output);
      });
      if (selected.length > 0) {
        this._journeyInputs.output_types = selected;
        this._journeyInputs.output_type = selected[0];
      }
    }

    if (step.id === 'what' && (this._currentJourney === 'event_promo' || this._currentJourney === 'offer_promo')) {
      var otherField = document.getElementById('sm-field-what-other');
      if (otherField) this._journeyInputs.what_other = otherField.value;
    }

    var genericFields = ['what', 'who', 'why_now', 'included', 'insight', 'key_points'];
    if (genericFields.indexOf(step.id) !== -1) {
      var tf = document.getElementById('sm-field-' + step.id);
      if (tf) this._journeyInputs[step.id] = tf.value;
    }

    if (step.id === 'topic_title') {
      var bt = document.getElementById('sm-field-blog-topic');
      if (bt) this._journeyInputs.blog_topic = bt.value;
      var btitle = document.getElementById('sm-field-blog-title');
      if (btitle) this._journeyInputs.blog_title = btitle.value;
    }
  },

  _generateContent: async function() {
    var self = this;
    document.getElementById('sm-wizard-view').classList.remove('active');
    document.getElementById('sm-generate-view').style.display = 'block';

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) {
        this._showError('Could not verify your session. Please refresh the page and try again.');
        return;
      }

      var mediaUrl = null;
      if (this._mediaFiles.length > 0) {
        mediaUrl = await this._uploadMedia(this._mediaFiles[0], session.access_token);
      }

      var res = await fetch('/api/generate-social-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          journey_type: this._currentJourney,
          inputs: this._journeyInputs,
          media_url: mediaUrl,
          output_type: this._journeyInputs.output_type || 'social_post',
          output_types: this._journeyInputs.output_types || [this._journeyInputs.output_type || 'social_post']
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate content. Please try again.');
      }

      var data = await res.json();
      this._generatedContent = {
        caption: data.caption || data.content || '',
        hashtags: data.hashtags || '',
        image_url: mediaUrl || data.image_url || null
      };

      document.getElementById('sm-generate-view').style.display = 'none';
      this._showPreview();
    } catch (err) {
      document.getElementById('sm-generate-view').style.display = 'none';
      document.getElementById('sm-wizard-view').classList.add('active');
      this._showError(err.message || 'Something went wrong. Please try again.');
    }
  },

  // _uploadMedia in social-modules.js

  // Preview and publish views in social-modules.js

  _bindPublishActions: function() {
    var self = this;

    document.getElementById('sm-post-now-btn').addEventListener('click', function() {
      self._selectedConnections = self._getSelectedConnections();
      if (self._selectedConnections.length === 0 && !self._generatedContent) {
        self._showError('Please select at least one platform or save as a draft.');
        return;
      }
      self._publishNow();
    });

    document.getElementById('sm-schedule-btn').addEventListener('click', function() {
      var modal = document.getElementById('sm-schedule-modal');
      if (modal) modal.classList.add('open');
    });

    document.getElementById('sm-save-draft-btn').addEventListener('click', function() {
      self._saveAsDraft(false);
    });
  },

  _bindModals: function() {
    var self = this;

    document.getElementById('sm-schedule-cancel').addEventListener('click', function() {
      document.getElementById('sm-schedule-modal').classList.remove('open');
    });

    document.getElementById('sm-schedule-confirm').addEventListener('click', function() {
      var dateVal = document.getElementById('sm-schedule-date').value;
      var timeVal = document.getElementById('sm-schedule-time').value;
      if (!dateVal || !timeVal) {
        self._showError('Please select both a date and time.');
        return;
      }
      document.getElementById('sm-schedule-modal').classList.remove('open');
      self._handleScheduleConfirm(dateVal + 'T' + timeVal);
    });

    document.getElementById('sm-schedule-modal').addEventListener('click', function(e) {
      if (e.target === document.getElementById('sm-schedule-modal')) {
        document.getElementById('sm-schedule-modal').classList.remove('open');
      }
    });

    var clMediaModal = document.getElementById('sm-cl-media-modal');
    if (clMediaModal) {
      document.getElementById('sm-cl-media-cancel').addEventListener('click', function() {
        clMediaModal.classList.remove('open');
      });
      clMediaModal.addEventListener('click', function(e) {
        if (e.target === clMediaModal) clMediaModal.classList.remove('open');
      });
    }
  },

  _getSelectedConnections: function() {
    var connections = [];
    var fb = document.getElementById('sm-conn-facebook');
    if (fb && fb.checked) connections.push('facebook');
    var ig = document.getElementById('sm-conn-instagram');
    if (ig && ig.checked) connections.push('instagram');
    return connections;
  },

  _publishNow: async function() {
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var postRecord = await this._savePostRecord('published');
      if (!postRecord) return;

      if (this._selectedConnections.length > 0) {
        var res = await fetch('/api/meta-post', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
          },
          body: JSON.stringify({
            action: 'post',
            caption: this._generatedContent.caption + '\n\n' + this._generatedContent.hashtags,
            image_url: this._generatedContent.image_url,
            platforms: this._selectedConnections,
            post_id: postRecord.id
          })
        });
        if (!res.ok) {
          var errData = await res.json().catch(function() { return {}; });
          this._showError(errData.error || 'Failed to publish. The post has been saved as a draft.');
          return;
        }
      }

      var isBlogPublish = this._currentJourney === 'blog_content';
      var pubRecord = postRecord;
      this._exitWizard();
      this._loadStats();
      this._switchTab('published');
      if (isBlogPublish) {
        this._promptBlogPromotion(pubRecord);
      }
    } catch (err) {
      this._showError(err.message || 'Failed to publish. Please try again.');
    }
  },

  _schedulePost: async function(scheduledFor) {
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var postRecord = await this._savePostRecord('scheduled');
      if (!postRecord) return;

      var res = await fetch('/api/schedule-social-posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          social_post_id: postRecord.id,
          scheduled_for: scheduledFor,
          platforms: this._selectedConnections
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        this._showError(errData.error || 'Failed to schedule post.');
        return;
      }

      this._exitWizard();
      this._loadStats();
      this._switchTab('scheduled');
    } catch (err) {
      this._showError(err.message || 'Failed to schedule. Please try again.');
    }
  },

  _saveAsDraft: async function(isInProgress) {
    try {
      var isBlog = this._currentJourney === 'blog_content';
      var postRecord = await this._savePostRecord(isInProgress ? 'in_progress' : 'draft');
      if (!postRecord) return;
      var journeyType = this._currentJourney;
      this._exitWizard();
      this._loadStats();
      this._switchTab('drafts');
      if (isBlog && !isInProgress) {
        this._promptBlogPromotion(postRecord);
      }
    } catch (err) {
      this._showError(err.message || 'Failed to save draft.');
    }
  },

  _savePostRecord: async function(status) {
    var content = this._generatedContent || {};
    var record = {
      user_id: this._userId,
      journey_type: this._currentJourney,
      inputs: this._journeyInputs,
      caption: content.caption || '',
      hashtags: content.hashtags || '',
      image_url: content.image_url || null,
      output_type: this._journeyInputs.output_type || 'social_post',
      connections: this._selectedConnections || [],
      status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (status === 'published') {
      record.published_at = new Date().toISOString();
    }

    var result = await this._supabase.from('social_posts').insert(record).select().single();
    if (result.error) {
      this._showError('Failed to save post. ' + (result.error.message || ''));
      return null;
    }

    await this._saveJourneyRecord(result.data.id, status);

    if (content.caption && this._saveOutputToCL) {
      this._saveOutputToCL(content, this._journeyInputs, this._currentJourney);
    }

    return result.data;
  },

  _saveJourneyRecord: async function(postId, status) {
    var record = {
      user_id: this._userId,
      journey_type: this._currentJourney,
      inputs: this._journeyInputs,
      outputs: this._generatedContent || {},
      hashtags: (this._generatedContent && this._generatedContent.hashtags) ? this._generatedContent.hashtags.split(/\s+/) : [],
      connections: this._selectedConnections || [],
      status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (this._journeyInputs.scheduled_for) {
      record.scheduled_for = this._journeyInputs.scheduled_for;
    }
    if (status === 'published') {
      record.published_at = new Date().toISOString();
    }
    if (this._journeyInputs.campaign_id) {
      record.campaign_id = this._journeyInputs.campaign_id;
    }
    var result = await this._supabase.from('journey_records').insert(record);
    if (result.error) console.error('[SM] journey_records insert error:', result.error.message);
  },

  _bindManagementTabs: function() {
    var self = this;

    document.getElementById('sm-drafts-search').addEventListener('input', function() {
      self._loadDrafts();
    });
    document.getElementById('sm-scheduled-search').addEventListener('input', function() {
      self._loadScheduled();
    });
    document.getElementById('sm-published-search').addEventListener('input', function() {
      self._loadPublished();
    });
    var sortBtn = document.getElementById('sm-published-sort-btn');
    var sortMenu = document.getElementById('sm-published-sort-menu');
    if (sortBtn && sortMenu) {
      sortBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        sortMenu.classList.toggle('open');
      });
      sortMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
        item.addEventListener('click', function() {
          sortMenu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
          item.classList.add('active');
          sortBtn.textContent = item.textContent;
          sortMenu.classList.remove('open');
          self._publishedSort = item.dataset.sort;
          self._loadPublished();
        });
      });
      document.addEventListener('click', function() { sortMenu.classList.remove('open'); });
    }

    document.getElementById('sm-view-list-btn').addEventListener('click', function() {
      self._scheduledView = 'list';
      document.getElementById('sm-view-list-btn').classList.add('active');
      document.getElementById('sm-view-calendar-btn').classList.remove('active');
      document.getElementById('sm-scheduled-list').style.display = '';
      document.getElementById('sm-scheduled-calendar').style.display = 'none';
    });
    document.getElementById('sm-view-calendar-btn').addEventListener('click', function() {
      self._scheduledView = 'calendar';
      document.getElementById('sm-view-calendar-btn').classList.add('active');
      document.getElementById('sm-view-list-btn').classList.remove('active');
      document.getElementById('sm-scheduled-list').style.display = 'none';
      document.getElementById('sm-scheduled-calendar').style.display = 'block';
      self._renderCalendar();
    });

    document.getElementById('sm-drafts-schedule-selected').addEventListener('click', function() {
      if (self._draftsSelected.size === 0) return;
      self._pendingBulkScheduleIds = Array.from(self._draftsSelected);
      self._pendingSchedulePostId = null;
      document.getElementById('sm-schedule-date').value = '';
      document.getElementById('sm-schedule-time').value = '';
      var modal = document.getElementById('sm-schedule-modal');
      if (modal) modal.classList.add('open');
    });
    document.getElementById('sm-drafts-delete-selected').addEventListener('click', function() {
      if (self._draftsSelected.size === 0) return;
      self._showConfirm('Delete Drafts', 'Are you sure you want to delete ' + self._draftsSelected.size + ' draft(s)? This cannot be undone.', function() {
        self._bulkDeleteDrafts();
      });
    });

    document.getElementById('sm-published-date-from').addEventListener('change', function() {
      self._publishedPage = 0; self._loadPublished();
    });
    document.getElementById('sm-published-date-to').addEventListener('change', function() {
      self._publishedPage = 0; self._loadPublished();
    });
    document.getElementById('sm-published-date-clear').addEventListener('click', function() {
      document.getElementById('sm-published-date-from').value = '';
      document.getElementById('sm-published-date-to').value = '';
      self._publishedPage = 0; self._loadPublished();
    });

    document.getElementById('sm-scheduled-reschedule-selected').addEventListener('click', function() {
      var selected = self._scheduledSelected;
      if (!selected || selected.size === 0) return;
      self._pendingBulkScheduleIds = Array.from(selected);
      self._pendingSchedulePostId = null;
      document.getElementById('sm-schedule-date').value = '';
      document.getElementById('sm-schedule-time').value = '';
      document.getElementById('sm-schedule-modal').classList.add('open');
    });
    document.getElementById('sm-scheduled-cancel-selected').addEventListener('click', function() {
      var selected = self._scheduledSelected;
      if (!selected || selected.size === 0) return;
      self._showConfirm('Cancel Selected', 'Move ' + selected.size + ' post(s) back to drafts?', async function() {
        var ids = Array.from(selected);
        for (var i = 0; i < ids.length; i++) {
          await self._supabase.from('scheduled_posts').delete().eq('social_post_id', ids[i]);
          await self._supabase.from('social_posts').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', ids[i]);
        }
        self._scheduledSelected = new Set();
        self._loadScheduled();
        self._loadStats();
      });
    });

    document.getElementById('sm-start-campaign-btn').addEventListener('click', function() {
      self._startCampaignWizard();
    });

    document.querySelectorAll('.sm-empty-create-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._switchTab('create');
      });
    });
  },

  _promptBlogPromotion: function(postRecord) {
    var self = this;
    this._showConfirm(
      'Promote Your Blog',
      'Your blog has been saved. Create a social post to promote this article?',
      function() {
        self._switchTab('create');
        self._startJourney('business_update', {
          news_type: 'Other',
          description: 'Promoting blog post: ' + (postRecord.caption || '').substring(0, 200)
        });
      }
    );
  },

  _scheduledItems: []
};
