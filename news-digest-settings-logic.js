(async function () {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }
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
      window.location.href = "/login";
    });
  }

  let settings = {};
  try {
    const { data } = await window.supabaseClient
      .from("news_digest_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (data) settings = data;
  } catch (e) {}

  let categories = Array.isArray(settings.categories) ? settings.categories : [
    { label: "Regulatory", enabled: true },
    { label: "Industry Body", enabled: true },
    { label: "Suppliers", enabled: true },
    { label: "Workplace & Safety", enabled: true },
    { label: "Economic & Market", enabled: true },
    { label: "Technology", enabled: true }
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
        "<button class=\"btn-sm btn-remove cat-remove\" data-idx=\"" + idx + "\">Remove<\/button><\/div>";
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

  const cadence = settings.cadence || "weekly";
  const cadenceEl = document.getElementById("cadence-" + cadence);
  if (cadenceEl) cadenceEl.checked = true;

  // Lookback retention — init from saved value
  var lookbackDays = parseInt(settings.lookback_days) || 180;
  var lookbackBtn = document.getElementById("lookback-btn");
  var lookbackMenu = document.getElementById("lookback-menu");
  if (lookbackBtn && lookbackMenu) {
    var lookbackLabels = { "30": "1 month", "90": "3 months", "180": "6 months" };
    lookbackBtn.innerHTML = (lookbackLabels[String(lookbackDays)] || "6 months") + " &#9662;";
    lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(item) {
      item.classList.toggle("active", item.getAttribute("data-value") === String(lookbackDays));
    });
  }

  const sourcePrefsEl = document.getElementById("source-prefs");
  const industryEl = document.getElementById("industry-override");
  const locationEl = document.getElementById("location-override");
  if (sourcePrefsEl && settings.source_preferences) sourcePrefsEl.value = settings.source_preferences;
  if (industryEl && settings.industry_override) industryEl.value = settings.industry_override;
  if (locationEl && settings.location_override) locationEl.value = settings.location_override;

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
      const selectedCadence = (document.querySelector("input[name=\"cadence\"]:checked") || {}).value || "weekly";
      const payload = {
        user_id: user.id,
        categories: categories,
        cadence: selectedCadence,
        source_preferences: sourcePrefsEl ? sourcePrefsEl.value.trim() : null,
        industry_override: industryEl ? industryEl.value.trim() || null : null,
        location_override: locationEl ? locationEl.value.trim() || null : null,
        updated_at: new Date().toISOString()
      };
      let error;
      if (settings.id) {
        ({ error } = await window.supabaseClient.from("news_digest_settings").update(payload).eq("id", settings.id));
      } else {
        payload.created_at = new Date().toISOString();
        ({ error } = await window.supabaseClient.from("news_digest_settings").insert(payload));
      }
      if (error) { showMsg("Could not save settings. Please try again.", "error"); }
      else { showMsg("Settings saved.", "success"); }
    });
  }
  // Lookback dropdown — toggle menu on button click
  if (lookbackBtn) {
    lookbackBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      lookbackMenu.classList.toggle("open");
      lookbackBtn.classList.toggle("active");
    });
  }

  // Lookback dropdown — item selection (saves immediately)
  if (lookbackMenu) {
    lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(item) {
      item.addEventListener("click", async function() {
        var val = parseInt(item.getAttribute("data-value")) || 180;
        lookbackBtn.innerHTML = item.textContent + " &#9662;";
        lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(it) { it.classList.remove("active"); });
        item.classList.add("active");
        lookbackMenu.classList.remove("open");
        lookbackBtn.classList.remove("active");
        var payload = {
          user_id: user.id,
          lookback_days: val,
          updated_at: new Date().toISOString()
        };
        var result;
        if (settings.id) {
          result = await window.supabaseClient.from("news_digest_settings").update(payload).eq("id", settings.id);
        } else {
          payload.created_at = new Date().toISOString();
          result = await window.supabaseClient.from("news_digest_settings").insert(payload);
        }
        if (result.error) {
          console.error("[ND Settings] Lookback save error:", result.error.message);
        }
      });
    });
  }

  // Close lookback dropdown on outside click
  document.addEventListener("click", function(e) {
    if (!e.target.closest(".lookback-dropdown-wrap")) {
      if (lookbackMenu) lookbackMenu.classList.remove("open");
      if (lookbackBtn) lookbackBtn.classList.remove("active");
    }
  });

})();
