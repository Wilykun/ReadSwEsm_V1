'use strict';

// readch-cmd.js — Atur auto-reaction postingan channel (owner only). Alur: .readch on → fitur
// NYALA dan tersimpan di config.json, habis itu tiap postingan baru di channel yang bot follow
// langsung di-react otomatis; .readch off → fitur MATI. .readch on <link channel> [emoji] →
// nyalain + follow dan daftarin channel itu. .readch list → status, emoji, dan daftar saluran
// yang bot ikutin (nama diambil realtime dari WhatsApp, data tersimpan di config.json).
// .readch test <link postingan> [emoji] → react sekali buat ngetes. Reaction dikirim setelah
// delay acak 1–20 detik. Emoji cuma 6 resmi (👍 ❤️ 😂 😮 😢 🙏), default acak dari 6 itu.
// Balasan bot pakai format WA lengkap sesuai konteks (tebal, miring, coret, kode, daftar, kutip).

import { CHANNEL_EMOJIS, EMOJI_ACAK, pilihEmoji, resolveChannelJid, namaChannel, buatTampilan, waktuWIB, getAutoReactSetting, getAutoReactChannels, getAutoReactDilihat, tambahChannel, hapusChannel, setAutoReactEnabled, setAutoReactDebug, ensureAutoReactChannels } from '../../src/helper/autoReactChannel.js';

export const command = /^(readch)$/i;
export const tags = ['tools'];
export const help = {
  name: 'readch',
  description: 'Auto-reaction tiap postingan baru di channel/saluran WhatsApp (delay acak 1–20 detik).',
  usage: '.readch on [emoji|acak]\n.readch on <link channel> [emoji|acak]\n.readch off\n.readch off <link channel>\n.readch list\n.readch test <link postingan> [emoji]\n.readch debug on|off',
  example: '.readch on ❤️'
};

const POST_LINK_RE = /whatsapp\.com\/channel\/([A-Za-z0-9]+)\/(\d+)/i;

function emojiValid(em) {
  return em === EMOJI_ACAK || CHANNEL_EMOJIS.includes(em);
}

function emojiLabel(em) {
  return em === EMOJI_ACAK ? 'acak dari 6 emoji resmi' : em;
}

