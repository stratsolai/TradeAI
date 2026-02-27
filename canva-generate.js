/**
 * /api/canva-generate.js
 * 
 * Canva Autofill API integration for TradeAI
 * 
 * Flow:
 * 1. Receive post content + metadata from Social Media Manager
 * 2. Select best-fit Canva template for the category/platform
 * 3. Call Canva Autofill API to fill in text + optional image
 * 4. Export the design as a JPG
 * 5. Save the post + graphic URL to publishing_queue with status 'pending_approval'
 * 6. Return success with queue ID
 * 
 * ENV VARS REQUIRED:
 *   CANVA_CLIENT_ID         — Canva Developer app client ID
 *   CANVA_CLIENT_SECRET     — Canva Developer app client secret
 *   CANVA_ACCESS_TOKEN      — Long-lived access token (or use OAuth)
 *   CANVA_BRAND_TEMPLATE_ID — Default brand template ID from Canva
 *   SUPABASE_URL            — Supabase project URL
 *   SUPABASE_SERVICE_KEY    — Supabase service role key (server-side only)
 * 
 * CANVA API DOCS: https://www.canva.com/developers/docs/connect/
 */

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// ─── TEMPLATE MAP ────────────────────────────────────────────────────────────
// Map post categories to Canva template IDs
// These template IDs come from your Canva account — replace with real ones
// after creating branded templates in Canva for each category.
// Format: 'DAXXXXXXXXXXXXXXXX' (Canva design ID)
const TEMPLATE_MAP = {
  'completed-jobs':   process.env.CANVA_TEMPLATE_COMPLETED_JOBS   || process.env.CANVA_BRAND_TEMPLATE_ID,
  'marketing':        process.env.CANVA_TEMPLATE_MARKETING         || process.env.CANVA_BRAND_TEMPLATE_ID,
  'tips':             process.env.CANVA_TEMPLATE_TIPS              || process.env.CANVA_BRAND_TEMPLATE_ID,
  'industry-trends':  process.env.CANVA_TEMPLATE_TRENDS           || process.env.CANVA_BRAND_TEMPLATE_ID,
  'team-culture':     process.env.CANVA_TEMPLATE_TEAM             || process.env.CANVA_BRAND_TEMPLATE_ID,
  'campaign':         process.env.CANVA_TEMPLATE_CAMPAIGN         || process.env.CANVA_BRAND_TEMPLATE_ID,
  'default':          process.env.CANVA_BRAND_TEMPLATE_ID
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Make an authenticated request to the Canva API
 */
function canvaRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.canva.com',
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Poll until a Canva async job completes
 * Returns the completed job data or throws on timeout/error
 */
async function pollJob(jobId, accessToken, maxAttempts = 20, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    const result = await canvaRequest('GET', `/rest/v1/autofills/${jobId}`, null, accessToken);
    if (result.status !== 200) throw new Error(`Job poll failed: ${JSON.stringify(result.body)}`);
    const job = result.body;
    if (job.job?.status === 'success') return job;
    if (job.job?.status === 'failed') throw new Error(`Canva job failed: ${JSON.stringify(job)}`);
    // Still 'in_progress' — keep polling
  }
  throw new Error('Canva job timed out after polling');
}

/**
 * Poll until a Canva export job completes
 */
async function pollExport(exportToken, accessToken, maxAttempts = 20, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, delayMs));
    const result = await canvaRequest('GET', `/rest/v1/exports/${exportToken}`, null, accessToken);
    if (result.status !== 200) throw new Error(`Export poll failed: ${JSON.stringify(result.body)}`);
    const exp = result.body;
    if (exp.job?.status === 'success') return exp;
    if (exp.job?.status === 'failed') throw new Error(`Export failed: ${JSON.stringify(exp)}`);
  }
  throw new Error('Canva export timed out after polling');
}

/**
 * Truncate post content for use in Canva text fields
 * Canva text fields have character limits — this handles the different zones
 */
