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

    var timeFilter = this._scheduledTimeFilter || 'all';
    if (timeFilter !== 'all') {
      var now = new Date();
      var startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
      var endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7);
      var startOfNextWeek = new Date(endOfWeek);
      var endOfNextWeek = new Date(startOfNextWeek); endOfNextWeek.setDate(startOfNextWeek.getDate() + 7);
      var startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      var endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      items = items.filter(function(item) {
        var sp = item.scheduled_posts;
        var schedDate = sp && sp.length > 0 ? new Date(sp[0].scheduled_for) : null;
        if (!schedDate) return false;
        if (timeFilter === 'this_week') return schedDate >= startOfWeek && schedDate < endOfWeek;
        if (timeFilter === 'next_week') return schedDate >= startOfNextWeek && schedDate < endOfNextWeek;
        if (timeFilter === 'this_month') return schedDate >= startOfMonth && schedDate <= endOfMonth;
        return true;
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
    var sortVal = this._publishedSort || 'newest';

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

    var dateFrom = (document.getElementById('sm-published-date-from') || {}).value;
    var dateTo = (document.getElementById('sm-published-date-to') || {}).value;
    if (dateFrom) {
      var fromMs = new Date(dateFrom).getTime();
      items = items.filter(function(item) {
        return item.published_at && new Date(item.published_at).getTime() >= fromMs;
      });
    }
    if (dateTo) {
      var toMs = new Date(dateTo + 'T23:59:59').getTime();
      items = items.filter(function(item) {
        return item.published_at && new Date(item.published_at).getTime() <= toMs;
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

  _scheduledTimeFilter: 'all',
  _scheduledSelected: new Set(),

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
    html += '<span style="margin-left:8px;border-left:1px solid var(--border);padding-left:8px"></span>';
    var timeFilters = [
      { id: 'all', label: 'All time' },
      { id: 'this_week', label: 'This week' },
      { id: 'next_week', label: 'Next week' },
      { id: 'this_month', label: 'This month' }
    ];
    timeFilters.forEach(function(tf) {
      var active = self._scheduledTimeFilter === tf.id ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-timefilter="' + tf.id + '">' + tf.label + '</button>';
    });
    container.innerHTML = html;

    container.querySelectorAll('[data-filter]').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._scheduledFilter = pill.dataset.filter;
        self._scheduledPage = 0;
        self._loadScheduled();
      });
    });
    container.querySelectorAll('[data-timefilter]').forEach(function(pill) {
      pill.addEventListener('click', function() {
        self._scheduledTimeFilter = pill.dataset.timefilter;
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
    html += '<label class="sm-campaign-filter-label">' +
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
      var timeUntil = '';
      if (tab === 'published' && item.published_at) {
        dateStr = new Date(item.published_at).toLocaleDateString('en-AU');
      } else if (tab === 'scheduled') {
        var sp = item.scheduled_posts;
        var schedFor = sp && sp.length > 0 ? sp[0].scheduled_for : null;
        if (schedFor) {
          dateStr = new Date(schedFor).toLocaleDateString('en-AU') + ' ' + new Date(schedFor).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
          var diff = new Date(schedFor).getTime() - Date.now();
          if (diff > 0) {
            var days = Math.floor(diff / 86400000);
            var hours = Math.floor((diff % 86400000) / 3600000);
            if (days > 0) timeUntil = days + 'd ' + hours + 'h';
            else if (hours > 0) timeUntil = hours + 'h';
            else timeUntil = Math.ceil(diff / 60000) + 'min';
          }
        } else {
          dateStr = new Date(item.created_at).toLocaleDateString('en-AU');
        }
      } else {
        dateStr = new Date(item.created_at).toLocaleDateString('en-AU');
      }

      html += '<div class="item-card sm-post-card" data-id="' + item.id + '">';
      if (tab === 'scheduled') {
        html += '<div style="display:flex;align-items:center;padding:0 8px"><input type="checkbox" class="item-checkbox sm-sched-check" data-checkid="' + item.id + '" style="width:18px;height:18px;accent-color:var(--blue)"></div>';
      }
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
      if (timeUntil) {
        html += '<span class="badge badge-blue" style="margin-left:auto">' + timeUntil + '</span>';
      }
      html += '</div>';
      html += '<div class="text-preview sm-text-preview">' + window.escHtml(preview) + '</div>';
      html += '<div class="sm-post-actions">';

      if (tab === 'draft') {
        html += '<button class="btn-outline btn-sm" data-action="edit" data-id="' + item.id + '">Edit</button>';
        html += '<button class="btn-outline btn-sm" data-action="schedule" data-id="' + item.id + '">Schedule</button>';
        html += '<button class="btn-primary btn-sm" data-action="post-now" data-id="' + item.id + '">Post Now</button>';
        html += '<button class="btn-dismiss btn-sm" data-action="delete" data-id="' + item.id + '">Delete</button>';
      } else if (tab === 'scheduled') {
        html += '<button class="btn-outline btn-sm" data-action="edit" data-id="' + item.id + '">Edit</button>';
        html += '<button class="btn-outline btn-sm" data-action="reschedule" data-id="' + item.id + '">Reschedule</button>';
        html += '<button class="btn-primary btn-sm" data-action="post-now-scheduled" data-id="' + item.id + '">Post Now</button>';
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

    if (tab === 'scheduled') {
      container.querySelectorAll('.sm-sched-check').forEach(function(cb) {
        cb.addEventListener('change', function() {
          if (cb.checked) self._scheduledSelected.add(cb.dataset.checkid);
          else self._scheduledSelected.delete(cb.dataset.checkid);
          var bar = document.getElementById('sm-scheduled-bulk-bar');
          var count = document.getElementById('sm-scheduled-bulk-count');
          if (self._scheduledSelected.size > 0) {
            bar.style.display = '';
            count.textContent = self._scheduledSelected.size + ' selected';
          } else {
            bar.style.display = 'none';
          }
        });
      });
    }
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

      var detailHtml = '<div class="sm-preview-card sm-view-detail">' +
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
      detailHtml += '<div class="sm-detail-metrics">' +
        '<div class="sm-post-metrics">' +
        '<div class="sm-post-metric">\uD83D\uDC41 <span class="sm-post-metric-value">' + (viewPost.reach || 0) + '</span> reach</div>' +
        '<div class="sm-post-metric">\u2764\uFE0F <span class="sm-post-metric-value">' + (viewPost.engagement || 0) + '</span> engagement</div>' +
        '<div class="sm-post-metric">\uD83D\uDD17 <span class="sm-post-metric-value">' + (viewPost.clicks || 0) + '</span> clicks</div>' +
        '</div></div>';

      if (viewPost.metadata && (viewPost.metadata.facebook_id || viewPost.metadata.instagram_id)) {
        detailHtml += '<div class="sm-detail-links">';
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
        detailHtml += '<div class="sm-detail-platforms">Published to: ' + window.escHtml(conns.join(', ')) + '</div>';
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

    } else if (action === 'post-now-scheduled') {
      this._showConfirm('Post Now', 'This will publish the post immediately. Continue?', async function() {
        var postResult = await self._supabase.from('social_posts').select('*').eq('id', postId).single();
        if (postResult.error || !postResult.data) { self._showError('Could not load post.'); return; }
        var postData = postResult.data;

        var sessionRes = await self._supabase.auth.getSession();
        var session = sessionRes.data && sessionRes.data.session;
        if (!session) { self._showError('Session expired.'); return; }

        if (postData.connections && postData.connections.length > 0) {
          var metaRes = await fetch('/api/meta-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
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
            self._showError(errData.error || 'Failed to publish.');
            return;
          }
        }

        await self._supabase.from('scheduled_posts').delete().eq('social_post_id', postId);
        await self._supabase.from('social_posts').update({
          status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }).eq('id', postId);

        self._loadScheduled();
        self._loadStats();
        self._showSuccess('Post published successfully.');
      });

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
    html += '<select class="form-input" id="' + containerId + '-jump" style="width:auto;padding:6px 10px;font-size:var(--badge-font-size)">';
    for (var pg = 0; pg < totalPages; pg++) {
      html += '<option value="' + pg + '"' + (pg === currentPage ? ' selected' : '') + '>Page ' + (pg + 1) + '</option>';
    }
    html += '</select>';
    html += '<span class="sm-pagination-info">of ' + totalPages + '</span>';
    html += '<button class="btn-outline btn-sm" id="' + containerId + '-next"' + (currentPage >= totalPages - 1 ? ' disabled' : '') + '>Next</button>';
    container.innerHTML = html;

    var prevBtn = document.getElementById(containerId + '-prev');
    var nextBtn = document.getElementById(containerId + '-next');
    var jumpSelect = document.getElementById(containerId + '-jump');
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
    if (jumpSelect) {
      jumpSelect.addEventListener('change', function() {
        self[pageField] = parseInt(jumpSelect.value, 10);
        self[loadMethod]();
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

    var html = '<div class="sm-cal-nav">';
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
    wrapper.className = 'sm-pills-wrap';

    var label = document.createElement('span');
    label.className = 'text-muted';
    label.textContent = 'Recent hashtags:';
    wrapper.appendChild(label);

    tags.forEach(function(tag) {
      var pill = document.createElement('button');
      pill.className = 'filter-pill';
      pill.textContent = tag;
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

  _showSuccess: function(msg) {
    window.showModalSuccess(msg, 'sm-error-msg');
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
    html += '<div class="sm-pills-wrap">' +
      '<button class="filter-pill" id="sm-project-manual">Enter manually</button>' +
      '<button class="filter-pill" id="sm-project-add-new">Add a new project</button>' +
      '</div>';
    html += '<div id="sm-project-list"></div>';
    html += '<div id="sm-project-manual-fields" style="display:none">' +
      '<div class="form-group"><label class="form-label">Customer first name</label>' +
      '<input type="text" class="form-input" id="sm-field-customer-name" value="' + window.escHtml(this._journeyInputs.customer_name || '') + '"></div>' +
      '<div class="form-group"><label class="form-label">Service provided</label>' +
      '<input type="text" class="form-input" id="sm-field-service" value="' + window.escHtml(this._journeyInputs.service || '') + '"></div>' +
      '</div>';
    html += '<div id="sm-project-add-form" style="display:none">' +
      '<div class="sm-step-content">' +
      '<div class="sm-step-question">Add New Project</div>' +
      '<div class="form-group"><label class="form-label">Customer name</label>' +
      '<input type="text" class="form-input" id="sm-proj-new-name"></div>' +
      '<div class="form-group"><label class="form-label">Service provided</label>' +
      '<input type="text" class="form-input" id="sm-proj-new-service"></div>' +
      '<div class="form-group"><label class="form-label">Description (optional)</label>' +
      '<textarea class="form-input" id="sm-proj-new-desc" rows="2"></textarea></div>' +
      '<div class="form-group"><label class="form-label">Status</label>' +
      '<select class="form-input sm-proj-status-select" id="sm-proj-new-status">' +
      '<option value="completed">Completed</option>' +
      '<option value="active">Active</option>' +
      '</select></div>' +
      '<div class="action-row">' +
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
    html += '<div id="sm-logo-preview"></div>';
    html += '<div class="form-group sm-logo-permission-row">' +
      '<input type="checkbox" class="item-checkbox" id="sm-field-logo-permission"' +
      (this._journeyInputs.logo_permission ? ' checked' : '') + '>' +
      '<label class="form-label" for="sm-field-logo-permission">I have permission to use this logo in my marketing</label></div>';
    return html;
  },

  _populateProjectList: async function() {
    var self = this;
    var container = document.getElementById('sm-project-list');
    if (!container) return;

    var projects = await this._loadCLProjects();
    if (projects.length === 0) {
      container.innerHTML = '<div class="sm-proj-empty">No saved projects yet. Enter details manually or add a new project.</div>';
      return;
    }

    var selectedId = this._journeyInputs.cl_project_id || null;
    var html = '';
    projects.forEach(function(p) {
      var isSelected = selectedId === p.id;
      var statusBadge = p.status === 'active'
        ? '<span class="badge badge-green">Active</span>'
        : '<span class="badge badge-grey">Completed</span>';
      html += '<div class="item-card sm-proj-card' + (isSelected ? ' active' : '') + '" data-projid="' + p.id + '">' +
        '<div class="sm-proj-row">' +
        '<div><strong>' + window.escHtml(p.customer_name || '') + '</strong>' +
        (p.service_provided ? ' &mdash; ' + window.escHtml(p.service_provided) : '') +
        '</div>' +
        '<div class="sm-proj-actions">' + statusBadge +
        '<button class="btn-outline btn-sm" data-projdelete="' + p.id + '">Delete</button>' +
        '</div></div>';
      if (p.description) {
        html += '<div class="sm-proj-desc">' + window.escHtml(p.description.substring(0, 120)) + '</div>';
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
          container.querySelectorAll('.item-card').forEach(function(c) { c.classList.remove('active'); });
          card.classList.add('active');
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

