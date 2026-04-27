// upgrade-sharepoint.js — shared SharePoint entry upgrade utility
//
// Lazy-upgrades a SharePoint account entry from the legacy single-site
// shape ({ site, libraries }) to the multi-site shape ({ sites: [...] }).
// Idempotent — safe to call on already-upgraded entries.
//
// Loaded in browser via <script> tag (sets window global).
// Imported by api/sharepoint-import.js via Vercel bundler.

function upgradeSharepointEntry(entry) {
  if (!entry) return;
  if (entry.site && entry.site.id) {
    if (!Array.isArray(entry.sites)) entry.sites = [];
    var siteAlreadyIn = entry.sites.some(function (s) { return s && s.id === entry.site.id; });
    if (!siteAlreadyIn) {
      entry.sites.push({
        id: entry.site.id,
        displayName: entry.site.displayName,
        webUrl: entry.site.webUrl,
        libraries: Array.isArray(entry.libraries) ? entry.libraries : [],
      });
    }
    delete entry.site;
    delete entry.libraries;
  } else if (!Array.isArray(entry.sites)) {
    entry.sites = [];
  }
}

// Browser: expose as window global
if (typeof window !== 'undefined') {
  window.upgradeSharepointEntry = upgradeSharepointEntry;
}
