window.CB_LOGIC = {

  _supabase: null,
  _userId: null,
  _conversations: [],
  _settings: {},
  _testMessages: [],
  _convFilter: 'all',

  // ── INIT ──────────────────────────────────────────────────────────────

  init: async function(supabase, user) {
    if (!supabase || !user) return;
    this._supabase = supabase;
    this._userId = user.id;

    await Promise.all([
      this._loadSettings(),
      this._loadConversations()
    ]);
    this._bindTabs();
    this._bindConvFilters();
    this._bindQuestionFilters();
    this._bindTestChat();
    this._renderConversations();
    this._renderLeads();
    this._renderQuestions();
    this._updateStats();
  },

  // ── DATA LOADING ──────────────────────────────────────────────────────

  _loadSettings: async function() {
    try {
      var res = await this._supabase
        .from('chatbot_settings')
        .select('*')
        .eq('user_id', this._userId)
        .maybeSingle();
      if (res.error) console.error('[CB] Settings load error:', res.error.message);
      if (res.data) this._settings = res.data;
    } catch (e) {
      console.error('[CB] Settings load exception:', e.message);
    }
  },

  _loadConversations: async function() {
    try {
      var res = await this._supabase
        .from('chatbot_conversations')
        .select('*')
        .eq('user_id', this._userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (res.error) {
        console.error('[CB] Conversations load error:', res.error.message);
        this._conversations = [];
        return;
      }
      this._conversations = res.data || [];
    } catch (e) {
      console.error('[CB] Conversations load exception:', e.message);
      this._conversations = [];
    }
  },

  // ── TABS ──────────────────────────────────────────────────────────────

  _bindTabs: function() {
    var self = this;
    document.querySelectorAll('.ptab[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.ptab-content').forEach(function(p) { p.classList.remove('active'); });
        btn.classList.add('active');
        var panel = document.getElementById('cb-tab-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
        if (btn.dataset.tab === 'test' && self._testMessages.length === 0) {
          self._showGreeting();
        }
      });
    });
  },

  // ── STATS ─────────────────────────────────────────────────────────────

  _updateStats: function() {
    var total = this._conversations.length;
    var leads = 0;
    var appointments = 0;
    var unanswered = 0;
    this._conversations.forEach(function(c) {
      if (c.is_lead) leads++;
      if (c.appointment_requested) appointments++;
      if (Array.isArray(c.unanswered_questions) && c.unanswered_questions.length > 0) {
        unanswered += c.unanswered_questions.length;
      }
    });
    var el;
    el = document.getElementById('stat-conversations'); if (el) el.textContent = total;
    el = document.getElementById('stat-leads'); if (el) el.textContent = leads;
    el = document.getElementById('stat-appointments'); if (el) el.textContent = appointments;
    el = document.getElementById('stat-unanswered'); if (el) el.textContent = unanswered;
  },

  // ── CONVERSATIONS TAB ─────────────────────────────────────────────────

  _bindConvFilters: function() {
    var self = this;
    document.querySelectorAll('#cb-tab-conversations .status-btn[data-filter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#cb-tab-conversations .status-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self._convFilter = btn.getAttribute('data-filter');
        self._renderConversations();
      });
    });
  },

  _getFilteredConversations: function() {
    var filter = this._convFilter;
    if (filter === 'completed') return this._conversations.filter(function(c) { return c.status === 'completed'; });
    if (filter === 'abandoned') return this._conversations.filter(function(c) { return c.status === 'abandoned'; });
    return this._conversations;
  },

  _renderConversations: function() {
    var container = document.getElementById('cb-conv-list');
    var empty = document.getElementById('cb-empty-conversations');
    if (!container) return;

    var items = this._getFilteredConversations();
    if (items.length === 0) {
      if (empty) empty.hidden = false;
      var existing = container.querySelectorAll('.cb-conv-card');
      existing.forEach(function(el) { el.remove(); });
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';
    items.forEach(function(c) { html += self._buildConvCard(c); });
    container.innerHTML = html + (empty ? empty.outerHTML : '');
    var newEmpty = document.getElementById('cb-empty-conversations');
    if (newEmpty) newEmpty.hidden = true;

    container.querySelectorAll('.cb-conv-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var transcript = card.querySelector('.cb-transcript');
        if (transcript) transcript.classList.toggle('open');
      });
    });
  },

  _buildConvCard: function(c) {
    var date = new Date(c.started_at || c.created_at);
    var dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    var timeStr = date.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });

    var transcript = Array.isArray(c.transcript) ? c.transcript : [];
    var firstUser = transcript.find(function(m) { return m.role === 'user'; });
    var preview = firstUser ? firstUser.content : 'No messages';
    if (preview.length > 100) preview = preview.substring(0, 100) + '...';

    var badges = '';
    if (c.status === 'completed') badges += '<span class="badge badge-green">Completed</span>';
    else badges += '<span class="badge badge-grey">Abandoned</span>';
    if (c.is_lead) badges += '<span class="badge badge-orange">Lead</span>';
    if (c.appointment_requested) badges += '<span class="badge badge-blue">Appointment</span>';

    var leadRow = '';
    if (c.is_lead && (c.lead_name || c.lead_email || c.lead_phone)) {
      leadRow = '<div class="cb-conv-lead-row">';
      if (c.lead_name) leadRow += '<span>' + escHtml(c.lead_name) + '</span>';
      if (c.lead_email) leadRow += '<a href="mailto:' + escHtml(c.lead_email) + '">' + escHtml(c.lead_email) + '</a>';
      if (c.lead_phone) leadRow += '<a href="tel:' + escHtml(c.lead_phone) + '">' + escHtml(c.lead_phone) + '</a>';
      leadRow += '</div>';
    }

    var slotsRow = '';
    if (c.appointment_requested && Array.isArray(c.preferred_slots) && c.preferred_slots.length > 0) {
      slotsRow = '<div class="cb-slots-row"><strong>Preferred slots:</strong><ul>'
        + c.preferred_slots.map(function(s) { return '<li>' + escHtml((s.day || '') + ' ' + (s.date || '') + ' — ' + (s.slot || '')) + '</li>'; }).join('')
        + '</ul></div>';
    }

    var transcriptHtml = transcript.map(function(m) {
      var cls = m.role === 'user' ? 'cb-msg cb-msg-user' : 'cb-msg cb-msg-assistant';
      return '<div class="' + cls + '">' + escHtml(m.content || '') + '</div>';
    }).join('');

    return '<div class="item-card cb-conv-card">'
      + '<div class="item-card-header">'
      + '<span class="item-upload-date">' + dateStr + ' ' + timeStr + '</span>'
      + '<div class="item-card-btns">' + badges + '</div>'
      + '</div>'
      + '<div class="cb-conv-preview">' + escHtml(preview) + '</div>'
      + leadRow
      + slotsRow
      + '<div class="cb-transcript"><div class="cb-transcript-inner">'
      + (transcriptHtml || '<em style="color:var(--text-muted);font-size:var(--note-font-size)">No transcript available</em>')
      + '</div></div>'
      + '</div>';
  },

  // ── LEADS TAB ─────────────────────────────────────────────────────────

  _renderLeads: function() {
    var container = document.getElementById('cb-leads-list');
    var empty = document.getElementById('cb-empty-leads');
    if (!container) return;

    var leads = this._conversations.filter(function(c) { return c.is_lead; });
    if (leads.length === 0) {
      if (empty) empty.hidden = false;
      var existing = container.querySelectorAll('.cb-conv-card');
      existing.forEach(function(el) { el.remove(); });
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';
    leads.forEach(function(c) { html += self._buildConvCard(c); });
    container.innerHTML = html + (empty ? empty.outerHTML : '');
    var newEmpty = document.getElementById('cb-empty-leads');
    if (newEmpty) newEmpty.hidden = true;

    container.querySelectorAll('.cb-conv-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var transcript = card.querySelector('.cb-transcript');
        if (transcript) transcript.classList.toggle('open');
      });
    });
  },

  // ── UNANSWERED QUESTIONS TAB ──────────────────────────────────────────

  _qFilter: 'active',

  _bindQuestionFilters: function() {
    var self = this;
    document.querySelectorAll('#cb-tab-unanswered .status-btn[data-qfilter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('#cb-tab-unanswered .status-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self._qFilter = btn.getAttribute('data-qfilter');
        self._renderQuestions();
      });
    });
  },

  _getQuestions: function() {
    var questions = [];
    this._conversations.forEach(function(c) {
      if (!Array.isArray(c.unanswered_questions)) return;
      c.unanswered_questions.forEach(function(q, idx) {
        var text = typeof q === 'string' ? q : (q.text || '');
        var resolved = typeof q === 'object' && q.resolved === true;
        if (text) {
          questions.push({
            convId: c.id,
            index: idx,
            text: text,
            resolved: resolved,
            date: c.created_at
          });
        }
      });
    });
    return questions;
  },

  _renderQuestions: function() {
    var container = document.getElementById('cb-questions-list');
    var empty = document.getElementById('cb-empty-questions');
    if (!container) return;

    var allQ = this._getQuestions();
    var filtered = allQ.filter(function(q) {
      return this._qFilter === 'active' ? !q.resolved : q.resolved;
    }.bind(this));

    if (filtered.length === 0) {
      if (empty) empty.hidden = false;
      var existing = container.querySelectorAll('.cb-question-card');
      existing.forEach(function(el) { el.remove(); });
      return;
    }
    if (empty) empty.hidden = true;

    var self = this;
    var html = '';
    filtered.forEach(function(q) {
      var dateStr = new Date(q.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      html += '<div class="item-card cb-question-card" data-conv-id="' + q.convId + '" data-index="' + q.index + '">'
        + '<div class="cb-question-text">' + escHtml(q.text) + '</div>'
        + '<div class="cb-question-meta">'
        + '<span class="item-upload-date">' + dateStr + '</span>';

      if (!q.resolved) {
        html += '<a href="/library#business-profile" class="btn-outline btn-sm">Add to Business Profile</a>'
          + '<button class="btn-outline btn-sm cb-create-kb-btn" data-text="' + escHtml(q.text) + '">Create Knowledge Item</button>'
          + '<button class="btn-sm cb-dismiss-btn" style="border:2px solid var(--red-dark);color:var(--red-dark);background:var(--white);border-radius:var(--btn-radius);font-family:var(--body-font);font-weight:var(--font-weight-semibold);cursor:pointer">Dismiss</button>';
      } else {
        html += '<span class="badge badge-green">Resolved</span>';
      }

      html += '</div></div>';
    });

    container.innerHTML = html + (empty ? empty.outerHTML : '');
    var newEmpty = document.getElementById('cb-empty-questions');
    if (newEmpty) newEmpty.hidden = true;

    // Wire dismiss buttons
    container.querySelectorAll('.cb-dismiss-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var card = btn.closest('.cb-question-card');
        var convId = card.getAttribute('data-conv-id');
        var index = parseInt(card.getAttribute('data-index'));
        self._resolveQuestion(convId, index);
      });
    });

    // Wire create knowledge item buttons
    container.querySelectorAll('.cb-create-kb-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var text = btn.getAttribute('data-text');
        self._createKnowledgeItem(text);
      });
    });
  },

  _resolveQuestion: async function(convId, index) {
    try {
      var conv = this._conversations.find(function(c) { return c.id === convId; });
      if (!conv || !Array.isArray(conv.unanswered_questions)) return;

      var q = conv.unanswered_questions[index];
      if (typeof q === 'string') {
        conv.unanswered_questions[index] = { text: q, resolved: true };
      } else if (q && typeof q === 'object') {
        q.resolved = true;
      }

      var res = await this._supabase
        .from('chatbot_conversations')
        .update({ unanswered_questions: conv.unanswered_questions })
        .eq('id', convId);

      if (res.error) {
        console.error('[CB] Resolve question error:', res.error.message);
        this._showError('Could not dismiss question. Please try again.');
        return;
      }

      this._renderQuestions();
      this._updateStats();
    } catch(e) {
      console.error('[CB] Resolve question exception:', e.message);
      this._showError('Could not dismiss question. Please try again.');
    }
  },

  _createKnowledgeItem: async function(questionText) {
    var answer = prompt('Write the answer for this question. It will be saved to your Content Library and used by the chatbot.\n\nQuestion: ' + questionText);
    if (!answer || !answer.trim()) return;

    try {
      var sourceRef = 'cb-kb-' + Date.now() + '-' + this._userId;
      var res = await this._supabase.from('content_library').insert({
        user_id: this._userId,
        source: 'tool',
        tool_source: 'chatbot',
        source_ref: sourceRef,
        status: 'approved',
        category: 'knowledge',
        tool_tags: ['CB'],
        content_text: 'Q: ' + questionText + '\nA: ' + answer.trim(),
        content_type: 'text'
      });

      if (res.error) {
        console.error('[CB] Create KB item error:', res.error.message);
        this._showError('Could not create knowledge item. Please try again.');
        return;
      }

      this._showError('Knowledge item created and added to your chatbot.');
    } catch(e) {
      console.error('[CB] Create KB item exception:', e.message);
      this._showError('Could not create knowledge item. Please try again.');
    }
  },

  // ── TEST CHATBOT TAB ──────────────────────────────────────────────────

  _bindTestChat: function() {
    var self = this;
    var input = document.getElementById('cb-test-input');
    var sendBtn = document.getElementById('cb-test-send');
    var clearBtn = document.getElementById('cb-test-clear');

    if (sendBtn) sendBtn.addEventListener('click', function() { self._sendTestMessage(); });
    if (input) input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self._sendTestMessage(); }
    });
    if (clearBtn) clearBtn.addEventListener('click', function() { self._clearTestChat(); });
  },

  _showGreeting: function() {
    if (this._testMessages.length > 0) return;
    var greeting = this._settings.greeting_message;
    if (greeting) {
      this._appendTestMsg('assistant', greeting);
      this._testMessages.push({ role: 'assistant', content: greeting });
    }
  },

  _sendTestMessage: async function() {
    var input = document.getElementById('cb-test-input');
    var text = input ? input.value.trim() : '';
    if (!text) return;
    if (input) input.value = '';

    this._testMessages.push({ role: 'user', content: text });
    this._appendTestMsg('user', text);

    var log = document.getElementById('cb-test-log');
    var thinking = document.createElement('div');
    thinking.className = 'cb-test-thinking';
    thinking.textContent = 'Thinking...';
    if (log) { log.appendChild(thinking); log.scrollTop = log.scrollHeight; }

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) throw new Error('Session expired.');

      var apiMessages = this._testMessages.filter(function(m) {
        return m.role === 'user' || m.role === 'assistant';
      });

      var res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (thinking.parentNode) thinking.remove();

      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');

      if (data.reply) {
        this._testMessages.push({ role: 'assistant', content: data.reply });
        this._appendTestMsg('assistant', data.reply);
      }

      if (data.trigger_appointment_picker && this._settings.appointment_booking_enabled) {
        this._renderAppointmentPicker();
      }

    } catch(e) {
      if (thinking.parentNode) thinking.remove();
      console.error('[CB] Test message error:', e.message);
      this._appendTestMsg('assistant', 'Something went wrong. Please try again.');
    }
  },

  _appendTestMsg: function(role, text) {
    var log = document.getElementById('cb-test-log');
    if (!log) return;
    var div = document.createElement('div');
    div.className = 'cb-msg ' + (role === 'user' ? 'cb-msg-user' : 'cb-msg-assistant');
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  },

  _clearTestChat: function() {
    this._testMessages = [];
    var log = document.getElementById('cb-test-log');
    if (log) log.innerHTML = '';
    this._showGreeting();
  },

  _renderAppointmentPicker: function() {
    var log = document.getElementById('cb-test-log');
    if (!log) return;
    var availability = this._settings.availability || {};
    var timeLabels = this._settings.time_labels || ['Morning', 'Afternoon', 'Evening'];
    var dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    var today = new Date();
    var self = this;

    var days = [];
    for (var i = 1; i <= 14; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var dayKey = dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1];
      var availableSlots = availability[dayKey] || [];
      if (availableSlots.length > 0) {
        days.push({ date: d, dayKey: dayKey, slots: availableSlots });
      }
    }

    if (days.length === 0) {
      this._appendTestMsg('assistant', 'No available booking slots are configured at the moment. Please contact the business directly.');
      return;
    }

    var picker = document.createElement('div');
    picker.className = 'cb-slots-row';
    picker.style.cssText = 'align-self:stretch;border:1px solid var(--border);border-radius:var(--card-radius);margin-top:4px';

    var html = '<div style="font-weight:var(--font-weight-semibold);margin-bottom:8px">Select your preferred times (up to 4)</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">';

    days.forEach(function(day) {
      var dateStr = day.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      var fullDay = day.date.toLocaleDateString('en-AU', { weekday: 'long' });
      var fullDate = day.date.toISOString().split('T')[0];
      html += '<div style="border:1px solid var(--border);border-radius:var(--btn-radius);padding:8px 10px;min-width:90px">'
        + '<div style="font-size:var(--badge-font-size);font-weight:var(--heading-lg-weight);margin-bottom:6px">' + dateStr + '</div>';
      day.slots.forEach(function(idx) {
        html += '<button class="btn-sm btn-outline cb-appt-slot" data-date="' + fullDate + '" data-day="' + fullDay + '" data-slot="' + timeLabels[idx] + '" style="display:block;width:100%;margin-bottom:4px;font-size:var(--badge-font-size)">' + timeLabels[idx] + '</button>';
      });
      html += '</div>';
    });

    html += '</div>'
      + '<div id="cb-appt-selected" style="font-size:var(--note-font-size);color:var(--text-muted);margin-bottom:8px">No slots selected yet</div>'
      + '<button class="btn-primary" id="cb-appt-confirm" style="width:100%">Confirm Preferred Times</button>';

    picker.innerHTML = html;
    log.appendChild(picker);
    log.scrollTop = log.scrollHeight;

    var selectedSlots = [];
    picker.querySelectorAll('.cb-appt-slot').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (btn.classList.contains('active')) {
          btn.classList.remove('active');
          btn.style.background = '';
          btn.style.color = '';
          selectedSlots = selectedSlots.filter(function(s) { return !(s.date === btn.dataset.date && s.slot === btn.dataset.slot); });
        } else if (selectedSlots.length < 4) {
          btn.classList.add('active');
          btn.style.background = 'var(--blue)';
          btn.style.color = 'var(--white)';
          selectedSlots.push({ date: btn.dataset.date, day: btn.dataset.day, slot: btn.dataset.slot });
        }
        var selEl = document.getElementById('cb-appt-selected');
        if (selEl) {
          selEl.textContent = selectedSlots.length > 0
            ? selectedSlots.map(function(s) { return s.day + ' ' + s.date + ' — ' + s.slot; }).join(', ')
            : 'No slots selected yet';
        }
      });
    });

    var confirmBtn = document.getElementById('cb-appt-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        if (selectedSlots.length === 0) return;
        picker.remove();
        var summary = selectedSlots.map(function(s) { return s.day + ' ' + s.date + ' (' + s.slot + ')'; }).join(', ');
        self._appendTestMsg('user', 'Preferred times: ' + summary);
        self._testMessages.push({ role: 'system_slots', content: JSON.stringify(selectedSlots) });
        self._appendTestMsg('assistant', 'Thank you — the business will be in touch to confirm the best time.');
      });
    }
  },

  // ── ERROR DISPLAY ─────────────────────────────────────────────────────

  _showError: function(message) {
    var modal = document.getElementById('cb-error-msg');
    if (!modal) return;
    var textEl = modal.querySelector('.save-msg-text');
    if (textEl) textEl.textContent = message;
    modal.classList.add('open');
    var okBtn = modal.querySelector('.save-msg-ok');
    if (okBtn) okBtn.addEventListener('click', function() { modal.classList.remove('open'); }, { once: true });
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.remove('open'); }, { once: true });
  }

};
