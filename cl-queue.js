(function() {
  window.CL_QUEUE = {
    init: function(supabase) {
      var panel = document.getElementById("cl-tab-queue");
      if (!panel) return;
      panel.innerHTML = "<div class=\"ptab-content\" id=\"tab-queue\">\n\n    <!-- Secondary tabs: Pending Approval / Scheduled / Posted (rejected) -->\n    <div class=\"pub-secondary-tabs\">\n      <button class=\"stab active\" onclick=\"switchQueueTab('pending_approval')\">⏳ Awaiting Approval <span class=\"tab-badge\" id=\"qtab-pending-count\">0</span></button>\n      <button class=\"stab\" onclick=\"switchQueueTab('approved')\">📅 Approved & Scheduled <span class=\"tab-badge blue\" id=\"qtab-approved-count\">0</span></button>\n      <button class=\"stab\" onclick=\"switchQueueTab('rejected')\">🔄 Needs Revision <span class=\"tab-badge grey\" id=\"qtab-rejected-count\">0</span></button>\n    </div>\n\n    <div class=\"info-box orange\" id=\"queue-info\">\n      <strong>📣 Publishing Queue:</strong> These are finished AI-generated posts ready for your review. Approve to schedule for posting, or reject to regenerate with different content.\n    </div>\n\n    <div id=\"queue-items-list\"></div>\n    <div class=\"loading\" id=\"queue-loading\"><div class=\"spinner\"></div><p>Loading queue...</p></div>\n    <div class=\"empty-state\" id=\"queue-empty\" style=\"display:none\">\n      <div class=\"empty-state-icon\">📭</div>\n      <h3>Queue is empty</h3>\n      <p>Generate posts from the <a href=\"/social.html\" style=\"color:var(--blue)\">Marketing Hub</a> to see them here</p>\n    </div>\n\n  </div>";
      loadQueueItems();
    }
  };

  // Publishing queue functions
  async function loadQueueItems() {
  document.getElementById('queue-loading').classList.add('show');
  document.getElementById('queue-items-list').innerHTML = '';
  document.getElementById('queue-empty').style.display = 'none';

  const { data: { user } } = await supabaseClient.auth.getUser();

  let statusFilter = [currentQueueStatus];
  if (currentQueueStatus === 'approved') statusFilter = ['approved','scheduled'];

  const { data } = await supabaseClient
    .from('publishing_queue')
    .select('*')
    .eq('user_id', user.id)
    .in('status', statusFilter)
    .order('created_at', { ascending: false });

  document.getElementById('queue-loading').classList.remove('show');

  const items = data || [];

  // Update tab counts
  const counts = { pending_approval: 0, approved: 0, rejected: 0 };
  const { data: allQ } = await supabaseClient.from('publishing_queue').select('status').eq('user_id', user.id);
  (allQ||[]).forEach(i => {
    if (counts[i.status] !== undefined) counts[i.status]++;
    if (i.status === 'scheduled') counts['approved']++;
  });
  document.getElementById('qtab-pending-count').textContent = counts.pending_approval;
  document.getElementById('qtab-approved-count').textContent = counts.approved;
  document.getElementById('qtab-rejected-count').textContent = counts.rejected;

  if (!items.length) {
    document.getElementById('queue-empty').style.display = 'block';
    return;
  }

  renderQueueItems(items);
}

function renderQueueItems(items) {
  const platformIcons = { facebook: '📘', instagram: '📸', linkedin: '💼' };

  document.getElementById('queue-items-list').innerHTML = items.map(item => {
    const platforms = Array.isArray(item.platform) ? item.platform : (item.platform||'').split(',').filter(Boolean);
    const statusLabels = { pending_approval: '⏳ Awaiting Approval', approved: '✅ Approved', scheduled: '📅 Scheduled', rejected: '🔄 Needs Revision', posted: '✓ Posted' };
    const statusClass = { pending_approval: 'pending', approved: 'approved', scheduled: 'scheduled', rejected: 'rejected', posted: 'posted' };

    return `
    <div class="pub-card ${statusClass[item.status]||''}" id="pq-${item.id}">
      <div class="pub-card-main">
        <div class="pub-card-graphic">
          ${item.graphic_url ? `<img src="${item.graphic_url}" onerror="this.parentNode.textContent='📣'">` : '📣'}
        </div>
        <div class="pub-card-content">
          <div class="pub-card-meta">
            <span class="status-badge ${statusClass[item.status]||'pending'}">${statusLabels[item.status]||item.status}</span>
            ${platforms.map(p => `<span class="platform-chip">${platformIcons[p]||''} ${p}</span>`).join('')}
            ${item.category ? `<span class="cat-badge">${item.category}</span>` : ''}
          </div>
          <div class="pub-card-text">${escHtml(item.post_content||'')}</div>
          <div class="pub-card-date">
            Created: ${new Date(item.created_at).toLocaleDateString('en-AU')}
            ${item.scheduled_date ? ` &nbsp;|&nbsp; Scheduled: ${new Date(item.scheduled_date).toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}` : ''}
          </div>
        </div>
        <div class="pub-card-actions">
          ${item.status === 'pending_approval' ? `
            <button class="btn btn-green btn-sm" onclick="openApprove('${item.id}')">✅ Approve</button>
            <button class="btn btn-orange btn-sm" onclick="openReject('${item.id}')">🔄 Revise</button>
            <button class="btn btn-outline btn-sm" onclick="previewPost('${item.id}')">👁 Preview</button>
          ` : item.status === 'approved' || item.status === 'scheduled' ? `
            <button class="btn btn-outline btn-sm" onclick="previewPost('${item.id}')">👁 Preview</button>
            <button class="btn btn-grey btn-sm" onclick="unschedule('${item.id}')">↩ Undo</button>
          ` : item.status === 'rejected' ? `
            <button class="btn btn-primary btn-sm" onclick="regeneratePost('${item.id}')">🤖 Regenerate</button>
            <button class="btn btn-grey btn-sm" onclick="deleteQueueItem('${item.id}')">🗑 Delete</button>
          ` : ''}
        </div>
      </div>
      ${item.rejection_reason ? `
        <div class="pub-card-footer">
          <span style="font-size:13px; color:#666;"><strong>Revision notes:</strong> ${escHtml(item.rejection_reason)}</span>
        </div>
      ` : ''}
    </div>
  `}).join('');
}

window.openApprove = function(id) {
  pendingActionItemId = id;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  document.getElementById('sched-date').value = tomorrow.toISOString().split('T')[0];
  document.getElementById('modal-schedule').classList.add('show');
};

window.confirmApprove = async function(withSchedule) {
  if (!pendingActionItemId) return;
  const updates = { status: withSchedule ? 'scheduled' : 'approved' };
  if (withSchedule) {
    const d = document.getElementById('sched-date').value;
    const t = document.getElementById('sched-time').value;
    if (d) updates.scheduled_date = new Date(`${d}T${t}`).toISOString();
  }
  await supabaseClient.from('publishing_queue').update(updates).eq('id', pendingActionItemId);
  closeModal('modal-schedule');
  pendingActionItemId = null;
  loadQueueItems();
  loadStats();
};

window.openReject = function(id) {
  pendingActionItemId = id;
  document.getElementById('reject-reason').value = '';
  document.getElementById('modal-reject').classList.add('show');
};

window.confirmReject = async function() {
  if (!pendingActionItemId) return;
  const reason = document.getElementById('reject-reason').value;
  await supabaseClient.from('publishing_queue')
    .update({ status: 'rejected', rejection_reason: reason })
    .eq('id', pendingActionItemId);
  closeModal('modal-reject');
  pendingActionItemId = null;
  loadQueueItems();
};

window.unschedule = async function(id) {
  if (!confirm('Move this back to Awaiting Approval?')) return;
  await supabaseClient.from('publishing_queue').update({ status: 'pending_approval', scheduled_date: null }).eq('id', id);
  loadQueueItems();
};

window.deleteQueueItem = async function(id) {
  if (!confirm('Delete this post?')) return;
  await supabaseClient.from('publishing_queue').delete().eq('id', id);
  loadQueueItems();
  loadStats();
};

window.previewPost = function(id) {
  // Future: open a polished preview modal showing the Canva graphic + caption
  alert('Preview coming soon — Canva graphic + caption preview will appear here.');
};

window.regeneratePost = function(id) {
  // Future: re-trigger the social content generator for this item
  alert('Regeneration coming soon — this will open the Marketing Hub with the original settings pre-filled.');
};

// ═══════════════════════════════════════════════
// TAB 4: AI TOOL OUTPUTS & PUBLISHED
// ═══════════════════════════════════════════════

})();