/* ── Feature integrations: AI Generate, CL Media Picker, News Digest, Blog sections, CL write-back ── */
(function() {
  var features = {

  // ── Moved from social-logic.js (file size) ──

  _handleFileSelect: function(files) {
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      this._mediaFiles.push(file);
      var url = URL.createObjectURL(file);
      this._mediaUrls.push(url);
    }
    this._renderStep();
  },

  _uploadMedia: async function(file, token) {
    var ext = file.name.split('.').pop() || 'jpg';
    var path = this._userId + '/social/' + Date.now() + '.' + ext;
    var result = await this._supabase.storage.from('cl-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });
    if (result.error) {
      throw new Error('Failed to upload media. Please try again.');
    }
    var urlResult = this._supabase.storage.from('cl-assets').getPublicUrl(path);
    return urlResult.data.publicUrl;
  },

  _showPreview: function() {
    var previewView = document.getElementById('sm-preview-view');
    var previewContent = document.getElementById('sm-preview-content');
    var captionEl = document.getElementById('sm-edit-caption');
    var hashtagsEl = document.getElementById('sm-edit-hashtags');

    var businessName = (this._profile && this._profile.business_name) || 'Your Business';
    var initial = businessName.charAt(0).toUpperCase();

    var isBlog = this._currentJourney === 'blog_content';

    var html = '<div class="sm-preview-card">' +
      '<div class="sm-preview-header">' +
      '<div class="sm-preview-avatar">' + initial + '</div>' +
      '<div><div class="sm-preview-name">' + window.escHtml(businessName) + '</div>' +
      '<div class="sm-preview-platform">Preview</div></div></div>';
    if (this._generatedContent.image_url) {
      html += '<img class="sm-preview-media" src="' + window.escHtml(this._generatedContent.image_url) + '" alt="Post media">';
    }
    html += '<div class="sm-preview-body">';
    if (isBlog) {
      html += '<div id="sm-blog-sections">' + this._renderBlogSections(this._generatedContent.caption) + '</div>';
    } else {
      html += '<div class="sm-preview-caption" id="sm-preview-caption-text">' + window.escHtml(this._generatedContent.caption) + '</div>';
    }
    html += '<div class="sm-preview-hashtags" id="sm-preview-hashtags-text">' + window.escHtml(this._generatedContent.hashtags) + '</div>';
    html += '</div></div>';

    var gc = this._generatedContent;
    if (gc.flyer) {
      html += '<div class="sm-step-content" style="margin-top:16px">' +
        '<div class="sm-step-question">Flyer Output</div>' +
        '<div style="border:2px solid var(--border);border-radius:var(--card-radius);padding:24px;background:var(--white)">' +
        '<div style="font-size:24px;font-weight:700;color:var(--text);margin-bottom:6px">' + window.escHtml(gc.flyer.headline || '') + '</div>' +
        (gc.flyer.subheadline ? '<div style="font-size:14px;color:var(--text-muted);margin-bottom:12px">' + window.escHtml(gc.flyer.subheadline) + '</div>' : '') +
        '<div style="font-size:14px;line-height:1.7;margin-bottom:12px;white-space:pre-wrap">' + window.escHtml(gc.flyer.body || '') + '</div>' +
        (gc.flyer.call_to_action ? '<div style="background:var(--blue);color:var(--white);padding:12px;border-radius:6px;text-align:center;font-weight:600">' + window.escHtml(gc.flyer.call_to_action) + '</div>' : '') +
        (gc.flyer.fine_print ? '<div style="font-size:10px;color:var(--text-muted);text-align:center;margin-top:8px">' + window.escHtml(gc.flyer.fine_print) + '</div>' : '') +
        '</div>' +
        '<button class="btn-outline btn-sm" id="sm-download-flyer" style="margin-top:12px">Download Flyer</button>' +
        '</div>';
    }

    if (gc.ad_graphic) {
      html += '<div class="sm-step-content" style="margin-top:16px">' +
        '<div class="sm-step-question">Ad Graphic Text</div>' +
        '<div style="border:2px solid var(--border);border-radius:var(--card-radius);padding:24px;background:var(--blue-light);text-align:center">' +
        '<div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px">' + window.escHtml(gc.ad_graphic.headline || '') + '</div>' +
        '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:12px">' + window.escHtml(gc.ad_graphic.subtext || '') + '</div>' +
        (gc.ad_graphic.cta_button ? '<div style="display:inline-block;background:var(--blue);color:var(--white);padding:10px 24px;border-radius:6px;font-weight:600">' + window.escHtml(gc.ad_graphic.cta_button) + '</div>' : '') +
        '</div></div>';
    }

    previewContent.innerHTML = html;
    if (captionEl) captionEl.value = this._generatedContent.caption;
    if (hashtagsEl) hashtagsEl.value = this._generatedContent.hashtags;
    previewView.style.display = 'block';
    this._renderHashtagSuggestions();

    if (isBlog) {
      this._bindBlogSectionEvents();
    }

    var flyerBtn = document.getElementById('sm-download-flyer');
    if (flyerBtn) {
      var self2 = this;
      flyerBtn.addEventListener('click', async function() {
        flyerBtn.disabled = true;
        flyerBtn.textContent = 'Generating...';
        try {
          var sessionRes = await self2._supabase.auth.getSession();
          var session = sessionRes.data && sessionRes.data.session;
          if (!session) { self2._showError('Session expired.'); return; }
          var res = await fetch('/api/generate-flyer-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
            body: JSON.stringify({
              flyer: gc.flyer,
              business_name: (self2._profile && self2._profile.business_name) || '',
              primary_colour: (self2._profile && self2._profile.primary_brand_colour) || '#4A6D8C'
            })
          });
          if (!res.ok) throw new Error('Failed to generate flyer');
          var data = await res.json();
          if (data.flyer_url) window.open(data.flyer_url, '_blank');
        } catch (err) {
          self2._showError('Could not generate flyer. Please try again.');
        }
        flyerBtn.disabled = false;
        flyerBtn.textContent = 'Download Flyer';
      });
    }
  },

  _showPublishView: function() {
    var publishView = document.getElementById('sm-publish-view');
    var checksEl = document.getElementById('sm-connection-checks');
    var settings = this._settings || {};

    var html = '';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="sm-conn-facebook" value="facebook"' + (settings.facebook_connected ? '' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Facebook</span>' +
      '<span class="sm-connection-check-status">' + (settings.facebook_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" id="sm-conn-instagram" value="instagram"' + (settings.instagram_connected ? '' : ' disabled') + '>' +
      '<span class="sm-connection-check-label">Instagram</span>' +
      '<span class="sm-connection-check-status">' + (settings.instagram_connected ? 'Connected' : 'Not connected') + '</span></div>';
    html += '<div class="sm-connection-check">' +
      '<input type="checkbox" disabled>' +
      '<span class="sm-connection-check-label">LinkedIn</span>' +
      '<span class="sm-connection-check-status badge badge-grey">Coming Soon</span></div>';

    checksEl.innerHTML = html;
    publishView.style.display = 'block';
  },

  // ── 1. Predis AI graphic generation ──

  _handleAIGenerate: async function() {
    var self = this;
    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session || !session.access_token) {
        this._showError('Could not verify your session. Please refresh the page and try again.');
        return;
      }

      var aiBtn = document.getElementById('sm-media-ai-btn');
      if (aiBtn) {
        aiBtn.disabled = true;
        aiBtn.textContent = 'Generating...';
      }

      var prompt = this._buildAIPrompt();
      var res = await fetch('/api/predis-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          prompt: prompt,
          media_type: 'single_image'
        })
      });

      if (!res.ok) {
        var errData = await res.json().catch(function() { return {}; });
        throw new Error(errData.error || 'Failed to generate graphic. Please try again.');
      }

      var data = await res.json();
      if (data.preview_url) {
        self._mediaUrls.push(data.preview_url);
        self._renderStep();
      } else {
        self._showError('Graphic generation is processing. It may take a moment to appear.');
      }
    } catch (err) {
      this._showError(err.message || 'Failed to generate graphic.');
    } finally {
      var aiBtn2 = document.getElementById('sm-media-ai-btn');
      if (aiBtn2) {
        aiBtn2.disabled = false;
        aiBtn2.textContent = 'AI Generate';
      }
    }
  },

  _buildAIPrompt: function() {
    var inputs = this._journeyInputs;
    var parts = [];
    var journeyLabel = '';
    this.JOURNEY_GROUPS.forEach(function(g) {
      g.journeys.forEach(function(j) {
        if (j.id === this._currentJourney) journeyLabel = j.label;
      }.bind(this));
    }.bind(this));
    if (journeyLabel) parts.push('Content type: ' + journeyLabel);
    if (inputs.description) parts.push('Description: ' + inputs.description);
    if (inputs.what) parts.push('Subject: ' + inputs.what);
    if (inputs.headline) parts.push('Headline: ' + inputs.headline);
    if (inputs.blog_topic) parts.push('Topic: ' + inputs.blog_topic);
    if (inputs.blog_title) parts.push('Title: ' + inputs.blog_title);
    if (inputs.testimonial) parts.push('Testimonial: ' + inputs.testimonial);
    if (inputs.tone) parts.push('Tone: ' + inputs.tone);
    var businessName = (this._profile && this._profile.business_name) || '';
    if (businessName) parts.push('Business: ' + businessName);
    return parts.join('. ') || 'Create a professional social media graphic';
  },

  // ── 2. Content Library media picker ──

  _openCLMediaPicker: async function() {
    var self = this;
    var modal = document.getElementById('sm-cl-media-modal');
    if (!modal) return;

    var body = document.getElementById('sm-cl-media-body');
    if (body) body.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Loading content library...</div></div>';
    modal.classList.add('open');

    var result = await this._supabase
      .from('content_library')
      .select('id, title, file_url, content_type, source_detail')
      .eq('user_id', this._userId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(100);

    if (result.error) {
      body.innerHTML = '<div class="sm-step-hint">Could not load content library items.</div>';
      return;
    }

    var imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    var items = (result.data || []).filter(function(item) {
      if (item.content_type === 'image') return true;
      if (item.file_url) {
        var lower = item.file_url.toLowerCase();
        for (var i = 0; i < imageExts.length; i++) {
          if (lower.indexOf(imageExts[i]) !== -1) return true;
        }
      }
      if (item.source_detail && item.source_detail.file_type) {
        var ft = item.source_detail.file_type.toLowerCase();
        if (ft.indexOf('image') !== -1) return true;
      }
      return false;
    });

    if (items.length === 0) {
      body.innerHTML = '<div class="sm-step-hint">No approved images found in your Content Library.</div>';
      return;
    }

    var html = '<div class="sm-pills-wrap">';
    items.forEach(function(item) {
      var url = item.file_url || '';
      var title = item.title || 'Untitled';
      html += '<div class="sm-cl-media-item item-card" data-url="' + window.escHtml(url) + '" data-id="' + item.id + '">' +
        '<img src="' + window.escHtml(url) + '" alt="" class="sm-cl-media-thumb">' +
        '<div class="sm-cl-media-label">' + window.escHtml(title) + '</div>' +
        '</div>';
    });
    html += '</div>';
    body.innerHTML = html;

    var selectedUrls = [];
    body.querySelectorAll('.sm-cl-media-item').forEach(function(card) {
      card.addEventListener('click', function() {
        var isSelected = card.classList.contains('active');
        if (isSelected) {
          card.classList.remove('active');
          var idx = selectedUrls.indexOf(card.dataset.url);
          if (idx !== -1) selectedUrls.splice(idx, 1);
        } else {
          card.classList.add('active');
          selectedUrls.push(card.dataset.url);
        }
      });
    });

    var confirmBtn = document.getElementById('sm-cl-media-confirm');
    if (confirmBtn) {
      var newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
      newConfirmBtn.addEventListener('click', function() {
        selectedUrls.forEach(function(url) {
          if (url) self._mediaUrls.push(url);
        });
        modal.classList.remove('open');
        self._renderStep();
      });
    }
  },

  // ── 3. News Digest integration ──

  _loadNewsDigestItems: async function() {
    var self = this;
    var container = document.getElementById('sm-nd-items-container');
    if (!container) return;

    container.innerHTML = '<div class="sm-generating"><div class="loading-spinner"></div><div>Loading news digest items...</div></div>';

    var result = await this._supabase
      .from('news_digest_briefings')
      .select('*')
      .eq('user_id', this._userId);

    if (result.error) {
      container.innerHTML = '<div class="sm-step-hint">Could not load news digest items.</div>';
      return;
    }

    var briefings = result.data || [];
    if (briefings.length === 0) {
      container.innerHTML = '<div class="sm-step-hint">No news digest items found. Run a news digest refresh first.</div>';
      return;
    }

    var html = '<div class="sm-step-hint">Select a news item to use as the source for your content.</div>';
    html += '<div class="sm-nd-list">';

    briefings.forEach(function(briefing, bIdx) {
      if (!briefing.headline) return;
      var bullets = Array.isArray(briefing.bullets) ? briefing.bullets : [];

      html += '<div class="item-card sm-nd-card" data-nd-idx="' + bIdx + '">' +
        '<div class="sm-nd-headline">' + window.escHtml(briefing.headline) + '</div>' +
        '<div class="sm-nd-category">' +
        window.escHtml(briefing.category || '') + '</div>';

      bullets.forEach(function(b, idx) {
        var title = b.title || '';
        var text = (b.text || '').substring(0, 120);
        html += '<div class="sm-nd-bullet" data-nd-briefing="' + bIdx + '" data-nd-bullet="' + idx + '">' +
          (title ? '<div class="sm-nd-bullet-title">' + window.escHtml(title) + '</div>' : '') +
          '<div class="sm-nd-bullet-text">' + window.escHtml(text) + '</div>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.sm-nd-bullet').forEach(function(bullet) {
      bullet.addEventListener('click', function(e) {
        e.stopPropagation();
        var bIdx = parseInt(bullet.dataset.ndBriefing, 10);
        var bulletIdx = parseInt(bullet.dataset.ndBullet, 10);
        var briefing = briefings[bIdx];
        if (!briefing) return;
        var b = briefing.bullets[bulletIdx];
        if (!b) return;

        container.querySelectorAll('.sm-nd-bullet').forEach(function(el) { el.classList.remove('active'); });
        bullet.classList.add('active');

        if (self._currentJourney === 'industry_insight') {
          self._journeyInputs.nd_source_title = b.title || briefing.headline;
          self._journeyInputs.nd_source_content = b.text || '';
          self._journeyInputs.insight = b.text || '';
        } else if (self._currentJourney === 'blog_content') {
          self._journeyInputs.nd_source_title = b.title || briefing.headline;
          self._journeyInputs.nd_source_content = b.text || '';
          self._journeyInputs.blog_topic = b.text || '';
          self._journeyInputs.blog_title = b.title || briefing.headline;
        }
      });
    });
  },

  // ── 4. Event/Offer type pill renderers ──

  _renderEventTypePills: function() {
    var current = this._journeyInputs.what || '';
    var types = ['Open day', 'Workshop', 'Trade show', 'Sale event', 'Community event', 'Launch party', 'Other'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-eventtype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    html += '<div id="sm-event-other-wrap" class="sm-other-wrap" style="display:' + (current === 'Other' ? 'block' : 'none') + '">' +
      '<div class="form-group"><label class="form-label">Event details</label>' +
      '<textarea class="form-input" id="sm-field-what-other" rows="3">' + window.escHtml(this._journeyInputs.what_other || '') + '</textarea></div></div>';
    return html;
  },

  _renderOfferTypePills: function() {
    var current = this._journeyInputs.what || '';
    var types = ['Discount', 'Bundle deal', 'Free service/add-on', 'Seasonal offer', 'Loyalty reward', 'Other'];
    var html = '<div class="sm-pills-wrap">';
    types.forEach(function(t) {
      var active = current === t ? ' active' : '';
      html += '<button class="filter-pill' + active + '" data-offertype="' + window.escHtml(t) + '">' + window.escHtml(t) + '</button>';
    });
    html += '</div>';
    html += '<div id="sm-offer-other-wrap" class="sm-other-wrap" style="display:' + (current === 'Other' ? 'block' : 'none') + '">' +
      '<div class="form-group"><label class="form-label">Offer details</label>' +
      '<textarea class="form-input" id="sm-field-what-other" rows="3">' + window.escHtml(this._journeyInputs.what_other || '') + '</textarea></div></div>';
    return html;
  },

  // ── 5. Blog section editing ──

  _renderBlogSections: function(content) {
    if (!content) return '';
    var sections = content.split(/(?=^#{2,3}\s)/m);
    var html = '';
    sections.forEach(function(section, idx) {
      var trimmed = section.trim();
      if (!trimmed) return;
      var headingMatch = trimmed.match(/^(#{2,3})\s+(.+?)$/m);
      var heading = headingMatch ? headingMatch[2] : 'Section ' + (idx + 1);
      html += '<div class="sm-blog-section" data-section="' + idx + '">' +
        '<div class="sm-blog-section-header">' +
        '<div class="sm-blog-section-title">' + window.escHtml(heading) + '</div>' +
        '<button class="btn-outline btn-sm" data-regen-section="' + idx + '">Regenerate Section</button>' +
        '</div>' +
        '<div class="sm-blog-section-content">' + window.escHtml(trimmed) + '</div>' +
        '</div>';
    });
    return html;
  },

  _bindBlogSectionEvents: function() {
    var self = this;
    document.querySelectorAll('[data-regen-section]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var idx = parseInt(btn.dataset.regenSection, 10);
        await self._regenerateBlogSection(idx);
      });
    });
  },

  _regenerateBlogSection: async function(sectionIdx) {
    var self = this;
    var caption = this._generatedContent.caption || '';
    var sections = caption.split(/(?=^#{2,3}\s)/m);
    if (sectionIdx >= sections.length) return;

    var sectionEl = document.querySelector('[data-section="' + sectionIdx + '"]');
    var btn = document.querySelector('[data-regen-section="' + sectionIdx + '"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Regenerating...'; }

    try {
      var sessionRes = await this._supabase.auth.getSession();
      var session = sessionRes.data && sessionRes.data.session;
      if (!session) { this._showError('Session expired. Please refresh.'); return; }

      var res = await fetch('/api/generate-social-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          journey_type: 'blog_content',
          inputs: Object.assign({}, this._journeyInputs, {
            regenerate_section: true,
            section_content: sections[sectionIdx].trim(),
            full_blog: caption
          }),
          output_type: 'blog_post'
        })
      });

      if (!res.ok) throw new Error('Failed to regenerate section.');
      var data = await res.json();
      var newSection = data.caption || data.content || sections[sectionIdx];

      sections[sectionIdx] = newSection;
      this._generatedContent.caption = sections.join('\n\n');

      var contentEl = sectionEl ? sectionEl.querySelector('.sm-blog-section-content') : null;
      if (contentEl) contentEl.textContent = newSection.trim();

      var captionEl = document.getElementById('sm-edit-caption');
      if (captionEl) captionEl.value = this._generatedContent.caption;
    } catch (err) {
      this._showError(err.message || 'Failed to regenerate section.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerate Section'; }
    }
  },

  // ── 6. CL write-back for ALL journey types (Pattern B) ──

  _saveOutputToCL: async function(content, inputs, journeyType) {
    var categoryMap = {
      finished_job: 'social_post',
      customer_story: 'testimonial',
      behind_scenes: 'social_post',
      product_launch: 'promotion',
      event_promo: 'promotion',
      offer_promo: 'promotion',
      industry_insight: 'social_post',
      tips_advice: 'social_post',
      blog_content: 'blog',
      business_update: 'social_post'
    };
    var tagMap = {
      finished_job: ['finished-job', 'social'],
      customer_story: ['testimonial', 'customer-story', 'social'],
      behind_scenes: ['behind-scenes', 'social'],
      product_launch: ['product-launch', 'social'],
      event_promo: ['event', 'promotion', 'social'],
      offer_promo: ['offer', 'promotion', 'social'],
      industry_insight: ['industry-insight', 'social'],
      tips_advice: ['tips', 'advice', 'social'],
      blog_content: ['blog', 'website'],
      business_update: ['business-update', 'social']
    };

    try {
      var sourceRef = 'sm-' + journeyType + '-' + Date.now();
      var title = inputs.blog_title || inputs.headline || inputs.what || '';
      if (!title) {
        var journeyLabel = '';
        this.JOURNEY_GROUPS.forEach(function(g) {
          g.journeys.forEach(function(j) {
            if (j.id === journeyType) journeyLabel = j.label;
          });
        });
        title = journeyLabel || journeyType;
      }

      var result = await this._supabase
        .from('content_library')
        .upsert({
          source: 'tool',
          tool_source: 'social',
          source_ref: sourceRef,
          status: 'approved',
          category: categoryMap[journeyType] || 'social_post',
          tool_tags: tagMap[journeyType] || ['social'],
          content_text: content.caption || '',
          title: title,
          user_id: this._userId,
          first_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'source_ref', ignoreDuplicates: true });

      if (result.error) {
        console.error('[SM] CL write-back error:', result.error.message);
        return;
      }
    } catch (err) {
      console.error('[SM] CL write-back error:', err.message);
    }
  },

  // ── 7. Customer Story project data loading ──

  _loadProjectData: async function() {
    if (this._bindProjectStepEvents) {
      await this._bindProjectStepEvents();
    }
  },

  // ── 8. Logo fetch from URL ──

  _fetchLogoFromUrl: function(url) {
    if (!url) return;
    var preview = document.getElementById('sm-logo-preview');
    if (!preview) return;

    try {
      var parsed = new URL(url.indexOf('://') === -1 ? 'https://' + url : url);
      var domain = parsed.hostname;
      var faviconUrl = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';

      preview.innerHTML = '<div class="sm-logo-preview">' +
        '<img src="' + window.escHtml(faviconUrl) + '" alt="Logo" class="sm-logo-img">' +
        '<div class="text-muted">Logo fetched from ' + window.escHtml(domain) + '</div>' +
        '</div>';

      this._journeyInputs.logo_url = faviconUrl;
    } catch (e) {
      preview.innerHTML = '<div class="text-muted">Could not fetch logo. Check the URL and try again.</div>';
    }
  }

  };

  Object.keys(features).forEach(function(key) {
    window.SOCIAL_LOGIC[key] = features[key];
  });
})();
