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
 *  menupages.js — Menu pages
 *  Halaman daftar perintah singkat dan kategori fitur bot
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Menu Pages (v1)
 *  Halaman teks menu bot versi pertama — berisi daftar perintah
 *  singkat dan kategori fitur bot yang ditampilkan via .menu,
 *  digunakan sebagai fallback bila menu-pages2 tidak aktif.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

async function handleAllmenu({ hisoka, m, query, loadConfig, logCommand, fs, path }) {
        const cfg      = loadConfig();
        const botReply = cfg.botReply || {};
        const botName  = botReply.botName || 'Wily Bot';
        hisoka.sendMessage(m.from, { react: { text: `⏱️`, key: m.key } });
        const allTeks =
`「 🤖 *AUTO FITUR* 」
typing | recording | online | readsw | ramdisk
telegram | autocleaner | sessioncleaner

「 🛡️ *ANTI FITUR* 」
antidel | antidel private/group/all on/off
antidel sendto self/chat/both
anticall (.ac) | anticall msg/add/del/list
anticallvid (.acv) | anticallvid msg/add/del/list
antitagsw | antitagsw global on/off | antitagsw status/reset

「 💬 *PESAN & STICKER* 」
s/sticker | toimg | tovn | tomp3 | stickerly | stickerpack
rvo | rvo2 | quoted

「 👥 *FITUR GRUP* 」
hidetag (.ht) | ghosttag (.gt)
welcome | goodbye | welgod
listgroup | group
sv [NamaDepan|NamaBelakang] | savekontak/svgc | savekontakstop/svcstop

「 📡 *STATUS & STORY* 」
sw/getsw | upswgc | sendstatus/swgc | readsw

「 📥 *DOWNLOAD* 」
tt | ig | fb | ytmp3 | ytmp4 | play
hd/remini/hdr | hdvid/hdvideo

「 🔍 *INFO & CEK* 」
ping (.p) | info | owner/own
cekhp/spechp/infohp | bandingkan
cekip | cuaca | ba/bluearchive | infobola
genius/carilagu | geniusdetail
whatsmusik/wmusik | infomusik/infolirik
speedtest/speed
pixiv | pixivr18

「 🤖 *AI CHAT* 」
ai/tanya | mymemory | forgetme

「 🎌 *ANIME & MANGA* 」
kusonime/anime | kusonimeupdate
alq/alqanime | alqupdate | alqdl
komik/komiktap | komikinfo | komikget | komikupdate

「 🔞 *KONTEN 18+* 」
nh/nhentai | nhget | nhrand | nhdl | hentaidad
cosplay | cosplayrandom | pixivr18

「 🎙️ *TEXT TO SPEECH* 」
tts

「 🌐 *WEB & TOOLS* 」
ss/screenshot | ssweb/webinfo
tmail/tempmail | tminbox | tmread | tmwait | tmdel

「 🤖 *JADIBOT* 」
jadibot [nomor] [durasi] | upbot [nomor],[durasi] | downbot [nomor],[durasi] | stopbot | listbot | setpairing v1/v2

「 👑 *OWNER ONLY* 」
listowner | addowner | delowner
all | swgrup/statusgroup | infowibu | animasu | tvone | alqanimenotif | nekopoinotif | malnews | ceksw | cekauto | cekauto gc
wily | simi | wilyai on/off | wilyai pm/gc/all | wilyai reset
emoji | emojiadd | emojidel | emojiclear | emojilist | emojidefault | emojicustom
upbot | restart/rebot | backup | ceksesi | clearsesi/cs | eval | bash
ram | ceksize/disksize | autosholat | credsjson
dbstats | sessiondb | listcontact
cekerror | cekerror reset | contact

「 📨 *BROADCAST GRUP* 」
jpm [GID >> pesan | delay] | jpmstop | jpmlist
pushkontakgc [GID | pesan | delay] | pushkontakgcstop

`;
        const imgPath = path.join(process.cwd(), 'image', 'menu1.jpg');
        if (fs.existsSync(imgPath)) {
                await hisoka.sendMessage(m.from, { image: fs.readFileSync(imgPath), caption: allTeks }, { quoted: m });
        } else {
                await hisoka.sendMessage(m.from, { text: allTeks }, { quoted: m });
        }
        logCommand(m, hisoka, 'allmenu');
}

