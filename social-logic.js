window.SOCIAL_LOGIC = {

  _session: null,
  _currentFork: null,
  _currentInputType: null,
  _currentCategory: null,
  _generatedContent: null,
  _uploadedPhotoUrl: null,

  init() {
    this._initAuth();
  },

  async _initAuth() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) { window.location.href = "/login.html"; return; }
    this._session = session;
    this._initAccountDropdown();
    this._renderForkSelection();
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

  _renderForkSelection() {
    this._setView("view-fork");
    document.getElementById("btn-fork-social").addEventListener("click", () => this._selectFork("social"));
    document.getElementById("btn-fork-marketing").addEventListener("click", () => this._selectFork("marketing"));
  },

  _selectFork(fork) {
    this._currentFork = fork;
    if (fork === "social") {
      this._setView("view-social-input-type");
      this._initInputTypeCards();
    } else {
      this._setView("view-marketing-options");
      this._initMarketingOptions();
    }
  },

  _initInputTypeCards() {
    ["job", "offer", "news"].forEach(type => {
      const el = document.getElementById("input-type-" + type);
      if (el) el.addEventListener("click", () => this._selectInputType(type));
    });
    document.getElementById("btn-back-to-fork").addEventListener("click", () => this._renderForkSelection());
  },

  _selectInputType(type) {
    this._currentInputType = type;
    this._currentCategory = null;
    this._setView("view-social-form");
    this._renderCategoryPills(type);
    this._renderForm(type);
    document.getElementById("btn-back-to-input-type").addEventListener("click", () => {
      this._setView("view-social-input-type");
    });
    document.getElementById("btn-generate-social").addEventListener("click", () => this._generateSocialPost());
  },

  _renderCategoryPills(type) {
    const categoryMap = {
      job: [{ id: "completed-job", label: "Completed Job" }, { id: "before-after", label: "Before & After" }],
      offer: [{ id: "seasonal-offer", label: "Seasonal Offer" }, { id: "new-service", label: "New Service" }, { id: "promotion", label: "Promotion" }],
      news: [{ id: "tips-advice", label: "Tips & Advice" }, { id: "industry-news", label: "Industry News" }, { id: "community", label: "Community" }]
    };
    const pills = categoryMap[type] || [];
    const container = document.getElementById("category-pills");
    container.innerHTML = "";
    pills.forEach((cat, i) => {
      const pill = document.createElement("button");
      pill.className = "category-pill" + (i === 0 ? " active" : "");
      pill.textContent = cat.label;
      pill.dataset.category = cat.id;
      pill.addEventListener("click", () => {
        container.querySelectorAll(".category-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        this._currentCategory = cat.id;
      });
      container.appendChild(pill);
    });
    this._currentCategory = pills[0] ? pills[0].id : null;
  },

  _renderForm(type) {
    const container = document.getElementById("social-form-fields");
    container.innerHTML = "";
    if (type === "job") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">Job description</label>
          <textarea id="field-job-description" class="form-textarea" rows="4" placeholder="Describe the job or project..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Location <span class="form-optional">(optional)</span></label>
          <input id="field-location" type="text" class="form-input" placeholder="e.g. Brisbane, QLD" />
        </div>
        <div class="form-group">
          <label class="form-label">Photo <span class="form-optional">(optional)</span></label>
          <input id="field-photo" type="file" class="form-input" accept="image/*" />
        </div>`;
    } else if (type === "offer") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">What is the offer</label>
          <input id="field-offer-text" type="text" class="form-input" placeholder="Describe the offer or service..." />
        </div>
        <div class="form-group">
          <label class="form-label">Price or value <span class="form-optional">(optional)</span></label>
          <input id="field-price-value" type="text" class="form-input" placeholder="e.g. From 199" />
        </div>
        <div class="form-group">
          <label class="form-label">Valid until <span class="form-optional">(optional)</span></label>
          <input id="field-valid-until" type="date" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Extra detail <span class="form-optional">(optional)</span></label>
          <textarea id="field-extra-detail" class="form-textarea" rows="3" placeholder="Any additional context..."></textarea>
        </div>`;
    } else if (type === "news") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">Topic</label>
          <input id="field-topic" type="text" class="form-input" placeholder="Enter a topic or tip to share..." />
        </div>
        <div class="form-group">
          <label class="form-label">Extra context <span class="form-optional">(optional)</span></label>
          <textarea id="field-extra-context" class="form-textarea" rows="3" placeholder="Any additional context..."></textarea>
        </div>`;
    }
    container.insertAdjacentHTML("beforeend", `
      <div class="form-group">
        <label class="form-label">Tone</label>
        <div class="tone-selector">
          <button class="tone-btn active" data-tone="friendly">Friendly</button>
          <button class="tone-btn" data-tone="professional">Professional</button>
          <button class="tone-btn" data-tone="casual">Casual</button>
          <button class="tone-btn" data-tone="bold">Bold</button>
        </div>
      </div>`);
    container.querySelectorAll(".tone-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        container.querySelectorAll(".tone-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  },

  async _generateSocialPost() {
    const btn = document.getElementById("btn-generate-social");
    btn.disabled = true;
    btn.textContent = "Generating...";
    const tone = (document.querySelector(".tone-btn.active") || {}).dataset?.tone || "friendly";
    const body = { input_type: this._currentInputType, category: this._currentCategory, tone };
    if (this._currentInputType === "job") {
      body.job_description = (document.getElementById("field-job-description") || {}).value || "";
      body.location = (document.getElementById("field-location") || {}).value || "";
    } else if (this._currentInputType === "offer") {
      body.offer_text = (document.getElementById("field-offer-text") || {}).value || "";
      body.price_value = (document.getElementById("field-price-value") || {}).value || "";
      body.valid_until = (document.getElementById("field-valid-until") || {}).value || "";
      body.extra_detail = (document.getElementById("field-extra-detail") || {}).value || "";
    } else if (this._currentInputType === "news") {
      body.topic = (document.getElementById("field-topic") || {}).value || "";
      body.extra_context = (document.getElementById("field-extra-context") || {}).value || "";
    }
    try {
      const res = await fetch("/api/generate-social-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this._session.access_token },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      this._generatedContent = data.content;
      this._renderPreview(data.content);
    } catch (err) {
      this._showError("social-form-error", err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate post";
    }
  },

  _renderPreview(content) {
    this._setView("view-social-preview");
    const el = document.getElementById("preview-content-text");
    if (el) el.textContent = content;
    document.getElementById("btn-edit-preview").addEventListener("click", () => {
      el.contentEditable = "true";
      el.focus();
      document.getElementById("btn-edit-preview").style.display = "none";
      document.getElementById("btn-save-edit").style.display = "inline-block";
    });
    document.getElementById("btn-save-edit").addEventListener("click", () => {
      this._generatedContent = el.textContent;
      el.contentEditable = "false";
      document.getElementById("btn-edit-preview").style.display = "inline-block";
      document.getElementById("btn-save-edit").style.display = "none";
    });
    document.getElementById("btn-back-to-form").addEventListener("click", () => this._setView("view-social-form"));
    document.getElementById("btn-proceed-to-delivery").addEventListener("click", () => this._renderDelivery());
  },

  _renderDelivery() {
    this._setView("view-social-delivery");
    this._checkPlatformConnections();
    document.getElementById("btn-back-to-preview").addEventListener("click", () => this._renderPreview(this._generatedContent));
    document.getElementById("btn-post-now").addEventListener("click", () => this._postNow());
    document.getElementById("btn-schedule").addEventListener("click", () => this._schedulePost());
    document.getElementById("btn-save-draft").addEventListener("click", () => this._saveDraft());
    document.getElementById("btn-share-manually").addEventListener("click", () => this._shareManually());
  },

  async _checkPlatformConnections() {
    const { data: settings } = await window.supabaseClient
      .from("social_settings")
      .select("facebook_connected, instagram_connected")
      .eq("user_id", this._session.user.id)
      .single();
    const connected = settings && (settings.facebook_connected || settings.instagram_connected);
    document.querySelectorAll(".requires-connection").forEach(el => {
      if (!connected) { el.disabled = true; el.title = "Connect your accounts in Settings first"; }
    });
    const notice = document.getElementById("no-connection-notice");
    if (notice) notice.style.display = connected ? "none" : "block";
  },

  _getSelectedPlatforms() {
    const platforms = [];
    if ((document.getElementById("platform-facebook") || {}).checked) platforms.push("facebook");
    if ((document.getElementById("platform-instagram") || {}).checked) platforms.push("instagram");
    return platforms;
  },

  async _saveSocialPost(status) {
    const { data, error } = await window.supabaseClient
      .from("social_posts")
      .insert({ user_id: this._session.user.id, content: this._generatedContent, image_url: this._uploadedPhotoUrl || null, category: this._currentCategory, platform: this._getSelectedPlatforms(), status })
      .select().single();
    if (error) throw new Error("Could not save post. Please try again.");
    return data;
  },

  async _postNow() {
    const platforms = this._getSelectedPlatforms();
    if (!platforms.length) { this._showError("delivery-error", "Select at least one platform."); return; }
    try {
      const post = await this._saveSocialPost("posted");
      const res = await fetch("/api/meta-post", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this._session.access_token },
        body: JSON.stringify({ action: "post", content: this._generatedContent, platforms, social_post_id: post.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Post failed");
      this._showSuccess("Post published successfully.");
    } catch (err) { this._showError("delivery-error", err.message); }
  },

  async _schedulePost() {
    const platforms = this._getSelectedPlatforms();
    const scheduledFor = (document.getElementById("schedule-datetime") || {}).value;
    if (!platforms.length) { this._showError("delivery-error", "Select at least one platform."); return; }
    if (!scheduledFor) { this._showError("delivery-error", "Select a date and time to schedule."); return; }
    try {
      const post = await this._saveSocialPost("scheduled");
      const res = await fetch("/api/schedule-social-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this._session.access_token },
        body: JSON.stringify({ social_post_id: post.id, scheduled_for: scheduledFor, platforms })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scheduling failed");
      this._showSuccess("Post scheduled.");
    } catch (err) { this._showError("delivery-error", err.message); }
  },

  async _saveDraft() {
    try {
      await this._saveSocialPost("draft");
      this._showSuccess("Draft saved.");
    } catch (err) { this._showError("delivery-error", err.message); }
  },

  _shareManually() {
    this._setView("view-share-manually");
    const el = document.getElementById("share-content-text");
    if (el) el.textContent = this._generatedContent;
    document.getElementById("btn-copy-text").addEventListener("click", () => {
      navigator.clipboard.writeText(this._generatedContent);
      document.getElementById("btn-copy-text").textContent = "Copied";
      setTimeout(() => { document.getElementById("btn-copy-text").textContent = "Copy text"; }, 2000);
    });
    document.getElementById("btn-back-to-delivery").addEventListener("click", () => this._renderDelivery());
  },

  _initMarketingOptions() {
    ["newsletter", "blog", "flyer"].forEach(type => {
      const el = document.getElementById("marketing-option-" + type);
      if (el) el.addEventListener("click", () => this._selectMarketingType(type));
    });
    document.getElementById("btn-back-to-fork-from-marketing").addEventListener("click", () => this._renderForkSelection());
  },

  _selectMarketingType(type) {
    this._currentInputType = type;
    this._setView("view-marketing-form");
    this._renderMarketingForm(type);
    document.getElementById("btn-back-to-marketing-options").addEventListener("click", () => this._setView("view-marketing-options"));
    document.getElementById("btn-generate-marketing").addEventListener("click", () => this._generateMarketingContent());
  },

  _renderMarketingForm(type) {
    const container = document.getElementById("marketing-form-fields");
    container.innerHTML = "";
    if (type === "newsletter") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">Focus or theme <span class="form-optional">(optional)</span></label>
          <input id="field-newsletter-focus" type="text" class="form-input" placeholder="e.g. seasonal tips, recent projects..." />
        </div>
        <div class="form-group">
          <label class="form-label">Extra context <span class="form-optional">(optional)</span></label>
          <textarea id="field-newsletter-context" class="form-textarea" rows="3" placeholder="Any key messages or announcements..."></textarea>
        </div>`;
    } else if (type === "blog") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">Topic</label>
          <input id="field-blog-topic" type="text" class="form-input" placeholder="Enter a topic for the blog post..." />
        </div>
        <div class="form-group">
          <label class="form-label">Extra context <span class="form-optional">(optional)</span></label>
          <textarea id="field-blog-context" class="form-textarea" rows="3" placeholder="Any key points to cover..."></textarea>
        </div>`;
    } else if (type === "flyer") {
      container.innerHTML = `
        <div class="form-group">
          <label class="form-label">What to promote</label>
          <input id="field-flyer-subject" type="text" class="form-input" placeholder="e.g. End of financial year special..." />
        </div>
        <div class="form-group">
          <label class="form-label">Key details <span class="form-optional">(optional)</span></label>
          <textarea id="field-flyer-details" class="form-textarea" rows="3" placeholder="Pricing, dates, contact info..."></textarea>
        </div>`;
    }
  },

  async _generateMarketingContent() {
    const btn = document.getElementById("btn-generate-marketing");
    btn.disabled = true;
    btn.textContent = "Generating...";
    const body = { input_type: this._currentInputType, tone: "professional" };
    if (this._currentInputType === "newsletter") {
      body.topic = (document.getElementById("field-newsletter-focus") || {}).value || "";
      body.extra_context = (document.getElementById("field-newsletter-context") || {}).value || "";
    } else if (this._currentInputType === "blog") {
      body.topic = (document.getElementById("field-blog-topic") || {}).value || "";
      body.extra_context = (document.getElementById("field-blog-context") || {}).value || "";
    } else if (this._currentInputType === "flyer") {
      body.offer_text = (document.getElementById("field-flyer-subject") || {}).value || "";
      body.extra_detail = (document.getElementById("field-flyer-details") || {}).value || "";
    }
    try {
      const res = await fetch("/api/generate-social-content", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this._session.access_token },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      this._generatedContent = data.content;
      this._renderMarketingOutput(data.content);
    } catch (err) {
      this._showError("marketing-form-error", err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate content";
    }
  },

  _renderMarketingOutput(content) {
    this._setView("view-marketing-output");
    const el = document.getElementById("marketing-output-text");
    if (el) el.textContent = content;
    document.getElementById("btn-copy-marketing").addEventListener("click", () => {
      navigator.clipboard.writeText(content);
      document.getElementById("btn-copy-marketing").textContent = "Copied";
      setTimeout(() => { document.getElementById("btn-copy-marketing").textContent = "Copy text"; }, 2000);
    });
    document.getElementById("btn-back-to-marketing-form").addEventListener("click", () => this._setView("view-marketing-form"));
  },

  _setView(viewId) {
    document.querySelectorAll(".view").forEach(v => v.style.display = "none");
    const target = document.getElementById(viewId);
    if (target) target.style.display = "block";
  },

  _showError(containerId, message) {
    const el = document.getElementById(containerId);
    if (el) { el.textContent = message; el.style.display = "block"; }
  },

  _showSuccess(message) {
    this._setView("view-success");
    const el = document.getElementById("success-message");
    if (el) el.textContent = message;
    document.getElementById("btn-start-again").addEventListener("click", () => this._renderForkSelection());
  }

};

document.addEventListener("DOMContentLoaded", () => window.SOCIAL_LOGIC.init());
