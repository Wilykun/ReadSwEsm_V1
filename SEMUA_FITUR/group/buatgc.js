/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *  Script ini khusus donasi/VIP
 *  Support dari kalian bikin saya
 *  makin semangat update fitur,
 *  fix bug, dan rawat script ini.
 *
 *  Dilarang menjual ulang script ini
 *  Tanpa izin resmi dari developer.
 *  Jika ketahuan = NO UPDATE / NO FIX
 *
 *  Hargai karya, gunakan dengan bijak.
 *  Terima kasih sudah support.
 * ───────────────────────────────
 *
 *  buatgc.js — Buat grup WhatsApp langsung dari bot (owner only)
 *  .buatgc <nama grup> | <nomor1, nomor2, ...> | [icon]
 *  - Format nomor fleksibel: +62812xxx, 62812xxx, 0812xxx, 812xxx
 *  - Icon: reply/kirim gambar, atau nama file di media/buatgc/, atau otomatis random
 * ───────────────────────────────
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, '..', '..', 'media', 'buatgc');

// ── Normalisasi nomor: +62812… / 62812… / 0812… / 812… → 62812… ──
function normalisasiNomor(raw) {
    let n = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
    if (!n) return null;
    if (n.startsWith('+')) n = n.slice(1);
    if (!/^\d+$/.test(n)) return null;
    if (n.startsWith('620')) n = '62' + n.slice(3);      // 620812… → 62812…
    else if (n.startsWith('08')) n = '62' + n.slice(1);  // 0812… → 62812…
    else if (n.startsWith('8')) n = '62' + n;            // 812… → 62812…
    if (!/^\d{9,16}$/.test(n)) return null;
    return n;
}

// ── Sistem icon dinamis (SAMA dengan listgc.js) ──
// ── Sumber: file lokal di media/buatgc/ + URL di icons.json. ──
// ── Kode = urutan: file lokal (alfabetis) dulu, lalu URL. ──
// ── Tambah gambar/file atau URL → otomatis dapat kode baru. ──
function daftarIconLocal() {
    try {
        return fs.readdirSync(ICON_DIR)
            .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
            .sort()
            .map(file => ({ file, nama: namaCantik(file), tipe: 'lokal' }));
    } catch (_) {
        return [];
    }
}
function daftarIconUrl() {
    try {
        const arr = JSON.parse(fs.readFileSync(path.join(ICON_DIR, 'icons.json'), 'utf8'));
        if (!Array.isArray(arr)) return [];
        return arr
            .filter(e => e && typeof e.url === 'string' && e.url.startsWith('http'))
            .map((e, i) => ({ url: e.url, nama: String(e.nama || `Anime URL ${i + 1}`), tipe: 'url' }));
    } catch (_) {
        return [];
    }
}
function namaCantik(file) {
    return file.replace(/\.(jpe?g|png|webp)$/i, '').replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}
