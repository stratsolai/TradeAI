/**
 * api/design-visualiser.js
 *
 * Design Visualiser render generation endpoint.
 * Takes a source photo URL + description, generates an AI render via Ideogram,
 * stores the result in cl-assets, and saves to dv_renders.
 *
 * Supports watermarked renders for chatbot widget integration.
 *
 * ENV VARS REQUIRED:
 *   IDEOGRAM_API_KEY
 *   CLAUDE_API_KEY
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ── HELPERS ──────────────────────────────────────────────────────────────────

function httpsPost(hostname, path, headers, body) {
  return new Promise(function(resolve, reject) {
    var bodyStr = JSON.stringify(body);
    var req = https.request(
      { hostname: hostname, path: path, method: 'POST', headers: Object.assign({}, headers, { 'Content-Length': Buffer.byteLength(bodyStr) }) },
      function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch(e) { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function downloadImage(url) {
  return new Promise(function(resolve, reject) {
    var lib = url.startsWith('https') ? https : require('http');
    lib.get(url, function(res) {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error('Image download failed with status ' + res.statusCode));
      }
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var rawType = res.headers['content-type'] || 'image/jpeg';
        var contentType = rawType.split(';')[0].trim();
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: contentType
        });
      });
    }).on('error', reject);
  });
}

function buildMultipartForm(fields, imageBuffer, imageFilename, imageContentType) {
  var boundary = '----StaxAIDVBoundary' + Date.now();
  var parts = [];
  for (var name in fields) {
    if (fields[name] === null || fields[name] === undefined) continue;
    parts.push(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="' + name + '"\r\n\r\n' +
      fields[name] + '\r\n'
    );
  }
  parts.push(
    '--' + boundary + '\r\n' +
    'Content-Disposition: form-data; name="image"; filename="' + imageFilename + '"\r\n' +
    'Content-Type: ' + imageContentType + '\r\n\r\n'
  );
  var bodyStart = Buffer.from(parts.join(''));
  var bodyEnd = Buffer.from('\r\n--' + boundary + '--\r\n');
  var body = Buffer.concat([bodyStart, imageBuffer, bodyEnd]);
  return { body: body, boundary: boundary };
}

function ideogramMultipart(path, boundary, body, apiKey) {
  return new Promise(function(resolve, reject) {
    var req = https.request({
      hostname: 'api.ideogram.ai',
      path: path,
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'Content-Length': body.length
      }
    }, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var raw = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch(e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── INDUSTRY PROMPT CONTEXT ──────────────────────────────────────────────────

var INDUSTRY_CONTEXT = {
  'building-construction': 'architectural and structural modifications including extensions, facades, renovations and structural changes. Focus on realistic building materials (brick, timber framing, concrete, steel), proper structural proportions, correct roofline integration and construction feasibility.',
  'electrical-solar': 'electrical and solar installations including lighting layouts, fixture placements and solar panel positioning. Focus on realistic fixture appearance, proper panel angles and spacing, and safety compliance visual cues.',
  'plumbing-gas': 'plumbing and bathroom/kitchen fixture layouts including taps, basins, showers, toilets and kitchen sinks. Focus on realistic fixture finishes (chrome, matte black, brushed nickel), proper layout and functional design.',
  'hvac-refrigeration': 'HVAC unit placements and ducting layouts including split systems, ducted systems and ventilation. Focus on realistic unit sizing, proper clearances and duct routing.',
  'landscaping-outdoor': 'landscaping and outdoor living spaces including garden designs, decking, fencing, pools, outdoor kitchens and hardscaping. Focus on realistic plant types for Australian climate, proper drainage, material textures (timber, composite, stone, concrete) and outdoor lighting.',
  'painting-finishing': 'painting and surface finishing including room recolours, wall treatments and material changes. Focus on realistic paint colour rendering, proper light reflection on surfaces, texture differences (matte, satin, gloss) and colour harmony.',
  'fabrication-manufacturing': 'custom metalwork and fabricated products including gates, balustrades, shelving and bespoke items. Focus on realistic metal finishes (powder coat, raw steel, aluminium), weld details and structural integrity.',
  'cleaning-maintenance': 'before and after cleaning transformations showing surface restoration, pressure washing results and maintenance outcomes. Focus on realistic dirt/grime removal, surface restoration and material recovery.',
  'service-professional': 'professional service visualisations. Focus on clean, professional presentation.'
};

// ── PROMPT BUILDER ───────────────────────────────────────────────────────────

async function buildRenderPrompt(claudeKey, params) {
  var industryLines = (params.industries || [])
    .map(function(id) { return INDUSTRY_CONTEXT[id]; })
    .filter(Boolean)
    .join('\n');

  var systemPrompt = 'You are an expert AI image prompt writer for design visualisation renders.\n'
    + 'You write prompts for Ideogram 3.0 — an AI image generator that modifies existing photos to show proposed changes.\n\n'
    + 'Your prompts must:\n'
    + '- Describe the MODIFICATIONS to apply to the source photo\n'
    + '- Be specific about materials, colours, dimensions and placement\n'
    + '- Include lighting and perspective cues to match the original photo\n'
    + '- Maintain photorealistic quality — the result should look like a real photo\n'
    + '- Be 2-4 sentences maximum\n'
    + '- Focus on what CHANGES, not what stays the same\n\n'
    + 'Industry context for this business:\n'
    + (industryLines || 'General trades and services') + '\n\n'
    + 'Respond with ONLY the image modification prompt. No preamble, no explanation.';

  var userPrompt;
  if (params.mode === 'refine') {
    userPrompt = 'The customer wants to refine a previous render.\n\n'
      + 'Previous render was based on: "' + (params.previousDescription || '') + '"\n\n'
      + 'Requested changes: "' + params.description + '"\n\n'
      + 'Write an Ideogram prompt that applies these refinements while maintaining the previous changes. The prompt should describe the complete desired outcome (not just the changes).';
  } else {
    userPrompt = 'Generate an Ideogram image modification prompt for this design visualisation request:\n\n'
      + 'Customer\'s description: "' + params.description + '"\n'
      + (params.renderType ? 'Render type: ' + params.renderType + '\n' : '')
      + '\nWrite a prompt that will modify the uploaded photo to show the requested changes with photorealistic quality.';
  }

  var response = await httpsPost(
    'api.anthropic.com',
    '/v1/messages',
    {
      'Content-Type': 'application/json',
      'x-api-key': claudeKey,
      'anthropic-version': '2023-06-01'
    },
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    }
  );

  if (response.status !== 200) {
    throw new Error('Prompt generation failed: ' + JSON.stringify(response.body));
  }

  var text = response.body.content && response.body.content[0] && response.body.content[0].text;
  return (text || '').trim();
}

// ── WATERMARK ────────────────────────────────────────────────────────────────

async function applyWatermark(imageBuffer, logoUrl, businessName) {
  var Jimp = require('jimp');
  var image = await Jimp.read(imageBuffer);
  var w = image.getWidth();
  var h = image.getHeight();

  var stamp;
  var useLogo = false;

  if (logoUrl) {
    try {
      var logoData = await downloadImage(logoUrl);
      stamp = await Jimp.read(logoData.buffer);
      var stampSize = Math.min(w, h) * 0.12;
      stamp.scaleToFit(stampSize, stampSize);
      useLogo = true;
    } catch (e) {
      console.log('[DV] Logo download failed, falling back to text watermark');
    }
  }

  if (!useLogo) {
    var text = businessName || 'StaxAI';
    var font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    var textW = Jimp.measureText(font, text);
    var textH = Jimp.measureTextHeight(font, text, textW + 20);
    stamp = new Jimp(textW + 20, textH + 10, 0x00000000);
    stamp.print(font, 10, 5, text);
  }

  stamp.rotate(45, false);
  stamp.opacity(0.25);

  var sw = stamp.getWidth();
  var sh = stamp.getHeight();
  var gapX = sw + 80;
  var gapY = sh + 80;

  var rowIdx = 0;
  for (var y = -sh; y < h + sh; y += gapY) {
    var offsetX = (rowIdx % 2 === 0) ? 0 : Math.floor(gapX / 2);
    for (var x = -sw + offsetX; x < w + sw; x += gapX) {
      image.composite(stamp, x, y);
    }
    rowIdx++;
  }

  return await image.getBufferAsync(Jimp.MIME_JPEG);
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────

module.exports = async function(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var authHeader = req.headers.authorization || '';
  var token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Missing authorisation token' });

  var supabaseUrl = process.env.SUPABASE_URL;
  var supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  var ideogramKey = process.env.IDEOGRAM_API_KEY;
  var claudeKey = process.env.CLAUDE_API_KEY;

  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Supabase not configured' });
  if (!ideogramKey) return res.status(500).json({ error: 'IDEOGRAM_API_KEY not configured' });
  if (!claudeKey) return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });

  var supabase = createClient(supabaseUrl, supabaseKey);

  var authResult = await supabase.auth.getUser(token);
  if (authResult.error || !authResult.data || !authResult.data.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  var user = authResult.data.user;

  var body = req.body || {};
  var photoUrl = body.photoUrl;
  var description = body.description;
  var renderType = body.renderType || null;
  var projectId = body.projectId || null;
  var sourceContext = body.sourceContext || 'tool';
  var conversationId = body.conversationId || null;
  var industries = body.industries || [];
  var businessName = body.businessName || '';
  var mode = body.mode || 'initial';
  var previousDescription = body.previousDescription || '';

  if (!photoUrl) return res.status(400).json({ error: 'photoUrl required' });
  if (!description) return res.status(400).json({ error: 'description required' });

  try {
    // CB render limits: 3 per conversation
    if (sourceContext === 'cb_widget' && conversationId) {
      var limitCheck = await supabase
        .from('dv_renders')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId)
        .eq('source_context', 'cb_widget');

      if ((limitCheck.count || 0) >= 3) {
        return res.status(200).json({
          success: false,
          limitReached: true,
          message: 'You\'ve seen a few options — would you like to book a consultation to explore more ideas?'
        });
      }
    }

    // Build prompt via Claude
    console.log('[DV] Building render prompt...');
    var renderPrompt = await buildRenderPrompt(claudeKey, {
      description: description,
      renderType: renderType,
      industries: industries,
      mode: mode,
      previousDescription: previousDescription
    });
    console.log('[DV] Prompt:', renderPrompt);

    // Download source image
    console.log('[DV] Downloading source image...');
    var sourceData = await downloadImage(photoUrl);
    var extension = sourceData.contentType.indexOf('png') !== -1 ? 'png' : 'jpg';

    // Call Ideogram v3 remix
    console.log('[DV] Calling Ideogram remix...');
    var formResult = buildMultipartForm(
      {
        prompt: renderPrompt,
        rendering_speed: 'BALANCED',
        magic_prompt_option: 'OFF',
        image_weight: 60,
        negative_prompt: 'blurry, low quality, distorted, ugly, overexposed, watermark, text overlay, cartoon, anime, illustration'
      },
      sourceData.buffer,
      'source.' + extension,
      sourceData.contentType
    );

    var remixResp = await ideogramMultipart(
      '/v1/ideogram-v3/remix',
      formResult.boundary,
      formResult.body,
      ideogramKey
    );

    if (remixResp.status !== 200) {
      console.error('[DV] Ideogram remix error:', remixResp.body);
      return res.status(500).json({ error: 'Render generation failed. Please try again.' });
    }

    var ideogramUrl = remixResp.body && remixResp.body.data && remixResp.body.data[0] && remixResp.body.data[0].url;
    if (!ideogramUrl) {
      return res.status(500).json({ error: 'No image returned from render service' });
    }
    console.log('[DV] Ideogram returned URL');

    // Download result and upload to cl-assets
    console.log('[DV] Uploading render to storage...');
    var renderData = await downloadImage(ideogramUrl);
    var timestamp = Date.now();
    var cleanPath = user.id + '/dv-renders/' + timestamp + '.jpg';

    var uploadResult = await supabase.storage
      .from('cl-assets')
      .upload(cleanPath, renderData.buffer, { contentType: 'image/jpeg', upsert: false });

    if (uploadResult.error) {
      console.error('[DV] Storage upload error:', uploadResult.error);
      return res.status(500).json({ error: 'Could not save render. Please try again.' });
    }

    var publicUrlData = supabase.storage.from('cl-assets').getPublicUrl(cleanPath);
    var renderUrl = publicUrlData.data && publicUrlData.data.publicUrl;

    // Watermark for CB widget renders if mode is 'watermarked'
    var watermarkedUrl = null;
    if (sourceContext === 'cb_widget') {
      var settingsResult = await supabase
        .from('dv_settings')
        .select('cb_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      var cbMode = (settingsResult.data && settingsResult.data.cb_mode) || 'off';

      if (cbMode === 'watermarked') {
        console.log('[DV] Applying watermark...');
        var profileResult = await supabase
          .from('profiles')
          .select('logo_url, business_name')
          .eq('id', user.id)
          .maybeSingle();

        var logoUrl = profileResult.data && profileResult.data.logo_url;
        var wmBusinessName = (profileResult.data && profileResult.data.business_name) || businessName || 'StaxAI';

        var wmBuffer = await applyWatermark(renderData.buffer, logoUrl, wmBusinessName);
        var wmPath = user.id + '/dv-renders/' + timestamp + '-wm.jpg';

        await supabase.storage
          .from('cl-assets')
          .upload(wmPath, wmBuffer, { contentType: 'image/jpeg', upsert: false });

        var wmUrlData = supabase.storage.from('cl-assets').getPublicUrl(wmPath);
        watermarkedUrl = wmUrlData.data && wmUrlData.data.publicUrl;
      }
    }

    // Save to dv_renders
    var renderInsert = await supabase
      .from('dv_renders')
      .insert({
        project_id: projectId,
        user_id: user.id,
        original_photo_url: photoUrl,
        render_url: renderUrl,
        prompt_used: renderPrompt,
        render_type: renderType,
        is_final: false,
        source_context: sourceContext,
        conversation_id: conversationId
      })
      .select()
      .single();

    if (renderInsert.error) {
      console.error('[DV] Render save error:', renderInsert.error);
    }

    console.log('[DV] Render complete');
    return res.status(200).json({
      success: true,
      renderId: renderInsert.data ? renderInsert.data.id : null,
      renderUrl: renderUrl,
      watermarkedUrl: watermarkedUrl,
      promptUsed: renderPrompt
    });

  } catch (err) {
    console.error('[DV] Unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected error generating render' });
  }
};
