// cl-upload.js — Upload & Import tab logic
// Part of Content Library split architecture
// Rebuilt per CL New Features Spec v1.2 Section 5

window.CL_UPLOAD = {

  _supabase: null,

  init: function(supabase) {
    this._supabase = supabase;
    this._render();
    this._bindEvents();
    this._loadConnectionStatus();
  },

  _render: function() {
    var container = document.getElementById("cl-tab-upload");
    if (!container) return;
    container.innerHTML = [
      "<div class=\"upload-tab-inner\">",
      "<div class=\"upload-primary-actions\">",
        "<button id=\"cl-photo-btn\" class=\"upload-primary-btn\">",
          "<span class=\"upload-btn-icon\">📷</span>",
          "<span class=\"upload-btn-label\">Take Photo / Add Photo</span>",
          "<span class=\"upload-btn-sub\">Tap to add a photo from your device or camera</span>",
        "</button>",
        "<button class=\"upload-primary-btn\" id=\"cl-doc-drop\">",
          "<span class=\"upload-btn-icon\">📄</span>",
          "<span class=\"upload-btn-label\">Upload Document or File</span>",
          "<span class=\"upload-btn-sub\">Drag and drop or tap to browse</span>",
        "</button>",
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
      "<div class=\"upload-section\">",
        "<div class=\"upload-section-title\">Sources</div>",
        "<div class=\"upload-section-note\">Navigating away from this page will cancel any scan in progress.</div>",
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
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Business Gmail Inbox - scans all emails and extracts relevant content.", connected: true, pills: gmailAccounts.map(function(a) { return { label: a.email, value: a.email }; }) });
      } else {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Connect your business Gmail inbox to scan for supplier updates and business content.", connected: false, pills: [] });
      }

      if (outlookAccounts.length > 0) {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Business Outlook Inbox - scans all emails and extracts relevant content.", connected: true, pills: outlookAccounts.map(function(a) { return { label: a.email, value: a.email }; }) });
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
      tiles.push({ id: "gdrive", icon: "📂", name: "Google Drive", desc: "Imports and scans documents and files from your connected Drive folders.", connected: driveGroups.length > 0, pills: flattenGroups(driveGroups), groups: driveGroups, note: "Previously scanned files are skipped on rescan. Use Manual Add Item for changes." });

      var onedriveAccounts = Array.isArray(profile.cl_onedrive_accounts) ? profile.cl_onedrive_accounts : [];
      var onedriveGroups = buildAccountGroups(onedriveAccounts, "folders");
      tiles.push({ id: "onedrive", icon: "☁️", name: "OneDrive", desc: "Imports and scans documents and files from your connected OneDrive folders.", connected: onedriveGroups.length > 0, pills: flattenGroups(onedriveGroups), groups: onedriveGroups, note: "Previously scanned files are skipped on rescan. Use Manual Add Item for changes." });

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
      tiles.push({ id: "sharepoint", icon: "🗂️", name: "SharePoint", desc: "Imports and scans documents from your connected SharePoint document libraries.", connected: sharepointGroups.length > 0, pills: flattenGroups(sharepointGroups), groups: sharepointGroups, note: "Previously scanned files are skipped on rescan. Use Manual Add Item for changes." });

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
      tiles.push({ id: "dropbox", icon: "📦", name: "Dropbox", desc: "Imports and scans documents and files from your connected Dropbox folders.", connected: dropboxAccounts.length > 0, pills: flattenGroups(dropboxGroups), groups: dropboxGroups, note: "Previously scanned files are skipped on rescan. Use Manual Add Item for changes." });

      var websiteUrls = (profile.website_urls && profile.website_urls.length > 0) ? profile.website_urls.filter(Boolean) : [];
      tiles.push({ id: "website", icon: "🌐", name: "Website", desc: websiteUrls.length > 0 ? "Scans your website for service descriptions, team info and other business content." : "Add your website URL in CL Settings to scan for business content.", connected: websiteUrls.length > 0, pills: websiteUrls.map(function(u) { return { label: u, value: u }; }), note: websiteUrls.length > 0 ? "Rescanning reproduces all content as new Pending items. Use Manual Add Item for small changes." : "" });

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
        btn.addEventListener("click", function() { self._scanCancelled = true; });
      });

    } catch (err) {
      if (grid) grid.innerHTML = "<div class=\"source-tile-error\">Unable to load connection status. Please refresh the page.</div>";
    }
  },

  _scanCancelled: false,

  _handleScanNow: function(source, btn, values, tile) {
      var self = this;
      self._scanCancelled = false;
      var originalText = btn.textContent;
      btn.textContent = "Scanning...";
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
      // Build a "<Tile> — <label> — X approved, Y pending, Z rejected"
      // line from the per-status counts the endpoint returns. Zero
      // counts are omitted to keep the message tidy. When all three
      // are zero the message reads "<Tile> — <label> — no new content".
      // Reads the tile name from SOURCE_NAMES via the closure-scoped
      // source value.
      function formatCountsLine(label, result) {
        var a = (result && result.approved) || 0;
        var p = (result && result.pending) || 0;
        var r = (result && result.rejected) || 0;
        var parts = [];
        if (a > 0) parts.push(a + " approved");
        if (p > 0) parts.push(p + " pending");
        if (r > 0) parts.push(r + " rejected");
        var tileName = SOURCE_NAMES[source] || source;
        return tileName + " — " + label + " — " + (parts.length > 0 ? parts.join(", ") : "no new content");
      }
      // Defensive JSON parse for scan endpoint responses. Vercel
      // returns a plain-text gateway page when a serverless function
      // exceeds maxDuration or crashes — its body starts with
      // "An error occurred with this application." and is not JSON,
      // so a bare await resp.json() throws an unhelpful SyntaxError.
      // safeJson checks resp.ok first and on failure reads the body
      // as text and returns an { error } object the existing branch
      // logic already knows how to handle. The tileName argument is
      // included in the error message so the user sees which scan
      // source failed without having to read a stack trace.
      async function safeJson(resp, tileName) {
        if (!resp.ok) {
          var rawText = "";
          try { rawText = await resp.text(); } catch (e) {}
          var snippet = rawText ? rawText.substring(0, 200) : "";
          return { error: tileName + " server returned " + resp.status + (snippet ? " — " + snippet : "") };
        }
        try {
          return await resp.json();
        } catch (parseErr) {
          return { error: tileName + " returned an invalid response: " + parseErr.message };
        }
      }
      (async function() {
        try {
          var ud = await self._supabase.auth.getUser();
          var user = ud && ud.data ? ud.data.user : null;
          if (!user) throw new Error("Not authenticated");
          if (source === "gdrive") {
            var gdPairs = values || [];
            if (gdPairs.length === 0) throw new Error("No Drive folders selected to scan");
            var gdSession = await self._supabase.auth.getSession();
            var gdToken = gdSession && gdSession.data && gdSession.data.session ? gdSession.data.session.access_token : null;
            if (!gdToken) throw new Error("Not authenticated");
            for (var gdi = 0; gdi < gdPairs.length; gdi++) {
              if (self._scanCancelled) break;
              var gdSep = gdPairs[gdi].indexOf("|");
              if (gdSep === -1) { console.error("Drive scan: malformed pill value", gdPairs[gdi]); continue; }
              var gdAcct = gdPairs[gdi].substring(0, gdSep);
              var gdFolder = gdPairs[gdi].substring(gdSep + 1);
              var gdLabel = pillLabel(gdPairs[gdi]);
              var gdResp = await fetch("/api/drive-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + gdToken },
                body: JSON.stringify({ action: "import-all", accountEmail: gdAcct, folderId: gdFolder })
              });
              var gdResult = await safeJson(gdResp, SOURCE_NAMES.gdrive);
              if (gdResult.error) {
                console.error("Drive import error for " + gdPairs[gdi] + ":", gdResult.error);
                self._appendUploadMessage(SOURCE_NAMES.gdrive + " — " + gdLabel + " — error: " + gdResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(gdLabel, gdResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "onedrive") {
            var odPairs = values || [];
            if (odPairs.length === 0) throw new Error("No OneDrive folders selected to scan");
            var odSession = await self._supabase.auth.getSession();
            var odToken = odSession && odSession.data && odSession.data.session ? odSession.data.session.access_token : null;
            if (!odToken) throw new Error("Not authenticated");
            for (var odi = 0; odi < odPairs.length; odi++) {
              if (self._scanCancelled) break;
              var odSep = odPairs[odi].indexOf("|");
              if (odSep === -1) { console.error("OneDrive scan: malformed pill value", odPairs[odi]); continue; }
              var odAcct = odPairs[odi].substring(0, odSep);
              var odFolder = odPairs[odi].substring(odSep + 1);
              var odLabel = pillLabel(odPairs[odi]);
              var odResp = await fetch("/api/onedrive-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + odToken },
                body: JSON.stringify({ action: "import-all", accountEmail: odAcct, folderId: odFolder })
              });
              var odResult = await safeJson(odResp, SOURCE_NAMES.onedrive);
              if (odResult.error) {
                console.error("OneDrive import error for " + odPairs[odi] + ":", odResult.error);
                self._appendUploadMessage(SOURCE_NAMES.onedrive + " — " + odLabel + " — error: " + odResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(odLabel, odResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "sharepoint") {
            var spPairs = values || [];
            if (spPairs.length === 0) throw new Error("No SharePoint libraries selected to scan");
            var spSession = await self._supabase.auth.getSession();
            var spToken = spSession && spSession.data && spSession.data.session ? spSession.data.session.access_token : null;
            if (!spToken) throw new Error("Not authenticated");
            for (var spi = 0; spi < spPairs.length; spi++) {
              if (self._scanCancelled) break;
              var spParts = spPairs[spi].split("|");
              if (spParts.length !== 3) { console.error("SharePoint scan: malformed pill value", spPairs[spi]); continue; }
              var spAcct = spParts[0];
              var spSiteId = spParts[1];
              var spLibrary = spParts[2];
              var spLabel = pillLabel(spPairs[spi]);
              var spResp = await fetch("/api/sharepoint-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + spToken },
                body: JSON.stringify({ action: "import-all", accountEmail: spAcct, siteId: spSiteId, libraryId: spLibrary })
              });
              var spResult = await safeJson(spResp, SOURCE_NAMES.sharepoint);
              // SharePoint returns the resolved site_name in its
              // response (api/sharepoint-import.js add). Prefix the
              // pill label (which is just the library name) with the
              // site name when present so two libraries with the
              // same name on different sites can be told apart.
              var spDisplayLabel = (spResult.site_name ? spResult.site_name + " / " : "") + spLabel;
              if (spResult.error) {
                console.error("SharePoint import error for " + spPairs[spi] + ":", spResult.error);
                self._appendUploadMessage(SOURCE_NAMES.sharepoint + " — " + spDisplayLabel + " — error: " + spResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(spDisplayLabel, spResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "dropbox") {
            var dbPairs = values || [];
            if (dbPairs.length === 0) throw new Error("No Dropbox folders selected to scan");
            var dbSession = await self._supabase.auth.getSession();
            var dbToken = dbSession && dbSession.data && dbSession.data.session ? dbSession.data.session.access_token : null;
            if (!dbToken) throw new Error("Not authenticated");
            for (var dbi = 0; dbi < dbPairs.length; dbi++) {
              if (self._scanCancelled) break;
              var dbSep = dbPairs[dbi].indexOf("|");
              if (dbSep === -1) { console.error("Dropbox scan: malformed pill value", dbPairs[dbi]); continue; }
              var dbAcct = dbPairs[dbi].substring(0, dbSep);
              var dbFolderPath = dbPairs[dbi].substring(dbSep + 1);
              var dbLabel = pillLabel(dbPairs[dbi]);
              var dbResp = await fetch("/api/dropbox-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + dbToken },
                body: JSON.stringify({ action: "import-all", accountEmail: dbAcct, folderPath: dbFolderPath })
              });
              var dbResult = await safeJson(dbResp, SOURCE_NAMES.dropbox);
              if (dbResult.error) {
                console.error("Dropbox import error for " + dbPairs[dbi] + ":", dbResult.error);
                self._appendUploadMessage(SOURCE_NAMES.dropbox + " — " + dbLabel + " — error: " + dbResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(dbLabel, dbResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "gmail") {
            var gmailEmails = values || [];
            if (gmailEmails.length === 0) throw new Error("No Gmail accounts selected to scan");
            for (var gi = 0; gi < gmailEmails.length; gi++) {
              if (self._scanCancelled) break;
              var gmailLabel = pillLabel(gmailEmails[gi]);
              var gmailResp = await fetch("/api/cl-email-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, accountEmail: gmailEmails[gi] })
              });
              var gmailResult = await safeJson(gmailResp, SOURCE_NAMES.gmail);
              if (gmailResult.error) {
                console.error("Gmail scan error for " + gmailEmails[gi] + ":", gmailResult.error);
                self._appendUploadMessage(SOURCE_NAMES.gmail + " — " + gmailLabel + " — error: " + gmailResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(gmailLabel, gmailResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "outlook") {
            var outlookEmails = values || [];
            if (outlookEmails.length === 0) throw new Error("No Outlook accounts selected to scan");
            for (var oi = 0; oi < outlookEmails.length; oi++) {
              if (self._scanCancelled) break;
              var outlookLabel = pillLabel(outlookEmails[oi]);
              var outlookResp = await fetch("/api/cl-outlook-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, accountEmail: outlookEmails[oi] })
              });
              var outlookResult = await safeJson(outlookResp, SOURCE_NAMES.outlook);
              if (outlookResult.error) {
                console.error("Outlook scan error for " + outlookEmails[oi] + ":", outlookResult.error);
                self._appendUploadMessage(SOURCE_NAMES.outlook + " — " + outlookLabel + " — error: " + outlookResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(outlookLabel, outlookResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "website") {
            var urls = values || [];
            if (urls.length === 0) throw new Error("No URLs selected to scan");
            for (var j = 0; j < urls.length; j++) {
              if (self._scanCancelled) break;
              var raw = urls[j].trim();
              if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
              var webLabel = pillLabel(urls[j]);
              var webResp = await fetch("/api/scrape-website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, url: raw })
              });
              var webResult = await safeJson(webResp, SOURCE_NAMES.website);
              if (webResult.error) {
                console.error("Website scan error for " + raw + ":", webResult.error);
                self._appendUploadMessage(SOURCE_NAMES.website + " — " + webLabel + " — error: " + webResult.error, "error");
              } else {
                self._appendUploadMessage(formatCountsLine(webLabel, webResult), "success");
              }
            }
            finishScan();
            if (self._scanCancelled) self._appendUploadMessage("Scan stopped.", "error");
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          }
        } catch (err) {
          console.error("Scan error:", err.message);
          self._appendUploadMessage(err.message, "error");
        } finally {
          finishScan();
        }
      })();
    },

  _fileToBase64: function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result.split(",")[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
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
        var fileData = await self._fileToBase64(file);
        var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        var storagePath = user.id + '/upload/' + Date.now() + '_' + safeName;
        var uploadResult = await supabase.storage.from('cl-assets').upload(storagePath, file, { upsert: false });
        if (uploadResult.error) { console.error('cl-assets upload error:', uploadResult.error.message); storagePath = null; }
        var resp = await fetch("/api/process-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Pass the browser-detected MIME type as mediaType so the
          // endpoint does not need to guess from filename extension.
          // This is what unblocks HEIC and other modern image formats —
          // process-file.js honours mediaType when present and falls
          // back to its extension lookup when it is not.
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: "image", fileData: fileData, storagePath: storagePath, mediaType: file.type || null })
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
