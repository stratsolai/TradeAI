(function() {
  // Get the script tag that loaded this widget
  const scriptTag = document.currentScript;
  const userId = scriptTag.getAttribute('data-user-id');
  let _chatbotSettings = {};
  (async function() {
    try {
      const _settingsRes = await fetch('/api/chatbot-widget-settings?userId=' + userId);
      if (_settingsRes.ok) _chatbotSettings = await _settingsRes.json();
    } catch(e) { /* non-fatal */ }
  })();
  
  if (!userId) {
    console.error('TradeAI Widget: Missing data-user-id attribute');
    return;
  }

  // Widget styles
  const styles = `
    .tradeai-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    .tradeai-bubble {
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: linear-gradient(135deg, #1a5490 0%, #4a9fd8 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .tradeai-bubble:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }

    .tradeai-bubble svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    .tradeai-chat-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 380px;
      height: 550px;
      max-height: calc(100vh - 120px);
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }

    .tradeai-chat-window.open {
      display: flex;
    }

    .tradeai-chat-header {
      background: linear-gradient(135deg, #1a5490 0%, #4a9fd8 100%);
      color: white;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tradeai-chat-title {
      font-weight: 600;
      font-size: 16px;
    }

    .tradeai-close-btn {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 24px;
    }

    .tradeai-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #f9f9f9;
    }

    .tradeai-message {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
    }

    .tradeai-message.user {
      align-items: flex-end;
    }

    .tradeai-message.bot {
      align-items: flex-start;
    }

    .tradeai-message-bubble {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      line-height: 1.4;
      font-size: 14px;
    }

    .tradeai-message.user .tradeai-message-bubble {
      background: #1a5490;
      color: white;
    }

    .tradeai-message.bot .tradeai-message-bubble {
      background: white;
      color: #333;
      border: 1px solid #e5e5e5;
    }

    .tradeai-typing {
      display: none;
      padding: 10px 14px;
      background: white;
      border: 1px solid #e5e5e5;
      border-radius: 12px;
      max-width: 80px;
      margin-bottom: 12px;
    }

    .tradeai-typing.active {
      display: block;
    }

    .tradeai-typing-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #999;
      margin: 0 2px;
      animation: tradeai-typing 1.4s infinite;
    }

    .tradeai-typing-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .tradeai-typing-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes tradeai-typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-8px); }
    }

    .tradeai-input-area {
      padding: 12px;
      background: white;
      border-top: 1px solid #e5e5e5;
      display: flex;
      gap: 8px;
    }

    .tradeai-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
    }

    .tradeai-input:focus {
      outline: none;
      border-color: #1a5490;
    }

    .tradeai-send-btn {
      background: #1a5490;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 14px;
    }

    .tradeai-send-btn:hover {
      background: #144070;
    }

    .tradeai-send-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    @media (max-width: 480px) {
      .tradeai-chat-window {
        width: calc(100vw - 40px);
        height: calc(100vh - 120px);
        bottom: 70px;
      }
    }
  `;

  // Inject styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create widget HTML
  const widgetHTML = `
    <div class="tradeai-widget">
      <div class="tradeai-bubble" id="tradeai-bubble">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
      </div>

      <div class="tradeai-chat-window" id="tradeai-chat-window">
        <div class="tradeai-chat-header">
          <div class="tradeai-chat-title">Chat with us</div>
          <button class="tradeai-close-btn" id="tradeai-close-btn">×</button>
        </div>

        <div class="tradeai-messages" id="tradeai-messages">
          <!-- Messages will be added here -->
        </div>

        <div class="tradeai-typing" id="tradeai-typing">
          <span class="tradeai-typing-dot"></span>
          <span class="tradeai-typing-dot"></span>
          <span class="tradeai-typing-dot"></span>
        </div>

        <div class="tradeai-input-area">
          <input 
            type="text" 
            class="tradeai-input" 
            id="tradeai-input" 
            placeholder="Type your message..."
          />
          <button class="tradeai-send-btn" id="tradeai-send-btn">Send</button>
        </div>
      </div>
    </div>
  `;

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }

  function initWidget() {
    // Add widget to page
    const container = document.createElement('div');
    container.innerHTML = widgetHTML;
    document.body.appendChild(container.firstElementChild);

    // Get elements
    const bubble = document.getElementById('tradeai-bubble');
    const chatWindow = document.getElementById('tradeai-chat-window');
    const closeBtn = document.getElementById('tradeai-close-btn');
    const input = document.getElementById('tradeai-input');
    const sendBtn = document.getElementById('tradeai-send-btn');
    const messagesContainer = document.getElementById('tradeai-messages');
    const typingIndicator = document.getElementById('tradeai-typing');

    let conversationHistory = [];
    let greetingLoaded = false;

    // Toggle chat window
    bubble.addEventListener('click', () => {
      chatWindow.classList.add('open');
      if (!greetingLoaded) {
        loadGreeting();
        greetingLoaded = true;
      }
      input.focus();
    });

    closeBtn.addEventListener('click', () => {
      chatWindow.classList.remove('open');
    });

    // Send message on Enter
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    // Send message on button click
    sendBtn.addEventListener('click', sendMessage);

    // Load greeting from API
    async function loadGreeting() {
      try {
        const response = await fetch(`https://trade-ai-seven-blue.vercel.app/api/get-greeting?userId=${userId}`);
        const data = await response.json();
        
        console.log('Greeting API response:', data); // DEBUG
        
        if (data.success) {
          // Update chat header with business name
          if (data.businessName) {
            console.log('Setting business name:', data.businessName); // DEBUG
            const titleElement = document.querySelector('.tradeai-chat-title');
            console.log('Title element:', titleElement); // DEBUG
            if (titleElement) {
              titleElement.textContent = `Chat with ${data.businessName}`;
            }
          }
          
          // Add greeting message
          if (data.greeting) {
            addMessage(data.greeting, 'bot');
          } else {
            addMessage('👋 Hi! How can I help you today?', 'bot');
          }
        } else {
          addMessage('👋 Hi! How can I help you today?', 'bot');
        }
      } catch (error) {
        console.error('Error loading greeting:', error);
        addMessage('👋 Hi! How can I help you today?', 'bot');
      }
    }

    // Send message
    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;

      // Disable input
      input.disabled = true;
      sendBtn.disabled = true;

      // Add user message
      addMessage(message, 'user');
      input.value = '';

      // Show typing
      typingIndicator.classList.add('active');

      try {
        const response = await fetch('https://trade-ai-seven-blue.vercel.app/api/chatbot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: message,
            conversationHistory: conversationHistory,
            userId: userId
          })
        });

        const data = await response.json();

        typingIndicator.classList.remove('active');

        if (data.success) {
          addMessage(data.message, 'bot');
        if (data.trigger_appointment_picker && _chatbotSettings.appointment_booking_enabled) {
          renderAppointmentPicker(_chatbotSettings, messagesContainer, messages, userId);
        }
          conversationHistory = data.conversationHistory;
        } else {
          addMessage('Sorry, I encountered an error. Please try again.', 'bot');
        }

      } catch (error) {
        typingIndicator.classList.remove('active');
        addMessage('Sorry, I couldn\'t connect. Please try again.', 'bot');
        console.error('Error:', error);
      }

      // Re-enable input
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }

    // Add message to UI
    function addMessage(text, sender) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `tradeai-message ${sender}`;
      
      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'tradeai-message-bubble';
      bubbleDiv.textContent = text;
      
      messageDiv.appendChild(bubbleDiv);
      messagesContainer.appendChild(messageDiv);
      
      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function renderAppointmentPicker(settings, container, messages, userId) {
    var availability = settings.availability || {};
    var timeLabels = settings.time_labels || ['Morning', 'Afternoon', 'Evening'];
    var dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    var today = new Date();
    var days = [];
    for (var i = 1; i <= 14; i++) {
      var d = new Date(today);
      d.setDate(today.getDate() + i);
      var dayKey = dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1];
      var availableSlots = availability[dayKey] || [];
      days.push({ date: d, dayKey: dayKey, availableSlots: availableSlots });
    }
    var picker = document.createElement('div');
    picker.style.cssText = 'background:#f0f7ff;border-radius:10px;padding:12px;margin:8px 0;';
    var title = document.createElement('div');
    title.style.cssText = 'font-weight:700;font-size:13px;color:#1A5490;margin-bottom:10px;';
    title.textContent = 'Select your preferred times (up to 4)';
    picker.appendChild(title);
    var grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;';
    var selectedSlots = [];
    days.forEach(function(day) {
      var dateStr = day.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      var fullDay = day.date.toLocaleDateString('en-AU', { weekday: 'long' });
      var fullDate = day.date.toISOString().split('T')[0];
      var isAvailable = day.availableSlots.length > 0;
      var dayEl = document.createElement('div');
      dayEl.style.cssText = isAvailable ? 'background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:6px 8px;min-width:80px;' : 'background:#f0f0f0;border-radius:8px;padding:6px 8px;min-width:80px;opacity:0.4;';
      var dateLabel = document.createElement('div');
      dateLabel.style.cssText = 'font-size:11px;font-weight:700;color:#333;margin-bottom:4px;';
      dateLabel.textContent = dateStr;
      dayEl.appendChild(dateLabel);
      if (isAvailable) {
        day.availableSlots.forEach(function(idx) {
          var slotBtn = document.createElement('button');
          slotBtn.textContent = timeLabels[idx] || ('Slot ' + (idx + 1));
          slotBtn.style.cssText = 'display:block;width:100%;background:#e3f2fd;color:#1565c0;border:none;border-radius:4px;font-size:11px;font-weight:600;padding:3px 6px;margin-top:3px;cursor:pointer;';
          slotBtn.dataset.date = fullDate;
          slotBtn.dataset.day = fullDay;
          slotBtn.dataset.slot = timeLabels[idx] || ('Slot ' + (idx + 1));
          slotBtn.addEventListener('click', function() {
            if (slotBtn.dataset.selected === 'true') {
              slotBtn.dataset.selected = 'false';
              slotBtn.style.background = '#e3f2fd';
              slotBtn.style.color = '#1565c0';
              var i = selectedSlots.findIndex(function(s) { return s.date === slotBtn.dataset.date && s.slot === slotBtn.dataset.slot; });
              if (i > -1) selectedSlots.splice(i, 1);
            } else if (selectedSlots.length < 4) {
              slotBtn.dataset.selected = 'true';
              slotBtn.style.background = '#1A5490';
              slotBtn.style.color = '#fff';
              selectedSlots.push({ date: slotBtn.dataset.date, day: slotBtn.dataset.day, slot: slotBtn.dataset.slot });
            }
            updateSummary();
          });
          dayEl.appendChild(slotBtn);
        });
      }
      grid.appendChild(dayEl);
    });
    picker.appendChild(grid);
    var summary = document.createElement('div');
    summary.style.cssText = 'font-size:12px;color:#888;margin-bottom:8px;';
    summary.textContent = 'No times selected yet';
    picker.appendChild(summary);
    function updateSummary() {
      summary.textContent = selectedSlots.length === 0 ? 'No times selected yet' : 'Selected: ' + selectedSlots.map(function(s) { return s.day + ' ' + s.date + ' (' + s.slot + ')'; }).join(', ');
    }
    var confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Confirm Preferred Times';
    confirmBtn.style.cssText = 'background:#C4622A;color:#fff;font-weight:700;font-size:13px;padding:8px 16px;border:none;border-radius:6px;cursor:pointer;width:100%;';
    confirmBtn.addEventListener('click', function() {
      if (selectedSlots.length === 0) return;
      picker.remove();
      var summaryText = 'Preferred times: ' + selectedSlots.map(function(s) { return s.day + ' ' + s.date + ' (' + s.slot + ')'; }).join(', ');
      messages.push({ role: 'user', content: summaryText });
      messages.push({ role: 'system_slots', content: JSON.stringify(selectedSlots) });
      addMessage(summaryText, 'user');
      addMessage('Thank you \u2014 we will be in touch to confirm the best time.', 'bot');
    });
    picker.appendChild(confirmBtn);
    container.appendChild(picker);
    container.scrollTop = container.scrollHeight;
  }
})();
