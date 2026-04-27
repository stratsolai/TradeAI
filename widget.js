(function() {
  var script = document.currentScript;
  if (!script) return;
  var widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) { console.error('StaxAI Widget: missing data-widget-id'); return; }

  var apiBase = script.src.substring(0, script.src.lastIndexOf('/'));
  var sessionId = 'ws_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  var messages = [];
  var settings = null;
  var settingsLoaded = false;
  var colour = '#4A6D8C';

  // ── STYLES ──────────────────────────────────────────────────────────────

  var css = document.createElement('style');
  css.textContent = ''
    + '.sxw{position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;font-size:14px;line-height:1.5;}'
    + '.sxw *{box-sizing:border-box;margin:0;padding:0;}'
    + '.sxw-bubble{width:60px;height:60px;border-radius:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.18);transition:transform 0.2s;}'
    + '.sxw-bubble:hover{transform:scale(1.08);}'
    + '.sxw-bubble svg{width:28px;height:28px;fill:#fff;}'
    + '.sxw-win{position:fixed;bottom:90px;right:20px;width:380px;height:560px;max-height:calc(100vh - 110px);background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.18);display:none;flex-direction:column;overflow:hidden;z-index:99999;}'
    + '.sxw-win.open{display:flex;}'
    + '.sxw-hdr{color:#fff;padding:16px;display:flex;justify-content:space-between;align-items:center;}'
    + '.sxw-hdr-title{font-weight:700;font-size:16px;}'
    + '.sxw-hdr-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 4px;line-height:1;}'
    + '.sxw-log{flex:1;overflow-y:auto;padding:14px;background:#f8f9fa;display:flex;flex-direction:column;gap:10px;}'
    + '.sxw-msg{max-width:82%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;}'
    + '.sxw-msg-u{align-self:flex-end;color:#fff;border-bottom-right-radius:4px;}'
    + '.sxw-msg-a{align-self:flex-start;background:#fff;color:#333;border:1px solid #e5e5e5;border-bottom-left-radius:4px;}'
    + '.sxw-typing{align-self:flex-start;background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:10px 16px;display:none;}'
    + '.sxw-typing.on{display:block;}'
    + '.sxw-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#999;margin:0 2px;animation:sxw-bounce 1.4s infinite;}'
    + '.sxw-dot:nth-child(2){animation-delay:0.2s;}'
    + '.sxw-dot:nth-child(3){animation-delay:0.4s;}'
    + '@keyframes sxw-bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}'
    + '.sxw-bar{padding:10px 12px;border-top:1px solid #e5e5e5;background:#fff;display:flex;gap:8px;}'
    + '.sxw-in{flex:1;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;font-family:inherit;outline:none;}'
    + '.sxw-in:focus{border-color:var(--sxw-c,#4A6D8C);}'
    + '.sxw-send{color:#fff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;}'
    + '.sxw-send:disabled{opacity:0.5;cursor:not-allowed;}'
    + '@media(max-width:480px){.sxw-win{width:calc(100vw - 24px);height:calc(100vh - 110px);right:12px;bottom:80px;}}';
  document.head.appendChild(css);

  // ── HTML ────────────────────────────────────────────────────────────────

  function build() {
    var el = document.createElement('div');
    el.className = 'sxw';
    el.innerHTML = ''
      + '<div class="sxw-bubble" id="sxw-bubble"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg></div>'
      + '<div class="sxw-win" id="sxw-win">'
      +   '<div class="sxw-hdr" id="sxw-hdr"><span class="sxw-hdr-title" id="sxw-title">Chat with us</span><button class="sxw-hdr-close" id="sxw-close">&times;</button></div>'
      +   '<div class="sxw-log" id="sxw-log">'
      +     '<div class="sxw-typing" id="sxw-typing"><span class="sxw-dot"></span><span class="sxw-dot"></span><span class="sxw-dot"></span></div>'
      +   '</div>'
      +   '<div class="sxw-bar"><input class="sxw-in" id="sxw-in" type="text" placeholder="Type your message..." autocomplete="off"><button class="sxw-send" id="sxw-send">Send</button></div>'
      + '</div>';
    document.body.appendChild(el);
    return el;
  }

  // ── INIT ────────────────────────────────────────────────────────────────

  function init() {
    var root = build();

    var bubble = root.querySelector('#sxw-bubble');
    var win = root.querySelector('#sxw-win');
    var closeBtn = root.querySelector('#sxw-close');
    var input = root.querySelector('#sxw-in');
    var sendBtn = root.querySelector('#sxw-send');
    var log = root.querySelector('#sxw-log');
    var typing = root.querySelector('#sxw-typing');
    var titleEl = root.querySelector('#sxw-title');
    var hdr = root.querySelector('#sxw-hdr');

    bubble.addEventListener('click', function() {
      win.classList.add('open');
      bubble.style.display = 'none';
      if (!settingsLoaded) { loadSettings(titleEl, hdr, log, bubble, sendBtn); settingsLoaded = true; }
      input.focus();
    });

    closeBtn.addEventListener('click', function() {
      win.classList.remove('open');
      bubble.style.display = '';
      endConversation();
    });

    sendBtn.addEventListener('click', function() { send(input, log, typing, sendBtn); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input, log, typing, sendBtn); }
    });
  }

  // ── SETTINGS ────────────────────────────────────────────────────────────

  function loadSettings(titleEl, hdr, log, bubble, sendBtn) {
    fetch(apiBase + '/api/chatbot-widget-settings?widget_id=' + encodeURIComponent(widgetId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        settings = data;
        colour = data.widget_colour || '#4A6D8C';
        applyColour(colour, bubble, hdr, sendBtn);
        if (data.widget_title) titleEl.textContent = data.widget_title;
        else if (data.business_name) titleEl.textContent = 'Chat with ' + data.business_name;
        var greeting = data.greeting_message || 'Hi there — how can we help you today?';
        addMsg(log, 'assistant', greeting);
        messages.push({ role: 'assistant', content: greeting });
      })
      .catch(function() {
        addMsg(log, 'assistant', 'Hi there — how can we help you today?');
        messages.push({ role: 'assistant', content: 'Hi there — how can we help you today?' });
      });
  }

  function applyColour(c, bubble, hdr, sendBtn) {
    bubble.style.background = c;
    hdr.style.background = c;
    sendBtn.style.background = c;
    document.documentElement.style.setProperty('--sxw-c', c);
  }

  // ── MESSAGES ────────────────────────────────────────────────────────────

  function addMsg(log, role, text) {
    var div = document.createElement('div');
    div.className = 'sxw-msg ' + (role === 'user' ? 'sxw-msg-u' : 'sxw-msg-a');
    if (role === 'user') div.style.background = colour;
    div.textContent = text;
    var typing = log.querySelector('#sxw-typing');
    if (typing) log.insertBefore(div, typing);
    else log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function send(input, log, typing, sendBtn) {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.disabled = true;
    sendBtn.disabled = true;

    messages.push({ role: 'user', content: text });
    addMsg(log, 'user', text);
    typing.classList.add('on');
    log.scrollTop = log.scrollHeight;

    var apiMessages = messages.filter(function(m) { return m.role === 'user' || m.role === 'assistant'; });

    fetch(apiBase + '/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_id: widgetId,
        messages: apiMessages,
        session_id: sessionId
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      typing.classList.remove('on');
      if (data.reply) {
        messages.push({ role: 'assistant', content: data.reply });
        addMsg(log, 'assistant', data.reply);
        if (data.trigger_appointment_picker && settings && settings.appointment_booking_enabled) {
          renderPicker(log);
        }
      } else if (data.error) {
        addMsg(log, 'assistant', 'Sorry, something went wrong. Please try again.');
      }
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    })
    .catch(function() {
      typing.classList.remove('on');
      addMsg(log, 'assistant', 'Sorry, could not connect. Please try again.');
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    });
  }

  // ── END CONVERSATION ────────────────────────────────────────────────────

  function endConversation() {
    if (messages.length <= 1) return;
    fetch(apiBase + '/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widget_id: widgetId,
        action: 'end_conversation',
        messages: messages,
        session_id: sessionId
      })
    }).catch(function() {});
  }

  // ── APPOINTMENT PICKER ──────────────────────────────────────────────────

  function renderPicker(log) {
    if (!settings) return;
    var availability = settings.availability || {};
    var timeLabels = settings.time_labels || ['Morning', 'Afternoon', 'Evening'];
    var dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    var today = new Date();
    var days = [];
    for (var i = 1; i <= 14; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var dayKey = dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1];
      var slots = availability[dayKey] || [];
      if (slots.length > 0) days.push({ date: d, dayKey: dayKey, slots: slots });
    }
    if (days.length === 0) {
      addMsg(log, 'assistant', 'No available booking times at the moment. Please contact us directly.');
      return;
    }

    var selected = [];
    var picker = document.createElement('div');
    picker.style.cssText = 'background:#f0f4f8;border-radius:10px;padding:12px;margin:4px 0;align-self:stretch;';

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:13px;color:' + colour + ';margin-bottom:10px;';
    title.textContent = 'Select your preferred times (up to 4)';
    picker.appendChild(title);

    var grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';

    days.forEach(function(day) {
      var dateStr = day.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      var fullDay = day.date.toLocaleDateString('en-AU', { weekday: 'long' });
      var fullDate = day.date.toISOString().split('T')[0];
      var col = document.createElement('div');
      col.style.cssText = 'background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:6px 8px;min-width:80px;';
      var lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:11px;font-weight:700;color:#333;margin-bottom:4px;';
      lbl.textContent = dateStr;
      col.appendChild(lbl);
      day.slots.forEach(function(idx) {
        var btn = document.createElement('button');
        btn.textContent = timeLabels[idx] || ('Slot ' + (idx + 1));
        btn.style.cssText = 'display:block;width:100%;background:#e8f0fb;color:' + colour + ';border:none;border-radius:4px;font-size:11px;font-weight:600;padding:4px 6px;margin-top:3px;cursor:pointer;';
        btn.addEventListener('click', function() {
          var key = fullDate + '|' + idx;
          var si = selected.findIndex(function(s) { return s.key === key; });
          if (si > -1) {
            selected.splice(si, 1);
            btn.style.background = '#e8f0fb';
            btn.style.color = colour;
          } else if (selected.length < 4) {
            selected.push({ key: key, date: fullDate, day: fullDay, slot: timeLabels[idx] || ('Slot ' + (idx + 1)) });
            btn.style.background = colour;
            btn.style.color = '#fff';
          }
          sum.textContent = selected.length === 0 ? 'No times selected yet'
            : selected.map(function(s) { return s.day + ' ' + s.date + ' (' + s.slot + ')'; }).join(', ');
        });
        col.appendChild(btn);
      });
      grid.appendChild(col);
    });
    picker.appendChild(grid);

    var sum = document.createElement('div');
    sum.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;';
    sum.textContent = 'No times selected yet';
    picker.appendChild(sum);

    var confirm = document.createElement('button');
    confirm.textContent = 'Confirm Preferred Times';
    confirm.style.cssText = 'background:' + colour + ';color:#fff;font-weight:700;font-size:13px;padding:8px;border:none;border-radius:6px;cursor:pointer;width:100%;';
    confirm.addEventListener('click', function() {
      if (selected.length === 0) return;
      picker.remove();
      var text = 'Preferred times: ' + selected.map(function(s) { return s.day + ' ' + s.date + ' (' + s.slot + ')'; }).join(', ');
      messages.push({ role: 'user', content: text });
      messages.push({ role: 'system_slots', content: JSON.stringify(selected.map(function(s) { return { date: s.date, day: s.day, slot: s.slot }; })) });
      addMsg(log, 'user', text);
      addMsg(log, 'assistant', 'Thank you \u2014 we will be in touch to confirm the best time.');
    });
    picker.appendChild(confirm);

    var typing = log.querySelector('#sxw-typing');
    if (typing) log.insertBefore(picker, typing);
    else log.appendChild(picker);
    log.scrollTop = log.scrollHeight;
  }

  // ── BOOT ────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
