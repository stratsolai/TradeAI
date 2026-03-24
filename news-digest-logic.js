(function () {
  "use strict";

  window.ND_LOGIC = {

    _profile: null,
    _settings: null,
    _items: [],
    _activeTab: "summary",

    // ── INIT ────────────────────────────────────────────────────────────────

    async init() {
      if (!window.supabaseClient) {
        console.error("ND_LOGIC: supabase client not ready");
        return;
      }
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (!session) {
        window.location.href = "//login";
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
        const { data, error } = await window.supabaseClient
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

      const { error } = await window.supabaseClient
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