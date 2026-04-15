// api/scan-scheduler.js — Task 21
// Scheduled scan frequency scheduler. Runs once per day via Vercel Cron.
// Reads every user's saved scan frequency preferences from cl_settings
// and profiles.ea_connected_emails, checks when each source was last
// scanned, and queues scan jobs for any source that is due.
//
// Auth: CRON_SECRET required in Authorization: Bearer header (Vercel
// Cron sends this automatically).
//
// Does NOT run scans itself — it only inserts rows into cl_scan_jobs
// with status: 'queued'. The existing scan-worker picks them up.

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Frequency intervals in milliseconds
var INTERVALS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
};

// Check whether a scan is due based on frequency and last completed time
function isDue(frequency, lastCompletedAt) {
  if (!frequency || frequency === 'manual') return false;
  var interval = INTERVALS[frequency];
  if (!interval) return false;
  if (!lastCompletedAt) return true; // never scanned — due immediately
  var elapsed = Date.now() - new Date(lastCompletedAt).getTime();
  return elapsed >= interval;
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── CRON_SECRET auth ─────────────────────────────────────────────────
  var cronSecret = process.env.CRON_SECRET;
  var authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== 'Bearer ' + cronSecret) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  var queued = 0;
  var skipped = 0;
  var errors = 0;
  var queuedByType = {};

  try {
    // ── Load all profiles with at least one connected source ──────────
    var profilesRes = await supabase
      .from('profiles')
      .select('id, cl_connected_emails, cl_drive_accounts, cl_onedrive_accounts, cl_sharepoint_accounts, cl_dropbox_accounts, website_urls, ea_connected_emails');
    if (profilesRes.error) {
      console.error('[scan-scheduler] Profiles query error:', profilesRes.error.message);
      return res.status(500).json({ error: 'Failed to load profiles' });
    }
    var profiles = profilesRes.data || [];

    // ── Load all cl_settings rows ────────────────────────────────────
    var settingsRes = await supabase
      .from('cl_settings')
      .select('user_id, email_scan_frequency, drive_scan_frequency, onedrive_scan_frequency, sharepoint_scan_frequency, dropbox_scan_frequency, website_scan_frequency');
    if (settingsRes.error) {
      console.error('[scan-scheduler] Settings query error:', settingsRes.error.message);
      return res.status(500).json({ error: 'Failed to load settings' });
    }
    var settingsById = {};
    (settingsRes.data || []).forEach(function(row) { settingsById[row.user_id] = row; });

    // ── Load most recent completed scan per user+source_type+source_account+source_path ──
    var lastScansRes = await supabase
      .from('cl_scan_jobs')
      .select('user_id, source_type, source_account, source_path, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });
    if (lastScansRes.error) {
      console.error('[scan-scheduler] Last scans query error:', lastScansRes.error.message);
      return res.status(500).json({ error: 'Failed to load scan history' });
    }
    // Build lookup: key = user_id:source_type:source_account:source_path → most recent completed_at
    var lastScanLookup = {};
    (lastScansRes.data || []).forEach(function(row) {
      var key = row.user_id + ':' + row.source_type + ':' + (row.source_account || '') + ':' + (row.source_path || '');
      if (!lastScanLookup[key]) lastScanLookup[key] = row.completed_at;
    });

    // ── Load currently queued/running jobs to avoid duplicates ────────
    var activeJobsRes = await supabase
      .from('cl_scan_jobs')
      .select('user_id, source_type, source_account, source_path')
      .in('status', ['queued', 'running']);
    if (activeJobsRes.error) {
      console.error('[scan-scheduler] Active jobs query error:', activeJobsRes.error.message);
      return res.status(500).json({ error: 'Failed to load active jobs' });
    }
    var activeJobKeys = new Set();
    (activeJobsRes.data || []).forEach(function(row) {
      activeJobKeys.add(row.user_id + ':' + row.source_type + ':' + (row.source_account || '') + ':' + (row.source_path || ''));
    });

    // ── Helper: queue a single scan job ──────────────────────────────
    async function queueJob(userId, sourceType, sourceAccount, sourcePath) {
      var key = userId + ':' + sourceType + ':' + (sourceAccount || '') + ':' + (sourcePath || '');
      if (activeJobKeys.has(key)) { skipped++; return; }
      try {
        var insertRes = await supabase
          .from('cl_scan_jobs')
          .insert({
            user_id: userId,
            source_type: sourceType,
            source_account: sourceAccount,
            source_path: sourcePath || null,
            status: 'queued',
            priority: 2,
            retry_count: 0
          });
        if (insertRes.error) {
          console.error('[scan-scheduler] Insert error for', sourceType, sourceAccount, ':', insertRes.error.message);
          errors++;
          return;
        }
        queued++;
        queuedByType[sourceType] = (queuedByType[sourceType] || 0) + 1;
        activeJobKeys.add(key);
      } catch (e) {
        console.error('[scan-scheduler] Queue exception for', sourceType, sourceAccount, ':', e.message);
        errors++;
      }
    }

    // ── Process each user ────────────────────────────────────────────
    for (var pi = 0; pi < profiles.length; pi++) {
      var profile = profiles[pi];
      var userId = profile.id;
      var settings = settingsById[userId] || {};

      // ── CL Email (Gmail + Outlook) ──────────────────────────────
      var clEmails = Array.isArray(profile.cl_connected_emails) ? profile.cl_connected_emails : [];
      if (clEmails.length > 0 && isDue(settings.email_scan_frequency, null)) {
        for (var ei = 0; ei < clEmails.length; ei++) {
          var emailEntry = clEmails[ei];
          if (!emailEntry || !emailEntry.email) continue;
          var emailSourceType = (emailEntry.provider === 'gmail' || emailEntry.provider === 'google') ? 'gmail' : 'outlook';
          var emailKey = userId + ':' + emailSourceType + ':' + emailEntry.email + ':';
          var emailLastScan = lastScanLookup[emailKey] || null;
          if (isDue(settings.email_scan_frequency, emailLastScan)) {
            await queueJob(userId, emailSourceType, emailEntry.email, null);
          }
        }
      }

      // ── CL Google Drive ─────────────────────────────────────────
      var driveAccounts = Array.isArray(profile.cl_drive_accounts) ? profile.cl_drive_accounts : [];
      if (driveAccounts.length > 0 && isDue(settings.drive_scan_frequency, null)) {
        for (var di = 0; di < driveAccounts.length; di++) {
          var driveAcct = driveAccounts[di];
          if (!driveAcct || !driveAcct.account_email) continue;
          var driveFolders = Array.isArray(driveAcct.folders) ? driveAcct.folders : [];
          for (var df = 0; df < driveFolders.length; df++) {
            var driveFolder = driveFolders[df];
            if (!driveFolder || !driveFolder.id) continue;
            var driveKey = userId + ':gdrive:' + driveAcct.account_email + ':' + driveFolder.id;
            var driveLastScan = lastScanLookup[driveKey] || null;
            if (isDue(settings.drive_scan_frequency, driveLastScan)) {
              await queueJob(userId, 'gdrive', driveAcct.account_email, driveFolder.id);
            }
          }
        }
      }

      // ── CL OneDrive ─────────────────────────────────────────────
      var onedriveAccounts = Array.isArray(profile.cl_onedrive_accounts) ? profile.cl_onedrive_accounts : [];
      if (onedriveAccounts.length > 0 && isDue(settings.onedrive_scan_frequency, null)) {
        for (var oi = 0; oi < onedriveAccounts.length; oi++) {
          var odAcct = onedriveAccounts[oi];
          if (!odAcct || !odAcct.account_email) continue;
          var odFolders = Array.isArray(odAcct.folders) ? odAcct.folders : [];
          for (var of2 = 0; of2 < odFolders.length; of2++) {
            var odFolder = odFolders[of2];
            if (!odFolder || !odFolder.id) continue;
            var odKey = userId + ':onedrive:' + odAcct.account_email + ':' + odFolder.id;
            var odLastScan = lastScanLookup[odKey] || null;
            if (isDue(settings.onedrive_scan_frequency, odLastScan)) {
              await queueJob(userId, 'onedrive', odAcct.account_email, odFolder.id);
            }
          }
        }
      }

      // ── CL SharePoint ───────────────────────────────────────────
      var spAccounts = Array.isArray(profile.cl_sharepoint_accounts) ? profile.cl_sharepoint_accounts : [];
      if (spAccounts.length > 0 && isDue(settings.sharepoint_scan_frequency, null)) {
        for (var si = 0; si < spAccounts.length; si++) {
          var spAcct = spAccounts[si];
          if (!spAcct || !spAcct.account_email) continue;
          var spSites = Array.isArray(spAcct.sites) ? spAcct.sites : [];
          for (var ss = 0; ss < spSites.length; ss++) {
            var site = spSites[ss];
            if (!site || !site.id) continue;
            var spLibs = Array.isArray(site.libraries) ? site.libraries : [];
            for (var sl = 0; sl < spLibs.length; sl++) {
              var lib = spLibs[sl];
              if (!lib || !lib.id) continue;
              var spPath = site.id + '|' + lib.id;
              var spKey = userId + ':sharepoint:' + spAcct.account_email + ':' + spPath;
              var spLastScan = lastScanLookup[spKey] || null;
              if (isDue(settings.sharepoint_scan_frequency, spLastScan)) {
                await queueJob(userId, 'sharepoint', spAcct.account_email, spPath);
              }
            }
          }
        }
      }

      // ── CL Dropbox ──────────────────────────────────────────────
      var dbAccounts = Array.isArray(profile.cl_dropbox_accounts) ? profile.cl_dropbox_accounts : [];
      if (dbAccounts.length > 0 && isDue(settings.dropbox_scan_frequency, null)) {
        for (var dbi = 0; dbi < dbAccounts.length; dbi++) {
          var dbAcct = dbAccounts[dbi];
          if (!dbAcct || !dbAcct.account_email) continue;
          var dbFolders = Array.isArray(dbAcct.folders) ? dbAcct.folders : [];
          for (var dbf = 0; dbf < dbFolders.length; dbf++) {
            var dbFolder = dbFolders[dbf];
            if (!dbFolder) continue;
            var dbPath = dbFolder.path || dbFolder.id || '';
            if (!dbPath) continue;
            var dbKey = userId + ':dropbox:' + dbAcct.account_email + ':' + dbPath;
            var dbLastScan = lastScanLookup[dbKey] || null;
            if (isDue(settings.dropbox_scan_frequency, dbLastScan)) {
              await queueJob(userId, 'dropbox', dbAcct.account_email, dbPath);
            }
          }
        }
      }

      // ── CL Website ──────────────────────────────────────────────
      var websiteUrls = Array.isArray(profile.website_urls) ? profile.website_urls : [];
      if (websiteUrls.length > 0 && isDue(settings.website_scan_frequency, null)) {
        for (var wi = 0; wi < websiteUrls.length; wi++) {
          var url = websiteUrls[wi];
          if (!url) continue;
          var webKey = userId + ':website:' + url + ':';
          var webLastScan = lastScanLookup[webKey] || null;
          if (isDue(settings.website_scan_frequency, webLastScan)) {
            await queueJob(userId, 'website', url, null);
          }
        }
      }

      // ── EA Email (Gmail + Outlook) ──────────────────────────────
      var eaEmails = Array.isArray(profile.ea_connected_emails) ? profile.ea_connected_emails : [];
      for (var eai = 0; eai < eaEmails.length; eai++) {
        var eaEntry = eaEmails[eai];
        if (!eaEntry || !eaEntry.email) continue;
        var eaCadence = eaEntry.scan_cadence || 'manual';
        if (eaCadence === 'manual') continue;
        var eaSourceType = (eaEntry.provider === 'gmail' || eaEntry.provider === 'google') ? 'ea-gmail' : 'ea-outlook';
        var eaKey = userId + ':' + eaSourceType + ':' + eaEntry.email + ':';
        var eaLastScan = lastScanLookup[eaKey] || null;
        if (isDue(eaCadence, eaLastScan)) {
          await queueJob(userId, eaSourceType, eaEntry.email, null);
        }
      }
    }

    console.log('[scan-scheduler] Complete — queued:', queued, 'skipped (active):', skipped, 'errors:', errors, 'byType:', JSON.stringify(queuedByType));
    return res.status(200).json({ success: true, queued: queued, skipped: skipped, errors: errors, queuedByType: queuedByType });

  } catch (err) {
    console.error('[scan-scheduler] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
