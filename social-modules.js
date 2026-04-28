(function() {
  var mgmt = {

  _draftsFilter: 'all',
  _scheduledFilter: 'all',
  _publishedFilter: 'all',
  _publishedIncludeCampaign: false,
  _calendarMonth: new Date().getMonth(),
  _calendarYear: new Date().getFullYear(),

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

    this._renderDraftsFilters(items);

    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var filter = this._draftsFilter || 'all';
    if (filter === 'in_progress') {
      items = items.filter(function(item) { return item.status === 'in_progress'; });
    } else if (filter !== 'all') {
      items = items.filter(function(item) { return item.journey_type === filter; });
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

    this._renderScheduledFilters(items);

    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var filter = this._scheduledFilter || 'all';
    if (filter !== 'all') {
      if (filter === 'facebook' || filter === 'instagram') {
        items = items.filter(function(item) {
          var conns = item.connections || [];
          return conns.indexOf(filter) !== -1;
        });
      } else {
        items = items.filter(function(item) { return item.journey_type === filter; });
      }
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

    this._renderPublishedFilters(items);

    if (search) {
      items = items.filter(function(item) {
        return (item.caption || '').toLowerCase().indexOf(search) !== -1 ||
          (item.journey_type || '').toLowerCase().indexOf(search) !== -1;
      });
    }

    var filter = this._publishedFilter || 'all';
    if (filter !== 'all') {
      if (filter === 'facebook' || filter === 'instagram') {
        items = items.filter(function(item) {
          var conns = item.connections || [];
          return conns.indexOf(filter) !== -1;
        });
      } else if (filter === 'campaign') {
        items = items.filter(function(item) { return !!item.campaign_id; });
      } else {
        items = items.filter(function(item) { return item.journey_type === filter; });
      }
    }

    if (!this._publishedIncludeCampaign && filter !== 'campaign') {
      items = items.filter(function(item) { return !item.campaign_id; });
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

  _renderDraftsFilters: function(items) {
    var self = this;
    var container = document.getElementById('sm-drafts-filters');
    if (!container) return;

    var journeyTypes = [];
    items.forEach(function(item) {
      if (item.journey_type && journeyTypes.indexOf(item.journey_type) === -1) {
        journeyTypes.push(item.journey_type);
      }
    });

    var html = '<button class="filter-pill' + (self._draftsFilter === 'all' ? ' active' : '') + '" data-filter="all">All</button>';
    journeyTypes.forEach(function(jt) {
      var label = self._getJourneyLabel(jt);
      html += '<button class="filter-pill' + (self._draftsFilter === jt ? ' active' : '') + '" data-filter="' + window.escHtml(jt) + '">' + window.escHtml(label) + '</button>';
    });
    html += '<button class="filter-pill' + (self._draftsFilter === 'in_progress' ? ' active' : '') + '" data-filter="in_progress">In Progress Only</button>';
    container.innerHTML = html;

    container.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._draftsFilter = pill.dataset.filter;
        self._draftsPage = 0;
        self._loadDrafts();
      });
    });
  },

  _renderScheduledFilters: function(items) {
    var self = this;
    var container = document.getElementById('sm-scheduled-filters');
    if (!container) return;

    var journeyTypes = [];
    var platforms = [];
    items.forEach(function(item) {
      if (item.journey_type && journeyTypes.indexOf(item.journey_type) === -1) {
        journeyTypes.push(item.journey_type);
      }
      var conns = item.connections || [];
      conns.forEach(function(c) {
        if (platforms.indexOf(c) === -1) platforms.push(c);
      });
    });

    var html = '<button class="filter-pill' + (self._scheduledFilter === 'all' ? ' active' : '') + '" data-filter="all">All</button>';
    journeyTypes.forEach(function(jt) {
      var label = self._getJourneyLabel(jt);
      html += '<button class="filter-pill' + (self._scheduledFilter === jt ? ' active' : '') + '" data-filter="' + window.escHtml(jt) + '">' + window.escHtml(label) + '</button>';
    });
    platforms.forEach(function(p) {
      var label = p.charAt(0).toUpperCase() + p.slice(1);
      html += '<button class="filter-pill' + (self._scheduledFilter === p ? ' active' : '') + '" data-filter="' + window.escHtml(p) + '">' + window.escHtml(label) + '</button>';
    });
    container.innerHTML = html;

    container.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._scheduledFilter = pill.dataset.filter;
        self._scheduledPage = 0;
        self._loadScheduled();
      });
    });
  },

  _renderPublishedFilters: function(items) {
    var self = this;
    var container = document.getElementById('sm-published-filters');
    if (!container) return;

    var journeyTypes = [];
    var platforms = [];
    items.forEach(function(item) {
      if (item.journey_type && journeyTypes.indexOf(item.journey_type) === -1) {
        journeyTypes.push(item.journey_type);
      }
      var conns = item.connections || [];
      conns.forEach(function(c) {
        if (platforms.indexOf(c) === -1) platforms.push(c);
      });
    });

    var html = '<button class="filter-pill' + (self._publishedFilter === 'all' ? ' active' : '') + '" data-filter="all">All</button>';
    journeyTypes.forEach(function(jt) {
      var label = self._getJourneyLabel(jt);
      html += '<button class="filter-pill' + (self._publishedFilter === jt ? ' active' : '') + '" data-filter="' + window.escHtml(jt) + '">' + window.escHtml(label) + '</button>';
    });
    platforms.forEach(function(p) {
      var label = p.charAt(0).toUpperCase() + p.slice(1);
      html += '<button class="filter-pill' + (self._publishedFilter === p ? ' active' : '') + '" data-filter="' + window.escHtml(p) + '">' + window.escHtml(label) + '</button>';
    });
    html += '<button class="filter-pill' + (self._publishedFilter === 'campaign' ? ' active' : '') + '" data-filter="campaign">Campaign Posts</button>';
    html += '<label style="display:inline-flex;align-items:center;gap:6px;margin-left:8px;font-size:var(--label-font-size);color:var(--text-secondary);cursor:pointer">' +
      '<input type="checkbox" class="item-checkbox" id="sm-published-include-campaign"' + (self._publishedIncludeCampaign ? ' checked' : '') + '>' +
      'Include campaign posts</label>';
    container.innerHTML = html;

    container.querySelectorAll('.filter-pill').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._publishedFilter = pill.dataset.filter;
        self._publishedPage = 0;
        self._loadPublished();
      });
    });

    var campaignCheck = document.getElementById('sm-published-include-campaign');
    if (campaignCheck) {
      campaignCheck.addEventListener('change', function() {
        self._publishedIncludeCampaign = campaignCheck.checked;
        self._publishedPage = 0;
        self._loadPublished();
      });
    }
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

      html += '<div class="item-card sm-post-card" data-id="' + item.id + '">';
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
      html += '<div class="text-preview" style="margin-bottom:8px">' + window.escHtml(preview) + '</div>';
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
        if (item.metadata && (item.metadata.facebook_id || item.metadata.instagram_id)) {
          html += '<button class="btn-outline btn-sm" data-action="view-on-platform" data-id="' + item.id + '">View on Platform</button>';
        }
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
        var delResult = await self._supabase.from('social_posts').delete().eq('id', postId).eq('user_id', self._userId);
        if (delResult.error) { self._showError('Could not delete draft.'); return; }
        self._loadDrafts();
        self._loadStats();
      });

    } else if (action === 'cancel') {
      this._showConfirm('Cancel Scheduled Post', 'This will move the post back to drafts.', async function() {
        var delSched = await self._supabase.from('scheduled_posts').delete().eq('social_post_id', postId);
        if (delSched.error) { self._showError('Could not cancel scheduled post.'); return; }
        var updPost = await self._supabase.from('social_posts').update({ status: 'draft', updated_at: new Date().toISOString() }).eq('id', postId);
        if (updPost.error) { self._showError('Could not update post status.'); return; }
        self._loadScheduled();
        self._loadStats();
      });

    } else if (action === 'schedule') {
      this._pendingSchedulePostId = postId;
      this._pendingBulkScheduleIds = null;
      document.getElementById('sm-schedule-date').value = '';
      document.getElementById('sm-schedule-time').value = '';
      document.getElementById('sm-schedule-modal').classList.add('open');

    } else if (action === 'repurpose') {
      var result = await this._supabase.from('social_posts').select('*').eq('id', postId).single();
      if (result.error) { this._showError('Could not load post.'); return; }
      if (result.data) {
        this._switchTab('create');
        this._startJourney(result.data.journey_type, result.data.inputs || {});
      }

    } else if (action === 'edit') {
      var editResult = await this._supabase.from('social_posts').select('*').eq('id', postId).single();
      if (editResult.error) { this._showError('Could not load post for editing.'); return; }
      var post = editResult.data;
      if (!post) return;

      this._switchTab('create');
      this._startJourney(post.journey_type, post.inputs || {});

      if (post.caption || post.hashtags || post.image_url) {
        this._generatedContent = {
          caption: post.caption || '',
          hashtags: post.hashtags || '',
          image_url: post.image_url || null
        };
      }

      this._editingPostId = postId;

    } else if (action === 'post-now') {
      var postResult = await this._supabase.from('social_posts').select('*').eq('id', postId).single();
      if (postResult.error) { this._showError('Could not load post.'); return; }
      var postData = postResult.data;
      if (!postData) return;

      if (!postData.connections || postData.connections.length === 0) {
        this._switchTab('create');
        this._startJourney(postData.journey_type, postData.inputs || {});
        if (postData.caption || postData.hashtags || postData.image_url) {
          this._generatedContent = {
            caption: postData.caption || '',
            hashtags: postData.hashtags || '',
            image_url: postData.image_url || null
          };
        }
        this._editingPostId = postId;
        this._showPublishView();
        return;
      }

      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var metaRes = await fetch('/api/meta-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          action: 'post',
          caption: (postData.caption || '') + '\n\n' + (postData.hashtags || ''),
          image_url: postData.image_url,
          platforms: postData.connections,
          post_id: postId
        })
      });

      if (!metaRes.ok) {
        var errData = await metaRes.json().catch(function() { return {}; });
        self._showError(errData.error || 'Failed to publish. Please try again.');
        return;
      }

      var updPub = await self._supabase.from('social_posts').update({
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', postId);
      if (updPub.error) { self._showError('Published but could not update status.'); return; }

      self._loadDrafts();
      self._loadStats();
      self._showSuccess('Post published successfully.');

    } else if (action === 'reschedule') {
      this._pendingSchedulePostId = postId;
      this._pendingBulkScheduleIds = null;

      var reschedResult = await this._supabase
        .from('scheduled_posts')
        .select('scheduled_for')
        .eq('social_post_id', postId)
        .maybeSingle();

      var dateInput = document.getElementById('sm-schedule-date');
      var timeInput = document.getElementById('sm-schedule-time');
      if (reschedResult.data && reschedResult.data.scheduled_for) {
        var dt = new Date(reschedResult.data.scheduled_for);
        dateInput.value = dt.toISOString().substring(0, 10);
        var hours = String(dt.getHours()).padStart(2, '0');
        var mins = String(dt.getMinutes()).padStart(2, '0');
        timeInput.value = hours + ':' + mins;
      } else {
        dateInput.value = '';
        timeInput.value = '';
      }

      document.getElementById('sm-schedule-modal').classList.add('open');

    } else if (action === 'view') {
      var viewResult = await this._supabase.from('social_posts').select('*').eq('id', postId).single();
      if (viewResult.error) { this._showError('Could not load post details.'); return; }
      var viewPost = viewResult.data;
      if (!viewPost) return;

      var businessName = (this._profile && this._profile.business_name) || 'Your Business';
      var initial = businessName.charAt(0).toUpperCase();

      var detailHtml = '<div class="sm-preview-card" style="max-width:600px;margin:0 auto">' +
        '<div class="sm-preview-header">' +
        '<div class="sm-preview-avatar">' + initial + '</div>' +
        '<div><div class="sm-preview-name">' + window.escHtml(businessName) + '</div>' +
        '<div class="sm-preview-platform">' + (viewPost.published_at ? new Date(viewPost.published_at).toLocaleDateString('en-AU') : '') + '</div></div></div>';
      if (viewPost.image_url) {
        detailHtml += '<img class="sm-preview-media" src="' + window.escHtml(viewPost.image_url) + '" alt="Post media">';
      }
      detailHtml += '<div class="sm-preview-body">' +
        '<div class="sm-preview-caption">' + window.escHtml(viewPost.caption || '') + '</div>' +
        '<div class="sm-preview-hashtags">' + window.escHtml(viewPost.hashtags || '') + '</div>' +
        '</div>';
      detailHtml += '<div style="padding:12px 16px;border-top:1px solid var(--border-light)">' +
        '<div class="sm-post-metrics">' +
        '<div class="sm-post-metric">\uD83D\uDC41 <span class="sm-post-metric-value">' + (viewPost.reach || 0) + '</span> reach</div>' +
        '<div class="sm-post-metric">\u2764\uFE0F <span class="sm-post-metric-value">' + (viewPost.engagement || 0) + '</span> engagement</div>' +
        '<div class="sm-post-metric">\uD83D\uDD17 <span class="sm-post-metric-value">' + (viewPost.clicks || 0) + '</span> clicks</div>' +
        '</div></div>';

      if (viewPost.metadata && (viewPost.metadata.facebook_id || viewPost.metadata.instagram_id)) {
        detailHtml += '<div style="padding:0 16px 12px;display:flex;gap:8px">';
        if (viewPost.metadata.facebook_id) {
          detailHtml += '<a href="https://www.facebook.com/' + window.escHtml(viewPost.metadata.facebook_id) + '" target="_blank" rel="noopener" class="btn-outline btn-sm">View on Facebook</a>';
        }
        if (viewPost.metadata.instagram_id) {
          detailHtml += '<a href="https://www.instagram.com/p/' + window.escHtml(viewPost.metadata.instagram_id) + '" target="_blank" rel="noopener" class="btn-outline btn-sm">View on Instagram</a>';
        }
        detailHtml += '</div>';
      }

      detailHtml += '</div>';

      var conns = viewPost.connections || [];
      if (conns.length > 0) {
        detailHtml += '<div style="text-align:center;margin-top:12px;font-size:var(--badge-font-size);color:var(--text-muted)">Published to: ' + window.escHtml(conns.join(', ')) + '</div>';
      }

      document.getElementById('sm-confirm-title').textContent = 'Post Details';
      document.getElementById('sm-confirm-body').innerHTML = detailHtml;
      document.getElementById('sm-confirm-ok').textContent = 'Close';
      document.getElementById('sm-confirm-cancel').style.display = 'none';
      var modal = document.getElementById('sm-confirm-modal');
      modal.classList.add('open');

      var closeHandler = function() {
        modal.classList.remove('open');
        document.getElementById('sm-confirm-ok').textContent = 'Confirm';
        document.getElementById('sm-confirm-cancel').style.display = '';
      };
      document.getElementById('sm-confirm-ok').addEventListener('click', closeHandler, { once: true });
      modal.addEventListener('click', function(e) { if (e.target === modal) closeHandler(); }, { once: true });

    } else if (action === 'view-on-platform') {
      var vpResult = await this._supabase.from('social_posts').select('metadata').eq('id', postId).single();
      if (vpResult.error) { this._showError('Could not load post details.'); return; }
      var meta = (vpResult.data && vpResult.data.metadata) || {};
      if (meta.facebook_id) {
        window.open('https://www.facebook.com/' + meta.facebook_id, '_blank', 'noopener');
      } else if (meta.instagram_id) {
        window.open('https://www.instagram.com/p/' + meta.instagram_id, '_blank', 'noopener');
      } else {
        this._showError('No platform link available for this post.');
      }
    }
  },

  _bulkDeleteDrafts: async function() {
    var ids = Array.from(this._draftsSelected);
    if (ids.length === 0) return;
    var bulkDel = await this._supabase.from('social_posts').delete().in('id', ids).eq('user_id', this._userId);
    if (bulkDel.error) { this._showError('Could not delete selected drafts.'); return; }
    this._draftsSelected = new Set();
    this._loadDrafts();
    this._loadStats();
  },

  _handleScheduleConfirm: async function(scheduledFor) {
    var self = this;

    if (this._pendingBulkScheduleIds && this._pendingBulkScheduleIds.length > 0) {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var failed = 0;
      for (var i = 0; i < this._pendingBulkScheduleIds.length; i++) {
        var pid = this._pendingBulkScheduleIds[i];

        var updRes = await this._supabase.from('social_posts').update({
          status: 'scheduled',
          updated_at: new Date().toISOString()
        }).eq('id', pid);
        if (updRes.error) { failed++; continue; }

        var schedRes = await fetch('/api/schedule-social-posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
          },
          body: JSON.stringify({
            social_post_id: pid,
            scheduled_for: scheduledFor,
            platforms: []
          })
        });
        if (!schedRes.ok) failed++;
      }

      this._pendingBulkScheduleIds = null;
      this._draftsSelected = new Set();

      if (failed > 0) {
        this._showError(failed + ' post(s) could not be scheduled.');
      } else {
        this._showSuccess('All selected posts have been scheduled.');
      }

      this._loadDrafts();
      this._loadScheduled();
      this._loadStats();
      return;
    }

    if (this._pendingSchedulePostId) {
      var postId = this._pendingSchedulePostId;
      this._pendingSchedulePostId = null;

      var existingSched = await this._supabase
        .from('scheduled_posts')
        .select('id')
        .eq('social_post_id', postId)
        .maybeSingle();

      var sessionRes2 = await this._supabase.auth.getSession();
      var session2 = sessionRes2.data && sessionRes2.data.session;
      if (!session2) { this._showError('Session expired. Please refresh.'); return; }

      if (existingSched.data) {
        var updSched = await this._supabase
          .from('scheduled_posts')
          .update({ scheduled_for: scheduledFor, updated_at: new Date().toISOString() })
          .eq('id', existingSched.data.id);
        if (updSched.error) { this._showError('Could not reschedule post.'); return; }
      } else {
        var updStatus = await this._supabase.from('social_posts').update({
          status: 'scheduled',
          updated_at: new Date().toISOString()
        }).eq('id', postId);
        if (updStatus.error) { this._showError('Could not update post status.'); return; }

        var newSched = await fetch('/api/schedule-social-posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session2.access_token
          },
          body: JSON.stringify({
            social_post_id: postId,
            scheduled_for: scheduledFor,
            platforms: []
          })
        });
        if (!newSched.ok) {
          var errData = await newSched.json().catch(function() { return {}; });
          self._showError(errData.error || 'Failed to schedule post.');
          return;
        }
      }

      this._showSuccess('Post scheduled successfully.');
      this._loadDrafts();
      this._loadScheduled();
      this._loadStats();
      return;
    }

    this._selectedConnections = this._getSelectedConnections();
    this._schedulePost(scheduledFor);
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
    var self = this;
    var container = document.getElementById('sm-scheduled-calendar');
    if (!container) return;
    var items = this._scheduledItems || [];
    var year = this._calendarYear;
    var month = this._calendarMonth;
    var now = new Date();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    var html = '<div style="display:flex;align-items:center;justify-content:center;gap:16px;margin-bottom:16px">';
    html += '<button class="btn-outline btn-sm" id="sm-cal-prev">Previous</button>';
    html += '<strong>' + monthNames[month] + ' ' + year + '</strong>';
    html += '<button class="btn-outline btn-sm" id="sm-cal-next">Next</button>';
    html += '</div>';
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
          var isToday = (day === now.getDate() && month === now.getMonth() && year === now.getFullYear()) ? ' sm-calendar-today' : '';
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

    var prevBtn = document.getElementById('sm-cal-prev');
    var nextBtn = document.getElementById('sm-cal-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', function() {
        self._calendarMonth--;
        if (self._calendarMonth < 0) {
          self._calendarMonth = 11;
          self._calendarYear--;
        }
        self._renderCalendar();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function() {
        self._calendarMonth++;
        if (self._calendarMonth > 11) {
          self._calendarMonth = 0;
          self._calendarYear++;
        }
        self._renderCalendar();
      });
    }
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
    if (window.SM_CAMPAIGN) {
      window.SM_CAMPAIGN.init(this._supabase, this._userId, this._profile, this._settings);
    }
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
      if (window.SM_CAMPAIGN) {
        window.SM_CAMPAIGN._loadCampaignHistoryEmpty();
      }
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (startBtn) startBtn.parentElement.style.display = 'none';

    if (campaign.status === 'planning') {
      window.SM_CAMPAIGN.startWizard();
    } else if (campaign.status === 'planned' || campaign.status === 'implementing') {
      window.SM_CAMPAIGN._showPhase2(campaign);
    } else {
      window.SM_CAMPAIGN.renderActive(campaign.id);
    }
  },

  _startCampaignWizard: function() {
    if (window.SM_CAMPAIGN) {
      window.SM_CAMPAIGN.init(this._supabase, this._userId, this._profile, this._settings);
      window.SM_CAMPAIGN.startWizard();
    }
  },

  _loadRecentHashtags: async function() {
    var result = await this._supabase
      .from('social_posts')
      .select('hashtags')
      .eq('user_id', this._userId)
      .not('hashtags', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20);

    if (result.error) return [];
    var items = result.data || [];
    var seen = {};
    var tags = [];
    items.forEach(function(item) {
      var raw = item.hashtags || '';
      var matches = raw.match(/#[\w\u00C0-\u024F]+/g);
      if (matches) {
        matches.forEach(function(tag) {
          var lower = tag.toLowerCase();
          if (!seen[lower]) {
            seen[lower] = true;
            tags.push(tag);
          }
        });
      }
    });
    return tags;
  },

  _renderHashtagSuggestions: async function() {
    var self = this;
    var hashtagsEl = document.getElementById('sm-edit-hashtags');
    if (!hashtagsEl) return;

    var tags = await this._loadRecentHashtags();
    if (tags.length === 0) return;

    var existing = document.getElementById('sm-hashtag-suggestions');
    if (existing) existing.remove();

    var wrapper = document.createElement('div');
    wrapper.id = 'sm-hashtag-suggestions';
    wrapper.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px';

    var label = document.createElement('span');
    label.style.cssText = 'font-size:var(--badge-font-size);color:var(--text-muted);width:100%;margin-bottom:2px';
    label.textContent = 'Recent hashtags:';
    wrapper.appendChild(label);

    tags.forEach(function(tag) {
      var pill = document.createElement('button');
      pill.className = 'filter-pill';
      pill.textContent = tag;
      pill.style.cssText = 'font-size:var(--badge-font-size);padding:3px 10px';
      pill.addEventListener('click', function(e) {
        e.preventDefault();
        var current = hashtagsEl.value.trim();
        if (current && !current.endsWith(' ')) current += ' ';
        hashtagsEl.value = current + tag;
      });
      wrapper.appendChild(pill);
    });

    hashtagsEl.parentElement.after(wrapper);
  },

  _saveBlogToCL: async function(content, inputs) {
    try {
      var sourceRef = 'sm-blog-' + Date.now();
      var result = await this._supabase
        .from('content_library')
        .upsert({
          source: 'tool',
          tool_source: 'social',
          source_ref: sourceRef,
          status: 'approved',
          category: 'blog',
          tool_tags: ['blog', 'website'],
          content_text: content.caption || '',
          title: inputs.blog_title || 'Blog Post',
          user_id: this._userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'source_ref', ignoreDuplicates: true });

      if (result.error) {
        console.error('[SM] Blog CL write-back error:', result.error.message);
        return;
      }

      this._showSuccess('Blog content saved to your Content Library.');
    } catch (err) {
      console.error('[SM] Blog CL write-back error:', err.message);
    }
  },

  _showSuccess: function(msg) {
    var modal = document.getElementById('sm-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = msg;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }

  };

  Object.keys(mgmt).forEach(function(key) {
    window.SOCIAL_LOGIC[key] = mgmt[key];
  });
})();

