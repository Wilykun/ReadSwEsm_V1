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
 *  autosholat.js — Notifikasi waktu sholat otomatis
 *  Kirim jadwal sholat + gambar + adzan ke grup, tepat waktu
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Auto Sholat — Notifikasi Waktu Sholat Otomatis
 *  Pantau waktu sholat berdasarkan koordinat kota, kirim pesan
 *  + gambar + suara adzan ke grup tepat pada waktunya —
 *  dapat diaktifkan per-grup oleh admin.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

import { importLazy } from '../../src/helper/esmLazy.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const FILE_CONFIG = path.join(process.cwd(), 'config.json');

// ─── GAMBAR MASJID PER WAKTU SHOLAT ──────────────────────────────────────────
// File lokal di img/sholat/ — ringan, pasti tampil, tidak bergantung URL eksternal
const IMG_DIR = path.join(process.cwd(), 'img', 'sholat');
// Batasi gambar yang dikirim agar tetap jelas di HP tetapi tidak berat.
// `withoutEnlargement` mencegah gambar kecil diperbesar.
const MAX_IMAGE_WIDTH  = 960;
const IMAGE_JPEG_QUALITY = 72;
const GAMBAR_SHOLAT = {
    Subuh   : path.join(IMG_DIR, 'subuh.png'),   // langit fajar masjid
    Zuhur   : path.join(IMG_DIR, 'zuhur.png'),   // masjid siang terang
    Ashar   : path.join(IMG_DIR, 'ashar.png'),   // golden hour sore
    Maghrib : path.join(IMG_DIR, 'maghrib.png'), // sunset langit jingga
    Isya    : path.join(IMG_DIR, 'isya.png'),    // masjid malam bercahaya
};

// ─── AUDIO ADZAN ──────────────────────────────────────────────────────────────
// Subuh punya adzan khusus (ada hayya 'alal falah + assholatukhoirum minannaum)
const AUDIO_ADZAN = {
    Subuh   : 'https://www.islamcan.com/audio/adhan/azan2.mp3',
    Zuhur   : 'https://www.islamcan.com/audio/adhan/azan1.mp3',
    Ashar   : 'https://www.islamcan.com/audio/adhan/azan1.mp3',
    Maghrib : 'https://www.islamcan.com/audio/adhan/azan1.mp3',
    Isya    : 'https://www.islamcan.com/audio/adhan/azan1.mp3',
};

// ─── EMOJI WAKTU SHOLAT ───────────────────────────────────────────────────────
const EMOJI_SHOLAT = {
    Subuh   : '🌙',
    Zuhur   : '☀️',
    Ashar   : '🌤️',
    Maghrib : '🌅',
    Isya    : '🌙',
};

// ─── UCAPAN SELAMAT SHOLAT PER WAKTU ─────────────────────────────────────────
const UCAPAN_SHOLAT = {
    Subuh   : 'Bangun & segera sholat Subuh sebelum matahari terbit 🌄',
    Zuhur   : 'Istirahatlah sejenak, jangan lupa sholat Zuhur 🕌',
    Ashar   : 'Jangan tunda, segera tunaikan sholat Ashar 🤲',
    Maghrib : 'Matahari sudah terbenam, waktunya sholat Maghrib 🌇',
    Isya    : 'Tutup hari dengan sholat Isya, semoga berkah 🌙',
};

// ─── CACHE JADWAL HARIAN ──────────────────────────────────────────────────────
let _cacheJadwal  = null;
let _cacheTanggal = '';

// ─── CONFIG HELPER ────────────────────────────────────────────────────────────
function bacaConfig() {
    try {
        if (fs.existsSync(FILE_CONFIG)) {
            return JSON.parse(fs.readFileSync(FILE_CONFIG, 'utf-8'));
        }
    } catch (_) {}
    return {};
}

function simpanConfig(cfg) {
    try {
        fs.writeFileSync(FILE_CONFIG, JSON.stringify(cfg, null, 2), 'utf-8');
    } catch (_) {}
}

