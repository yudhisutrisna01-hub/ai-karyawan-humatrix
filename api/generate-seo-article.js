// AGENT #5 - SEO ARTICLE WRITER (v2 - metodologi Mas Didik Arwinsyah)
// Proses 3 tahap: (1) ide dari sudut pandang masalah audiens, (2) kerangka/outline,
// (3) kembangkan draft per section. Bukan generate 1x langsung jadi.
//
// Cara panggil:
//   GET /api/generate-seo-article?keyword=...&tipe=traffic
//   tipe: "traffic" (edukasi/how-to, 700-1200 kata) | "permintaan" (interaktif, 600-900 kata)
//         | "closingan" (sales/review, 800-1200 kata) | "pillar" (mendalam, 1500-2500+ kata)

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
  pillar: { panjang: '1500-2500+ kata', gaya: 'konten pilar mendalam untuk kompetisi tinggi, cakup topik secara komprehensif dari berbagai sudut' },
};

const BASE_RULES = `Kamu AI SEO Content Writer untuk www.indonesiaorganik.id (toko online produk pertanian organik,
termasuk Humatrix Buah - Asam Humat + Trichoderma). Kamu bekerja mengikuti kaidah penulisan SEO era AI berikut,
WAJIB dipatuhi di semua tahap:

STRUKTUR & KETERBACAAN (EEAT):
- Heading rapi: H1 untuk judul, H2 untuk sub-topik utama, H3 untuk sub-poin di dalamnya
- Paragraf PENDEK, maksimal 3-4 kalimat per paragraf
- Tebalkan (gunakan **teks**) kalimat-kalimat kunci yang mengandung insight penting, supaya mudah di-skim
- Sisipkan keyword secara natural, JANGAN keyword stuffing

INJEKSI NILAI TAMBAH (ANTI-AI GENERIK):
- Di minimal 1-2 tempat yang relevan, sisipkan penanda jelas untuk elemen yang HARUS diisi manusia nanti,
  jangan mengarang data palsu. Format penanda: [CATATAN UNTUK DIISI: <jenis elemen yang perlu ditambahkan, misal
  "data hasil panen dari petani binaan", "testimoni pelanggan", "foto/video pendukung">]
- Jangan menulis draf yang terasa generik dan template — tulis dengan suara yang punya sudut pandang jelas`;

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: BASE_RULES,
      messages,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error: ${errText}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

module.exports = async (req, res) => {
  try {
    const customKeyword = (req.query.keyword || '').trim();
    const keyword = customKeyword || KEYWORD_POOL[Math.floor(Math.random() * KEYWORD_POOL.length)];
    const tipe = TIPE_CONFIG[req.query.tipe] ? req.query.tipe : 'traffic';
    const config = TIPE_CONFIG[tipe];

    const messages = [];

    // TAHAP 1 - Cari ide dari sudut pandang masalah audiens
    messages.push({
      role: 'user',
      content: `Keyword target: "${keyword}". Tipe konten: ${tipe} (${config.gaya}).

TAHAP 1: Sebelum menulis apapun, jelaskan dulu (dalam 3-5 kalimat, bahasa natural bukan JSON):
- Masalah/pertanyaan APA yang sebenarnya dicari audiens saat mengetik keyword ini di Google (search intent)?
- Sudut pandang unik apa yang bisa diambil supaya artikel ini tidak generik seperti artikel SEO kebanyakan?`,
    });
    const step1 = await callClaude(messages);
    messages.push({ role: 'assistant', content: step1 });

    // TAHAP 2 - Susun kerangka/outline
    messages.push({
      role: 'user',
      content: `TAHAP 2: Berdasarkan analisa search intent tadi, susun KERANGKA artikel (outline) dengan struktur H1/H2/H3.
Target panjang total: ${config.panjang}. Tulis outline saja dulu (list H1, H2, H3 beserta poin singkat isi tiap bagian),
belum perlu isi lengkap.`,
    });
    const step2 = await callClaude(messages);
    messages.push({ role: 'assistant', content: step2 });

    // TAHAP 3 - Kembangkan draft lengkap sesuai outline
    messages.push({
      role: 'user',
      content: `TAHAP 3: Sekarang kembangkan outline itu jadi artikel LENGKAP, section by section, sesuai semua kaidah EEAT
di atas (paragraf pendek, bold kalimat kunci, sisipkan penanda [CATATAN UNTUK DIISI: ...] di tempat yang relevan).
Sisipkan produk Humatrix Buah sebagai solusi di 1-2 tempat yang relevan (bukan hard-selling berlebihan, kecuali
tipe kontennya "closingan" maka boleh lebih persuasif). Tutup dengan CTA singkat ke www.indonesiaorganik.id.

Balas HANYA dalam format JSON object, tanpa teks pembuka/penutup, tanpa markdown code fence:
{
  "judul": "judul artikel (H1)",
  "meta_description": "meta description maks 155 karakter, mengandung keyword",
  "isi_artikel": "isi lengkap artikel dalam format markdown dengan ## dan ### untuk heading, dan ** untuk bold"
}`,
    });
    const step3raw = await callClaude(messages);

    let article;
    try {
      article = JSON.parse(step3raw);
    } catch (e) {
      return res.status(500).json({ error: 'Gagal parse output JSON dari Claude', raw: step3raw, search_intent_analysis: step1, outline: step2 });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: inserted, error: dbError } = await supabase
      .from('content_ideas')
      .insert([{
        product: 'Humatrix Buah',
        platform: 'blog',
        idea_title: article.judul,
        idea_detail: `Keyword: ${keyword} | Tipe: ${tipe} | Search intent: ${step1}`,
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
      proses: { tahap1_search_intent: step1, tahap2_outline: step2 },
      artikel: inserted[0],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Terjadi kesalahan tak terduga', detail: err.message });
  }
};
