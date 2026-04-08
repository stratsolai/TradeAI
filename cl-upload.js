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
      "<input type=\"file\" id=\"cl-doc-input\" accept=\".pdf,.doc,.docx,.txt,.xlsx,.xls\" style=\"display:none\" multiple>",
      "<div id=\"cl-offline-banner\" class=\"offline-banner\" style=\"display:none\">",
        "<span>You appear to be offline. Files will be queued and uploaded when you reconnect.</span>",
        "<button class=\"btn-dismiss\" id=\"cl-offline-dismiss\">&#10007; Dismiss</button>",
      "</div>",
      "<div id=\"cl-upload-confirm\" class=\"upload-confirm\" style=\"display:none\">",
        "<span id=\"cl-upload-confirm-msg\" class=\"upload-confirm-pill\"></span>",
        "<button id=\"cl-upload-dismiss\" class=\"btn-dismiss\" style=\"display:none\">&#10007; Dismiss</button>",
      "</div>",
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
      var dropboxGroups = buildAccountGroups(dropboxAccounts, "folders");
      tiles.push({ id: "dropbox", icon: "📦", name: "Dropbox", desc: "Imports and scans documents and files from your connected Dropbox folders.", connected: dropboxGroups.length > 0, pills: flattenGroups(dropboxGroups), groups: dropboxGroups, note: "Previously scanned files are skipped on rescan. Use Manual Add Item for changes." });

      var websiteUrls = (profile.website_urls && profile.website_urls.length > 0) ? profile.website_urls.filter(Boolean) : [];
      tiles.push({ id: "website", icon: "🌐", name: "Website", desc: websiteUrls.length > 0 ? "Scans your website for service descriptions, team info and other business content." : "Add your website URL in CL Settings to scan for business content.", connected: websiteUrls.length > 0, pills: websiteUrls.map(function(u) { return { label: u, value: u }; }), note: websiteUrls.length > 0 ? "Rescanning reproduces all content as new Pending items. Use Manual Add Item for small changes." : "" });

      grid.innerHTML = tiles.map(function(t) {
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
        var noteHtml = t.note ? "<div class=\"source-tile-note\">" + t.note + "</div>" : "";
        return [
          "<div class=\"source-tile\">",
            "<div class=\"source-tile-top\">",
              "<span class=\"source-tile-icon\">" + t.icon + "</span>",
              "<div class=\"source-tile-body\">",
                "<div class=\"source-tile-name\">" + t.name + "</div>",
                "<div class=\"source-tile-desc\">" + t.desc + "</div>",
              "</div>",
            "</div>",
            pillsHtml,
            noteHtml,
            "<div class=\"source-tile-actions\">",
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
          self._handleScanNow(btn.getAttribute("data-source"), btn, values);
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

  _handleScanNow: function(source, btn, values) {
      var self = this;
      self._scanCancelled = false;
      var originalText = btn.textContent;
      btn.textContent = "Scanning...";
      btn.disabled = true;
      function finishScan() {
        btn.textContent = originalText;
        btn.disabled = false;
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
            var gdTotalImported = 0;
            for (var gdi = 0; gdi < gdPairs.length; gdi++) {
              if (self._scanCancelled) break;
              var gdSep = gdPairs[gdi].indexOf("|");
              if (gdSep === -1) { console.error("Drive scan: malformed pill value", gdPairs[gdi]); continue; }
              var gdAcct = gdPairs[gdi].substring(0, gdSep);
              var gdFolder = gdPairs[gdi].substring(gdSep + 1);
              var gdResp = await fetch("/api/drive-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + gdToken },
                body: JSON.stringify({ action: "import-all", accountEmail: gdAcct, folderId: gdFolder })
              });
              var gdResult = await gdResp.json();
              if (gdResult.success && gdResult.imported) {
                gdTotalImported += gdResult.imported;
              } else if (gdResult.error) {
                console.error("Drive import error for " + gdPairs[gdi] + ":", gdResult.error);
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (gdTotalImported > 0) { self._showUploadConfirmation(gdTotalImported); }
            else { self._showUploadError("No new content found in your connected Drive folders."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "onedrive") {
            var odPairs = values || [];
            if (odPairs.length === 0) throw new Error("No OneDrive folders selected to scan");
            var odSession = await self._supabase.auth.getSession();
            var odToken = odSession && odSession.data && odSession.data.session ? odSession.data.session.access_token : null;
            if (!odToken) throw new Error("Not authenticated");
            var odTotalImported = 0;
            for (var odi = 0; odi < odPairs.length; odi++) {
              if (self._scanCancelled) break;
              var odSep = odPairs[odi].indexOf("|");
              if (odSep === -1) { console.error("OneDrive scan: malformed pill value", odPairs[odi]); continue; }
              var odAcct = odPairs[odi].substring(0, odSep);
              var odFolder = odPairs[odi].substring(odSep + 1);
              var odResp = await fetch("/api/onedrive-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + odToken },
                body: JSON.stringify({ action: "import-all", accountEmail: odAcct, folderId: odFolder })
              });
              var odResult = await odResp.json();
              if (odResult.success && odResult.imported) {
                odTotalImported += odResult.imported;
              } else if (odResult.error) {
                console.error("OneDrive import error for " + odPairs[odi] + ":", odResult.error);
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (odTotalImported > 0) { self._showUploadConfirmation(odTotalImported); }
            else { self._showUploadError("No new content found in your connected OneDrive folders."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "sharepoint") {
            var spPairs = values || [];
            if (spPairs.length === 0) throw new Error("No SharePoint libraries selected to scan");
            var spSession = await self._supabase.auth.getSession();
            var spToken = spSession && spSession.data && spSession.data.session ? spSession.data.session.access_token : null;
            if (!spToken) throw new Error("Not authenticated");
            var spTotalImported = 0;
            for (var spi = 0; spi < spPairs.length; spi++) {
              if (self._scanCancelled) break;
              var spParts = spPairs[spi].split("|");
              if (spParts.length !== 3) { console.error("SharePoint scan: malformed pill value", spPairs[spi]); continue; }
              var spAcct = spParts[0];
              var spSiteId = spParts[1];
              var spLibrary = spParts[2];
              var spResp = await fetch("/api/sharepoint-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + spToken },
                body: JSON.stringify({ action: "import-all", accountEmail: spAcct, siteId: spSiteId, libraryId: spLibrary })
              });
              var spResult = await spResp.json();
              if (spResult.success && spResult.imported) {
                spTotalImported += spResult.imported;
              } else if (spResult.error) {
                console.error("SharePoint import error for " + spPairs[spi] + ":", spResult.error);
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (spTotalImported > 0) { self._showUploadConfirmation(spTotalImported); }
            else { self._showUploadError("No new content found in your connected SharePoint libraries."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "dropbox") {
            var dbPairs = values || [];
            if (dbPairs.length === 0) throw new Error("No Dropbox folders selected to scan");
            var dbSession = await self._supabase.auth.getSession();
            var dbToken = dbSession && dbSession.data && dbSession.data.session ? dbSession.data.session.access_token : null;
            if (!dbToken) throw new Error("Not authenticated");
            var dbTotalImported = 0;
            for (var dbi = 0; dbi < dbPairs.length; dbi++) {
              if (self._scanCancelled) break;
              var dbSep = dbPairs[dbi].indexOf("|");
              if (dbSep === -1) { console.error("Dropbox scan: malformed pill value", dbPairs[dbi]); continue; }
              var dbAcct = dbPairs[dbi].substring(0, dbSep);
              var dbFolderPath = dbPairs[dbi].substring(dbSep + 1);
              var dbResp = await fetch("/api/dropbox-import", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + dbToken },
                body: JSON.stringify({ action: "import-all", accountEmail: dbAcct, folderPath: dbFolderPath })
              });
              var dbResult = await dbResp.json();
              if (dbResult.success && dbResult.imported) {
                dbTotalImported += dbResult.imported;
              } else if (dbResult.error) {
                console.error("Dropbox import error for " + dbPairs[dbi] + ":", dbResult.error);
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (dbTotalImported > 0) { self._showUploadConfirmation(dbTotalImported); }
            else { self._showUploadError("No new content found in your connected Dropbox folders."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "gmail") {
            var gmailEmails = values || [];
            if (gmailEmails.length === 0) throw new Error("No Gmail accounts selected to scan");
            var totalGmailImported = 0;
            for (var gi = 0; gi < gmailEmails.length; gi++) {
              if (self._scanCancelled) break;
              var gmailResp = await fetch("/api/cl-email-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, accountEmail: gmailEmails[gi] })
              });
              var gmailResult = await gmailResp.json();
              if (gmailResult.error) {
                console.error("Gmail scan error for " + gmailEmails[gi] + ":", gmailResult.error);
              } else if (gmailResult.success && gmailResult.imported) {
                totalGmailImported += gmailResult.imported;
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (totalGmailImported > 0) { self._showUploadConfirmation(totalGmailImported); }
            else { self._showUploadError("No new content found in your Gmail inbox."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "outlook") {
            var outlookEmails = values || [];
            if (outlookEmails.length === 0) throw new Error("No Outlook accounts selected to scan");
            var totalOutlookImported = 0;
            for (var oi = 0; oi < outlookEmails.length; oi++) {
              if (self._scanCancelled) break;
              var outlookResp = await fetch("/api/cl-outlook-scan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, accountEmail: outlookEmails[oi] })
              });
              var outlookResult = await outlookResp.json();
              if (outlookResult.error) {
                console.error("Outlook scan error for " + outlookEmails[oi] + ":", outlookResult.error);
              } else if (outlookResult.success && outlookResult.imported) {
                totalOutlookImported += outlookResult.imported;
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (totalOutlookImported > 0) { self._showUploadConfirmation(totalOutlookImported); }
            else { self._showUploadError("No new content found in your Outlook inbox."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "website") {
            var urls = values || [];
            if (urls.length === 0) throw new Error("No URLs selected to scan");
            var totalWebImported = 0;
            for (var j = 0; j < urls.length; j++) {
              if (self._scanCancelled) break;
              var raw = urls[j].trim();
              if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
              var webResp = await fetch("/api/scrape-website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, url: raw })
              });
              var webResult = await webResp.json();
              if (webResult.error) {
                console.error("Website scan error for " + raw + ":", webResult.error);
              } else if (webResult.count) {
                totalWebImported += webResult.count;
              }
            }
            finishScan();
            if (self._scanCancelled) { self._showUploadError("Scan stopped."); }
            else if (totalWebImported > 0) { self._showUploadConfirmation(totalWebImported); }
            else { self._showUploadError("No new content found on your website."); }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          }
        } catch (err) {
          console.error("Scan error:", err.message);
          self._showUploadError(err.message);
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
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: "image", fileData: fileData, storagePath: storagePath })
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

  _showProcessing: function() {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    msgSpan.textContent = "Processing...";
    if (dismissBtn) dismissBtn.style.display = "none";
    confirmDiv.style.display = "flex";
  },

  _hideProcessing: function() {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    if (confirmDiv) confirmDiv.style.display = "none";
  },

  _showUploadConfirmation: function(itemsOrCount) {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    var msg;
    if (Array.isArray(itemsOrCount)) {
      var pendingCount = 0;
      var approvedCount = 0;
      itemsOrCount.forEach(function(it) {
        if (it.status === 'pending') pendingCount++;
        else if (it.status === 'approved') approvedCount++;
      });
      var parts = [];
      if (approvedCount > 0) parts.push(approvedCount + (approvedCount === 1 ? " Item" : " Items") + " Approved");
      if (pendingCount > 0) parts.push(pendingCount + (pendingCount === 1 ? " Item" : " Items") + " Added to Review");
      if (parts.length === 0) return;
      msg = parts.join(", ");
    } else {
      msg = itemsOrCount + (itemsOrCount === 1 ? " item" : " items") + " added to Review.";
    }
    msgSpan.textContent = msg;
    if (dismissBtn) {
      dismissBtn.style.display = "";
      dismissBtn.onclick = function() { confirmDiv.style.display = "none"; };
    }
    confirmDiv.style.display = "flex";
  },

  _showUploadError: function(msg) {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    msgSpan.textContent = msg;
    if (dismissBtn) {
      dismissBtn.style.display = "";
      dismissBtn.onclick = function() { confirmDiv.style.display = "none"; };
    }
    confirmDiv.style.display = "flex";
  }

};
