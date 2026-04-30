window.ACCOUNT_LOGIC = {

  _supabase: null,
  _user: null,
  _session: null,

  init: function(supabase, user) {
    var self = this;
    self._supabase = supabase;
    self._user = user;

    supabase.auth.getSession().then(function(res) {
      self._session = res.data && res.data.session;
      self._render();
    });
  },

  _render: function() {
    var self = this;
    var level = window.userSecurityLevel || 1;
    var roleLabels = { 1: 'Account Owner', 2: 'Manager', 3: 'Staff' };

    document.getElementById('acct-email').textContent = self._user.email || '';
    document.getElementById('acct-role').textContent = roleLabels[level] || 'User';

    if (level === 1) {
      document.querySelectorAll('.owner-only').forEach(function(el) { el.classList.remove('owner-only'); });
    }

    if (level === 3) {
      var subsCard = document.getElementById('subs-card');
      if (subsCard) subsCard.style.display = 'none';
    }

    self._wireTabs();
    self._setTabVisibility(level);

    self._loadSubscriptions();

    if (level === 1) {
      self._wireBillingPortal();
      self._loadTeam();
    }

    self._wireChangePassword();
    self._wireSignOut();
  },

  _wireTabs: function() {
    document.querySelectorAll('.ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('settings-active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('settings-active');
        var panel = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (panel) panel.classList.add('active');
      });
    });
  },

  _setTabVisibility: function(level) {
    var subsBtn = document.getElementById('tab-btn-subscriptions');
    var teamBtn = document.getElementById('tab-btn-team');
    if (level !== 1 && teamBtn) teamBtn.style.display = 'none';
    if (level === 3 && subsBtn) subsBtn.style.display = 'none';
    if (level === 3) {
      var defaultTab = document.getElementById('tab-btn-account');
      if (defaultTab) defaultTab.click();
    }
  },

  // ── PRICE LOADING ──
  // Load both the user's actual subscription prices (preferred) and the
  // catalogue price map. Returns { sub, cat } maps of priceId → display
  // string, or null if both fetches fail. Tools fall back from sub → cat
  // → hardcoded price + "/mth".
  _loadAccountPrices: function() {
    var self = this;
    var token = self._session && self._session.access_token;
    var subPromise = token
      ? fetch('/api/get-subscription-prices', { headers: { 'Authorization': 'Bearer ' + token } })
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(d) { return d && d.prices ? d.prices : null; })
          .catch(function() { return null; })
      : Promise.resolve(null);
    var catPromise = fetch('/api/get-prices')
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { return d && d.prices ? d.prices : null; })
      .catch(function() { return null; });
    return Promise.all([subPromise, catPromise]).then(function(maps) {
      var sub = maps[0];
      var cat = maps[1];
      if (!sub && !cat) return null;
      return { sub: sub || {}, cat: cat || {} };
    });
  },

  _priceForTool: function(tool, priceMaps) {
    if (!tool) return '';
    if (priceMaps) {
      if (tool.priceId && priceMaps.sub[tool.priceId]) return priceMaps.sub[tool.priceId];
      if (tool.priceId && priceMaps.cat[tool.priceId]) return priceMaps.cat[tool.priceId];
    }
    // Hardcoded fallback. Append /mth to match the live format.
    return tool.price ? (tool.price + '/mth') : '';
  },

  // ── SUBSCRIPTIONS ──
  _loadSubscriptions: function() {
    var self = this;
    var ownerId = window.accountOwnerId || self._user.id;
    var body = document.getElementById('subs-body');
    if (!body) return;

    var profilePromise = self._supabase.from('profiles')
      .select('activated_tools')
      .eq('id', ownerId)
      .single();

    Promise.all([profilePromise, self._loadAccountPrices()])
      .then(function(results) {
        var result = results[0];
        var priceMaps = results[1];
        if (result.error) {
          body.innerHTML = '<div style="padding:18px 24px;" class="list-empty">Could not load subscriptions.</div>';
          return;
        }
        var tools = (result.data && Array.isArray(result.data.activated_tools)) ? result.data.activated_tools : [];
        if (tools.length === 0) {
          body.innerHTML = '<div style="padding:18px 24px;" class="list-empty">No active subscriptions. <a href="/dashboard.html">Activate your first tool</a> from the Dashboard.</div>';
          return;
        }

        var coreTools = (typeof window.CORE_TOOLS !== 'undefined') ? window.CORE_TOOLS : [];
        var html = '<div style="padding:18px 24px;"><div class="acct-sub-list">';
        tools.forEach(function(toolId) {
          var t = coreTools.find(function(ct) { return ct.id === toolId; });
          var name = t ? (Array.isArray(t.title) ? t.title.join(' ') : (t.title || toolId)) : toolId;
          var icon = t ? (t.icon || '\ud83d\udd27') : '\ud83d\udd27';
          var price = self._priceForTool(t, priceMaps);
          html += '<div class="acct-sub-item">'
            + '<div class="acct-sub-icon">' + icon + '</div>'
            + '<div class="acct-sub-info">'
            + '<div class="acct-sub-name">' + window.escHtml(name) + '</div>'
            + '</div>'
            + (price ? '<div class="acct-sub-price">' + window.escHtml(price) + '</div>' : '')
            + '</div>';
        });
        html += '</div></div>';
        body.innerHTML = html;
      });
  },

  // ── BILLING PORTAL ──
  _wireBillingPortal: function() {
    var self = this;
    var btn = document.getElementById('billing-portal-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      var token = self._session && self._session.access_token;
      if (!token) return;
      btn.textContent = 'Opening\u2026';
      btn.disabled = true;
      fetch('/api/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
      })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
      .then(function(res) {
        if (res.ok && res.data && res.data.url) {
          window.open(res.data.url, '_blank');
        } else {
          var msg = (res.data && res.data.error) ? res.data.error : 'Could not open billing portal. Please try again.';
          console.error('[billing-portal] API error:', msg);
          window.showModalError(msg);
        }
      })
      .catch(function(err) {
        console.error('[billing-portal] Fetch error:', err && err.message);
        window.showModalError('Could not open billing portal. Please try again.');
      })
      .finally(function() {
        btn.textContent = 'Manage Billing';
        btn.disabled = false;
      });
    });
  },

  // ── TEAM MANAGEMENT ──
  _loadTeam: function() {
    var self = this;
    var body = document.getElementById('team-body');
    if (!body) return;

    Promise.all([
      self._supabase.from('team_members')
        .select('id, email, security_level, status, joined_at, invited_at')
        .eq('account_owner_id', self._user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true }),
      self._supabase.from('team_members')
        .select('id, email, security_level, status, invited_at')
        .eq('account_owner_id', self._user.id)
        .eq('status', 'pending')
        .order('invited_at', { ascending: false })
    ]).then(function(results) {
      var active = (results[0].data) || [];
      var pending = (results[1].data) || [];
      var total = active.length + pending.length;

      var countEl = document.getElementById('team-count');
      if (countEl) countEl.textContent = total + ' of 4 team member' + (total !== 1 ? 's' : '');

      var html = '<div style="padding:18px 24px;"><div class="acct-team-list">';

      // Owner row
      var ownerInitial = self._user.email.charAt(0).toUpperCase();
      html += '<div class="acct-team-item">'
        + '<div class="acct-avatar">' + ownerInitial + '</div>'
        + '<div class="acct-team-info">'
        + '<div class="acct-team-email">' + window.escHtml(self._user.email) + '</div>'
        + '<div class="acct-team-meta">You</div>'
        + '</div>'
        + '<span class="badge badge-orange">Account Owner</span>'
        + '</div>';

      // Active members
      active.forEach(function(m) {
        var initial = m.email.charAt(0).toUpperCase();
        var levelLabel = m.security_level === 2 ? 'Manager' : 'Staff';
        var badgeClass = m.security_level === 2 ? 'badge-blue' : 'badge-grey';
        var joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';
        html += '<div class="acct-team-item" data-member-id="' + m.id + '">'
          + '<div class="acct-avatar">' + initial + '</div>'
          + '<div class="acct-team-info">'
          + '<div class="acct-team-email">' + window.escHtml(m.email) + '</div>'
          + '<div class="acct-team-meta">Joined ' + joined + '</div>'
          + '</div>'
          + '<span class="badge ' + badgeClass + '">' + levelLabel + '</span>'
          + '<div class="acct-team-actions">'
          + '<button class="btn-outline btn-sm acct-remove-btn" data-id="' + m.id + '" data-email="' + window.escHtml(m.email) + '">Remove</button>'
          + '</div>'
          + '</div>';
      });

      // Pending invites
      pending.forEach(function(m) {
        var initial = m.email.charAt(0).toUpperCase();
        var levelLabel = m.security_level === 2 ? 'Manager' : 'Staff';
        var invited = m.invited_at ? new Date(m.invited_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';
        html += '<div class="acct-team-item" data-member-id="' + m.id + '">'
          + '<div class="acct-avatar acct-avatar-muted">' + initial + '</div>'
          + '<div class="acct-team-info">'
          + '<div class="acct-team-email">' + window.escHtml(m.email) + '</div>'
          + '<div class="acct-team-meta">Invited ' + invited + ' \u00b7 ' + levelLabel + '</div>'
          + '</div>'
          + '<span class="badge badge-orange">Pending</span>'
          + '<div class="acct-team-actions">'
          + '<button class="btn-outline btn-sm acct-resend-btn" data-id="' + m.id + '" data-email="' + window.escHtml(m.email) + '" data-level="' + m.security_level + '">Resend</button>'
          + '<button class="btn-outline btn-sm acct-cancel-btn" data-id="' + m.id + '" style="color:var(--red);border-color:var(--red);">Cancel</button>'
          + '</div>'
          + '</div>';
      });

      html += '</div>';

      // Invite form or max message
      if (total < 4) {
        html += '<div class="acct-invite-section">'
          + '<div class="section-label">Invite Team Member</div>'
          + '<div class="acct-invite-form">'
          + '<input type="email" id="invite-email" class="form-input acct-invite-email" placeholder="teammate@example.com">'
          + '<span class="lookback-dropdown-wrap acct-invite-level-wrap">'
          + '<button type="button" class="lookback-dropdown lookback-dropdown-field" id="invite-level-btn" data-value="2">Manager</button>'
          + '<div class="lookback-dropdown-menu" id="invite-level-menu">'
          + '<button type="button" class="lookback-dropdown-item active" data-value="2">Manager</button>'
          + '<button type="button" class="lookback-dropdown-item" data-value="3">Staff</button>'
          + '</div>'
          + '</span>'
          + '<button type="button" class="btn-outline" id="invite-btn">Send Invite</button>'
          + '</div>'
          + '</div>';
      } else {
        html += '<div class="acct-invite-section">'
          + '<p class="acct-max-msg">Your account has reached the maximum of 5 users (you + 4 team members).</p>'
          + '</div>';
      }

      html += '</div>';
      body.innerHTML = html;
      self._wireTeamActions();
      self._wireInviteLevelDropdown();
    });
  },

  _wireInviteLevelDropdown: function() {
    var btn = document.getElementById('invite-level-btn');
    var menu = document.getElementById('invite-level-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    menu.querySelectorAll('.lookback-dropdown-item').forEach(function(item) {
      item.addEventListener('click', function() {
        menu.querySelectorAll('.lookback-dropdown-item').forEach(function(i) { i.classList.remove('active'); });
        item.classList.add('active');
        btn.setAttribute('data-value', item.getAttribute('data-value'));
        btn.textContent = item.textContent;
        menu.classList.remove('open');
      });
    });
    document.addEventListener('click', function() { menu.classList.remove('open'); });
  },

  _wireTeamActions: function() {
    var self = this;
    var body = document.getElementById('team-body');
    if (!body) return;

    body.addEventListener('click', function(e) {
      var removeBtn = e.target.closest('.acct-remove-btn');
      if (removeBtn) {
        var id = removeBtn.getAttribute('data-id');
        var email = removeBtn.getAttribute('data-email');
        self._removeMember(id, email);
        return;
      }

      var resendBtn = e.target.closest('.acct-resend-btn');
      if (resendBtn) {
        var resendEmail = resendBtn.getAttribute('data-email');
        var resendLevel = parseInt(resendBtn.getAttribute('data-level'));
        self._sendInvite(resendEmail, resendLevel, true);
        return;
      }

      var cancelBtn = e.target.closest('.acct-cancel-btn');
      if (cancelBtn) {
        var cancelId = cancelBtn.getAttribute('data-id');
        self._cancelInvite(cancelId);
        return;
      }
    });

    var inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', function() {
        var email = document.getElementById('invite-email').value.trim();
        var levelBtn = document.getElementById('invite-level-btn');
        var level = parseInt(levelBtn ? levelBtn.getAttribute('data-value') : '2');
        if (!email) { window.showModalError('Please enter an email address.'); return; }
        self._sendInvite(email, level, false);
      });
    }
  },

  _sendInvite: function(email, level, isResend) {
    var self = this;
    var token = self._session && self._session.access_token;
    if (!token) return;

    var inviteBtn = document.getElementById('invite-btn');
    if (inviteBtn && !isResend) { inviteBtn.textContent = 'Sending\u2026'; inviteBtn.disabled = true; }

    fetch('/api/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ email: email, security_level: level })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (res.ok) {
        window.showModalSuccess(isResend ? 'Invite resent to ' + email : 'Invite sent to ' + email);
        var emailInput = document.getElementById('invite-email');
        if (emailInput) emailInput.value = '';
        self._loadTeam();
      } else {
        window.showModalError(res.data.error || 'Could not send invite. Please try again.');
      }
    })
    .catch(function() {
      window.showModalError('Could not send invite. Please try again.');
    })
    .finally(function() {
      if (inviteBtn && !isResend) { inviteBtn.textContent = 'Send Invite'; inviteBtn.disabled = false; }
    });
  },

  _removeMember: function(id, email) {
    var self = this;
    var token = self._session && self._session.access_token;
    if (!token) return;
    if (!confirm('Remove ' + email + ' from your team? They will lose access immediately.')) return;

    fetch('/api/remove-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ team_member_id: id })
    })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (res.ok) {
        window.showModalSuccess(email + ' has been removed from your team.');
        self._loadTeam();
      } else {
        window.showModalError(res.data.error || 'Could not remove user. Please try again.');
      }
    })
    .catch(function() {
      window.showModalError('Could not remove user. Please try again.');
    });
  },

  _cancelInvite: function(id) {
    var self = this;
    self._supabase.from('team_members')
      .update({ status: 'revoked' })
      .eq('id', id)
      .eq('account_owner_id', self._user.id)
      .then(function(result) {
        if (result.error) {
          window.showModalError('Could not cancel invite.');
          return;
        }
        window.showModalSuccess('Invite cancelled.');
        self._loadTeam();
      });
  },

  // ── CHANGE PASSWORD ──
  _wireChangePassword: function() {
    var self = this;
    var btn = document.getElementById('change-password-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      btn.textContent = 'Sending\u2026';
      btn.disabled = true;
      self._supabase.auth.resetPasswordForEmail(self._user.email).then(function(result) {
        if (result.error) {
          window.showModalError('Could not send reset email. Please try again.');
        } else {
          window.showModalSuccess('Password reset email sent to ' + self._user.email);
        }
        btn.textContent = 'Change Password';
        btn.disabled = false;
      });
    });
  },

  // ── SIGN OUT ──
  _wireSignOut: function() {
    var self = this;
    var btn = document.getElementById('acct-sign-out-btn');
    if (!btn) return;
    btn.addEventListener('click', function() {
      self._supabase.auth.signOut().then(function() {
        window.location.href = '/login';
      });
    });
  }
};
