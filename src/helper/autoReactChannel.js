'use strict';

// autoReactChannel.js — Auto-reaction postingan channel/saluran WhatsApp (ESM).
// Alur Wily: .readch on → fitur NYALA dan tersimpan di config.json, habis itu tiap postingan
// baru di channel yang bot follow langsung di-react otomatis; .readch off → fitur MATI.
// .readch on <link channel> → sekalian follow dan daftarin channel itu biar postingannya masuk.
// Mekanisme resmi Baileys 7.0.0-rc14: bot follow channel (newsletterFollow) → postingan baru
// masuk via messages.upsert → delay acak 1–20 detik → newsletterReactMessage(jid, serverId,
// emoji), serverId = ID ANGKA postingan (ujung link, mis. 175) — BUKAN hex m.key.id.
// ID angka diambil dari m.key.server_id bila ada, kalau tidak di-resolve lewat fetch pesan
// terbaru channel. Emoji cuma 6 resmi (👍 ❤️ 😂 😮 😢 🙏) dan default-nya acak
// dari 6 itu tiap postingan, kecuali Wily tentuin satu emoji lewat .readch on <emoji>.
// Dipanggil dari message.js SEBELUM guard newsletter karena guard itu me-return semua pesan
// @newsletter, jadi hook harus jalan dulu.
// PENTING: link channel berisi invite token, BUKAN JID — JID angka aslinya harus di-resolve
// dulu lewat newsletterMetadata('invite', kode), sama seperti .cekjidch yang sudah jalan.
// Pakai token langsung sebagai JID bikin follow dan react ditolak server (bug 11 Nov 21:04).

import { delay } from '@whiskeysockets/baileys';
import { loadConfig, saveConfig } from './utils.js';

export const CHANNEL_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const EMOJI_ACAK = 'acak';

// Delay reaction: acak 1–20 detik (1000–20000 ms), seperti autoReadStory.
export const DELAY_MIN_MS = 1000;
export const DELAY_MAX_MS = 20000;
export function randomReactDelayMs() {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS));
}

// Postingan lebih tua dari ini tidak di-react (mencegah react massal ke histori
// saat bot reconnect — pesan channel lama ikut ke-sync sebagai 'append').
const MAKS_UMUR_POSTINGAN_MS = 10 * 60 * 1000;

// Anti dobel-react bila Baileys kirim pesan yang sama 2x.
const sudahDiReact = new Set();
const MAKS_CACHE_REACT = 500;

// Catatan channel yang postingannya pernah masuk, maksimal 50 entri (yang terlama dibuang).
const MAKS_DILIHAT = 50;

export const CHANNEL_LINK_RE = /whatsapp\.com\/channel\/([A-Za-z0-9]+)/i;
export const CHANNEL_JID_RE = /^([0-9]+(?:\.[0-9]+)?)@newsletter$/i;

export function jidDariLinkAtauJid(input) {
  const s = String(input || '').trim();
  if (CHANNEL_JID_RE.test(s)) return s;
  return '';
}

function kodeInviteDariLink(input) {
  const s = String(input || '').trim();
  const link = s.match(CHANNEL_LINK_RE);
  return link ? link[1] : '';
}

// Resolve input (JID angka / link channel) jadi JID angka asli channel.
// Link harus di-resolve lewat metadata karena token invite bukan JID.
// meta.id server biasanya sudah bentuk JID lengkap, tapi angka polos pun dinormalisasi.
// Return '' bila channel tidak ketemu.
export async function resolveChannelJid(hisoka, input) {
  const s = String(input || '').trim();
  if (CHANNEL_JID_RE.test(s)) return s;
  const kode = kodeInviteDariLink(s);
  if (!kode || !hisoka?.newsletterMetadata) return '';
  try {
    const meta = await hisoka.newsletterMetadata('invite', kode);
    let jid = meta?.id || meta?.jid || '';
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(jid)) jid = `${jid}@newsletter`;
    return CHANNEL_JID_RE.test(jid) ? jid : '';
  } catch (_) {
    return '';
  }
}

