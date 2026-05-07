window.SM_CAMPAIGN = {

  _supabase: null,
  _userId: null,
  _profile: null,
  _settings: null,
  _campaignInputs: {},
  _campaignStep: 0,
  _activeCampaign: null,
  _campaignPosts: [],
  _campaignPostsSelected: new Set(),

  CAMPAIGN_STEPS: [
    { id: 'goal', title: 'Campaign Goal', question: 'What do you want to achieve?' },
    { id: 'focus', title: 'Specific Focus', question: 'What should the campaign focus on?' },
    { id: 'timeframe', title: 'Timeframe', question: 'How long should the campaign run?' },
    { id: 'upcoming', title: 'Anything Happening Soon', question: 'Do you have anything coming up?' },
    { id: 'content', title: 'Content Inputs', question: 'What content do you have available?' },
    { id: 'frequency', title: 'Posting Frequency', question: 'How often should you post?' },
    { id: 'connections', title: 'Connections Check', question: 'Where should you publish?' }
  ],

  GOALS: [
    'Get more enquiries or leads',
    'Build awareness',
    'Promote something specific',
    'Stay top of mind',
    'Establish expertise',
    'Launch something new',
    'Not sure (AI helps decide)'
  ],

  TIMEFRAMES: [
    { id: '4w', label: '4 weeks' },
    { id: '8w', label: '8 weeks' },
    { id: '12w', label: '12 weeks' },
    { id: 'ongoing', label: 'Ongoing' },
    { id: 'unsure', label: 'Not sure (AI recommends)' }
  ],

  FREQUENCIES: [
    { id: '2x', label: '2x per week' },
    { id: '3x', label: '3x per week' },
    { id: 'daily', label: 'Daily' },
    { id: 'custom', label: 'Custom' }
  ],

  UPCOMING_TYPES: [
    'Special offer',
    'Event',
    'Seasonal moment',
    'Product/service launch',
    'Milestone or anniversary',
    'Award or recognition',
    'None of these'
  ],

  init: function(supabase, userId, profile, settings) {
    this._supabase = supabase;
    this._userId = userId;
    this._profile = profile || {};
    this._settings = settings || {};
  },

  startWizard: function() {
    this._campaignInputs = {};
    this._campaignStep = 0;
    var wizardEl = document.getElementById('sm-campaign-wizard');
    var contentEl = document.getElementById('sm-campaign-content');
    if (contentEl) contentEl.style.display = 'none';
    if (wizardEl) {
      wizardEl.classList.add('active');
      wizardEl.innerHTML = '<div class="sm-wizard-header">' +
        '<div class="sm-wizard-title" id="smc-wizard-title">New Marketing Campaign</div>' +
        '</div>' +
        '<div class="sm-step-indicator" id="smc-step-indicator"></div>' +
        '<div class="sm-step-content" id="smc-step-content"></div>' +
        '<div class="action-row sm-wizard-nav">' +
        '<button class="btn-back" id="smc-prev-btn" style="display:none">Back</button>' +
        '<button class="btn-outline" id="smc-save-btn">Save &amp; Exit</button>' +
        '<button class="btn-back" id="smc-next-btn">Next</button>' +
        '</div>';
      this._bindWizardNav();
      this._renderStep();
    }
  },

  _bindWizardNav: function() {
    var self = this;
    document.getElementById('smc-prev-btn').addEventListener('click', function() {
      if (self._campaignStep > 0) {
        self._saveStepData();
        self._campaignStep--;
        self._renderStep();
      }
    });
    document.getElementById('smc-next-btn').addEventListener('click', function() {
      self._saveStepData();
      if (self._campaignStep < self.CAMPAIGN_STEPS.length - 1) {
        self._campaignStep++;
        self._renderStep();
      } else {
        self._generatePlan();
      }
    });
    document.getElementById('smc-save-btn').addEventListener('click', function() {
      self._saveStepData();
      self._saveCampaignDraft();
    });
  },

  _exitWizard: function() {
    var wizardEl = document.getElementById('sm-campaign-wizard');
    var contentEl = document.getElementById('sm-campaign-content');
    if (wizardEl) wizardEl.classList.remove('active');
    if (contentEl) contentEl.style.display = '';
    this._campaignInputs = {};
    this._campaignStep = 0;
  },

  _renderStep: function() {
    var step = this.CAMPAIGN_STEPS[this._campaignStep];
    var indicator = document.getElementById('smc-step-indicator');
    var contentEl = document.getElementById('smc-step-content');
    var prevBtn = document.getElementById('smc-prev-btn');
    var nextBtn = document.getElementById('smc-next-btn');

    var barHtml = '<div class="sm-step-label">Step ' + (this._campaignStep + 1) + ' of ' + this.CAMPAIGN_STEPS.length + ' \u2014 ' + window.escHtml(step.title) + '</div>';
    barHtml += '<div class="sm-step-bar">';
    for (var d = 0; d < this.CAMPAIGN_STEPS.length; d++) {
      var cls = 'sm-step-seg';
      if (d < this._campaignStep) cls += ' sm-step-done';
      else if (d === this._campaignStep) cls += ' sm-step-current';
      else cls += ' sm-step-pending';
      barHtml += '<div class="' + cls + '"></div>';
    }
    barHtml += '</div>';
    indicator.innerHTML = barHtml;

    prevBtn.style.display = this._campaignStep > 0 ? '' : 'none';
    nextBtn.textContent = this._campaignStep === this.CAMPAIGN_STEPS.length - 1 ? 'Generate Plan' : 'Next';

    var html = '<div class="sm-step-question">' + window.escHtml(step.question) + '</div>';

    if (step.id === 'goal') html += this._renderGoalStep();
    else if (step.id === 'focus') html += this._renderFocusStep();
    else if (step.id === 'timeframe') html += this._renderTimeframeStep();
    else if (step.id === 'upcoming') html += this._renderUpcomingStep();
    else if (step.id === 'content') html += this._renderContentStep();
    else if (step.id === 'frequency') html += this._renderFrequencyStep();
    else if (step.id === 'connections') html += this._renderConnectionsStep();

    contentEl.innerHTML = html;
    this._bindStepEvents(step);
  },

  _renderGoalStep: function() {
    var current = this._campaignInputs.goal || '';
    var html = '<div class="sm-step-hint">Choose the primary goal for your campaign.</div>';
    html += '<div class="sm-pills-wrap">';
    this.GOALS.forEach(function(g) {
      var active = current === g ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-goal="' + window.escHtml(g) + '">' + window.escHtml(g) + '</button>';
    });
    html += '</div>';
    if (current && current !== 'Not sure (AI helps decide)') {
      html += '<div class="form-group"><label class="form-label">Any additional detail about this goal? (optional)</label>' +
        '<input type="text" class="form-input" id="smc-goal-detail" value="' + window.escHtml(this._campaignInputs.goal_detail || '') + '"></div>';
    }
    return html;
  },

  _renderFocusStep: function() {
    var current = this._campaignInputs.focus || '';
    var bp = this._profile || {};
    var options = ['General business promotion'];
    if (bp.bp_services) {
      var services = Array.isArray(bp.bp_services) ? bp.bp_services : [];
      services.forEach(function(s) {
        if (s && s.name) options.push(s.name);
      });
    }
    if (bp.bp_products) {
      var products = Array.isArray(bp.bp_products) ? bp.bp_products : [];
      products.forEach(function(p) {
        if (p && p.name) options.push(p.name);
      });
    }
    var html = '<div class="sm-step-hint">Focus on a specific service, product, or promote your business generally.</div>';
    html += '<div class="sm-pills-wrap">';
    options.forEach(function(o) {
      var active = current === o ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-focus="' + window.escHtml(o) + '">' + window.escHtml(o) + '</button>';
    });
    html += '</div>';
    html += '<div class="form-group"><label class="form-label">Target customer type (optional)</label>' +
      '<input type="text" class="form-input" id="smc-target-customer" placeholder="e.g. Homeowners, small businesses..." value="' + window.escHtml(this._campaignInputs.target_customer || '') + '"></div>';
    return html;
  },

  _renderTimeframeStep: function() {
    var current = this._campaignInputs.timeframe || '';
    var html = '<div class="sm-step-hint">How long should the campaign run?</div>';
    html += '<div class="sm-pills-wrap">';
    this.TIMEFRAMES.forEach(function(t) {
      var active = current === t.id ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-timeframe="' + t.id + '">' + window.escHtml(t.label) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderUpcomingStep: function() {
    var current = this._campaignInputs.upcoming || [];
    var html = '<div class="sm-step-hint">Select anything happening soon that the campaign should include.</div>';
    html += '<div class="sm-pills-wrap">';
    this.UPCOMING_TYPES.forEach(function(u) {
      var active = current.indexOf(u) !== -1 ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-upcoming="' + window.escHtml(u) + '">' + window.escHtml(u) + '</button>';
    });
    html += '</div>';
    if (current.length > 0 && current.indexOf('None of these') === -1) {
      html += '<div class="form-group"><label class="form-label">Share more about what is coming up</label>' +
        '<textarea class="form-input" id="smc-upcoming-detail" rows="3">' + window.escHtml(this._campaignInputs.upcoming_detail || '') + '</textarea></div>';
    }
    return html;
  },

  _renderContentStep: function() {
    var current = this._campaignInputs.content_source || '';
    var options = ['I have photos and videos to upload', 'Use my Content Library', 'AI-generated graphics only', 'A mix of all'];
    var html = '<div class="sm-step-hint">What content do you have available for the campaign?</div>';
    html += '<div class="sm-pills-wrap">';
    options.forEach(function(o) {
      var active = current === o ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-content="' + window.escHtml(o) + '">' + window.escHtml(o) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderFrequencyStep: function() {
    var current = this._campaignInputs.frequency || '';
    var html = '<div class="sm-step-hint">How often should you post? The AI will recommend a frequency based on your goal.</div>';
    html += '<div class="sm-pills-wrap">';
    this.FREQUENCIES.forEach(function(f) {
      var active = current === f.id ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-frequency="' + f.id + '">' + window.escHtml(f.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="form-group"><label class="form-label">Preferred posting days (optional)</label>' +
      '<div class="sm-pills-wrap" id="smc-days-pills">';
    var days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var selectedDays = this._campaignInputs.preferred_days || [];
    days.forEach(function(d) {
      var active = selectedDays.indexOf(d) !== -1 ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-day="' + d + '">' + d.substring(0, 3) + '</button>';
    });
    html += '</div></div>';
    return html;
  },

  _renderConnectionsStep: function() {
    var s = this._settings || {};
    var html = '<div class="sm-step-hint">Where should the campaign post to? You can also share manually.</div>';
    html += '<div class="sm-connection-checks">';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="smc-conn-facebook" value="facebook"' + (s.facebook_connected ? ' checked' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Facebook</span>' +
      '<span class="sm-connection-check-status">' + (s.facebook_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="smc-conn-instagram" value="instagram"' + (s.instagram_connected ? ' checked' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Instagram</span>' +
      '<span class="sm-connection-check-status">' + (s.instagram_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="smc-conn-manual" value="manual" checked>' +
      '<span class="sm-connection-check-label">Manual sharing (download for community groups, emails, etc.)</span>' +
      '</div>';
    html += '</div>';
    return html;
  },

  _bindStepEvents: function(step) {
    var self = this;

    if (step.id === 'goal') {
      document.querySelectorAll('[data-goal]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-goal]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._campaignInputs.goal = pill.dataset.goal;
          self._renderStep();
        });
      });
    }

    if (step.id === 'focus') {
      document.querySelectorAll('[data-focus]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-focus]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._campaignInputs.focus = pill.dataset.focus;
        });
      });
    }

    if (step.id === 'timeframe') {
      document.querySelectorAll('[data-timeframe]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-timeframe]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._campaignInputs.timeframe = pill.dataset.timeframe;
        });
      });
    }

    if (step.id === 'upcoming') {
      document.querySelectorAll('[data-upcoming]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          var val = pill.dataset.upcoming;
          if (!self._campaignInputs.upcoming) self._campaignInputs.upcoming = [];
          if (val === 'None of these') {
            self._campaignInputs.upcoming = ['None of these'];
          } else {
            self._campaignInputs.upcoming = self._campaignInputs.upcoming.filter(function(v) { return v !== 'None of these'; });
            var idx = self._campaignInputs.upcoming.indexOf(val);
            if (idx !== -1) self._campaignInputs.upcoming.splice(idx, 1);
            else self._campaignInputs.upcoming.push(val);
          }
          self._renderStep();
        });
      });
    }

    if (step.id === 'content') {
      document.querySelectorAll('[data-content]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-content]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._campaignInputs.content_source = pill.dataset.content;
        });
      });
    }

    if (step.id === 'frequency') {
      document.querySelectorAll('[data-frequency]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-frequency]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._campaignInputs.frequency = pill.dataset.frequency;
        });
      });
      document.querySelectorAll('[data-day]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          if (!self._campaignInputs.preferred_days) self._campaignInputs.preferred_days = [];
          pill.classList.toggle('active');
          var day = pill.dataset.day;
          var idx = self._campaignInputs.preferred_days.indexOf(day);
          if (idx !== -1) self._campaignInputs.preferred_days.splice(idx, 1);
          else self._campaignInputs.preferred_days.push(day);
        });
      });
    }
  },

  _saveStepData: function() {
    var step = this.CAMPAIGN_STEPS[this._campaignStep];
    if (step.id === 'goal') {
      var detail = document.getElementById('smc-goal-detail');
      if (detail) this._campaignInputs.goal_detail = detail.value;
    }
    if (step.id === 'focus') {
      var tc = document.getElementById('smc-target-customer');
      if (tc) this._campaignInputs.target_customer = tc.value;
    }
    if (step.id === 'upcoming') {
      var ud = document.getElementById('smc-upcoming-detail');
      if (ud) this._campaignInputs.upcoming_detail = ud.value;
    }
    if (step.id === 'connections') {
      var conns = [];
      var fb = document.getElementById('smc-conn-facebook');
      if (fb && fb.checked) conns.push('facebook');
      var ig = document.getElementById('smc-conn-instagram');
      if (ig && ig.checked) conns.push('instagram');
      var manual = document.getElementById('smc-conn-manual');
      if (manual && manual.checked) conns.push('manual');
      this._campaignInputs.connections = conns;
    }
  },

  _generatePlan: async function() {
    var self = this;
    var wizardEl = document.getElementById('sm-campaign-wizard');
    wizardEl.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Generating your marketing plan...</div></div>';

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var res = await fetch('/api/generate-campaign-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ inputs: this._campaignInputs })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate plan.');
      }

      var data = await res.json();
      this._showPlanReview(data.plan);
    } catch (err) {
      this._showError(err.message);
      this._exitWizard();
    }
  },

  _showPlanReview: function(planText) {
    var self = this;
    var wizardEl = document.getElementById('sm-campaign-wizard');

    var html = '<div class="sm-wizard-header">' +
      '<button class="btn-back" id="smc-plan-back">Back to Edit</button>' +
      '<div class="sm-wizard-title">Your Marketing Plan</div>' +
      '</div>' +
      '<div class="sm-step-content">' +
      '<div class="sm-step-hint">Review the plan below. You can edit it before confirming.</div>' +
      '<textarea class="form-input sm-plan-textarea" id="smc-plan-text">' + window.escHtml(planText) + '</textarea>' +
      '</div>' +
      '<div class="action-row sm-wizard-nav sm-edit-nav">' +
      '<button class="btn-outline" id="smc-plan-regenerate">Regenerate</button>' +
      '<button class="btn-primary" id="smc-plan-confirm">Confirm &amp; Create Campaign</button>' +
      '</div>';

    wizardEl.innerHTML = html;

    document.getElementById('smc-plan-back').addEventListener('click', function() {
      self._campaignStep = self.CAMPAIGN_STEPS.length - 1;
      self.startWizard();
      self._campaignStep = self.CAMPAIGN_STEPS.length - 1;
      self._renderStep();
    });
    document.getElementById('smc-plan-regenerate').addEventListener('click', function() {
      self._generatePlan();
    });
    document.getElementById('smc-plan-confirm').addEventListener('click', function() {
      var planText = document.getElementById('smc-plan-text').value;
      self._confirmPlan(planText);
    });
  },

  _confirmPlan: async function(planText) {
    try {
      var result = await this._supabase.from('campaigns').insert({
        user_id: this._userId,
        name: (this._campaignInputs.goal || 'Marketing Campaign').substring(0, 100),
        status: 'planned',
        inputs: this._campaignInputs,
        marketing_plan: planText,
        connections: this._campaignInputs.connections || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).select().single();

      if (result.error) {
        this._showError('Could not save campaign. ' + (result.error.message || ''));
        return;
      }

      this._activeCampaign = result.data;
      this._exitWizard();
      this._showPhase2(result.data);
    } catch (err) {
      this._showError(err.message);
    }
  },

  _showPhase2: async function(campaign) {
    var self = this;
    var contentEl = document.getElementById('sm-campaign-content');
    if (contentEl) contentEl.style.display = 'none';

    var activeEl = document.getElementById('sm-campaign-active');
    if (activeEl) {
      activeEl.style.display = 'block';
      activeEl.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Generating campaign posts from your marketing plan...</div></div>';
    }

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired.'); return; }

      var res = await fetch('/api/generate-campaign-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          action: 'generate-posts',
          campaign_id: campaign.id,
          marketing_plan: campaign.marketing_plan,
          inputs: campaign.inputs
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate posts.');
      }

      var data = await res.json();
      this._campaignPosts = data.posts || [];

      var updResult = await this._supabase.from('campaigns').update({
        status: 'implementing',
        updated_at: new Date().toISOString()
      }).eq('id', campaign.id);
      if (updResult.error) { this._showError('Could not update campaign status.'); return; }

      for (var i = 0; i < this._campaignPosts.length; i++) {
        var post = this._campaignPosts[i];
        var insResult = await this._supabase.from('campaign_outputs').insert({
          campaign_id: campaign.id,
          user_id: this._userId,
          journey_type: post.journey_type || 'social_post',
          caption: post.caption || '',
          hashtags: post.hashtags || '',
          scheduled_for: post.suggested_date || null,
          status: 'pending',
          sort_order: i,
          created_at: new Date().toISOString()
        });
        if (insResult.error) console.error('[SM Campaign] campaign_outputs insert error:', insResult.error.message);
      }

      this._renderPostReview(campaign);
    } catch (err) {
      this._showError(err.message);
      if (activeEl) activeEl.innerHTML = '';
    }
  },

  _renderPostReview: async function(campaign) {
    var self = this;
    var activeEl = document.getElementById('sm-campaign-active');
    if (!activeEl) return;

    var result = await this._supabase
      .from('campaign_outputs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('sort_order', { ascending: true });

    var posts = result.data || [];
    this._campaignPosts = posts;

    var pending = posts.filter(function(p) { return p.status === 'pending'; }).length;
    var approved = posts.filter(function(p) { return p.status === 'approved'; }).length;
    var total = posts.length;

    var isDesktop = window.innerWidth >= 768;
    var viewMode = this._reviewViewMode || (isDesktop ? 'grid' : 'list');

    var html = '<div class="sm-wizard-header">' +
      '<div class="sm-wizard-title">Review Campaign Posts</div>' +
      '<div style="margin-left:auto;display:flex;gap:8px">' +
        '<button class="filter-pill' + (viewMode === 'list' ? ' active' : '') + '" id="smc-view-list">List</button>' +
        '<button class="filter-pill' + (viewMode === 'grid' ? ' active' : '') + '" id="smc-view-grid">Grid</button>' +
      '</div>' +
      '</div>' +
      '<div class="sm-step-hint">' + approved + ' of ' + total + ' posts approved. ' + pending + ' pending review.</div>';

    if (pending === 0 && total > 0) {
      html += '<div class="sm-launch-wrap"><button class="btn-primary" id="smc-launch-btn">Launch Campaign</button></div>';
    } else {
      html += '<div class="sm-approve-wrap">' +
        '<button class="btn-outline btn-sm" id="smc-approve-all">Approve All Remaining</button>' +
        '<button class="btn-outline btn-sm" id="smc-approve-selected" style="display:none">Approve Selected</button>' +
        '</div>';
    }

    var listClass = viewMode === 'grid' ? 'sm-post-list sm-campaign-grid' : 'sm-post-list';
    html += '<div class="' + listClass + '">';
    posts.forEach(function(post, idx) {
      var statusBadge = '';
      if (post.status === 'approved') statusBadge = '<span class="badge badge-green">Approved</span>';
      else if (post.status === 'pending') statusBadge = '<span class="badge badge-orange">Pending</span>';
      else if (post.status === 'skipped') statusBadge = '<span class="badge badge-grey">Skipped</span>';

      var connList = (campaign.connections || []).map(function(c) {
        return c.charAt(0).toUpperCase() + c.slice(1);
      }).join(', ');

      html += '<div class="item-card sm-post-card" data-id="' + post.id + '">';
      if (post.status === 'pending') {
        html += '<div style="display:flex;align-items:center;padding:0 8px"><input type="checkbox" class="item-checkbox smc-select-check" data-selectid="' + post.id + '" style="width:18px;height:18px;accent-color:var(--blue)"></div>';
      }
      html += '<div class="sm-post-thumb">';
      if (post.image_url) {
        html += '<img src="' + window.escHtml(post.image_url) + '" alt="">';
      } else {
        html += '\uD83D\uDCDD';
      }
      html += '</div>' +
        '<div class="sm-post-body">' +
        '<div class="sm-post-meta">' +
        '<span class="sm-post-type">Post ' + (idx + 1) + '</span>' +
        statusBadge +
        (connList ? '<span class="sm-conn-label">' + window.escHtml(connList) + '</span>' : '') +
        (post.scheduled_for ? '<span class="sm-post-date">' + new Date(post.scheduled_for).toLocaleDateString('en-AU') + '</span>' : '') +
        '</div>' +
        '<div class="text-preview sm-text-preview">' + window.escHtml((post.caption || '').substring(0, 100)) + '</div>' +
        '<div class="sm-post-actions">';

      if (post.status === 'pending') {
        html += '<button class="btn-primary btn-sm" data-caction="approve" data-cid="' + post.id + '">Approve</button>' +
          '<button class="btn-outline btn-sm" data-caction="edit" data-cid="' + post.id + '">Edit</button>' +
          '<button class="btn-outline btn-sm" data-caction="regenerate" data-cid="' + post.id + '">Regenerate</button>' +
          '<button class="btn-outline btn-sm" data-caction="skip" data-cid="' + post.id + '">Skip</button>';
      } else if (post.status === 'approved') {
        html += '<button class="btn-outline btn-sm" data-caction="edit" data-cid="' + post.id + '">Edit</button>';
      }

      html += '</div></div></div>';
    });
    html += '</div>';

    activeEl.innerHTML = html;

    activeEl.querySelectorAll('[data-caction]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._handleCampaignPostAction(btn.dataset.caction, btn.dataset.cid, campaign);
      });
    });

    var approveAllBtn = document.getElementById('smc-approve-all');
    if (approveAllBtn) {
      approveAllBtn.addEventListener('click', function() {
        self._approveAllPosts(campaign);
      });
    }

    var launchBtn = document.getElementById('smc-launch-btn');
    if (launchBtn) {
      launchBtn.addEventListener('click', function() {
        self._launchCampaign(campaign);
      });
    }

    var viewListBtn = document.getElementById('smc-view-list');
    var viewGridBtn = document.getElementById('smc-view-grid');
    if (viewListBtn) {
      viewListBtn.addEventListener('click', function() {
        self._reviewViewMode = 'list';
        self._renderPostReview(campaign);
      });
    }
    if (viewGridBtn) {
      viewGridBtn.addEventListener('click', function() {
        self._reviewViewMode = 'grid';
        self._renderPostReview(campaign);
      });
    }

    var approveSelectedBtn = document.getElementById('smc-approve-selected');
    activeEl.querySelectorAll('.smc-select-check').forEach(function(cb) {
      cb.addEventListener('change', function() {
        if (cb.checked) self._campaignPostsSelected.add(cb.dataset.selectid);
        else self._campaignPostsSelected.delete(cb.dataset.selectid);
        if (approveSelectedBtn) {
          if (self._campaignPostsSelected.size > 0) {
            approveSelectedBtn.style.display = '';
            approveSelectedBtn.textContent = 'Approve Selected (' + self._campaignPostsSelected.size + ')';
          } else {
            approveSelectedBtn.style.display = 'none';
          }
        }
      });
    });
    if (approveSelectedBtn) {
      approveSelectedBtn.addEventListener('click', async function() {
        var ids = Array.from(self._campaignPostsSelected);
        if (ids.length === 0) return;
        var bulkRes = await self._supabase.from('campaign_outputs').update({
          status: 'approved', updated_at: new Date().toISOString()
        }).in('id', ids);
        if (bulkRes.error) { self._showError('Could not approve selected posts.'); return; }
        self._campaignPostsSelected = new Set();
        self._renderPostReview(campaign);
      });
    }
  },

  _handleCampaignPostAction: async function(action, postId, campaign) {
    var self = this;
    if (action === 'approve') {
      var approveRes = await this._supabase.from('campaign_outputs').update({
        status: 'approved',
        updated_at: new Date().toISOString()
      }).eq('id', postId);
      if (approveRes.error) { this._showError('Could not approve post.'); return; }
      this._renderPostReview(campaign);
    } else if (action === 'skip') {
      var skipRes = await this._supabase.from('campaign_outputs').update({
        status: 'skipped',
        updated_at: new Date().toISOString()
      }).eq('id', postId);
      if (skipRes.error) { this._showError('Could not skip post.'); return; }
      this._renderPostReview(campaign);
    } else if (action === 'edit') {
      this._editCampaignPost(postId, campaign);
    } else if (action === 'regenerate') {
      this._regenerateCampaignPost(postId, campaign);
    }
  },

  _editCampaignPost: async function(postId, campaign) {
    var self = this;
    var result = await this._supabase.from('campaign_outputs').select('*').eq('id', postId).single();
    if (result.error || !result.data) return;
    var post = result.data;

    var activeEl = document.getElementById('sm-campaign-active');
    activeEl.innerHTML = '<div class="sm-wizard-header">' +
      '<button class="btn-back" id="smc-edit-back">Back to Review</button>' +
      '<div class="sm-wizard-title">Edit Post</div></div>' +
      '<div class="sm-step-content">' +
      '<div class="form-group"><label class="form-label">Caption</label>' +
      '<textarea class="form-input sm-edit-textarea" id="smc-edit-caption">' + window.escHtml(post.caption || '') + '</textarea></div>' +
      '<div class="form-group"><label class="form-label">Hashtags</label>' +
      '<input type="text" class="form-input sm-edit-hashtags-colour" id="smc-edit-hashtags" value="' + window.escHtml(post.hashtags || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Scheduled date</label>' +
      '<input type="date" class="form-input" id="smc-edit-date" value="' + (post.scheduled_for ? post.scheduled_for.substring(0, 10) : '') + '"></div>' +
      '</div>' +
      '<div class="action-row sm-wizard-nav sm-edit-nav">' +
      '<button class="btn-primary" id="smc-edit-save">Save Changes</button></div>';

    document.getElementById('smc-edit-back').addEventListener('click', function() {
      self._renderPostReview(campaign);
    });
    document.getElementById('smc-edit-save').addEventListener('click', async function() {
      var editRes = await self._supabase.from('campaign_outputs').update({
        caption: document.getElementById('smc-edit-caption').value,
        hashtags: document.getElementById('smc-edit-hashtags').value,
        scheduled_for: document.getElementById('smc-edit-date').value || null,
        updated_at: new Date().toISOString()
      }).eq('id', postId);
      if (editRes.error) { self._showError('Could not save changes.'); return; }
      self._renderPostReview(campaign);
    });
  },

  _regenerateCampaignPost: async function(postId, campaign) {
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) return;

      var result = await this._supabase.from('campaign_outputs').select('*').eq('id', postId).single();
      if (!result.data) return;

      var res = await fetch('/api/generate-social-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          journey_type: result.data.journey_type || 'business_update',
          inputs: { description: result.data.caption },
          output_type: 'social_post'
        })
      });

      if (res.ok) {
        var data = await res.json();
        var regenRes = await this._supabase.from('campaign_outputs').update({
          caption: data.caption || data.content || '',
          hashtags: data.hashtags || '',
          status: 'pending',
          updated_at: new Date().toISOString()
        }).eq('id', postId);
        if (regenRes.error) { this._showError('Could not save regenerated post.'); return; }
      } else {
        this._showError('Could not regenerate post. Please try again.');
      }
      this._renderPostReview(campaign);
    } catch (err) {
      this._showError('Could not regenerate post.');
    }
  },

  _approveAllPosts: async function(campaign) {
    var bulkRes = await this._supabase.from('campaign_outputs').update({
      status: 'approved',
      updated_at: new Date().toISOString()
    }).eq('campaign_id', campaign.id).eq('status', 'pending');
    if (bulkRes.error) { this._showError('Could not approve posts.'); return; }
    this._renderPostReview(campaign);
  },

  _launchCampaign: async function(campaign) {
    var self = this;
    var outputs = await self._supabase
      .from('campaign_outputs')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'approved')
      .order('sort_order', { ascending: true });
    if (outputs.error) { self._showError('Could not load campaign posts.'); return; }

    var posts = outputs.data || [];
    var platforms = (campaign.connections || []).filter(function(c) { return c !== 'manual'; });
    var platformList = platforms.map(function(c) { return c.charAt(0).toUpperCase() + c.slice(1); }).join(', ') || 'Manual only';
    var firstDate = posts.length > 0 && posts[0].scheduled_for
      ? new Date(posts[0].scheduled_for).toLocaleDateString('en-AU')
      : 'Not set';

    var summaryHtml = '<div style="text-align:left;margin:12px 0">' +
      '<div style="margin-bottom:8px"><strong>Total posts:</strong> ' + posts.length + '</div>' +
      '<div style="margin-bottom:8px"><strong>First post date:</strong> ' + firstDate + '</div>' +
      '<div><strong>Platforms:</strong> ' + window.escHtml(platformList) + '</div>' +
      '</div>';

    window.SOCIAL_LOGIC._showConfirm(
      'Launch Campaign',
      summaryHtml,
      async function() {

        var posts = outputs.data || [];
        for (var i = 0; i < posts.length; i++) {
          var p = posts[i];
          var postResult = await self._supabase.from('social_posts').insert({
            user_id: self._userId,
            journey_type: p.journey_type || 'social_post',
            caption: p.caption,
            hashtags: p.hashtags,
            status: 'scheduled',
            campaign_id: campaign.id,
            connections: campaign.connections || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }).select().single();

          if (postResult.error) { console.error('[SM Campaign] social_posts insert error:', postResult.error.message); continue; }
          if (postResult.data && p.scheduled_for) {
            var schedRes = await self._supabase.from('scheduled_posts').insert({
              user_id: self._userId,
              social_post_id: postResult.data.id,
              scheduled_for: p.scheduled_for,
              platforms: campaign.connections || ['facebook'],
              status: 'pending'
            });
            if (schedRes.error) console.error('[SM Campaign] scheduled_posts insert error:', schedRes.error.message);
          }
        }

        var launchRes = await self._supabase.from('campaigns').update({
          status: 'active',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('id', campaign.id);
        if (launchRes.error) { self._showError('Could not launch campaign.'); return; }

        self.renderActive(campaign.id);
      }
    );
  },

  renderActive: async function(campaignId) {
    var self = this;
    var result = await this._supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (result.error || !result.data) return;
    var campaign = result.data;
    this._activeCampaign = campaign;

    var contentEl = document.getElementById('sm-campaign-content');
    if (contentEl) contentEl.style.display = 'none';

    var activeEl = document.getElementById('sm-campaign-active');
    if (!activeEl) return;
    activeEl.style.display = 'block';

    var postsResult = await this._supabase
      .from('social_posts')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    var posts = postsResult.data || [];
    var published = posts.filter(function(p) { return p.status === 'published'; });
    var scheduled = posts.filter(function(p) { return p.status === 'scheduled'; });
    var totalReach = 0;
    var totalEngagement = 0;
    published.forEach(function(p) {
      totalReach += (p.reach || 0);
      totalEngagement += (p.engagement || 0);
    });

    var statusBadge = '';
    if (campaign.status === 'active') statusBadge = '<span class="badge badge-green">Active</span>';
    else if (campaign.status === 'paused') statusBadge = '<span class="badge badge-orange">Paused</span>';
    else if (campaign.status === 'completed') statusBadge = '<span class="badge badge-grey">Completed</span>';
    else statusBadge = '<span class="badge badge-blue">' + window.escHtml(campaign.status) + '</span>';

    var weekLabel = '';
    var timeframeId = (campaign.inputs && campaign.inputs.timeframe) || '';
    var totalWeeksMap = { '4w': 4, '8w': 8, '12w': 12 };
    var totalWeeks = totalWeeksMap[timeframeId] || 0;
    if (campaign.started_at) {
      var startMs = new Date(campaign.started_at).getTime();
      var nowMs = Date.now();
      var currentWeek = Math.max(1, Math.ceil((nowMs - startMs) / (7 * 24 * 60 * 60 * 1000)));
      if (totalWeeks > 0) {
        weekLabel = '<span class="badge badge-blue">Week ' + currentWeek + ' of ' + totalWeeks + '</span>';
      } else {
        weekLabel = '<span class="badge badge-blue">Week ' + currentWeek + '</span>';
      }
    }

    var html = '<div class="sm-campaign-header">' +
      '<div class="detail-title">' + window.escHtml(campaign.name || 'Marketing Campaign') + '</div>' +
      statusBadge + weekLabel +
      '</div>';

    html += '<div class="stats-bar">' +
      '<div class="stat-card green"><div class="stat-value">' + published.length + '</div><div class="stat-label">Published</div></div>' +
      '<div class="stat-card"><div class="stat-value">' + scheduled.length + '</div><div class="stat-label">Scheduled</div></div>' +
      '<div class="stat-card teal"><div class="stat-value">' + totalReach + '</div><div class="stat-label">Total Reach</div></div>' +
      '<div class="stat-card orange"><div class="stat-value">' + totalEngagement + '</div><div class="stat-label">Engagement</div></div>' +
      '</div>';

    if (scheduled.length > 0) {
      var next = scheduled[0];
      html += '<div class="sm-step-content sm-next-post">' +
        '<div class="sm-step-question">Next Post</div>' +
        '<div class="sm-next-post-body">' +
        window.escHtml((next.caption || '').substring(0, 200)) + '</div></div>';
    }

    html += '<div class="action-row sm-publish-actions sm-campaign-actions">';
    if (campaign.status === 'active') {
      html += '<button class="btn-outline" id="smc-pause">Pause Campaign</button>';
      html += '<button class="btn-outline" id="smc-add-post">Add a Post</button>';
      html += '<button class="btn-outline" id="smc-extend">Extend Campaign</button>';
    } else if (campaign.status === 'paused') {
      html += '<button class="btn-primary" id="smc-resume">Resume Campaign</button>';
    }
    html += '<button class="btn-dismiss" id="smc-end">End Campaign</button>';
    html += '</div>';

    html += '<div class="sm-step-question sm-timeline-title">Campaign Timeline</div>';

    var campaignStartMs = campaign.started_at ? new Date(campaign.started_at).getTime() : (posts.length > 0 ? new Date(posts[0].created_at).getTime() : Date.now());
    var weekBuckets = {};
    posts.forEach(function(post) {
      var postMs = post.published_at ? new Date(post.published_at).getTime() : new Date(post.created_at).getTime();
      var weekNum = Math.max(1, Math.ceil((postMs - campaignStartMs) / (7 * 24 * 60 * 60 * 1000)));
      if (weekNum < 1) weekNum = 1;
      if (!weekBuckets[weekNum]) weekBuckets[weekNum] = [];
      weekBuckets[weekNum].push(post);
    });
    var weekNums = Object.keys(weekBuckets).map(Number).sort(function(a, b) { return a - b; });
    var displayTotalWeeks = totalWeeks || (weekNums.length > 0 ? weekNums[weekNums.length - 1] : 1);

    weekNums.forEach(function(wn) {
      var weekTitle = totalWeeks > 0 ? 'Week ' + wn + ' of ' + displayTotalWeeks : 'Week ' + wn;
      html += '<div class="sm-step-content sm-week-card">' +
        '<div class="sm-step-question sm-timeline-title">' + weekTitle + '</div>' +
        '<div class="sm-post-list">';
      weekBuckets[wn].forEach(function(post) {
        var pBadge = '';
        if (post.status === 'published') pBadge = '<span class="badge badge-green">Published</span>';
        else if (post.status === 'scheduled') pBadge = '<span class="badge badge-blue">Scheduled</span>';
        else pBadge = '<span class="badge badge-grey">' + window.escHtml(post.status) + '</span>';

        html += '<div class="item-card sm-post-card"><div class="sm-post-thumb">';
        if (post.image_url) {
          html += '<img src="' + window.escHtml(post.image_url) + '" alt="">';
        } else {
          html += '\uD83D\uDCDD';
        }
        html += '</div>' +
          '<div class="sm-post-body"><div class="sm-post-meta">' + pBadge +
          '<span class="sm-post-date">' + (post.published_at ? new Date(post.published_at).toLocaleDateString('en-AU') : (post.created_at ? new Date(post.created_at).toLocaleDateString('en-AU') : '')) + '</span></div>' +
          '<div class="text-preview sm-text-preview">' + window.escHtml((post.caption || '').substring(0, 100)) + '</div>';

        if (post.status === 'published') {
          html += '<div class="sm-post-metrics">' +
            '<div class="sm-post-metric">\uD83D\uDC41 <span class="sm-post-metric-value">' + (post.reach || 0) + '</span></div>' +
            '<div class="sm-post-metric">\u2764\uFE0F <span class="sm-post-metric-value">' + (post.engagement || 0) + '</span></div>' +
            '</div>';
        }
        html += '</div></div>';
      });
      html += '</div></div>';
    });

    html += '<div id="smc-campaign-history"></div>';

    activeEl.innerHTML = html;

    var pauseBtn = document.getElementById('smc-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', function() { self._setCampaignStatus(campaign.id, 'paused'); });
    var resumeBtn = document.getElementById('smc-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', function() { self._setCampaignStatus(campaign.id, 'active'); });
    var endBtn = document.getElementById('smc-end');
    if (endBtn) {
      endBtn.addEventListener('click', function() {
        window.SOCIAL_LOGIC._showConfirm('End Campaign', 'Published posts will remain. Scheduled posts will be cancelled.', function() {
          self._setCampaignStatus(campaign.id, 'completed');
        });
      });
    }
    var addBtn = document.getElementById('smc-add-post');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        window.SOCIAL_LOGIC._switchTab('create');
      });
    }
    var extendBtn = document.getElementById('smc-extend');
    if (extendBtn) {
      extendBtn.addEventListener('click', function() {
        self._showExtendForm(campaign);
      });
    }

    this._loadCampaignHistory();
  },

  _setCampaignStatus: async function(campaignId, status) {
    var statusRes = await this._supabase.from('campaigns').update({
      status: status,
      updated_at: new Date().toISOString()
    }).eq('id', campaignId);
    if (statusRes.error) { this._showError('Could not update campaign status.'); return; }

    if (status === 'completed') {
      var cancelRes = await this._supabase.from('scheduled_posts')
        .update({ status: 'cancelled' })
        .eq('user_id', this._userId)
        .in('social_post_id',
          this._supabase.from('social_posts').select('id').eq('campaign_id', campaignId).eq('status', 'scheduled')
        );
      if (cancelRes.error) console.error('[SM Campaign] cancel scheduled_posts error:', cancelRes.error.message);
    }

    this.renderActive(campaignId);
  },

  _saveCampaignDraft: async function() {
    var result = await this._supabase.from('campaigns').insert({
      user_id: this._userId,
      name: (this._campaignInputs.goal || 'Draft Campaign').substring(0, 100),
      status: 'planning',
      inputs: this._campaignInputs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (result.error) {
      this._showError('Could not save campaign draft.');
      return;
    }
    this._exitWizard();
  },

  _loadCampaignHistoryEmpty: async function() {
    var container = document.getElementById('smc-campaign-history-empty');
    if (!container) return;

    var result = await this._supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', this._userId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '';
      return;
    }

    this._renderHistoryList(result.data, container);
  },

  _loadCampaignHistory: async function() {
    var container = document.getElementById('smc-campaign-history');
    if (!container) return;

    var result = await this._supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', this._userId)
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (result.error || !result.data || result.data.length === 0) {
      container.innerHTML = '';
      return;
    }

    this._renderHistoryList(result.data, container);
  },

  _renderHistoryList: async function(campaigns, container) {
    var self = this;
    var html = '<div class="sm-step-question sm-campaign-history-title">Campaign History</div>';

    for (var i = 0; i < campaigns.length; i++) {
      var c = campaigns[i];
      var postsResult = await self._supabase
        .from('social_posts')
        .select('status,reach,engagement')
        .eq('campaign_id', c.id);

      var posts = postsResult.data || [];
      var published = posts.filter(function(p) { return p.status === 'published'; }).length;
      var totalReach = 0;
      var totalEngagement = 0;
      posts.forEach(function(p) {
        totalReach += (p.reach || 0);
        totalEngagement += (p.engagement || 0);
      });

      var startDate = c.created_at ? new Date(c.created_at).toLocaleDateString('en-AU') : '';
      var endDate = c.updated_at ? new Date(c.updated_at).toLocaleDateString('en-AU') : '';

      html += '<div class="item-card sm-campaign-history-card">' +
        '<div class="sm-campaign-history-row">' +
        '<div><div class="sm-campaign-history-name">' + window.escHtml(c.name || 'Campaign') + '</div>' +
        '<div class="sm-campaign-history-dates">' + startDate + ' \u2014 ' + endDate + '</div></div>' +
        '<button class="btn-outline btn-sm" data-runagain="' + c.id + '">Run Again</button>' +
        '</div>' +
        '<div class="stats-bar sm-campaign-history-stats">' +
        '<div class="stat-card green sm-stat-compact"><div class="stat-value">' + published + '</div><div class="stat-label">Published</div></div>' +
        '<div class="stat-card teal sm-stat-compact"><div class="stat-value">' + totalReach + '</div><div class="stat-label">Reach</div></div>' +
        '<div class="stat-card orange sm-stat-compact"><div class="stat-value">' + totalEngagement + '</div><div class="stat-label">Engagement</div></div>' +
        '</div></div>';
    }

    container.innerHTML = html;

    container.querySelectorAll('[data-runagain]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._runAgain(btn.dataset.runagain);
      });
    });
  },

  _runAgain: async function(campaignId) {
    var result = await this._supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (result.error || !result.data) {
      this._showError('Could not load campaign details.');
      return;
    }

    var campaign = result.data;
    this._campaignInputs = campaign.inputs || {};
    this._campaignStep = 0;

    var wizardEl = document.getElementById('sm-campaign-wizard');
    var contentEl = document.getElementById('sm-campaign-content');
    var activeEl = document.getElementById('sm-campaign-active');
    if (contentEl) contentEl.style.display = 'none';
    if (activeEl) activeEl.style.display = 'none';
    if (wizardEl) {
      wizardEl.classList.add('active');
      wizardEl.innerHTML = '<div class="sm-wizard-header">' +
        '<div class="sm-wizard-title">New Campaign (from previous)</div>' +
        '</div>' +
        '<div class="sm-step-indicator" id="smc-step-indicator"></div>' +
        '<div class="sm-step-content" id="smc-step-content"></div>' +
        '<div class="action-row sm-wizard-nav">' +
        '<button class="btn-back" id="smc-prev-btn" style="display:none">Back</button>' +
        '<button class="btn-outline" id="smc-save-btn">Save &amp; Exit</button>' +
        '<button class="btn-back" id="smc-next-btn">Next</button>' +
        '</div>';
      this._bindWizardNav();
      this._renderStep();
    }
  },

  _showExtendForm: function(campaign) {
    var self = this;
    var activeEl = document.getElementById('sm-campaign-active');
    if (!activeEl) return;

    var prevHtml = activeEl.innerHTML;

    var html = '<div class="sm-wizard-header">' +
      '<button class="btn-back" id="smc-extend-back">Back</button>' +
      '<div class="sm-wizard-title">Extend Campaign</div>' +
      '</div>' +
      '<div class="sm-step-content">' +
      '<div class="sm-step-hint">Add more posts to your running campaign.</div>' +
      '<div class="form-group"><label class="form-label">Additional weeks</label>' +
      '<select class="form-input sm-extend-select" id="smc-extend-weeks">' +
      '<option value="1">1 week</option>' +
      '<option value="2" selected>2 weeks</option>' +
      '<option value="3">3 weeks</option>' +
      '<option value="4">4 weeks</option>' +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Posts per week</label>' +
      '<select class="form-input sm-extend-select" id="smc-extend-ppw">' +
      '<option value="2">2 per week</option>' +
      '<option value="3" selected>3 per week</option>' +
      '<option value="4">4 per week</option>' +
      '<option value="5">5 per week</option>' +
      '</select></div>' +
      '</div>' +
      '<div class="action-row sm-wizard-nav sm-edit-nav">' +
      '<button class="btn-primary" id="smc-extend-submit">Generate Extension Posts</button>' +
      '</div>';

    activeEl.innerHTML = html;

    document.getElementById('smc-extend-back').addEventListener('click', function() {
      self.renderActive(campaign.id);
    });
    document.getElementById('smc-extend-submit').addEventListener('click', function() {
      var weeks = parseInt(document.getElementById('smc-extend-weeks').value, 10);
      var ppw = parseInt(document.getElementById('smc-extend-ppw').value, 10);
      self._submitExtend(campaign, weeks, ppw);
    });
  },

  _submitExtend: async function(campaign, weeks, postsPerWeek) {
    var self = this;
    var activeEl = document.getElementById('sm-campaign-active');
    if (activeEl) {
      activeEl.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Generating extension posts...</div></div>';
    }

    try {
      var existingResult = await this._supabase
        .from('campaign_outputs')
        .select('sort_order')
        .eq('campaign_id', campaign.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      var startOrder = 0;
      if (existingResult.data) {
        startOrder = (existingResult.data.sort_order || 0) + 1;
      }

      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var extendContext = 'This is an EXTENSION of an existing campaign. Generate ' + (weeks * postsPerWeek) +
        ' additional posts (' + postsPerWeek + ' per week for ' + weeks + ' weeks). ' +
        'Continue the themes and style of the existing campaign. Start dates from next week onwards.';

      var res = await fetch('/api/generate-campaign-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          action: 'generate-posts',
          campaign_id: campaign.id,
          marketing_plan: (campaign.marketing_plan || '') + '\n\n' + extendContext,
          inputs: campaign.inputs || {}
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate extension posts.');
      }

      var data = await res.json();
      var newPosts = data.posts || [];

      for (var i = 0; i < newPosts.length; i++) {
        var post = newPosts[i];
        var insResult = await this._supabase.from('campaign_outputs').insert({
          campaign_id: campaign.id,
          user_id: this._userId,
          journey_type: post.journey_type || 'social_post',
          caption: post.caption || '',
          hashtags: post.hashtags || '',
          scheduled_for: post.suggested_date || null,
          status: 'pending',
          sort_order: startOrder + i,
          created_at: new Date().toISOString()
        });
        if (insResult.error) console.error('[SM Campaign] extend insert error:', insResult.error.message);
      }

      await this._supabase.from('campaigns').update({
        updated_at: new Date().toISOString()
      }).eq('id', campaign.id);

      this._renderPostReview(campaign);
    } catch (err) {
      this._showError(err.message);
      this.renderActive(campaign.id);
    }
  },

  _showError: function(msg) {
    if (window.SOCIAL_LOGIC && window.SOCIAL_LOGIC._showError) {
      window.SOCIAL_LOGIC._showError(msg);
    }
  }
};
