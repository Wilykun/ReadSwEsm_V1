'use strict';

// cfc-cmd.js — Bikin riwayat grup custom ala CFC-CCH (owner only, grup saja). Fitur ini
// merangkai pesan-pesan (teks/gambar/reaksi) dengan pengirim dan jam bebas, lalu mengirimnya
// sebagai satu bundle riwayat grup ke target — di HP target, pesan-pesan itu muncul sebagai
// riwayat lama grup. Syarat tampil: target harus anggota grup, dan jam pesan harus jatuh di
// jendela saat target belum ada di grup (paling gampang: target baru join). Draft disimpan di
// data/cfc-draft.json jadi aman dari restart bot. Bundle dibuat lokal lewat socket Baileys
// (cfc-cch v2, tanpa API) — tidak tergantung server pihak ketiga. Balasan bot pakai format WA lengkap.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFC } from '../../src/helper/cfc-cch.js';
import { bacaJoin, bacaKeluar } from '../../src/helper/cfc-join.js';

export const command = /^(cfc)$/i;
export const tags = ['tools'];
export const help = {
  name: 'cfc',
  description: 'Bikin riwayat grup custom: pesan teks/gambar/reaksi dari pengirim & jam bebas, tampil sebagai history lama di HP target yang baru join.',
  usage: '.cfc tambah <nomor> | <teks> [| <menitLalu>] [| q<no>]\n.cfc gambar <nomor> | <url> [| <caption>] [| <menitLalu>] [| q<no>]\n.cfc reaksi <no> | <emoji> | <nomor> [| <menitLalu>]\n.cfc lihat\n.cfc hapus <no>\n.cfc batal\n.cfc kirim <nomor target>\n.cfc kirim <nomor target> | <teks>',
  example: '.cfc kirim 6281234567890 | halo semua'
};

const MAKS_PESAN = 20;
const MAKS_REAKSI = 20;
const MAKS_TEKS = 4000;
const MENIT_AWAL = 10;
const JEDA_PESAN_DETIK = 60;
const JEDA_REAKSI_DETIK = 30;

const BOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DRAFT_PATH = process.env.CFC_DRAFT_PATH || path.join(BOT_DIR, 'data', 'cfc-draft.json');
const SEND_TIMEOUT_MS = Number(process.env.CFC_SEND_TIMEOUT_MS || 60000);

function idBaru() {
  return '3EB0' + crypto.randomBytes(9).toString('hex').toUpperCase();
}

function sekarangDetik() {
  return Math.floor(Date.now() / 1000);
}