// Nama channel realtime dari metadata WhatsApp (namaChannel dipakai .readch list,
// DM debug, dan balasan test). Coba JID lengkap dulu, lalu angka saja; tiap percobaan
// dicatat ke log bot biar ketahuan kenapa nama bisa kosong (11 Nov 21:52: nama channel
// TES BOT tidak ke-resolve, DM menampilkan "(nama tidak tersedia)").
export async function namaChannel(hisoka, jid, timeoutMs = 8000) {
  if (!hisoka?.newsletterMetadata) return '';
  for (const kunci of [jid, jid.replace('@newsletter', '')]) {
    try {
      const meta = await Promise.race([
        hisoka.newsletterMetadata('jid', kunci),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))
      ]);
      const nama = String(meta?.name || meta?.thread_metadata?.name || meta?.subject || '').trim();
      if (nama) return nama;
      console.log(`[namaChannel] ${jid} → KOSONG (kunci ${kunci === jid ? 'lengkap' : 'angka'}, meta=${meta ? 'ada-tanpa-nama' : 'null'})`);
    } catch (e) {
      console.log(`[namaChannel] ${jid} → ERROR ${e?.message || e}`);
    }
  }
  return '';
}

function bacaSetting() {
  const cfg = loadConfig() || {};
  const arc = cfg.autoReactChannel || {};
  return {
    enabled: arc.enabled === true,
    emoji: typeof arc.emoji === 'string' && arc.emoji ? arc.emoji : EMOJI_ACAK,
    channels: arc.channels && typeof arc.channels === 'object' ? arc.channels : {},
    dilihat: arc.dilihat && typeof arc.dilihat === 'object' ? arc.dilihat : {},
    debug: arc.debug === true
  };
}

export function getAutoReactSetting() {
  return bacaSetting();
}

// Nyalain/matikan mode debug: tiap postingan channel yang masuk dikirimin detailnya
// (ID channel + ID pesan + hasil react) ke DM owner, dan selalu tercatat di log bot.
export function setAutoReactDebug(on) {
  const cfg = loadConfig() || {};
  cfg.autoReactChannel = cfg.autoReactChannel || {};
  cfg.autoReactChannel.debug = !!on;
  return saveConfig(cfg);
}

export function getAutoReactChannels() {
  return bacaSetting().channels;
}

export function getAutoReactDilihat() {
  return bacaSetting().dilihat;
}

// Nyalain/matikan auto-react global. Emoji ikut disimpan bila dikasih.
export function setAutoReactEnabled(enabled, emoji) {
  const cfg = loadConfig() || {};
  cfg.autoReactChannel = cfg.autoReactChannel || {};
  cfg.autoReactChannel.enabled = !!enabled;
  if (typeof emoji === 'string' && emoji) {
    const em = emoji.trim();
    cfg.autoReactChannel.emoji = em === EMOJI_ACAK || CHANNEL_EMOJIS.includes(em) ? em : '❤️';
  }
  if (!cfg.autoReactChannel.emoji) cfg.autoReactChannel.emoji = EMOJI_ACAK;
  if (!cfg.autoReactChannel.channels || typeof cfg.autoReactChannel.channels !== 'object') {
    cfg.autoReactChannel.channels = {};
  }
  if (!cfg.autoReactChannel.dilihat || typeof cfg.autoReactChannel.dilihat !== 'object') {
    cfg.autoReactChannel.dilihat = {};
  }
  return saveConfig(cfg);
}

// Daftarin channel biar bot follow dan postingannya masuk (dipakai .readch on <link>).
// Emoji per-channel (bila diisi) mengalahkan emoji global buat channel itu.
export function tambahChannel(jid, emoji = EMOJI_ACAK) {
  const cfg = loadConfig() || {};
  cfg.autoReactChannel = cfg.autoReactChannel || {};
  cfg.autoReactChannel.channels = cfg.autoReactChannel.channels || {};
  const em = String(emoji || EMOJI_ACAK).trim();
  cfg.autoReactChannel.channels[jid] = {
    emoji: em === EMOJI_ACAK || CHANNEL_EMOJIS.includes(em) ? em : '❤️',
    ditambahPada: Date.now()
  };
  return saveConfig(cfg);
}

export function hapusChannel(jid) {
  const cfg = loadConfig() || {};
  const channels = cfg.autoReactChannel?.channels;
  if (!channels || !channels[jid]) return false;
  delete channels[jid];
  return saveConfig(cfg);
}

