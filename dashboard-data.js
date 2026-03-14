(function() {
  window.DASH_DATA = {
    init: function(supabase) {
      if (!supabase) return;
      supabase.auth.getUser().then(function(result) {
        if (!result.data.user) return;
        var userId = result.data.user.id;
        // Load active tools from Supabase profiles/subscriptions
        supabase.from("profiles").select("active_tools, profile_complete").eq("id", userId).single()
          .then(function(res) {
            var activeTools = (res.data && res.data.active_tools) ? res.data.active_tools : [];
            var profileComplete = res.data ? res.data.profile_complete : false;
            if (!profileComplete) {
              var prompt = document.getElementById("profile-prompt");
              if (prompt) prompt.classList.remove("hidden");
            }
            DASH_DATA.renderStax(activeTools);
            DASH_DATA.loadNotifications(supabase, userId, activeTools);
          });
      });
    },

    TOOLS: [
      { id: "social", icon: "📱", name: "Marketing & Social Media Manager", desc: "AI builds your posts, graphics & marketing content — auto-posts to Facebook & Instagram.", price: "$79", url: "social.html", stripe: "price_social" },
      { id: "email", icon: "📧", name: "AI Email Assistant", desc: "AI reads your Gmail & Outlook — summarised on one smart dashboard.", price: "$59", url: "email-assistant.html", stripe: "price_email" },
      { id: "chatbot", icon: "💬", name: "AI Website Chatbot", desc: "AI chatbot for your website — answers customers, qualifies leads, books jobs — 24/7.", price: "$79", url: "chatbot.html", stripe: "price_chatbot" },
      { id: "news-digest", icon: "📰", name: "Industry News & Updates Digest", desc: "Industry news, regulation changes, supplier updates — personalised and AI-summarised.", price: "$59", url: "news-digest.html", stripe: "price_news" },
      { id: "bi", icon: "📊", name: "Business Intelligence Dashboard", desc: "AI-powered insights driven by your business data, your industry, your region.", price: "$89", url: "business-intelligence.html", stripe: "price_bi" },
      { id: "strategic-plan", icon: "🗺️", name: "Strategic Plan & Operations Dashboard", desc: "Create your roadmap in minutes from a simple AI-guided interview.", price: "$69", url: "strategic-plan.html", stripe: "price_strategic" },
      { id: "tender", icon: "📋", name: "Tender Response Generator", desc: "AI reads the tender brief and generates a full professional response — ready to submit.", price: "$99", url: "tender-response.html", stripe: "price_1T4dDMHnoVvjo5gxWhPHyqQc" },
      { id: "quote-enhancer", icon: "💰", name: "Quote Enhancer", desc: "Turn your prices into a professional branded quote with AI-written scope and warranty terms.", price: "Coming Soon", url: null, stripe: null },
      { id: "swms", icon: "🦺", name: "SWMS & Safety Docs", desc: "AI generates job-specific SWMS and safety docs — compliant with your state's WHS requirements.", price: "Coming Soon", url: null, stripe: null },
      { id: "customer-updates", icon: "📸", name: "Customer Progress Updates", desc: "Send professional branded progress updates with photos — AI does the writing.", price: "Coming Soon", url: null, stripe: null },
      { id: "handover-docs", icon: "📦", name: "Handover Documentation", desc: "AI creates a branded handover pack for every completed job — maintenance guide, warranty, summary.", price: "Coming Soon", url: null, stripe: null },
      { id: "review-booster", icon: "⭐", name: "Review & Referral Booster", desc: "Automatically request Google reviews at job completion — then turn happy customers into referrals.", price: "Coming Soon", url: null, stripe: null },
      { id: "design-viz", icon: "🎨", name: "Design Visualiser", desc: "Upload a site photo, describe the project — AI generates a professional concept render.", price: "Coming Soon", url: null, stripe: null }
    ],

    renderStax: function(activeTools) {
      var grid = document.getElementById("stax-grid");
      if (!grid) return;
      grid.innerHTML = "";
      DASH_DATA.TOOLS.forEach(function(tool) {
        var isActive = activeTools.indexOf(tool.id) > -1;
        var isComingSoon = !tool.stripe && tool.price === "Coming Soon";
        var card = document.createElement("div");
        card.className = "stax-card" + (isActive ? " active" : "") + (isComingSoon ? " coming-soon" : "");
        var badge = isActive ? '<span class="badge-live">Live</span>' : (isComingSoon ? '<span class="badge-coming">Coming Soon</span>' : "");
        var btn = "";
        if (isActive && tool.url) {
          btn = '<a href="' + tool.url + '" class="btn-open-tool">Open Tool</a>';
        } else if (!isComingSoon && tool.stripe) {
          btn = '<a href="login.html?tab=signup&tool=' + tool.id + '" class="btn-activate">Activate — ' + tool.price + "/mo</a>";
        }
        card.innerHTML = '<div class="stax-card-icon">' + tool.icon + '</div>' +
          '<div>' + badge + '</div>' +
          '<div class="stax-card-name">' + tool.name + '</div>' +
          '<div class="stax-card-desc">' + tool.desc + '</div>' +
          (tool.price !== "Coming Soon" && !isActive ? '<div class="stax-card-price">' + tool.price + "/mo</div>" : "") +
          '<div class="stax-card-footer">' + btn + '</div>';
        grid.appendChild(card);
      });
    },

    loadNotifications: function(supabase, userId, activeTools) {
      var bar = document.getElementById("notif-bar");
      if (!bar) return;
      var notifs = [];
      // Check content library pending items
      supabase.from("content_library").select("id", { count: "exact" })
        .eq("user_id", userId).eq("status", "pending")
        .then(function(res) {
          var count = res.count || 0;
          if (count > 0) {
            notifs.push(count + " item" + (count > 1 ? "s" : "") + " awaiting approval in <a href='content-library.html'>Content Library</a>");
          }
          DASH_DATA.renderNotifications(bar, notifs);
        });
    },

    renderNotifications: function(bar, notifs) {
      if (!notifs.length) { bar.innerHTML = ""; return; }
      bar.innerHTML = notifs.map(function(msg) {
        return '<div class="notif-item">⚠️ ' + msg + '<button class="notif-dismiss" onclick="this.parentElement.remove()">×</button></div>';
      }).join("");
    }
  };
})();