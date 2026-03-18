(async function () {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) { window.location.href = "login.html"; return; }
  const user = session.user;

  const elShort = document.getElementById("account-email-short");
  const elFull = document.getElementById("account-dropdown-email");
  if (elShort) elShort.textContent = user.email ? user.email.split("@")[0] : "";
  if (elFull) elFull.textContent = user.email || "";

  const accountBtn = document.getElementById("account-btn");
  const accountDropdown = document.getElementById("account-dropdown");
  if (accountBtn && accountDropdown) {
    accountBtn.addEventListener("click", function (e) { e.stopPropagation(); accountDropdown.classList.toggle("open"); });
    document.addEventListener("click", function () { accountDropdown.classList.remove("open"); });
  }
  const signOutBtn = document.getElementById("sign-out-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async function () {
      await window.supabaseClient.auth.signOut();
      window.location.href = "login.html";
    });
  }

  let settings = {};
  try {
    const { data } = await window.supabaseClient
      .from("email_assistant_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) settings = data;
  } catch (e) {}

  let profile = {};
  try {
    const { data } = await window.supabaseClient
      .from("profiles")
      .select("gmail_connected, outlook_connected")
      .eq("user_id", user.id)
      .single();
    if (data) profile = data;
  } catch (e) {}

  const gmailStatus = document.getElementById("gmail-status");
  const outlookStatus = document.getElementById("outlook-status");
  const connectGmailBtn = document.getElementById("connect-gmail-btn");
  const connectOutlookBtn = document.getElementById("connect-outlook-btn");

  if (gmailStatus) gmailStatus.textContent = profile.gmail_connected ? "Connected" : "Not connected";
  if (gmailStatus) gmailStatus.className = "connection-status " + (profile.gmail_connected ? "connected" : "disconnected");
  if (outlookStatus) outlookStatus.textContent = profile.outlook_connected ? "Connected" : "Not connected";
  if (outlookStatus) outlookStatus.className = "connection-status " + (profile.outlook_connected ? "connected" : "disconnected");

  if (connectGmailBtn) {
    connectGmailBtn.addEventListener("click", function () { window.location.href = "/api/auth/gmail"; });
  }
  if (connectOutlookBtn) {
    connectOutlookBtn.addEventListener("click", function () { window.location.href = "/api/auth/outlook"; });
  }

  let categories = Array.isArray(settings.categories) ? settings.categories : [
    { label: "Urgent", enabled: true },
    { label: "Leads", enabled: true },
    { label: "Enquiries", enabled: true },
    { label: "Jobs", enabled: true },
    { label: "Invoices", enabled: true },
    { label: "Suppliers", enabled: true },
    { label: "Low Priority", enabled: true }
  ];

  function renderCategories() {
    const list = document.getElementById("categories-list");
    if (!list) return;
    list.innerHTML = categories.map(function (cat, idx) {
      return "<div class=\"category-row\" data-idx=\"" + idx + "\">" +
        "<label class=\"toggle-switch\"><input type=\"checkbox\" class=\"cat-toggle\" data-idx=\"" + idx + "\"" +
        (cat.enabled ? " checked" : "") + " /><span class=\"toggle-slider\"></span></label>" +
        "<input type=\"text\" class=\"cat-label\" data-idx=\"" + idx + "\" value=\"" +
        cat.label.replace(/&/g, "&amp;").replace(/"/g, "&quot;") + "\" />" +
        "<button class=\"btn-sm btn-remove cat-remove\" data-idx=\"" + idx + "\">Remove</button></div>";
    }).join("");
    list.querySelectorAll(".cat-toggle").forEach(function (el) {
      el.addEventListener("change", function () { categories[+el.dataset.idx].enabled = el.checked; });
    });
    list.querySelectorAll(".cat-label").forEach(function (el) {
      el.addEventListener("input", function () { categories[+el.dataset.idx].label = el.value; });
    });
    list.querySelectorAll(".cat-remove").forEach(function (el) {
      el.addEventListener("click", function () { categories.splice(+el.dataset.idx, 1); renderCategories(); });
    });
  }
  renderCategories();

  const addBtn = document.getElementById("add-category-btn");
  if (addBtn) {
    addBtn.addEventListener("click", function () {
      categories.push({ label: "New Category", enabled: true });
      renderCategories();
    });
  }

  const scanFreqEl = document.getElementById("scan-cadence");
  if (scanFreqEl && settings.scan_cadence) scanFreqEl.value = settings.scan_cadence;

  const showHandledEl = document.getElementById("show-handled");
  if (showHandledEl) showHandledEl.checked = !!settings.show_handled;

  const msgEl = document.getElementById("settings-msg");
  function showMsg(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = "settings-msg " + type;
    msgEl.style.display = "block";
    setTimeout(function () { msgEl.style.display = "none"; }, 4000);
  }

  const saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async function () {
      const payload = {
        user_id: user.id,
        categories: categories,
        scan_cadence: scanFreqEl ? scanFreqEl.value : "manual",
        show_handled: showHandledEl ? showHandledEl.checked : false,
        updated_at: new Date().toISOString()
      };
      let error;
      if (settings.id) {
        ({ error } = await window.supabaseClient.from("email_assistant_settings").update(payload).eq("id", settings.id));
      } else {
        payload.created_at = new Date().toISOString();
        ({ error } = await window.supabaseClient.from("email_assistant_settings").insert(payload));
      }
      if (error) { showMsg("Could not save settings. Please try again.", "error"); }
      else { showMsg("Settings saved.", "success"); }
    });
  }
})();