// Catat channel yang postingannya masuk (bukti realtime bot menerima dari channel itu).
// Dipakai .readch list biar daftarnya akurat, termasuk channel yang di-follow dari HP.
export function catatChannelDilihat(jid, tanggalPostinganMs) {
  if (!CHANNEL_JID_RE.test(jid || '')) return false;
  const cfg = loadConfig() || {};
  cfg.autoReactChannel = cfg.autoReactChannel || {};
  cfg.autoReactChannel.dilihat = cfg.autoReactChannel.dilihat || {};
  const lama = cfg.autoReactChannel.dilihat[jid] || { jumlahPost: 0 };
  cfg.autoReactChannel.dilihat[jid] = {
    terakhirPost: tanggalPostinganMs || Date.now(),
    jumlahPost: (lama.jumlahPost || 0) + 1
  };
  const keys = Object.keys(cfg.autoReactChannel.dilihat);
  if (keys.length > MAKS_DILIHAT) {
    keys.sort((a, b) => (cfg.autoReactChannel.dilihat[a].terakhirPost || 0) - (cfg.autoReactChannel.dilihat[b].terakhirPost || 0));
    for (const k of keys.slice(0, keys.length - MAKS_DILIHAT)) delete cfg.autoReactChannel.dilihat[k];
  }
  return saveConfig(cfg);
}

// Follow semua channel terdaftar, panggil sekali saat socket open (index.js) dan tiap kali
// channel baru ditambah. Idempotent, follow ulang tidak masalah.
export async function ensureAutoReactChannels(hisoka) {
  if (!hisoka?.newsletterFollow) return 0;
  const { channels } = bacaSetting();
  let n = 0;
  for (const jid of Object.keys(channels)) {
    try { await hisoka.newsletterFollow(jid); n++; } catch (_) {}
  }
  return n;
}

export function pilihEmoji(emojiValue) {
  const em = String(emojiValue || '❤️').trim();
  if (em === EMOJI_ACAK) return CHANNEL_EMOJIS[Math.floor(Math.random() * CHANNEL_EMOJIS.length)];
  return CHANNEL_EMOJIS.includes(em) ? em : '❤️';
}

// Jenis + cuplikan isi postingan buat debug (biar DM-nya akurat soal postingannya apa).
function jenisDanCuplikan(m) {
  let msg = m?.message || {};
  if (msg.ephemeralMessage?.message) msg = msg.ephemeralMessage.message;
  if (msg.conversation) return { jenis: 'teks', cuplikan: String(msg.conversation).slice(0, 80) };
  if (msg.extendedTextMessage?.text) return { jenis: 'teks', cuplikan: String(msg.extendedTextMessage.text).slice(0, 80) };
  if (msg.imageMessage) return { jenis: 'gambar', cuplikan: String(msg.imageMessage.caption || '').slice(0, 80) };
  if (msg.videoMessage) return { jenis: 'video', cuplikan: String(msg.videoMessage.caption || '').slice(0, 80) };
  if (msg.stickerMessage) return { jenis: 'stiker', cuplikan: '' };
  if (msg.documentMessage) return { jenis: 'dokumen', cuplikan: String(msg.documentMessage.fileName || '').slice(0, 80) };
  if (msg.audioMessage) return { jenis: 'audio', cuplikan: '' };
  if (msg.pollCreationMessage) return { jenis: 'polling', cuplikan: String(msg.pollCreationMessage.name || '').slice(0, 80) };
  const kunci = Object.keys(msg)[0] || '';
  return { jenis: kunci ? kunci.replace(/Message$/, '') : 'lainnya', cuplikan: '' };
}

// Kumpulkan kandidat pesan dari hasil newsletterFetchMessages (bentuk IQ mentah,
// strukturnya bisa beda-beda — jalanin rekursif dan ambil node yang punya server_id
// angka + message_id). Return [{ serverId, messageId, t }].
function kumpulkanPesan(node, out = [], lihat = 0) {
  if (!node || typeof node !== 'object' || lihat > 500) return out;
  const attrs = node.attrs || {};
  if (typeof attrs.server_id === 'string' && /^\d+$/.test(attrs.server_id) && typeof attrs.message_id === 'string') {
    out.push({ serverId: attrs.server_id, messageId: attrs.message_id, t: Number(attrs.t || 0) });
  }
  const isi = node.content;
  if (Array.isArray(isi)) for (const anak of isi) kumpulkanPesan(anak, out, lihat + 1);
  else if (isi && typeof isi === 'object') kumpulkanPesan(isi, out, lihat + 1);
  return out;
}

