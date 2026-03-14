(function() {
  window.DASH_WIDGETS = {
    // Intelligence tools that contribute widgets
    INTELLIGENCE_TOOLS: ["email", "news-digest", "bi", "strategic-plan", "social", "chatbot"],

    init: function(supabase) {
      if (!supabase) return;
      supabase.auth.getUser().then(function(result) {
        if (!result.data.user) return;
        var userId = result.data.user.id;
        supabase.from("profiles").select("active_tools").eq("id", userId).single()
          .then(function(res) {
            var activeTools = (res.data && res.data.active_tools) ? res.data.active_tools : [];
            var activeIntelligence = DASH_WIDGETS.INTELLIGENCE_TOOLS.filter(function(id) {
              return activeTools.indexOf(id) > -1;
            });
            if (activeIntelligence.length === 0) return;
            var zone = document.getElementById("zone-intelligence");
            var grid = document.getElementById("widgets-grid");
            if (!zone || !grid) return;
            zone.classList.remove("hidden");
            activeIntelligence.forEach(function(toolId) {
              DASH_WIDGETS.renderWidget(toolId, grid, supabase, userId);
            });
          });
      });
    },

    renderWidget: function(toolId, grid, supabase, userId) {
      var card = document.createElement("div");
      card.className = "widget-card";
      card.id = "widget-" + toolId;
      card.innerHTML = '<div class="widget-body"><div class="widget-loading"><div class="spinner"></div>Loading...</div></div>';
      grid.appendChild(card);
      // Load widget content based on tool
      switch(toolId) {
        case "email":         DASH_WIDGETS.loadEmailWidget(card, supabase, userId); break;
        case "news-digest":   DASH_WIDGETS.loadNewsWidget(card, supabase, userId); break;
        case "bi":            DASH_WIDGETS.loadBIWidget(card, supabase, userId); break;
        case "strategic-plan":DASH_WIDGETS.loadStrategicWidget(card, supabase, userId); break;
        case "social":        DASH_WIDGETS.loadSocialWidget(card, supabase, userId); break;
        case "chatbot":       DASH_WIDGETS.loadChatbotWidget(card, supabase, userId); break;
      }
    },

    _setWidget: function(card, icon, title, bodyHtml, metaText, linkUrl, linkText) {
      card.innerHTML =
        '<div class="widget-header"><span class="widget-header-icon">' + icon + '</span><span class="widget-header-title">' + title + '</span></div>' +
        '<div class="widget-body">' + bodyHtml + '</div>' +
        '<div class="widget-footer"><span class="widget-footer-meta">' + (metaText || "") + '</span>' +
        '<a href="' + linkUrl + '">' + linkText + '</a></div>';
    },

    loadEmailWidget: function(card, supabase, userId) {
      DASH_WIDGETS._setWidget(card, "📧", "AI Email Assistant",
        '<p style="color:var(--muted-text);font-size:14px;">Connect Gmail or Outlook in <a href="content-library.html" style="color:var(--orange)">Content Library</a> to see your inbox summary here.</p>',
        "", "email-assistant.html", "Open Email Assistant");
    },

    loadNewsWidget: function(card, supabase, userId) {
      supabase.from("news_digest_items").select("headline, summary, source, created_at")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(5)
        .then(function(res) {
          var items = res.data || [];
          var bodyHtml = items.length
            ? items.map(function(item) {
                return '<div style="padding:6px 0;border-bottom:1px solid var(--card-border);font-size:13px;">' +
                  '<strong>' + (item.source || "Industry") + '</strong> — ' + (item.headline || "") + '</div>';
              }).join("")
            : '<p style="color:var(--muted-text);font-size:14px;">Your next digest will appear here.</p>';
          DASH_WIDGETS._setWidget(card, "📰", "Industry News Digest", bodyHtml,
            items.length ? "Latest digest" : "", "news-digest.html", "Open News Digest");
        });
    },

    loadBIWidget: function(card, supabase, userId) {
      DASH_WIDGETS._setWidget(card, "📊", "Business Intelligence Dashboard",
        '<p style="color:var(--muted-text);font-size:14px;">Activate more tools to unlock deeper insights. The more tools in your Stax, the smarter your analysis gets.</p>',
        "", "business-intelligence.html", "Open BI Dashboard");
    },

    loadStrategicWidget: function(card, supabase, userId) {
      supabase.from("action_tracker").select("action, due_date, status")
        .eq("user_id", userId).eq("status", "pending").order("due_date").limit(3)
        .then(function(res) {
          var items = res.data || [];
          var bodyHtml = items.length
            ? items.map(function(item) {
                return '<div style="padding:6px 0;border-bottom:1px solid var(--card-border);font-size:13px;">' +
                  '<span style="color:var(--orange)">●</span> ' + (item.action || "") +
                  (item.due_date ? ' <span style="color:var(--muted-text);font-size:11px;">Due ' + item.due_date + '</span>' : "") +
                  '</div>';
              }).join("")
            : '<p style="color:var(--muted-text);font-size:14px;">No actions due. Open your Strategic Plan to review your 90-day tracker.</p>';
          DASH_WIDGETS._setWidget(card, "🗺️", "Strategic Plan", bodyHtml,
            "", "strategic-plan.html", "Open Strategic Plan");
        });
    },

    loadSocialWidget: function(card, supabase, userId) {
      supabase.from("social_posts").select("caption, status, scheduled_for")
        .eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(3)
        .then(function(res) {
          var items = res.data || [];
          var bodyHtml = items.length
            ? items.map(function(item) {
                return '<div style="padding:6px 0;border-bottom:1px solid var(--card-border);font-size:13px;">' +
                  '<span style="background:var(--notif-bg);color:var(--notif-text);padding:1px 6px;border-radius:3px;font-size:11px;">Pending review</span> ' +
                  (item.caption ? item.caption.substring(0, 60) + "..." : "Post ready for review") +
                  '</div>';
              }).join("")
            : '<p style="color:var(--muted-text);font-size:14px;">No posts pending review.</p>';
          DASH_WIDGETS._setWidget(card, "📱", "Marketing & Social Media", bodyHtml,
            "", "social.html", "Open Marketing Hub");
        });
    },

    loadChatbotWidget: function(card, supabase, userId) {
      supabase.from("learned_faqs").select("id", { count: "exact" })
        .eq("user_id", userId).eq("status", "pending")
        .then(function(res) {
          var pendingFaqs = res.count || 0;
          var bodyHtml = pendingFaqs > 0
            ? '<p style="font-size:14px;">' + pendingFaqs + ' new FAQ suggestion' + (pendingFaqs > 1 ? "s" : "") + ' ready to approve.</p>'
            : '<p style="color:var(--muted-text);font-size:14px;">Your chatbot is active. New FAQ suggestions will appear here.</p>';
          DASH_WIDGETS._setWidget(card, "💬", "AI Website Chatbot", bodyHtml,
            "", "chatbot.html", "Open Chatbot Settings");
        });
    }
  };
})();