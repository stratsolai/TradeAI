window.BI_LOGIC = {
  _supabase: null,
  _user: null,
  _insights: {},
  _charts: {},
  _chatState: {},
  _financialData: null,
  _customerData: null,
  _operationsData: null,
  _marketData: null,
  _strategicData: null,

  init: function(supabase, user) {
    this._supabase = supabase;
    this._user = user;
    this._bindEvents();
    this._loadAllModules();
  },

  _bindEvents: function() {
    var self = this;
    var refreshBtn = document.getElementById('bi-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() { self._loadAllModules(true); });
    }
    var errorOk = document.querySelector('#bi-error-msg .save-msg-ok');
    if (errorOk) {
      errorOk.addEventListener('click', function() { document.getElementById('bi-error-msg').classList.remove('open'); });
    }
    var errorOverlay = document.getElementById('bi-error-msg');
    if (errorOverlay) {
      errorOverlay.addEventListener('click', function(e) { if (e.target === errorOverlay) errorOverlay.classList.remove('open'); });
    }
  },

  _showError: function(msg) {
    var el = document.getElementById('bi-error-msg');
    var textEl = el ? el.querySelector('.save-msg-text') : null;
    if (textEl) textEl.textContent = msg;
    if (el) el.classList.add('open');
  },

  _loadAllModules: function(forceRefresh) {
    var self = this;
    var M = window.BI_MODULES;
    self._setRefreshState(true);

    Promise.all([
      self._loadCachedInsights(forceRefresh),
      M.fetchFinancial(self._supabase).then(function(d) { self._financialData = d; }).catch(function(e) { console.error('[BI] Financial:', e.message); }),
      M.fetchCustomers(self._supabase).then(function(d) { self._customerData = d; }).catch(function(e) { console.error('[BI] Customers:', e.message); }),
      M.fetchOperations(self._supabase).then(function(d) { self._operationsData = d; }).catch(function(e) { console.error('[BI] Operations:', e.message); }),
      M.fetchMarket(self._supabase, self._user.id).then(function(d) { self._marketData = d; }).catch(function(e) { console.error('[BI] Market:', e.message); }),
      M.fetchStrategic(self._supabase, self._user.id).then(function(d) { self._strategicData = d; }).catch(function(e) { console.error('[BI] Strategic:', e.message); })
    ]).then(function() {
      self._renderAlertsModule();
      M.renderFinancial(self._financialData, self._charts);
      M.renderCustomers(self._customerData, self._charts);
      M.renderOperations(self._operationsData, self._charts);
      M.renderMarket(self._marketData);
      M.renderStrategic(self._strategicData, self._charts);
      self._updateLastRefreshed();
      self._setRefreshState(false);
    }).catch(function(err) {
      console.error('[BI] Load error:', err.message || err);
      self._showError('Could not load insights. Please try again.');
      self._setRefreshState(false);
    });
  },

  _setRefreshState: function(loading) {
    var btn = document.getElementById('bi-refresh-btn');
    if (!btn) return;
    btn.textContent = loading ? 'Refreshing...' : 'Refresh Insights';
    btn.disabled = loading;
  },

  _updateLastRefreshed: function() {
    var el = document.getElementById('bi-last-refreshed');
    if (!el) return;
    var now = new Date();
    var h = now.getHours(); var m = now.getMinutes();
    var ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    el.textContent = 'Last refreshed: ' + h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  },

  _loadCachedInsights: async function(forceRefresh) {
    var sb = this._supabase;
    var userId = this._user.id;

    if (!forceRefresh) {
      var result = await sb.from('bi_insights').select('*').eq('user_id', userId).eq('is_dismissed', false);
      if (!result.error && result.data && result.data.length > 0) {
        var now = new Date().toISOString();
        var valid = result.data.filter(function(r) { return !r.expires_at || r.expires_at > now; });
        if (valid.length > 0) {
          this._insights = {};
          for (var i = 0; i < valid.length; i++) {
            var row = valid[i];
            if (!this._insights[row.module]) this._insights[row.module] = [];
            this._insights[row.module].push(row);
          }
          return;
        }
      }
    }

    this._insights = {};
    try {
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;
      if (!token) return;

      var resp = await fetch('/api/bi-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: '{}'
      });
      if (!resp.ok) {
        console.error('[BI] Insights API failed:', resp.status);
        return;
      }
      var json = await resp.json();
      if (json.success && json.data) {
        for (var j = 0; j < json.data.length; j++) {
          var row = json.data[j];
          if (!this._insights[row.module]) this._insights[row.module] = [];
          this._insights[row.module].push(row);
        }
      }
    } catch (err) {
      console.error('[BI] Insights fetch error:', err.message || err);
    }
  },

  _renderAlertsModule: function() {
    var contentEl = document.getElementById('bi-mod-alerts-content');
    var updatedEl = document.getElementById('bi-mod-alerts-updated');
    if (!contentEl) return;

    var data = this._insights['alerts'] || [];

    if (updatedEl) {
      var now = new Date();
      var h = now.getHours(); var m = now.getMinutes();
      var ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      updatedEl.textContent = h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    if (data.length === 0) {
      contentEl.innerHTML = '<div class="bi-module-prompt">' +
        '<div class="bi-module-prompt-icon">&#9888;</div>' +
        '<h3>Risk &amp; Opportunity Alerts</h3>' +
        '<p>Alerts are based on available data. Connect more sources for richer, cross-referenced insights.</p>' +
        '</div>';
      return;
    }

    var html = '<div style="padding:16px 20px">';
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      var d = item.insight_data || {};
      var severity = d.severity || 'blue';
      var sevClass = severity === 'red' ? 'severity-red' : severity === 'amber' ? 'severity-amber' : severity === 'green' ? 'severity-green' : '';

      html += '<div class="bi-alert-card ' + sevClass + '" data-insight-id="' + escHtml(item.id) + '">';
      html += '<div class="bi-alert-header">';
      html += '<span class="bi-alert-type-icon">' + (d.icon || '&#9888;') + '</span>';
      html += '<span class="bi-alert-headline">' + escHtml(d.headline || 'Alert') + '</span>';
      html += '<button class="bi-alert-expand-btn" data-insight-id="' + escHtml(item.id) + '">&#9660;</button>';
      html += '</div>';
      html += '<div class="bi-alert-detail" id="bi-alert-detail-' + escHtml(item.id) + '">' + escHtml(d.detail || '') + '</div>';
      if (d.suggestion) {
        html += '<div class="bi-alert-suggestion">' + escHtml(d.suggestion) + '</div>';
      }
      html += '<div class="bi-alert-actions">';
      html += '<button class="bi-ask-btn" data-insight-id="' + escHtml(item.id) + '" data-module="alerts">Ask about this</button>';
      html += '<button class="bi-act-btn" data-insight-id="' + escHtml(item.id) + '">Act on this</button>';
      html += '<button class="bi-dismiss-btn" data-insight-id="' + escHtml(item.id) + '">Dismiss</button>';
      html += '</div>';
      html += '</div>';
    }
    html += '</div>';
    contentEl.innerHTML = html;

    this._bindAlertEvents(contentEl);
  },

  _bindAlertEvents: function(container) {
    var self = this;
    container.querySelectorAll('.bi-alert-expand-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-insight-id');
        var detail = document.getElementById('bi-alert-detail-' + id);
        if (detail) detail.classList.toggle('open');
      });
    });
    container.querySelectorAll('.bi-ask-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        self._openChat(btn.getAttribute('data-insight-id'), btn.getAttribute('data-module'));
      });
    });
    container.querySelectorAll('.bi-act-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._actOnInsight(btn.getAttribute('data-insight-id')); });
    });
    container.querySelectorAll('.bi-dismiss-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { self._dismissInsight(btn.getAttribute('data-insight-id'), btn); });
    });
  },

  _SUGGESTED_QUESTIONS: {
    'cash flow': ['How urgent is this?', 'What are my options?', 'Should I chase invoices or cut costs first?'],
    'concentration': ['Is this normal for my industry?', 'What is a safe concentration level?', 'How do I diversify my customer base?'],
    'opportunity': ['Am I qualified for this?', 'What would I need to apply?', 'Is this worth pursuing?'],
    'margin': ['What is causing this?', 'How do I fix it?', 'What margin should I be targeting?'],
    'growth': ['How do I capitalise on this?', 'Do I have capacity?', 'What resources do I need?'],
    'digital': ['Where do I start?', 'What is the typical cost?', 'How long does this usually take?'],
    'overdue': ['How urgent is this?', 'What are my options?', 'Should I chase invoices or cut costs first?'],
    'compliance': ['What is the risk if I ignore this?', 'How do I fix it quickly?', 'Is there a legal obligation?'],
    '_default': ['What does this mean for my business?', 'What should I do about this?', 'How serious is this?']
  },

  _getSuggestedQuestions: function(insightData) {
    if (!insightData) return this._SUGGESTED_QUESTIONS._default;
    var text = ((insightData.headline || '') + ' ' + (insightData.text || '') + ' ' + (insightData.detail || '')).toLowerCase();
    var keys = Object.keys(this._SUGGESTED_QUESTIONS);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] !== '_default' && text.indexOf(keys[i]) !== -1) return this._SUGGESTED_QUESTIONS[keys[i]];
    }
    return this._SUGGESTED_QUESTIONS._default;
  },

  _getInsightData: function(insightId, mod) {
    var allInsights = this._insights[mod] || [];
    for (var i = 0; i < allInsights.length; i++) {
      if (allInsights[i].id === insightId) return allInsights[i].insight_data || {};
    }
    return null;
  },

  _openChat: function(insightId, mod) {
    var self = this;
    var existing = document.getElementById('bi-chat-active');
    if (existing) existing.remove();

    var insightData = this._getInsightData(insightId, mod);
    var chatKey = insightId + '-' + mod;
    if (!this._chatState[chatKey]) {
      this._chatState[chatKey] = { history: [], turns: 0 };
    }
    var state = this._chatState[chatKey];

    var suggested = this._getSuggestedQuestions(insightData);
    var maxTurns = 4;

    var topic = '';
    if (insightData) topic = insightData.headline || insightData.text || 'this insight';
    if (topic.length > 60) topic = topic.substring(0, 57) + '...';

    var panel = document.createElement('div');
    panel.className = 'bi-chat-panel open';
    panel.id = 'bi-chat-active';

    var html = '<div class="bi-chat-header">';
    html += '<span class="bi-chat-title">Ask about: ' + escHtml(topic) + '</span>';
    html += '<button class="bi-chat-close" id="bi-chat-close-btn">&times;</button>';
    html += '</div>';
    html += '<div class="bi-chat-messages" id="bi-chat-messages">';
    for (var h = 0; h < state.history.length; h++) {
      var msg = state.history[h];
      html += '<div class="bi-chat-msg ' + escHtml(msg.role) + '">' + escHtml(msg.content) + '</div>';
    }
    html += '</div>';

    if (state.turns < maxTurns) {
      html += '<div class="bi-chat-suggestions" id="bi-chat-suggestions">';
      for (var s = 0; s < suggested.length; s++) {
        html += '<button class="bi-chat-suggestion" data-q="' + escHtml(suggested[s]) + '">' + escHtml(suggested[s]) + '</button>';
      }
      html += '</div>';
      html += '<div class="bi-chat-input-row">';
      html += '<input class="bi-chat-input" id="bi-chat-input" type="text" placeholder="Ask a question...">';
      html += '<button class="bi-chat-send" id="bi-chat-send-btn">Send</button>';
      html += '</div>';
    } else {
      html += '<div class="bi-chat-msg assistant">To explore this further, consider acting on this insight or consulting your advisor.</div>';
    }

    panel.innerHTML = html;

    var targetCard = null;
    if (insightId) {
      targetCard = document.querySelector('[data-insight-id="' + insightId + '"]');
      if (!targetCard) {
        var modCard = document.getElementById('bi-mod-' + mod);
        if (modCard) targetCard = modCard;
      }
    }
    if (!targetCard) targetCard = document.getElementById('bi-mod-alerts');
    if (targetCard) {
      var moduleCard = targetCard.closest('.bi-module-card');
      if (moduleCard) moduleCard.appendChild(panel);
      else targetCard.parentElement.appendChild(panel);
    }

    var closeBtn = document.getElementById('bi-chat-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { panel.remove(); });
    }

    if (state.turns < maxTurns) {
      var sendBtn = document.getElementById('bi-chat-send-btn');
      var input = document.getElementById('bi-chat-input');

      var sendFn = function() {
        var q = input ? input.value.trim() : '';
        if (!q) return;
        self._sendChatMessage(chatKey, q, insightData, mod, panel);
      };

      if (sendBtn) sendBtn.addEventListener('click', sendFn);
      if (input) {
        input.addEventListener('keydown', function(e) { if (e.key === 'Enter') sendFn(); });
        input.focus();
      }

      panel.querySelectorAll('.bi-chat-suggestion').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var q = btn.getAttribute('data-q');
          if (input) input.value = q;
          self._sendChatMessage(chatKey, q, insightData, mod, panel);
        });
      });
    }
  },

  _sendChatMessage: async function(chatKey, question, insightData, mod, panel) {
    var state = this._chatState[chatKey];
    if (!state) return;

    var messagesEl = document.getElementById('bi-chat-messages');
    var input = document.getElementById('bi-chat-input');
    var sendBtn = document.getElementById('bi-chat-send-btn');
    var suggestionsEl = document.getElementById('bi-chat-suggestions');

    if (suggestionsEl) suggestionsEl.style.display = 'none';

    var userMsg = document.createElement('div');
    userMsg.className = 'bi-chat-msg user';
    userMsg.textContent = question;
    if (messagesEl) { messagesEl.appendChild(userMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }

    state.history.push({ role: 'user', content: question });
    state.turns++;

    if (input) { input.value = ''; input.disabled = true; }
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = '...'; }

    try {
      var sb = this._supabase;
      var session = await sb.auth.getSession();
      var token = session.data && session.data.session && session.data.session.access_token;

      var resp = await fetch('/api/bi-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
          insightData: insightData,
          question: question,
          history: state.history.slice(0, -1),
          module: mod
        })
      });

      var json = await resp.json();
      var reply = (json.success && json.reply) ? json.reply : 'Sorry, I could not generate a response. Please try again.';

      state.history.push({ role: 'assistant', content: reply });

      var assistantMsg = document.createElement('div');
      assistantMsg.className = 'bi-chat-msg assistant';
      assistantMsg.textContent = reply;
      if (messagesEl) { messagesEl.appendChild(assistantMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }

    } catch (err) {
      console.error('[BI] Chat error:', err.message || err);
      var errMsg = document.createElement('div');
      errMsg.className = 'bi-chat-msg assistant';
      errMsg.textContent = 'Something went wrong. Please try again.';
      if (messagesEl) messagesEl.appendChild(errMsg);
    }

    if (state.turns >= 4) {
      if (input) input.parentElement.remove();
      var limitMsg = document.createElement('div');
      limitMsg.className = 'bi-chat-msg assistant';
      limitMsg.textContent = 'To explore this further, consider acting on this insight or consulting your advisor.';
      if (messagesEl) { messagesEl.appendChild(limitMsg); messagesEl.scrollTop = messagesEl.scrollHeight; }
    } else {
      if (input) input.disabled = false;
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
      if (input) input.focus();
    }
  },

  _actOnInsight: function(insightId) {
    // Act on this flow will be implemented in Step 19
  },

  _dismissInsight: async function(insightId, btn) {
    var sb = this._supabase;
    var result = await sb.from('bi_insights').update({ is_dismissed: true, updated_at: new Date().toISOString() }).eq('id', insightId).eq('user_id', this._user.id);
    if (result.error) {
      console.error('[BI] Dismiss error:', result.error);
      this._showError('Could not dismiss this alert. Please try again.');
      return;
    }
    var card = btn ? btn.closest('.bi-alert-card, .bi-advisory-item') : null;
    if (card) card.remove();
  }
};