function kodeIconList() {
    return [...daftarIconLocal(), ...daftarIconUrl()]
        .map((e, i) => ({ ...e, kode: String(i + 1) }));
}
function resolveIcon(arg) {
    const key = String(arg || '').trim();
    if (!key) return null;
    const list = kodeIconList();
    const byCode = list.find(c => c.kode === key);
    if (byCode) return byCode;
    const low = key.toLowerCase().replace(/\.(jpe?g|png|webp)$/i, '');
    return list.find(c =>
        (c.file && c.file.toLowerCase().replace(/\.(jpe?g|png|webp)$/i, '') === low) ||
        c.nama.toLowerCase() === low
    ) || null;
}
async function ambilIconBuffer(entry) {
    if (entry.tipe === 'lokal') {
        return fs.readFileSync(path.join(ICON_DIR, entry.file));
    }
    const res = await fetch(entry.url, {
        signal: AbortSignal.timeout(25000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2048) throw new Error('data gambar tidak valid');
    return buf;
}
async function ambilIconAcak() {
    const list = kodeIconList();
    if (!list.length) return null;
    const urutan = [...list].sort(() => Math.random() - 0.5);
    for (const r of urutan.slice(0, 3)) {
        try {
            const buf = await ambilIconBuffer(r);
            return { buf, nama: `otomatis: ${r.nama}` };
        } catch (_) {}
    }
    return null;
}
function caraPakai() {
    return '❌ *Format salah!*\n\n' +
        '📌 *Cara pakai:*\n' +
        '• `.buatgc Nama Grup | 62812xxxx, 0813xxxx`\n' +
        '• kirim/quote gambar + caption `.buatgc Nama Grup | 62812xxxx`\n' +
        '\n🖼️ Icon grup dipasang *otomatis acak* dari koleksi anime.' +
        '\n_Mau gambar sendiri? kirim/quote gambar + caption perintah._\n' +
        '\n> Nomor fleksibel: +62 / 62 / 08 / 8';
}

async function handleBuatgc({ hisoka, m, query, tolak, logCommand, getQuotedMediaBuffer }) {
    if (!m.isOwner) return;

    const parts = String(query || '').split('|').map(s => s.trim());
    const nama = parts[0] || '';
    const nomorRaw = parts[1] || '';

    if (!nama || !nomorRaw) return tolak(hisoka, m, caraPakai());
    if (nama.length > 100) return tolak(hisoka, m, '❌ Nama grup maksimal 100 karakter!');

    // ── Parse & validasi nomor ──
    const raws = nomorRaw.split(/[\s,;]+/).filter(Boolean);
    const valid = [];
    const invalid = [];
    const seen = new Set();
    for (const r of raws) {
        const n = normalisasiNomor(r);
        if (!n) { invalid.push(r); continue; }
        if (seen.has(n)) continue;
        seen.add(n);
        valid.push(n);
    }
    if (!valid.length) {
        return tolak(hisoka, m,
            '❌ *Semua nomor tidak valid!*\n\n' +
            'Contoh yang benar: `62812xxxxxxx`, `+62812xxxxxxx`, `0812xxxxxxx`');
    }
    try { await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } }); } catch (_) {}

    // ── Icon: 1) gambar terlampir/quote 2) otomatis acak (default) ──
    let iconBuf = null;
    let iconSrc = '';
    if (m.isMedia && m.type === 'imageMessage') {
        try { iconBuf = await m.downloadMedia(); iconSrc = 'gambar terlampir'; } catch (_) {}
    } else if (m.isQuoted && m.quoted?.isMedia && m.quoted?.type === 'imageMessage') {
        try { iconBuf = await getQuotedMediaBuffer(hisoka, m); iconSrc = 'gambar quote'; } catch (_) {}
    }
    if (!iconBuf) {
        const acak = await ambilIconAcak();
        if (acak) { iconBuf = acak.buf; iconSrc = acak.nama; }
    }

    // ── Buat grup ──
    let groupId;
    try {
        const res = await hisoka.groupCreate(nama, valid.map(n => n + '@s.whatsapp.net'));
        groupId = res?.id;
    } catch (e) {
        return tolak(hisoka, m,
            '❌ *Gagal membuat grup!*\n' +
            `_${String(e?.message || e).slice(0, 120)}_\n\n` +
            'Kemungkinan: nomor tidak terdaftar di WhatsApp.');
    }
    if (!groupId) return tolak(hisoka, m, '❌ Gagal membuat grup: ID grup tidak didapat.');

    // ── Set icon (fail-soft) ──
    let iconOk = false;
    if (iconBuf && iconBuf.length) {
        try { await hisoka.updateProfilePicture(groupId, iconBuf); iconOk = true; } catch (_) {}
    }

    // ── Link invite (fail-soft) ──
    let link = '';
    try {
        const code = await hisoka.groupInviteCode(groupId);
        if (code) link = `https://chat.whatsapp.com/${code}`;
    } catch (_) {}

    const hasil =
        '✅ *Grup berhasil dibuat!*\n\n' +
        `📛 Nama: *${nama}*\n` +
        `👥 Anggota: *${valid.length}* ditambahkan\n` +
        (invalid.length ? `⚠️ Dilewati: ${invalid.map(n => `~${n}~`).join(', ')} _(tidak valid)_\n` : '') +
        `🖼️ Icon: ${iconOk ? '_' + iconSrc + '_' : 'tidak dipasang'}\n` +
        (link ? `\n🔗 *Link invite:*\n${link}` : '') +
        `\n\n💡 Ketik *.listgc* untuk kelola grup & ganti icon.`;

    await hisoka.sendMessage(m.from, { text: hasil }, { quoted: m });
    try { await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } }); } catch (_) {}
    logCommand(m, hisoka, 'buatgc');
}

export { handleBuatgc, normalisasiNomor, kodeIconList, resolveIcon, ambilIconBuffer };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(buatgc|creategc|newgc)$/i;
export const tags = ['group'];
export const help = ['buatgc'];
export default handleBuatgc;
