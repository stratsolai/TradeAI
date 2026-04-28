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
      { id: 'details', title: 'Details', question: 'Tell us about the job' },
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
      { id: 'details', title: 'Details', question: 'Give us some details' },
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
      { id: 'details', title: 'Details', question: 'Tell us more' },
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
    this._supabase = supabase;
    this._userId = user.id;
    this._bindTabs();
    this._bindWizardNav();
    this._bindPublishActions();
    this._bindModals();
    this._bindManagementTabs();
    this._renderGroups();
    await this._loadData();
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
      this._loadStats()
    ]);
  },

  _loadSettings: async function() {
    var result = await this._supabase
      .from('social_settings')
      .select('*')
      .eq('user_id', this._userId)
      .maybeSingle();
    this._settings = (result.data) || {};
  },

  _loadProfile: async function() {
    var result = await this._supabase
      .from('business_profiles')
      .select('*')
      .eq('user_id', this._userId)
      .maybeSingle();
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
    var modal = document.getElementById('sm-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = msg;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  },

  _showConfirm: function(title, body, onConfirm) {
    var modal = document.getElementById('sm-confirm-modal');
    if (!modal) return;
    document.getElementById('sm-confirm-title').textContent = title;
    document.getElementById('sm-confirm-body').textContent = body;
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
  },

  _renderStep: function() {
    var steps = this.JOURNEY_STEPS[this._currentJourney];
    if (!steps) return;
    var step = steps[this._currentStep];

    var indicator = document.getElementById('sm-step-indicator');
    var contentEl = document.getElementById('sm-step-content');
    var prevBtn = document.getElementById('sm-step-prev-btn');
    var nextBtn = document.getElementById('sm-step-next-btn');

    var dotHtml = '';
    var visibleSteps = steps.filter(function(s) {
      return s.id !== 'generate' && s.id !== 'edit_approve' && s.id !== 'publish';
    });
    var visibleIndex = 0;
    for (var vi = 0; vi < visibleSteps.length; vi++) {
      if (visibleSteps[vi].id === step.id) { visibleIndex = vi; break; }
    }
    for (var d = 0; d < visibleSteps.length; d++) {
      var cls = 'sm-step-dot';
      if (d < visibleIndex) cls += ' completed';
      if (d === visibleIndex) cls += ' active';
      dotHtml += '<div class="' + cls + '"></div>';
    }
    dotHtml += '<span class="sm-step-label">Step ' + (visibleIndex + 1) + ' of ' + visibleSteps.length + ' &mdash; ' + window.escHtml(step.title) + '</span>';
    indicator.innerHTML = dotHtml;

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
    html += '<div class="sm-media-area" id="sm-media-drop">' +
      '<div class="sm-media-area-icon">\uD83D\uDCF7</div>' +
      '<div class="sm-media-area-text">Click to upload or drag and drop</div>' +
      '<div class="sm-media-area-hint">Photos and videos accepted. Multiple files supported for carousel.</div>' +
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
        html += '<div class="sm-media-preview-item">' +
          '<img src="' + window.escHtml(url) + '" alt="">' +
          '<button class="sm-media-remove" data-idx="' + idx + '">\u2715</button>' +
          '</div>';
      });
      html += '</div>';
    }
    return html;
  },

  _renderToneStep: function() {
    var currentTone = this._journeyInputs.tone || '';
    var html = '<div class="sm-step-hint">This sets the voice for your content. You can always change it.</div>';
    html += '<div class="sm-tone-pills">';
    this.TONES.forEach(function(t) {
      var active = currentTone === t.id ? ' active' : '';
      html += '<button class="sm-tone-pill' + active + '" data-tone="' + t.id + '">' +
        window.escHtml(t.label) + '<br><span style="font-size:12px;font-weight:400;color:var(--text-muted)">' +
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
    var current = this._journeyInputs.output_type || 'social_post';
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
    html += '<div class="sm-option-pills">';
    options.forEach(function(o) {
      var active = current === o.id ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-output="' + o.id + '">' + window.escHtml(o.label) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderHeadlineStep: function() {
    var html = '<div class="sm-step-hint">A headline for your graphic. The AI can suggest one, or enter your own.</div>';
    html += '<div class="form-group"><label class="form-label">Headline</label>' +
      '<input type="text" class="form-input" id="sm-field-headline" placeholder="Enter a headline or leave blank for AI suggestion" value="' + window.escHtml(this._journeyInputs.headline || '') + '"></div>';
    html += '<div class="form-group" style="display:flex;align-items:center;gap:8px">' +
      '<input type="checkbox" id="sm-field-headline-on-graphic" style="width:var(--checkbox-size);height:var(--checkbox-size)"' +
      (this._journeyInputs.headline_on_graphic !== false ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-headline-on-graphic" style="margin-bottom:0">Include headline on graphic</label></div>';
    return html;
  },

  _renderStoryTypeStep: function() {
    var current = this._journeyInputs.story_type || '';
    var types = ['Team spotlight', 'How we work', 'Our workspace', 'Day in the life', 'Other'];
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-story="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderTextStep: function(step) {
    var field = step.id;
    var html = '<div class="form-group"><label class="form-label">' + window.escHtml(step.question) + '</label>' +
      '<textarea class="form-input" id="sm-field-' + field + '" rows="4">' + window.escHtml(this._journeyInputs[field] || '') + '</textarea></div>';
    return html;
  },

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
    html += '<div class="form-group" style="display:flex;align-items:center;gap:8px">' +
      '<input type="checkbox" id="sm-field-ongoing" style="width:var(--checkbox-size);height:var(--checkbox-size)"' +
      (vals.ongoing ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-ongoing" style="margin-bottom:0">Ongoing / while stocks last</label></div>';
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
    var html = '<div class="sm-option-pills">';
    options.forEach(function(o) {
      var active = current === o ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-source="' + window.escHtml(o) + '">' + window.escHtml(o) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderTopicStep: function() {
    var current = this._journeyInputs.topic_type || '';
    var types = ['How-to', 'Common mistake to avoid', 'FAQ answer', 'Pro tip', 'Myth buster'];
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-topic="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
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
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-audience="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderNewsTypeStep: function() {
    var current = this._journeyInputs.news_type || '';
    var types = ['New team member', 'Milestone', 'Award', 'New location', 'Anniversary', 'Partnership', 'Rebrand', 'Other'];
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-newstype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    return html;
  },

  _renderProjectStep: function() {
    var html = '<div class="sm-step-hint">Choose from your completed projects, or enter details manually.</div>';
    html += '<div class="sm-option-pills">' +
      '<button class="sm-option-pill" id="sm-project-manual">Enter manually</button>' +
      '</div>';
    html += '<div id="sm-project-list" style="margin-top:16px"></div>';
    html += '<div id="sm-project-manual-fields" style="display:none;margin-top:16px">' +
      '<div class="form-group"><label class="form-label">Customer first name</label>' +
      '<input type="text" class="form-input" id="sm-field-customer-name" value="' + window.escHtml(this._journeyInputs.customer_name || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Service provided</label>' +
      '<input type="text" class="form-input" id="sm-field-service" value="' + window.escHtml(this._journeyInputs.service || '') + '"></div>' +
      '</div>';
    return html;
  },

  _renderTestimonialStep: function() {
    var html = '<div class="form-group"><label class="form-label">Testimonial text</label>' +
      '<textarea class="form-input" id="sm-field-testimonial" rows="4" placeholder="What did the customer say?">' +
      window.escHtml(this._journeyInputs.testimonial || '') + '</textarea></div>';
    return html;
  },

  _renderLogoStep: function() {
    var html = '<div class="sm-step-hint">Add the customer\'s logo to make the post more professional. This step is optional.</div>';
    html += '<div class="form-group"><label class="form-label">Customer website URL (for logo fetch)</label>' +
      '<input type="text" class="form-input" id="sm-field-customer-website" placeholder="https://..." value="' + window.escHtml(this._journeyInputs.customer_website || '') + '"></div>';
    html += '<div id="sm-logo-preview" style="margin-top:12px"></div>';
    html += '<div class="form-group" style="display:flex;align-items:center;gap:8px;margin-top:12px">' +
      '<input type="checkbox" id="sm-field-logo-permission" style="width:var(--checkbox-size);height:var(--checkbox-size)"' +
      (this._journeyInputs.logo_permission ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-logo-permission" style="margin-bottom:0">I have permission to use this logo in my marketing</label></div>';
    return html;
  },

  _bindStepEvents: function(step) {
    var self = this;

    if (step.id === 'media') {
      var dropArea = document.getElementById('sm-media-drop');
      var uploadBtn = document.getElementById('sm-media-upload-btn');
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
      document.querySelectorAll('.sm-tone-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('.sm-tone-pill').forEach(function(p) { p.classList.remove('active'); });
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
          document.querySelectorAll('[data-output]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.output_type = pill.dataset.output;
        });
      });
    }

    if (step.id === 'source') {
      document.querySelectorAll('[data-source]').forEach(function(pill) {
        pill.addEventListener('click', function() {
          document.querySelectorAll('[data-source]').forEach(function(p) { p.classList.remove('active'); });
          pill.classList.add('active');
          self._journeyInputs.source_type = pill.dataset.source;
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

    if (step.id === 'project') {
      var manualBtn = document.getElementById('sm-project-manual');
      if (manualBtn) {
        manualBtn.addEventListener('click', function() {
          var fields = document.getElementById('sm-project-manual-fields');
          if (fields) fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
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

  _handleFileSelect: function(files) {
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      this._mediaFiles.push(file);
      var url = URL.createObjectURL(file);
      this._mediaUrls.push(url);
    }
    this._renderStep();
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
          output_type: this._journeyInputs.output_type || 'social_post'
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

  _uploadMedia: async function(file, token) {
    var ext = file.name.split('.').pop() || 'jpg';
    var path = this._userId + '/social/' + Date.now() + '.' + ext;
    var result = await this._supabase.storage.from('cl-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (result.error) {
      throw new Error('Failed to upload media. Please try again.');
    }
    var urlResult = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    return urlResult.data.publicUrl;
  },

  _showPreview: function() {
    var previewView = document.getElementById('sm-preview-view');
    var previewContent = document.getElementById('sm-preview-content');
    var captionEl = document.getElementById('sm-edit-caption');
    var hashtagsEl = document.getElementById('sm-edit-hashtags');

    var businessName = (this._profile && this._profile.business_name) || 'Your Business';
    var initial = businessName.charAt(0).toUpperCase();

    var html = '<div class="sm-preview-card">' +
      '<div class="sm-preview-header">' +
      '<div class="sm-preview-avatar">' + initial + '</div>' +
      '<div><div class="sm-preview-name">' + window.escHtml(businessName) + '</div>' +
      '<div class="sm-preview-platform">Preview</div></div></div>';
    if (this._generatedContent.image_url) {
      html += '<img class="sm-preview-media" src="' + window.escHtml(this._generatedContent.image_url) + '" alt="Post media">';
    }
    html += '<div class="sm-preview-body">' +
      '<div class="sm-preview-caption" id="sm-preview-caption-text">' + window.escHtml(this._generatedContent.caption) + '</div>' +
      '<div class="sm-preview-hashtags" id="sm-preview-hashtags-text">' + window.escHtml(this._generatedContent.hashtags) + '</div>' +
      '</div></div>';

    previewContent.innerHTML = html;
    if (captionEl) captionEl.value = this._generatedContent.caption;
    if (hashtagsEl) hashtagsEl.value = this._generatedContent.hashtags;
    previewView.style.display = 'block';
  },

  _showPublishView: function() {
    var publishView = document.getElementById('sm-publish-view');
    var checksEl = document.getElementById('sm-connection-checks');
    var settings = this._settings || {};

    var html = '';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="sm-conn-facebook" value="facebook"' + (settings.facebook_connected ? '' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Facebook</span>' +
      '<span class="sm-connection-check-status">' + (settings.facebook_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="sm-conn-instagram" value="instagram"' + (settings.instagram_connected ? '' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Instagram</span>' +
      '<span class="sm-connection-check-status">' + (settings.instagram_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" disabled>' +
      '<span class="sm-connection-check-label">LinkedIn</span>' +
      '<span class="sm-connection-check-status badge badge-grey">Coming Soon</span></div>';

    checksEl.innerHTML = html;
    publishView.style.display = 'block';
  },

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
      self._selectedConnections = self._getSelectedConnections();
      self._schedulePost(dateVal + 'T' + timeVal);
    });

    document.getElementById('sm-schedule-modal').addEventListener('click', function(e) {
      if (e.target === document.getElementById('sm-schedule-modal')) {
        document.getElementById('sm-schedule-modal').classList.remove('open');
      }
    });
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

      this._exitWizard();
      this._loadStats();
      this._switchTab('published');
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
      var postRecord = await this._savePostRecord(isInProgress ? 'in_progress' : 'draft');
      if (!postRecord) return;
      this._exitWizard();
      this._loadStats();
      this._switchTab('drafts');
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
    await this._supabase.from('journey_records').insert(record);
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
    document.getElementById('sm-published-sort').addEventListener('change', function() {
      self._loadPublished();
    });

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
      var modal = document.getElementById('sm-schedule-modal');
      if (modal) modal.classList.add('open');
    });
    document.getElementById('sm-drafts-delete-selected').addEventListener('click', function() {
      if (self._draftsSelected.size === 0) return;
      self._showConfirm('Delete Drafts', 'Are you sure you want to delete ' + self._draftsSelected.size + ' draft(s)? This cannot be undone.', function() {
        self._bulkDeleteDrafts();
      });
    });

    document.getElementById('sm-start-campaign-btn').addEventListener('click', function() {
      self._startCampaignWizard();
    });
  },

  _loadDrafts: async function() {
    var search = (document.getElementById('sm-drafts-search').value || '').toLowerCase();
    var result = await this._supabase
      .from('social_posts')
      .select('*')
      .eq('user_id', this._userId)
      .in('status', ['draft', 'in_progress'])
      .order('created_at', { ascending: false });

    if (result.error) { this._showError('Could not load drafts.'); return; }
    var items = result.data || [];
    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var list = document.getElementById('sm-drafts-list');
    var empty = document.getElementById('sm-drafts-empty');

    if (items.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var start = this._draftsPage * this._pageSize;
    var page = items.slice(start, start + this._pageSize);
    this._renderPostCards(page, list, 'draft');
    this._renderPagination(items.length, this._draftsPage, 'sm-drafts-pagination', '_draftsPage', '_loadDrafts');
  },

  _loadScheduled: async function() {
    var search = (document.getElementById('sm-scheduled-search').value || '').toLowerCase();
    var result = await this._supabase
      .from('social_posts')
      .select('*, scheduled_posts(*)')
      .eq('user_id', this._userId)
      .eq('status', 'scheduled')
      .order('created_at', { ascending: false });

    if (result.error) { this._showError('Could not load scheduled posts.'); return; }
    var items = result.data || [];
    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var list = document.getElementById('sm-scheduled-list');
    var empty = document.getElementById('sm-scheduled-empty');

    if (items.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var start = this._scheduledPage * this._pageSize;
    var page = items.slice(start, start + this._pageSize);
    this._renderPostCards(page, list, 'scheduled');
    this._renderPagination(items.length, this._scheduledPage, 'sm-scheduled-pagination', '_scheduledPage', '_loadScheduled');
    this._scheduledItems = items;
  },

  _loadPublished: async function() {
    var search = (document.getElementById('sm-published-search').value || '').toLowerCase();
    var sortVal = document.getElementById('sm-published-sort').value;

    var orderCol = 'published_at';
    var ascending = false;
    if (sortVal === 'oldest') ascending = true;
    if (sortVal === 'reach') orderCol = 'reach';
    if (sortVal === 'engagement') orderCol = 'engagement';

    var result = await this._supabase
      .from('social_posts')
      .select('*')
      .eq('user_id', this._userId)
      .eq('status', 'published')
      .order(orderCol, { ascending: ascending });

    if (result.error) { this._showError('Could not load published posts.'); return; }
    var items = result.data || [];
    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var list = document.getElementById('sm-published-list');
    var empty = document.getElementById('sm-published-empty');

    if (items.length === 0) {
      list.innerHTML = '';
      empty.style.display = '';
      return;
    }
    empty.style.display = 'none';

    var start = this._publishedPage * this._pageSize;
    var page = items.slice(start, start + this._pageSize);
    this._renderPostCards(page, list, 'published');
    this._renderPagination(items.length, this._publishedPage, 'sm-published-pagination', '_publishedPage', '_loadPublished');
  },

  _renderPostCards: function(items, container, tab) {
    var self = this;
    var html = '';
    items.forEach(function(item) {
      var journeyLabel = self._getJourneyLabel(item.journey_type);
      var preview = (item.caption || '').substring(0, 100);
      var dateStr = '';
      if (tab === 'published' && item.published_at) {
        dateStr = new Date(item.published_at).toLocaleDateString('en-AU');
      } else {
        dateStr = new Date(item.created_at).toLocaleDateString('en-AU');
      }

      html += '<div class="sm-post-card" data-id="' + item.id + '">';
      html += '<div class="sm-post-thumb">';
      if (item.image_url) {
        html += '<img src="' + window.escHtml(item.image_url) + '" alt="">';
      } else {
        html += '\uD83D\uDCDD';
      }
      html += '</div>';
      html += '<div class="sm-post-body">';
      html += '<div class="sm-post-meta">';
      html += '<span class="sm-post-type">' + window.escHtml(journeyLabel) + '</span>';
      if (item.status === 'in_progress') {
        html += '<span class="badge badge-orange">In Progress</span>';
      }
      html += '<span class="sm-post-date">' + dateStr + '</span>';
      html += '</div>';
      html += '<div class="sm-post-caption-preview">' + window.escHtml(preview) + '</div>';
      html += '<div class="sm-post-actions">';

      if (tab === 'draft') {
        html += '<button class="btn-outline btn-sm" data-action="edit" data-id="' + item.id + '">Edit</button>';
        html += '<button class="btn-outline btn-sm" data-action="schedule" data-id="' + item.id + '">Schedule</button>';
        html += '<button class="btn-primary btn-sm" data-action="post-now" data-id="' + item.id + '">Post Now</button>';
        html += '<button class="btn-dismiss btn-sm" data-action="delete" data-id="' + item.id + '">Delete</button>';
      } else if (tab === 'scheduled') {
        html += '<button class="btn-outline btn-sm" data-action="edit" data-id="' + item.id + '">Edit</button>';
        html += '<button class="btn-outline btn-sm" data-action="reschedule" data-id="' + item.id + '">Reschedule</button>';
        html += '<button class="btn-outline btn-sm" data-action="cancel" data-id="' + item.id + '">Cancel</button>';
      } else if (tab === 'published') {
        html += '<button class="btn-outline btn-sm" data-action="view" data-id="' + item.id + '">View</button>';
        html += '<button class="btn-outline btn-sm" data-action="repurpose" data-id="' + item.id + '">Repurpose</button>';
      }

      html += '</div>';

      if (tab === 'published') {
        html += '<div class="sm-post-metrics">';
        html += '<div class="sm-post-metric">\uD83D\uDC41 <span class="sm-post-metric-value">' + (item.reach || 0) + '</span> reach</div>';
        html += '<div class="sm-post-metric">\u2764\uFE0F <span class="sm-post-metric-value">' + (item.engagement || 0) + '</span> engagement</div>';
        html += '<div class="sm-post-metric">\uD83D\uDD17 <span class="sm-post-metric-value">' + (item.clicks || 0) + '</span> clicks</div>';
        html += '</div>';
      }

      html += '</div></div>';
    });

    container.innerHTML = html;

    container.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._handlePostAction(btn.dataset.action, btn.dataset.id);
      });
    });
  },

  _handlePostAction: async function(action, postId) {
    var self = this;
    if (action === 'delete') {
      this._showConfirm('Delete Draft', 'Are you sure you want to delete this draft?', async function() {
        await self._supabase.from('social_posts').delete().eq('id', postId).eq('user_id', self._userId);
        self._loadDrafts();
        self._loadStats();
      });
    } else if (action === 'cancel') {
      this._showConfirm('Cancel Scheduled Post', 'This will move the post back to drafts.', async function() {
        await self._supabase.from('scheduled_posts').delete().eq('social_post_id', postId);
        await self._supabase.from('social_posts').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', postId);
        self._loadScheduled();
        self._loadStats();
      });
    } else if (action === 'schedule') {
      this._pendingSchedulePostId = postId;
      document.getElementById('sm-schedule-modal').classList.add('open');
    } else if (action === 'repurpose') {
      var result = await this._supabase.from('social_posts').select('*').eq('id', postId).single();
      if (result.data) {
        this._switchTab('create');
        this._startJourney(result.data.journey_type, result.data.inputs || {});
      }
    }
  },

  _bulkDeleteDrafts: async function() {
    var ids = Array.from(this._draftsSelected);
    if (ids.length === 0) return;
    await this._supabase.from('social_posts').delete().in('id', ids).eq('user_id', this._userId);
    this._draftsSelected = new Set();
    this._loadDrafts();
    this._loadStats();
  },

  _renderPagination: function(total, currentPage, containerId, pageField, loadMethod) {
    var self = this;
    var totalPages = Math.ceil(total / this._pageSize);
    var container = document.getElementById(containerId);
    if (!container) return;
    if (totalPages <= 1) { container.style.display = 'none'; return; }
    container.style.display = '';

    var html = '<button class="btn-outline btn-sm" id="' + containerId + '-prev"' + (currentPage === 0 ? ' disabled' : '') + '>Previous</button>';
    html += '<span class="sm-pagination-info">Page ' + (currentPage + 1) + ' of ' + totalPages + '</span>';
    html += '<button class="btn-outline btn-sm" id="' + containerId + '-next"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Next</button>';
    container.innerHTML = html;

    var prevBtn = document.getElementById(containerId + '-prev');
    var nextBtn = document.getElementById(containerId + '-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        if (self[pageField] > 0) { self[pageField]--; self[loadMethod](); }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        if (self[pageField] < totalPages - 1) { self[pageField]++; self[loadMethod](); }
      });
    }
  },

  _renderCalendar: function() {
    var container = document.getElementById('sm-scheduled-calendar');
    if (!container) return;
    var items = this._scheduledItems || [];
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    var html = '<div style="text-align:center;margin-bottom:16px"><strong>' + monthNames[month] + ' ' + year + '</strong></div>';
    html += '<table class="sm-calendar"><thead><tr>';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function(d) {
      html += '<th>' + d + '</th>';
    });
    html += '</tr></thead><tbody>';

    var day = 1;
    for (var w = 0; w < 6; w++) {
      if (day > daysInMonth) break;
      html += '<tr>';
      for (var d = 0; d < 7; d++) {
        if ((w === 0 && d < firstDay) || day > daysInMonth) {
          html += '<td></td>';
        } else {
          var isToday = day === now.getDate() ? ' sm-calendar-today' : '';
          var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
          var dayPosts = items.filter(function(item) {
            var sp = item.scheduled_posts;
            if (sp && sp.length > 0) {
              return (sp[0].scheduled_for || '').substring(0, 10) === dateStr;
            }
            return false;
          });
          html += '<td class="' + isToday + '"><div class="sm-calendar-day">' + day + '</div>';
          dayPosts.forEach(function(p) {
            html += '<div class="sm-calendar-post">' + window.escHtml((p.caption || '').substring(0, 20)) + '</div>';
          });
          html += '</td>';
          day++;
        }
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  },

  _getJourneyLabel: function(journeyType) {
    var label = journeyType || '';
    this.JOURNEY_GROUPS.forEach(function(g) {
      g.journeys.forEach(function(j) {
        if (j.id === journeyType) label = j.label;
      });
    });
    return label;
  },

  _loadCampaign: async function() {
    var result = await this._supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', this._userId)
      .in('status', ['planning', 'planned', 'implementing', 'ready', 'active', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) return;
    var campaign = result.data;

    var emptyEl = document.getElementById('sm-campaign-empty');
    var activeEl = document.getElementById('sm-campaign-active');
    var startBtn = document.getElementById('sm-start-campaign-btn');

    if (!campaign) {
      if (emptyEl) emptyEl.style.display = '';
      if (startBtn) startBtn.parentElement.style.display = '';
      if (activeEl) activeEl.style.display = 'none';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (startBtn) startBtn.parentElement.style.display = 'none';
    if (activeEl) activeEl.style.display = 'block';
    this._renderActiveCampaign(campaign);
  },

  _renderActiveCampaign: function(campaign) {
    var container = document.getElementById('sm-campaign-active');
    if (!container) return;

    var statusBadge = '';
    if (campaign.status === 'active') statusBadge = '<span class="badge badge-green">Active</span>';
    else if (campaign.status === 'paused') statusBadge = '<span class="badge badge-orange">Paused</span>';
    else if (campaign.status === 'planning') statusBadge = '<span class="badge badge-blue">Planning</span>';
    else statusBadge = '<span class="badge badge-grey">' + window.escHtml(campaign.status) + '</span>';

    var html = '<div class="sm-campaign-header">' +
      '<div class="detail-title">' + window.escHtml(campaign.name || 'Marketing Campaign') + '</div>' +
      statusBadge +
      '</div>';

    if (campaign.marketing_plan) {
      html += '<div class="sm-step-content">' +
        '<div class="sm-step-question">Marketing Plan</div>' +
        '<div style="white-space:pre-wrap;font-size:var(--body-font-size);line-height:var(--body-line-height)">' + window.escHtml(campaign.marketing_plan) + '</div>' +
        '</div>';
    }

    html += '<div class="sm-publish-actions" style="margin-top:16px">';
    if (campaign.status === 'active') {
      html += '<button class="btn-outline" id="sm-campaign-pause">Pause Campaign</button>';
    } else if (campaign.status === 'paused') {
      html += '<button class="btn-primary" id="sm-campaign-resume">Resume Campaign</button>';
    }
    html += '<button class="btn-dismiss" id="sm-campaign-end">End Campaign</button>';
    html += '</div>';

    container.innerHTML = html;

    var self = this;
    var pauseBtn = document.getElementById('sm-campaign-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function() {
        self._updateCampaignStatus(campaign.id, 'paused');
      });
    }
    var resumeBtn = document.getElementById('sm-campaign-resume');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', function() {
        self._updateCampaignStatus(campaign.id, 'active');
      });
    }
    var endBtn = document.getElementById('sm-campaign-end');
    if (endBtn) {
      endBtn.addEventListener('click', function() {
        self._showConfirm('End Campaign', 'This will stop all scheduled posts and archive the campaign.', function() {
          self._updateCampaignStatus(campaign.id, 'completed');
        });
      });
    }
  },

  _updateCampaignStatus: async function(campaignId, status) {
    await this._supabase.from('campaigns').update({ status: status, updated_at: new Date().toISOString() }).eq('id', campaignId);
    this._loadCampaign();
  },

  _startCampaignWizard: function() {
    this._showError('Campaign creation is coming soon. This feature requires additional setup.');
  },

  _scheduledItems: []
};
