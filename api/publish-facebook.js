const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: readyPosts, error: fetchError } = await supabase
      .from('content_ideas')
      .select('id, idea_title, caption, hashtags')
      .eq('platform', 'facebook')
      .eq('status', 'written')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) {
      return res.status(500).json({ error: 'Gagal ambil data dari Supabase', detail: fetchError.message });
    }

    if (!readyPosts || readyPosts.length === 0) {
      return res.status(200).json({ success: true, message: 'Tidak ada caption Facebook yang siap di-publish.', jumlah_diposting: 0 });
    }

    const post = readyPosts[0];
    const fullMessage = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption;

    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: fullMessage,
          access_token: process.env.FB_PAGE_ACCESS_TOKEN,
        }),
      }
    );

    const fbData = await fbRes.json();

    if (!fbRes.ok) {
      return res.status(502).json({ error: 'Gagal posting ke Facebook', detail: fbData });
    }

    const { data: updated, error: updateError } = await supabase
      .from('content_ideas')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        fb_post_id: fbData.id,
      })
      .eq('id', post.id)
      .select();

    if (updateError) {
      return res.status(500).json({ error: 'Berhasil posting ke FB, tapi gagal update Supabase', detail: updateError.message, fb_post_id: fbData.id });
    }

    return res.status(200).json({
      success: true,
      jumlah_diposting: 1,
      idea_title: post.idea_title,
      fb_post_id: fbData.id,
      data: updated[0],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan tak terduga', detail: err.message });
  }
};
