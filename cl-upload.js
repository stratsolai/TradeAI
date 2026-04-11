// cl-upload.js — Upload & Import tab logic
// Part of Content Library split architecture
// Rebuilt per CL New Features Spec v1.2 Section 5

window.CL_UPLOAD = {

  _supabase: null,

  // Display names for each scan source tile. Used by completion
  // messages and the job restore logic on page load.
  _SOURCE_NAMES: {
    gdrive: "Google Drive",
    onedrive: "OneDrive",
    sharepoint: "SharePoint",
    dropbox: "Dropbox",
    gmail: "Gmail",
    outlook: "Outlook",
    website: "Website"
  },

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
    this._bindEvents();
    this._loadConnectionStatus();
    this._restoreActiveJobs();
  },

  _render: function() {
    var container = document.getElementById("cl-tab-upload");
    if (!container) return;
    container.innerHTML = [
      "<div class=\"upload-tab-inner\">",
      "<div class=\"upload-primary-actions\">",
        "<button id=\"cl-photo-btn\" class=\"upload-primary-btn\">",
          "<span class=\"upload-btn-icon\">📷</span>",
          "<span class=\"upload-btn-label\">Add Photo</span>",
          "<span class=\"upload-btn-sub\">Tap to add a photo from your device</span>",
        "</button>",
        "<button class=\"upload-primary-btn\" id=\"cl-doc-drop\">",
          "<span class=\"upload-btn-icon\">📄</span>",
          "<span class=\"upload-btn-label\">Upload Document or File</span>",
          "<span class=\"upload-btn-sub\">Drag and drop or tap to browse</span>",
        "</button>",
        "<button class=\"upload-primary-btn\" id=\"cl-manual-btn\">",
          "<span class=\"upload-btn-icon\" style=\"font-size:inherit\">✏️</span>",
          "<span class=\"upload-btn-label\">Add Manual Item</span>",
          "<span class=\"upload-btn-sub\">Add content directly to your library</span>",
        "</button>",
      "</div>",
      "<div id=\"cl-manual-flow\" class=\"manual-add-flow\" style=\"display:none\">",
        "<div class=\"manual-add-title\" style=\"font-size:15px;font-weight:600;color:#333;\">Add Manual Item</div>",
        "<label class=\"manual-add-label\" style=\"margin-top:12px\">Title <span style=\"color:#c00\">*</span></label>",
        "<input type=\"text\" id=\"cl-manual-title\" class=\"manual-add-input\" placeholder=\"Enter a title for this item\">",
        "<label class=\"manual-add-label\" style=\"margin-top:12px\">Description</label>",
        "<textarea id=\"cl-manual-desc\" class=\"manual-add-textarea\" rows=\"4\" placeholder=\"Enter a description (optional)\"></textarea>",
        "<label class=\"manual-add-label\">Tagged Tools <span style=\"color:#c00\">*</span></label>",
        "<div id=\"cl-manual-tools\" class=\"manual-add-pills\" style=\"display:flex;flex-wrap:wrap;gap:8px;\"></div>",
        "<div id=\"cl-manual-error\" class=\"manual-add-error\" style=\"display:none\"></div>",
        "<div class=\"manual-add-actions\" style=\"display:flex;gap:12px;margin-top:12px;\">",
          "<button id=\"cl-manual-submit\" class=\"btn-dismiss\" style=\"border-color:var(--blue);color:var(--blue);min-width:100px;justify-content:center;\">Add</button>",
          "<button id=\"cl-manual-cancel\" class=\"btn-dismiss\" style=\"min-width:100px;justify-content:center;\">Cancel</button>",
        "</div>",
      "</div>",
      "<input type=\"file\" id=\"cl-photo-input\" accept=\"image/*\" capture=\"environment\" style=\"display:none\" multiple>",
      "<input type=\"file\" id=\"cl-doc-input\" accept=\".pdf,.doc,.docx,.txt,.xlsx,.xls,.ppt,.pptx,.html,.htm\" style=\"display:none\" multiple>",
      "<div id=\"cl-offline-banner\" class=\"offline-banner\" style=\"display:none\">",
        "<span>You appear to be offline. Files will be queued and uploaded when you reconnect.</span>",
        "<button class=\"btn-dismiss\" id=\"cl-offline-dismiss\">&#10007; Dismiss</button>",
      "</div>",
      // Stacking message container — each completed scan appends its
      // own dismissible row instead of overwriting a single shared
      // message. The container is hidden when empty and revealed
      // automatically by _appendUploadMessage. Existing code paths
      // (_showProcessing, _showUploadConfirmation, _showUploadError)
      // all flow through the same append helper now.
      "<div id=\"cl-upload-confirm\" class=\"upload-confirm\" style=\"display:none;flex-direction:column;gap:8px;align-items:stretch;\"></div>",
      "<div class=\"upload-section\" style=\"margin-top:16px\">",
        "<div class=\"upload-section-title\">Sources</div>",
        "<div class=\"upload-section-note\">Scans run in the background. You can navigate away safely.</div>",
        "<div class=\"sources-tiles\" id=\"cl-sources-grid\">",
          "<div class=\"source-tile source-tile-loading\"><span>Checking connections...</span></div>",
        "</div>",
      "</div>",
      "</div>"
    ].join("\n");
  },

  _bindEvents: function() {
    var self = this;
    var photoBtn = document.getElementById("cl-photo-btn");
    var photoInput = document.getElementById("cl-photo-input");
    if (photoBtn && photoInput) {
      photoBtn.addEventListener("click", function() { photoInput.click(); });
      photoInput.addEventListener("change", function(e) {
        var files = Array.from(e.target.files || []);
        if (files.length) self._handlePhotoUpload(files);
        photoInput.value = "";
      });
    }
    var docInput = document.getElementById("cl-doc-input");
    var dropZone = document.getElementById("cl-doc-drop");
    if (dropZone && docInput) {
      dropZone.addEventListener("click", function() { docInput.click(); });
      docInput.addEventListener("change", function(e) {
        var files = Array.from(e.target.files || []);
        if (files.length) self._handleDocUpload(files);
        docInput.value = "";
      });
      dropZone.addEventListener("dragover", function(e) { e.preventDefault(); dropZone.classList.add("drag-over"); });
      dropZone.addEventListener("dragleave", function() { dropZone.classList.remove("drag-over"); });
      dropZone.addEventListener("drop", function(e) {
        e.preventDefault(); dropZone.classList.remove("drag-over");
        var files = Array.from(e.dataTransfer.files || []);
        if (files.length) self._handleDocUpload(files);
      });
    }
    // Manual Add Item tile, flow, and submit
    var manualBtn = document.getElementById("cl-manual-btn");
    var manualFlow = document.getElementById("cl-manual-flow");
    if (manualBtn && manualFlow) {
      manualBtn.addEventListener("click", function() { self._openManualAdd(); });
      var cancelBtn = document.getElementById("cl-manual-cancel");
      if (cancelBtn) cancelBtn.addEventListener("click", function() { manualFlow.style.display = "none"; });
      var submitBtn = document.getElementById("cl-manual-submit");
      if (submitBtn) submitBtn.addEventListener("click", function() { self._handleManualAdd(); });
    }
    var dismissBtn = document.getElementById("cl-offline-dismiss");
    if (dismissBtn) { dismissBtn.addEventListener("click", function() { var b = document.getElementById("cl-offline-banner"); if (b) b.style.display = "none"; }); }
    if (!navigator.onLine) { var b = document.getElementById("cl-offline-banner"); if (b) b.style.display = "flex"; }
    window.addEventListener("offline", function() { var b = document.getElementById("cl-offline-banner"); if (b) b.style.display = "flex"; });
    window.addEventListener("online", function() { var b = document.getElementById("cl-offline-banner"); if (b) b.style.display = "none"; });
  },

  _loadConnectionStatus: async function() {
    var supabase = this._supabase;
    var grid = document.getElementById("cl-sources-grid");
    if (!grid) return;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;
      var resp = await supabase.from("profiles").select("cl_drive_accounts, cl_connected_emails, website_urls, cl_onedrive_accounts, cl_sharepoint_accounts, cl_dropbox_accounts").eq("id", user.id).single();
      var profile = resp.data || {};
      var tiles = [];

      var connectedEmails = profile.cl_connected_emails || [];
      var gmailAccounts = connectedEmails.filter(function(e) { return e && (e.provider === "gmail" || e.provider === "google"); });
      var outlookAccounts = connectedEmails.filter(function(e) { return e && (e.provider === "microsoft" || e.provider === "outlook"); });

      if (gmailAccounts.length > 0) {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Business Gmail Inbox - scans all emails and extracts relevant content.", connected: true, pills: gmailAccounts.map(function(a) { return { label: a.email, value: a.email }; }), note: "Previously scanned emails are skipped on rescan." });
      } else {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Connect your business Gmail inbox to scan for supplier updates and business content.", connected: false, pills: [] });
      }

      if (outlookAccounts.length > 0) {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Business Outlook Inbox - scans all emails and extracts relevant content.", connected: true, pills: outlookAccounts.map(function(a) { return { label: a.email, value: a.email }; }), note: "Previously scanned emails are skipped on rescan." });
      } else {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Connect your business Outlook inbox to scan for supplier updates and business content.", connected: false, pills: [] });
      }

      function buildAccountGroups(accounts, itemsKey) {
        var groups = [];
        (accounts || []).forEach(function(a) {
          if (!a || !a.account_email) return;
          var items = Array.isArray(a[itemsKey]) ? a[itemsKey] : [];
          var groupPills = [];
          items.forEach(function(it) {
            if (!it || !it.id) return;
            groupPills.push({ label: it.name || it.id, value: a.account_email + "|" + it.id });
          });
          if (groupPills.length > 0) groups.push({ account: a.account_email, items: groupPills });
        });
        return groups;
      }
      function flattenGroups(groups) {
        var flat = [];
        groups.forEach(function(g) { g.items.forEach(function(p) { flat.push(p); }); });
        return flat;
      }

      // Dropbox-specific group builder. Unlike buildAccountGroups, this
      // always emits one group per connected account regardless of
      // subfolder selection, and prepends a synthetic "Dropbox root
      // files" pill so the user can always see and select the account's
      // root. The pill value uses the same accountEmail|<id> shape as
      // the other source tiles, with an empty id so the scan handler
      // reads folderPath as "" — which the dropbox-import endpoint
      // accepts as a root scan. The root pill is unselected by default
      // to match every other tile.
      function buildDropboxGroups(accounts) {
        var groups = [];
        (accounts || []).forEach(function (a) {
          if (!a || !a.account_email) return;
          var groupPills = [{ label: "Dropbox root files", value: a.account_email + "|" }];
          var folders = Array.isArray(a.folders) ? a.folders : [];
          folders.forEach(function (it) {
            if (!it || !it.id) return;
            groupPills.push({ label: it.name || it.id, value: a.account_email + "|" + it.id });
          });
          groups.push({ account: a.account_email, items: groupPills });
        });
        return groups;
      }

      var driveAccounts = Array.isArray(profile.cl_drive_accounts) ? profile.cl_drive_accounts : [];
      var driveGroups = buildAccountGroups(driveAccounts, "folders");
      tiles.push({ id: "gdrive", icon: "📂", name: "Google Drive", desc: "Imports and scans documents and files from your connected Drive folders.", connected: driveGroups.length > 0, pills: flattenGroups(driveGroups), groups: driveGroups, note: "Previously scanned files are skipped on rescan." });

      var onedriveAccounts = Array.isArray(profile.cl_onedrive_accounts) ? profile.cl_onedrive_accounts : [];
      var onedriveGroups = buildAccountGroups(onedriveAccounts, "folders");
      tiles.push({ id: "onedrive", icon: "☁️", name: "OneDrive", desc: "Imports and scans documents and files from your connected OneDrive folders.", connected: onedriveGroups.length > 0, pills: flattenGroups(onedriveGroups), groups: onedriveGroups, note: "Previously scanned files are skipped on rescan." });

      // SharePoint accounts hold a `sites` array; each site has its own
      // `libraries` array. Lazy-upgrade legacy { site, libraries } entries
      // in-memory so the rest of this code can assume the new shape.
      function upgradeSharepointEntry(entry) {
        if (!entry) return;
        if (entry.site && entry.site.id) {
          if (!Array.isArray(entry.sites)) entry.sites = [];
          var siteAlreadyIn = entry.sites.some(function (s) { return s && s.id === entry.site.id; });
          if (!siteAlreadyIn) {
            entry.sites.push({
              id: entry.site.id,
              displayName: entry.site.displayName,
              webUrl: entry.site.webUrl,
              libraries: Array.isArray(entry.libraries) ? entry.libraries : [],
            });
          }
          delete entry.site;
          delete entry.libraries;
        } else if (!Array.isArray(entry.sites)) {
          entry.sites = [];
        }
      }
      // For SharePoint, each pill group represents one site under one
      // account; the pill value encodes accountEmail|siteId|libraryId so
      // the scan handler can address the right library on the right site.
      function buildSharepointGroups(accounts) {
        var groups = [];
        (accounts || []).forEach(function (a) {
          if (!a || !a.account_email) return;
          upgradeSharepointEntry(a);
          var sites = Array.isArray(a.sites) ? a.sites : [];
          sites.forEach(function (s) {
            if (!s || !s.id) return;
            var libraries = Array.isArray(s.libraries) ? s.libraries : [];
            var groupPills = [];
            libraries.forEach(function (lib) {
              if (!lib || !lib.id) return;
              groupPills.push({ label: lib.name || lib.id, value: a.account_email + "|" + s.id + "|" + lib.id });
            });
            if (groupPills.length > 0) {
              groups.push({ account: a.account_email + " — " + (s.displayName || s.name || s.id), items: groupPills });
            }
          });
        });
        return groups;
      }
      var sharepointAccounts = Array.isArray(profile.cl_sharepoint_accounts) ? profile.cl_sharepoint_accounts : [];
      var sharepointGroups = buildSharepointGroups(sharepointAccounts);
      tiles.push({ id: "sharepoint", icon: "🗂️", name: "SharePoint", desc: "Imports and scans documents from your connected SharePoint document libraries.", connected: sharepointGroups.length > 0, pills: flattenGroups(sharepointGroups), groups: sharepointGroups, note: "Previously scanned files are skipped on rescan." });

      var dropboxAccounts = Array.isArray(profile.cl_dropbox_accounts) ? profile.cl_dropbox_accounts : [];
      // Stash the accounts list on the instance so _handleScanNow can fall
      // back to scanning every account's root when the user clicks Scan
      // Now without selecting any pills, without re-fetching the profile.
      this._dropboxAccounts = dropboxAccounts;
      var dropboxGroups = buildDropboxGroups(dropboxAccounts);
      // Connected state reflects whether a Dropbox account is authenticated,
      // not whether the user has picked any subfolders. Root-level files are
      // included automatically on every scan, so an account with no
      // subfolder selections is still a valid scannable connection.
      tiles.push({ id: "dropbox", icon: "📦", name: "Dropbox", desc: "Imports and scans documents and files from your connected Dropbox folders.", connected: dropboxAccounts.length > 0, pills: flattenGroups(dropboxGroups), groups: dropboxGroups, note: "Previously scanned files are skipped on rescan." });

      var websiteUrls = (profile.website_urls && profile.website_urls.length > 0) ? profile.website_urls.filter(Boolean) : [];
      tiles.push({ id: "website", icon: "🌐", name: "Website", desc: websiteUrls.length > 0 ? "Scans your website for service descriptions, team info and other business content." : "Add your website URL in CL Settings to scan for business content.", connected: websiteUrls.length > 0, pills: websiteUrls.map(function(u) { return { label: u, value: u }; }), note: websiteUrls.length > 0 ? "Rescanning reproduces all content as new Items." : "" });

      grid.innerHTML = tiles.map(function(t, idx) {
        // When the last tile would otherwise sit alone in the left column
        // of the 2-column grid (odd tile count), span it across both grid
        // columns and centre it inside that span. The tile keeps its
        // normal one-column width via the calc() that mirrors the grid's
        // 1fr minus half the 16px gap.
        var tileStyle = '';
        if (idx === tiles.length - 1 && tiles.length % 2 === 1) {
          tileStyle = ' style="grid-column:1 / -1;justify-self:center;width:calc((100% - 16px) / 2);"';
        }
        var pillsHtml = "";
        if (t.groups && t.groups.length > 0) {
          pillsHtml = "<div class=\"source-pill-instruction\" style=\"text-align:center;\">Select the folders to scan:</div>" +
            t.groups.map(function(g) {
              return "<div class=\"source-pill-group\" style=\"display:flex;flex-direction:column;align-items:center;margin-bottom:8px;\">" +
                "<div class=\"source-pill-account\" style=\"font-size:12px;font-weight:600;color:#555;margin-bottom:4px;text-align:center;\">" + g.account + "</div>" +
                "<div class=\"source-select-pills\" style=\"justify-content:center;\">" + g.items.map(function(p) {
                  return "<button class=\"source-select-pill\" data-value=\"" + p.value + "\">" + p.label + "</button>";
                }).join("") + "</div>" +
                "</div>";
            }).join("");
        } else if (t.pills && t.pills.length > 0) {
          pillsHtml = "<div class=\"source-pill-instruction\" style=\"text-align:center;\">Select the " + (t.id === "website" ? "URLs" : "accounts") + " to scan:</div>" +
            "<div class=\"source-select-pills\" style=\"justify-content:center;\">" + t.pills.map(function(p) {
              return "<button class=\"source-select-pill\" data-value=\"" + p.value + "\">" + p.label + "</button>";
            }).join("") + "</div>";
        }
        // Pin the note to just above the action buttons regardless of how
        // much pill content sits above it. The .source-tile container is a
        // flex column where .source-tile-actions is normally pushed to the
        // bottom by margin-top:auto. With short pill content (e.g. Dropbox
        // showing only the root pill) the unmargined note floats up near
        // the description and a large gap opens between the note and the
        // actions. Giving the note its own margin-top:auto absorbs that
        // free space ahead of the actions, so the note sits flush above
        // the buttons across every tile. Actions has its CSS margin-top
        // overridden to 0 in this case so the two do not compete for the
        // auto space. Tiles without a note (e.g. Gmail/Outlook/Website
        // before any account is connected) keep the original behaviour —
        // .source-tile-actions retains its CSS margin-top:auto and pins
        // itself to the bottom on its own.
        var noteHtml = t.note ? "<div class=\"source-tile-note\" style=\"margin-top:auto;\">" + t.note + "</div>" : "";
        var actionsStyle = t.note ? " style=\"margin-top:0;\"" : "";
        return [
          "<div class=\"source-tile\"" + tileStyle + ">",
            "<div class=\"source-tile-top\">",
              "<span class=\"source-tile-icon\">" + t.icon + "</span>",
              "<div class=\"source-tile-body\">",
                "<div class=\"source-tile-name\">" + t.name + "</div>",
                "<div class=\"source-tile-desc\">" + t.desc + "</div>",
              "</div>",
            "</div>",
            pillsHtml,
            noteHtml,
            "<div class=\"source-tile-actions\"" + actionsStyle + ">",
              "<button class=\"source-action-btn source-scan-btn" + (t.connected ? "" : " source-btn-disabled") + "\" data-source=\"" + t.id + "\"" + (t.connected ? "" : " disabled") + ">Scan Now</button>",
              "<button class=\"source-action-btn source-stop-btn\" data-source=\"" + t.id + "\">Stop Scan</button>",
              "<a href=\"/library/settings\" class=\"source-action-btn source-connect-btn\">Connect" + (t.connected ? " Another" : " Now") + "</a>",
            "</div>",
          "</div>"
        ].join("\n");
      }).join("\n");

      var self = this;
      grid.querySelectorAll(".source-select-pill").forEach(function(pill) {
        pill.addEventListener("click", function() {
          pill.classList.toggle("selected");
        });
      });
      grid.querySelectorAll(".source-scan-btn:not(.source-btn-disabled)").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var tile = btn.closest(".source-tile");
          var pills = tile ? tile.querySelectorAll(".source-select-pill.selected") : [];
          var values = [];
          pills.forEach(function(p) { values.push(p.getAttribute("data-value")); });
          // tile is passed through so _handleScanNow can resolve
          // each pill value back to its user-friendly text label
          // (folder name, library name, account email, etc.) for
          // the per-scan completion message.
          self._handleScanNow(btn.getAttribute("data-source"), btn, values, tile);
        });
      });
      grid.querySelectorAll(".source-stop-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var stopSource = btn.getAttribute("data-source");
          self._handleStopScan(stopSource);
        });
      });

    } catch (err) {
      if (grid) grid.innerHTML = "<div class=\"source-tile-error\">Unable to load connection status. Please refresh the page.</div>";
    }
  },

  _scanCancelled: false,

  // Active Realtime subscriptions keyed by job id — unsubscribed when
  // the job reaches a terminal state (completed / failed / cancelled).
  _jobSubscriptions: {},

  // Active job IDs keyed by source tile id — used by the Stop Scan
  // button to delete queued jobs or cancel running jobs.
  _activeJobs: {},

  _handleScanNow: function(source, btn, values, tile) {
      var self = this;
      self._scanCancelled = false;
      var originalText = btn.textContent;
      btn.textContent = "Scan Queued...";
      btn.disabled = true;
      function finishScan() {
        btn.textContent = originalText;
        btn.disabled = false;
      }
      // Resolve a pill data-value back to its user-friendly text
      // (folder name, library name, account email). Falls back to
      // the raw value when the pill is not found in the tile (e.g.
      // for synthesised fallback pairs the Dropbox handler builds
      // when the user clicks Scan Now without ticking any pill).
      function pillLabel(value) {
        if (!tile) return value;
        var pills = tile.querySelectorAll(".source-select-pill");
        for (var i = 0; i < pills.length; i++) {
          if (pills[i].getAttribute("data-value") === value) return pills[i].textContent;
        }
        return value;
      }
      // Display name for each scan source. Used by formatCountsLine
      // and the per-branch error paths so every stacking message
      // leads with the tile name (Gmail, OneDrive, etc.) — without
      // this prefix two scans of folders that share a name look
      // identical in the message stack.
      var SOURCE_NAMES = {
        gdrive: "Google Drive",
        onedrive: "OneDrive",
        sharepoint: "SharePoint",
        dropbox: "Dropbox",
        gmail: "Gmail",
        outlook: "Outlook",
        website: "Website"
      };
      function formatJobCountsLine(label, job) {
        return self._formatJobMessage(source, label, job);
      }
      // Map a source tile id + pill value to the { sourceType,
      // sourceAccount, sourcePath } shape that scan-queue expects.
      function buildQueueParams(source, pillValue) {
        if (source === "gmail" || source === "outlook") {
          return { sourceType: source, sourceAccount: pillValue, sourcePath: null };
        }
        if (source === "website") {
          var url = pillValue.trim();
          if (!/^https?:\/\//i.test(url)) url = "https://" + url;
          return { sourceType: "website", sourceAccount: url, sourcePath: null };
        }
        // All folder/library sources encode accountEmail|path in the pill value
        if (source === "gdrive" || source === "onedrive" || source === "dropbox") {
          var sep = pillValue.indexOf("|");
          if (sep === -1) return null;
          return {
            sourceType: source === "gdrive" ? "gdrive" : source,
            sourceAccount: pillValue.substring(0, sep),
            sourcePath: pillValue.substring(sep + 1)
          };
        }
        if (source === "sharepoint") {
          var spParts = pillValue.split("|");
          if (spParts.length !== 3) return null;
          return {
            sourceType: "sharepoint",
            sourceAccount: spParts[0],
            sourcePath: spParts[1] + "|" + spParts[2]
          };
        }
        return null;
      }
      // Subscribe to a single cl_scan_jobs row via Supabase Realtime.
      // Updates the button text as the job transitions through states
      // and appends a stacking message on completion, failure, or
      // cancellation. Cleans up subscription and active job tracking
      // on any terminal state.
      function watchJob(jobId, label) {
        // Track this job as active for the current source tile
        if (!self._activeJobs[source]) self._activeJobs[source] = [];
        self._activeJobs[source].push({ jobId: jobId, status: "queued" });

        var channel = self._supabase
          .channel("scan-job-" + jobId)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "cl_scan_jobs", filter: "id=eq." + jobId },
            function(payload) {
              var row = payload.new;
              if (!row) return;
              // Update tracked status
              var tracked = (self._activeJobs[source] || []).find(function(j) { return j.jobId === jobId; });
              if (tracked) tracked.status = row.status;

              if (row.status === "running") {
                btn.textContent = "Scanning...";
              } else if (row.status === "completed") {
                self._appendUploadMessage(formatJobCountsLine(label, row), "success");
                finishScan();
                if (typeof loadStats === "function") loadStats();
                if (window.CL_REVIEW) window.CL_REVIEW._load();
                // Unsubscribe and remove from active jobs — terminal state
                self._supabase.removeChannel(channel);
                delete self._jobSubscriptions[jobId];
                self._removeActiveJob(source, jobId);
              } else if (row.status === "failed") {
                var errText = row.error_text || "Scan failed";
                var tileName = SOURCE_NAMES[source] || source;
                self._appendUploadMessage(tileName + " — " + label + " — error: " + errText, "error");
                finishScan();
                self._supabase.removeChannel(channel);
                delete self._jobSubscriptions[jobId];
                self._removeActiveJob(source, jobId);
              } else if (row.status === "cancelled") {
                var cancelTileName = SOURCE_NAMES[source] || source;
                self._appendUploadMessage(cancelTileName + " — " + label + " — scan stopped", "error");
                finishScan();
                self._supabase.removeChannel(channel);
                delete self._jobSubscriptions[jobId];
                self._removeActiveJob(source, jobId);
              }
              // queued status after a retry — button stays in queued state
            }
          )
          .subscribe();
        self._jobSubscriptions[jobId] = channel;
      }
      (async function() {
        try {
          var session = await self._supabase.auth.getSession();
          var token = session && session.data && session.data.session ? session.data.session.access_token : null;
          if (!token) throw new Error("Not authenticated");

          // Build the list of queue parameters from the selected pills
          var REQUIRED_PILLS = {
            gdrive: "No Drive folders selected to scan",
            onedrive: "No OneDrive folders selected to scan",
            sharepoint: "No SharePoint libraries selected to scan",
            dropbox: "No Dropbox folders selected to scan",
            gmail: "No Gmail accounts selected to scan",
            outlook: "No Outlook accounts selected to scan",
            website: "No URLs selected to scan"
          };
          var pills = values || [];
          if (pills.length === 0) throw new Error(REQUIRED_PILLS[source] || "No items selected to scan");

          // Queue each selected pill as a separate scan job
          var queuedCount = 0;
          for (var i = 0; i < pills.length; i++) {
            if (self._scanCancelled) break;
            var params = buildQueueParams(source, pills[i]);
            if (!params) {
              console.error("Malformed pill value for " + source + ":", pills[i]);
              continue;
            }
            var label = pillLabel(pills[i]);
            var resp = await fetch("/api/scan-queue", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
              body: JSON.stringify({
                sourceType: params.sourceType,
                sourceAccount: params.sourceAccount,
                sourcePath: params.sourcePath
              })
            });
            var result;
            try { result = await resp.json(); } catch (e) { result = { error: "Server returned an invalid response" }; }
            if (!resp.ok || result.error) {
              var tileName = SOURCE_NAMES[source] || source;
              self._appendUploadMessage(tileName + " — " + label + " — error: " + (result.error || "Queue failed"), "error");
              continue;
            }
            queuedCount++;
            // Subscribe to Realtime updates for this job
            watchJob(result.jobId, label);
          }

          if (queuedCount === 0) {
            finishScan();
          }
          if (self._scanCancelled) {
            self._appendUploadMessage("Scan stopped.", "error");
            finishScan();
          }
        } catch (err) {
          console.error("Scan error:", err.message);
          self._appendUploadMessage(err.message, "error");
          finishScan();
        }
      })();
    },

  // Build a completion message line from the full set of counts on a
  // cl_scan_jobs row. Shows approved, pending, rejected, skipped as
  // the primary counts. Appends deduped, auto_archived, fin_docs_paired
  // when non-zero. For website scans, appends pages_crawled and
  // pages_skipped. Returns "no new content" when all primary counts
  // are zero.
  _formatJobMessage: function(source, label, row) {
    var a = (row && row.approved_count) || 0;
    var p = (row && row.pending_count) || 0;
    var r = (row && row.rejected_count) || 0;
    var sk = (row && row.skipped_count) || 0;
    var parts = [];
    if (a > 0) parts.push(a + " approved");
    if (p > 0) parts.push(p + " pending");
    if (r > 0) parts.push(r + " rejected");
    var tileName = this._SOURCE_NAMES[source] || source;
    var line = tileName + " — " + label + " — " + (parts.length > 0 ? parts.join(", ") : "no new content");
    var ded = (row && row.deduped_count) || 0;
    if (ded > 0) line += " | " + ded + " already up to date";
    if (sk > 0) line += " | " + sk + " skipped";
    var arch = (row && row.auto_archived_count) || 0;
    var paired = (row && row.fin_docs_paired_count) || 0;
    if (arch > 0) line += " | " + arch + " older version" + (arch !== 1 ? "s" : "") + " archived";
    if (paired > 0) line += " | " + paired + " financial document" + (paired !== 1 ? "s" : "") + " paired for review";
    // Website-specific crawl stats
    if (source === "website") {
      var pc = (row && row.pages_crawled) || 0;
      var ps = (row && row.pages_skipped) || 0;
      if (pc > 0) line += " | " + pc + " page" + (pc !== 1 ? "s" : "") + " crawled";
      if (ps > 0) line += " | " + ps + " page" + (ps !== 1 ? "s" : "") + " skipped";
    }
    return line;
  },

  _removeActiveJob: function(source, jobId) {
    if (!this._activeJobs[source]) return;
    this._activeJobs[source] = this._activeJobs[source].filter(function(j) { return j.jobId !== jobId; });
    if (this._activeJobs[source].length === 0) delete this._activeJobs[source];
  },

  // Subscribe to a cl_scan_jobs row for a source tile that was already
  // in progress when the page loaded. Mirrors the watchJob() closure
  // inside _handleScanNow but operates standalone — finds the tile
  // button from the DOM, sets its text, and subscribes to Realtime.
  _watchJobForSource: function(source, jobId, currentStatus, label) {
    var self = this;
    var grid = document.getElementById("cl-sources-grid");
    if (!grid) return;
    var btn = grid.querySelector(".source-scan-btn[data-source=\"" + source + "\"]");
    if (!btn) return;

    // Set initial button state
    if (currentStatus === "running") {
      btn.textContent = "Scanning...";
      btn.disabled = true;
    } else if (currentStatus === "queued") {
      btn.textContent = "Scan Queued...";
      btn.disabled = true;
    }

    // Track as active job
    if (!self._activeJobs[source]) self._activeJobs[source] = [];
    self._activeJobs[source].push({ jobId: jobId, status: currentStatus });

    var channel = self._supabase
      .channel("scan-job-" + jobId)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cl_scan_jobs", filter: "id=eq." + jobId },
        function(payload) {
          var row = payload.new;
          if (!row) return;
          var tracked = (self._activeJobs[source] || []).find(function(j) { return j.jobId === jobId; });
          if (tracked) tracked.status = row.status;

          if (row.status === "running") {
            btn.textContent = "Scanning...";
          } else if (row.status === "completed") {
            self._appendUploadMessage(self._formatJobMessage(source, label, row), "success");
            btn.textContent = "Scan Now";
            btn.disabled = false;
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            self._supabase.removeChannel(channel);
            delete self._jobSubscriptions[jobId];
            self._removeActiveJob(source, jobId);
          } else if (row.status === "failed") {
            var tileName2 = self._SOURCE_NAMES[source] || source;
            self._appendUploadMessage(tileName2 + " — " + label + " — error: " + (row.error_text || "Scan failed"), "error");
            btn.textContent = "Scan Now";
            btn.disabled = false;
            self._supabase.removeChannel(channel);
            delete self._jobSubscriptions[jobId];
            self._removeActiveJob(source, jobId);
          } else if (row.status === "cancelled") {
            var tileName3 = self._SOURCE_NAMES[source] || source;
            self._appendUploadMessage(tileName3 + " — " + label + " — scan stopped", "error");
            btn.textContent = "Scan Now";
            btn.disabled = false;
            self._supabase.removeChannel(channel);
            delete self._jobSubscriptions[jobId];
            self._removeActiveJob(source, jobId);
          }
        }
      )
      .subscribe();
    self._jobSubscriptions[jobId] = channel;
  },

  // On page load, check for any in-progress scan jobs belonging to the
  // current user and restore their tile state + Realtime subscriptions.
  _restoreActiveJobs: async function() {
    var self = this;
    try {
      var userResp = await self._supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;

      var jobsResp = await self._supabase
        .from("cl_scan_jobs")
        .select("id, source_type, source_account, status")
        .eq("user_id", user.id)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: true });

      var jobs = (jobsResp.data || []);
      if (jobs.length === 0) return;

      console.log("[cl-upload] Restoring", jobs.length, "active job(s) on page load");

      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        // Use source_account as the label (email address, URL, or account)
        var label = job.source_account || job.source_type;
        self._watchJobForSource(job.source_type, job.id, job.status, label);
      }
    } catch (err) {
      console.error("[cl-upload] Restore active jobs error:", err.message);
    }
  },

  _handleStopScan: function(source) {
    var self = this;
    var jobs = self._activeJobs[source];
    if (!jobs || jobs.length === 0) return;

    // Set the legacy flag so the queueing loop in _handleScanNow
    // stops enqueuing further pills
    self._scanCancelled = true;

    // Process each active job for this source tile
    var jobsCopy = jobs.slice();
    jobsCopy.forEach(function(entry) {
      if (entry.status === "queued") {
        // Job hasn't started — delete it from the queue
        self._supabase.from("cl_scan_jobs").delete().eq("id", entry.jobId)
          .then(function() {
            console.log("[cl-upload] Deleted queued job:", entry.jobId);
          });
      } else if (entry.status === "running") {
        // Job is in progress — set to cancelled so the worker abandons it
        self._supabase.from("cl_scan_jobs").update({ status: "cancelled" }).eq("id", entry.jobId)
          .then(function() {
            console.log("[cl-upload] Cancelled running job:", entry.jobId);
          });
      }
      // Clean up the Realtime subscription
      var channel = self._jobSubscriptions[entry.jobId];
      if (channel) {
        self._supabase.removeChannel(channel);
        delete self._jobSubscriptions[entry.jobId];
      }
      self._removeActiveJob(source, entry.jobId);
    });

    // Restore the Scan Now button on this tile
    var grid = document.getElementById("cl-sources-grid");
    if (grid) {
      var scanBtn = grid.querySelector(".source-scan-btn[data-source=\"" + source + "\"]");
      if (scanBtn) {
        scanBtn.textContent = "Scan Now";
        scanBtn.disabled = false;
      }
    }
  },

  _fileToBase64: function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result.split(",")[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  _compressImage: function(file) {
    var MAX_DIM = 1200;
    var QUALITY = 0.85;
    return new Promise(function(resolve, reject) {
      var img = new Image();
      img.onload = function() {
        var w = img.width;
        var h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        var dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = function() { reject(new Error('Failed to load image for compression')); };
      img.src = URL.createObjectURL(file);
    });
  },

  _getDocFileType: function(fileName) {
    var ext = fileName.toLowerCase().split(".").pop();
    if (ext === "pdf") return "pdf";
    if (ext === "txt") return "text";
    if (ext === "doc" || ext === "docx") return "word";
    if (ext === "xlsx" || ext === "xls") return "excel";
    if (ext === "ppt" || ext === "pptx") return "powerpoint";
    if (ext === "html" || ext === "htm") return "html";
    return "text";
  },

  _handlePhotoUpload: async function(files) {
    var imageFiles = [];
    var rejected = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].type && files[i].type.indexOf("image/") === 0) {
        imageFiles.push(files[i]);
      } else {
        rejected.push(files[i].name);
      }
    }
    if (rejected.length > 0) {
      this._showUploadError("Only image files are accepted. Skipped: " + rejected.join(", "));
    }
    if (imageFiles.length === 0) return;
    var self = this;
    var supabase = this._supabase;
    this._showProcessing();
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) { self._hideProcessing(); return; }
      var allItems = [];
      for (var j = 0; j < imageFiles.length; j++) {
        var file = imageFiles[j];
        var fileData = await self._compressImage(file);
        var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var storagePath = user.id + '/upload/' + Date.now() + '_' + safeName;
        var uploadResult = await supabase.storage.from('cl-assets').upload(storagePath, file, { upsert: false });
        if (uploadResult.error) { console.error('cl-assets upload error:', uploadResult.error.message); storagePath = null; }
        var resp = await fetch("/api/process-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Images are compressed to JPEG via canvas before sending.
          // mediaType is always image/jpeg after compression regardless
          // of the original format.
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: "image", fileData: fileData, storagePath: storagePath, mediaType: "image/jpeg" })
        });
        var result = await resp.json();
        if (result.success && Array.isArray(result.items)) {
          allItems = allItems.concat(result.items);
        } else if (result.error) {
          console.error("Photo processing error:", result.error);
        }
      }
      self._hideProcessing();
      if (allItems.length > 0) {
        self._showUploadConfirmation(allItems);
      } else {
        self._showUploadError("No content could be extracted from the selected images.");
      }
      if (typeof loadStats === "function") loadStats();
      if (window.CL_REVIEW) window.CL_REVIEW._load();
    } catch (err) {
      console.error("Photo upload error:", err);
      self._hideProcessing();
      self._showUploadError("An error occurred while processing the images. Please try again.");
    }
  },

  _handleDocUpload: async function(files) {
    var self = this;
    var supabase = this._supabase;
    this._showProcessing();
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) { self._hideProcessing(); return; }
      var allItems = [];
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var fileData = await self._fileToBase64(file);
        var fileType = self._getDocFileType(file.name);
        var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var storagePath = user.id + '/upload/' + Date.now() + '_' + safeName;
        var uploadResult = await supabase.storage.from('cl-assets').upload(storagePath, file, { upsert: false });
        if (uploadResult.error) { console.error('cl-assets upload error:', uploadResult.error.message); storagePath = null; }
        var resp = await fetch("/api/process-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: fileType, fileData: fileData, storagePath: storagePath })
        });
        var result = await resp.json();
        if (result.success && Array.isArray(result.items)) {
          allItems = allItems.concat(result.items);
        } else if (result.error) {
          console.error("Document processing error:", result.error);
        }
      }
      self._hideProcessing();
      if (allItems.length > 0) {
        self._showUploadConfirmation(allItems);
      } else {
        self._showUploadError("No content could be extracted from the selected documents.");
      }
      if (typeof loadStats === "function") loadStats();
      if (window.CL_REVIEW) window.CL_REVIEW._load();
    } catch (err) {
      console.error("Document upload error:", err);
      self._hideProcessing();
      self._showUploadError("An error occurred while processing the documents. Please try again.");
    }
  },

  // ── Manual Add Item ───────────────────────────────────────────────

  // The 10 tagging-eligible tool IDs. Matches the tools described in
  // the extraction prompt plus swms, customer-updates, handover-docs.
  _MANUAL_TOOL_IDS: [
    'strategic-plan', 'news-digest', 'chatbot', 'social', 'bi',
    'tender', 'quote-enhancer', 'swms', 'customer-updates', 'handover-docs'
  ],

  // Open the manual add flow, optionally pre-filled (used by Copy in cl-review.js).
  openManualAdd: function(prefill) {
    this._openManualAdd(prefill);
  },

  _openManualAdd: function(prefill) {
    var flow = document.getElementById("cl-manual-flow");
    var titleInput = document.getElementById("cl-manual-title");
    var descInput = document.getElementById("cl-manual-desc");
    var errEl = document.getElementById("cl-manual-error");
    if (!flow || !titleInput || !descInput) return;
    titleInput.value = (prefill && prefill.title) || "";
    descInput.value = (prefill && prefill.description) || "";
    if (errEl) errEl.style.display = "none";
    // Render tool pills
    var toolsEl = document.getElementById("cl-manual-tools");
    if (toolsEl) {
      var coreTools = window.CORE_TOOLS || [];
      var ids = this._MANUAL_TOOL_IDS;
      toolsEl.innerHTML = ids.map(function(tid) {
        var tool = coreTools.find(function(t) { return t.id === tid; });
        var label = tool ? (Array.isArray(tool.title) ? tool.title.join(" ") : (tool.title || tid)) : tid;
        return "<button type=\"button\" class=\"filter-pill manual-tool-pill\" data-tool-id=\"" + tid + "\">" + label + "</button>";
      }).join("");
      toolsEl.querySelectorAll(".manual-tool-pill").forEach(function(pill) {
        pill.addEventListener("click", function() { pill.classList.toggle("active"); });
      });
      // Pre-select tools if prefill provided
      if (prefill && Array.isArray(prefill.tool_tags)) {
        prefill.tool_tags.forEach(function(tid) {
          var p = toolsEl.querySelector("[data-tool-id=\"" + tid + "\"]");
          if (p) p.classList.add("active");
        });
      }
    }
    flow.style.display = "block";
    titleInput.focus();
  },

  _handleManualAdd: async function() {
    var self = this;
    var supabase = this._supabase;
    var titleInput = document.getElementById("cl-manual-title");
    var descInput = document.getElementById("cl-manual-desc");
    var errEl = document.getElementById("cl-manual-error");
    var submitBtn = document.getElementById("cl-manual-submit");
    var title = (titleInput && titleInput.value || "").trim();
    var desc = (descInput && descInput.value || "").trim();
    // Collect selected tool IDs
    var selectedTools = [];
    document.querySelectorAll("#cl-manual-tools .manual-tool-pill.active").forEach(function(p) {
      selectedTools.push(p.dataset.toolId);
    });
    // Validate
    if (!title) { if (errEl) { errEl.textContent = "Title is required."; errEl.style.display = "block"; } return; }
    if (selectedTools.length === 0) { if (errEl) { errEl.textContent = "Select at least one tool."; errEl.style.display = "block"; } return; }
    if (errEl) errEl.style.display = "none";
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Adding..."; }
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) throw new Error("Not signed in");
      // 1. Save .txt to cl-assets
      var safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 80);
      var storagePath = user.id + "/manual/" + Date.now() + "_" + safeTitle + ".txt";
      var textContent = "Title: " + title + "\n\n" + desc;
      await supabase.storage.from("cl-assets").upload(storagePath, new Blob([textContent], { type: "text/plain" }), { upsert: false });
      // 2. Call process-file for AI category extraction
      var fileData = btoa(unescape(encodeURIComponent(textContent)));
      var resp = await fetch("/api/process-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, fileName: title, fileType: "text", fileData: fileData, storagePath: storagePath })
      });
      var result = await resp.json();
      // 3. Update inserted rows: override tool_tags, status, source
      if (result.success && Array.isArray(result.items) && result.items.length > 0) {
        for (var i = 0; i < result.items.length; i++) {
          await supabase.from("content_library").update({
            tool_tags: selectedTools,
            status: "approved",
            source: "manual",
            tool_source: "manual-add"
          }).eq("id", result.items[i].id);
        }
        self._appendUploadMessage("Manual item added: " + title, "success");
      } else {
        self._appendUploadMessage("Manual item added: " + title + " (category could not be determined)", "success");
        // Insert directly if extraction failed
        await supabase.from("content_library").insert({
          user_id: user.id,
          title: title.substring(0, 200),
          content_text: desc,
          category: "Company Information",
          tool_tags: selectedTools,
          status: "approved",
          source: "manual",
          tool_source: "manual-add",
          source_ref: "manual:" + Date.now() + ":0"
        });
      }
      // Reset flow
      var flow = document.getElementById("cl-manual-flow");
      if (flow) flow.style.display = "none";
      if (titleInput) titleInput.value = "";
      if (descInput) descInput.value = "";
      if (typeof loadStats === "function") loadStats();
      if (window.CL_REVIEW) window.CL_REVIEW._load();
    } catch (err) {
      console.error("Manual add error:", err);
      if (errEl) { errEl.textContent = "An error occurred. Please try again."; errEl.style.display = "block"; }
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Add"; }
  },

  // Append a single dismissible message row to the stacking
  // confirmation container. Each row has its own dismiss button so
  // multiple completed scans can sit side-by-side without overwriting
  // each other. The container is auto-shown when the first row is
  // appended and auto-hidden when the last row is dismissed. The
  // type argument controls the visual style hook on the row class
  // ("success" / "error" / "processing") — the actual styling lives
  // in content-library.html and will be tightened during the
  // stylesheet rollout.
  _appendUploadMessage: function(text, type) {
    var container = document.getElementById("cl-upload-confirm");
    if (!container) return null;
    container.style.display = "flex";
    var row = document.createElement("div");
    row.className = "upload-message upload-message-" + (type || "info");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    var span = document.createElement("span");
    span.className = "upload-confirm-pill";
    span.textContent = text;
    var dismissBtn = document.createElement("button");
    dismissBtn.className = "btn-dismiss";
    dismissBtn.innerHTML = "&#10007; Dismiss";
    dismissBtn.addEventListener("click", function () {
      row.parentNode && row.parentNode.removeChild(row);
      if (container.children.length === 0) container.style.display = "none";
    });
    row.appendChild(span);
    row.appendChild(dismissBtn);
    container.appendChild(row);
    return row;
  },

  _clearUploadMessages: function() {
    var container = document.getElementById("cl-upload-confirm");
    if (container) {
      container.innerHTML = "";
      container.style.display = "none";
    }
  },

  _showProcessing: function() {
    // Single-row processing indicator. Tagged with an id so
    // _hideProcessing can find and remove it without disturbing any
    // other stacked messages that may already be present (e.g. from
    // a previous scan whose results the user has not yet dismissed).
    var existing = document.getElementById("cl-upload-processing-row");
    if (existing) return;
    var row = this._appendUploadMessage("Processing...", "processing");
    if (row) row.id = "cl-upload-processing-row";
  },

  _hideProcessing: function() {
    var row = document.getElementById("cl-upload-processing-row");
    if (!row) return;
    row.parentNode && row.parentNode.removeChild(row);
    var container = document.getElementById("cl-upload-confirm");
    if (container && container.children.length === 0) container.style.display = "none";
  },

  // Photo and document uploads still flow through this helper. The
  // array form (used by _handlePhotoUpload and _handleDocUpload, which
  // receive a list of items from /api/process-file) is split into
  // approved/pending/rejected counts. The numeric form is preserved
  // for any caller that passes a count instead of an items array.
  // Both shapes append a new stacking row instead of overwriting a
  // single shared message.
  _showUploadConfirmation: function(itemsOrCount) {
    var msg;
    if (Array.isArray(itemsOrCount)) {
      var pendingCount = 0;
      var approvedCount = 0;
      var rejectedCount = 0;
      itemsOrCount.forEach(function(it) {
        if (it.status === 'pending') pendingCount++;
        else if (it.status === 'approved') approvedCount++;
        else if (it.status === 'rejected') rejectedCount++;
      });
      var parts = [];
      if (approvedCount > 0) parts.push(approvedCount + " approved");
      if (pendingCount > 0) parts.push(pendingCount + " pending");
      if (rejectedCount > 0) parts.push(rejectedCount + " rejected");
      if (parts.length === 0) return;
      msg = "Upload — " + parts.join(", ");
    } else {
      msg = "Upload — " + itemsOrCount + (itemsOrCount === 1 ? " item" : " items") + " imported";
    }
    this._appendUploadMessage(msg, "success");
  },

  _showUploadError: function(msg) {
    this._appendUploadMessage(msg, "error");
  }

};
