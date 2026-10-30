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
 *  listgc.js — Daftar semua grup bot + peran bot (Pemilik/Admin/Member),
 *  realtime dari groupMetadata. Reply nomor untuk ganti icon grup.
 *  .listgc → reply `<nomor> | <kode icon>` atau kirim/quote gambar + reply `<nomor>`
 * ───────────────────────────────
 */
'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICON_DIR = path.join(__dirname, '..', '..', 'media', 'buatgc');

// ── Sistem icon dinamis (SAMA dengan buatgc.js) ──
// ── Sumber: file lokal di media/buatgc/ + URL di icons.json. ──
// ── Kode = urutan: file lokal (alfabetis) dulu, lalu URL. ──
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
async function ambilIconAcak() {
    const list = kodeIconList();
    if (!list.length) return null;
    const urutan = [...list].sort(() => Math.random() - 0.5);
    for (const r of urutan.slice(0, 3)) {
        try {
            const buf = await ambilIconBuffer(r);
            return { buf, nama: r.nama };
        } catch (_) {}
    }
    return null;
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

const norm = s => String(s || '').split(':')[0].split('@')[0];

function peranBot(parts, botId) {
    const saya = (parts || []).find(p => norm(p.id) === botId || norm(p.phoneNumber) === botId);
    if (!saya) return { label: '❓ Tidak diketahui', tier: 3 };
    if (saya.admin === 'superadmin') return { label: '👑 Pemilik', tier: 0 };
    if (saya.admin === 'admin') return { label: '⭐ Admin', tier: 1 };
    return { label: '👤 Member', tier: 2 };
}

async function handleListgc({ hisoka, m, tolak, logCommand, pendingListgcChoices }) {
    if (!m.isOwner) return;
    await reaksi(hisoka, m, '⏳');

    let groups;
    try {
        groups = await hisoka.groupFetchAllParticipating();
    } catch (_) {
        return tolak(hisoka, m, '❌ Gagal mengambil daftar grup.');
    }
    const jids = Object.keys(groups || {});
    if (!jids.length) return tolak(hisoka, m, '👥 Bot belum ikut grup manapun.');

    const botId = norm(hisoka.user?.id);
    const entri = [];
    for (const jid of jids) {
        let nama = groups[jid]?.subject || jid;
        let anggota = 0;
        let peran = { label: '❓ Tidak diketahui', tier: 3 };
        try {
            const meta = await hisoka.groupMetadata(jid);
            if (meta?.subject) nama = meta.subject;
            const parts = meta?.participants || [];
            anggota = parts.length;
            peran = peranBot(parts, botId);
        } catch (_) { /* metadata gagal → tampil dengan ❓ */ }
        entri.push({ jid, nama, anggota, peran });
    }
    entri.sort((a, b) => (b.anggota - a.anggota) || (a.peran.tier - b.peran.tier) || a.nama.localeCompare(b.nama, 'id'));

    const txt = bangunTeksList(entri);

    const msg = await hisoka.sendMessage(m.from, { text: txt }, { quoted: m });
    await reaksi(hisoka, m, '✅');

    if (pendingListgcChoices) {
        const key = `${m.from}::${m.sender || m.key?.participant || ''}`;
        const old = pendingListgcChoices.get(key);
        if (old?.timeout) clearTimeout(old.timeout);
        const t = setTimeout(() => pendingListgcChoices.delete(key), 5 * 60 * 1000);
        pendingListgcChoices.set(key, {
            gcList: entri,
            botKey: msg?.key || null,
            botMsgId: msg?.key?.id || '',
            expiresAt: Date.now() + 5 * 60 * 1000,
            timeout: t,
        });
    }
    logCommand(m, hisoka, 'listgc');
}

// ── Bangun teks daftar (dipakai pesan awal) ──
function bangunTeksList(entri, banner = '') {
    let txt = '';
    if (banner) txt += banner + '\n\n';
    txt += `👥 *DAFTAR GRUP BOT* — ${entri.length} grup\n\n`;
    entri.forEach((e, i) => {
        txt += `${i + 1}. *${e.nama}*\n> ${e.peran.label} · ${e.anggota} anggota\n`;
    });
    txt += `\n💡 *Ganti icon:* reply pesan ini dengan nomor grup\n• \`2\` → icon grup no. 2 diganti *acak otomatis*\n• kirim/quote gambar + reply \`2\` → pakai gambarmu\n_berlaku 5 menit_`;
    return txt;
}

// ── Hapus pesan sendiri; false bila gagal ──
async function hapusPesan(hisoka, jid, botKey) {
    if (!botKey) return false;
    try {
        await hisoka.sendMessage(jid, { delete: botKey });
        return true;
    } catch (_) {
        return false;
    }
}
async function reaksi(hisoka, m, emoji) {
    try { await hisoka.sendMessage(m.from, { react: { text: emoji, key: m.key } }); } catch (_) {}
}

async function handleListgcReply({ hisoka, m, pendingListgcChoices, getQuotedStanzaId, getQuotedMediaBuffer, tolak, logCommand }) {
    if (!pendingListgcChoices?.size) return false;
    if (!m.isOwner) return false;

    const quotedId = getQuotedStanzaId(m);
    if (!quotedId) return false;

    const key = `${m.from}::${m.sender || m.key?.participant || ''}`;
    const pending = pendingListgcChoices.get(key);
    if (!pending || pending.botMsgId !== quotedId) return false;
    if (Date.now() > pending.expiresAt) {
        pendingListgcChoices.delete(key);
        return false;
    }

    const teks = (m.body || m.text || '').trim();
    const match = teks.match(/^(\d+)/);
    if (!match) return false;

    const no = parseInt(match[1], 10);
    const target = pending.gcList[no - 1];
    if (!target) {
        await tolak(hisoka, m, `❌ Nomor tidak valid. Pilih 1–${pending.gcList.length}.`);
        return true;
    }

    // ── Icon: gambar terlampir/quote → otomatis acak ──
    let iconBuf = null;
    let iconNama = '';
    if (m.isMedia && m.type === 'imageMessage') {
        try { iconBuf = await m.downloadMedia(); iconNama = 'gambar terlampir'; } catch (_) {}
    } else if (m.isQuoted && m.quoted?.isMedia && m.quoted?.type === 'imageMessage') {
        try { iconBuf = await getQuotedMediaBuffer(hisoka, m); iconNama = 'gambar quote'; } catch (_) {}
    }
    if (!iconBuf) {
        const acak = await ambilIconAcak();
        if (acak) { iconBuf = acak.buf; iconNama = `acak: ${acak.nama}`; }
    }
    if (!iconBuf) {
        await tolak(hisoka, m, '❌ Gagal mengambil icon acak, coba lagi.');
        return true;
    }

    // ── Hapus pesan daftar lama, ganti pesan baru (rapih, akurat) ──
    await hapusPesan(hisoka, m.from, pending.botKey);

    // ── Ganti icon ──
    await reaksi(hisoka, m, '⏳');
    try {
        await hisoka.updateProfilePicture(target.jid, iconBuf);
        console.log(`[listgc-icon] OK ${target.jid} <- ${iconNama} (${iconBuf.length}B)`);
    } catch (e) {
        console.log(`[listgc-icon] GAGAL ${target.jid} <- ${iconNama}:`, e?.message || e);
        if (pending.timeout) clearTimeout(pending.timeout);
        pendingListgcChoices.delete(key);
        await tolak(hisoka, m, `❌ *Gagal ganti icon*\n_${String(e?.message || e).slice(0, 100)}_`);
        await reaksi(hisoka, m, '❌');
        return true;
    }

    if (pending.timeout) clearTimeout(pending.timeout);
    pendingListgcChoices.delete(key);
    await reaksi(hisoka, m, '✅');
    await hisoka.sendMessage(m.from, { text: `✅ *Icon diganti!*\n_${target.nama} ← ${iconNama}_` }, { quoted: m });
    logCommand(m, hisoka, 'listgc-icon');
    return true;
}

export { handleListgc, handleListgcReply };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(listgc)$/i;
export const tags = ['group'];
export const help = ['listgc'];
export default handleListgc;
