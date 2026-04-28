window.PANEL_DATA_SOCIAL = {

  getStats: async function(supabase, userId) {
    var result = await supabase
      .from('social_posts')
      .select('status, published_at, reach, engagement')
      .eq('user_id', userId);

    if (result.error) return null;
    var items = result.data || [];
    var drafts = items.filter(function(i) { return i.status === 'draft' || i.status === 'in_progress'; }).length;
    var scheduled = items.filter(function(i) { return i.status === 'scheduled'; }).length;
    var published = items.filter(function(i) { return i.status === 'published'; }).length;
    var totalReach = 0;
    var totalEngagement = 0;
    items.forEach(function(i) {
      if (i.status === 'published') {
        totalReach += (i.reach || 0);
        totalEngagement += (i.engagement || 0);
      }
    });

    return {
      total: items.length,
      drafts: drafts,
      scheduled: scheduled,
      published: published,
      totalReach: totalReach,
      totalEngagement: totalEngagement
    };
  },

  getActionItems: async function(supabase, userId) {
    var result = await supabase
      .from('social_posts')
      .select('id, caption, journey_type, created_at')
      .eq('user_id', userId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(5);

    if (result.error) return [];
    return (result.data || []).map(function(item) {
      return {
        type: 'social_draft',
        title: 'Draft post: ' + (item.caption || '').substring(0, 50),
        link: '/social',
        created_at: item.created_at
      };
    });
  }
};
