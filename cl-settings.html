<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Content Library Settings — StaxAI</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/supabase-client.js"></script>
  <style>
    :root {
      --bg: #0d1628;
      --bg2: #172035;
      --bg3: #1e2d47;
      --bg4: #253554;
      --card-border: rgba(255,255,255,0.07);
      --blue: #1A5490;
      --orange: #c4622a;
      --orange-light: #d4844a;
      --muted: rgba(255,255,255,0.70);
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', sans-serif;
      background: var(--bg);
      color: #fff;
      min-height: 100vh;
    }

    /* ── TOPBAR ── */
    .topbar {
      background: #4A6D8C;
      height: 68px;
      display: flex;
      align-items: center;
      padding: 0 24px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar-logo {
      font-family: 'Barlow Condensed', sans-serif;
      font-weight: 700;
      font-size: 22px;
      color: #fff;
      text-decoration: none;
      letter-spacing: 0.5px;
    }
    .topbar-nav {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-left: 64px;
    }
    .topbar-nav a {
      color: rgba(255,255,255,0.85);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.15s;
    }
    .topbar-nav a:hover { color: #fff; }
    .topbar-spacer { flex: 1; }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .topbar-cl-link {
      color: rgba(255,255,255,0.85);
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: color 0.15s;
    }
    .topbar-cl-link:hover { color: #fff; }
    .account-dropdown-wrap { position: relative; }
    .account-btn {
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .account-btn:hover { background: rgba(255,255,255,0.18); }
    .account-dropdown {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      background: var(--bg3);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      min-width: 180px;
      display: none;
      z-index: 200;
      overflow: hidden;
    }
    .account-dropdown.open { display: block; }
    .account-dropdown a, .account-dropdown button {
      display: block;
      width: 100%;
      padding: 10px 16px;
      color: var(--muted);
      font-size: 14px;
      text-decoration: none;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font-family: 'DM Sans', sans-serif;
      transition: background 0.12s, color 0.12s;
    }
    .account-dropdown a:hover, .account-dropdown button:hover {
      background: var(--bg4);
      color: #fff;
    }

    /* ── PAGE ── */
    .page-wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }
    .page-header {
      margin-bottom: 32px;
    }
    .page-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 32px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 6px;
    }
    .page-subtitle {
      font-size: 15px;
      color: var(--muted);
    }

    /* ── SETTINGS CARD ── */
    .settings-card {
      background: var(--bg2);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .settings-card-header {
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--card-border);
    }
    .settings-card-title {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
    }
    .settings-card-hint {
      font-size: 13px;
      color: var(--muted);
    }
    .settings-rows {
      padding: 0;
    }
    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
      border-bottom: 1px solid var(--card-border);
    }
    .settings-row:last-child { border-bottom: none; }
    .settings-row-label {
      font-size: 15px;
      font-weight: 500;
      color: #fff;
      margin-bottom: 2px;
    }
    .settings-row-desc {
      font-size: 13px;
      color: var(--muted);
    }
    .settings-row-control {
      display: flex;
      gap: 0;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--card-border);
      flex-shrink: 0;
      margin-left: 16px;
    }
    .freq-btn {
      background: var(--bg3);
      color: var(--muted);
      border: none;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 14px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      border-right: 1px solid var(--card-border);
    }
    .freq-btn:last-child { border-right: none; }
    .freq-btn:hover {
      background: var(--bg4);
      color: #fff;
    }
    .freq-btn.active {
      background: var(--orange);
      color: #fff;
    }

    /* ── SAVE FOOTER ── */
    .settings-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--card-border);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn-save {
      background: var(--orange);
      color: #fff;
      border: none;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 22px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-save:hover { background: var(--orange-light); }
    .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
    .save-msg {
      font-size: 13px;
      display: none;
    }
    .save-msg-ok { color: #4ade80; }
    .save-msg-error { color: #f87171; }

    /* ── AUTH GATE ── */
    .auth-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      font-size: 16px;
      color: var(--muted);
    }
  </style>
</head>
<body>

  <!-- TOPBAR -->
  <header class="topbar">
    <a href="/index.html" class="topbar-logo">StaxAI</a>
    <nav class="topbar-nav">
      <a href="/dashboard.html">Dashboard</a>
    </nav>
    <div class="topbar-spacer"></div>
    <div class="topbar-right">
      <a href="/content-library.html" class="topbar-cl-link">Content Library</a>
      <div class="account-dropdown-wrap">
        <button class="account-btn" id="account-btn">Account ▾</button>
        <div class="account-dropdown" id="account-dropdown">
          <a href="/account.html">Account Management</a>
          <button id="signout-btn">Sign Out</button>
        </div>
      </div>
    </div>
  </header>

  <!-- PAGE -->
  <div class="page-wrap" id="page-wrap" style="display:none">
    <div class="page-header">
      <h1 class="page-title">Content Library Settings</h1>
      <p class="page-subtitle">Control how frequently your connected sources are scanned for new content.</p>
    </div>

    <div class="settings-card" id="scan-frequency-card">
      <div class="settings-card-header">
        <div class="settings-card-title">Auto-Scan Frequency</div>
        <div class="settings-card-hint">Automatic scans run in the background. You can always trigger a manual scan from the Upload &amp; Import tab.</div>
      </div>
      <div class="settings-rows">

        <div class="settings-row">
          <div>
            <div class="settings-row-label">Business Email</div>
            <div class="settings-row-desc">Scans your connected Gmail or Outlook inbox for new content.</div>
          </div>
          <div class="settings-row-control" id="email-freq-ctrl">
            <button class="freq-btn active" data-field="email_scan_frequency" data-value="daily">Daily</button>
            <button class="freq-btn" data-field="email_scan_frequency" data-value="weekly">Weekly</button>
            <button class="freq-btn" data-field="email_scan_frequency" data-value="manual">Manual only</button>
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row-label">Google Drive</div>
            <div class="settings-row-desc">Scans your connected Drive folders for new photos and documents.</div>
          </div>
          <div class="settings-row-control" id="drive-freq-ctrl">
            <button class="freq-btn" data-field="drive_scan_frequency" data-value="daily">Daily</button>
            <button class="freq-btn active" data-field="drive_scan_frequency" data-value="weekly">Weekly</button>
            <button class="freq-btn" data-field="drive_scan_frequency" data-value="manual">Manual only</button>
          </div>
        </div>

        <div class="settings-row">
          <div>
            <div class="settings-row-label">Website</div>
            <div class="settings-row-desc">Scans your connected website pages for updated content.</div>
          </div>
          <div class="settings-row-control" id="website-freq-ctrl">
            <button class="freq-btn" data-field="website_scan_frequency" data-value="weekly">Weekly</button>
            <button class="freq-btn active" data-field="website_scan_frequency" data-value="monthly">Monthly</button>
            <button class="freq-btn" data-field="website_scan_frequency" data-value="manual">Manual only</button>
          </div>
        </div>

      </div>
      <div class="settings-footer">
        <button class="btn-save" id="save-scan-btn">Save Settings</button>
        <span class="save-msg" id="save-scan-msg"></span>
      </div>
    </div>

  </div>

  <div class="auth-loading" id="auth-loading">Loading...</div>

  <script src="/cl-settings-logic.js"></script>
  <script>
    (function() {
      var supabase = window.supabaseClient;
      if (!supabase) { document.getElementById('auth-loading').textContent = 'Configuration error. Please refresh.'; return; }

      supabase.auth.getUser().then(function(resp) {
        if (!resp.data || !resp.data.user) {
          window.location.href = '/index.html';
          return;
        }
        document.getElementById('auth-loading').style.display = 'none';
        document.getElementById('page-wrap').style.display = 'block';
        if (window.CL_SETTINGS_LOGIC && window.CL_SETTINGS_LOGIC.init) {
          window.CL_SETTINGS_LOGIC.init(supabase);
        }
      });

      var accountBtn = document.getElementById('account-btn');
      var accountDropdown = document.getElementById('account-dropdown');
      if (accountBtn) {
        accountBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          accountDropdown.classList.toggle('open');
        });
      }
      document.addEventListener('click', function() {
        if (accountDropdown) accountDropdown.classList.remove('open');
      });

      var signoutBtn = document.getElementById('signout-btn');
      if (signoutBtn) {
        signoutBtn.addEventListener('click', function() {
          supabase.auth.signOut().then(function() {
            window.location.href = '/index.html';
          });
        });
      }
    })();
  </script>

</body>
</html>
