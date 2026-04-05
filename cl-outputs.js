window.CL_OUTPUTS = {
  _supabase: null,
  _selectedTool: null,

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
  },

  _render: function() {
    var container = document.getElementById('cl-tab-outputs');
    if (!container) return;

    var self = this;
    var coreTools = window.CORE_TOOLS || [];
    var activated = window._activatedTools || [];

    // Split into active (subscribed) and coming soon
    var activeTools = [];
    var comingTools = [];
    coreTools.forEach(function(tool) {
      var name = Array.isArray(tool.title) ? tool.title.join(' ') : (tool.title || tool.id);
      var entry = { id: tool.id, name: name, icon: tool.icon || '' };
      if (activated.indexOf(tool.id) > -1) {
        activeTools.push(entry);
      } else {
        comingTools.push(entry);
      }
    });

    // Default selection — first active tool
    if (!this._selectedTool && activeTools.length > 0) {
      this._selectedTool = activeTools[0].id;
    }

    var html = "<div class=\"outputs-layout\">";

    // Left sidebar
    html += "<div class=\"outputs-sidebar\">";
    html += "<div class=\"outputs-sidebar-title\">AI Tool Outputs</div>";

    activeTools.forEach(function(tool) {
      var cls = "tool-row" + (self._selectedTool === tool.id ? " active" : "");
      html += "<div class=\"" + cls + "\" data-tool-id=\"" + tool.id + "\">" +
        "<span class=\"tool-row-icon\">" + tool.icon + "</span>" +
        "<span class=\"tool-row-name\">" + tool.name + "</span>" +
        "</div>";
    });

    if (comingTools.length > 0) {
      html += "<hr class=\"outputs-sidebar-divider\">";
      comingTools.forEach(function(tool) {
        html += "<div class=\"tool-row-coming\" data-tool-id=\"" + tool.id + "\">" +
          "<span class=\"tool-row-icon\">" + tool.icon + "</span>" +
          "<span class=\"tool-row-name\">" + tool.name + "</span>" +
          "<span class=\"tool-coming-badge\">Coming Soon</span>" +
          "</div>";
      });
    }

    html += "</div>";

    // Right panel
    html += "<div class=\"outputs-panel\" id=\"outputs-panel\"></div>";
    html += "</div>";
    container.innerHTML = html;

    // Wire up active tool row clicks
    container.querySelectorAll(".tool-row:not(.tool-row-coming)").forEach(function(row) {
      row.addEventListener("click", function() {
        self._selectedTool = row.getAttribute("data-tool-id");
        container.querySelectorAll(".tool-row").forEach(function(r) { r.classList.remove("active"); });
        row.classList.add("active");
        self._loadOutputs(self._selectedTool);
      });
    });

    // Auto-load first selected tool
    if (this._selectedTool) {
      this._loadOutputs(this._selectedTool);
    }
  },

  _loadOutputs: async function(toolId) {
    var panel = document.getElementById("outputs-panel");
    if (!panel) return;
    var self = this;

    panel.innerHTML = "<div class=\"outputs-loading\">Loading outputs\u2026</div>";

    if (!this._supabase) {
      panel.innerHTML = "<div class=\"outputs-empty\">Unable to load outputs. Please refresh the page.</div>";
      return;
    }

    var authResp = await this._supabase.auth.getUser();
    var user = authResp.data ? authResp.data.user : null;
    if (!user) { panel.innerHTML = '<div class="outputs-empty">Please sign in to view outputs.</div>'; return; }
    this._supabase
      .from("content_library")
      .select("id, title, content_text, created_at, tool_tags, status, source")
      .eq("user_id", user.id)
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
          var excerpt = row.content_text ? row.content_text.substring(0, 180).replace(/</g, "&lt;") + (row.content_text.length > 180 ? "\u2026" : "") : "";
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
    if (bodyEl) bodyEl.textContent = row.content_text || "";
    modal.classList.add("active");
  }
};
