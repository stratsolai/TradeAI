// chatbot-settings-logic.js — AI Website Chatbot Settings logic file
// Defines window.CHAT_SETTINGS_LOGIC with init() method
// Per Chatbot Rebuild Spec v1.1 Section 10d

window.CHAT_SETTINGS_LOGIC = {

  _user: null,
  _settings: {},
  _knowledge: [],
  _faqs: [],

  init: async function () {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }
    this._user = session.user;

    const emailPrefix = this._user.email ? this._user.email.split("@")[0] : "";
    const elShort = document.getElementById("account-email-short");
    const elFull = document.getElementById("account-dropdown-email");
    if (elShort) elShort.textContent = emailPrefix;
    if (elFull) elFull.textContent = this._user.email || "";

    const signOutBtn = document.getElementById("sign-out-btn");
    if (signOutBtn) {
      signOutBtn.addEventListener("click", async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = "/login";
      });
    }

    const accountBtn = document.getElementById("account-btn");
    const accountDropdown = document.getElementById("account-dropdown");
    if (accountBtn && accountDropdown) {
      accountBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        accountDropdown.classList.toggle("open");
      });
      document.addEventListener("click", () => accountDropdown.classList.remove("open"));
    }

    await Promise.all([
      this.loadSettings(),
      this.loadKnowledge(),
      this.loadFaqs()
    ]);

    this.renderBusinessInfo();
    this.renderSettingsForm();
    this.renderKnowledge();
    this.renderFaqs();
    this.renderAppointmentSettings();
    this.renderWidgetConfig();
    this.renderDesignVizToggle();
    this.wireSettingsTabs();
    this.wireSaveButtons();
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

  loadKnowledge: async function () {
    try {
      const { data } = await window.supabaseClient
        .from("chatbot_knowledge")
        .select("*")
        .eq("user_id", this._user.id)
        .order("created_at", { ascending: false });
      this._knowledge = data || [];
    } catch (e) {
      this._knowledge = [];
    }
  },

  loadFaqs: async function () {
    try {
      const { data } = await window.supabaseClient
        .from("chatbot_faqs")
        .select("*")
        .eq("user_id", this._user.id)
        .order("created_at", { ascending: false });
      this._faqs = data || [];
    } catch (e) {
      this._faqs = [];
    }
  },

  renderBusinessInfo: function () {
    window.supabaseClient
      .from("profiles")
      .select("business_name, industry, location")
      .eq("user_id", this._user.id)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const el = document.getElementById("biz-name");
        if (el && !el.value) el.value = data.business_name || "";
        const loc = document.getElementById("biz-location");
        if (loc && !loc.value) loc.value = data.location || "";
        const ind = document.getElementById("biz-industry");
        if (ind && !ind.value) ind.value = data.industry || "";
      });
  },

  renderSettingsForm: function () {
    const greeting = document.getElementById("greeting-message");
    if (greeting) greeting.value = this._settings.greeting_message || "";
    const title = document.getElementById("widget-title");
    if (title) title.value = this._settings.widget_title || "";
  },

  renderKnowledge: function () {
    const container = document.getElementById("knowledge-list");
    if (!container) return;
    if (this._knowledge.length === 0) {
      container.innerHTML = "<p class=\"empty-state\">No knowledge items yet. Add your first item below.</p>";
      return;
    }
    container.innerHTML = this._knowledge.map(k => this.renderKnowledgeItem(k)).join("");
    this.wireKnowledgeActions();
  },

  renderKnowledgeItem: function (k) {
    const categoryLabels = { services: "Services", pricing: "Pricing Guide", process: "Process & Timelines", areas: "Service Areas", business: "Business Details", custom_qa: "Custom Q&A" };
    const catLabel = categoryLabels[k.category] || k.category;
    const statusClass = "status-" + k.status;
    const statusLabel = k.status.charAt(0).toUpperCase() + k.status.slice(1);
    const sourceLabel = k.source === "cl" ? "From Content Library" : "Manually added";
    const dataPreview = k.structured_data ? JSON.stringify(k.structured_data).substring(0, 120) + (JSON.stringify(k.structured_data).length > 120 ? "..." : "") : "No data";
    return "<div class=\"knowledge-item\" data-id=\"" + k.id + "\">" +
      "<div class=\"item-header\"><div class=\"item-meta\">" +
      "<span class=\"cat-badge cat-" + k.category + "\">" + catLabel + "</span>" +
      "<span class=\"item-title\">" + this.escapeHtml(k.title) + "</span>" +
      "<span class=\"source-label\">" + sourceLabel + "</span></div>" +
      "<div class=\"item-actions\"><span class=\"status-badge " + statusClass + "\">" + statusLabel + "</span>" +
      (k.status === "pending" ? "<button class=\"btn-approve\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Approve</button>" : "") +
      (k.status !== "rejected" ? "<button class=\"btn-reject\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Reject</button>" : "") +
      "<button class=\"btn-edit-item\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Edit</button>" +
      "<button class=\"btn-delete-item\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Delete</button></div></div>" +
      "<div class=\"item-data-preview\">" + this.escapeHtml(dataPreview) + "</div>" +
      "<div class=\"item-edit-form\" id=\"knowledge-edit-" + k.id + "\" style=\"display:none;\">" +
      "<textarea class=\"edit-textarea\" id=\"knowledge-data-" + k.id + "\" rows=\"5\">" + this.escapeHtml(JSON.stringify(k.structured_data || {}, null, 2)) + "</textarea>" +
      "<div class=\"edit-actions\"><button class=\"btn-save-edit\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Save</button>" +
      "<button class=\"btn-cancel-edit\" data-id=\"" + k.id + "\" data-type=\"knowledge\">Cancel</button></div></div></div>";
  },

  wireKnowledgeActions: function () {
    document.querySelectorAll(".btn-approve[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => this.updateKnowledgeStatus(btn.dataset.id, "approved"));
    });
    document.querySelectorAll(".btn-reject[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => this.updateKnowledgeStatus(btn.dataset.id, "rejected"));
    });
    document.querySelectorAll(".btn-edit-item[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => {
        const form = document.getElementById("knowledge-edit-" + btn.dataset.id);
        if (form) form.style.display = form.style.display === "none" ? "block" : "none";
      });
    });
    document.querySelectorAll(".btn-cancel-edit[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => {
        const form = document.getElementById("knowledge-edit-" + btn.dataset.id);
        if (form) form.style.display = "none";
      });
    });
    document.querySelectorAll(".btn-save-edit[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => this.saveKnowledgeEdit(btn.dataset.id));
    });
    document.querySelectorAll(".btn-delete-item[data-type=knowledge]").forEach(btn => {
      btn.addEventListener("click", () => this.deleteKnowledgeItem(btn.dataset.id));
    });
  },

  updateKnowledgeStatus: async function (id, status) {
    await window.supabaseClient.from("chatbot_knowledge").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", this._user.id);
    await this.loadKnowledge();
    this.renderKnowledge();
  },

  saveKnowledgeEdit: async function (id) {
    const textarea = document.getElementById("knowledge-data-" + id);
    if (!textarea) return;
    let structured_data;
    try { structured_data = JSON.parse(textarea.value); } catch (e) { alert("Invalid JSON — please check your data format."); return; }
    await window.supabaseClient.from("chatbot_knowledge").update({ structured_data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", this._user.id);
    await this.loadKnowledge();
    this.renderKnowledge();
  },

  deleteKnowledgeItem: async function (id) {
    if (!confirm("Delete this knowledge item? This cannot be undone.")) return;
    await window.supabaseClient.from("chatbot_knowledge").delete().eq("id", id).eq("user_id", this._user.id);
    await this.loadKnowledge();
    this.renderKnowledge();
  },

  addKnowledgeItem: async function () {
    const category = document.getElementById("new-knowledge-category")?.value;
    const title = document.getElementById("new-knowledge-title")?.value.trim();
    const dataRaw = document.getElementById("new-knowledge-data")?.value.trim();
    if (!category || !title || !dataRaw) { this.showMsg("knowledge-msg", "Please fill in all fields.", "error"); return; }
    let structured_data;
    try { structured_data = JSON.parse(dataRaw); } catch (e) { structured_data = { content: dataRaw }; }
    const { error } = await window.supabaseClient.from("chatbot_knowledge").insert({ user_id: this._user.id, category, title, structured_data, source: "manual", status: "pending", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) { this.showMsg("knowledge-msg", "Could not save item. Please try again.", "error"); return; }
    document.getElementById("new-knowledge-title").value = "";
    document.getElementById("new-knowledge-data").value = "";
    this.showMsg("knowledge-msg", "Item added — review and approve it below.", "success");
    await this.loadKnowledge();
    this.renderKnowledge();
  },

  renderFaqs: function () {
    const container = document.getElementById("faq-list");
    if (!container) return;
    if (this._faqs.length === 0) {
      container.innerHTML = "<p class=\"empty-state\">No FAQ suggestions yet. Unanswered questions from customer conversations will appear here.</p>";
      return;
    }
    container.innerHTML = this._faqs.map(f => this.renderFaqItem(f)).join("");
    this.wireFaqActions();
  },

  renderFaqItem: function (f) {
    const statusClass = "status-" + f.status;
    const statusLabel = f.status.charAt(0).toUpperCase() + f.status.slice(1);
    const sourceLabel = f.source === "conversation" ? "From conversation" : f.source === "cl" ? "From Content Library" : "Manually added";
    return "<div class=\"faq-item\" data-id=\"" + f.id + "\">" +
      "<div class=\"item-header\"><div class=\"item-meta\"><span class=\"source-label\">" + sourceLabel + "</span></div>" +
      "<div class=\"item-actions\"><span class=\"status-badge " + statusClass + "\">" + statusLabel + "</span>" +
      (f.status === "pending" ? "<button class=\"btn-approve\" data-id=\"" + f.id + "\" data-type=\"faq\">Approve</button>" : "") +
      (f.status !== "rejected" ? "<button class=\"btn-reject\" data-id=\"" + f.id + "\" data-type=\"faq\">Reject</button>" : "") +
      "<button class=\"btn-delete-item\" data-id=\"" + f.id + "\" data-type=\"faq\">Delete</button></div></div>" +
      "<div class=\"faq-question\"><strong>Q:</strong> " + this.escapeHtml(f.question) + "</div>" +
      "<div class=\"faq-answer-wrap\"><strong>A:</strong>" +
      "<textarea class=\"faq-answer-input\" id=\"faq-answer-" + f.id + "\" rows=\"3\">" + this.escapeHtml(f.answer) + "</textarea></div></div>";
  },

  wireFaqActions: function () {
    document.querySelectorAll(".btn-approve[data-type=faq]").forEach(btn => {
      btn.addEventListener("click", () => this.saveFaqAndApprove(btn.dataset.id));
    });
    document.querySelectorAll(".btn-reject[data-type=faq]").forEach(btn => {
      btn.addEventListener("click", () => this.updateFaqStatus(btn.dataset.id, "rejected"));
    });
    document.querySelectorAll(".btn-delete-item[data-type=faq]").forEach(btn => {
      btn.addEventListener("click", () => this.deleteFaqItem(btn.dataset.id));
    });
  },

  saveFaqAndApprove: async function (id) {
    const textarea = document.getElementById("faq-answer-" + id);
    const answer = textarea ? textarea.value.trim() : "";
    if (!answer) { this.showMsg("faq-msg", "Please enter an answer before approving.", "error"); return; }
    await window.supabaseClient.from("chatbot_faqs").update({ answer, status: "approved", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", this._user.id);
    await this.loadFaqs();
    this.renderFaqs();
  },

  updateFaqStatus: async function (id, status) {
    await window.supabaseClient.from("chatbot_faqs").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", this._user.id);
    await this.loadFaqs();
    this.renderFaqs();
  },

  deleteFaqItem: async function (id) {
    if (!confirm("Delete this FAQ? This cannot be undone.")) return;
    await window.supabaseClient.from("chatbot_faqs").delete().eq("id", id).eq("user_id", this._user.id);
    await this.loadFaqs();
    this.renderFaqs();
  },

  addFaqItem: async function () {
    const question = document.getElementById("new-faq-question")?.value.trim();
    const answer = document.getElementById("new-faq-answer")?.value.trim();
    if (!question || !answer) { this.showMsg("faq-msg", "Please enter both a question and answer.", "error"); return; }
    const { error } = await window.supabaseClient.from("chatbot_faqs").insert({ user_id: this._user.id, question, answer, source: "manual", status: "approved", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) { this.showMsg("faq-msg", "Could not save FAQ. Please try again.", "error"); return; }
    document.getElementById("new-faq-question").value = "";
    document.getElementById("new-faq-answer").value = "";
    this.showMsg("faq-msg", "FAQ added and approved.", "success");
    await this.loadFaqs();
    this.renderFaqs();
  },

  renderAppointmentSettings: function () {
    const toggle = document.getElementById("appt-toggle");
    if (toggle) {
      toggle.checked = !!this._settings.appointment_booking_enabled;
      toggle.addEventListener("change", () => {
        const grid = document.getElementById("appt-config");
        if (grid) grid.style.display = toggle.checked ? "block" : "none";
      });
      const grid = document.getElementById("appt-config");
      if (grid) grid.style.display = this._settings.appointment_booking_enabled ? "block" : "none";
    }
    const labels = this._settings.time_labels || ["Morning", "Afternoon", "Evening"];
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById("time-label-" + i);
      if (el) el.value = labels[i] || "";
    }
    const availability = this._settings.availability || {};
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    days.forEach(day => {
      const dayToggle = document.getElementById("avail-" + day);
      const slotsRow = document.getElementById("avail-slots-" + day);
      const daySlots = availability[day] || [];
      if (dayToggle) {
        dayToggle.checked = daySlots.length > 0;
        if (slotsRow) slotsRow.style.display = daySlots.length > 0 ? "flex" : "none";
        dayToggle.addEventListener("change", () => {
          if (slotsRow) slotsRow.style.display = dayToggle.checked ? "flex" : "none";
        });
      }
      for (let i = 0; i < 3; i++) {
        const slotCheck = document.getElementById("slot-" + day + "-" + i);
        if (slotCheck) slotCheck.checked = daySlots.includes(i);
      }
    });
  },

  renderWidgetConfig: function () {
    const embedCode = document.getElementById("embed-code");
    if (embedCode) {
      const userId = this._user.id;
      embedCode.value = "<script src=\"https://trade-ai-seven-blue.vercel.app/widget.js\" data-user=\"" + userId + "\"><\/script>";
    }
    const copyBtn = document.getElementById("copy-embed");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const el = document.getElementById("embed-code");
        if (el) { el.select(); document.execCommand("copy"); copyBtn.textContent = "Copied"; setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000); }
      });
    }
  },

  renderDesignVizToggle: function () {
    const select = document.getElementById("design-viz-mode");
    if (!select) return;
    select.value = this._settings.design_viz_mode || "off";
    window.supabaseClient.from("profiles").select("activated_tools").eq("user_id", this._user.id).single().then(({ data }) => {
      const tools = data?.activated_tools || [];
      const isActive = Array.isArray(tools) && tools.includes("design-viz");
      const note = document.getElementById("design-viz-note");
      if (!isActive) { select.disabled = true; if (note) note.style.display = "block"; }
      else { select.disabled = false; if (note) note.style.display = "none"; }
    });
  },

  wireSettingsTabs: function () {
    const tabs = document.querySelectorAll(".settings-tab");
    const panels = document.querySelectorAll(".tab-panel");
    tabs.forEach(function(tab) {
      tab.addEventListener("click", function() {
        tabs.forEach(function(t) { t.classList.remove("active"); });
        panels.forEach(function(p) { p.classList.remove("active"); });
        tab.classList.add("active");
        const panelId = "tab-" + tab.dataset.tab;
        const panel = document.getElementById(panelId);
        if (panel) panel.classList.add("active");
      });
    });
    // Handle hash navigation e.g. chatbot-settings.html#faq
    const hash = window.location.hash.replace("#", "");
    if (hash) {
      const target = document.querySelector(".settings-tab[data-tab='" + hash + "']");
      if (target) target.click();
    }
  },

    wireSaveButtons: function () {
    const saveWidget = document.getElementById("save-widget-settings");
    if (saveWidget) saveWidget.addEventListener("click", () => this.saveWidgetSettings());
    const saveAppt = document.getElementById("save-appt-settings");
    if (saveAppt) saveAppt.addEventListener("click", () => this.saveAppointmentSettings());
    const saveViz = document.getElementById("save-design-viz");
    if (saveViz) saveViz.addEventListener("click", () => this.saveDesignVizMode());
    const addKnowledge = document.getElementById("add-knowledge-btn");
    if (addKnowledge) addKnowledge.addEventListener("click", () => this.addKnowledgeItem());
    const addFaq = document.getElementById("add-faq-btn");
    if (addFaq) addFaq.addEventListener("click", () => this.addFaqItem());
  },

  saveWidgetSettings: async function () {
    const greeting = document.getElementById("greeting-message")?.value.trim() || null;
    const widgetTitle = document.getElementById("widget-title")?.value.trim() || null;
    const existing = this._settings.id;
    const payload = { user_id: this._user.id, greeting_message: greeting, widget_title: widgetTitle, updated_at: new Date().toISOString() };
    let error;
    if (existing) { ({ error } = await window.supabaseClient.from("chatbot_settings").update(payload).eq("id", existing)); }
    else { ({ error } = await window.supabaseClient.from("chatbot_settings").insert({ ...payload, created_at: new Date().toISOString() })); }
    if (error) { this.showMsg("widget-settings-msg", "Could not save settings. Please try again.", "error"); }
    else { this.showMsg("widget-settings-msg", "Settings saved.", "success"); await this.loadSettings(); }
  },

  saveAppointmentSettings: async function () {
    const enabled = document.getElementById("appt-toggle")?.checked || false;
    const timeLabels = [
      document.getElementById("time-label-0")?.value.trim() || "Morning",
      document.getElementById("time-label-1")?.value.trim() || "Afternoon",
      document.getElementById("time-label-2")?.value.trim() || "Evening"
    ];
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const availability = {};
    days.forEach(day => {
      const dayToggle = document.getElementById("avail-" + day);
      if (dayToggle && dayToggle.checked) {
        const slots = [];
        for (let i = 0; i < 3; i++) {
          const slotCheck = document.getElementById("slot-" + day + "-" + i);
          if (slotCheck && slotCheck.checked) slots.push(i);
        }
        if (slots.length > 0) availability[day] = slots;
      }
    });
    const existing = this._settings.id;
    const payload = { user_id: this._user.id, appointment_booking_enabled: enabled, time_labels: timeLabels, availability, updated_at: new Date().toISOString() };
    let error;
    if (existing) { ({ error } = await window.supabaseClient.from("chatbot_settings").update(payload).eq("id", existing)); }
    else { ({ error } = await window.supabaseClient.from("chatbot_settings").insert({ ...payload, created_at: new Date().toISOString() })); }
    if (error) { this.showMsg("appt-msg", "Could not save appointment settings. Please try again.", "error"); }
    else { this.showMsg("appt-msg", "Appointment settings saved.", "success"); await this.loadSettings(); }
  },

  saveDesignVizMode: async function () {
    const mode = document.getElementById("design-viz-mode")?.value || "off";
    const existing = this._settings.id;
    const payload = { user_id: this._user.id, design_viz_mode: mode, updated_at: new Date().toISOString() };
    let error;
    if (existing) { ({ error } = await window.supabaseClient.from("chatbot_settings").update(payload).eq("id", existing)); }
    else { ({ error } = await window.supabaseClient.from("chatbot_settings").insert({ ...payload, created_at: new Date().toISOString() })); }
    if (error) { this.showMsg("design-viz-msg", "Could not save setting. Please try again.", "error"); }
    else { this.showMsg("design-viz-msg", "Setting saved.", "success"); await this.loadSettings(); }
  },

  showMsg: function (id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = "settings-msg " + type;
    el.style.display = "block";
    setTimeout(() => { el.style.display = "none"; }, 4000);
  },

  escapeHtml: function (str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
};

document.addEventListener("DOMContentLoaded", () => window.CHAT_SETTINGS_LOGIC.init());