function truncateForCanva(text, maxChars = 250) {
  if (!text || text.length <= maxChars) return text;
  return text.substring(0, maxChars - 3) + '...';
}

/**
 * Extract a short headline from post content (first sentence or first 60 chars)
 */
function extractHeadline(text) {
  if (!text) return '';
  const firstSentence = text.split(/[.!?\n]/)[0].trim();
  return firstSentence.length > 60 ? firstSentence.substring(0, 57) + '…' : firstSentence;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    userId,
    postContent,
    category,
    platforms,
    businessName,
    industry,
    imageBase64,       // Optional — user's uploaded photo (base64)
    campaignName,      // Optional — for campaign posts
  } = req.body;

  // ── Check required env vars ───────────────────────────────────────────────
  const accessToken  = process.env.CANVA_ACCESS_TOKEN;
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

  if (!accessToken) {
    // Graceful fallback — Canva not configured yet
    console.log('[canva-generate] CANVA_ACCESS_TOKEN not set — returning fallback');
    return res.status(200).json({
      success: false,
      fallback: true,
      message: 'Canva integration not yet configured. Please set CANVA_ACCESS_TOKEN in environment variables.'
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ── 1. Select template ────────────────────────────────────────────────
    const templateId = TEMPLATE_MAP[category] || TEMPLATE_MAP['default'];
    if (!templateId) {
      return res.status(500).json({
        error: 'No Canva template configured. Set CANVA_BRAND_TEMPLATE_ID in environment variables.'
      });
    }

    // ── 2. Prepare autofill data ──────────────────────────────────────────
    // These field names (headline, body_text, business_name, background_image)
    // must match the text/image element names in your Canva template.
    // Edit your template in Canva → select an element → rename it in the layers panel.
    const autofillData = {
      data: [
        {
          name: 'headline',        // text element named "headline" in template
          type: 'text',
          text: extractHeadline(postContent)
        },
        {
          name: 'body_text',       // text element named "body_text" in template
          type: 'text',
          text: truncateForCanva(postContent, 300)
        },
        {
          name: 'business_name',   // text element named "business_name" in template
          type: 'text',
          text: businessName || ''
        }
      ]
    };

    // Add background image if one was provided
    if (imageBase64) {
      // Upload image to Canva asset API first
      try {
        const uploadResult = await uploadImageToCanva(imageBase64, accessToken);
        if (uploadResult.assetId) {
          autofillData.data.push({
            name: 'background_image',   // image element named "background_image" in template
            type: 'image',
            asset_id: uploadResult.assetId
          });
        }
      } catch (imgErr) {
        // Non-fatal — continue without the image
        console.log('[canva-generate] Image upload failed (non-fatal):', imgErr.message);
      }
    }

    // ── 3. Create autofill job ────────────────────────────────────────────
    console.log('[canva-generate] Creating autofill job for template:', templateId);
    const autofillResp = await canvaRequest(
      'POST',
      `/rest/v1/autofills`,
      {
        brand_template_id: templateId,
        ...autofillData
      },
      accessToken
    );

    if (autofillResp.status !== 200 && autofillResp.status !== 201) {
      console.error('[canva-generate] Autofill creation failed:', autofillResp.body);
      return res.status(500).json({
        error: 'Canva autofill request failed',
        details: autofillResp.body
      });
    }

    const autofillJobId = autofillResp.body.job?.id;
    if (!autofillJobId) {
      return res.status(500).json({ error: 'No job ID returned from Canva autofill' });
    }

    // ── 4. Poll until autofill completes ─────────────────────────────────
    console.log('[canva-generate] Polling autofill job:', autofillJobId);
    const completedJob = await pollJob(autofillJobId, accessToken);
    const designId = completedJob.job?.result?.design?.id;
    if (!designId) {
      return res.status(500).json({ error: 'No design ID in completed autofill job' });
    }

    console.log('[canva-generate] Autofill complete, design ID:', designId);

    // ── 5. Export the design as JPG ───────────────────────────────────────
    const exportResp = await canvaRequest(
      'POST',
      `/rest/v1/exports`,
      {
        design_id: designId,
        format: 'jpg',
        export_quality: 'regular'
      },
      accessToken
    );

    if (exportResp.status !== 200 && exportResp.status !== 201) {
      console.error('[canva-generate] Export creation failed:', exportResp.body);
      return res.status(500).json({ error: 'Canva export request failed', details: exportResp.body });
    }

    const exportJobId = exportResp.body.job?.id;
    if (!exportJobId) {
      return res.status(500).json({ error: 'No export job ID from Canva' });
    }

    // ── 6. Poll until export completes ───────────────────────────────────
    console.log('[canva-generate] Polling export job:', exportJobId);
    const completedExport = await pollExport(exportJobId, accessToken);
    const graphicUrl = completedExport.job?.result?.urls?.[0];
    if (!graphicUrl) {
      return res.status(500).json({ error: 'No export URL in completed export job' });
    }

    console.log('[canva-generate] Export complete, graphic URL:', graphicUrl);

    // ── 7. Save to publishing_queue ───────────────────────────────────────
    const platformArray = Array.isArray(platforms) ? platforms : (platforms || 'facebook').split(',');
    const { data: queueItem, error: dbError } = await supabase
      .from('publishing_queue')
      .insert({
        user_id: userId,
        post_content: postContent,
        graphic_url: graphicUrl,
        platform: platformArray,
        category: category || 'marketing',
        campaign_name: campaignName || null,
        status: 'pending_approval',
        canva_design_id: designId
      })
      .select()
      .single();

    if (dbError) {
      console.error('[canva-generate] DB insert failed:', dbError);
      return res.status(500).json({ error: 'Failed to save to publishing queue', details: dbError });
    }

    return res.status(200).json({
      success: true,
      queueId: queueItem.id,
      designId: designId,
      graphicUrl: graphicUrl,
      message: 'Post + Canva graphic created and added to Publishing Queue'
    });

  } catch (err) {
    console.error('[canva-generate] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected error' });
  }
};

