window.ACCOUNT_LOGIC = {
  init: function() {
    var self = this;
    self._initAuth();
  },

  _initAuth: function() {
    var self = this;
    var client = window.supabaseClient;
    client.auth.getSession().then(function(result) {
      var session = result.data && result.data.session;
      if (!session) {
        window.location.href = '/login.html';
        return;
      }
      self._user = session.user;
      self._loadAccountData();
      self._wireSignOut();
      self._wireAccountDropdown();
    });
  },

  _wireAccountDropdown: function() {
    var self = this;
    var btn = document.getElementById('account-btn');
    var dropdown = document.getElementById('account-dropdown');
    if (btn && dropdown) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        dropdown.classList.toggle('open');
      });
      document.addEventListener('click', function() {
        dropdown.classList.remove('open');
      });
    }
  },

  _wireSignOut: function() {
    var self = this;
    var btn = document.getElementById('sign-out-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        window.supabaseClient.auth.signOut().then(function() {
          window.location.href = '/login.html';
        });
      });
    }
  },

  _loadAccountData: function() {
    var self = this;
    var client = window.supabaseClient;
    var userId = self._user.id;
    var email = self._user.email;

    var emailShort = document.getElementById('account-email-short');
    var dropdownEmail = document.getElementById('account-dropdown-email');
    if (emailShort) emailShort.textContent = email.split('@')[0];
    if (dropdownEmail) dropdownEmail.textContent = email;

    var accountEmailEl = document.getElementById('account-details-email');
    if (accountEmailEl) accountEmailEl.textContent = email;

    client
      .from('profiles')
      .select('activated_tools, business_name')
      .eq('user_id', userId)
      .single()
      .then(function(result) {
        if (result.error) {
          console.error('Profile load error:', result.error);
          self._renderSubscriptions([]);
          return;
        }
        var profile = result.data;
        var activatedTools = (profile && profile.activated_tools) ? profile.activated_tools : [];
        self._renderSubscriptions(activatedTools);
      });
  },

  _renderSubscriptions: function(activatedTools) {
    var container = document.getElementById('subscriptions-list');
    if (!container) return;

    if (!activatedTools || activatedTools.length === 0) {
      container.innerHTML = '<p class="al-empty">No active tool subscriptions yet. <a href="/dashboard.html">Activate your first tool from the Dashboard.</a></p>';
      return;
    }

    var html = '';
    activatedTools.forEach(function(toolId) {
      var tool = null;
      if (window.CORE_TOOLS) {
        tool = window.CORE_TOOLS.find(function(t) { return t.toolId === toolId; });
      }
      var name = tool ? tool.name : toolId;
      var icon = tool ? (tool.icon || '') : '';
      var price = tool ? (tool.price || '') : '';
      html += '<div class="al-sub-row">';
      html += '<div class="al-sub-icon">' + icon + '</div>';
      html += '<div class="al-sub-info"><span class="al-sub-name">' + name + '</span>';
      if (price) html += '<span class="al-sub-price">' + price + '/month</span>';
      html += '</div>';
      html += '<div class="al-sub-status"><span class="al-status-badge">Active</span></div>';
      html += '</div>';
    });
    container.innerHTML = html;
  },

  _openStripePortal: function() {
    var btn = document.getElementById('manage-billing-btn');
    if (btn) {
      btn.addEventListener('click', function() {
        window.supabaseClient.auth.getSession().then(function(result) {
          var token = result.data && result.data.session && result.data.session.access_token;
          if (!token) return;
          fetch('/api/create-portal-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
          })
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (data.url) window.open(data.url, '_blank');
          })
          .catch(function(err) { console.error('Portal error:', err); });
        });
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  if (window.supabaseClient) {
    window.ACCOUNT_LOGIC.init();
    window.ACCOUNT_LOGIC._openStripePortal();
  } else {
    console.error('supabaseClient not available');
  }
});