// ─── GRUP MANAGEMENT ──────────────────────────────────────────────────────────
function addGroup(jid) {
    const cfg = bacaConfig();
    if (!cfg.autoSholat)                    cfg.autoSholat         = { groups: [] };
    if (!Array.isArray(cfg.autoSholat.groups)) cfg.autoSholat.groups = [];
    if (cfg.autoSholat.groups.includes(jid)) return false; // sudah terdaftar
    cfg.autoSholat.groups.push(jid);
    simpanConfig(cfg);
    return true;
}

function removeGroup(jid) {
    const cfg = bacaConfig();
    if (!Array.isArray(cfg.autoSholat?.groups)) return false;
    const before = cfg.autoSholat.groups.length;
    cfg.autoSholat.groups = cfg.autoSholat.groups.filter(g => g !== jid);
    if (cfg.autoSholat.groups.length < before) {
        simpanConfig(cfg);
        return true;
    }
    return false;
}

function isGroupEnabled(jid) {
    const cfg = bacaConfig();
    return Array.isArray(cfg.autoSholat?.groups) && cfg.autoSholat.groups.includes(jid);
}

function getEnabledGroups() {
    const cfg = bacaConfig();
    return Array.isArray(cfg.autoSholat?.groups) ? cfg.autoSholat.groups : [];
}

// ─── AMBIL JADWAL SHOLAT DARI API ─────────────────────────────────────────────
// Sumber: api.myquran.com — ID kota Jakarta = 1301
async function getJadwalHariIni() {
    const now     = new Date();
    const tanggal = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });

    if (_cacheJadwal && _cacheTanggal === tanggal) {
        return _cacheJadwal;
    }

    try {
        // Format tanggal YYYY-MM-DD untuk URL
        const tglFmt = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // 2026-05-23
        const res = await axios.get(`https://api.myquran.com/v2/sholat/jadwal/1301/${tglFmt}`, {
            timeout: 12000,
        });

        const j = res.data.data.jadwal;
        const jadwal = {
            Subuh   : j.subuh,
            Zuhur   : j.dzuhur,
            Ashar   : j.ashar,
            Maghrib : j.maghrib,
            Isya    : j.isya,
        };

        _cacheJadwal  = jadwal;
        _cacheTanggal = tanggal;
        return jadwal;
    } catch (error) {
        console.error('[AutoSholat] Gagal fetch jadwal:', error.message);
        throw new Error(`Gagal mengambil jadwal sholat: ${error.message}`);
    }
}

// ─── HELPER: jam WIB saat ini format "HH:MM" ─────────────────────────────────
// Pakai formatToParts + padStart agar selalu 2 digit dan handle "24" → "00"
function jamWIBSekarang() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone : 'Asia/Jakarta',
        hour     : '2-digit',
        minute   : '2-digit',
        hour12   : false,
    }).formatToParts(new Date());
    let h = parts.find(p => p.type === 'hour')?.value   || '00';
    let m = parts.find(p => p.type === 'minute')?.value || '00';
    if (h === '24') h = '00'; // Node ICU bug: tengah malam kadang "24"
    return h.padStart(2, '0') + ':' + m.padStart(2, '0');
}

// ─── CEK APAKAH SEKARANG WAKTU SHOLAT ────────────────────────────────────────
// Kembalikan { nama, waktu } jika jam:menit sekarang (WIB) cocok tepat
async function cekWaktuSholat() {
    const jadwal   = await getJadwalHariIni();
    const jamMenit = jamWIBSekarang();

    for (const [nama, waktu] of Object.entries(jadwal)) {
        if (waktu === jamMenit) return { nama, waktu };
    }
    return null;
}

