// chatbot-logic.js — AI Website Chatbot logic file
// Defines window.CHAT_LOGIC with init() method
// Per Chatbot Rebuild Spec v1.1 Section 10c

window.CHAT_LOGIC = {

  _user: null,
  _session: null,
  _messages: [],
  _activeFilter: "all",
  _conversations: [],
  _settings: null,

  init: async function () {
    // Auth check
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      window.location.href = "login.html";
      return;
    }
    this._user = session.user;
    this._session = session;

    // Populate account dropdown
    const emailPrefix = this._user.email ? this._user.email.split("@")[0] : "";
    const elShort = document.getElementById("account-email-short");
    const elFull = document.getElementById("account-dropdown-email");
    if (elShort) elShort.textContent = emailPrefix;
    if (elFull) elFull.textContent = this._user.email || "";

    // Sign out
    const signOutBtn = document.getElementById("sign-out-btn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = "login.html";
      });
    }

    // Account dropdown toggle
    const accountBtn = document.getElementById("account-btn");
    const accountDropdown = document.getElementById("account-dropdown");
    if (accountBtn && accountDropdown) {
      accountBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        accountDropdown.classList.toggle("open");
      });
      document.addEventListener("click", () => accountDropdown.classList.remove("open"));
    }

    // Load settings for FAQ badge and test widget
    await this.loadSettings();

    // Load conversations
    await this.loadConversations();

    // Load unanswered questions
    await this.loadUnansweredQuestions();

    // Wire filter tabs
    this.wireFilterTabs();

    // Wire test widget
    this.initTestWidget();

    // Update FAQ badge
    await this.updateFaqBadge();
  },

  loadSettings: async function () {
    try {
      const { data } = await window.supabaseClient
        .from("chatbot_settings")
        .select("*")
        .eq("user_id", this._user.id)
        .single();
      this._settings = data || {};
    } catch (e) {
      this._settings = {};
    }
  },

  loadConversations: async function () {
    try {
      const { data } = await window.supabaseClient
        .from("chatbot_conversations")
        .select("*")
        .eq("user_id", this._user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      this._conversations = data || [];
    } catch (e) {
      this._conversations = [];
    }
    this.renderConversations();
  },

  getFilteredConversations: function () {
    if (this._activeFilter === "leads") {
      return this._conversations.filter(c => c.is_lead === true);
    }
    if (this._activeFilter === "appointments") {
      return this._conversations.filter(c => c.appointment_requested === true);
    }
    return this._conversations;
  },

  renderConversations: function () {
    const list = document.getElementById("conversation-list");
    if (!list) return;

    const items = this.getFilteredConversations();

    if (items.length === 0) {
      list.innerHTML = "<div class=\"conv-empty\">No conversations yet. Customer conversations from your live widget will appear here.</div>";
      return;
    }

    list.innerHTML = items.map(c => this.renderConversationCard(c)).join("");

    // Wire expand/collapse
    list.querySelectorAll(".conv-card").forEach(card => {
      card.addEventListener("click", () => {
        const id = card.dataset.id;
        const transcript = card.querySelector(".conv-transcript");
        if (transcript) transcript.classList.toggle("open");
      });
    });
  },

  renderConversationCard: function (c) {
    const date = c.started_at ? new Date(c.started_at) : new Date(c.created_at);
    const dateStr = date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    const timeStr = date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

    let duration = "";
    if (c.started_at && c.ended_at) {
      const mins = Math.round((new Date(c.ended_at) - new Date(c.started_at)) / 60000);
      duration = mins > 0 ? mins + " min" : "Less than 1 min";
    }

    const statusBadge = c.status === "completed"
      ? "<span class=\"conv-badge badge-completed\">Completed</span>"
      : "<span class=\"conv-badge badge-abandoned\">Abandoned</span>";

    const leadBadge = c.is_lead
      ? "<span class=\"conv-badge badge-lead\">Lead</span>"
      : "";

    const apptBadge = c.appointment_requested
      ? "<span class=\"conv-badge badge-appt\">Appointment</span>"
      : "";

    const transcript = c.transcript || [];
    const firstMsg = transcript.find(m => m.role === "user");
    const preview = firstMsg
      ? (firstMsg.content.length > 80 ? firstMsg.content.substring(0, 80) + "..." : firstMsg.content)
      : "No messages";

    let leadDetails = "";
    if (c.is_lead) {
      leadDetails = "<div class=\"conv-lead-details\">";
      if (c.lead_name) leadDetails += "<span>" + c.lead_name + "</span>";
      if (c.lead_email) leadDetails += "<a href=\"mailto:" + c.lead_email + "\">" + c.lead_email + "</a>";
      if (c.lead_phone) leadDetails += "<a href=\"tel:" + c.lead_phone + "\">" + c.lead_phone + "</a>";
      leadDetails += "</div>";
    }

    let slotDetails = "";
    if (c.appointment_requested && c.preferred_slots && c.preferred_slots.length > 0) {
      slotDetails = "<div class=\"conv-slots\"><strong>Preferred slots:</strong><ul>" +
        c.preferred_slots.map(s => "<li>" + s.day + " " + s.date + " — " + s.slot + "</li>").join("") +
        "</ul></div>";
    }

    const transcriptHtml = transcript.map(m => {
      const roleLabel = m.role === "user" ? "Customer" : "Assistant";
      return "<div class=\"transcript-msg transcript-" + m.role + "\"><strong>" + roleLabel + ":</strong> " + this.escapeHtml(m.content || "") + "</div>";
    }).join("");

    return `<div class="conv-card" data-id="${c.id}">
      <div class="conv-card-header">
        <div class="conv-meta">
          <span class="conv-date">${dateStr} ${timeStr}</span>
          ${duration ? "<span class=\"conv-duration\">" + duration + "</span>" : ""}
        </div>
        <div class="conv-badges">${statusBadge}${leadBadge}${apptBadge}</div>
      </div>
      <div class="conv-preview">${this.escapeHtml(preview)}</div>
      ${leadDetails}
      ${slotDetails}
      <div class="conv-transcript">
        <div class="transcript-inner">${transcriptHtml || "<em>No transcript available</em>"}</div>
      </div>
    </div>`;
  },

  escapeHtml: function (str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  wireFilterTabs: function () {
    const tabs = document.querySelectorAll(".filter-tab");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        this._activeFilter = tab.dataset.filter;
        this.renderConversations();
      });
    });
  },

  loadUnansweredQuestions: async function () {
    try {
      const { data } = await window.supabaseClient
        .from("chatbot_conversations")
        .select("unanswered_questions")
        .eq("user_id", this._user.id)
        .not("unanswered_questions", "is", null);

      const allQuestions = [];
      (data || []).forEach(row => {
        if (Array.isArray(row.unanswered_questions)) {
          allQuestions.push(...row.unanswered_questions);
        }
      });

      const container = document.getElementById("unanswered-questions");
      const badge = document.getElementById("unanswered-badge");
      if (badge) badge.textContent = allQuestions.length;

      if (!container) return;

      if (allQuestions.length === 0) {
        container.innerHTML = "<p class=\"unanswered-empty\">No unanswered questions — your knowledge base is covering customer enquiries well.</p>";
        return;
      }

      container.innerHTML = allQuestions.slice(0, 10).map(q =>
        "<div class=\"unanswered-item\"><span>" + this.escapeHtml(q) + "</span><a href=\"chatbot-settings.html\" class=\"btn-answer\">Add to knowledge base</a></div>"
      ).join("");
    } catch (e) {
      // non-fatal
    }
  },

  updateFaqBadge: async function () {
    try {
      const { count } = await window.supabaseClient
        .from("chatbot_faqs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", this._user.id)
        .eq("status", "pending");

      const badge = document.getElementById("faq-badge");
      if (badge) {
        badge.textContent = count || 0;
        badge.style.display = count > 0 ? "inline-flex" : "none";
      }
    } catch (e) {
      // non-fatal
    }
  },

  initTestWidget: function () {
    this._messages = [];
    const input = document.getElementById("test-input");
    const sendBtn = document.getElementById("test-send");
    const clearBtn = document.getElementById("test-clear");
    const chatLog = document.getElementById("test-chat-log");

    if (!input || !sendBtn || !chatLog) return;

    if (this._settings && this._settings.greeting_message) {
      this.appendTestMessage("assistant", this._settings.greeting_message, chatLog);
      this._messages.push({ role: "assistant", content: this._settings.greeting_message });
    }

    sendBtn.addEventListener("click", () => this.sendTestMessage(input, chatLog));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendTestMessage(input, chatLog);
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        this._messages = [];
        chatLog.innerHTML = "";
        if (this._settings && this._settings.greeting_message) {
          this.appendTestMessage("assistant", this._settings.greeting_message, chatLog);
          this._messages.push({ role: "assistant", content: this._settings.greeting_message });
        }
      });
    }
  },

  sendTestMessage: async function (input, chatLog) {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    this._messages.push({ role: "user", content: text });
    this.appendTestMessage("user", text, chatLog);

    const thinking = document.createElement("div");
    thinking.className = "test-msg test-msg-assistant test-thinking";
    thinking.textContent = "Thinking...";
    chatLog.appendChild(thinking);
    chatLog.scrollTop = chatLog.scrollHeight;

    try {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      const resp = await fetch("/api/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({
          messages: this._messages.filter(m => m.role === "user" || m.role === "assistant"),
          session_id: "test_" + Date.now()
        })
      });

      const data = await resp.json();
      thinking.remove();

      if (data.reply) {
        this._messages.push({ role: "assistant", content: data.reply });
        this.appendTestMessage("assistant", data.reply, chatLog);

        if (data.trigger_appointment_picker && this._settings && this._settings.appointment_booking_enabled) {
          this.renderAppointmentPicker(chatLog);
        }
      } else {
        this.appendTestMessage("assistant", "Something went wrong. Please try again.", chatLog);
      }
    } catch (e) {
      thinking.remove();
      this.appendTestMessage("assistant", "Something went wrong. Please try again.", chatLog);
    }
  },

  appendTestMessage: function (role, text, chatLog) {
    const div = document.createElement("div");
    div.className = "test-msg test-msg-" + role;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  },

  renderAppointmentPicker: function (chatLog) {
    if (!this._settings) return;
    const availability = this._settings.availability || {};
    const timeLabels = this._settings.time_labels || ["Morning", "Afternoon", "Evening"];

    const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const today = new Date();

    const days = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayKey = dayNames[d.getDay() === 0 ? 6 : d.getDay() - 1];
      const availableSlots = availability[dayKey] || [];
      days.push({ date: d, dayKey, availableSlots });
    }

    const pickerEl = document.createElement("div");
    pickerEl.className = "appt-picker";
    pickerEl.innerHTML = "<div class=\"appt-picker-title\">Select your preferred times (up to 4)</div>" +
      "<div class=\"appt-calendar\">" +
      days.map(day => {
        const dateStr = day.date.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
        const fullDay = day.date.toLocaleDateString("en-AU", { weekday: "long" });
        const fullDate = day.date.toISOString().split("T")[0];
        const isAvailable = day.availableSlots.length > 0;

        if (!isAvailable) {
          return "<div class=\"appt-day unavailable\"><span class=\"appt-date\">" + dateStr + "</span></div>";
        }

        const slots = day.availableSlots.map(idx =>
          "<button class=\"appt-slot\" data-date=\"" + fullDate + "\" data-day=\"" + fullDay + "\" data-slot=\"" + timeLabels[idx] + "\">" + timeLabels[idx] + "</button>"
        ).join("");

        return "<div class=\"appt-day available\"><span class=\"appt-date\">" + dateStr + "</span><div class=\"appt-slots\">" + slots + "</div></div>";
      }).join("") +
      "</div>" +
      "<div class=\"appt-selected\" id=\"appt-selected-list\"><em>No slots selected yet</em></div>" +
      "<button class=\"appt-confirm\" id=\"appt-confirm-btn\">Confirm Preferred Times</button>";

    chatLog.appendChild(pickerEl);
    chatLog.scrollTop = chatLog.scrollHeight;

    const selectedSlots = [];
    pickerEl.querySelectorAll(".appt-slot").forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("selected")) {
          btn.classList.remove("selected");
          const idx = selectedSlots.findIndex(s => s.date === btn.dataset.date && s.slot === btn.dataset.slot);
          if (idx > -1) selectedSlots.splice(idx, 1);
        } else if (selectedSlots.length < 4) {
          btn.classList.add("selected");
          selectedSlots.push({ date: btn.dataset.date, day: btn.dataset.day, slot: btn.dataset.slot });
        }
        const listEl = document.getElementById("appt-selected-list");
        if (listEl) {
          listEl.innerHTML = selectedSlots.length > 0
            ? selectedSlots.map(s => "<span class=\"appt-slot-tag\">" + s.day + " " + s.date + " — " + s.slot + "</span>").join("")
            : "<em>No slots selected yet</em>";
        }
      });
    });

    const confirmBtn = document.getElementById("appt-confirm-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        if (selectedSlots.length === 0) return;
        pickerEl.remove();
        const summary = "Preferred times: " + selectedSlots.map(s => s.day + " " + s.date + " (" + s.slot + ")").join(", ");
        this.appendTestMessage("user", summary, chatLog);
        this._messages.push({ role: "system_slots", content: JSON.stringify(selectedSlots) });
        this.appendTestMessage("assistant", "Thank you — we will be in touch to confirm the best time.", chatLog);
      });
    }
  }
};

// Initialise on DOM ready
document.addEventListener("DOMContentLoaded", () => window.CHAT_LOGIC.init());