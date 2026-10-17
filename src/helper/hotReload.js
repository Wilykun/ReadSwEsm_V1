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
 *  hotReload.js — Hot reload modul tanpa restart
 *  Watch file perubahan, reload ESM dengan cache-busting
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Hot Reload — Reload Modul Tanpa Restart Bot
 *  Pantau perubahan file scraper/handler, reload otomatis
 *  dengan cache-busting ESM — memungkinkan update fitur
 *  tanpa perlu mematikan dan menyalakan bot kembali.
 * ═══════════════════════════════════════════════════════════════
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const DEBOUNCE_MS = 600;

const _handlers = {};
const _watchers = {};
const _debounceTimers = {};
const _reloadCallbacks = {};

// type: 'esm' → reload via ESM import() cache-busting (default)
// lazy: true → watch-only; file tetap di-load lazy via importLazy() di pemanggil,
//   watcher di sini hanya validasi + log saat file berubah (tanpa restart).
// SKIP top-level (diload saat startup, butuh restart): wm, cekauto-cmd, interactive-msg,
//   media-helper, log-cmd, jadibot-cmd, alqolam-helpers, wily-helpers, autosimi-cmd,
//   musikai-cmd, musikai2-cmd, alqanime-cmd, cosplay-cmd, komiktap-cmd, setbrowser-cmd, play-cmd
const WATCHED_FILES = [
    // ── Handler ESM ──────────────────────────────
    { key: 'message',      rel: 'message.js' },
    { key: 'antidelete',   rel: 'SEMUA_FITUR/antidel/antidelete.js' },
    { key: 'antitagsw',    rel: 'SEMUA_FITUR/antitagsw/antitagsw.js' },
    { key: 'antilink',     rel: 'SEMUA_FITUR/antilink/antilink.js' },
    { key: 'antitagbot',   rel: 'SEMUA_FITUR/antitag/antitag.js' },
    { key: 'event',        rel: 'SEMUA_FITUR/event/event.js' },
    { key: 'featureEmoji', rel: 'SEMUA_FITUR/helper/emoji.js' },

    // ── Helper ESM (aman di-reload) ───────────────
    { key: 'utils',        rel: 'src/helper/utils.js' },
    { key: 'inject',       rel: 'src/helper/inject.js' },
    { key: 'text',         rel: 'src/helper/text.js' },
    { key: 'emoji',        rel: 'src/helper/emoji.js' },
    { key: 'telegram',     rel: 'src/helper/telegram.js' },
    { key: 'phoneRegion',  rel: 'src/helper/phoneRegion.js' },
    { key: 'voCache',      rel: 'src/helper/voCache.js' },
    { key: 'cleaner',      rel: 'src/helper/cleaner.js' },
    { key: 'helperIndex',  rel: 'src/helper/index.js' },
    { key: 'socketCompat', rel: 'src/helper/socketCompat.js' },
    { key: 'aiTools',      rel: 'src/helper/aiTools.js' },
    { key: 'aiPrompt',     rel: 'src/helper/aiPrompt.js' },
    { key: 'aiReact',      rel: 'src/helper/aiReact.js' },
    { key: 'jadibotSettings', rel: 'src/helper/jadibotSettings.js' },
    { key: 'swtrack',      rel: 'src/helper/swtrack.js' },
    { key: 'aiPromptFb',   rel: 'src/helper/AiPromptFb.js' },
    { key: 'aiPromptIg',   rel: 'src/helper/AiPromptIg.js' },
    { key: 'aiStickerStory', rel: 'src/helper/aiStickerStory.js' },
    { key: 'gemini',       rel: 'src/helper/gemini.js' },
    { key: 'imageSearch',  rel: 'src/helper/imageSearch.js' },
    { key: 'stickerMap',   rel: 'src/helper/stickerMap.js' },
    { key: 'stickerMemory', rel: 'src/helper/stickerMemory.js' },
    { key: 'userMemory',   rel: 'src/helper/userMemory.js' },
    { key: 'zipParser',    rel: 'src/helper/zipParser.js' },

    // ── Database ESM ─────────────────────────────
    { key: 'botStats',     rel: 'src/db/botStats.js' },
    { key: 'jsondb',       rel: 'src/db/json.js' },
    { key: 'datadb',       rel: 'src/db/datadb.js' },
    { key: 'errorLog',     rel: 'src/db/errorLog.js' },
    { key: 'userDb',       rel: 'src/db/userDb.js' },

    // ── Menu builders ESM ────────────────────────
    { key: 'menuUtama',    rel: 'SEMUA_FITUR/menu/menu_utama.js' },
    { key: 'menuJadibot',  rel: 'SEMUA_FITUR/menu/menu_jadibot.js' },

    // ── CJS lazy-loaded (cache clear on change) ──
    // Info / utilities
    { key: 'info', rel: 'SEMUA_FITUR/info/info.js', lazy: true },
    { key: 'emojiCmd', rel: 'SEMUA_FITUR/info/emoji-cmd.js', lazy: true },
    { key: 'delCmd', rel: 'SEMUA_FITUR/info/del-cmd.js', lazy: true },
    { key: 'delbotCmd', rel: 'SEMUA_FITUR/info/delbot-cmd.js', lazy: true },
    { key: 'memoryCmd', rel: 'SEMUA_FITUR/info/memory-cmd.js', lazy: true },
    { key: 'memori', rel: 'SEMUA_FITUR/info/memori.js', lazy: true },
    { key: 'quoted', rel: 'SEMUA_FITUR/info/quoted.js', lazy: true },
    { key: 'quotedCmd', rel: 'SEMUA_FITUR/info/quoted-cmd.js', lazy: true },
    { key: 'ping', rel: 'SEMUA_FITUR/info/ping.js', lazy: true },
    { key: 'infobolaCmd', rel: 'SEMUA_FITUR/info/infobola-cmd.js', lazy: true },
    { key: 'speedtest', rel: 'SEMUA_FITUR/info/speedtest.js', lazy: true },
    { key: 'ceksize', rel: 'SEMUA_FITUR/info/ceksize.js', lazy: true },
    { key: 'evalCmd', rel: 'SEMUA_FITUR/info/eval-cmd.js', lazy: true },
    { key: 'matiCmd', rel: 'SEMUA_FITUR/info/mati-cmd.js', lazy: true },
    { key: 'cekjidgc', rel: 'SEMUA_FITUR/info/cekjidgc.js', lazy: true },
    { key: 'cekjidgcall', rel: 'SEMUA_FITUR/info/cekjidgcall.js', lazy: true },
    { key: 'cekjidch', rel: 'SEMUA_FITUR/info/cekjidch.js', lazy: true },
    { key: 'getppuser', rel: 'SEMUA_FITUR/info/getppuser-cmd.js', lazy: true },
    // Group
    { key: 'hidetag', rel: 'SEMUA_FITUR/group/hidetag.js', lazy: true },
    { key: 'sematkan', rel: 'SEMUA_FITUR/group/sematkan.js', lazy: true },
    { key: 'jpm', rel: 'SEMUA_FITUR/group/jpm.js', lazy: true },
    { key: 'pushkontakgc', rel: 'SEMUA_FITUR/group/pushkontakgc.js', lazy: true },
    { key: 'ghosttag', rel: 'SEMUA_FITUR/group/ghosttag.js', lazy: true },
    { key: 'sendstatus', rel: 'SEMUA_FITUR/group/sendstatus.js', lazy: true },
    { key: 'setgoodbye', rel: 'SEMUA_FITUR/group/setgoodbye.js', lazy: true },
    { key: 'upswgc', rel: 'SEMUA_FITUR/group/upswgc.js', lazy: true },

    // Jadibot
    { key: 'clearsesi', rel: 'SEMUA_FITUR/jadibot/clearsesi.js', lazy: true },
    { key: 'ceksesi', rel: 'SEMUA_FITUR/jadibot/ceksesi.js', lazy: true },
    { key: 'credsjson', rel: 'SEMUA_FITUR/jadibot/credsjson.js', lazy: true },
    { key: 'listbotCmd', rel: 'SEMUA_FITUR/jadibot/listbot-cmd.js', lazy: true },
    // Setting
    { key: 'anticall', rel: 'SEMUA_FITUR/setting/anticall.js', lazy: true },
    { key: 'aturbrowser', rel: 'SEMUA_FITUR/setting/aturbrowser.js', lazy: true },
    { key: 'autosholat', rel: 'SEMUA_FITUR/setting/autosholat.js', lazy: true },
    { key: 'autotyprec', rel: 'SEMUA_FITUR/setting/autotyprec.js', lazy: true },
    { key: 'botadminCmd', rel: 'SEMUA_FITUR/setting/botadmin-cmd.js', lazy: true },
    { key: 'cekerrorCmd', rel: 'SEMUA_FITUR/setting/cekerror-cmd.js', lazy: true },
    { key: 'ceksetting', rel: 'SEMUA_FITUR/setting/ceksetting.js', lazy: true },
    { key: 'ceksw', rel: 'SEMUA_FITUR/setting/ceksw.js', lazy: true },
    { key: 'online', rel: 'SEMUA_FITUR/setting/online.js', lazy: true },
    { key: 'readchat', rel: 'SEMUA_FITUR/setting/readchat.js', lazy: true },
    { key: 'setlogsw', rel: 'SEMUA_FITUR/setting/setlogsw.js', lazy: true },
    { key: 'diskram', rel: 'SEMUA_FITUR/setting/diskram.js', lazy: true },
    // System
    { key: 'shutdown', rel: 'SEMUA_FITUR/system/shutdown.js', lazy: true },
    { key: 'autocleaner', rel: 'SEMUA_FITUR/system/autocleaner.js', lazy: true },
    { key: 'backup', rel: 'SEMUA_FITUR/system/backup.js', lazy: true },
    { key: 'sessionclnr', rel: 'SEMUA_FITUR/system/sessioncleaner.js', lazy: true },
    { key: 'welcomeCard', rel: 'SEMUA_FITUR/system/welcomeCard.js', lazy: true },
    // Menu
    { key: 'menuCmd', rel: 'SEMUA_FITUR/menu/menu-cmd.js', lazy: true },
    { key: 'menupages', rel: 'SEMUA_FITUR/menu/menupages.js', lazy: true },
    { key: 'menuPages2', rel: 'SEMUA_FITUR/menu/menu-pages2.js', lazy: true },
    // Media
    { key: 'stickerCmd', rel: 'SEMUA_FITUR/media/sticker-cmd.js', lazy: true },
    { key: 'smeme', rel: 'SEMUA_FITUR/media/smeme.js', lazy: true },
    { key: 'wm', rel: 'SEMUA_FITUR/media/wm.js', lazy: true },
    { key: 'toImgCmd', rel: 'SEMUA_FITUR/media/toimg-cmd.js', lazy: true },
    { key: 'getsw', rel: 'SEMUA_FITUR/media/getsw.js', lazy: true },
    { key: 'audioconvert', rel: 'SEMUA_FITUR/media/audioconvert.js', lazy: true },
    { key: 'viewonce', rel: 'SEMUA_FITUR/media/viewonce.js', lazy: true },
    { key: 'anyvoice', rel: 'SEMUA_FITUR/media/anyvoice.js', lazy: true },
    { key: 'ttsLangsFull', rel: 'SEMUA_FITUR/media/tts-langs-full.js', lazy: true },
    // Download
    { key: 'downloader', rel: 'SEMUA_FITUR/download/downloader.js', lazy: true },
    { key: 'hdvid', rel: 'SEMUA_FITUR/download/hdvid.js', lazy: true },
    { key: 'stickerly', rel: 'SEMUA_FITUR/download/stickerly.js', lazy: true },
    { key: 'allunduh', rel: 'SEMUA_FITUR/download/allunduh.js', lazy: true },
    { key: 'facebookDl', rel: 'SEMUA_FITUR/download/facebook-dl.js', lazy: true },
    { key: 'instagramDl', rel: 'SEMUA_FITUR/download/instagram-dl.js', lazy: true },
    { key: 'tiktokDl', rel: 'SEMUA_FITUR/download/tiktok-dl.js', lazy: true },
    { key: 'twitterDl', rel: 'SEMUA_FITUR/download/twitter-dl.js', lazy: true },
    { key: 'youtubeDl', rel: 'SEMUA_FITUR/download/youtube-dl.js', lazy: true },
    // Music
    { key: 'genius', rel: 'SEMUA_FITUR/music/genius.js', lazy: true },
    { key: 'infomusik', rel: 'SEMUA_FITUR/music/infomusik.js', lazy: true },
    { key: 'whatsmusik', rel: 'SEMUA_FITUR/music/whatsmusik.js', lazy: true },
    { key: 'whatgenre', rel: 'SEMUA_FITUR/music/whatgenre.js', lazy: true },
    // Anime
    { key: 'alqanime', rel: 'SEMUA_FITUR/anime/alqanime.js', lazy: true },
    { key: 'alqanimeDl', rel: 'SEMUA_FITUR/anime/alqanime-dl.js', lazy: true },
    { key: 'alqanimeMonitor', rel: 'SEMUA_FITUR/anime/alqanime-monitor.js', lazy: true },
    { key: 'doujindesu', rel: 'SEMUA_FITUR/anime/doujindesu.js', lazy: true },
    { key: 'doujindesuMonitor', rel: 'SEMUA_FITUR/anime/doujindesu-monitor.js', lazy: true },
    { key: 'nekopoi', rel: 'SEMUA_FITUR/anime/nekopoi.js', lazy: true },
    { key: 'nekopoinotif', rel: 'SEMUA_FITUR/anime/nekopoi-monitor.js', lazy: true },
    { key: 'hentaicop', rel: 'SEMUA_FITUR/anime/hentaicop.js', lazy: true },
    { key: 'hentaicopnotif', rel: 'SEMUA_FITUR/anime/hentaicop-monitor.js', lazy: true },
    { key: 'animasu', rel: 'SEMUA_FITUR/anime/animasu.js', lazy: true },
    { key: 'bluearchive', rel: 'SEMUA_FITUR/anime/bluearchive.js', lazy: true },
    { key: 'cosplaytele', rel: 'SEMUA_FITUR/anime/cosplaytele.js', lazy: true },
    { key: 'infowibu', rel: 'SEMUA_FITUR/anime/infowibu.js', lazy: true },
    { key: 'komiktap', rel: 'SEMUA_FITUR/anime/komiktap.js', lazy: true },
    { key: 'kusonime', rel: 'SEMUA_FITUR/anime/kusonime.js', lazy: true },
    { key: 'kusonimePdf', rel: 'SEMUA_FITUR/anime/kusonime-pdf.js', lazy: true },
    { key: 'tenorGif', rel: 'SEMUA_FITUR/anime/tenor-gif.js', lazy: true },
    { key: 'nhentai', rel: 'SEMUA_FITUR/anime/nhentai.js', lazy: true },
    { key: 'hentaidad', rel: 'SEMUA_FITUR/anime/hentaidad.js', lazy: true },
    { key: 'pixiv', rel: 'SEMUA_FITUR/anime/pixiv.js', lazy: true },
    { key: 'pixivr18', rel: 'SEMUA_FITUR/anime/pixivr18.js', lazy: true },
    { key: 'animquote', rel: 'SEMUA_FITUR/anime/animquote.js', lazy: true },
    // AI
    { key: 'imageEdit', rel: 'SEMUA_FITUR/ai/imageEdit.js', lazy: true },
    { key: 'wilycmd', rel: 'SEMUA_FITUR/ai/wilycmd.js', lazy: true },
    { key: 'geminiAi', rel: 'SEMUA_FITUR/ai/gemini.js', lazy: true },
    { key: 'gemmyGemini', rel: 'SEMUA_FITUR/ai/gemmyGemini.js', lazy: true },
    { key: 'iloveimg', rel: 'SEMUA_FITUR/ai/iloveimg.js', lazy: true },
    { key: 'sparkpix', rel: 'SEMUA_FITUR/ai/sparkpix.js', lazy: true },
    // Tools
    { key: 'cuaca', rel: 'SEMUA_FITUR/tools/cuaca.js', lazy: true },
    { key: 'tempmail', rel: 'SEMUA_FITUR/tools/tempmail.js', lazy: true },
    { key: 'tmail', rel: 'SEMUA_FITUR/tools/tmail.js', lazy: true },
    { key: 'cekhp', rel: 'SEMUA_FITUR/tools/cekhp.js', lazy: true },
    { key: 'cekipCmd', rel: 'SEMUA_FITUR/tools/cekip-cmd.js', lazy: true },
    { key: 'cekidff', rel: 'SEMUA_FITUR/tools/cekidff.js', lazy: true },
    { key: 'bandingkanhp', rel: 'SEMUA_FITUR/tools/bandingkanhp.js', lazy: true },
    { key: 'an1game', rel: 'SEMUA_FITUR/tools/an1game.js', lazy: true },
    { key: 'screenshot', rel: 'SEMUA_FITUR/tools/screenshot.js', lazy: true },
    { key: 'telegramTools', rel: 'SEMUA_FITUR/tools/telegram.js', lazy: true },
    { key: 'wilyai', rel: 'SEMUA_FITUR/tools/wilyai.js', lazy: true },
    { key: 'flamingtext', rel: 'SEMUA_FITUR/tools/flamingtext.js', lazy: true },
    { key: 'fontgenerator', rel: 'SEMUA_FITUR/tools/fontgenerator.js', lazy: true },
    { key: 'fontuntik', rel: 'SEMUA_FITUR/tools/fontuntik.js', lazy: true },
    { key: 'waifu', rel: 'SEMUA_FITUR/anime/waifu.js', lazy: true },
    // News
    { key: 'malnews', rel: 'SEMUA_FITUR/news/malnews.js', lazy: true },
    { key: 'tvonenews', rel: 'SEMUA_FITUR/news/tvonenews.js', lazy: true },
    // Reaction / Read
    { key: 'readsw', rel: 'SEMUA_FITUR/readsw/readsw.js', lazy: true },

    // ── Config CJS (dependency file, bukan handler) ──────────────────────────
    { key: 'logswColors', rel: 'src/config/logsw-colors.js', lazy: true },

    // ── SKIP ESM (memegang state/timer aktif) ────
    // crashGuard.js    → handle signal proses, berbahaya
    // hotReload.js     → dirinya sendiri
    // memoryMonitor.js → timer RAM aktif
    // jadibot.js       → sesi aktif user lain
    // authState.js     → pegang creds/session WA di memory
    // browserSwitch.js → manage koneksi socket aktif
    // aiHistory.js     → punya _writeLock promise, bahaya direload saat menulis
    // pm2Metrics.js    → punya _timer setInterval aktif + process.send() IPC

    // ── SKIP top-level (diload saat startup, butuh restart) ─
    // cekauto-cmd.js, interactive-msg.js, media-helper.js,
    // log-cmd.js, jadibot-cmd.js, alqolam-helpers.js, wily-helpers.js,
    // autosimi-cmd.js, musikai-cmd.js, musikai2-cmd.js, alqanime-cmd.js,
    // cosplay-cmd.js, komiktap-cmd.js, setbrowser-cmd.js, play-cmd.js
];

