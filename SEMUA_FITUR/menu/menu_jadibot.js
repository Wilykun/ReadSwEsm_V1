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
 *  menu_jadibot.js — Builder teks menu sesi jadibot
 *  Hitung command otomatis via countMenuJadibotCmd()
 * ───────────────────────────────
 */
import { getBotVersion } from '../../src/helper/utils.js';

export function getMenuJadibotBody() {
        return `
1. 📌 *UMUM*
• \`.p / .ping\`
• \`.menu\`
────────────────────────
2. ⚙️ *SETTING*
• \`.readsw on/off\`
• \`.readsw true\`
• \`.readsw false\`
• \`.antidel on/off\`
• \`.antidel private on/off\`
• \`.antidel group on/off\`
• \`.antidel sendto self/chat/both\`
• \`.readchat on/off\`
• \`.readchat true/false\`
────────────────────────
3. 💬 *AUTO PRESENCE*
• \`.online on/off\`
• \`.online set [detik]\`
• \`.typing on/off\`
• \`.typing set [detik]\`
• \`.typing private on/off\`
• \`.typing group on/off\`
• \`.recording on/off\`
• \`.recording set [detik]\`
• \`.recording private on/off\`
• \`.recording group on/off\`
────────────────────────
4. 📊 *CEK & INFO*
• \`.ceksetting\`
• \`.ceksw\`
• \`.ceksesi\`
• \`.clearsesi / .cs\`
────────────────────────
5. 🛡️ *ANTI CALL*
• \`.anticall on/off\`
• \`.anticall msg [teks]\`
• \`.anticall add [nomor]\`
• \`.anticall del [nomor]\`
• \`.anticall list\`
────────────────────────
6. 📵 *ANTI CALL VIDEO*
• \`.anticallvid on/off\`
• \`.anticallvid msg [teks]\`
• \`.anticallvid add [nomor]\`
• \`.anticallvid del [nomor]\`
• \`.anticallvid list\`
────────────────────────
7. 👁️ *VIEW ONCE*
• \`.rvo / .viewonce / .vo\`
• \`.rvo2\`
────────────────────────
8. 🗑️ *HAPUS PESAN*
• \`.del / .d\`
• \`.delbot\`
────────────────────────
9. 🎨 *STICKER & GAMBAR*
• \`.sticker / .s\`
• \`.wm / .swm [Pack|Author]\`
• \`.toimg\`
• \`.smeme [teks]\`
• \`.hd / .remini\`
────────────────────────
10. 🔤 *FONT & LOGO*
• \`.font [teks]\`
• \`.fontgen [teks]\`
• \`.fontuntik [teks]\`
• \`.logo [style]|[teks]\`
• \`.logo list\`
────────────────────────
11. 😊 *EMOJI REAKSI SW*
• \`.emoji\`
• \`.emojiadd 😊,😄\`
• \`.emojidel 😊\`
• \`.emojiclear\`
• \`.emojilist\`
• \`.emojidefault\`
• \`.emojicustom\`
────────────────────────
12. 📡 *STATUS & STORY*
• \`.upswgc [caption]\`
────────────────────────
13. 🎌 *ANIME GIF*
• \`.animgif\`
• \`.animgif [kategori]\`
• \`.animgif list\`
────────────────────────
14. 📥 *DOWNLOAD*
• \`.allunduh [link]\`
• \`.tt [link]\`
• \`.ig [link]\`
• \`.fb [link]\`
• \`.twdl [link]\`
• \`.ytmp3 [link]\`
• \`.ytmp4 [link]\`
• \`.play [judul]\``;
}

function countMenuJadibotCmd() {
        const body = getMenuJadibotBody();
        const cmdSet = new Set();
        // Perintah pertama tiap baris bullet (semantik sama seperti sebelumnya).
        const matches = body.matchAll(/^• `\.([a-z0-9]+)/gm);
        for (const m of matches) {
                cmdSet.add(m[1]);
        }
        return cmdSet.size;
}

export const JADIBOT_CMD_COUNT = countMenuJadibotCmd();

export function buildMenuJadibot({ pushName, jadibotNum, juh, jum, jus, masaAktifLine, tglFmt, jamFmt, totalAutoFitur, fiturCount, autoTidakAktif }) {
        const body = getMenuJadibotBody();
        return `🤖 *WILY BOT ${getBotVersion()}*
🤖 *MENU JADIBOT*

👤 *User:* ${pushName}
📱 *Nomor:* +${jadibotNum}
⏱️ *Uptime:* ${juh}j ${jum}m ${jus}d
${masaAktifLine}
📅 *Tanggal:* ${tglFmt}
🕐 *Waktu:* ${jamFmt} WIB
📜 *Total Command:* \`${JADIBOT_CMD_COUNT}\`
🗂️ *Total Fitur Auto:* \`${totalAutoFitur}\`
✅ *Fitur Auto Aktif:* ${fiturCount}
❌ *Fitur Auto Tidak Aktif:* ${autoTidakAktif}
🌐 *Status:* Online 🟢
────────────────────────
${body}
────────────────────────
> _📦 Powered by Wily Bot ${getBotVersion()}_ 🤖`;
}
