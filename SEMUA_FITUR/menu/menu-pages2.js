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
 *  menu-pages2.js — Menu pages v2
 *  Halaman menu lengkap v2 dengan deskripsi detail setiap fitur bot
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Menu Pages v2
 *  Halaman-halaman teks menu bot versi 2 — berisi deskripsi
 *  detail setiap fitur per kategori (Anime, Musik, Download,
 *  Grup, dll) yang ditampilkan saat user request sub-menu.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';
import nodePath from 'path';
import nodeFs from 'fs';

async function _sendMenuMsg(hisoka, m, teks) {
        const imgPath = nodePath.join(process.cwd(), 'image', 'menu1.jpg');
        if (nodeFs.existsSync(imgPath)) {
                await hisoka.sendMessage(m.from, { image: nodeFs.readFileSync(imgPath), caption: teks }, { quoted: m });
        } else {
                await hisoka.sendMessage(m.from, { text: teks }, { quoted: m });
        }
}

async function handleGroupmenu({ hisoka, m, tolak, logCommand, loadConfig }) {
        hisoka.sendMessage(m.from, { react: { text: `👥`, key: m.key } });
        const teks =
`╭─「 👥 *FITUR GRUP* 」
│  _Khusus digunakan di dalam grup_
│
├➤ *.hidetag / .ht [teks]*
│   _Tag semua member tanpa notif_
├➤ *.ghosttag / .gt [teks]*
│   _Tag member tanpa terlihat di chat_
├➤ *.welcome on/off*
│   _Pesan sambutan member baru_
├➤ *.goodbye on/off*
│   _Pesan perpisahan member keluar_
├➤ *.welgod on/off*
│   _Welcome + Goodbye sekaligus_
├➤ *.listgroup*
│   _Daftar semua grup yang diikuti bot_
├➤ *.group*
│   _Info lengkap grup saat ini_
│
├➤ *.sv [NamaDepan] / .sv [NamaDepan|NamaBelakang]*
│   _Simpan kontak — reply/tag orang atau ketik nomor_
│   _Nama belakang opsional, cukup nama depan saja_
├➤ *.savekontak / .svgc*
│   _Scrape semua nomor member GC → kirim ke DM kamu_
╰➤ *.savekontakstop / .svcstop*
   _Stop proses scrape kontak yang sedang berjalan_

╭─「 💬 *PESAN & STICKER* 」
│
├➤ *.s / .sticker*
│   _Buat sticker dari gambar/video_
├➤ *.toimg*
│   _Konversi sticker jadi gambar_
├➤ *.stickerly [query/link]*
│   _Cari & download sticker_
├➤ *.stickerpack [query]*
│   _Download satu pack sticker_
├➤ *.stickerai [prompt]*
│   _Buat sticker dari prompt AI_
├➤ *.rvo / .viewonce*
│   _Buka pesan sekali lihat (kirim ke chat asal)_
├➤ *.rvo2*
│   _Buka pesan sekali lihat (kirim ke DM bot sendiri)_
├➤ *.quoted / .q*
│   _Ambil pesan yang di-reply_

`;
        await _sendMenuMsg(hisoka, m, teks);
        logCommand(m, hisoka, 'groupmenu');
}

async function handleDownloadmenu({ hisoka, m, tolak, logCommand, loadConfig }) {
        hisoka.sendMessage(m.from, { react: { text: `📥`, key: m.key } });
        const teks =
`╭─「 📥 *SOSMED & MUSIK* 」
│
├➤ *.allunduh [link]*
│   _Download dari semua platform otomatis_
│   _(IG, TikTok, YT, FB, Twitter, Pinterest)_
├➤ *.tt [link]*
│   _Download video/audio TikTok_
├➤ *.ig [link]*
│   _Download reels/foto Instagram_
├➤ *.fb [link]*
│   _Download video Facebook_
├➤ *.twdl [link]*
│   _Download video/foto Twitter (X)_
├➤ *.ytmp3 [link]*
│   _YouTube → MP3 audio_
├➤ *.ytmp4 [link]*
│   _YouTube → MP4 video_
╰➤ *.play [judul]*
   _Cari & download lagu otomatis_

╭─「 🖼️ *PERJELAS MEDIA* 」
│
├➤ *.hd / .remini / .hdr [reply foto]*
│   _Perjelas & enhance foto blur_
╰➤ *.hdvid / .hdvideo [reply video]*
   _Perjelas video blur/buram_

╭─「 🎌 *ANIME & MANGA* 」
│
├➤ *.kusonime / .anime [judul]*
│   _Cari info & download anime_
├➤ *.kusonimeupdate*
│   _Update anime terbaru_
├➤ *.alq / .alqanime [judul]*
│   _Cari anime dari AlqAnime_
├➤ *.alqupdate*
│   _Update AlqAnime terbaru_
├➤ *.alqdl [link]*
│   _Download anime dari AlqAnime_
├➤ *.komik / .komiktap [judul]*
│   _Cari manga/komik_
├➤ *.komikinfo [url]*
│   _Detail info komik dari URL_
├➤ *.komikget [url chapter]*
│   _Baca/download chapter komik_
╰➤ *.komikupdate*
   _Update komik/manga terbaru_

`;
        await _sendMenuMsg(hisoka, m, teks);
        logCommand(m, hisoka, 'downloadmenu');
}