async function handleOwnermenu({ hisoka, m, query, loadConfig, logCommand, fs, path }) {
        const cfg      = loadConfig();
        const botReply = cfg.botReply || {};
        const botName  = botReply.botName || 'Wily Bot';
        hisoka.sendMessage(m.from, { react: { text: `👑`, key: m.key } });
        const ownerTeks =
`🔒 _Khusus pemilik bot_

╭─「 👑 *MANAJEMEN OWNER* 」
│
├➤ *.listowner*
│   _Lihat daftar semua owner bot_
├➤ *.addowner [nomor]*
│   _Tambah owner baru_
╰➤ *.delowner [nomor]*
   _Hapus owner_

╭─「 🤖 *AI & FITUR BOT* 」
│
├➤ *.wily [teks]*  _→ Tanya AI manual_
├➤ *.simi*  _→ AI Simi_
├➤ *.wilyai on/off*
│   _Auto-reply pakai AI_
│   ├ *.wilyai pm/gc/all*  _→ Mode target_
│   ├ *.wilyai replay on/off*
│   ╰ *.wilyai reset*

╭─「 📨 *BROADCAST GRUP* 」
│
├➤ *.jpm [pesan | delay]*
│   _Kirim pesan ke semua GC via pilih menu_
├➤ *.jpm [GID >> pesan | delay]*
│   _Kirim pesan ke satu GC tertentu_
├➤ *.jpmstop*
│   _Stop proses JPM yang sedang berjalan_
├➤ *.jpmlist*
│   _Lihat daftar semua GC yang diikuti bot_
├➤ *.pushkontakgc [GID | pesan | delay]*
│   _Kirim pesan ke semua member GC_
╰➤ *.pushkontakgcstop / .pkgstop*
   _Stop proses push kontak GC yang berjalan_

╭─「 📡 *BROADCAST & STATUS* 」
│
├➤ *.all [teks]*
│   _Tag/broadcast ke semua grup_
├➤ *.swgrup / .statusgroup [reply media]*
│   _Kirim status ke semua grup_
├➤ *.infowibu*
│   _Kirim info wibu otomatis ke grup_
├➤ *.animasu on/off/test/status*
├➤ *.malnews on/off/test/status*
│   _Auto notif episode Sub Indo dari Animasu_
├➤ *.tvone on/off/test/status*
│   _Auto notif berita dari TV One_
├➤ *.alqanimenotif on/off/test/status*
│   _Auto notif episode Sub Indo dari Alqanime_
├➤ *.nekopoinotif on/off/test/status*
│   _Auto notif konten baru NekoPoi (🎌 Hentai · 🎥 2D · 🧊 3D)_
├➤ *.ceksw on/off/reset*
│   _Statistik & tracking story WA kontak_
├➤ *.cekauto*
│   _Cek status semua fitur auto (aktif/nonaktif)_
╰➤ *.cekauto gc*
   _Cek & toggle fitur per-grup ini_

╭─「 🛠️ *TOOLS TEKNIS* 」
│
├➤ *.mati / .shutdown*  _→ Matikan bot sepenuhnya_
├➤ *.restart / .rebot / .rb*  _→ Restart bot_
├➤ *.upbot*  _→ Update & restart bot_
├➤ *.backup*  _→ Backup sesi bot_
├➤ *.ceksesi*  _→ Cek status sesi aktif_
├➤ *.ram*  _→ Cek penggunaan RAM & memori_
├➤ *.ceksize / .disksize*  _→ Cek ukuran folder & disk_
├➤ *.credsjson*  _→ Export sesi ke creds.json_
├➤ *.autosholat on/off/test/status*  _→ Notif jadwal sholat_
├➤ *.eval [kode JS]*  _→ Eksekusi kode_
├➤ *.bash [perintah]*  _→ Eksekusi shell_
├➤ *.dbstats*  _→ Statistik database_
├➤ *.sessiondb*  _→ Info session DB_
├➤ *.listcontact*  _→ Daftar kontak bot_
├➤ *.cekerror*  _→ Log error bot_
├➤ *.cekerror reset*  _→ Reset log error_
╰➤ *.contact*  _→ Info kontak bot_

╭─「 🎨 *EMOJI REAKSI SW* 」
│
├➤ *.emoji*  _→ Tutorial lengkap emoji_
├➤ *.emojiadd 😊,😄*  _→ Tambah emoji single_
├➤ *.emojiadd 😊😄😁*  _→ Tambah emoji gabungan_
├➤ *.emojidel 😊*  _→ Hapus emoji single_
├➤ *.emojidel 1,2*  _→ Hapus emoji gabungan by nomor_
├➤ *.emojilist*  _→ Daftar emoji aktif_
├➤ *.emojidefault*  _→ Pakai emoji bot utama_
├➤ *.emojicustom*  _→ Pakai emoji kamu sendiri_
╰➤ *.emojiclear*  _→ Reset emoji ke awal_

`;
        const imgPath = path.join(process.cwd(), 'image', 'menu1.jpg');
        if (fs.existsSync(imgPath)) {
                await hisoka.sendMessage(m.from, { image: fs.readFileSync(imgPath), caption: ownerTeks }, { quoted: m });
        } else {
                await hisoka.sendMessage(m.from, { text: ownerTeks }, { quoted: m });
        }
        logCommand(m, hisoka, 'ownermenu');
}

export { handleAllmenu, handleOwnermenu };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(allmenu)$/i, tags: ['menu'], help: ['allmenu'], handler: 'handleAllmenu' },
    { command: /^(ownermenu)$/i, tags: ['menu'], help: ['ownermenu'], handler: 'handleOwnermenu' },
];
