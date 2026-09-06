const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = `Kamu adalah AI Copywriter untuk produk "Humatrix Buah" (Asam Humat + Trichoderma,
pupuk hayati kemasan 250 gram), target petani/pekebun buah di Indonesia. Website: www.indonesiaorganik.id.

Kamu akan menerima daftar ide konten (judul + detail + platform). Tugasmu: tulis CAPTION LENGKAP siap-posting
untuk tiap ide, sesuaikan gaya dengan platformnya:
- instagram: caption medium (100-150 kata), storytelling, emoji secukupnya, CTA jelas di akhir
- tiktok: script/voice-over pendek untuk video (bukan caption panjang), gaya casual & to the point
- facebook: caption lebih personal/diskusi, ajak komentar
- youtube: deskripsi video (ringkasan isi + timestamp kalau relevan + CTA subscribe)

Kalau menyebut ajakan kunjungi website, gunakan PERSIS: www.indonesiaorganik.id (jangan pakai subdomain lain).

Balas HANYA dalam format JSON array, tanpa teks pembuka/penutup, tanpa markdown code fence.
Setiap item harus punya field persis seperti ini, urutan HARUS sama dengan urutan input:
[
  {
    "caption": "isi caption/script lengkap siap pakai",
    "hashtags": "#tag1 #tag2 #tag3 (5-8 hashtag relevan, dipisah spasi)"
  }
]`;

module.exports = async (req, res) => {
  try {
    const jumlah = Math.min(parseInt(req.query.jumlah, 10) || 5, 10);
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: draftIdeas, error: fetchError } = await supabase
      .from('content_ideas')
      .select('id, platform, idea_title, idea_detail')
      .eq('status', 'draft')
      .order('created_at', { ascending: true })
      .limit(jumlah);

    if (fetchError) {
      return res.status(500).json({ error: 'Gagal ambil data dari Supabase', detail: fetchError.message });
    }

    if (!draftIdeas || draftIdeas.length === 0) {
      return res.status(200).json({ success: true, message: 'Tidak ada ide berstatus draft. Jalankan Agent #1 dulu.', jumlah_diproses: 0 });
    }

    const inputForClaude = draftIdeas.map((idea) => ({
      platform: idea.platform,
      idea_title: idea.idea_title,
      idea_detail: idea.idea_detail,
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
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Tulis caption untuk ide-ide berikut:\n${JSON.stringify(inputForClaude, null, 2)}` }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(502).json({ error: 'Gagal memanggil Claude API', detail: errText });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '[]';

    let captions;
    try {
      captions = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: rawText });
    }

    if (captions.length !== draftIdeas.length) {
      return res.status(500).json({ error: 'Jumlah caption dari Claude tidak sesuai jumlah ide', detail: { diminta: draftIdeas.length, diterima: captions.length } });
    }

    const updatedRows = [];
    for (let i = 0; i < draftIdeas.length; i++) {
      const { data, error: updateError } = await supabase
        .from('content_ideas')
        .update({
          caption: captions[i].caption,
          hashtags: captions[i].hashtags,
          status: 'written',
        })
        .eq('id', draftIdeas[i].id)
        .select();

      if (updateError) {
        return res.status(500).json({ error: 'Gagal update Supabase', detail: updateError.message, idea_id: draftIdeas[i].id });
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
