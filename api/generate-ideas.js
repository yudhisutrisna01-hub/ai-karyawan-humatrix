const { createClient } = require('@supabase/supabase-js');

const SYSTEM_PROMPT = `Kamu adalah AI Content Strategist untuk produk "Humatrix Buah" —
pupuk hayati (Asam Humat + Trichoderma) kemasan 250 gram, target pasar petani/pekebun buah
di Indonesia. Website: www.indonesiaorganik.id.

Balas HANYA dalam format JSON array, tanpa teks pembuka/penutup, tanpa markdown code fence.
[
  {
    "platform": "instagram" | "tiktok" | "facebook" | "youtube",
    "idea_title": "judul singkat",
    "idea_detail": "penjelasan 2-4 kalimat, kalau menyebut ajakan kunjungi website gunakan persis: www.indonesiaorganik.id"
  }
]`;

module.exports = async (req, res) => {
  try {
    const platformFilter = (req.query.platform || '').toLowerCase().trim();
    const jumlah = Math.min(parseInt(req.query.jumlah, 10) || 5, 10);

    const userPrompt = platformFilter
      ? `Buatkan ${jumlah} ide konten khusus untuk platform ${platformFilter}.`
      : `Buatkan ${jumlah} ide konten, campur beberapa platform.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(502).json({ error: 'Gagal memanggil Claude API', detail: errText });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '[]';

    let ideas;
    try {
      ideas = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: rawText });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const rows = ideas.map((idea) => ({
      product: 'Humatrix Buah',
      platform: idea.platform,
      idea_title: idea.idea_title,
      idea_detail: idea.idea_detail,
      status: 'draft',
    }));

    const { data: inserted, error: dbError } = await supabase
      .from('content_ideas')
      .insert(rows)
      .select();

    if (dbError) {
      return res.status(500).json({ error: 'Gagal simpan ke Supabase', detail: dbError.message });
    }

    return res.status(200).json({
      success: true,
      jumlah_dibuat: inserted.length,
      ideas: inserted,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan tak terduga', detail: err.message });
  }
};