// ─── BUAT CAPTION NOTIFIKASI ──────────────────────────────────────────────────
// Format ramah mobile — tiap baris ≤ 32 karakter agar tidak kepotong
function buatCaption(nama, waktu, jadwal) {
    const emoji  = EMOJI_SHOLAT[nama]  || '🕌';
    const ucapan = UCAPAN_SHOLAT[nama] || 'Segera tunaikan sholat 🤲';

    const hari = new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta', weekday: 'long',
    });
    const tgl = new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
    });

    const baris = Object.entries(jadwal).map(([n, w]) => {
        const aktif = n === nama;
        const dot   = aktif ? '▶' : '·';
        const label = aktif ? `*${n}*` : n;
        return `${dot} ${label.padEnd(7)} ${w} WIB`;
    }).join('\n');

    return (
        `${emoji} *Sholat ${nama}* ${emoji}\n` +
        `📅 ${hari}, ${tgl}\n` +
        `⏰ *${waktu} WIB*\n` +
        `─────────────────\n` +
        `🕌 *Jadwal Sholat Hari Ini*\n` +
        `${baris}\n` +
        `─────────────────\n` +
        `_${ucapan}_\n` +
        `_Allahu Akbar..._ 🤲`
    );
}

// ─── FUNGSI BANTU THUMBNAIL & AUDIO ──────────────────────────────────────────
// Return Buffer dari file lokal — pasti tampil, tidak bergantung internet
function getGambar(nama) {
    const filePath = GAMBAR_SHOLAT[nama] || GAMBAR_SHOLAT['Zuhur'];
    if (!fs.existsSync(filePath)) {
        throw new Error(`File gambar tidak ditemukan: ${filePath}`);
    }
    return fs.readFileSync(filePath);
}

function getAudio(nama) {
    return AUDIO_ADZAN[nama] || AUDIO_ADZAN['Zuhur'];
}

// ─── HELPER ───────────────────────────────────────────────────────────────────
function escXml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function bacaOwner() {
    try {
        const cfg = JSON.parse(fs.readFileSync(FILE_CONFIG, 'utf-8'));
        const owners = cfg.owners || [];
        return owners[0] || '';
    } catch (_) { return ''; }
}

// ─── BUAT GAMBAR BERSIH (TANPA TEKS) ────────────────────────────────────────
// Kembalikan buffer JPEG dari foto masjid — bersih tanpa overlay teks.
// Teks (nama sholat, jam, owner) ditampilkan di luar gambar via externalAdReply.
async function buatGambarOverlay(nama) {
    const filePath = GAMBAR_SHOLAT[nama] || GAMBAR_SHOLAT['Zuhur'];
    if (!fs.existsSync(filePath)) {
        throw new Error(`File gambar tidak ditemukan: ${filePath}`);
    }
    try {
        return await sharp(filePath)
            .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
            .jpeg({ quality: IMAGE_JPEG_QUALITY, progressive: true, mozjpeg: true })
            .toBuffer();
    } catch (error) {
        console.error('[AutoSholat] Sharp error:', error.message);
        throw new Error(`Gagal proses gambar: ${error.message}`);
    }
}

// ─── BUAT THUMBNAIL KECIL UNTUK externalAdReply ──────────────────────────────
// Baileys butuh thumbnail ≤100KB, format JPEG, tanpa alpha channel
async function buatThumbnail(nama) {
    const filePath = GAMBAR_SHOLAT[nama] || GAMBAR_SHOLAT['Zuhur'];
    if (!fs.existsSync(filePath)) {
        throw new Error(`File gambar tidak ditemukan: ${filePath}`);
    }
    try {
        return await sharp(filePath)
            .resize(200, 133, { fit: 'cover' })
            .flatten({ background: '#000000' })   // hapus alpha → background hitam jadi warna asli
            .jpeg({ quality: 60 })
            .toBuffer();
    } catch (error) {
        console.error('[AutoSholat] Sharp thumbnail error:', error.message);
        throw new Error(`Gagal buat thumbnail: ${error.message}`);
    }
}

// ─── SIMULASI / TES KIRIM ────────────────────────────────────────────────────
async function simulasi(namaWaktu) {
    const jadwal = await getJadwalHariIni();
    const nama   = namaWaktu
        ? Object.keys(jadwal).find(k => k.toLowerCase() === namaWaktu.toLowerCase()) || 'Zuhur'
        : 'Zuhur';
    const waktu  = jadwal[nama];
    const gambar = await buatGambarOverlay(nama);
    const thumb  = await buatThumbnail(nama);
    const owner0 = bacaOwner();
    return {
        nama,
        waktu,
        caption     : buatCaption(nama, waktu, jadwal),
        urlGambar   : gambar,
        urlThumbnail: thumb,
        urlAudio    : getAudio(nama),
        emoji       : EMOJI_SHOLAT[nama]  || '🕌',
        ucapan      : UCAPAN_SHOLAT[nama] || 'Segera tunaikan sholat 🤲',
        owner0,
        jadwal,
    };
}