async function loadModule(rel) {
    const abs = path.join(ROOT, rel);
    const url = pathToFileURL(abs).href + `?t=${Date.now()}`;
    try {
        const mod = await import(url);
        return mod.default ?? mod;
    } catch (err) {
        console.error(`\x1b[31m[HotReload] Gagal load '${rel}':\x1b[39m`, err.message);
        return null;
    }
}

function watchFile(rel, key, type = 'esm', lazy = false) {
    const abs = path.join(ROOT, rel);

    if (_watchers[key]) {
        try { _watchers[key].close(); } catch {}
    }

    try {
        _watchers[key] = fs.watch(abs, { persistent: false }, (event) => {
            if (event !== 'change' && event !== 'rename') return;

            clearTimeout(_debounceTimers[key]);
            _debounceTimers[key] = setTimeout(async () => {
                console.log(`\x1b[36m[HotReload] Perubahan ter: ${rel}\x1b[39m`);

                // ESM: reload dengan cache-busting URL (validasi + log).
                // Konsumen lazy (case handler) pakai importLazy yang cek mtime tiap panggil,
                // jadi di sini cukup validasi & catat — tidak perlu push ke _handlers.
                const mod = await loadModule(rel);
                if (mod !== null) {
                    if (!lazy) _handlers[key] = mod;
                    console.log(`\x1b[32m[HotReload] ✓ '${rel}' berhasil di-reload tanpa restart bot!\x1b[39m`);
                } else {
                    console.error(`\x1b[31m[HotReload] ✗ Gagal reload '${rel}', pakai versi lama.\x1b[39m`);
                }
                if (typeof _reloadCallbacks[key] === 'function') {
                    try { await _reloadCallbacks[key](rel); } catch (cbErr) {
                        console.error(`\x1b[31m[HotReload] Callback error for '${key}':\x1b[39m`, cbErr.message);
                    }
                }

                // Sistem plugin: metadata command di-cache pluginLoader — segarkan
                // saat ada file SEMUA_FITUR berubah agar command baru terdeteksi.
                if (rel.startsWith('SEMUA_FITUR/')) {
                    try {
                        const { invalidatePlugins } = await import('./pluginLoader.js');
                        invalidatePlugins();
                    } catch {}
                }

                if (event === 'rename') {
                    watchFile(rel, key, type, lazy);
                }
            }, DEBOUNCE_MS);
        });
    } catch (err) {
        console.error(`\x1b[31m[HotReload] Tidak bisa watch '${rel}':\x1b[39m`, err.message);
    }
}