/* ── CL Projects CRUD (used by Customer Story journey project selection) ── */
(function() {
  var proj = {

  _clProjects: [],

  _loadCLProjects: async function() {
    var result = await this._supabase
      .from('cl_projects')
      .select('*')
      .eq('user_id', this._userId)
      .order('created_at', { ascending: false });

    if (result.error) {
      console.error('[SM] cl_projects load error:', result.error.message);
      this._clProjects = [];
      return [];
    }
    this._clProjects = result.data || [];
    return this._clProjects;
  },

  _addCLProject: async function(projectData) {
    var record = {
      user_id: this._userId,
      customer_name: projectData.customer_name || '',
      service_provided: projectData.service_provided || '',
      description: projectData.description || '',
      photos: projectData.photos || [],
      logo_url: projectData.logo_url || null,
      status: projectData.status || 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    var result = await this._supabase.from('cl_projects').insert(record).select().single();
    if (result.error) {
      this._showError('Could not save project. ' + (result.error.message || ''));
      return null;
    }
    return result.data;
  },

  _updateCLProject: async function(projectId, updates) {
    updates.updated_at = new Date().toISOString();
    var result = await this._supabase
      .from('cl_projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', this._userId)
      .select()
      .single();
    if (result.error) {
      this._showError('Could not update project. ' + (result.error.message || ''));
      return null;
    }
    return result.data;
  },

  _deleteCLProject: async function(projectId) {
    var result = await this._supabase
      .from('cl_projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', this._userId);
    if (result.error) {
      this._showError('Could not delete project. ' + (result.error.message || ''));
      return false;
    }
    return true;
  },

  _renderProjectStep: function() {
    var self = this;
    var html = '<div class="sm-step-hint">Choose from your completed projects, or enter details manually.</div>';
    html += '<div class="sm-option-pills" style="margin-bottom:12px">' +
      '<button class="sm-option-pill" id="sm-project-manual">Enter manually</button>' +
      '<button class="sm-option-pill" id="sm-project-add-new">Add a new project</button>' +
      '</div>';
    html += '<div id="sm-project-list" style="margin-top:16px"></div>';
    html += '<div id="sm-project-manual-fields" style="display:none;margin-top:16px">' +
      '<div class="form-group"><label class="form-label">Customer first name</label>' +
      '<input type="text" class="form-input" id="sm-field-customer-name" value="' + window.escHtml(this._journeyInputs.customer_name || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Service provided</label>' +
      '<input type="text" class="form-input" id="sm-field-service" value="' + window.escHtml(this._journeyInputs.service || '') + '"></div>' +
      '</div>';
    html += '<div id="sm-project-add-form" style="display:none;margin-top:16px">' +
      '<div class="sm-step-content">' +
      '<div class="sm-step-question" style="margin-bottom:12px">Add New Project</div>' +
      '<div class="form-group"><label class="form-label">Customer name</label>' +
      '<input type="text" class="form-input" id="sm-proj-new-name"></div>' +
      '<div class="form-group"><label class="form-label">Service provided</label>' +
      '<input type="text" class="form-input" id="sm-proj-new-service"></div>' +
      '<div class="form-group"><label class="form-label">Description (optional)</label>' +
      '<textarea class="form-input" id="sm-proj-new-desc" rows="2"></textarea></div>' +
      '<div class="form-group"><label class="form-label">Status</label>' +
      '<select class="form-input" id="sm-proj-new-status" style="width:200px">' +
      '<option value="completed">Completed</option>' +
      '<option value="active">Active</option>' +
      '</select></div>' +
      '<div class="action-row" style="margin-top:12px">' +
      '<button class="btn-primary btn-sm" id="sm-proj-save-new">Save Project</button>' +
      '<button class="btn-outline btn-sm" id="sm-proj-cancel-new">Cancel</button>' +
      '</div></div></div>';
    return html;
  },

  _bindProjectStepEvents: async function() {
    var self = this;
    var manualBtn = document.getElementById('sm-project-manual');
    var addNewBtn = document.getElementById('sm-project-add-new');

    if (manualBtn) {
      manualBtn.addEventListener('click', function() {
        var fields = document.getElementById('sm-project-manual-fields');
        var addForm = document.getElementById('sm-project-add-form');
        if (fields) fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
        if (addForm) addForm.style.display = 'none';
      });
    }

    if (addNewBtn) {
      addNewBtn.addEventListener('click', function() {
        var addForm = document.getElementById('sm-project-add-form');
        var fields = document.getElementById('sm-project-manual-fields');
        if (addForm) addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
        if (fields) fields.style.display = 'none';
      });
    }

    var saveNewBtn = document.getElementById('sm-proj-save-new');
    if (saveNewBtn) {
      saveNewBtn.addEventListener('click', async function() {
        var name = (document.getElementById('sm-proj-new-name').value || '').trim();
        var svc = (document.getElementById('sm-proj-new-service').value || '').trim();
        if (!name) { self._showError('Customer name is required.'); return; }
        var desc = (document.getElementById('sm-proj-new-desc').value || '').trim();
        var status = document.getElementById('sm-proj-new-status').value || 'completed';
        var proj = await self._addCLProject({
          customer_name: name,
          service_provided: svc,
          description: desc,
          status: status
        });
        if (proj) {
          self._journeyInputs.customer_name = proj.customer_name;
          self._journeyInputs.service = proj.service_provided;
          self._journeyInputs.cl_project_id = proj.id;
          document.getElementById('sm-project-add-form').style.display = 'none';
          await self._populateProjectList();
        }
      });
    }

    var cancelNewBtn = document.getElementById('sm-proj-cancel-new');
    if (cancelNewBtn) {
      cancelNewBtn.addEventListener('click', function() {
        document.getElementById('sm-project-add-form').style.display = 'none';
      });
    }

    await this._populateProjectList();
  },

  _populateProjectList: async function() {
    var self = this;
    var container = document.getElementById('sm-project-list');
    if (!container) return;

    var projects = await this._loadCLProjects();
    if (projects.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:var(--note-font-size)">No saved projects yet. Enter details manually or add a new project.</div>';
      return;
    }

    var selectedId = this._journeyInputs.cl_project_id || null;
    var html = '';
    projects.forEach(function(p) {
      var isSelected = selectedId === p.id;
      var statusBadge = p.status === 'active'
        ? '<span class="badge badge-green">Active</span>'
        : '<span class="badge badge-grey">Completed</span>';
      html += '<div class="item-card" style="margin-bottom:8px;padding:12px;cursor:pointer' + (isSelected ? ';border-color:var(--blue)' : '') + '" data-projid="' + p.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div><strong>' + window.escHtml(p.customer_name || '') + '</strong>' +
        (p.service_provided ? ' &mdash; ' + window.escHtml(p.service_provided) : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px">' + statusBadge +
        '<button class="btn-outline btn-sm" data-projdelete="' + p.id + '" style="padding:2px 8px;font-size:var(--badge-font-size)">Delete</button>' +
        '</div></div>';
      if (p.description) {
        html += '<div style="font-size:var(--note-font-size);color:var(--text-muted);margin-top:4px">' + window.escHtml(p.description.substring(0, 120)) + '</div>';
      }
      html += '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll('[data-projid]').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-projdelete]')) return;
        var projId = card.dataset.projid;
        var selected = projects.find(function(p) { return p.id === projId; });
        if (selected) {
          self._journeyInputs.customer_name = selected.customer_name || '';
          self._journeyInputs.service = selected.service_provided || '';
          self._journeyInputs.cl_project_id = selected.id;
          container.querySelectorAll('.item-card').forEach(function(c) { c.style.borderColor = ''; });
          card.style.borderColor = 'var(--blue)';
          var fields = document.getElementById('sm-project-manual-fields');
          if (fields) fields.style.display = 'none';
        }
      });
    });

    container.querySelectorAll('[data-projdelete]').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.stopPropagation();
        var projId = btn.dataset.projdelete;
        self._showConfirm('Delete Project', 'Are you sure you want to delete this project?', async function() {
          var ok = await self._deleteCLProject(projId);
          if (ok) {
            if (self._journeyInputs.cl_project_id === projId) {
              self._journeyInputs.cl_project_id = null;
            }
            await self._populateProjectList();
          }
        });
      });
    });
  }

  };

  Object.keys(proj).forEach(function(key) {
    window.SOCIAL_LOGIC[key] = proj[key];
  });
})();

