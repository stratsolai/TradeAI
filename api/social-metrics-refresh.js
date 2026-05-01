import https from 'https';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GRAPH_VERSION = 'v19.0';
const CRON_SECRET = process.env.CRON_SECRET;

function graphGet(path, params, token) {
  const query = new URLSearchParams({ ...params, access_token: token }).toString();
  return new Promise((resolve, reject) => {
    https.get({ hostname: 'graph.facebook.com', path: `/${GRAPH_VERSION}/${path}?${query}` }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

export default async function handler(req, res) {
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { data: recentPosts, error: postsError } = await supabase
      .from('social_posts')
      .select('id, user_id, metadata, published_at')
      .eq('status', 'published')
      .gte('published_at', thirtyDaysAgo.toISOString())
      .not('metadata', 'is', null);

    if (postsError) {
      console.error('[social-metrics-refresh] query error:', postsError.message);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!recentPosts || recentPosts.length === 0) {
      return res.status(200).json({ message: 'No recent posts to refresh', updated: 0 });
    }

    const postsByAge = recentPosts.filter(p => {
      const pubDate = new Date(p.published_at);
      const ageMs = now.getTime() - pubDate.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      if (ageDays <= 7) return true;
      if (ageDays <= 30) {
        const hoursSinceLastRun = 24;
        return true;
      }
      return false;
    });

    const userIds = [...new Set(postsByAge.map(p => p.user_id))];
    const userTokens = {};

    for (const userId of userIds) {
      const { data: settings } = await supabase
        .from('social_settings')
        .select('meta_page_token, meta_page_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (settings && settings.meta_page_token && settings.meta_page_id) {
        userTokens[userId] = settings;
      }
    }

    let updated = 0;
    let errors = 0;

    for (const post of postsByAge) {
      const tokens = userTokens[post.user_id];
      if (!tokens) continue;

      const meta = post.metadata || {};
      const fbId = meta.facebook_id;
      const igId = meta.instagram_id;

      let reach = 0;
      let engagement = 0;
      let clicks = 0;

      try {
        if (fbId) {
          const insights = await graphGet(
            `${fbId}/insights`,
            { metric: 'post_impressions,post_engaged_users,post_clicks' },
            tokens.meta_page_token
          );

          if (insights.data) {
            for (const metric of insights.data) {
              const val = metric.values?.[0]?.value || 0;
              if (metric.name === 'post_impressions') reach += val;
              else if (metric.name === 'post_engaged_users') engagement += val;
              else if (metric.name === 'post_clicks') clicks += val;
            }
          }
        }

        if (igId) {
          const igInsights = await graphGet(
            `${igId}/insights`,
            { metric: 'reach,engagement' },
            tokens.meta_page_token
          );

          if (igInsights.data) {
            for (const metric of igInsights.data) {
              const val = metric.values?.[0]?.value || 0;
              if (metric.name === 'reach') reach += val;
              else if (metric.name === 'engagement') engagement += val;
            }
          }
        }

        if (reach > 0 || engagement > 0 || clicks > 0) {
          const { error: updateError } = await supabase
            .from('social_posts')
            .update({
              reach: reach,
              engagement: engagement,
              clicks: clicks,
              updated_at: new Date().toISOString()
            })
            .eq('id', post.id);

          if (updateError) {
            console.error('[social-metrics-refresh] update error for post', post.id, updateError.message);
            errors++;
          } else {
            updated++;
          }
        }
      } catch (err) {
        console.error('[social-metrics-refresh] fetch error for post', post.id, err.message);
        errors++;
      }
    }

    return res.status(200).json({
      message: 'Metrics refresh complete',
      total: postsByAge.length,
      updated,
      errors
    });
  } catch (err) {
    console.error('[social-metrics-refresh] error:', err);
    return res.status(500).json({ error: 'Metrics refresh failed' });
  }
}
