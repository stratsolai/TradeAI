(function () {
  "use strict";

  window.ND_LOGIC = {

    _profile: null,
    _settings: null,
    _items: [],
    _activeTab: "summary",

    // ── INIT ────────────────────────────────────────────────────────────────

    async init() {
      if (!window._supabase) {
        console.error("ND_LOGIC: supabase client not ready");
        return;
      }
      const { data: { session } } = await window._supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login.html";
        return;
      }
      this._session = session;
      this._userId = session.user.id;
      this._token = session.access_token;

      await this.loadSettings();
      await this.loadSavedNews();
      this._checkCadenceAndRefresh();
    },

    // ── SETTINGS ────────────────────────────────────────────────────────────

    async loadSettings() {
      try {
        const res = await fetch("/api/news-digest-settings", {
          headers: { "Authorization": "Bearer " + this._token }
        });
        if (!res.ok) throw new Error("settings fetch failed");
        this._settings = await res.json();
        this.buildCategoryTabs(this._settings.categories || []);
        this._renderSummaryTab();
      } catch (e) {
        this._settings = { categories: this._defaultCategories(), cadence: "weekly" };
        this.buildCategoryTabs(this._settings.categories);
        this._renderSummaryTab();
      }
    },

    _defaultCategories() {
      return [
        { id: "regulatory", label: "Regulatory", enabled: true, is_custom: false },
        { id: "industry-body", label: "Industry Body", enabled: true, is_custom: false },
        { id: "suppliers", label: "Suppliers", enabled: true, is_custom: false },
        { id: "workplace-safety", label: "Workplace & Safety", enabled: true, is_custom: false },
        { id: "economic-market", label: "Economic & Market", enabled: true, is_custom: false },
        { id: "technology", label: "Technology", enabled: true, is_custom: false }
      ];
    },

    // ── CATEGORY TABS ───────────────────────────────────────────────────────

    buildCategoryTabs(categories) {
      const tabBar = document.getElementById("nd-tab-bar");
      if (!tabBar) return;

      const active = (categories || []).filter(c => c.enabled);

      tabBar.innerHTML = "";

      const summaryBtn = document.createElement("button");
      summaryBtn.className = "nd-tab" + (this._activeTab === "summary" ? " active" : "");
      summaryBtn.dataset.tab = "summary";
      summaryBtn.textContent = "Summary";
      summaryBtn.addEventListener("click", () => this.filterTab("summary"));
      tabBar.appendChild(summaryBtn);

      active.forEach(cat => {
        const btn = document.createElement("button");
        btn.className = "nd-tab" + (this._activeTab === cat.id ? " active" : "");
        btn.dataset.tab = cat.id;
        btn.textContent = cat.label;
        btn.addEventListener("click", () => this.filterTab(cat.id));
        tabBar.appendChild(btn);
      });

      const savedBtn = document.createElement("button");
      savedBtn.className = "nd-tab" + (this._activeTab === "saved" ? " active" : "");
      savedBtn.dataset.tab = "saved";
      savedBtn.textContent = "Saved";
      savedBtn.addEventListener("click", () => this.filterTab("saved"));
      tabBar.appendChild(savedBtn);
    },

    filterTab(tabId) {
      this._activeTab = tabId;

      document.querySelectorAll(".nd-tab").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      const summaryPanel = document.getElementById("nd-panel-summary");
      const feedPanel = document.getElementById("nd-panel-feed");

      if (tabId === "summary") {
        if (summaryPanel) summaryPanel.style.display = "";
        if (feedPanel) feedPanel.style.display = "none";
        this._renderSummaryTab();
      } else {
        if (summaryPanel) summaryPanel.style.display = "none";
        if (feedPanel) feedPanel.style.display = "";
        this.renderNews(this._items, tabId);
      }
    },

    // ── SAVED NEWS ──────────────────────────────────────────────────────────

    async loadSavedNews() {
      try {
        const { data, error } = await window._supabase
          .from("news_digest_items")
          .select("*")
          .eq("user_id", this._userId)
          .order("published_at", { ascending: false })
          .limit(200);

        if (error) throw error;
        this._items = data || [];
        this.renderNews(this._items, this._activeTab === "summary" ? null : this._activeTab);
      } catch (e) {
        this._items = [];
      }
    },

    // ── SUMMARY TAB ─────────────────────────────────────────────────────────

    _renderSummaryTab() {
      const panel = document.getElementById("nd-panel-summary");
      if (!panel) return;

      const summary = this._settings && this._settings.updated_summary;
      const generatedAt = this._settings && this._settings.summary_generated_at;
      const categories = (this._settings && this._settings.categories || []).filter(c => c.enabled);

      if (!summary || Object.keys(summary).length === 0) {
        panel.innerHTML = "<div class=\"nd-empty-state\">" +
          "<p>Your Industry News Digest is ready to set up.</p>" +
          "<p>Click <strong>Refresh Now</strong> to generate your first digest.</p>" +
          "<button class=\"nd-btn-primary\" onclick=\"window.ND_LOGIC.refreshNews()\">Generate Your First Digest</button>" +
          "</div>";
        return;
      }

      let html = "<div class=\"nd-summary-header\">";
      if (generatedAt) {
        const d = new Date(generatedAt);
        html += "<span class=\"nd-last-updated\">Last updated: " + this._relativeTime(d) + "</span>";
      }
      html += "<button class=\"nd-btn-secondary\" onclick=\"window.ND_LOGIC.refreshNews()\">Refresh Now</button>";
      html += "</div>";

      categories.forEach(cat => {
        const catSummary = summary[cat.id];
        if (!catSummary) return;

        const topStory = this._items.find(item => item.category === cat.id && item.url);

        html += "<div class=\"nd-summary-section\">";
        html += "<h3 class=\"nd-summary-cat-heading\">" + this._escapeHtml(cat.label) + "</h3>";
        html += "<p class=\"nd-summary-text\">" + this._escapeHtml(catSummary) + "</p>";
        if (topStory) {
          html += "<a class=\"nd-read-more\" href=\"" + this._escapeHtml(topStory.url) + "\" target=\"_blank\" rel=\"noopener\">Read more</a>";
        }
        html += "</div>";
      });

      panel.innerHTML = html;
    },

    // ── NEWS FEED ───────────────────────────────────────────────────────────

    renderNews(items, categoryId) {
      const feed = document.getElementById("nd-panel-feed");
      if (!feed) return;

      let filtered;
      if (categoryId === "saved") {
        filtered = items.filter(item => item.is_saved);
      } else if (categoryId) {
        filtered = items.filter(item => item.category === categoryId);
      } else {
        filtered = items;
      }

      if (filtered.length === 0) {
        feed.innerHTML = "<div class=\"nd-empty-state\"><p>No items in this category yet. Click Refresh Now to fetch the latest news.</p></div>";
        return;
      }

      feed.innerHTML = filtered.map(item => this.renderNewsCard(item)).join("");
    },

    renderNewsCard(item) {
      const title = this._escapeHtml(item.title || "Untitled");
      const summary = this._escapeHtml(item.summary || "");
      const sourceName = this._escapeHtml(item.source_name || "");
      const sourceDomain = this._escapeHtml(item.source_domain || "");
      const sourceType = item.source_type || "secondary";
      const pubDate = item.published_at ? this._relativeTime(new Date(item.published_at)) : "";
      const isSaved = item.is_saved;
      const itemId = item.id;

      const badgeClass = sourceType === "primary" ? "nd-badge-primary"
        : sourceType === "email" ? "nd-badge-email"
        : "nd-badge-secondary";
      const badgeLabel = sourceType === "primary" ? "Primary Source"
        : sourceType === "email" ? "Email"
        : "Trade Media";

      const titleHtml = item.url
        ? "<a class=\"nd-card-title\" href=\"" + this._escapeHtml(item.url) + "\" target=\"_blank\" rel=\"noopener\">" + title + "</a>"
        : "<span class=\"nd-card-title\">" + title + "</span>";

      return "<div class=\"nd-card\" data-id=\"" + itemId + "\">" +
        "<div class=\"nd-card-header\">" +
        titleHtml +
        "<button class=\"nd-bookmark" + (isSaved ? " saved" : "") + "\" onclick=\"window.ND_LOGIC.toggleSaved('" + itemId + "')\" title=\"" + (isSaved ? "Remove bookmark" : "Bookmark") + "\">&#9673;</button>" +
        "</div>" +
        "<p class=\"nd-card-summary\">" + summary + "</p>" +
        "<div class=\"nd-card-meta\">" +
        (sourceName ? "<span class=\"nd-source-name\">" + sourceName + "</span>" : "") +
        (sourceDomain ? "<span class=\"nd-source-domain\">" + sourceDomain + "</span>" : "") +
        "<span class=\"nd-badge " + badgeClass + "\">" + badgeLabel + "</span>" +
        (pubDate ? "<span class=\"nd-pub-date\">" + pubDate + "</span>" : "") +
        "</div>" +
        "</div>";
    },

    // ── REFRESH ─────────────────────────────────────────────────────────────

    _checkCadenceAndRefresh() {
      if (!this._settings) return;
      const cadence = this._settings.cadence || "weekly";
      const lastRefresh = this._settings.summary_generated_at
        ? new Date(this._settings.summary_generated_at)
        : null;

      if (!lastRefresh) return;

      const now = Date.now();
      const ageMs = now - lastRefresh.getTime();
      const threshold = cadence === "daily" ? 20 * 60 * 60 * 1000 : 6 * 24 * 60 * 60 * 1000;

      if (ageMs > threshold) {
        this.refreshNews();
      }
    },

    async refreshNews() {
      const refreshBtn = document.querySelector(".nd-btn-secondary, .nd-btn-primary");
      if (refreshBtn) refreshBtn.textContent = "Refreshing...";

      try {
        const res = await fetch("/api/news-digest-refresh", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + this._token
          },
          body: JSON.stringify({ userId: this._userId })
        });

        if (!res.ok) throw new Error("refresh failed");

        await this.loadSettings();
        await this.loadSavedNews();
      } catch (e) {
        if (refreshBtn) refreshBtn.textContent = "Refresh Now";
      }
    },

    // ── BOOKMARK ────────────────────────────────────────────────────────────

    async toggleSaved(itemId) {
      const item = this._items.find(i => i.id === itemId);
      if (!item) return;

      const newSaved = !item.is_saved;

      const { error } = await window._supabase
        .from("news_digest_items")
        .update({ is_saved: newSaved })
        .eq("id", itemId)
        .eq("user_id", this._userId);

      if (!error) {
        item.is_saved = newSaved;
        const card = document.querySelector(".nd-card[data-id=\"" + itemId + "\"]");
        if (card) {
          const btn = card.querySelector(".nd-bookmark");
          if (btn) {
            btn.classList.toggle("saved", newSaved);
            btn.title = newSaved ? "Remove bookmark" : "Bookmark";
          }
        }
      }
    },

    // ── SETTINGS MODAL ──────────────────────────────────────────────────────

    openSettings() {
      const modal = document.getElementById("nd-settings-modal");
      if (!modal) return;

      const categories = (this._settings && this._settings.categories) || this._defaultCategories();
      const cadence = (this._settings && this._settings.cadence) || "weekly";
      const sourcePrefs = ((this._settings && this._settings.source_preferences) || []).join(", ");
      const industryOverride = (this._settings && this._settings.industry_override) || "";
      const locationOverride = (this._settings && this._settings.location_override) || "";

      const catRows = categories.map((cat, idx) =>
        "<div class=\"nd-settings-cat-row\" data-idx=\"" + idx + "\">" +
        "<label class=\"nd-toggle\"><input type=\"checkbox\" class=\"nd-cat-enabled\" data-idx=\"" + idx + "\"" + (cat.enabled ? " checked" : "") + "><span class=\"nd-toggle-slider\"></span></label>" +
        "<input type=\"text\" class=\"nd-cat-label\" data-idx=\"" + idx + "\" value=\"" + this._escapeHtml(cat.label) + "\">" +
        (cat.is_custom ? "<button class=\"nd-cat-remove\" data-idx=\"" + idx + "\" onclick=\"window.ND_LOGIC._removeCatRow(" + idx + ")\">Remove</button>" : "") +
        "</div>"
      ).join("");

      const modalBody = document.getElementById("nd-settings-body");
      if (!modalBody) return;

      modalBody.innerHTML =
        "<div class=\"nd-settings-section\">" +
        "<h4>Categories</h4>" +
        "<div id=\"nd-cat-rows\">" + catRows + "</div>" +
        "<button class=\"nd-btn-secondary\" onclick=\"window.ND_LOGIC._addCatRow()\">Add Category</button>" +
        "</div>" +
        "<div class=\"nd-settings-section\">" +
        "<h4>Digest Frequency</h4>" +
        "<label><input type=\"radio\" name=\"cadence\" value=\"daily\"" + (cadence === "daily" ? " checked" : "") + "> Daily</label>" +
        "<label><input type=\"radio\" name=\"cadence\" value=\"weekly\"" + (cadence === "weekly" ? " checked" : "") + "> Weekly</label>" +
        "</div>" +
        "<div class=\"nd-settings-section\">" +
        "<h4>Source Preferences</h4>" +
        "<input type=\"text\" id=\"nd-source-prefs\" placeholder=\"e.g. Fair Work Commission, ato.gov.au\" value=\"" + this._escapeHtml(sourcePrefs) + "\">" +
        "</div>" +
        "<div class=\"nd-settings-section\">" +
        "<h4>Industry Override</h4>" +
        "<input type=\"text\" id=\"nd-industry-override\" placeholder=\"Leave blank to use your profile industry\" value=\"" + this._escapeHtml(industryOverride) + "\">" +
        "<h4>Location Override</h4>" +
        "<input type=\"text\" id=\"nd-location-override\" placeholder=\"Leave blank to use your profile location\" value=\"" + this._escapeHtml(locationOverride) + "\">" +
        "</div>";

      modal.style.display = "flex";
    },

    _addCatRow() {
      const rows = document.getElementById("nd-cat-rows");
      if (!rows) return;
      const idx = rows.querySelectorAll(".nd-settings-cat-row").length;
      const row = document.createElement("div");
      row.className = "nd-settings-cat-row";
      row.dataset.idx = idx;
      row.innerHTML =
        "<label class=\"nd-toggle\"><input type=\"checkbox\" class=\"nd-cat-enabled\" data-idx=\"" + idx + "\" checked><span class=\"nd-toggle-slider\"></span></label>" +
        "<input type=\"text\" class=\"nd-cat-label\" data-idx=\"" + idx + "\" placeholder=\"Category name\">" +
        "<button class=\"nd-cat-remove\" onclick=\"this.closest('.nd-settings-cat-row').remove()\">Remove</button>";
      rows.appendChild(row);
    },

    _removeCatRow(idx) {
      const row = document.querySelector(".nd-settings-cat-row[data-idx=\"" + idx + "\"]");
      if (row) row.remove();
    },

    async saveSettings() {
      const rows = document.querySelectorAll(".nd-settings-cat-row");
      const categories = [];
      rows.forEach(row => {
        const enabled = row.querySelector(".nd-cat-enabled");
        const label = row.querySelector(".nd-cat-label");
        if (!label || !label.value.trim()) return;
        const idx = parseInt(row.dataset.idx, 10);
        const existing = this._settings && this._settings.categories && this._settings.categories[idx];
        categories.push({
          id: existing ? existing.id : "custom-" + Date.now() + "-" + idx,
          label: label.value.trim(),
          enabled: enabled ? enabled.checked : true,
          is_custom: existing ? existing.is_custom : true
        });
      });

      const activeCount = categories.filter(c => c.enabled).length;
      if (activeCount === 0) {
        alert("At least one category must be active.");
        return;
      }

      const cadenceInput = document.querySelector("input[name=\"cadence\"]:checked");
      const cadence = cadenceInput ? cadenceInput.value : "weekly";

      const sourcePrefsInput = document.getElementById("nd-source-prefs");
      const sourcePreferences = sourcePrefsInput
        ? sourcePrefsInput.value.split(",").map(s => s.trim()).filter(Boolean)
        : [];

      const industryInput = document.getElementById("nd-industry-override");
      const locationInput = document.getElementById("nd-location-override");

      const payload = {
        categories,
        cadence,
        source_preferences: sourcePreferences,
        industry_override: industryInput && industryInput.value.trim() ? industryInput.value.trim() : null,
        location_override: locationInput && locationInput.value.trim() ? locationInput.value.trim() : null
      };

      try {
        const res = await fetch("/api/news-digest-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + this._token
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("save failed");
        this._settings = Object.assign(this._settings || {}, payload);
        this.closeSettings();
        this.buildCategoryTabs(categories);
        this.filterTab("summary");
      } catch (e) {
        alert("Could not save settings. Please try again.");
      }
    },

    closeSettings() {
      const modal = document.getElementById("nd-settings-modal");
      if (modal) modal.style.display = "none";
    },

    // ── UTILITIES ───────────────────────────────────────────────────────────

    _relativeTime(date) {
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return diffMins + " min" + (diffMins !== 1 ? "s" : "") + " ago";
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return diffHours + " hour" + (diffHours !== 1 ? "s" : "") + " ago";
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return diffDays + " day" + (diffDays !== 1 ? "s" : "") + " ago";
      return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    },

    _escapeHtml(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

  };

})();