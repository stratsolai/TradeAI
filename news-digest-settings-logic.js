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

  // ── DIGEST FREQUENCY (.freq-btn — saves immediately) ────────────────

  var cadenceCtrl = document.getElementById("cadence-ctrl");
  if (cadenceCtrl) {
    var savedCadence = settings.cadence || "weekly";
    cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(btn) {
      btn.classList.toggle("active", btn.getAttribute("data-value") === savedCadence);
    });

    cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        cadenceCtrl.querySelectorAll(".freq-btn").forEach(function(b) { b.classList.remove("active"); });
        btn.classList.add("active");
        var val = btn.getAttribute("data-value") || "weekly";
        var payload = {
          user_id: user.id,
          cadence: val,
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
          console.error("[ND Settings] Cadence save error:", result.error.message);
        }
      });
    });
  }

  // ── LOOKBACK RETENTION (.lookback-dropdown — saves immediately) ──────

  var lookbackDays = parseInt(settings.lookback_days) || 180;
  var lookbackBtn = document.getElementById("lookback-btn");
  var lookbackMenu = document.getElementById("lookback-menu");
  if (lookbackBtn && lookbackMenu) {
    var lookbackLabels = { "30": "1 month", "90": "3 months", "180": "6 months" };
    lookbackBtn.innerHTML = (lookbackLabels[String(lookbackDays)] || "6 months") + " &#9662;";
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

    document.addEventListener("click", function(e) {
      if (!e.target.closest(".lookback-dropdown-wrap")) {
        lookbackMenu.classList.remove("open");
        lookbackBtn.classList.remove("active");
      }
    });
  }

  // ── SOURCE PREFERENCES (Save button) ────────────────────────────────

  var sourcePrefsEl = document.getElementById("source-prefs");
  if (sourcePrefsEl && settings.source_preferences) sourcePrefsEl.value = settings.source_preferences;

  var saveBtn = document.getElementById("save-settings-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", function() {
      var msgEl = document.getElementById("save-settings-msg");
      window.handleSave(saveBtn, async function() {
        var activeFreqBtn = document.querySelector("#cadence-ctrl .freq-btn.active");
        var currentCadence = activeFreqBtn ? activeFreqBtn.getAttribute("data-value") : "weekly";
        var payload = {
          user_id: user.id,
          cadence: currentCadence,
          source_preferences: sourcePrefsEl ? sourcePrefsEl.value.trim() : null,
          updated_at: new Date().toISOString()
        };
        var result;
        if (settings.id) {
          result = await window.supabaseClient.from("news_digest_settings").update(payload).eq("id", settings.id);
        } else {
          payload.created_at = new Date().toISOString();
          result = await window.supabaseClient.from("news_digest_settings").insert(payload);
        }
        if (result.error) throw new Error(result.error.message);
      }, msgEl);
    });
  }

})();
