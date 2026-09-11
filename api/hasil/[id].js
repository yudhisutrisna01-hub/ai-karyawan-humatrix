// Halaman detail 1 postingan — bisa dibuka & di-share sebagai link.
// URL: https://<domain>/api/hasil/{id}
// Kalau kontennya tiktok/youtube dan sudah ada video_script, tampilkan juga
// script-nya dengan tombol copy terpisah (siap ditempel ke Google Flow/Veo).

const { createClient } = require('@supabase/supabase-js');

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  const { id } = req.query;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { data: post, error } = await supabase
    .from('content_ideas')
    .select('*')
    .eq('id', id)
    .single();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (error || !post) {
    return res.status(404).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:60px 20px;">
      <h2>Postingan tidak ditemukan</h2>
      <a href="/hasil.html">← Kembali ke daftar</a>
    </body></html>`);
  }

  const title = post.idea_title || 'Humatrix Buah';
  const excerpt = (post.caption || post.idea_detail || '').slice(0, 150);
  const fullCaption = post.caption || post.idea_detail || '';
  const platformLabel = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' }[post.platform] || post.platform;
  const hasScript = post.video_script && post.video_script.trim().length > 0;

  const scriptBlock = hasScript ? `
    <div class="bg-white rounded-2xl shadow-sm p-5 border border-slate-100 mt-4">
      <h3 class="font-bold text-slate-800 flex items-center gap-2">🎬 Video Script</h3>
      <p class="text-xs text-slate-400 mt-1">Siap ditempel ke Google Flow / tools text-to-video lainnya</p>
      <div class="mt-3 bg-slate-50 rounded-lg p-3 text-sm text-slate-700 content-text">${escapeHtml(post.video_script)}</div>
      <button onclick="copyScript()" class="mt-4 w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium py-2.5 rounded-lg">
        🎬 Copy Script Video
      </button>
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Humatrix Buah</title>

<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(excerpt)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Humatrix Buah">

<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:'Segoe UI',system-ui,sans-serif} .content-text{white-space:pre-line}</style>
</head>
<body class="bg-slate-100 min-h-screen pb-16">
  <div class="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white px-5 py-5 shadow-md">
    <a href="/hasil.html" class="text-emerald-100 text-sm">← Semua Postingan</a>
    <h1 class="text-lg font-bold mt-1">🌱 Humatrix Buah</h1>
  </div>

  <div class="px-5 mt-5">
    <div class="bg-white rounded-2xl shadow-sm p-5 border border-slate-100">
      <span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 mb-3">${escapeHtml(platformLabel)}</span>
      <h2 class="text-xl font-bold text-slate-800">${escapeHtml(title)}</h2>
      <div class="mt-4 text-slate-700 content-text leading-relaxed">${escapeHtml(fullCaption)}</div>
      ${post.hashtags ? `<div class="mt-4 text-sm text-blue-600">${escapeHtml(post.hashtags)}</div>` : ''}
      <button onclick="copyCaption()" class="mt-5 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 rounded-lg">
        📋 Copy Caption
      </button>
      <p class="text-xs text-slate-400 mt-3">Diproduksi otomatis oleh AI Karyawan — ${new Date(post.created_at).toLocaleDateString('id-ID')}</p>
    </div>

    ${scriptBlock}
  </div>

<script>
  function copyCaption() {
    const text = ${JSON.stringify(fullCaption)} + ${post.hashtags ? `"\\n\\n" + ${JSON.stringify(post.hashtags)}` : '""'};
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.querySelectorAll('button')[0];
      btn.textContent = '✓ Tersalin!';
      setTimeout(() => btn.textContent = '📋 Copy Caption', 1500);
    });
  }
  function copyScript() {
    navigator.clipboard.writeText(${JSON.stringify(post.video_script || '')}).then(() => {
      const btn = document.querySelectorAll('button')[1];
      btn.textContent = '✓ Tersalin!';
      setTimeout(() => btn.textContent = '🎬 Copy Script Video', 1500);
    });
  }
</script>
</body>
</html>`;

  return res.status(200).send(html);
};
