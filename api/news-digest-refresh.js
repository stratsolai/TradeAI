// api/news-digest-refresh.js — Phase 5 tender-only refresh
//
// Per Shared Research Layer Spec v1.0 Section 13.1, ID no longer
// runs its own Serper queries or Haiku curation for the five news
// tabs — those come from shared_research (cohort-scoped after the
// Cohort Architecture migration). This endpoint covers only the
// tender flow below; the news tabs are populated from a separate
// page-load read in news-digest-logic.js. The browser-side
// /api/shared-research-refresh trigger that used to fire in parallel
// with this endpoint was removed in SRL Cohort Architecture
// Addendum v1.2 §12; ID's tool review will redesign the cohort-aware
// re-read flow (§13 out of scope for the SRL rebuild).
//
// What's left here is the tender flow:
//   1. AusTender ATM search by industry
//   2. NSW eTendering search by industry
//   3. Combine + dedupe by URL
//   4. Replace the user's news_digest_tenders rows in one batch
//   5. Stamp summary_generated_at so the ID page's "Last refreshed"
//      label updates
//
// Removed in Phase 5 (per Sections 13.1 + 16):
//   - Serper query construction + execution
//   - Claude/Haiku curation prompt + call
//   - news_digest_briefings writes (writer retired in Phase 5; the
//     table itself was retained until the Supply Chain rename
//     cleanup and has now been dropped from Supabase. Three live
//     readers — ID Summary tab, dashboard news tile, Social Media
//     news-digest workflow — will error on each page load until
//     they are migrated to a new source or removed)
//   - Content Library auto-writes for category briefings AND for
//     every tender (per Section 16.2 — the user-driven Interested
//     → CL flow is not yet implemented and is preserved unchanged
//     by being absent)
//   - Preferred-source domains read from news_digest_settings
//     (decommissioned per Section 16.1)
//   - Content Library item read (was feeding Claude; nothing to
//     feed now)

export const config = { maxDuration: 60 };

import { createClient } from '@supabase/supabase-js';
import { requireBpComplete } from '../lib/bp-gate.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ---------------------------------------------------------------------------
// AusTender ATM search
// ---------------------------------------------------------------------------

