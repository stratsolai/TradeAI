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
      document.querySelectorAll('.owner-only').forEach(function(el) { el.style.display = ''; });
    }

    if (level === 3) {
      var subsCard = document.getElementById('subs-card');
      if (subsCard) subsCard.style.display = 'none';
    }

    self._loadSubscriptions();

    if (level === 1) {
      self._wireBillingPortal();
      self._loadTeam();
    }

    self._wireChangePassword();
    self._wireSignOut();
  },

  // ── SUBSCRIPTIONS ──
  _loadSubscriptions: function() {
    var self = this;
    var ownerId = window.accountOwnerId || self._user.id;
    var body = document.getElementById('subs-body');
    if (!body) return;

    self._supabase.from('profiles')
      .select('activated_tools')
      .eq('id', ownerId)
      .single()
      .then(function(result) {
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
          var price = t ? (t.price || '') : '';
          html += '<div class="acct-sub-item">'
            + '<div class="acct-sub-icon">' + icon + '</div>'
            + '<div class="acct-sub-info">'
            + '<div class="acct-sub-name">' + window.escHtml(name) + '</div>'
            + '</div>'
            + (price ? '<div class="acct-sub-price">' + window.escHtml(price) + '/mo</div>' : '')
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
      .then(function(r) {
        if (!r.ok) throw new Error('Portal request failed');
        return r.json();
      })
      .then(function(data) {
        if (data.url) {
          window.open(data.url, '_blank');
        } else {
          window.showModalError('Could not open billing portal. Please try again.');
        }
      })
      .catch(function() {
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
          + '<div class="acct-invite-title">Invite Team Member</div>'
          + '<div class="acct-invite-form">'
          + '<div class="acct-invite-field">'
          + '<label class="acct-invite-label">Email address</label>'
          + '<input type="email" id="invite-email" class="acct-invite-input" placeholder="teammate@example.com">'
          + '</div>'
          + '<div class="acct-invite-field">'
          + '<label class="acct-invite-label">Access level</label>'
          + '<select id="invite-level" class="acct-invite-select">'
          + '<option value="2">Manager</option>'
          + '<option value="3">Staff</option>'
          + '</select>'
          + '</div>'
          + '<button class="btn-primary" id="invite-btn">Send Invite</button>'
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
    });
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
        var level = parseInt(document.getElementById('invite-level').value);
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