/* ── Feature integrations: AI Generate, CL Media Picker, News Digest, Blog sections, CL write-back ── */
(function() {
  var features = {

  // ── Moved from social-logic.js (file size) ──

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

    var isBlog = this._currentJourney === 'blog_content';

    var html = '<div class="sm-preview-card">' +
      '<div class="sm-preview-header">' +
      '<div class="sm-preview-avatar">' + initial + '</div>' +
      '<div><div class="sm-preview-name">' + window.escHtml(businessName) + '</div>' +
      '<div class="sm-preview-platform">Preview</div></div></div>';
    if (this._generatedContent.image_url) {
      html += '<img class="sm-preview-media" src="' + window.escHtml(this._generatedContent.image_url) + '" alt="Post media">';
    }
    html += '<div class="sm-preview-body">';
    if (isBlog) {
      html += '<div id="sm-blog-sections">' + this._renderBlogSections(this._generatedContent.caption) + '</div>';
    } else {
      html += '<div class="sm-preview-caption" id="sm-preview-caption-text">' + window.escHtml(this._generatedContent.caption) + '</div>';
    }
    html += '<div class="sm-preview-hashtags" id="sm-preview-hashtags-text">' + window.escHtml(this._generatedContent.hashtags) + '</div>';
    html += '</div></div>';

    previewContent.innerHTML = html;
    if (captionEl) captionEl.value = this._generatedContent.caption;
    if (hashtagsEl) hashtagsEl.value = this._generatedContent.hashtags;
    previewView.style.display = 'block';
    this._renderHashtagSuggestions();

    if (isBlog) {
      this._bindBlogSectionEvents();
    }
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

  // ── 1. Predis AI graphic generation ──

  _handleAIGenerate: async function() {
    var self = this;
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) {
        this._showError('Could not verify your session. Please refresh the page and try again.');
        return;
      }

      var aiBtn = document.getElementById('sm-media-ai-btn');
      if (aiBtn) {
        aiBtn.disabled = true;
        aiBtn.textContent = 'Generating...';
      }

      var prompt = this._buildAIPrompt();
      var res = await fetch('/api/predis-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          prompt: prompt,
          media_type: 'single_image'
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate graphic. Please try again.');
      }

      var data = await res.json();
      if (data.preview_url) {
        self._mediaUrls.push(data.preview_url);
        self._renderStep();
      } else {
        self._showError('Graphic generation is processing. It may take a moment to appear.');
      }
    } catch (err) {
      this._showError(err.message || 'Failed to generate graphic.');
    } finally {
      var aiBtn2 = document.getElementById('sm-media-ai-btn');
      if (aiBtn2) {
        aiBtn2.disabled = false;
        aiBtn2.textContent = 'AI Generate';
      }
    }
  },

  _buildAIPrompt: function() {
    var inputs = this._journeyInputs;
    var parts = [];
    var journeyLabel = '';
    this.JOURNEY_GROUPS.forEach(function(g) {
      g.journeys.forEach(function(j) {
        if (j.id === this._currentJourney) journeyLabel = j.label;
      }.bind(this));
    }.bind(this));
    if (journeyLabel) parts.push('Content type: ' + journeyLabel);
    if (inputs.description) parts.push('Description: ' + inputs.description);
    if (inputs.what) parts.push('Subject: ' + inputs.what);
    if (inputs.headline) parts.push('Headline: ' + inputs.headline);
    if (inputs.blog_topic) parts.push('Topic: ' + inputs.blog_topic);
    if (inputs.blog_title) parts.push('Title: ' + inputs.blog_title);
    if (inputs.testimonial) parts.push('Testimonial: ' + inputs.testimonial);
    if (inputs.tone) parts.push('Tone: ' + inputs.tone);
    var businessName = (this._profile && this._profile.business_name) || '';
    if (businessName) parts.push('Business: ' + businessName);
    return parts.join('. ') || 'Create a professional social media graphic';
  },

  // ── 2. Content Library media picker ──

  _openCLMediaPicker: async function() {
    var self = this;
    var modal = document.getElementById('sm-cl-media-modal');
    if (!modal) return;

    var body = document.getElementById('sm-cl-media-body');
    if (body) body.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Loading content library...</div></div>';
    modal.classList.add('open');

    var result = await this._supabase
      .from('content_library')
      .select('id, title, file_url, content_type, source_detail')
      .eq('user_id', this._userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error) {
      body.innerHTML = '<div class="sm-step-hint">Could not load content library items.</div>';
      return;
    }

    var imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    var items = (result.data || []).filter(function(item) {
      if (item.content_type === 'image') return true;
      if (item.file_url) {
        var lower = item.file_url.toLowerCase();
        for (var i = 0; i < imageExts.length; i++) {
          if (lower.indexOf(imageExts[i]) !== -1) return true;
        }
      }
      if (item.source_detail && item.source_detail.file_type) {
        var ft = item.source_detail.file_type.toLowerCase();
        if (ft.indexOf('image') !== -1) return true;
      }
      return false;
    });

    if (items.length === 0) {
      body.innerHTML = '<div class="sm-step-hint">No approved images found in your Content Library.</div>';
      return;
    }

    var html = '<div style="display:flex;flex-wrap:wrap;gap:12px">';
    items.forEach(function(item) {
      var url = item.file_url || '';
      var title = item.title || 'Untitled';
      html += '<div class="sm-cl-media-item" data-url="' + window.escHtml(url) + '" data-id="' + item.id + '" style="width:120px;cursor:pointer;border:2px solid transparent;border-radius:var(--card-radius);overflow:hidden">' +
        '<img src="' + window.escHtml(url) + '" alt="" style="width:100%;height:90px;object-fit:cover;display:block">' +
        '<div style="padding:4px 6px;font-size:var(--badge-font-size);color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + window.escHtml(title) + '</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    var selectedUrls = [];
    body.querySelectorAll('.sm-cl-media-item').forEach(function(card) {
      card.addEventListener('click', function() {
        var isSelected = card.style.borderColor === 'var(--blue)';
        if (isSelected) {
          card.style.borderColor = 'transparent';
          var idx = selectedUrls.indexOf(card.dataset.url);
          if (idx !== -1) selectedUrls.splice(idx, 1);
        } else {
          card.style.borderColor = 'var(--blue)';
          selectedUrls.push(card.dataset.url);
        }
      });
    });

    var confirmBtn = document.getElementById('sm-cl-media-confirm');
    if (confirmBtn) {
      var newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', function() {
        selectedUrls.forEach(function(url) {
          if (url) self._mediaUrls.push(url);
        });
        modal.classList.remove('open');
        self._renderStep();
      });
    }
  },

  // ── 3. News Digest integration ──

  _loadNewsDigestItems: async function() {
    var self = this;
    var container = document.getElementById('sm-nd-items-container');
    if (!container) return;

    container.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Loading news digest items...</div></div>';

    var result = await this._supabase
      .from('news_digest_briefings')
      .select('*')
      .eq('user_id', this._userId);

    if (result.error) {
      container.innerHTML = '<div class="sm-step-hint">Could not load news digest items.</div>';
      return;
    }

    var briefings = result.data || [];
    if (briefings.length === 0) {
      container.innerHTML = '<div class="sm-step-hint">No news digest items found. Run a news digest refresh first.</div>';
      return;
    }

    var html = '<div class="sm-step-hint" style="margin-top:8px">Select a news item to use as the source for your content.</div>';
    html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">';

    briefings.forEach(function(briefing, bIdx) {
      if (!briefing.headline) return;
      var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];

      html += '<div class="item-card" style="padding:12px;cursor:pointer" data-nd-idx="' + bIdx + '">' +
        '<div style="font-weight:var(--font-weight-semibold);margin-bottom:6px">' + window.escHtml(briefing.headline) + '</div>' +
        '<div style="font-size:var(--badge-font-size);color:var(--text-muted);text-transform:uppercase;letter-spacing:var(--letter-spacing-label);margin-bottom:4px">' +
        window.escHtml(briefing.category || '') + '</div>';

      bullets.forEach(function(b, idx) {
        var title = b.title || '';
        var text = (b.text || '').substring(0, 120);
        html += '<div class="sm-nd-bullet" data-nd-briefing="' + bIdx + '" data-nd-bullet="' + idx + '" style="padding:8px;border:1px solid var(--border-light);border-radius:var(--btn-radius);margin-top:6px;cursor:pointer">' +
          (title ? '<div style="font-weight:500">' + window.escHtml(title) + '</div>' : '') +
          '<div style="font-size:var(--note-font-size);color:var(--text-secondary)">' + window.escHtml(text) + '</div>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.sm-nd-bullet').forEach(function(bullet) {
      bullet.addEventListener('click', function(e) {
        e.stopPropagation();
        var bIdx = parseInt(bullet.dataset.ndBriefing, 10);
        var bulletIdx = parseInt(bullet.dataset.ndBullet, 10);
        var briefing = briefings[bIdx];
        if (!briefing) return;
        var b = briefing.bullets[bulletIdx];
        if (!b) return;

        container.querySelectorAll('.sm-nd-bullet').forEach(function(el) { el.style.borderColor = ''; });
        bullet.style.borderColor = 'var(--blue)';

        if (self._currentJourney === 'industry_insight') {
          self._journeyInputs.nd_source_title = b.title || briefing.headline;
          self._journeyInputs.nd_source_content = b.text || '';
          self._journeyInputs.insight = b.text || '';
        } else if (self._currentJourney === 'blog_content') {
          self._journeyInputs.nd_source_title = b.title || briefing.headline;
          self._journeyInputs.nd_source_content = b.text || '';
          self._journeyInputs.blog_topic = b.text || '';
          self._journeyInputs.blog_title = b.title || briefing.headline;
        }
      });
    });
  },

  // ── 4. Event/Offer type pill renderers ──

  _renderEventTypePills: function() {
    var current = this._journeyInputs.what || '';
    var types = ['Open day', 'Workshop', 'Trade show', 'Sale event', 'Community event', 'Launch party', 'Other'];
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-eventtype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    html += '<div id="sm-event-other-wrap" style="margin-top:16px;display:' + (current === 'Other' ? 'block' : 'none') + '">' +
      '<div class="form-group"><label class="form-label">Event details</label>' +
      '<textarea class="form-input" id="sm-field-what-other" rows="3">' + window.escHtml(this._journeyInputs.what_other || '') + '</textarea></div></div>';
    return html;
  },

  _renderOfferTypePills: function() {
    var current = this._journeyInputs.what || '';
    var types = ['Discount', 'Bundle deal', 'Free service/add-on', 'Seasonal offer', 'Loyalty reward', 'Other'];
    var html = '<div class="sm-option-pills">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="sm-option-pill' + active + '" data-offertype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    html += '<div id="sm-offer-other-wrap" style="margin-top:16px;display:' + (current === 'Other' ? 'block' : 'none') + '">' +
      '<div class="form-group"><label class="form-label">Offer details</label>' +
      '<textarea class="form-input" id="sm-field-what-other" rows="3">' + window.escHtml(this._journeyInputs.what_other || '') + '</textarea></div></div>';
    return html;
  },

  // ── 5. Blog section editing ──

  _renderBlogSections: function(content) {
    if (!content) return '';
    var sections = content.split(/(?=^#{2,3}\s)/m);
    var html = '';
    sections.forEach(function(section, idx) {
      var trimmed = section.trim();
      if (!trimmed) return;
      var headingMatch = trimmed.match(/^(#{2,3})\s+(.+?)$/m);
      var heading = headingMatch ? headingMatch[2] : 'Section ' + (idx + 1);
      html += '<div class="sm-blog-section" data-section="' + idx + '" style="margin-bottom:16px;padding:12px;border:1px solid var(--border-light);border-radius:var(--btn-radius)">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<div style="font-weight:var(--font-weight-semibold)">' + window.escHtml(heading) + '</div>' +
        '<button class="btn-outline btn-sm" data-regen-section="' + idx + '">Regenerate Section</button>' +
        '</div>' +
        '<div class="sm-blog-section-content" style="font-size:var(--body-font-size);color:var(--text);white-space:pre-wrap">' + window.escHtml(trimmed) + '</div>' +
        '</div>';
    });
    return html;
  },

  _bindBlogSectionEvents: function() {
    var self = this;
    document.querySelectorAll('[data-regen-section]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var idx = parseInt(btn.dataset.regenSection, 10);
        await self._regenerateBlogSection(idx);
      });
    });
  },

  _regenerateBlogSection: async function(sectionIdx) {
    var self = this;
    var caption = this._generatedContent.caption || '';
    var sections = caption.split(/(?=^#{2,3}\s)/m);
    if (sectionIdx >= sections.length) return;

    var sectionEl = document.querySelector('[data-section="' + sectionIdx + '"]');
    var btn = document.querySelector('[data-regen-section="' + sectionIdx + '"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Regenerating...'; }

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var res = await fetch('/api/generate-social-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          journey_type: 'blog_content',
          inputs: Object.assign({}, this._journeyInputs, {
            regenerate_section: true,
            section_content: sections[sectionIdx].trim(),
            full_blog: caption
          }),
          output_type: 'blog_post'
        })
      });

      if (!res.ok) throw new Error('Failed to regenerate section.');
      var data = await res.json();
      var newSection = data.caption || data.content || sections[sectionIdx];

      sections[sectionIdx] = newSection;
      this._generatedContent.caption = sections.join('\n\n');

      var contentEl = sectionEl ? sectionEl.querySelector('.sm-blog-section-content') : null;
      if (contentEl) contentEl.textContent = newSection.trim();

      var captionEl = document.getElementById('sm-edit-caption');
      if (captionEl) captionEl.value = this._generatedContent.caption;
    } catch (err) {
      this._showError(err.message || 'Failed to regenerate section.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerate Section'; }
    }
  },

  // ── 6. CL write-back for ALL journey types (Pattern B) ──

  _saveOutputToCL: async function(content, inputs, journeyType) {
    var categoryMap = {
      finished_job: 'social_post',
      customer_story: 'testimonial',
      behind_scenes: 'social_post',
      product_launch: 'promotion',
      event_promo: 'promotion',
      offer_promo: 'promotion',
      industry_insight: 'social_post',
      tips_advice: 'social_post',
      blog_content: 'blog',
      business_update: 'social_post'
    };
    var tagMap = {
      finished_job: ['finished-job', 'social'],
      customer_story: ['testimonial', 'customer-story', 'social'],
      behind_scenes: ['behind-scenes', 'social'],
      product_launch: ['product-launch', 'social'],
      event_promo: ['event', 'promotion', 'social'],
      offer_promo: ['offer', 'promotion', 'social'],
      industry_insight: ['industry-insight', 'social'],
      tips_advice: ['tips', 'advice', 'social'],
      blog_content: ['blog', 'website'],
      business_update: ['business-update', 'social']
    };

    try {
      var sourceRef = 'sm-' + journeyType + '-' + Date.now();
      var title = inputs.blog_title || inputs.headline || inputs.what || '';
      if (!title) {
        var journeyLabel = '';
        this.JOURNEY_GROUPS.forEach(function(g) {
          g.journeys.forEach(function(j) {
            if (j.id === journeyType) journeyLabel = j.label;
          });
        });
        title = journeyLabel || journeyType;
      }

      var result = await this._supabase
        .from('content_library')
        .upsert({
          source: 'tool',
          tool_source: 'social',
          source_ref: sourceRef,
          status: 'approved',
          category: categoryMap[journeyType] || 'social_post',
          tool_tags: tagMap[journeyType] || ['social'],
          content_text: content.caption || '',
          title: title,
          user_id: this._userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'source_ref', ignoreDuplicates: true });

      if (result.error) {
        console.error('[SM] CL write-back error:', result.error.message);
        return;
      }
    } catch (err) {
      console.error('[SM] CL write-back error:', err.message);
    }
  },

  // ── 7. Customer Story project data loading ──

  _loadProjectData: async function() {
    if (this._bindProjectStepEvents) {
      await this._bindProjectStepEvents();
    }
  },

  // ── 8. Logo fetch from URL ──

  _fetchLogoFromUrl: function(url) {
    if (!url) return;
    var preview = document.getElementById('sm-logo-preview');
    if (!preview) return;

    try {
      var parsed = new URL(url.indexOf('://') === -1 ? 'https://' + url : url);
      var domain = parsed.hostname;
      var faviconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';

      preview.innerHTML = '<div style="display:flex;align-items:center;gap:12px">' +
        '<img src="' + window.escHtml(faviconUrl) + '" alt="Logo" style="width:64px;height:64px;border-radius:var(--btn-radius);border:1px solid var(--border)">' +
        '<div style="font-size:var(--note-font-size);color:var(--text-muted)">Logo fetched from ' + window.escHtml(domain) + '</div>' +
        '</div>';

      this._journeyInputs.logo_url = faviconUrl;
    } catch (e) {
      preview.innerHTML = '<div style="font-size:var(--note-font-size);color:var(--text-muted)">Could not fetch logo. Check the URL and try again.</div>';
    }
  }

  };

  Object.keys(features).forEach(function(key) {
    window.SOCIAL_LOGIC[key] = features[key];
  });
})();