async function handleSettingmenu({ hisoka, m, tolak, logCommand, loadConfig }) {
        hisoka.sendMessage(m.from, { react: { text: `⚙️`, key: m.key } });
        const teks =
`╭─「 🤖 *AUTO FITUR* 」
│  _Aktif otomatis, tanpa perintah ulang_
│
├➤ *.typing on/off*
│   _Efek sedang mengetik_
├➤ *.recording on/off*
│   _Efek sedang merekam suara_
├➤ *.online on/off*
│   _Bot selalu tampil online_
├➤ *.readsw on/off*
│   _Auto baca & kasih reaksi ke story_
├➤ *.ramdisk on/off*
│   _Monitor penggunaan RAM & Disk bot_
├➤ *.telegram on/off*
│   _Forward pesan/story ke Telegram_
├➤ *.autocleaner on/off*
│   _Bersihkan file temp secara berkala_
╰➤ *.sessioncleaner on/off*
   _Bersihkan sesi stale secara berkala_

╭─「 🛡️ *ANTI FITUR* 」
│
├➤ *.antidel on/off*  _(.ad)_
│   _Tangkap & simpan pesan dihapus_
│   ├ *.antidel private on/off*
│   ├ *.antidel group on/off*
│   ├ *.antidel all on/off*
│   ╰ *.antidel sendto self/chat/both*
│
├➤ *.anticall on/off*  _(.ac)_
│   _Tolak otomatis panggilan suara_
│   ├ *.anticall msg [teks]*
│   ├ *.anticall add/del [nomor]*
│   ╰ *.anticall list*
│
├➤ *.anticallvid on/off*  _(.acv)_
│   _Tolak otomatis panggilan video_
│   ├ *.anticallvid msg [teks]*
│   ├ *.anticallvid add/del [nomor]*
│   ╰ *.anticallvid list*
│
╰➤ *.antitagsw on/off*  _[khusus grup]_
   _Blokir tag spam di story_
   ├ *.antitagsw global on/off*
   ├ *.antitagsw status*
   ╰ *.antitagsw reset*

`;
        await _sendMenuMsg(hisoka, m, teks);
        logCommand(m, hisoka, 'settingmenu');
}

async function handleStatusmenu({ hisoka, m, tolak, logCommand, loadConfig }) {
        hisoka.sendMessage(m.from, { react: { text: `📡`, key: m.key } });
        const teks =
`╭─「 📡 *STATUS & STORY* 」
│
├➤ *.sw / .getsw*
│   _Reply story kontak → ambil medianya_
├➤ *.upswgc [caption]*
│   _Upload story ke semua grup_
├➤ *.sendstatus / .swgc [reply media]*
│   _Kirim status ke kontak/grup_
├➤ *.readsw on/off*
│   _Auto baca & reaksi story kontak_
├➤ *.ceksw on/off/reset*
│   _Statistik & tracking story WA kontak_
├➤ *.cekauto*
│   _Cek status semua fitur auto (aktif/nonaktif)_
╰➤ *.cekauto gc*
   _Cek & toggle fitur per-grup ini_

╭─「 🛡️ *ANTI TAG STORY* 」
│  _Khusus admin & owner grup_
│
├➤ *.antitagsw on/off*
│   _Aktifkan/nonaktifkan di grup ini_
├➤ *.antitagsw global on/off*
│   _Aktifkan/nonaktifkan di semua grup_
├➤ *.antitagsw status*
│   _Cek status antitagsw grup ini_
╰➤ *.antitagsw reset*
   _Reset setting antitagsw grup ini_

`;
        await _sendMenuMsg(hisoka, m, teks);
        logCommand(m, hisoka, 'statusmenu');
}

export { handleGroupmenu, handleDownloadmenu, handleSettingmenu, handleStatusmenu };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(settingmenu)$/i, tags: ['menu'], help: ['settingmenu'], handler: 'handleSettingmenu' },
    { command: /^(groupmenu)$/i, tags: ['menu'], help: ['groupmenu'], handler: 'handleGroupmenu' },
    { command: /^(statusmenu)$/i, tags: ['menu'], help: ['statusmenu'], handler: 'handleStatusmenu' },
    { command: /^(downloadmenu)$/i, tags: ['menu'], help: ['downloadmenu'], handler: 'handleDownloadmenu' },
];