async function fetchAusTender(industry) {
  try {
    var url = 'https://api.tenders.gov.au/?keyword=' + encodeURIComponent(industry) + '&status=open&limit=10';
    var response = await fetch(url, {
      headers: {
        'User-Agent': 'StaxAI/1.0 (news digest aggregator)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      console.error('[news-digest] AusTender non-OK:', response.status);
      return [];
    }
    var data;
    try { data = await response.json(); }
    catch (parseErr) {
      console.error('[news-digest] AusTender JSON parse error:', parseErr.message);
      return [];
    }
    var list = Array.isArray(data && data.results) ? data.results
             : Array.isArray(data && data.approachToMarkets) ? data.approachToMarkets
             : Array.isArray(data) ? data
             : [];
    return list.slice(0, 10).map(function(atm) {
      var atmId = atm.atmId || atm.id || atm.ATMID || null;
      var link = atm.url || atm.link || (atmId ? 'https://www.tenders.gov.au/atm/Show/' + atmId : null);
      return {
        title: atm.title || atm.atmTitle || atm.name || '(Untitled ATM)',
        snippet: String(atm.description || atm.summary || atm.shortDescription || '').substring(0, 500),
        link: link,
        source_name: atm.agency || atm.publisher || 'AusTender',
        tender_meta: {
          atm_id: atmId,
          agency: atm.agency || null,
          category: atm.category || atm.atmType || null,
          close_date: atm.closeDate || atm.closeDateTime || null,
          location: atm.location || null,
          source: 'AusTender'
        }
      };
    });
  } catch (err) {
    console.error('[news-digest] AusTender exception:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// NSW eTendering search (public API, rate-limited by IP)
// ---------------------------------------------------------------------------

async function fetchNswEtendering(industry) {
  try {
    var url = 'https://tenders.nsw.gov.au/?event=public.api.planning.search' +
              '&type=rftEvent' +
              '&rftType=published' +
              '&keyword=' + encodeURIComponent(industry);
    var response = await fetch(url, {
      headers: {
        'User-Agent': 'StaxAI/1.0 (news digest aggregator)',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) {
      if (response.status === 429) {
        console.error('[news-digest] NSW eTendering rate limited (429) — returning empty');
      } else {
        console.error('[news-digest] NSW eTendering non-OK:', response.status);
      }
      return [];
    }
    var bodyText = await response.text();
    if (/too many requests/i.test(bodyText)) {
      console.error('[news-digest] NSW eTendering rate limited (body match) — returning empty');
      return [];
    }
    var data;
    try { data = JSON.parse(bodyText); }
    catch (parseErr) {
      console.error('[news-digest] NSW eTendering JSON parse error:', parseErr.message, 'body:', bodyText.substring(0, 200));
      return [];
    }
    var list = Array.isArray(data && data.results) ? data.results
             : Array.isArray(data && data.tenders) ? data.tenders
             : Array.isArray(data && data.RFTs) ? data.RFTs
             : Array.isArray(data && data.events) ? data.events
             : Array.isArray(data) ? data
             : [];
    return list.slice(0, 10).map(function(t) {
      var rftUuid = t.RFTUUID || t.rftUUID || t.uuid || t.id || null;
      var link = t.url || t.link || (rftUuid ? 'https://tenders.nsw.gov.au/?event=public.RFT.view&RFTUUID=' + rftUuid : null);
      return {
        title: t.title || t.RFTTitle || t.rftTitle || '(Untitled tender)',
        snippet: String(t.description || t.RFTDescription || t.shortDescription || '').substring(0, 500),
        link: link,
        source_name: t.agency || t.agencyName || t.department || 'NSW Government',
        tender_meta: {
          atm_id: rftUuid,
          agency: t.agency || t.agencyName || null,
          category: t.tenderType || t.category || null,
          close_date: t.closeDate || t.closeDateTime || null,
          location: t.location || 'NSW',
          source: 'NSW eTendering'
        }
      };
    });
  } catch (err) {
    console.error('[news-digest] NSW eTendering exception:', err.message);
    return [];
  }
}

function dedupByLink(items) {
  var seen = new Set();
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var key = items[i].link;
    if (!key) { out.push(items[i]); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(items[i]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  var token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorised — missing bearer token' });

  var supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  var userRes = await supabase.auth.getUser(token);
  if (userRes.error || !userRes.data || !userRes.data.user) {
    console.error('[news-digest] Auth error:', userRes.error && userRes.error.message);
    return res.status(401).json({ error: 'Unauthorised — invalid token' });
  }
  var userId = userRes.data.user.id;
  if (!(await requireBpComplete(supabase, userId, res))) return;

  try {
    console.log('[news-digest] Tender refresh start — userId:', userId);

    var profileRes = await supabase
      .from('profiles')
      .select('industry')
      .eq('id', userId)
      .single();
    if (profileRes.error) {
      console.error('[news-digest] Profile error:', profileRes.error.message);
      return res.status(500).json({ error: 'Could not load profile' });
    }
    var industry = (profileRes.data && profileRes.data.industry) || 'general business';

    // Retention cleanup for tenders only. news_digest_briefings
    // writes were retired in Phase 5; the table itself was retained
    // until the Supply Chain rename cleanup and has now been dropped
    // from Supabase. The CL retention sweep for tool_source='news-
    // digest' is preserved so any pre-Phase-5 briefing rows still in
    // CL age out on their existing schedule.
    var settingsRes = await supabase
      .from('news_digest_settings')
      .select('lookback_days')
      .eq('user_id', userId)
      .maybeSingle();
    var lookbackDays = (settingsRes.data && parseInt(settingsRes.data.lookback_days)) || 180;
    var cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      var delTenders = await supabase
        .from('news_digest_tenders')
        .delete()
        .eq('user_id', userId)
        .lt('refreshed_at', cutoffDate);
      if (delTenders.error) console.error('[news-digest] Retention cleanup tenders error:', delTenders.error.message);

      var delCl = await supabase
        .from('content_library')
        .delete()
        .eq('user_id', userId)
        .eq('tool_source', 'news-digest')
        .lt('created_at', cutoffDate);
      if (delCl.error) console.error('[news-digest] Retention cleanup CL error:', delCl.error.message);
    } catch (cleanupErr) {
      console.error('[news-digest] Retention cleanup exception:', cleanupErr.message);
    }

    // Fetch tenders in parallel. Independent failures must not stop
    // the rest — each fetch helper already returns [] on error.
    var results = await Promise.all([
      fetchAusTender(industry).catch(function(e) { console.error('[news-digest] AusTender exception:', e.message); return []; }),
      fetchNswEtendering(industry).catch(function(e) { console.error('[news-digest] NSW eTendering exception:', e.message); return []; })
    ]);
    var combined = results[0].concat(results[1]);
    var tenderItems = dedupByLink(combined);
    console.log('[news-digest] Tenders fetched —', 'austender:', results[0].length, 'nsw:', results[1].length, 'deduped:', tenderItems.length);

    var now = new Date().toISOString();

    // Replace the user's tender batch in one delete+insert. Same
    // pattern as the pre-Phase-5 code, preserved unchanged because
    // tender display is not part of the Shared Research Layer.
    var delAllTenders = await supabase
      .from('news_digest_tenders')
      .delete()
      .eq('user_id', userId);
    if (delAllTenders.error) {
      console.error('[news-digest] Delete tenders error:', delAllTenders.error.message);
    }

    if (tenderItems.length > 0) {
      var tenderRows = tenderItems.map(function(t) {
        return {
          user_id: userId,
          title: String(t.title || '').substring(0, 500),
          url: t.link || null,
          agency: (t.tender_meta && t.tender_meta.agency) || t.source_name || null,
          category: (t.tender_meta && t.tender_meta.category) || null,
          close_date: (t.tender_meta && t.tender_meta.close_date) || null,
          location: (t.tender_meta && t.tender_meta.location) || null,
          description: (t.snippet || '').substring(0, 1000),
          source: (t.tender_meta && t.tender_meta.source) || 'AusTender',
          refreshed_at: now
        };
      });
      var tRes = await supabase
        .from('news_digest_tenders')
        .insert(tenderRows);
      if (tRes.error) {
        console.error('[news-digest] Insert tenders error:', tRes.error.message);
      }
    }

    // Refresh the "Last refreshed" timestamp the ID page displays.
    // The Summary tab is OUT OF SCOPE for Phase 5 — it'll continue
    // to read this column unchanged.
    var updateRes = await supabase
      .from('news_digest_settings')
      .update({
        summary_generated_at: now,
        updated_at: now
      })
      .eq('user_id', userId);
    if (updateRes.error) {
      console.error('[news-digest] Settings update error:', updateRes.error.message);
    }

    console.log('[news-digest] Tender refresh complete — tenders:', tenderItems.length);
    return res.status(200).json({
      message: 'Tenders refreshed',
      tenders: tenderItems.length,
      refreshed_at: now
    });

  } catch (err) {
    console.error('[news-digest] Unhandled exception:', err.message || err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
