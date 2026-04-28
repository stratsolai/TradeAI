(function() {
  var mgmt = {

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
    var bulkDel = await this._supabase.from('social_posts').delete().in('id', ids).eq('user_id', this._userId);
    if (bulkDel.error) { this._showError('Could not delete selected drafts.'); return; }
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
