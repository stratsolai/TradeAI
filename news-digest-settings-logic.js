(async function () {
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session) { window.location.href = "/login"; return; }
  const user = session.user;

  let settings = {};
  try {
    const { data, error } = await window.supabaseClient
      .from("news_digest_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();
    if (error) console.error("[ND Settings] Load settings error:", error.message);
    if (data) settings = data;
  } catch (e) {
    console.error("[ND Settings] Load settings exception:", e.message);
  }

  // Helper — upsert to news_digest_settings, updating settings.id after first insert
  async function saveToSettings(payload) {
    var result;
    if (settings.id) {
      result = await window.supabaseClient.from("news_digest_settings").update(payload).eq("id", settings.id);
    } else {
      payload.user_id = user.id;
      payload.created_at = new Date().toISOString();
      result = await window.supabaseClient.from("news_digest_settings").insert(payload).select("id").single();
      if (!result.error && result.data) settings.id = result.data.id;
    }
    if (result.error) throw new Error(result.error.message);
  }

  // ── TAB SWITCHING (.stab-bar / .stab) ────────────────────────────────

  document.querySelectorAll(".stab[data-tab]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      document.querySelectorAll(".stab").forEach(function(b) { b.classList.remove("active"); });
      document.querySelectorAll(".stab-panel").forEach(function(p) { p.classList.remove("active"); });
      btn.classList.add("active");
      var panel = document.getElementById("tab-" + btn.dataset.tab);
      if (panel) panel.classList.add("active");
    });
  });

  // ── SCAN FREQUENCY (.freq-btn — in-memory toggle, Save button commits) ──

  var cadenceCtrl = document.getElementById("cadence-ctrl");
  if (cadenceCtrl) {
    var savedCadence = settings.cadence || "weekly";
    cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(btn) {
      btn.classList.toggle("active", btn.getAttribute("data-value") === savedCadence);
    });

    cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
      });
    });
  }

  var scanSaveBtn = document.getElementById("save-scan-btn");
  if (scanSaveBtn) {
    scanSaveBtn.addEventListener("click", function() {
      var msgEl = document.getElementById("save-settings-msg");
      var activeFreqBtn = document.querySelector("#cadence-ctrl .freq-btn.active");
      var currentCadence = activeFreqBtn ? activeFreqBtn.getAttribute("data-value") : "weekly";
      window.handleSave(scanSaveBtn, async function() {
        await saveToSettings({
          cadence: currentCadence,
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  }

  // ── LOOKBACK RETENTION (.lookback-dropdown — saves immediately) ──────

  var lookbackDays = parseInt(settings.lookback_days) || 180;
  var lookbackBtn = document.getElementById("lookback-btn");
  var lookbackMenu = document.getElementById("lookback-menu");
  if (lookbackBtn && lookbackMenu) {
    var lookbackLabels = { "30": "1 month", "90": "3 months", "180": "6 months" };
    lookbackBtn.innerHTML = lookbackLabels[String(lookbackDays)] || "6 months";
    lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(item) {
      item.classList.toggle("active", item.getAttribute("data-value") === String(lookbackDays));
    });

    lookbackBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      lookbackMenu.classList.toggle("open");
      lookbackBtn.classList.toggle("active");
    });

    lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(item) {
      item.addEventListener("click", async function() {
        var val = parseInt(item.getAttribute("data-value")) || 180;
        lookbackBtn.innerHTML = item.textContent;
        lookbackMenu.querySelectorAll(".lookback-dropdown-item").forEach(function(it) { it.classList.remove("active"); });
        item.classList.add("active");
        lookbackMenu.classList.remove("open");
        lookbackBtn.classList.remove("active");
        try {
          await saveToSettings({
            lookback_days: val,
            updated_at: new Date().toISOString()
          });
        } catch (err) {
          console.error("[ND Settings] Lookback save error:", err.message);
        }
      });
    });

    document.addEventListener("click", function(e) {
      if (!e.target.closest(".lookback-dropdown-wrap")) {
        lookbackMenu.classList.remove("open");
        lookbackBtn.classList.remove("active");
      }
    });
  }

  // ── SOURCE PREFERENCES (Save button) ────────────────────────────────

  var sourcePrefsEl = document.getElementById("source-prefs");
  if (sourcePrefsEl && Array.isArray(settings.preferred_sources) && settings.preferred_sources.length > 0) {
    sourcePrefsEl.value = settings.preferred_sources.join(", ");
  } else if (sourcePrefsEl && typeof settings.preferred_sources === "string" && settings.preferred_sources) {
    sourcePrefsEl.value = settings.preferred_sources;
  }

  var saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", function() {
      var msgEl = document.getElementById("save-settings-msg");
      window.handleSave(saveBtn, async function() {
        var raw = sourcePrefsEl ? sourcePrefsEl.value.trim() : "";
        var preferred = raw ? raw.split(",").map(function(s) { return s.trim(); }).filter(Boolean) : [];
        await saveToSettings({
          preferred_sources: preferred,
          updated_at: new Date().toISOString()
        });
      }, msgEl);
    });
  }

})();
