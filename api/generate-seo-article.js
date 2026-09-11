// AGENT #5 - SEO ARTICLE WRITER (v3 - satu panggilan, proses 3 tahap dilakukan internal oleh AI)
// Metodologi: search intent -> outline -> draft per section, tapi dalam 1x request
// biar tidak kena timeout di Vercel Hobby plan.
//
// Cara panggil:
//   GET /api/generate-seo-article?keyword=...&tipe=traffic
//   tipe: "traffic" (700-1200 kata) | "permintaan" (600-900 kata)
//         | "closingan" (800-1200 kata) | "pillar" (1500-2200 kata, bisa lebih lama prosesnya)

const { createClient } = require('@supabase/supabase-js');

const KEYWORD_POOL = [
  'cara menyuburkan tanah kebun buah',
  'pupuk hayati untuk tanaman buah',
  'penyebab buah rontok sebelum matang',
  'cara meningkatkan hasil panen mangga',
  'manfaat trichoderma untuk tanaman',
  'perbedaan pupuk kimia dan pupuk hayati',
  'cara merawat pohon durian agar berbuah lebat',
  'apa itu asam humat dan manfaatnya',
];

const TIPE_CONFIG = {
  traffic: { panjang: '700-1200 kata', gaya: 'edukasi/how-to yang menarik banyak pengunjung baru, jawab pertanyaan umum secara tuntas' },
  permintaan: { panjang: '600-900 kata', gaya: 'interaktif, bahas masalah spesifik yang memancing audiens untuk bertanya/berkomentar, gunakan pertanyaan retoris dan ajakan diskusi' },
  closingan: { panjang: '800-1200 kata', gaya: 'halaman penjualan/ulasan produk yang persuasif, fokus pada manfaat konkret dan alasan membeli, CTA kuat' },
  pillar: { panjang: '1500-2200 kata', gaya: 'konten pilar mendalam untuk kompetisi tinggi, cakup topik secara komprehensif dari berbagai sudut' },
};

const SYSTEM_PROMPT = `Kamu AI SEO Content Writer untuk www.indonesiaorganik.id (toko online produk pertanian organik,
termasuk Humatrix Buah - Asam Humat + Trichoderma).

PROSES BERPIKIR WAJIB (lakukan semua ini secara internal sebelum menulis, TAPI jangan tampilkan proses berpikirmu
di output akhir kecuali di field "catatan_proses"):
1. Analisa search intent: masalah/pertanyaan apa yang sebenarnya dicari audiens dari keyword ini di Google?
   Sudut pandang unik apa yang bisa diambil supaya tidak generik seperti artikel SEO kebanyakan?
2. Susun kerangka (outline) H1/H2/H3 berdasarkan search intent tadi.
3. Kembangkan outline itu jadi artikel lengkap, section by section.

KAIDAH PENULISAN (EEAT) — WAJIB DIPATUHI:
- Heading rapi: H1 judul, H2 sub-topik utama, H3 sub-poin
- Paragraf PENDEK, maksimal 3-4 kalimat per paragraf
- Tebalkan (gunakan **teks**) kalimat-kalimat kunci berisi insight penting, agar mudah di-skim
- Sisipkan keyword secara natural, JANGAN keyword stuffing
- Di minimal 1-2 tempat yang relevan, sisipkan penanda: [CATATAN UNTUK DIISI: <jenis elemen yang perlu ditambahkan
  manusia, misal "data hasil panen dari petani binaan", "testimoni pelanggan">]. JANGAN mengarang data/testimoni palsu.
- Sisipkan produk Humatrix Buah sebagai solusi di 1-2 tempat relevan (boleh lebih persuasif kalau tipe "closingan")
- Tutup dengan CTA singkat ke www.indonesiaorganik.id

Balas HANYA dalam format JSON object, tanpa teks pembuka/penutup, tanpa markdown code fence:
{
  "catatan_proses": "ringkasan singkat 2-3 kalimat: search intent yang kamu identifikasi + sudut pandang yang dipakai",
  "judul": "judul artikel (H1)",
  "meta_description": "meta description maks 155 karakter, mengandung keyword",
  "isi_artikel": "isi lengkap artikel dalam format markdown dengan ## dan ### untuk heading, dan ** untuk bold"
}`;

module.exports = async (req, res) => {
  try {
    const customKeyword = (req.query.keyword || '').trim();
    const keyword = customKeyword || KEYWORD_POOL[Math.floor(Math.random() * KEYWORD_POOL.length)];
    const tipe = TIPE_CONFIG[req.query.tipe] ? req.query.tipe : 'traffic';
    const config = TIPE_CONFIG[tipe];

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Keyword target: "${keyword}". Tipe konten: ${tipe} (${config.gaya}). Target panjang: ${config.panjang}.`,
        }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return res.status(502).json({ error: 'Gagal memanggil Claude API', detail: errText });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '{}';

    let article;
    try {
      article = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: rawText });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: inserted, error: dbError } = await supabase
      .from('content_ideas')
      .insert([{
        product: 'Humatrix Buah',
        platform: 'blog',
        idea_title: article.judul,
        idea_detail: `Keyword: ${keyword} | Tipe: ${tipe} | ${article.catatan_proses || ''}`,
        caption: article.isi_artikel,
        hashtags: article.meta_description,
        status: 'written',
      }])
      .select();

    if (dbError) {
      return res.status(500).json({ error: 'Gagal simpan ke Supabase', detail: dbError.message });
    }

    return res.status(200).json({
      success: true,
      keyword_target: keyword,
      tipe_konten: tipe,
      catatan_proses: article.catatan_proses,
      artikel: inserted[0],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan tak terduga', detail: err.message });
  }
};
