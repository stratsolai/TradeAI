window.DASH_DATA = (function() {

  async function loadNotifications(userId) {
    var bar = document.getElementById('notification-bar');
    if (!bar) return;
    var items = [];
    try {
      var pr = await supabaseClient.from('profiles').select('profile_complete').eq('id', userId).single();
      if (pr.data && !pr.data.profile_complete) {
        items.push({ msg: 'Complete your Business Profile so your tools can personalise outputs', link: 'content-library.html#business-profile', linkText: 'Complete now' });
      }
    } catch(e) {}
    try {
      var cr = await supabaseClient.from('content_library').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending');
      if (cr.count && cr.count > 0) {
        items.push({ msg: cr.count + ' item' + (cr.count > 1 ? 's' : '') + ' awaiting approval in Content Library', link: 'content-library.html', linkText: 'Review' });
      }
    } catch(e) {}
    try {
      var sp = await supabaseClient.from('social_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'pending_review');
      if (sp.count && sp.count > 0) {
        items.push({ msg: sp.count + ' post' + (sp.count > 1 ? 's' : '') + ' ready for review in Marketing Hub', link: 'social.html', linkText: 'Review' });
      }
    } catch(e) {}
    if (items.length === 0) { bar.style.display = 'none'; return; }
    items = items.slice(0, 3);
    bar.innerHTML = items.map(function(item) {
      return '<div class="notif-item"><span>' + item.msg + '</span><a href="' + item.link + '">' + item.linkText + '</a><button class="notif-dismiss" title="Dismiss">&times;</button></div>';
    }).join('');
  }

  async function init(user) {
    var userId = user.id;
    var activeTools = [];
    try {
      var pr = await supabaseClient.from('profiles').select('active_tools').eq('id', userId).single();
      if (pr.data && Array.isArray(pr.data.active_tools)) activeTools = pr.data.active_tools;
    } catch(e) {}
    await loadNotifications(userId);
    if (window.DASH_WIDGETS && typeof window.DASH_WIDGETS.renderAll === 'function') {
      await window.DASH_WIDGETS.renderAll(userId, activeTools);
    }
  }

  return { init: init };

})();
