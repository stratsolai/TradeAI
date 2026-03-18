window.SOCIAL_SETTINGS_LOGIC = {

  _session: null,

  init() {
    this._initAuth();
  },

  async _initAuth() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) { window.location.href = "/login.html"; return; }
    this._session = session;
    this._initAccountDropdown();
    this._loadSettings();
  },

  _initAccountDropdown() {
    const user = this._session.user;
    const emailShort = user.email.split("@")[0];
    const elShort = document.getElementById("account-email-short");
    const elFull = document.getElementById("account-dropdown-email");
    const btn = document.getElementById("account-btn");
    const dropdown = document.getElementById("account-dropdown");
    const signOut = document.getElementById("sign-out-btn");
    if (elShort) elShort.textContent = emailShort;
    if (elFull) elFull.textContent = user.email;
    if (btn && dropdown) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("open");
      });
      document.addEventListener("click", () => dropdown.classList.remove("open"));
    }
    if (signOut) {
      signOut.addEventListener("click", async () => {
        await window.supabaseClient.auth.signOut();
        window.location.href = "/login.html";
      });
    }
  },

  async _loadSettings() {
    const { data: settings } = await window.supabaseClient
      .from("social_settings")
      .select("*")
      .eq("user_id", this._session.user.id)
      .single();

    this._renderFacebookStatus(settings);
    this._renderInstagramStatus(settings);
    this._renderLinkedInStatus();
    this._renderCategoryToggles(settings);
    this._initSaveButton();
  },

  _renderFacebookStatus(settings) {
    const connected = settings && settings.facebook_connected;
    const statusEl = document.getElementById("facebook-status");
    const btnEl = document.getElementById("btn-connect-facebook");
    if (statusEl) statusEl.textContent = connected ? "Connected" : "Not connected";
    if (statusEl) statusEl.className = "connection-status " + (connected ? "connected" : "disconnected");
    if (btnEl) {
      btnEl.textContent = connected ? "Disconnect" : "Connect Facebook";
      btnEl.addEventListener("click", () => connected ? this._disconnectPlatform("facebook") : this._connectFacebook());
    }
  },

  _renderInstagramStatus(settings) {
    const connected = settings && settings.instagram_connected;
    const statusEl = document.getElementById("instagram-status");
    const btnEl = document.getElementById("btn-connect-instagram");
    if (statusEl) statusEl.textContent = connected ? "Connected" : "Not connected";
    if (statusEl) statusEl.className = "connection-status " + (connected ? "connected" : "disconnected");
    if (btnEl) {
      btnEl.textContent = connected ? "Disconnect" : "Connect Instagram";
      btnEl.addEventListener("click", () => connected ? this._disconnectPlatform("instagram") : this._connectInstagram());
    }
  },

  _renderLinkedInStatus() {
    const statusEl = document.getElementById("linkedin-status");
    const btnEl = document.getElementById("btn-connect-linkedin");
    if (statusEl) { statusEl.textContent = "Coming soon"; statusEl.className = "connection-status coming-soon"; }
    if (btnEl) { btnEl.textContent = "Coming soon"; btnEl.disabled = true; }
  },

  _renderCategoryToggles(settings) {
    const activeCategories = (settings && settings.active_categories) || [
      "completed-job", "before-after", "seasonal-offer", "new-service",
      "promotion", "tips-advice", "industry-news", "community"
    ];
    document.querySelectorAll(".category-toggle").forEach(toggle => {
      const cat = toggle.dataset.category;
      toggle.checked = activeCategories.includes(cat);
    });
  },

  _initSaveButton() {
    const btn = document.getElementById("btn-save-settings");
    if (btn) btn.addEventListener("click", () => this._saveSettings());
  },

  async _saveSettings() {
    const btn = document.getElementById("btn-save-settings");
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }

    const activeCategories = [];
    document.querySelectorAll(".category-toggle:checked").forEach(toggle => {
      activeCategories.push(toggle.dataset.category);
    });

    const { error } = await window.supabaseClient
      .from("social_settings")
      .upsert({ user_id: this._session.user.id, active_categories: activeCategories }, { onConflict: "user_id" });

    if (btn) {
      btn.disabled = false;
      if (error) {
        btn.textContent = "Save settings";
        this._showError("Settings could not be saved. Please try again.");
      } else {
        btn.textContent = "Saved";
        setTimeout(() => { btn.textContent = "Save settings"; }, 2000);
      }
    }
  },

  _connectFacebook() {
    const clientId = document.getElementById("fb-app-id") ? document.getElementById("fb-app-id").dataset.value : "";
    const redirect = encodeURIComponent(window.location.origin + "/api/auth/oauth-callback");
    const scope = "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish";
    window.location.href = "https://www.facebook.com/v19.0/dialog/oauth?client_id=" + clientId + "&redirect_uri=" + redirect + "&scope=" + scope + "&state=facebook";
  },

  _connectInstagram() {
    this._connectFacebook();
  },

  async _disconnectPlatform(platform) {
    const col = platform + "_connected";
    const { error } = await window.supabaseClient
      .from("social_settings")
      .upsert({ user_id: this._session.user.id, [col]: false }, { onConflict: "user_id" });
    if (!error) window.location.reload();
    else this._showError("Could not disconnect. Please try again.");
  },

  _showError(message) {
    const el = document.getElementById("settings-error");
    if (el) { el.textContent = message; el.style.display = "block"; }
  }

};

document.addEventListener("DOMContentLoaded", () => window.SOCIAL_SETTINGS_LOGIC.init());