// ─── IMAGE UPLOAD HELPER ──────────────────────────────────────────────────────

/**
 * Upload a base64 image to Canva's asset API
 * Returns { assetId } on success
 * 
 * Canva requires uploading via a two-step process:
 * 1. POST /rest/v1/asset-uploads → get upload URL + asset ID
 * 2. PUT to the upload URL with raw image bytes
 */
async function uploadImageToCanva(base64Data, accessToken) {
  // Strip data URI prefix if present
  const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const imageBuffer = Buffer.from(base64Clean, 'base64');

  // Step 1: Request upload URL
  const initResp = await canvaRequest(
    'POST',
    '/rest/v1/asset-uploads',
    {
      name: `tradeai-upload-${Date.now()}.jpg`,
      content_type: 'image/jpeg'
    },
    accessToken
  );

  if (initResp.status !== 200 && initResp.status !== 201) {
    throw new Error(`Asset upload init failed: ${JSON.stringify(initResp.body)}`);
  }

  const uploadUrl = initResp.body.job?.upload_url;
  const assetId   = initResp.body.job?.asset_id;

  if (!uploadUrl || !assetId) {
    throw new Error('No upload URL or asset ID returned from Canva');
  }

  // Step 2: Upload raw bytes to the signed URL
  await uploadBytesToUrl(uploadUrl, imageBuffer, 'image/jpeg');

  // Step 3: Poll until asset is ready
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const assetResp = await canvaRequest('GET', `/rest/v1/assets/${assetId}`, null, accessToken);
    if (assetResp.status === 200 && assetResp.body.asset?.id) {
      return { assetId };
    }
  }

  throw new Error('Asset upload timed out');
}

/**
 * PUT raw bytes to a pre-signed URL (Canva upload URL)
 */
function uploadBytesToUrl(url, buffer, contentType) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode }));
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}
