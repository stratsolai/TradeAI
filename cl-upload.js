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
        "<button class=\"btn-dismiss\" id=\"cl-offline-dismiss\">Dismiss</button>",
      "</div>",
      "<div id=\"cl-upload-confirm\" class=\"upload-confirm\" style=\"display:none\">",
        "<span id=\"cl-upload-confirm-msg\"></span>",
        "<a href=\"#\" id=\"cl-goto-review\" class=\"btn-link\" style=\"display:none\">Go to Review tab</a>",
        "<button id=\"cl-upload-dismiss\" class=\"btn-dismiss\" style=\"display:none\">Dismiss</button>",
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
    var reviewLink = document.getElementById("cl-goto-review");
    if (reviewLink) { reviewLink.addEventListener("click", function(e) { e.preventDefault(); if (typeof window.switchPTab === "function") window.switchPTab("review"); }); }
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
      var gmailEntry = connectedEmails.filter(function(e) { return e && (e.provider === "gmail" || e.provider === "google"); })[0];
      var outlookEntry = connectedEmails.filter(function(e) { return e && (e.provider === "microsoft" || e.provider === "outlook"); })[0];

      if (gmailEntry) {
        tiles.push({ id: "gmail", icon: "📧", name: gmailEntry.email, desc: "Business Gmail inbox — scans for supplier updates, industry news and business content.", connected: true });
      } else {
        tiles.push({ id: "gmail", icon: "📧", name: "Business Email (Gmail)", desc: "Connect your business Gmail inbox to scan for supplier updates and business content.", connected: false });
      }

      if (outlookEntry) {
        tiles.push({ id: "outlook", icon: "📧", name: outlookEntry.email, desc: "Business Outlook inbox — scans for supplier updates, industry news and business content.", connected: true });
      } else {
        tiles.push({ id: "outlook", icon: "📧", name: "Business Email (Outlook)", desc: "Connect your business Outlook inbox to scan for supplier updates and business content.", connected: false });
      }

      tiles.push({ id: "gdrive", icon: "📂", name: "Google Drive", desc: "Imports photos and documents from your Drive folders.", connected: !!profile.cl_drive_connected });

      var websiteUrls = (profile.website_urls && profile.website_urls.length > 0) ? profile.website_urls.filter(Boolean) : [];
      var websiteUrl = websiteUrls[0] || null;
      tiles.push({ id: "website", icon: "🌐", name: websiteUrl || "Website", desc: websiteUrl ? "Scans your website for service descriptions, team info and other business content." : "Add your website URL in CL Settings to scan for business content.", connected: !!websiteUrl, urls: websiteUrls });

      grid.innerHTML = tiles.map(function(t) {
        return [
          "<div class=\"source-tile\">",
            "<div class=\"source-tile-top\">",
              "<span class=\"source-tile-icon\">" + t.icon + "</span>",
              "<div class=\"source-tile-body\">",
                "<div class=\"source-tile-name\">" + t.name + "</div>",
                "<div class=\"source-tile-desc\">" + t.desc + "</div>",
              "</div>",
            "</div>",
            (t.id === "website" && t.urls && t.urls.length > 1 ? "<div class=\"source-tile-urls\">" + t.urls.map(function(u) { return "<label class=\"source-url-item\"><input type=\"checkbox\" class=\"source-url-checkbox\" data-url=\"" + u + "\" checked=\"checked\"><span class=\"source-url-label\">" + u + "</span></label>"; }).join("") + "</div>" : "") + "<div class=\"source-tile-actions\">",
              "<button class=\"source-action-btn source-scan-btn" + (t.connected ? "" : " source-btn-disabled") + "\" data-source=\"" + t.id + "\"" + (t.connected ? "" : " disabled") + ">Scan Now</button>",
              "<a href=\"/library/settings\" class=\"source-action-btn source-connect-btn" + (!t.connected ? "" : " source-btn-disabled") + "\"" + (t.connected ? " tabindex=\"-1\" aria-disabled=\"true\"" : "") + ">Connect Now</a>",
            "</div>",
          "</div>"
        ].join("\n");
      }).join("\n");

      var self = this;
      grid.querySelectorAll(".source-scan-btn:not(.source-btn-disabled)").forEach(function(btn) {
        btn.addEventListener("click", function() { self._handleScanNow(btn.getAttribute("data-source"), btn); });
      });

    } catch (err) {
      if (grid) grid.innerHTML = "<div class=\"source-tile-error\">Unable to load connection status. Please refresh the page.</div>";
    }
  },

  _handleScanNow: function(source, btn) {
      var self = this;
      var originalText = btn.textContent;
      btn.textContent = "Scanning...";
      btn.disabled = true;
      (async function() {
        try {
          var ud = await self._supabase.auth.getUser();
          var user = ud && ud.data ? ud.data.user : null;
          if (!user) throw new Error("Not authenticated");
          if (source === "website") {
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
            for (var j = 0; j < urls.length; j++) {
              var raw = urls[j].trim();
              if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
              await fetch("/api/scrape-website", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: user.id, url: raw })
              });
            }
            if (typeof loadStats === "function") loadStats();
          }
        } catch (err) {
          console.error("Scan error:", err.message);
        } finally {
          btn.textContent = originalText;
          btn.disabled = false;
        }
      })();
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
    var supabase = this._supabase;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;
      var count = 0;
      for (var j = 0; j < imageFiles.length; j++) {
        var file = imageFiles[j];
        var result = await supabase.from("content_library").insert({ user_id: user.id, title: file.name.replace(/\.[^.]+$/, ""), body: "", type: "photo", source: "photo", status: "pending", tool_tags: [] });
        if (!result.error) count++;
      }
      if (count > 0) this._showUploadConfirmation(count);
    } catch (err) { console.error("Photo upload error:", err); }
  },

  _handleDocUpload: async function(files) {
    var supabase = this._supabase;
    try {
      var userResp = await supabase.auth.getUser();
      var user = userResp.data && userResp.data.user;
      if (!user) return;
      var count = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        var result = await supabase.from("content_library").insert({ user_id: user.id, title: file.name.replace(/\.[^.]+$/, ""), body: "", type: "document", source: "document", status: "pending", tool_tags: [] });
        if (!result.error) count++;
      }
      if (count > 0) this._showUploadConfirmation(count);
    } catch (err) { console.error("Document upload error:", err); }
  },

  _showUploadConfirmation: function(count) {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var reviewLink = document.getElementById("cl-goto-review");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    confirmDiv.style.borderColor = "#28a745";
    confirmDiv.style.background = "#edfaf1";
    msgSpan.style.color = "#28a745";
    msgSpan.textContent = count + (count === 1 ? " item" : " items") + " added to Review.";
    if (reviewLink) reviewLink.style.display = "";
    if (dismissBtn) dismissBtn.style.display = "none";
    confirmDiv.style.display = "flex";
    setTimeout(function() { confirmDiv.style.display = "none"; }, 8000);
  },

  _showUploadError: function(msg) {
    var confirmDiv = document.getElementById("cl-upload-confirm");
    var msgSpan = document.getElementById("cl-upload-confirm-msg");
    var reviewLink = document.getElementById("cl-goto-review");
    var dismissBtn = document.getElementById("cl-upload-dismiss");
    if (!confirmDiv || !msgSpan) return;
    confirmDiv.style.borderColor = "#dc3545";
    confirmDiv.style.background = "#fef2f2";
    msgSpan.style.color = "#dc3545";
    msgSpan.textContent = msg;
    if (reviewLink) reviewLink.style.display = "none";
    if (dismissBtn) {
      dismissBtn.style.display = "";
      dismissBtn.onclick = function() { confirmDiv.style.display = "none"; };
    }
    confirmDiv.style.display = "flex";
  }

};
