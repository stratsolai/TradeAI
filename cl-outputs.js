window.CL_OUTPUTS = {
  _supabase: null,
  _selectedTool: null,

  _tools: [
    { id: 'social',        name: 'Marketing & Social Media Manager', state: 'active' },
    { id: 'chatbot',       name: 'AI Website Chatbot',               state: 'active' },
    { id: 'email',         name: 'AI Email Assistant',               state: 'active' },
    { id: 'bi',            name: 'Business Intelligence Dashboard',  state: 'active' },
    { id: 'news-digest',   name: 'Industry News & Updates Digest',   state: 'active' },
    { id: 'strategic-plan',name: 'Strategic Plan & Operations',      state: 'active' },
    { id: 'tender',        name: 'Tender Response Generator',        state: 'coming-soon' },
    { id: 'quote-enhancer',name: 'Quote Enhancer',                   state: 'coming-soon' },
    { id: 'swms',          name: 'SWMS & Safety Docs',               state: 'coming-soon' },
    { id: 'customer-updates', name: 'Customer Progress Updates',     state: 'coming-soon' },
    { id: 'handover-docs', name: 'Handover Documentation',           state: 'coming-soon' },
    { id: 'review-booster',name: 'Review & Referral Booster',        state: 'coming-soon' },
    { id: 'design-viz',    name: 'Design Visualiser',                state: 'coming-soon' }
  ],

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
  },

  _render: function() {
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;

    var self = this;
    var html = "<div class=\"outputs-layout\">";

    // Left sidebar - tool list
    html += "<div class=\"outputs-sidebar\">";
    html += "<div class=\"outputs-sidebar-title\">AI Tool Outputs</div>";
    this._tools.forEach(function(tool) {
      var cls = "tool-row";
      if (tool.state === "coming-soon") cls += " tool-row-coming";
      if (self._selectedTool === tool.id) cls += " tool-row-active";
      var badge = tool.state === "coming-soon" ? " <span class=\"tool-coming-badge\">Coming Soon</span>" : "";
      html += "<div class=\"" + cls + "\" data-tool-id=\"" + tool.id + "\">" + tool.name + badge + "</div>";
    });
    html += "</div>";

    // Right panel - outputs
    html += "<div class=\"outputs-panel\" id=\"outputs-panel\">";
    if (!this._selectedTool) {
      html += "<div class=\"outputs-empty\">Select a tool from the list to view its outputs.</div>";
    }
    html += "</div>";

    html += "</div>";
    container.innerHTML = html;

    // Wire up tool row clicks
    var rows = container.querySelectorAll(".tool-row:not(.tool-row-coming)");
    rows.forEach(function(row) {
      row.addEventListener("click", function() {
        self._selectedTool = row.getAttribute("data-tool-id");
        // Update active state
        container.querySelectorAll(".tool-row").forEach(function(r) {
          r.classList.remove("tool-row-active");
        });
        row.classList.add("tool-row-active");
        self._loadOutputs(self._selectedTool);
      });
    });
  },

  _loadOutputs: function(toolId) {
    var panel = document.getElementById("outputs-panel");
    if (!panel) return;
    var self = this;

    panel.innerHTML = "<div class=\"outputs-loading\">Loading outputs\u2026</div>";

    if (!this._supabase) {
      panel.innerHTML = "<div class=\"outputs-empty\">Unable to load outputs. Please refresh the page.</div>";
      return;
    }

    this._supabase
      .from("content_library")
      .select("id, title, body, created_at, tool_tags, status, source")
      .eq("status", "approved")
      .eq("source", "tool")
      .contains("tool_tags", [toolId])
      .order("created_at", { ascending: false })
      .then(function(result) {
        if (result.error) {
          panel.innerHTML = "<div class=\"outputs-empty\">Could not load outputs.</div>";
          return;
        }
        var rows = result.data || [];
        if (rows.length === 0) {
          panel.innerHTML = "<div class=\"outputs-empty\">No outputs yet for this tool. Outputs will appear here once the tool generates and approves content.</div>";
          return;
        }
        var html = "<div class=\"outputs-list\">";
        rows.forEach(function(row) {
          var date = row.created_at ? new Date(row.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";
          var excerpt = row.body ? row.body.substring(0, 180).replace(/</g, "&lt;") + (row.body.length > 180 ? "\u2026" : "") : "";
          html += "<div class=\"output-card\">";
          html += "<div class=\"output-card-title\">" + (row.title || "Untitled") + "</div>";
          html += "<div class=\"output-card-date\">" + date + "</div>";
          html += "<div class=\"output-card-excerpt\">" + excerpt + "</div>";
          html += "<button class=\"output-card-btn\" data-id=\"" + row.id + "\">View Full</button>";
          html += "</div>";
        });
        html += "</div>";
        panel.innerHTML = html;

        // Wire up View Full buttons
        panel.querySelectorAll(".output-card-btn").forEach(function(btn) {
          btn.addEventListener("click", function() {
            self._viewFull(btn.getAttribute("data-id"), rows);
          });
        });
      });
  },

  _viewFull: function(id, rows) {
    var row = rows.find(function(r) { return String(r.id) === String(id); });
    if (!row) return;
    var modal = document.getElementById("item-modal");
    if (!modal) return;
    var titleEl = document.getElementById("modal-item-title");
    var bodyEl = document.getElementById("modal-item-body");
    if (titleEl) titleEl.textContent = row.title || "Untitled";
    if (bodyEl) bodyEl.textContent = row.body || "";
    modal.classList.add("active");
  }
};