export { addGroup, removeGroup, isGroupEnabled, getEnabledGroups, getJadwalHariIni, cekWaktuSholat, buatCaption, getGambar, getAudio, buatGambarOverlay, buatThumbnail, simulasi, EMOJI_SHOLAT, UCAPAN_SHOLAT };
export { handleAutosholat };
// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleAutosholat({ hisoka, m, query, tolak, logCommand, path, loadConfig }) {
        if (!m.isOwner) { await tolak(hisoka, m, '❌ Hanya owner yang bisa gunakan perintah ini.'); return; }

        const sub     = (query || '').trim().toLowerCase();
        const pfx     = m.prefix || '.';
        const jidGrup = m.from;

        if (!sub || sub === 'help') {
                const aktif = isGroupEnabled(jidGrup);
                const grupLabel = m.isGroup
                        ? (aktif ? '✅ *Aktif* di grup ini' : '❌ *Belum terdaftar* di grup ini')
                        : '_Perintah add/remove hanya bisa di grup_';
                await tolak(hisoka, m,
                        `╭─「 🕌 *AUTO SHOLAT* 」\n` +
                        `│\n` +
                        `│ Status: ${grupLabel}\n` +
                        `│\n` +
                        `│ *Perintah:*\n` +
                        `│ • *${pfx}autosholat add* — daftarkan grup ini\n` +
                        `│ • *${pfx}autosholat remove* — hapus grup ini\n` +
                        `│ • *${pfx}autosholat test* — tes kirim sekarang\n` +
                        `│ • *${pfx}autosholat status* — lihat semua grup\n` +
                        `│ • *${pfx}autosholat jadwal* — lihat jadwal hari ini\n` +
                        `│\n` +
                        `│ 💡 Bot kirim gambar masjid + suara adzan\n` +
                        `│    ke grup tepat saat waktu sholat tiba.\n` +
                        `╰──────────────────────`
                );
                return;
        }

        if (sub === 'add' || sub === 'on') {
                if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya bisa digunakan di dalam grup!'); return; }
                const berhasil = addGroup(jidGrup);
                await tolak(hisoka, m,
                        berhasil
                                ? `╭─「 🕌 *AUTO SHOLAT* 」\n│\n│ ✅ Grup berhasil didaftarkan!\n│\n│ Bot akan otomatis kirim notifikasi\n│ + gambar masjid + suara adzan ke\n│ grup ini setiap waktu sholat tiba.\n│\n│ Ketik *${pfx}autosholat remove* untuk berhenti.\n╰──────────────────────`
                                : `╭─「 🕌 *AUTO SHOLAT* 」\n│\n│ ℹ️ Grup ini sudah terdaftar sebelumnya.\n│ Tidak ada perubahan.\n╰──────────────────────`
                );
                if (berhasil) await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, 'autosholat-add');
                return;
        }

        if (sub === 'remove' || sub === 'del' || sub === 'off') {
                if (!m.isGroup) { await tolak(hisoka, m, '❌ Perintah ini hanya bisa digunakan di dalam grup!'); return; }
                const berhasil = removeGroup(jidGrup);
                await tolak(hisoka, m,
                        berhasil
                                ? `╭─「 🕌 *AUTO SHOLAT* 」\n│\n│ ❌ Grup berhasil dihapus dari daftar.\n│ Bot tidak akan kirim notif sholat\n│ ke grup ini lagi.\n╰──────────────────────`
                                : `╭─「 🕌 *AUTO SHOLAT* 」\n│\n│ ℹ️ Grup ini belum terdaftar.\n│ Tidak ada perubahan.\n╰──────────────────────`
                );
                if (berhasil) await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                logCommand(m, hisoka, 'autosholat-remove');
                return;
        }

        if (sub === 'status') {
                const semuaGrup = getEnabledGroups();
                if (!semuaGrup.length) { await tolak(hisoka, m, '📋 Belum ada grup yang terdaftar Auto Sholat.'); return; }
                let txt = `╭─「 📋 *STATUS AUTO SHOLAT* 」\n│\n`;
                semuaGrup.forEach((jid, i) => {
                        const label  = jid.replace('@g.us', '');
                        const isLast = i === semuaGrup.length - 1;
                        txt += `${isLast ? '╰' : '│'} ✅ ${label}\n`;
                });
                txt += `\n_Total: ${semuaGrup.length} grup aktif_`;
                await tolak(hisoka, m, txt);
                return;
        }

        if (sub === 'jadwal') {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const jadwal = await getJadwalHariIni();
                        const tgl = new Date().toLocaleDateString('id-ID', {
                                timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        });
                        let txt = `╭─「 🕌 *JADWAL SHOLAT JAKARTA* 」\n│\n│ 🗓️ _${tgl}_\n│\n`;
                        for (const [nama, waktu] of Object.entries(jadwal)) txt += `│ 🕐 *${nama}* : ${waktu} WIB\n`;
                        txt += `╰──────────────────────`;
                        await tolak(hisoka, m, txt);
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal ambil jadwal: ${err?.message || err}`);
                }
                return;
        }

        if (sub === 'test' || sub.startsWith('test ')) {
                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                try {
                        const namaWaktu = sub.replace('test', '').trim() || null;
                        const hasil     = await simulasi(namaWaktu);
                        const _asCfg    = loadConfig();
                        const _owner0   = Array.isArray(_asCfg.owners) ? (_asCfg.owners[0] || '') : '';
                        const _emoji    = (EMOJI_SHOLAT  || {})[hasil.nama] || '🕌';
                        const _ucapan   = (UCAPAN_SHOLAT || {})[hasil.nama] || 'Segera tunaikan sholat 🤲';
                        const imgMsg = await hisoka.sendMessage(m.from, {
                                image  : hasil.urlGambar,
                                caption: hasil.caption,
                                contextInfo: {
                                        externalAdReply: {
                                                showAdAttribution    : false,
                                                title                : `${_emoji} Sholat ${hasil.nama} — ${hasil.waktu} WIB`,
                                                body                 : _ucapan,
                                                sourceUrl            : `https://wa.me/${_owner0}`,
                                                mediaType            : 1,
                                                renderLargerThumbnail: true,
                                                thumbnail            : hasil.urlThumbnail,
                                        },
                                },
                        }, { quoted: m });
                        const { toVoiceNote: _asToVN, generateWaveform: _asGenWF } = (await importLazy(path.resolve('./SEMUA_FITUR/media/audioconvert.js')));
                        const _asAudRes  = await (await import('axios')).default.get(hasil.urlAudio, { responseType: 'arraybuffer', timeout: 20000 });
                        const _asVnBuf   = await _asToVN(Buffer.from(_asAudRes.data), 'audio/mpeg');
                        const _asWaveform = await _asGenWF(_asVnBuf, 'audio/ogg; codecs=opus').catch(() => null);
                        await hisoka.sendMessage(m.from, {
                                audio   : _asVnBuf,
                                ptt     : true,
                                mimetype: 'audio/ogg; codecs=opus',
                                ...(_asWaveform ? { waveform: _asWaveform } : {}),
                        }, { quoted: imgMsg });
                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                        logCommand(m, hisoka, 'autosholat-test');
                } catch (err) {
                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                        await tolak(hisoka, m, `❌ Gagal test: ${err?.message || err}`);
                }
                return;
        }

        await tolak(hisoka, m, `❌ Sub-perintah tidak dikenal. Ketik *${pfx}autosholat* untuk bantuan.`);
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(autosholat)$/i;
export const tags = ['setting'];
export const help = ['autosholat'];
export default handleAutosholat;