function jamWIB(ts) {
  const d = new Date(Number(ts || 0) * 1000);
  if (!d.getTime()) return '?';
  const p = (n) => String(n).padStart(2, '0');
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${p(wib.getUTCDate())}/${p(wib.getUTCMonth() + 1)} ${p(wib.getUTCHours())}:${p(wib.getUTCMinutes())} WIB`;
}

export function normalNomor(input, hisoka) {
  const s = String(input || '').trim();
  const botJid = String(hisoka?.user?.id || '').split(':')[0];
  if (/^bot$/i.test(s)) {
    if (!botJid) return null;
    return { jid: botJid, fromMe: true };
  }
  if (s === '0') return { jid: '0@s.whatsapp.net', fromMe: false };
  if (/^\d+@s\.whatsapp\.net$/i.test(s)) {
    const jid = s.toLowerCase();
    return { jid, fromMe: jid === botJid };
  }
  const d = s.replace(/\D/g, '');
  if (!d) return null;
  let n = d;
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '62' + n.slice(1);
  else if (n.startsWith('8')) n = '62' + n;
  if (/^62\d{7,14}$/.test(n)) {
    const jid = n + '@s.whatsapp.net';
    return { jid, fromMe: jid === botJid };
  }
  // README library membolehkan peserta bebas (misal 11111111@s.whatsapp.net), jadi angka bukan Indonesia yang utuh tetap diterima apa adanya, sementara angka Indonesia yang rusak tetap ditolak.
  if (/^\d{7,15}$/.test(d) && !/^(62|0|8)/.test(d)) {
    const jid = d + '@s.whatsapp.net';
    return { jid, fromMe: jid === botJid };
  }
  return null;
}

export function nomorTampil(jid) {
  return String(jid || '').replace('@s.whatsapp.net', '');
}

function draftKosong() {
  return { dibuat: Date.now(), pesan: [], reaksi: [] };
}

export function loadDraft() {
  try {
    const raw = fs.readFileSync(DRAFT_PATH, 'utf8');
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.pesan) || !Array.isArray(d.reaksi)) return draftKosong();
    return d;
  } catch {
    return draftKosong();
  }
}

export function saveDraft(d) {
  fs.mkdirSync(path.dirname(DRAFT_PATH), { recursive: true });
  fs.writeFileSync(DRAFT_PATH, JSON.stringify(d, null, 2));
}

export function tsOtomatis(draft, menitAwal = MENIT_AWAL) {
  const now = sekarangDetik();
  const akhir = draft.pesan[draft.pesan.length - 1];
  if (!akhir) return now - menitAwal * 60;
  let ts = Math.min(akhir.timestamp + JEDA_PESAN_DETIK, now - 30);
  if (ts <= akhir.timestamp) ts = akhir.timestamp + 1;
  return ts;
}

function parseOpsi(segmen) {
  let menit = null;
  let quote = null;
  const teks = [];
  for (const s of segmen) {
    const t = String(s || '').trim();
    if (!t) continue;
    const q = t.match(/^q(\d+)$/i);
    if (q) {
      quote = Number(q[1]);
      continue;
    }
    if (/^\d{1,5}$/.test(t)) {
      menit = Number(t);
      continue;
    }
    teks.push(t);
  }
  return { menit, quote, teks };
}

function cekMenit(menit) {
  if (menit === null || menit === undefined) return null;
  if (!Number.isInteger(menit) || menit < 1 || menit > 10080) return 'Menit harus 1–10080 (maks 7 hari).';
  return null;
}

export function formatDraft(draft, pfx) {
  if (!draft.pesan.length && !draft.reaksi.length) return 'Draft masih kosong — tambah pesan dulu pakai `.cfc tambah <nomor> | <teks>`.';
  const baris = draft.pesan.map((p, i) => {
    const no = i + 1;
    const isi = p.tipe === 'gambar' ? `🖼️ ${p.caption ? `"${p.caption}"` : '(tanpa caption)'}\n   ${p.url}` : `"${p.teks}"`;
    const pengirim = p.fromMe ? 'bot (kamu)' : nomorTampil(p.pengirim);
    const reaksi = draft.reaksi.filter((r) => r.targetId === p.id).map((r) => `\n   ↳ ${r.emoji} dari ${r.fromMe ? 'bot' : nomorTampil(r.pengirim)} — ${jamWIB(r.timestamp)}`).join('');
    return `${no}. [${p.tipe}] ${pengirim} — ${jamWIB(p.timestamp)}\n   ${isi}${reaksi}`;
  });
  return `*Draft riwayat (${draft.pesan.length} pesan, ${draft.reaksi.length} reaksi):*\n${baris.join('\n')}\n\n> _Kirim ke grup ini pakai \`${pfx}cfc kirim <nomor target>\` — target harus anggota grup dan jam pesannya sebelum dia join._`;
}

function menuCfc(pfx, draft) {
  const ringkas = draft.pesan.length ? `\nDraft: *${draft.pesan.length} pesan, ${draft.reaksi.length} reaksi* — lihat: \`${pfx}cfc lihat\`` : '\nDraft: _kosong_';
  return `*📜 .cfc — Riwayat Grup Custom (CFC-CCH)*${ringkas}\n\nBikin pesan-pesan yang tampil sebagai *riwayat lama grup* di HP target — pengirim dan jamnya bebas kamu atur. Paling gampang buat target yang *baru join* grup (atau habis keluar lalu join lagi): jam pesan harus di antara dia belum join.\n\n*Perintah:*\n1. \`${pfx}cfc tambah <nomor> | <teks> [| <menitLalu>] [| q<no>]\` — tambah pesan teks\n2. \`${pfx}cfc gambar <nomor> | <url> [| <caption>] [| <menitLalu>] [| q<no>]\` — tambah gambar dari URL\n3. \`${pfx}cfc reaksi <no> | <emoji> | <nomor> [| <menitLalu>]\` — reaksi ke pesan draft\n4. \`${pfx}cfc lihat\` — lihat draft\n5. \`${pfx}cfc hapus <no>\` — hapus pesan draft\n6. \`${pfx}cfc batal\` — hapus semua draft\n7. \`${pfx}cfc kirim <nomor target>\` — kirim draft ke grup ini\n8. \`${pfx}cfc kirim <nomor target> | <teks>\` — kirim langsung 1 pesan tanpa draft (real-time, tanpa nunggu, nggak perlu isi menit — jam otomatis 1 menit sebelum target join, dicatat bot tiap ada yang masuk grup; tambah \`| <nomor>\` sebelum teks buat pengirim custom, \`| <menitLalu>\` di akhir cuma buat atur manual)\n9. \`${pfx}cfc auto [jumlah] [menitAwal]\` — isi draft otomatis: pesan + reaksi acak dari nomor acak (default 5, maks 20; menitAwal = pesan pertama sekian menit lalu, default 10, contoh \`auto 5 1\`)\n\n*Pengirim:* nomor \`62xxx\`/\`08xxx\`, \`bot\` (= bot sendiri), atau \`0\` (= anonim). *Jam:* kosongin = otomatis (mulai 10 menit lalu, tiap pesan +1 menit); isi angka = sekian menit lalu. *q<no>* = balas pesan draft nomor itu.\n\n> _Owner only, cuma di grup. Bundle dibuat lokal lewat socket Baileys (cfc-cch v2, tanpa API). Satu bundle per satu sesi join target; kirim ulang untuk sesi yang sama harus hapus dulu bundle sebelumnya._`;
}