export async function initHotReload() {
    let ok = 0;
    let fail = 0;
    const failed = [];

    let okLazy = 0;
    for (const { key, rel, lazy = false } of WATCHED_FILES) {
        const abs = path.join(ROOT, rel);
        if (lazy) {
            // Lazy: tidak di-load saat init (tetap lazy via importLazy di pemanggil),
            // cukup pasang watcher untuk validasi + log saat file berubah.
            if (fs.existsSync(abs)) {
                watchFile(rel, key, 'esm', true);
                okLazy++;
            }
            // File tidak ada → skip diam-diam (mungkin fitur opsional)
            continue;
        }
        // ESM: load sekarang + watch
        const mod = await loadModule(rel);
        if (mod !== null) {
            _handlers[key] = mod;
            watchFile(rel, key, 'esm');
            ok++;
        } else {
            failed.push(rel);
            fail++;
        }
    }

    if (fail === 0) {
        console.log(`\x1b[32m→ Reload   :\x1b[39m ${ok} ESM aktif, ${okLazy} lazy watched`);
    } else {
        console.log(`\x1b[33m→ Reload   :\x1b[39m ${ok} ESM aktif, ${okLazy} lazy watched, ${fail} gagal (${failed.join(', ')})`);
    }
}

export function getHandler(key) {
    return _handlers[key];
}

export function onReload(key, callback) {
    _reloadCallbacks[key] = callback;
}

export function stopHotReload() {
    for (const key of Object.keys(_watchers)) {
        try { _watchers[key].close(); } catch {}
        delete _watchers[key];
    }
    for (const key of Object.keys(_debounceTimers)) {
        clearTimeout(_debounceTimers[key]);
        delete _debounceTimers[key];
    }
    console.log('\x1b[33m[HotReload] Semua watcher dihentikan.\x1b[39m');
}
