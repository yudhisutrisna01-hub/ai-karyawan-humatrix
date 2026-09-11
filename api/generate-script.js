// AGENT #4 - VIDEO SCRIPT GENERATOR
// Tugas: ambil konten TikTok/YouTube yang sudah "written" tapi belum ada video_script,
// bikinkan script detail per-adegan yang siap ditempel ke Google Flow (Veo) untuk generate video.
//
// Cara panggil:
//   GET https://<domain>/api/generate-script            -> proses 3 konten tiktok/youtube terlama

const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = `Kamu adalah AI Video Director untuk produk "Humatrix Buah" (pupuk hayati Asam Humat +
Trichoderma, kemasan 250 gram), target petani/pekebun buah Indonesia.

Kamu akan menerima ide konten + caption yang sudah ada (platform tiktok atau youtube). Tugasmu: pecah jadi
SCRIPT VIDEO detail per-adegan yang siap dipakai untuk prompt di tools text-to-video AI (seperti Google Flow/Veo).

Untuk tiap adegan, jelaskan dengan SANGAT VISUAL dan SPESIFIK (karena AI video butuh detail eksplisit):
- Setting/lokasi (kebun, rumah, close-up produk, dll)
- Siapa yang tampil (petani paruh baya, tangan closeup, dll — jangan sebut nama orang nyata)
- Aksi yang terjadi
- Gerakan kamera (zoom in, pan, static shot, dll)
- Durasi perkiraan tiap adegan (detik)
- Kalau ada dialog/narasi, tulis persis kalimatnya

Total durasi video: TikTok 30-60 detik (4-6 adegan), YouTube 3-5 menit (8-12 adegan/segmen).

Balas HANYA dalam format JSON array, tanpa teks pembuka/penutup, tanpa markdown code fence.
[
  {
    "video_script": "SCENE 1 (0-5 detik): [deskripsi lengkap]\\nSCENE 2 (5-12 detik): [deskripsi lengkap]\\n...dst"
  }
]`;

module.exports = async (req, res) => {
  try {
    const jumlah = Math.min(parseInt(req.query.jumlah, 10) || 3, 8);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    // 1. Ambil konten tiktok/youtube yang sudah written tapi belum ada script
    const { data: items, error: fetchError } = await supabase
      .from('content_ideas')
      .select('id, platform, idea_title, idea_detail, caption')
      .in('platform', ['tiktok', 'youtube'])
      .eq('status', 'written')
      .is('video_script', null)
      .order('created_at', { ascending: true })
      .limit(jumlah);

    if (fetchError) {
      return res.status(500).json({ error: 'Gagal ambil data dari Supabase', detail: fetchError.message });
    }

    if (!items || items.length === 0) {
      return res.status(200).json({ success: true, message: 'Tidak ada konten TikTok/YouTube yang perlu script baru.', jumlah_diproses: 0 });
    }

    const inputForClaude = items.map((item) => ({
      platform: item.platform,
      idea_title: item.idea_title,
      idea_detail: item.idea_detail,
      caption_existing: item.caption,
    }));

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Buatkan video script untuk konten-konten berikut:\n${JSON.stringify(inputForClaude, null, 2)}` }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(502).json({ error: 'Gagal memanggil Claude API', detail: errText });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '[]';

    let scripts;
    try {
      scripts = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: rawText });
    }

    if (scripts.length !== items.length) {
      return res.status(500).json({ error: 'Jumlah script tidak sesuai jumlah item', detail: { diminta: items.length, diterima: scripts.length } });
    }

    // 2. Update tiap row dengan video_script
    const updatedRows = [];
    for (let i = 0; i < items.length; i++) {
      const { data, error: updateError } = await supabase
        .from('content_ideas')
        .update({ video_script: scripts[i].video_script })
        .eq('id', items[i].id)
        .select();

      if (updateError) {
        return res.status(500).json({ error: 'Gagal update Supabase', detail: updateError.message, item_id: items[i].id });
      }
      updatedRows.push(data[0]);
    }

    return res.status(200).json({
      success: true,
      jumlah_diproses: updatedRows.length,
      hasil: updatedRows,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan tak terduga', detail: err.message });
  }
};