// Resolve ID ANGKA postingan yang dipakai server buat react (bukan hex m.key.id).
// Jalur 1 (paling akurat): m.key.server_id dari stanza pesan masuk.
// Jalur 2: fetch pesan terbaru channel lalu cocokkan message_id hex-nya,
// atau yang timestamp-nya paling dekat (≤60 detik) bila tidak ketemu persis.
// Return { serverId, sumber } — serverId '' bila tidak ketemu.
export async function cariServerIdAngka(hisoka, jid, m) {
  const dariKey = String(m?.key?.server_id || '').trim();
  if (/^\d+$/.test(dariKey)) return { serverId: dariKey, sumber: 'key' };
  try {
    if (!hisoka?.newsletterFetchMessages) return { serverId: '', sumber: '' };
    const hasil = await hisoka.newsletterFetchMessages(jid, 10);
    const kandidat = kumpulkanPesan(hasil);
    const hexId = m?.key?.id;
    const cocok = hexId ? kandidat.find((k) => k.messageId === hexId) : null;
    if (cocok?.serverId) return { serverId: cocok.serverId, sumber: 'fetch' };
    const ts = Number(m?.messageTimestamp || 0);
    let terbaik = null, selisihTerkecil = Infinity;
    for (const k of kandidat) {
      if (!k.serverId || !k.t) continue;
      const selisih = Math.abs(k.t - ts);
      if (selisih < selisihTerkecil) { selisihTerkecil = selisih; terbaik = k; }
    }
    if (terbaik && selisihTerkecil <= 60) return { serverId: terbaik.serverId, sumber: 'fetch-ts' };
  } catch (_) {}
  return { serverId: '', sumber: '' };
}

// Waktu WIB (hari, tanggal, jam) buat tampilan kotak debug.
export function waktuWIB(date = new Date()) {
  const wib = new Date(date.getTime() + 7 * 3600 * 1000);
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][wib.getUTCDay()];
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][wib.getUTCMonth()];
  const p = (n) => String(n).padStart(2, '0');
  return { hari, tanggal: `${wib.getUTCDate()} ${bulan} ${wib.getUTCFullYear()}`, waktu: `${p(wib.getUTCHours())}.${p(wib.getUTCMinutes())}` };
}

// Tampilan rapi TANPA garis kotak (terbukti 11 Nov 21:52: garis ┌ ═ │ membungkus di layar
// HP Wily sehingga kotaknya berantakan). Semua baris pendek (maks 33 char) biar pas dengan
// layar, monospace via ``` biar titik-duanya rata. Baris tanpa label = JID lengkap apa adanya.
export function buatTampilan(judul, baris) {
  const lenCP = (s) => [...String(s ?? '')].length;
  const potong = (s, maks) => {
    const t = String(s ?? '');
    return lenCP(t) > maks ? [...t].slice(0, maks - 3).join('') + '···' : t;
  };
  const isiBaris = baris.map(([label, nilai]) => {
    if (!label) return potong(nilai, 33);
    return potong(`⭔ ${String(label).padEnd(9)}: ${nilai}`, 33);
  });
  return '```\n' + [potong(judul, 33), ...isiBaris].join('\n') + '\n```';
}

