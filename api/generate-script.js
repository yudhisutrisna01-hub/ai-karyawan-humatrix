// AGENT #4 - VIDEO SCRIPT GENERATOR
// Tugas: ambil konten TikTok/YouTube yang sudah "written" tapi belum ada video_script,
// bikinkan script detail per-adegan yang siap ditempel ke Google Flow (Veo) untuk generate video.
//
// Cara panggil:
//   GET https://<domain>/api/generate-script            -> proses 1 konten tiktok/youtube tertua

const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = `Kamu adalah AI Video Director untuk produk "Humatrix Buah" (pupuk hayati Asam Humat +
Trichoderma, kemasan 250 gram), target petani/pekebun buah Indonesia.

Kamu akan menerima SATU ide konten + caption yang sudah ada (platform tiktok atau youtube). Tugasmu: pecah jadi
SCRIPT VIDEO detail per-adegan yang siap dipakai untuk prompt di tools text-to-video AI (seperti Google Flow/Veo).

Untuk tiap adegan, jelaskan dengan SANGAT VISUAL dan SPESIFIK:
- Setting/lokasi, siapa yang tampil (deskripsi umum, jangan sebut nama orang nyata), aksi, gerakan kamera, durasi perkiraan, dialog/narasi persis kalimatnya.

Total durasi: TikTok 30-60 detik (4-6 adegan singkat). YouTube MAKSIMAL 4 segmen utama saja (bukan 8-12), tetap detail tapi ringkas per segmen agar tidak terlalu panjang.

Balas HANYA dalam format JSON array berisi SATU objek, tanpa teks pembuka/penutup, tanpa markdown code fence.
[
  {
    "video_script": "SCENE 1 (0-5 detik): [deskripsi lengkap]\\nSCENE 2 (5-12 detik): [deskripsi lengkap]\\n...dst"
  }
]`;

module.exports = async (req, res) => {
  try {
    const jumlah = Math.min(parseInt(req.query.jumlah, 10) || 1, 3);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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

    const updatedRows = [];

    // Proses satu-satu (bukan sekaligus) supaya tidak kena limit token
    for (const item of items) {
      const inputForClaude = {
        platform: item.platform,
        idea_title: item.idea_title,
        idea_detail: item.idea_detail,
        caption_existing: item.caption,
      };

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Buatkan video script untuk konten berikut:\n${JSON.stringify(inputForClaude, null, 2)}` }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return res.status(502).json({ error: 'Gagal memanggil Claude API', detail: errText, item_id: item.id });
      }

      const claudeData = await claudeRes.json();
      const rawText = claudeData.content?.[0]?.text || '[]';

      let scriptResult;
      try {
        scriptResult = JSON.parse(rawText);
      } catch (e) {
        return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: rawText, item_id: item.id });
      }

      const videoScript = scriptResult[0]?.video_script || '';

      const { data, error: updateError } = await supabase
        .from('content_ideas')
        .update({ video_script: videoScript })
        .eq('id', item.id)
        .select();

      if (updateError) {
        return res.status(500).json({ error: 'Gagal update Supabase', detail: updateError.message, item_id: item.id });
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
