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
        "<div class=\"upload-primary-btn upload-drop-zone\" id=\"cl-doc-drop\">",
          "<span class=\"upload-btn-icon\">📄</span>",
          "<span class=\"upload-btn-label\">Upload Document or File</span>",
          "<span class=\"upload-btn-sub\">PDF, Word, TXT — drag and drop or tap to browse</span>",
        "</div>",
      "</div>",
      "<input type=\"file\" id=\"cl-photo-input\" accept=\"image/*\" capture=\"environment\" style=\"display:none\" multiple>",
      "<input type=\"file\" id=\"cl-doc-input\" accept=\".pdf,.doc,.docx,.txt\" style=\"display:none\" multiple>",
      "<div id=\"cl-offline-banner\" class=\"offline-banner\" style=\"display:none\">",
        "<span>You appear to be offline. Files will be queued and uploaded when you reconnect.</span>",
        "<button class=\"btn-dismiss\" id=\"cl-offline-dismiss\">\u2715 Dismiss</button>",
      "</div>",
      "<div id=\"cl-upload-confirm\" class=\"upload-confirm\" style=\"display:none\">",
        "<span id=\"cl-upload-confirm-msg\" class=\"upload-confirm-pill\"></span>",
        "<button id=\"cl-upload-dismiss\" class=\"btn-dismiss\" style=\"display:none\">\u2715 Dismiss</button>",
      "</div>",
      "<div class=\"upload-section\">",
        "<div class=\"upload-section-title\">Sources</div>",
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
      var resp = await supabase.from("profiles").select("cl_drive_connected, cl_connected_emails, website_urls").eq("id", user.id).single();
      var profile = resp.data || {};
      var tiles = [];

      var connectedEmails = profile.cl_connected_emails || [];
      var gmailAccounts = connectedEmails.filter(function(e) { return e && (e.provider === "gmail" || e.provider === "google"); });
      var outlookAccounts = connectedEmails.filter(function(e) { return e && (e.provider === "microsoft" || e.provider === "outlook"); });

      if (gmailAccounts.length > 0) {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Business Gmail inbox — scans for supplier updates, industry news and business content.", connected: true, accounts: gmailAccounts });
      } else {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Connect your business Gmail inbox to scan for supplier updates and business content.", connected: false, accounts: [] });
      }

      if (outlookAccounts.length > 0) {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Business Outlook inbox — scans for supplier updates, industry news and business content.", connected: true, accounts: outlookAccounts });
      } else {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Connect your business Outlook inbox to scan for supplier updates and business content.", connected: false, accounts: [] });
      }

      tiles.push({ id: "gdrive", icon: "📂", name: "Google Drive", desc: "Imports photos and documents from your Drive folders. Previously scanned files are skipped — use Manual Add Item for changes.", connected: !!profile.cl_drive_connected });

      var websiteUrls = (profile.website_urls && profile.website_urls.length > 0) ? profile.website_urls.filter(Boolean) : [];
      var websiteUrl = websiteUrls[0] || null;
      tiles.push({ id: "website", icon: "🌐", name: websiteUrl || "Website", desc: websiteUrl ? "Scans your website for service descriptions, team info and other business content. Rescanning reproduces all content as new Pending items — use Manual Add Item for small changes." : "Add your website URL in CL Settings to scan for business content.", connected: !!websiteUrl, urls: websiteUrls });

      grid.innerHTML = tiles.map(function(t) {
        var accountPillsHtml = "";
        if (t.accounts && t.accounts.length > 0) {
          accountPillsHtml = "<div class=\"source-select-pills\">" + t.accounts.map(function(a) {
            return "<button class=\"source-select-pill selected\" data-email=\"" + a.email + "\">" + a.email + "</button>";
          }).join("") + "</div>";
        }
        var scanEmail = t.accounts && t.accounts.length === 1 ? t.accounts[0].email : "";
        return [
          "<div class=\"source-tile\">",
            "<div class=\"source-tile-top\">",
              "<span class=\"source-tile-icon\">" + t.icon + "</span>",
              "<div class=\"source-tile-body\">",
                "<div class=\"source-tile-name\">" + t.name + "</div>",
                "<div class=\"source-tile-desc\">" + t.desc + "</div>",
              "</div>",
            "</div>",
            accountPillsHtml,
            (t.id === "website" && t.urls && t.urls.length > 1 ? "<div class=\"source-tile-urls\">" + t.urls.map(function(u) { return "<label class=\"source-url-item\"><input type=\"checkbox\" class=\"source-url-checkbox\" data-url=\"" + u + "\" checked=\"checked\"><span class=\"source-url-label\">" + u + "</span></label>"; }).join("") + "</div>" : "") + "<div class=\"source-tile-actions\">",
              "<button class=\"source-action-btn source-scan-btn" + (t.connected ? "" : " source-btn-disabled") + "\" data-source=\"" + t.id + "\"" + (scanEmail ? " data-email=\"" + scanEmail + "\"" : "") + (t.connected ? "" : " disabled") + ">Scan Now</button>",
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
          var emails = [];
          pills.forEach(function(p) { emails.push(p.getAttribute("data-email")); });
          if (pills.length > 0) {
            self._handleScanNow(btn.getAttribute("data-source"), btn, emails);
          } else if (btn.getAttribute("data-email")) {
            self._handleScanNow(btn.getAttribute("data-source"), btn, [btn.getAttribute("data-email")]);
          } else {
            self._handleScanNow(btn.getAttribute("data-source"), btn, []);
          }
        });
      });

    } catch (err) {
      if (grid) grid.innerHTML = "<div class=\"source-tile-error\">Unable to load connection status. Please refresh the page.</div>";
    }
  },

  _handleScanNow: function(source, btn, emails) {
      var self = this;
      var originalText = btn.textContent;
      btn.textContent = "Scanning...";
      btn.disabled = true;
      (async function() {
        try {
          var ud = await self._supabase.auth.getUser();
          var user = ud && ud.data ? ud.data.user : null;
          if (!user) throw new Error("Not authenticated");
          if (source === "gdrive") {
            var profileResp = await self._supabase.from("profiles").select("cl_drive_folders").eq("id", user.id).single();
            var folders = (profileResp.data && profileResp.data.cl_drive_folders) || [];
            if (folders.length === 0) throw new Error("No Drive folders connected. Add folders in Settings.");
            var totalImported = 0;
            for (var fi = 0; fi < folders.length; fi++) {
              var resp = await fetch("/api/drive-import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, action: "import-all", folderId: folders[fi].id })
              });
              var result = await resp.json();
              if (result.success && result.imported) {
                totalImported += result.imported;
              } else if (result.error) {
                console.error("Drive import error for folder " + folders[fi].name + ":", result.error);
              }
            }
            btn.textContent = originalText;
            btn.disabled = false;
            if (totalImported > 0) {
              self._showUploadConfirmation(totalImported);
            } else {
              self._showUploadError("No new content found in your connected Drive folders.");
            }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "gmail") {
            var gmailEmails = emails || [];
            if (gmailEmails.length === 0) throw new Error("No Gmail accounts selected to scan");
            var totalGmailImported = 0;
            for (var gi = 0; gi < gmailEmails.length; gi++) {
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
            btn.textContent = originalText;
            btn.disabled = false;
            if (totalGmailImported > 0) {
              self._showUploadConfirmation(totalGmailImported);
            } else {
              self._showUploadError("No new content found in your Gmail inbox.");
            }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "outlook") {
            var outlookEmails = emails || [];
            if (outlookEmails.length === 0) throw new Error("No Outlook accounts selected to scan");
            var totalOutlookImported = 0;
            for (var oi = 0; oi < outlookEmails.length; oi++) {
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
            btn.textContent = originalText;
            btn.disabled = false;
            if (totalOutlookImported > 0) {
              self._showUploadConfirmation(totalOutlookImported);
            } else {
              self._showUploadError("No new content found in your Outlook inbox.");
            }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          } else if (source === "website") {
            var tile = btn.closest(".source-tile");
            var cbs = tile ? tile.querySelectorAll(".source-url-checkbox") : [];
            var urls = [];
            if (cbs.length > 0) {
              cbs.forEach(function(cb) { if (cb.checked) urls.push(cb.getAttribute("data-url")); });
            } else {
              var nm = tile ? tile.querySelector(".source-tile-name") : null;
              if (nm && nm.textContent) urls.push(nm.textContent.trim());
            }
            if (urls.length === 0) throw new Error("No URLs selected to scan");
            var totalWebImported = 0;
            for (var j = 0; j < urls.length; j++) {
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
            btn.textContent = originalText;
            btn.disabled = false;
            if (totalWebImported > 0) {
              self._showUploadConfirmation(totalWebImported);
            } else {
              self._showUploadError("No new content found on your website.");
            }
            if (typeof loadStats === "function") loadStats();
            if (window.CL_REVIEW) window.CL_REVIEW._load();
            return;
          }
        } catch (err) {
          console.error("Scan error:", err.message);
          self._showUploadError(err.message);
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
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
      var totalInserted = 0;
      for (var j = 0; j < imageFiles.length; j++) {
        var file = imageFiles[j];
        var fileData = await self._fileToBase64(file);
        var resp = await fetch("/api/process-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: "image", fileData: fileData })
        });
        var result = await resp.json();
        if (result.success && result.itemsCount) {
          totalInserted += result.itemsCount;
        } else if (result.error) {
          console.error("Photo processing error:", result.error);
        }
      }
      self._hideProcessing();
      if (totalInserted > 0) {
        self._showUploadConfirmation(totalInserted);
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
      var totalInserted = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var fileData = await self._fileToBase64(file);
        var fileType = self._getDocFileType(file.name);
        var resp = await fetch("/api/process-file", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, fileName: file.name, fileType: fileType, fileData: fileData })
        });
        var result = await resp.json();
        if (result.success && result.itemsCount) {
          totalInserted += result.itemsCount;
        } else if (result.error) {
          console.error("Document processing error:", result.error);
        }
      }
      self._hideProcessing();
      if (totalInserted > 0) {
        self._showUploadConfirmation(totalInserted);
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

  _showUploadConfirmation: function(count) {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    msgSpan.textContent = count + (count === 1 ? " item" : " items") + " added to Review.";
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