// Hook utama, dipanggil dari message.js untuk setiap pesan masuk sebelum guard newsletter.
// Return true bila berhasil react. Syarat react: fitur NYALA (.readch on), postingan segar,
// dan bukan postingan bot sendiri. Tidak ada whitelist channel, semua postingan channel yang
// masuk (yang bot follow) di-react otomatis. delayMs cuma override delay buat simulasi,
// bila kosong delay-nya acak 1–20 detik. React HARUS pakai ID ANGKA postingan (yang di ujung
// link, mis. 175) — ID hex dari m.key.id ditolak diam-diam sama server (terbukti 11 Nov 21:19:
// log REACT tapi tidak ada badge di channel; .readch test yang pakai ID angka BERHASIL).
// Tiap postingan yang masuk selalu tercatat di log bot (ID channel + ID pesan + hasil),
// dan bila mode debug nyala detailnya juga dikirim ke DM owner setelah delay acak,
// lengkap dengan tipe dan isi postingannya.
export async function handleAutoReactChannel({ hisoka, m, delayMs }) {
  try {
    if (!m?.from?.endsWith('@newsletter')) return false;
    const hexId = m.key?.id;
    const ts = Number(m.messageTimestamp || 0) * 1000;
    const umurDetik = ts ? Math.max(0, Math.round((Date.now() - ts) / 1000)) : -1;
    const { enabled, emoji, channels, debug } = bacaSetting();
    const { jenis, cuplikan } = jenisDanCuplikan(m);
    let hasil = '';
    let alasan = '';
    let emojiPakai = '';
    let angka = { serverId: '', sumber: '' };
    let tungguMs = 0;
    const kirimDebug = async () => {
      console.log(`[AutoReactChannel] DEBUG post masuk: chat=${m.from} serverIdHex=${hexId} serverIdAngka=${angka.serverId || '-'} (${angka.sumber || '-'}) tipe=${jenis} umur=${umurDetik}s enabled=${enabled} → ${hasil}${alasan ? ` (${alasan})` : ''}${emojiPakai ? ` ${emojiPakai}` : ''}`);
      if (!debug) return;
      try {
        const cfg = loadConfig() || {};
        const owner = String(cfg.owners?.[0] || '').replace(/\D/g, '');
        if (!owner || !hisoka?.sendMessage) return;
        const namaCh = (await namaChannel(hisoka, m.from)) || '(nama tidak tersedia)';
        const w = waktuWIB();
        const baris = [
          ['Channel', namaCh],
          ['', m.from],
          ['Postingan', angka.serverId || hexId],
          ['Tipe', jenis]
        ];
        if (cuplikan) baris.push(['Isi', cuplikan]);
        baris.push(['Hasil', hasil === 'REACT' ? 'REACT ✓' : 'SKIP ❌']);
        if (alasan) baris.push(['Alasan', alasan]);
        if (emojiPakai) baris.push(['Emoji', emojiPakai]);
        if (tungguMs > 0) baris.push(['Delay', `${(tungguMs / 1000).toFixed(1)} detik`]);
        baris.push(['Hari', w.hari]);
        baris.push(['Tanggal', w.tanggal]);
        baris.push(['Waktu', w.waktu]);
        await hisoka.sendMessage(`${owner}@s.whatsapp.net`, { text: buatTampilan('Auto ReactionCh', baris) });
      } catch (_) {}
    };
    if (m.key?.fromMe) { hasil = 'SKIP'; alasan = 'postingan milik bot'; await kirimDebug(); return false; }
    if (!hexId) { hasil = 'SKIP'; alasan = 'tanpa serverId'; await kirimDebug(); return false; }
    catatChannelDilihat(m.from, ts || undefined);
    if (!enabled) { hasil = 'SKIP'; alasan = 'fitur MATI'; await kirimDebug(); return false; }

    // Hanya postingan segar (≤10 menit) — histori sync pasca-reconnect dilewati.
    if (ts && Date.now() - ts > MAKS_UMUR_POSTINGAN_MS) { hasil = 'SKIP'; alasan = 'postingan basi'; await kirimDebug(); return false; }

    const kunci = `${m.from}:${hexId}`;
    if (sudahDiReact.has(kunci)) { hasil = 'SKIP'; alasan = 'sudah di-react'; await kirimDebug(); return false; }
    sudahDiReact.add(kunci);
    if (sudahDiReact.size > MAKS_CACHE_REACT) {
      sudahDiReact.delete(sudahDiReact.values().next().value);
    }

    // Emoji: per-channel (bila channel itu didaftarin) kalau tidak → emoji global.
    emojiPakai = pilihEmoji(channels[m.from]?.emoji || emoji);

    // ID angka wajib buat react — tanpa itu server diam-diam membuang reaction-nya.
    angka = await cariServerIdAngka(hisoka, m.from, m);
    if (!angka.serverId) { hasil = 'SKIP'; alasan = 'ID angka tak ketemu'; await kirimDebug(); return false; }

    // Delay acak 1–20 detik sebelum react (biar natural, seperti baca status).
    const tunggu = typeof delayMs === 'number' ? delayMs : randomReactDelayMs();
    tungguMs = tunggu;
    if (tunggu > 0) await delay(tunggu);

    await hisoka.newsletterReactMessage(m.from, angka.serverId, emojiPakai);
    hasil = 'REACT';
    await kirimDebug();
    return true;
  } catch (e) {
    console.error('[AutoReactChannel]', e?.message || e);
    return false;
  }
}
