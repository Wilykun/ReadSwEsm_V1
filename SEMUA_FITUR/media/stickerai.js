/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *
 *  stickerai.js — Sticker AI command handler
 *  Perintah .stickerai <prompt> untuk buat stiker dari teks
 *  memakai generator gambar AI (scraper endpoint Pollinations,
 *  tanpa API key — pola yang sama dengan plugin ia-pollinations
 *  bot-bot MD di GitHub), lalu dikonversi jadi stiker WebP
 *  memakai wa-sticker-formatter + brand dari config.json,
 *  persis seperti .sticker biasa.
 * ───────────────────────────────
 */
'use strict';

async function handleStickerAi(ctx) {
        const { hisoka, m, query, tolak, logCommand, loadConfig } = ctx;
        const prefix = m.prefix || '.';
        const prompt = String(query || '').trim();

        if (!prompt) {
                return tolak(hisoka, m,
                        `*Sticker AI*\n\n` +
                        `Buat stiker dari teks pakai AI.\n` +
                        `Contoh: \`${prefix}stickerai penyihir chibi rambut abu pakai kacamata bulat\``
                );
        }

        const react = async (emoji) => {
                try { await hisoka.sendMessage(m.from, { react: { text: emoji, key: m.key } }); } catch { /* abaikan */ }
        };

        await react('⏳');
        try {
                // Prompt dibungkus gaya stiker digital + blok negatif eksplisit.
                // Pelajaran tes live 22 Okt: tanpa blok negatif, model flux suka
                // menyelipkan teks acak ("hai"), logo palsu, dan tangan pemegang
                // stiker (foto mockup). Hasil generate lalu di-CROP TENGAH 86%
                // via sharp — watermark palsu yang digambar model di pojok
                // kanan bawah ikut terpotong.
                const wrapped = `digital sticker art of ${prompt}, every character together in one scene, side by side, fully visible, fills the whole frame edge to edge, flat vector illustration, chibi anime style, die-cut sticker with thick white outline border, plain solid pastel background, digital artwork only, not a photograph, no mockup, no hand, no fingers, no text, no words, no letters, no logo, no watermark, no signature`;

                let imgBuffer = null;
                let lastErr = null;
                for (let attempt = 1; attempt <= 2 && !imgBuffer; attempt++) {
                        try {
                                const seed = Math.floor(Math.random() * 1000000);
                                const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(wrapped)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
                                const controller = new AbortController();
                                const timer = setTimeout(() => controller.abort(), 120000);
                                try {
                                        const res = await fetch(url, {
                                                signal: controller.signal,
                                                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                                        });
                                        if (!res.ok) throw new Error(`Generator AI membalas HTTP ${res.status}`);
                                        const ctype = res.headers.get('content-type') || '';
                                        if (!ctype.startsWith('image/')) throw new Error('Generator AI tidak mengembalikan gambar');
                                        const buf = Buffer.from(await res.arrayBuffer());
                                        if (buf.length < 8000) throw new Error('Gambar dari generator AI tidak valid');
                                        imgBuffer = buf;
                                } finally {
                                        clearTimeout(timer);
                                }
                        } catch (e) {
                                lastErr = e; // coba sekali lagi dengan seed baru
                        }
                }
                if (!imgBuffer) throw lastErr || new Error('Generator AI tidak merespons');

                // Crop tengah 86% untuk membuang artefak tepi (watermark/teks
                // palsu yang digambar model). Gagal crop → pakai gambar asli.
                try {
                        const sharp = (await import('sharp')).default;
                        const meta = await sharp(imgBuffer).metadata();
                        const side = Math.floor(Math.min(meta.width, meta.height) * 0.86);
                        if (side > 100) {
                                imgBuffer = await sharp(imgBuffer)
                                        .extract({
                                                left: Math.floor((meta.width - side) / 2),
                                                top: Math.floor((meta.height - side) / 2),
                                                width: side,
                                                height: side,
                                        })
                                        .png()
                                        .toBuffer();
                        }
                } catch { /* pakai gambar asli */ }

                // Konversi ke stiker WebP — stack & brand yang sama dengan .sticker
                const config = typeof loadConfig === 'function' ? loadConfig() : {};
                const brand = config.sticker || { pack: 'WhatsApp Bot', author: 'Wilykun' };
                const { Sticker } = await import('wa-sticker-formatter');
                const sticker = new Sticker(imgBuffer, {
                        pack: brand.pack,
                        author: brand.author,
                        type: 'full',
                        quality: 80,
                });
                const stickerBuffer = await sticker.toBuffer();

                await hisoka.sendMessage(m.from, { sticker: stickerBuffer }, { quoted: m });
                await react('✅');
                if (typeof logCommand === 'function') logCommand(m, hisoka, m.command || 'stickerai');
        } catch (err) {
                await react('❌');
                if (typeof ctx.logError === 'function') {
                        try { ctx.logError(err instanceof Error ? err : new Error(String(err?.message || err)), 'stickerai'); } catch { /* abaikan */ }
                }
                const alasan = err?.name === 'AbortError'
                        ? 'Generator AI terlalu lama merespons (timeout 120 detik). Coba lagi sebentar.'
                        : (err?.message || 'Terjadi kesalahan.');
                return tolak(hisoka, m, `❌ *Gagal membuat stiker AI*\n\n> _${alasan}_`);
        }
}

export { handleStickerAi };

/**
 * ── Plugin ESM (pola sama seperti sticker-cmd.js) ──
 */
export const command = /^(stickerai|aisticker|aistiker|stikerai)$/i;
export const tags = ['media'];
export const help = ['stickerai'];
export default handleStickerAi;