function jamWIB(ts) {
  const d = new Date(Number(ts || 0));
  if (!d.getTime()) return '';
  const p = (n) => String(n).padStart(2, '0');
  const wib = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${p(wib.getUTCDate())}/${p(wib.getUTCMonth() + 1)} ${p(wib.getUTCHours())}:${p(wib.getUTCMinutes())} WIB`;
}

export default async function handler(ctx) {
  const { hisoka, m, query, pfx, isMainBot } = ctx;
  if (!isMainBot || !isMainBot(hisoka)) return;
  if (!m.isOwner) return;
  const args = String(query || '').trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] || 'list').toLowerCase();

  if (sub === 'list') {
    const { enabled, emoji, channels, dilihat } = getAutoReactSetting();
    const semuaJid = [...new Set([...Object.keys(channels), ...Object.keys(dilihat)])];
    const namaMap = {};
    await Promise.all(semuaJid.map(async (jid) => { namaMap[jid] = await namaChannel(hisoka, jid); }));
    const baris = semuaJid.map((jid, i) => {
      const nama = namaMap[jid] ? `*${namaMap[jid]}*\n   ` : '';
      const emojiCh = channels[jid] ? channels[jid].emoji || emoji : emoji;
      const ikut = channels[jid] ? '' : ' — _ikutin dari HP_';
      const lihat = dilihat[jid];
      const terakhir = lihat ? ` — terakhir postingan ${jamWIB(lihat.terakhirPost)} (${lihat.jumlahPost}x)` : ' — _belum ada postingan masuk_';
      return `${i + 1}. ${nama}\`${jid}\` — ${emojiLabel(emojiCh)}${ikut}${terakhir}`;
    });
    return m.reply(`*Auto-React Channel: ${enabled ? 'NYALA ✅' : 'MATI ❌'}*\nEmoji: _${emojiLabel(emoji)}_\nDelay: _acak 1–20 detik_\n\n*Saluran yang bot ikutin (${semuaJid.length}):*\n${baris.length ? baris.join('\n') : 'Belum ada — daftarin pakai `.readch on <link channel>`'}\n\n> _Daftar tersimpan di config.json, nama channel diambil realtime dari WhatsApp._`);
  }

  if (sub === 'test') {
    const post = String(args[1] || '').match(POST_LINK_RE);
    if (!post) return m.reply(`*Itu link profil channel, bukan link postingan.*\nLink postingannya mana, Wily — salin link postingan yang ujungnya ada angka.\nContoh: \`${pfx}readch test https://whatsapp.com/channel/0029xxx/175 ❤️\``);
    const emoji = args[2] || EMOJI_ACAK;
    if (!emojiValid(emoji)) return m.reply(`*Emoji channel cuma 6 ini:*\n👍 ❤️ 😂 😮 😢 🙏 atau \`acak\`\n\nPakai:\n\`${pfx}readch test <link postingan> [emoji|acak]\``);
    const jid = await resolveChannelJid(hisoka, args[1]);
    if (!jid) return m.reply(`*Channel nggak ketemu.*\nLink-nya dicek lagi, Wily — pastikan link channel-nya benar dan channel-nya masih ada.`);
    const serverId = post[2];
    const emojiPakai = pilihEmoji(emoji);
    try {
      try { await hisoka.newsletterFollow(jid); } catch (_) {}
      await hisoka.newsletterReactMessage(jid, serverId, emojiPakai);
      const namaCh = (await namaChannel(hisoka, jid)) || '(nama tidak tersedia)';
      const w = waktuWIB();
      return m.reply(buatTampilan('Reaction Terkirim', [
        ['Channel', namaCh],
        ['', jid],
        ['Postingan', serverId],
        ['Emoji', emojiPakai],
        ['Waktu', w.waktu]
      ]));
    } catch (e) {
      return m.reply(`*Gagal react:* ${e?.message || e}`);
    }
  }

  if (sub === 'on') {
    const target = args[1] || '';
    if (target && emojiValid(target)) {
      setAutoReactEnabled(true, target);
      return m.reply(`*Auto-react NYALA* ✅\nEmoji: _${emojiLabel(target)}_\nDelay: _acak 1–20 detik_\n\n> _Tinggal nunggu postingan di channel yang bot follow, tiap postingan baru bakal ku-react otomatis._`);
    }
    if (target && !/whatsapp\.com\/channel\/|@newsletter$/i.test(target)) return m.reply(`*Emoji channel cuma 6 ini:*\n👍 ❤️ 😂 😮 😢 🙏 atau \`acak\`\n\nPakai:\n\`${pfx}readch on [emoji|acak]\`\n\`${pfx}readch on <link channel> [emoji|acak]\``);
    if (target) {
      const jid = await resolveChannelJid(hisoka, target);
      if (!jid) return m.reply(`*Channel nggak ketemu.*\nLink-nya dicek lagi, Wily — pastikan link channel-nya benar dan channel-nya masih ada.`);
      const emoji = args[2] || '';
      if (emoji && !emojiValid(emoji)) return m.reply(`*Emoji channel cuma 6 ini:*\n👍 ❤️ 😂 😮 😢 🙏 atau \`acak\`\n\nPakai:\n\`${pfx}readch on [emoji|acak]\`\n\`${pfx}readch on <link channel> [emoji|acak]\``);
      setAutoReactEnabled(true, emoji || undefined);
      tambahChannel(jid, emoji || getAutoReactSetting().emoji);
      try { await hisoka.newsletterFollow(jid); } catch (_) {}
      const emojiPakai = emoji || getAutoReactSetting().emoji;
      return m.reply(`*Auto-react NYALA* ✅\nChannel: \`${jid}\`\nEmoji: _${emojiLabel(emojiPakai)}_\nDelay: _acak 1–20 detik_\n\n> _Channel udah ku-follow, tiap postingan barunya bakal ku-react otomatis._`);
    }
    setAutoReactEnabled(true);
    const { emoji } = getAutoReactSetting();
    return m.reply(`*Auto-react NYALA* ✅\nEmoji: _${emojiLabel(emoji)}_\nDelay: _acak 1–20 detik_\n\n> _Tinggal nunggu postingan di channel yang bot follow, tiap postingan baru bakal ku-react otomatis._`);
  }

  if (sub === 'off') {
    const target = args[1] || '';
    if (target) {
      const jid = await resolveChannelJid(hisoka, target);
      if (!jid) return m.reply(`*Channel nggak ketemu.*\nLink-nya dicek lagi, Wily — pastikan link channel-nya benar dan channel-nya masih ada.`);
      if (!hapusChannel(jid)) return m.reply(`Channel \`${jid}\` memang belum terdaftar.`);
      return m.reply(`*Channel dihapus dari daftar follow:*\n~${jid}~\n\n> _Auto-react global tetap seperti sebelumnya._`);
    }
    setAutoReactEnabled(false);
    return m.reply(`*Auto-react MATI* ❌\n\n> _Postingan channel baru nggak bakal ku-react lagi sampai kamu nyalain lagi._\nNyalain lagi: \`${pfx}readch on\``);
  }

  if (sub === 'debug') {
    const arg = (args[1] || '').toLowerCase();
    if (arg === 'on') {
      setAutoReactDebug(true);
      return m.reply(`*Debug .readch NYALA* 🔍\n\n> _Tiap postingan channel yang masuk bakal kukirimin detailnya ke kamu (ID channel + ID pesan + hasil react)._`);
    }
    if (arg === 'off') {
      setAutoReactDebug(false);
      return m.reply(`*Debug .readch MATI* 🔍\n\n> _Detail postingan cuma kucatat di log bot._`);
    }
    const { debug } = getAutoReactSetting();
    return m.reply(`*Debug .readch: ${debug ? 'NYALA 🔍' : 'MATI 🔍'}*\n\nPakai: \`${pfx}readch debug on\` / \`${pfx}readch debug off\``);
  }

  return m.reply(`*Pakainya:*\n\`${pfx}readch on [emoji|acak]\`\n\`${pfx}readch on <link channel> [emoji|acak]\`\n\`${pfx}readch off\`\n\`${pfx}readch off <link channel>\`\n\`${pfx}readch list\`\n\`${pfx}readch test <link postingan> [emoji]\`\n\`${pfx}readch debug on|off\``);
}