// Samakan LID dengan nomor HP lewat pemetaan Baileys, gagalnya diam-diam saja karena tidak semua LID punya pasangan nomor yang dikenal.
async function pnDariLid(hisoka, jid) {
  try {
    return (await hisoka?.signalRepository?.lidMapping?.getPNForLID?.(jid)) || null;
  } catch { return null; }
}
async function lidDariPn(hisoka, jid) {
  try {
    return (await hisoka?.signalRepository?.lidMapping?.getLIDForPN?.(jid)) || null;
  } catch { return null; }
}

// Kumpulan obrolan umum dan emoji buat mode auto, dipilih acak tiap pesan supaya draft kelihatan seperti obrolan beneran.
const TEKS_ACAK = ['halo semua', 'wkwk', 'iya bener', 'oke gas', 'siap', 'haha', 'anjay', 'btw besok jadi kan?', 'udah makan belum', 'gas', 'mantap', 'setuju', 'lah kok gitu', 'iya dong', 'sabi', 'oke oke', 'hmm', 'wah', 'keren', 'info dong', 'kapan?', 'dimana?', 'udah', 'belum', 'nanti ya', 'bentar', 'yoi', 'betul', 'nggak tau', 'coba cek', 'linknya dong'];
const EMOJI_ACAK = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '😍', '🤣', '😅', '👏', '💯'];
const PREFIX_ACAK = ['62812', '62813', '62821', '62822', '62852', '62853', '62857', '62858'];
function acakDari(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function nomorAcakJid() {
  let d = acakDari(PREFIX_ACAK);
  for (let i = 0; i < 7; i++) d += Math.floor(Math.random() * 10);
  return d + '@s.whatsapp.net';
}

export default async function handler(ctx) {
  const { hisoka, m, query, pfx, isMainBot } = ctx;
  if (!isMainBot || !isMainBot(hisoka)) return;
  if (!m.isOwner) return;
  const q = String(query || '').trim();
  const spasi = q.indexOf(' ');
  const sub = (spasi < 0 ? q : q.slice(0, spasi)).toLowerCase();
  const sisa = spasi < 0 ? '' : q.slice(spasi + 1).trim();
  const draft = loadDraft();
  console.log('[cfc]', sub || '(menu)', '| grup:', m.from || m.chat || '(?)', sisa ? '| arg: ' + sisa : '');
  if (!sub) return m.reply(menuCfc(pfx, draft));

  if (sub === 'lihat') return m.reply(formatDraft(draft, pfx));

  if (sub === 'batal') {
    saveDraft(draftKosong());
    return m.reply('*Draft dihapus.*\n\n> _Mulai dari nol lagi pakai `.cfc tambah ...`._');
  }

  if (sub === 'auto') {
    // Isi draft otomatis dengan pesan dan reaksi acak supaya tidak perlu tambah satu-satu: pengirim nomor Indonesia acak, teks dari kumpulan obrolan umum, jam lanjut otomatis dari pesan terakhir, dan tiap pesan berkesempatan dapat satu reaksi acak.
    const argAuto = sisa.split(/\s+/).filter(Boolean);
    let jumlah = Number(argAuto[0] || '5');
    if (!Number.isInteger(jumlah) || jumlah < 1) return m.reply(`*Jumlah auto nggak valid:* \`${sisa || '(kosong)'}\`\nPakai: \`${pfx}cfc auto [jumlah] [menitAwal]\` — jumlah 1–20, kosongin = 5.\nContoh: \`${pfx}cfc auto 10\``);
    let menitAwal = argAuto[1] === undefined ? MENIT_AWAL : Number(argAuto[1]);
    const galatMenit = cekMenit(menitAwal);
    if (galatMenit) return m.reply(`*Menit awal auto nggak valid:* \`${argAuto[1]}\`\n${galatMenit}\nPakai: \`${pfx}cfc auto [jumlah] [menitAwal]\` — menitAwal 1–10080, kosongin = ${MENIT_AWAL}.\nContoh: \`${pfx}cfc auto 5 1\``);
    const slotPesan = MAKS_PESAN - draft.pesan.length;
    if (slotPesan <= 0) return m.reply(`*Draft pesan sudah penuh:* maks ${MAKS_PESAN} pesan per bundle. Hapus dulu (\`${pfx}cfc hapus <no>\`) atau kirim dulu.`);
    const mau = Math.min(jumlah, slotPesan);
    let tambahReaksi = 0;
    for (let i = 0; i < mau; i++) {
      const item = { id: idBaru(), tipe: 'teks', pengirim: nomorAcakJid(), timestamp: tsOtomatis(draft, menitAwal), fromMe: false, quotedId: null, teks: acakDari(TEKS_ACAK) };
      draft.pesan.push(item);
      if (draft.reaksi.length < MAKS_REAKSI && Math.random() < 0.5) {
        draft.reaksi.push({ targetId: item.id, emoji: acakDari(EMOJI_ACAK), pengirim: nomorAcakJid(), timestamp: item.timestamp + 20, fromMe: false });
        tambahReaksi++;
      }
    }
    saveDraft(draft);
    return m.reply(`*Auto selesai: ${mau} pesan acak + ${tambahReaksi} reaksi acak masuk draft (mulai ${menitAwal} menit lalu).*${mau < jumlah ? ` (minta ${jumlah}, muat ${mau} karena draft maks ${MAKS_PESAN} pesan.)` : ''}\n\n> _Lihat: \`${pfx}cfc lihat\` — kirim: \`${pfx}cfc kirim <nomor target>\`._`);
  }

  if (sub === 'tambah' || sub === 'gambar') {
    const isGambar = sub === 'gambar';
    const bag = sisa.split('|').map((s) => s.trim());
    const pengirimRaw = bag[0] || '';
    const isiUtama = bag[1] || '';
    const opsi = parseOpsi(bag.slice(2));
    const pengirim = normalNomor(pengirimRaw, hisoka);
    if (!pengirim) return m.reply(`*Nomor pengirim nggak valid:* \`${pengirimRaw || '(kosong)'}\`\nPakai nomor Indonesia \`+62xxx\`/\`62xxx\`/\`08xxx\`/\`8xxx\` (boleh pakai spasi/dash), nomor lain apa adanya, \`bot\`, atau \`0\`.\nContoh: \`${pfx}cfc tambah 6281234567890 | halo\``);
    if (!isiUtama) return m.reply(isGambar ? `*URL gambarnya mana?*\nPakai: \`${pfx}cfc gambar <nomor> | <url gambar> [| <caption>]\`` : `*Teksnya mana?*\nPakai: \`${pfx}cfc tambah <nomor> | <teks>\``);
    if (isGambar && !/^https?:\/\//i.test(isiUtama)) return m.reply(`*URL gambar harus http(s):* \`${isiUtama}\``);
    if (!isGambar && isiUtama.length > MAKS_TEKS) return m.reply(`*Teks kepanjangan:* ${isiUtama.length} karakter (maks ${MAKS_TEKS}).`);
    if (draft.pesan.length >= MAKS_PESAN) return m.reply(`*Draft penuh:* maks ${MAKS_PESAN} pesan per bundle. Hapus dulu (\`${pfx}cfc hapus <no>\`) atau kirim dulu.`);
    if (!isGambar && opsi.teks.length) return m.reply(`*Segmen tambahan nggak dikenal:* \`${opsi.teks.join(' | ')}\`\nYang boleh cuma angka (menit lalu) atau \`q<no>\` (balas pesan draft).\nContoh: \`${pfx}cfc tambah 6281234567890 | halo | 5 | q1\``);
    const salahMenit = cekMenit(opsi.menit);
    if (salahMenit) return m.reply(`*${salahMenit}*`);
    let quotedId = null;
    if (opsi.quote !== null) {
      const target = draft.pesan[opsi.quote - 1];
      if (!target) return m.reply(`*Pesan draft nomor ${opsi.quote} nggak ada.*\nLihat nomornya: \`${pfx}cfc lihat\``);
      quotedId = target.id;
    }
    const ts = opsi.menit !== null ? sekarangDetik() - opsi.menit * 60 : tsOtomatis(draft);
    const akhir = draft.pesan[draft.pesan.length - 1];
    if (akhir && ts <= akhir.timestamp) return m.reply(`*Jam pesan ini (${jamWIB(ts)}) lebih awal dari pesan terakhir (${jamWIB(akhir.timestamp)}).*\nPesan draft harus urut dari yang paling lama — pakai menit yang lebih kecil (lebih baru).`);
    const item = { id: idBaru(), tipe: isGambar ? 'gambar' : 'teks', pengirim: pengirim.jid, timestamp: ts, fromMe: pengirim.fromMe, quotedId };
    if (isGambar) {
      item.url = isiUtama;
      if (opsi.teks.length) item.caption = opsi.teks.join(' | ');
    } else {
      item.teks = isiUtama;
    }
    draft.pesan.push(item);
    saveDraft(draft);
    return m.reply(`*Pesan #${draft.pesan.length} masuk draft.*\n${isGambar ? '🖼️' : '💬'} ${pengirim.fromMe ? 'bot' : nomorTampil(pengirim.jid)} — ${jamWIB(ts)}${quotedId ? `\n↩️ Balas pesan #${opsi.quote}` : ''}\n\n> _Draft sekarang ${draft.pesan.length} pesan. Lanjut tambah, atau kirim: \`${pfx}cfc kirim <nomor target>\`._`);
  }

  if (sub === 'reaksi') {
    const bag = sisa.split('|').map((s) => s.trim());
    const no = Number(bag[0]);
    const emoji = bag[1] || '';
    const pengirimRaw = bag[2] || '';
    const opsi = parseOpsi(bag.slice(3));
    const target = draft.pesan[no - 1];
    if (!Number.isInteger(no) || !target) return m.reply(`*Pesan draft nomor ${bag[0] || '(kosong)'} nggak ada.*\nLihat nomornya: \`${pfx}cfc lihat\``);
    if (!emoji || emoji.length > 16) return m.reply(`*Emoji reaksinya mana?*\nPakai: \`${pfx}cfc reaksi <no> | <emoji> | <nomor>\``);
    const pengirim = normalNomor(pengirimRaw, hisoka);
    if (!pengirim) return m.reply(`*Nomor pereaksi nggak valid:* \`${pengirimRaw || '(kosong)'}\``);
    if (draft.reaksi.length >= MAKS_REAKSI) return m.reply(`*Reaksi penuh:* maks ${MAKS_REAKSI} per bundle.`);
    const salahMenit = cekMenit(opsi.menit);
    if (salahMenit) return m.reply(`*${salahMenit}*`);
    if (opsi.quote !== null) return m.reply(`*Reaksi nggak bisa pakai q<no>.*\nPakai: \`${pfx}cfc reaksi <no> | <emoji> | <nomor> [| <menitLalu>]\``);
    if (opsi.teks.length) return m.reply(`*Segmen tambahan nggak dikenal:* \`${opsi.teks.join(' | ')}\`\nYang boleh cuma angka (menit lalu).\nContoh: \`${pfx}cfc reaksi 1 | 👍 | 6281234567890 | 3\``);
    const ts = opsi.menit !== null ? sekarangDetik() - opsi.menit * 60 : target.timestamp + JEDA_REAKSI_DETIK;
    if (ts <= target.timestamp) return m.reply(`*Jam reaksi harus sesudah jam pesannya.*\nPesan #${no}: ${jamWIB(target.timestamp)} — reaksi yang kamu minta: ${jamWIB(ts)}.`);
    if (ts > sekarangDetik()) return m.reply(`*Jam reaksi masih di masa depan:* ${jamWIB(ts)}. Pakai menit yang lebih besar.`);
    draft.reaksi.push({ targetId: target.id, emoji, pengirim: pengirim.jid, timestamp: ts, fromMe: pengirim.fromMe });
    saveDraft(draft);
    return m.reply(`*Reaksi masuk draft.*\n${emoji} ke pesan #${no} dari ${pengirim.fromMe ? 'bot' : nomorTampil(pengirim.jid)} — ${jamWIB(ts)}\n\n> _Draft sekarang ${draft.reaksi.length} reaksi._`);
  }

  if (sub === 'hapus') {
    const no = Number((sisa.split(/\s+/)[0] || ''));
    const target = draft.pesan[no - 1];
    if (!Number.isInteger(no) || !target) return m.reply(`*Pesan draft nomor ${sisa || '(kosong)'} nggak ada.*\nLihat nomornya: \`${pfx}cfc lihat\``);
    draft.pesan.splice(no - 1, 1);
    const buang = draft.reaksi.filter((r) => r.targetId === target.id).length;
    draft.reaksi = draft.reaksi.filter((r) => r.targetId !== target.id);
    saveDraft(draft);
    return m.reply(`*Pesan #${no} dihapus dari draft.*${buang ? ` (${buang} reaksi ikut terhapus.)` : ''}\n\n> _Draft sekarang ${draft.pesan.length} pesan._`);
  }

  if (sub === 'kirim') {
    // Mode langsung (tanpa draft, real-time, tanpa nunggu — cara README): `.cfc kirim <target> | <teks> [| <menitLalu>]`
    // (pengirim anonim) atau `.cfc kirim <target> | <nomor pengirim> | <teks> [| <menitLalu>]` (pengirim custom).
    // Jam pesan otomatis 1 menit lalu — kirim segera setelah target join, atau isi menitLalu lebih besar bila target sudah join lama.
    // Tanpa segmen `|` = mode draft seperti biasa.
    const bagKirim = sisa.split('|').map((s) => s.trim());
    const targetRaw = bagKirim[0] || '';
    const langsung = bagKirim.length > 1;
    let modeLangsung = null;
    if (langsung) {
      let pengirim, teks, opsiSegmen;
      const calon = normalNomor(bagKirim[1], hisoka);
      if (bagKirim.length >= 3 && calon) {
        pengirim = calon; teks = bagKirim[2] || ''; opsiSegmen = bagKirim.slice(3);
      } else {
        pengirim = normalNomor('0', hisoka); teks = bagKirim[1] || ''; opsiSegmen = bagKirim.slice(2);
      }
      const opsiL = parseOpsi(opsiSegmen);
      if (opsiL.quote !== null) return m.reply(`*Mode langsung nggak bisa pakai q<no>.*\nBalasan antar-pesan cuma bisa lewat draft (\`${pfx}cfc tambah <nomor> | <teks> | q<no>\`).`);
      if (opsiL.teks.length) return m.reply(`*Segmen tambahan nggak dikenal:* \`${opsiL.teks.join(' | ')}\`\nYang boleh cuma angka (menit lalu).\nContoh: \`${pfx}cfc kirim <nomor target> | <teks> | 5\``);
      const salahL = cekMenit(opsiL.menit);
      if (salahL) return m.reply(`*${salahL}*`);
      if (!teks) return m.reply(`*Teksnya mana?*\nPakai: \`${pfx}cfc kirim <nomor target> | <teks>\``);
      if (teks.length > MAKS_TEKS) return m.reply(`*Teks kepanjangan:* ${teks.length} karakter (maks ${MAKS_TEKS}).`);
      // menit null = otomatis dari waktu join target (di bawah), bukan 1 menit lalu; menit diisi manual tetap menang.
      modeLangsung = { pengirim, teks, menit: opsiL.menit };
    }
    if (!m.isGroup) return m.reply(`*Kirim cuma bisa di grup.*\nBundle riwayat dikirim ke grup ini, ditujukan ke target.`);
    // JID grup diambil dari m.from karena m.chat tidak ada di objek pesan bot ini, dan groupMetadata(undefined) itulah yang bikin error "missing <group> node" kemarin.
    const grupJid = m.from || m.chat || m.key?.remoteJid || null;
    if (!grupJid) return m.reply(`*Gagal baca JID grup.*\nCoba kirim ulang perintahnya.`);
    if (!langsung && !draft.pesan.length) return m.reply(`*Draft masih kosong.*\nTambah pesan dulu: \`${pfx}cfc tambah <nomor> | <teks>\`\nAtau kirim langsung tanpa draft: \`${pfx}cfc kirim <nomor target> | <teks>\``);
    const target = normalNomor(targetRaw, hisoka);
    if (!target) return m.reply(`*Nomor target nggak valid:* \`${targetRaw || '(kosong)'}\`\nPakai: \`${pfx}cfc kirim <nomor target>\``);
    const botJid = String(hisoka?.user?.id || '').split(':')[0];
    if (target.jid === botJid) return m.reply(`*Target nggak boleh bot sendiri.*\nRiwayat ditujukan ke anggota grup yang baru join.`);
    let meta;
    try {
      meta = await hisoka.groupMetadata(grupJid);
    } catch (e1) {
      console.log(`[cfc] groupMetadata gagal (coba 1) ${grupJid}:`, e1?.message || e1);
      await new Promise((r) => setTimeout(r, 1000));
      try {
        meta = await hisoka.groupMetadata(grupJid);
      } catch (e2) {
        console.log(`[cfc] groupMetadata gagal (coba 2) ${grupJid}:`, e2?.message || e2);
        return m.reply(`*Gagal baca info grup:* ${e2?.message || e2}\nServer WhatsApp nggak ngasih info grup ini — biasanya bot sudah bukan anggota grup, atau gangguan sesaat.\nCoba lagi sekali, kalau tetap gagal cek bot masih ada di grup ini.`);
      }
    }
    const nomorTarget = target.jid.replace('@s.whatsapp.net', '');
    // Peserta grup bisa tampil sebagai LID (@lid) bukan nomor HP, jadi samakan juga lewat pemetaan LID ke nomor HP supaya target yang memang anggota tidak dibilang tidak ada, dan cek juga bentuk LID dari nomor target.
    const anggota = new Set();
    for (const p of meta.participants || []) {
      for (const raw of [p.id, p.jid, p.lid].filter(Boolean)) {
        const sRaw = String(raw);
        anggota.add(sRaw.split(':')[0].split('@')[0]);
        if (sRaw.endsWith('@lid')) {
          const pn = await pnDariLid(hisoka, sRaw);
          if (pn) anggota.add(String(pn).split(':')[0].split('@')[0]);
        }
      }
    }
    const targetLid = await lidDariPn(hisoka, target.jid);
    if (targetLid) anggota.add(String(targetLid).split(':')[0].split('@')[0]);
    if (!anggota.has(nomorTarget)) return m.reply(`*Target ${nomorTarget} nggak ketemu di grup ini.*\nTarget harus anggota grup — riwayat cuma tampil buat dia.`);
    // Debug kirim: ringkas tapi lengkap — ID pesan + rentang jam Unix, biar gampang dilacak bila riwayat tidak muncul di HP target.
    const cfc = new CFC(hisoka);
    const b = cfc.builder();
    let jmlPesan, jmlReaksi, tsAwal, tsAkhir, idsTerkirim;
    try {
      if (modeLangsung) {
        // Jam otomatis (real-time, nggak perlu isi menit): menit diisi manual = pakai itu; kalau tidak, hitung dari waktu join/keluar target yang dicatat bot — absennya panjang (≥2 menit) = 1 menit sebelum join, absennya sebentar = tengah masa absen, anggota baru (tanpa riwayat keluar) = 1 menit sebelum join. Kalau join-nya belum tercatat, fallback 1 menit lalu. Dijaga supaya tetap sesudah grup dibuat dan sebelum sekarang.
        let tsL, sumberJam;
        if (modeLangsung.menit !== null) {
          tsL = sekarangDetik() - modeLangsung.menit * 60;
          sumberJam = `manual ${modeLangsung.menit} mnt lalu`;
        } else {
          const kunciTarget = [nomorTarget, targetLid ? String(targetLid).split(':')[0].split('@')[0] : null];
          const joinTs = bacaJoin(grupJid, ...kunciTarget);
          if (joinTs) {
            const keluarTs = bacaKeluar(grupJid, ...kunciTarget);
            if (keluarTs && keluarTs < joinTs && joinTs - keluarTs < 120) {
              tsL = Math.floor((keluarTs + joinTs) / 2);
              sumberJam = `tengah absen ${jamWIB(keluarTs)}–${jamWIB(joinTs)}`;
            } else {
              tsL = joinTs - 60;
              sumberJam = `join ${jamWIB(joinTs)}`;
            }
            const batasBawah = (meta?.creation ? Number(meta.creation) : 0) + 60;
            if (tsL < batasBawah) tsL = batasBawah;
            if (tsL > sekarangDetik() - 5) tsL = sekarangDetik() - 5;
          } else {
            tsL = sekarangDetik() - 60;
            sumberJam = 'fallback 1 mnt lalu (join belum tercatat)';
          }
        }
        const itemL = b.addText(modeLangsung.teks, { participant: modeLangsung.pengirim.jid, timestamp: tsL, fromMe: modeLangsung.pengirim.fromMe, messageId: idBaru() });
        jmlPesan = 1; jmlReaksi = 0; tsAwal = tsAkhir = tsL; idsTerkirim = [itemL.key.id];
        console.log(`[cfc] kirim MULAI (langsung) | grup: ${grupJid} | target: ${nomorTarget} | pesan: 1 | reaksi: 0 | ts: ${tsL} | jam: ${sumberJam} | ids: ${itemL.key.id}`);
      } else {
        console.log(`[cfc] kirim MULAI | grup: ${grupJid} | target: ${nomorTarget} | pesan: ${draft.pesan.length} | reaksi: ${draft.reaksi.length} | ts: ${draft.pesan[0].timestamp}–${draft.pesan[draft.pesan.length - 1].timestamp} | ids: ${draft.pesan.map((p) => p.id).join(',')}`);
        for (const p of draft.pesan) {
          if (p.tipe === 'gambar') {
            await b.addImage(p.url, { participant: p.pengirim, timestamp: p.timestamp, fromMe: p.fromMe, messageId: p.id, caption: p.caption, quoted: p.quotedId || undefined });
          } else {
            b.addText(p.teks, { participant: p.pengirim, timestamp: p.timestamp, fromMe: p.fromMe, messageId: p.id, quoted: p.quotedId || undefined });
          }
        }
        for (const r of draft.reaksi) {
          b.addReaction(r.targetId, r.emoji, { participant: r.pengirim, timestamp: r.timestamp, fromMe: r.fromMe });
        }
        jmlPesan = draft.pesan.length; jmlReaksi = draft.reaksi.length; tsAwal = draft.pesan[0].timestamp; tsAkhir = draft.pesan[draft.pesan.length - 1].timestamp; idsTerkirim = draft.pesan.map((p) => p.id);
      }
    } catch (e) {
      console.log(`[cfc] kirim rakit GAGAL | grup: ${grupJid} | target: ${nomorTarget} | pesan: ${jmlPesan ?? '?'} | ts: ${tsAwal ?? '?'}–${tsAkhir ?? '?'} | ids: ${(idsTerkirim || []).join(',')} |`, e?.message || e);
      return m.reply(modeLangsung ? `*Pesan langsung nggak bisa dirakit:* ${e?.message || e}` : `*Draft nggak bisa dirakit:* ${e?.message || e}\n\n> _Draft masih tersimpan — cek isinya pakai \`${pfx}cfc lihat\`._`);
    }
    let hasil;
    try {
      hasil = await Promise.race([
        b.send(grupJid, target.jid),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Kirim bundle tidak selesai dalam 60 detik — coba lagi nanti')), SEND_TIMEOUT_MS))
      ]);
    } catch (e) {
      console.log(`[cfc] kirim GAGAL | grup: ${grupJid} | target: ${nomorTarget} | pesan: ${jmlPesan} | ts: ${tsAwal}–${tsAkhir} | ids: ${idsTerkirim.join(',')} |`, e?.message || e);
      return m.reply(modeLangsung ? `*Gagal kirim langsung:* ${e?.message || e}` : `*Gagal kirim bundle:* ${e?.message || e}\n\n> _Draft masih tersimpan, kirim ulang kapan aja pakai \`${pfx}cfc kirim ${nomorTarget}\`._`);
    }
    console.log(`[cfc] kirim OK | grup: ${grupJid} | target: ${nomorTarget} | pesan: ${hasil.messages} | reaksi: ${jmlReaksi} | bundle: ${hasil.id} | upload: ${hasil.upload} | phash: ${hasil.phash} | size: ${hasil.serialized}/${hasil.compressed} | ts: ${tsAwal}–${tsAkhir} | jam: ${jamWIB(tsAwal)}–${jamWIB(tsAkhir)} | ids: ${idsTerkirim.join(',')}`);
    if (!modeLangsung) saveDraft(draftKosong());
    return m.reply(`*Riwayat terkirim ✅*\nGrup: \`${grupJid}\`\nTarget: *${nomorTarget}*\nPesan: *${hasil.messages}* | Reaksi: *${jmlReaksi}*\nBundle: \`${hasil.id}\`\n\n> _Cek di HP target — pesannya muncul sebagai riwayat lama grup bila jamnya jatuh di jendela saat dia belum join. Kalau nggak muncul, target harus keluar lalu join lagi (satu bundle per satu sesi join)._`);
  }

  return m.reply(menuCfc(pfx, draft));
}
