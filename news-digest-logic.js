(function () {
  "use strict";

  window.ND_LOGIC = {

    _supabase: null,
    _profile: null,
    _settings: null,
    _items: [],
    _activeTab: "summary",

    // ── INIT ────────────────────────────────────────────────────────────────

    async init(supabase, user) {
      if (!supabase || !user) {
        console.error("ND_LOGIC: supabase client or user not provided");
        return;
      }
      this._supabase = supabase;
      this._userId = user.id;

      var session;
      try {
        var sessionRes = await supabase.auth.getSession();
        session = sessionRes.data && sessionRes.data.session;
      } catch (e) {
        console.error("[ND] Session fetch error:", e.message);
      }
      this._token = session ? session.access_token : null;

      this._bindStaticEvents();
      await this.loadSettings();
      await this.loadSavedNews();
      this._checkCadenceAndRefresh();
    },

    // ── STATIC EVENT BINDINGS ──────────────────────────────────────────────

    _bindStaticEvents() {
      var self = this;
      var refreshBtn = document.getElementById("nd-refresh-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", function() { self.refreshNews(); });
      }
    },

    // ── SETTINGS ────────────────────────────────────────────────────────────

    async loadSettings() {
      try {
        var res = await fetch("/api/news-digest-settings", {
          headers: { "Authorization": "Bearer " + this._token }
        });
        if (!res.ok) throw new Error("settings fetch failed");
        this._settings = await res.json();
        this.buildCategoryTabs(this._settings.categories || []);
        this._renderSummaryTab();
      } catch (e) {
        console.error("[ND] loadSettings error:", e.message);
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
      var tabBar = document.getElementById("nd-tab-bar");
      if (!tabBar) return;

      var active = (categories || []).filter(function(c) { return c.enabled; });
      var self = this;

      tabBar.innerHTML = "";

      var summaryBtn = document.createElement("button");
      summaryBtn.className = "nd-tab" + (this._activeTab === "summary" ? " active" : "");
      summaryBtn.dataset.tab = "summary";
      summaryBtn.textContent = "Summary";
      summaryBtn.addEventListener("click", function() { self.filterTab("summary"); });
      tabBar.appendChild(summaryBtn);

      active.forEach(function(cat) {
        var btn = document.createElement("button");
        btn.className = "nd-tab" + (self._activeTab === cat.id ? " active" : "");
        btn.dataset.tab = cat.id;
        btn.textContent = cat.label;
        btn.addEventListener("click", function() { self.filterTab(cat.id); });
        tabBar.appendChild(btn);
      });

      var savedBtn = document.createElement("button");
      savedBtn.className = "nd-tab" + (this._activeTab === "saved" ? " active" : "");
      savedBtn.dataset.tab = "saved";
      savedBtn.textContent = "Saved";
      savedBtn.addEventListener("click", function() { self.filterTab("saved"); });
      tabBar.appendChild(savedBtn);
    },

    filterTab(tabId) {
      this._activeTab = tabId;

      document.querySelectorAll(".nd-tab").forEach(function(btn) {
        btn.classList.toggle("active", btn.dataset.tab === tabId);
      });

      var summaryPanel = document.getElementById("nd-panel-summary");
      var feedPanel = document.getElementById("nd-panel-feed");

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
        var result = await this._supabase
          .from("news_digest_items")
          .select("*")
          .eq("user_id", this._userId)
          .order("published_at", { ascending: false })
          .limit(200);

        if (result.error) throw result.error;
        this._items = result.data || [];
        this.renderNews(this._items, this._activeTab === "summary" ? null : this._activeTab);
      } catch (e) {
        console.error("[ND] loadSavedNews error:", e.message);
        this._items = [];
      }
    },

    // ── SUMMARY TAB ─────────────────────────────────────────────────────────

    _renderSummaryTab() {
      var panel = document.getElementById("nd-panel-summary");
      if (!panel) return;

      var summary = this._settings && this._settings.updated_summary;
      var generatedAt = this._settings && this._settings.summary_generated_at;
      var categories = (this._settings && this._settings.categories || []).filter(function(c) { return c.enabled; });
      var self = this;

      if (!summary || Object.keys(summary).length === 0) {
        panel.innerHTML = "<div class=\"nd-empty-state\">" +
          "<p>Your Industry News Digest is ready to set up.</p>" +
          "<p>Click <strong>Refresh Now</strong> to generate your first digest.</p>" +
          "<button class=\"nd-btn-primary nd-generate-btn\">Generate Your First Digest</button>" +
          "</div>";
        this._bindSummaryEvents(panel);
        return;
      }

      var html = "<div class=\"nd-summary-header\">";
      if (generatedAt) {
        var d = new Date(generatedAt);
        html += "<span class=\"nd-last-updated\">Last updated: " + this._relativeTime(d) + "</span>";
      }
      html += "<button class=\"nd-btn-secondary nd-summary-refresh-btn\">Refresh Now</button>";
      html += "</div>";

      categories.forEach(function(cat) {
        var catSummary = summary[cat.id];
        if (!catSummary) return;

        var topStory = self._items.find(function(item) { return item.category === cat.id && item.url; });

        html += "<div class=\"nd-summary-section\">";
        html += "<h3 class=\"nd-summary-cat-heading\">" + escHtml(cat.label) + "</h3>";
        html += "<p class=\"nd-summary-text\">" + escHtml(catSummary) + "</p>";
        if (topStory) {
          html += "<a class=\"nd-read-more\" href=\"" + escHtml(topStory.url) + "\" target=\"_blank\" rel=\"noopener\">Read more</a>";
        }
        html += "</div>";
      });

      panel.innerHTML = html;
      this._bindSummaryEvents(panel);
    },

    _bindSummaryEvents(panel) {
      var self = this;
      var generateBtn = panel.querySelector(".nd-generate-btn");
      if (generateBtn) {
        generateBtn.addEventListener("click", function() { self.refreshNews(); });
      }
      var summaryRefreshBtn = panel.querySelector(".nd-summary-refresh-btn");
      if (summaryRefreshBtn) {
        summaryRefreshBtn.addEventListener("click", function() { self.refreshNews(); });
      }
    },

    // ── NEWS FEED ───────────────────────────────────────────────────────────

    renderNews(items, categoryId) {
      var feed = document.getElementById("nd-panel-feed");
      if (!feed) return;

      var filtered;
      if (categoryId === "saved") {
        filtered = items.filter(function(item) { return item.is_saved; });
      } else if (categoryId) {
        filtered = items.filter(function(item) { return item.category === categoryId; });
      } else {
        filtered = items;
      }

      if (filtered.length === 0) {
        feed.innerHTML = "<div class=\"nd-empty-state\"><p>No items in this category yet. Click Refresh Now to fetch the latest news.</p></div>";
        return;
      }

      var self = this;
      feed.innerHTML = filtered.map(function(item) { return self.renderNewsCard(item); }).join("");
      this._bindFeedEvents(feed);
    },

    renderNewsCard(item) {
      var title = escHtml(item.title || "Untitled");
      var summary = escHtml(item.summary || "");
      var sourceName = escHtml(item.source_name || "");
      var sourceDomain = escHtml(item.source_domain || "");
      var sourceType = item.source_type || "secondary";
      var pubDate = item.published_at ? this._relativeTime(new Date(item.published_at)) : "";
      var isSaved = item.is_saved;
      var itemId = item.id;

      var badgeClass = sourceType === "primary" ? "nd-badge-primary"
        : sourceType === "email" ? "nd-badge-email"
        : "nd-badge-secondary";
      var badgeLabel = sourceType === "primary" ? "Primary Source"
        : sourceType === "email" ? "Email"
        : "Trade Media";

      var titleHtml = item.url
        ? "<a class=\"nd-card-title\" href=\"" + escHtml(item.url) + "\" target=\"_blank\" rel=\"noopener\">" + title + "</a>"
        : "<span class=\"nd-card-title\">" + title + "</span>";

      return "<div class=\"nd-card\" data-id=\"" + itemId + "\">" +
        "<div class=\"nd-card-header\">" +
        titleHtml +
        "<button class=\"nd-bookmark" + (isSaved ? " saved" : "") + "\" data-id=\"" + itemId + "\" title=\"" + (isSaved ? "Remove bookmark" : "Bookmark") + "\">&#9673;</button>" +
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

    _bindFeedEvents(feed) {
      var self = this;
      feed.querySelectorAll(".nd-bookmark").forEach(function(btn) {
        btn.addEventListener("click", function() {
          self.toggleSaved(btn.dataset.id);
        });
      });
    },

    // ── REFRESH ─────────────────────────────────────────────────────────────

    _checkCadenceAndRefresh() {
      if (!this._settings) return;
      var cadence = this._settings.cadence || "weekly";
      var lastRefresh = this._settings.summary_generated_at
        ? new Date(this._settings.summary_generated_at)
        : null;

      if (!lastRefresh) return;

      var now = Date.now();
      var ageMs = now - lastRefresh.getTime();
      var threshold = cadence === "daily" ? 20 * 60 * 60 * 1000 : 6 * 24 * 60 * 60 * 1000;

      if (ageMs > threshold) {
        this.refreshNews();
      }
    },

    async refreshNews() {
      var refreshBtn = document.querySelector(".nd-summary-refresh-btn");
      var headerBtn = document.getElementById("nd-refresh-btn");
      if (refreshBtn) refreshBtn.textContent = "Refreshing...";
      if (headerBtn) headerBtn.textContent = "Refreshing...";

      try {
        var res = await fetch("/api/news-digest-refresh", {
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
        console.error("[ND] refreshNews error:", e.message);
        if (refreshBtn) refreshBtn.textContent = "Refresh Now";
        if (headerBtn) headerBtn.textContent = "Refresh Now";
      }
    },

    // ── BOOKMARK ────────────────────────────────────────────────────────────

    async toggleSaved(itemId) {
      var item = this._items.find(function(i) { return i.id === itemId; });
      if (!item) return;

      var newSaved = !item.is_saved;

      var result = await this._supabase
        .from("news_digest_items")
        .update({ is_saved: newSaved })
        .eq("id", itemId)
        .eq("user_id", this._userId);

      if (result.error) {
        console.error("[ND] toggleSaved error:", result.error.message);
        return;
      }

      item.is_saved = newSaved;
      var card = document.querySelector(".nd-card[data-id=\"" + itemId + "\"]");
      if (card) {
        var btn = card.querySelector(".nd-bookmark");
        if (btn) {
          btn.classList.toggle("saved", newSaved);
          btn.title = newSaved ? "Remove bookmark" : "Bookmark";
        }
      }
    },

    // ── UTILITIES ───────────────────────────────────────────────────────────

    _relativeTime(date) {
      var diffMs = Date.now() - date.getTime();
      var diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return diffMins + " min" + (diffMins !== 1 ? "s" : "") + " ago";
      var diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return diffHours + " hour" + (diffHours !== 1 ? "s" : "") + " ago";
      var diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return diffDays + " day" + (diffDays !== 1 ? "s" : "") + " ago";
      return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
    }

  };

})();
