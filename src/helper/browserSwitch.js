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
 *  browserSwitch.js — Switch label browser bot
 *  Ganti Chrome/Firefox/Edge tanpa hapus session lama
 * ───────────────────────────────
 */
/**
 * ─────────────────────────────────────
 *  Browser Switch Helper
 *  Ganti browser tanpa hapus session lama dulu.
 *
 *  Logika:
 *  - BOT_NUMBER_PAIR diisi → pairing code dikirim ke chat WA
 *  - BOT_NUMBER_PAIR kosong → QR code (gambar) dikirim ke chat WA
 *
 *  Urutan: buka koneksi baru (bot lama tetap aktif) →
 *          kirim pairing code / QR via bot lama →
 *          setelah terhubung, hapus session lama → restart.
 *
 *  PENTING: Baileys TIDAK auto-reconnect setelah 515 (restartRequired).
 *  Kita harus buat socket baru manual via createAndConnect() rekursif.
 * ─────────────────────────────────────
 */
import {
    default as makeWASocket,
    delay,
    fetchLatestBaileysVersion,
    generateWAMessageFromContent,
} from '@whiskeysockets/baileys';

// Error code fatal yang langsung abort tanpa coba reconnect
const FATAL_CODES = new Set([
    401, // loggedOut
    403, // forbidden
    405, // connectionReplaced / takeover
    440, // connectionReplaced (versi lain)
    442, // sessionExpired
]);

import fs from 'fs';
import path from 'path';
import { importLazy } from './esmLazy.js';
import pino from 'pino';
import QRCode from 'qrcode';
import { useSingleFileAuthState } from './authState.js';
import { loadConfig, saveConfig } from './utils.js';
import { BROWSER_LIST } from '../../name_perangkat_tertautan.js';
import { getProxyAgents } from './proxyAgent.js'; // proxy egress — socket utama (index.js) sudah pakai ini; tanpa ini direct wss kena EPROTO 'wrong version number'

const silentLogger = pino({ level: 'silent' });

/**
 * Kirim interactive message dengan tombol "Copy" satu klik.
 * Saat user tap tombol, teks `copyCode` otomatis tersalin ke clipboard WA.
 */
async function sendCopyButton(sock, jid, title, body, footer, copyCode, copyLabel) {
    try {
        // Buat content baru pada setiap tahap. Pesan final me-reply pesan
        // sementara miliknya sendiri, seperti Button.selfReply(), tanpa
        // mengirim pesan sementara tersebut ke WhatsApp.
        const makeContent = () => ({
            interactiveMessage: {
                body:   { text: body },
                footer: { text: footer },
                header: { title, subtitle: '', hasMediaAttachment: false },
                contextInfo: {},
                nativeFlowMessage: {
                    messageParamsJson: JSON.stringify({}),
                    buttons: [{
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: copyLabel,
                            copy_code:    copyCode,
                            id:           'copy_pairing_code'
                        })
                    }]
                }
            }
        });
        const messageOptions = { userJid: sock.user?.id };
        const selfReplyMessage = generateWAMessageFromContent(
            jid,
            makeContent(),
            messageOptions
        );
        const msg = generateWAMessageFromContent(
            jid,
            makeContent(),
            {
                ...messageOptions,
                quoted: selfReplyMessage,
                messageId: selfReplyMessage.key.id,
            }
        );
        await sock.relayMessage(msg.key.remoteJid, msg.message, {
            messageId: msg.key.id,
            additionalNodes: [{
                tag:  'biz',
                attrs: {},
                content: [{
                    tag:  'interactive',
                    attrs: { type: 'native_flow', v: '1' },
                    content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                }]
            }]
        });
    } catch (_) {}
}

function fmtPairingCode(code) {
    if (!code) return '';
    const clean = String(code).replace(/[-\s]/g, '').toUpperCase();
    return clean.match(/.{1,4}/g)?.join('-') || code;
}

async function generateQRBuffer(qrData) {
    return QRCode.toBuffer(qrData, {
        type: 'png',
        width: 512,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
    });
}

/**
 * Mulai koneksi baru dengan browser baru tanpa hapus session lama.
 *
 * @param {object}   hisoka        - Socket bot utama yang masih aktif
 * @param {string[]} browserVal    - Array browser: ['Ubuntu','Chrome','22.04.4']
 * @param {string}   from          - JID chat tujuan notifikasi
 * @param {function} editFn        - Edit pesan status (async txt => void)
 * @param {string}   newBrowserKey - Key browser baru (misal 'v1') untuk disimpan ke config SETELAH sukses
 */
export async function startBrowserSwitch(hisoka, browserVal, from, editFn, newBrowserKey = 'v1') {
    const sessionName = process.env.BOT_SESSION_NAME || 'hisoka';
    const mainFile    = path.join(process.cwd(), 'sessions', sessionName + '.json');
    const mainDir     = global.sessionDir || path.join(process.cwd(), 'sessions', sessionName);
    const tempFile    = path.join(process.cwd(), 'sessions', sessionName + '_switching.json');
    const tempDir     = path.join(process.cwd(), 'sessions', sessionName + '_switching');

    // Ambil nomor pairing: BOT_NUMBER_PAIR → fallback ke config.botNumber
    const _bsCfg = loadConfig();
    const botNum = (process.env.BOT_NUMBER_PAIR || _bsCfg.botNumber || '').replace(/[^0-9]/g, '');
    const usePairingCode = botNum.length > 0;

    // Tangkap browser LAMA sebelum switch — untuk ditampilkan di pesan sukses
    const _oldKey   = (global.__activeBrowserKey || _bsCfg.pairedBrowserKey || _bsCfg.browserDevice?.selected || 'v1').toLowerCase();
    const _oldInfo  = BROWSER_LIST.find(b => b.key === _oldKey);
    const _oldLabel = _oldInfo ? `${_oldInfo.label} (${_oldKey.toUpperCase()})` : (Array.isArray(global.__activeBrowserArr) ? global.__activeBrowserArr.join(' | ') : 'Browser lama');
    // Browser baru — label untuk pesan sukses
    const _newKey   = newBrowserKey.toLowerCase();
    const _newInfo  = BROWSER_LIST.find(b => b.key === _newKey);
    const _newLabel = _newInfo ? `${_newInfo.label} (${_newKey.toUpperCase()})` : browserVal.join(' | ');

    // Bersihkan temp session sebelumnya jika ada
    try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
    try { await fs.promises.unlink(tempFile); } catch {}

    // Cache versi Baileys (tidak perlu fetch ulang di setiap reconnect)
    const { version } = await fetchLatestBaileysVersion();

    // ── Shared state lintas iterasi socket ──
    let pairingRequested = false;
    let qrSent           = false;
    let switched         = false;
    let reconnectCount   = 0;
    const MAX_RECONNECT  = 10;
    let currentSock      = null;
    let _stopFlush       = null;
    let _flushImmediate  = null;

    const cleanup = async () => {
        try { currentSock?.ev?.removeAllListeners(); currentSock?.ws?.close(); } catch {}
        try { await fs.promises.rm(tempDir,  { recursive: true, force: true }); } catch {}
        try { await fs.promises.unlink(tempFile); } catch {}
    };

    // ── Timeout 5 menit ──
    const abortTimer = setTimeout(async () => {
        if (switched) return;
        console.log('[BrowserSwitch] Timeout 5 menit — abort');
        await cleanup();
        await hisoka.sendMessage(from, {
            text:
                `⏰ *Timeout Ganti Browser!*\n\n` +
                `Proses koneksi tidak selesai dalam 5 menit.\n` +
                `Bot tetap menggunakan browser lama.\n\n` +
                `Coba lagi dengan *.aturbrowser*`
        }).catch(() => {});
    }, 5 * 60 * 1000);

    // ────────────────────────────────────────────────────────────────
    //  createAndConnect — membuat socket baru dan attach semua listener.
    //  Dipanggil rekursif setelah setiap close non-fatal untuk reconnect.
    // ────────────────────────────────────────────────────────────────
    async function createAndConnect() {
        if (switched) return;

        // Baca creds terbaru dari tempFile (di iterasi 2+, berisi paired creds)
        const { state, saveCreds, stopFlush, flushImmediate } = await useSingleFileAuthState(tempFile);
        _stopFlush      = stopFlush;
        _flushImmediate = flushImmediate;

        const sock = makeWASocket({
            version,
            auth:   { creds: state.creds, keys: state.keys },
            ...getProxyAgents(), // WAJIB di VM: tanpa ini direct wss ke WA gagal TLS EPROTO (sim 20 Nov: 33/33 socket 408)
            logger: silentLogger,
            printQRInTerminal: false,
            browser: browserVal,
            keepAliveIntervalMs:   30000,
            connectTimeoutMs:      60000,
            defaultQueryTimeoutMs: 60000,
        });

        currentSock = sock;
        sock.ev.on('creds.update', saveCreds);

        console.log(`[BrowserSwitch] createAndConnect #${reconnectCount} | registered: ${!!state.creds?.registered} | usePairingCode: ${usePairingCode}`);

        // ── Request pairing code: hanya bila socket sudah OPEN ──
        // Perbaikan 20 Nov (insiden 'Connection Closed'): delay tetap 1500ms
        // sering menembak saat socket masih connecting / sudah 408 — request
        // langsung lempar 'Connection Closed' lalu abort. Sekarang: tunggu
        // 5 detik, cek WS OPEN dulu; bila belum open, diam saja — reconnect
        // akan coba socket baru (jangan abort, jangan kirim error).
        // Gate HARUS .isOpen: sock.ws adalah WebSocketClient Baileys yang
        // TIDAK punya .readyState (selalu undefined) — cek readyState lama
        // membuat request TIDAK PERNAH jalan (ketahuan di sim 20 Nov).
        if (usePairingCode && !state.creds?.registered && !pairingRequested && !switched) {
            delay(5000).then(async () => {
                if (pairingRequested || switched) return;
                if (!sock.ws?.isOpen) return;
                pairingRequested = true;
                try {
                    // Selalu pakai kode RANDOM (undefined) saat switching.
                    // Custom code (config.pairingCode) sudah dipakai di sesi utama
                    // dan tidak bisa dipakai ulang — WA akan tolak ("Gagal menautkan").
                    const code = await sock.requestPairingCode(botNum, undefined);
                    const fmt  = fmtPairingCode(code);

                    // Kirim 1 pesan saja: instruksi lengkap + tombol copy sekaligus
                    await sendCopyButton(
                        hisoka,
                        from,
                        `🔑 PAIRING CODE BARU — ${_newLabel}`,
                        `╔══════════════════════════╗\n` +
                        `║  🔑  *PAIRING CODE BARU*  🔑  ║\n` +
                        `╚══════════════════════════╝\n\n` +
                        `🖥️ *Browser:* ${_newLabel}\n\n` +
                        `┌──────────────────────┐\n` +
                        `│      *${fmt}*      │\n` +
                        `└──────────────────────┘\n\n` +
                        `📋 *Cara masukkan kode:*\n` +
                        `1️⃣ Buka WhatsApp di HP\n` +
                        `2️⃣ Ketuk ⋮ → *Perangkat Tertaut*\n` +
                        `3️⃣ Ketuk *Tautkan Perangkat*\n` +
                        `4️⃣ Pilih *Tautkan dengan nomor telepon*\n` +
                        `5️⃣ Masukkan kode:\n\n` +
                        `\`\`\`${fmt}\`\`\`\n\n` +
                        `⏳ *Kode berlaku 3 menit*\n` +
                        `🔄 Bot lama tetap aktif sampai kode dimasukkan.\n\n` +
                        `👇 *Tap tombol di bawah untuk salin kode otomatis:*`,
                        `🖥️ ${_newLabel} • ⏳ Berlaku 3 menit`,
                        fmt,
                        `📋 Copy Pairing Code  ${fmt}`
                    );
                    await editFn(
                        `📲 *Pairing code sudah dikirim ke chat ini!*\n\n` +
                        `🖥️ Browser: *${_newLabel}*\n\n` +
                        `⏳ Masukkan kode dalam *3 menit*.\n` +
                        `Bot lama tetap berjalan normal.\n\n` +
                        `💡 Tap tombol *📋 Copy* di pesan berikutnya\n` +
                        `untuk menyalin kode secara otomatis.`
                    ).catch(() => {});
                } catch (e) {
                    const msg = String(e?.message || e);
                    // Socket keburu mati saat request — bukan error fatal:
                    // reset flag supaya socket reconnect berikutnya bisa coba lagi.
                    if (/connection closed|408/i.test(msg)) {
                        pairingRequested = false;
                        console.log('[BrowserSwitch] requestPairingCode kena Connection Closed — coba lagi di socket berikutnya');
                        return;
                    }
                    clearTimeout(abortTimer);
                    await cleanup();
                    await hisoka.sendMessage(from, {
                        text: `❌ *Gagal mendapat pairing code!*\n\n${e?.message || e}`
                    }).catch(() => {});
                    await editFn(`❌ *Gagal mendapat pairing code!*\n\n${e?.message || e}`).catch(() => {});
                }
            }).catch(() => {});
        }

        // ── Event handler ──
        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (switched && connection !== 'open') return;

            const reason = lastDisconnect?.error?.output?.statusCode;
            if (connection) console.log(`[BrowserSwitch] ${connection} | reason: ${reason || '-'} | reconnect#: ${reconnectCount} | registered: ${!!state.creds?.registered}`);

            // ── QR CODE (jika tidak pakai nomor) ──
            if (qr && !usePairingCode && !qrSent && !switched) {
                qrSent = true;
                try {
                    const qrBuf = await generateQRBuffer(qr);
                    await hisoka.sendMessage(from, {
                        image: qrBuf,
                        caption:
                            `╔══════════════════════════╗\n` +
                            `║  📷  *QR CODE BARU*  📷  ║\n` +
                            `╚══════════════════════════╝\n\n` +
                            `🖥️ *Browser:* ${browserVal.join(' | ')}\n\n` +
                            `📋 *Cara scan QR:*\n` +
                            `1️⃣ Buka WhatsApp di HP\n` +
                            `2️⃣ Ketuk ⋮ → *Perangkat Tertaut*\n` +
                            `3️⃣ Ketuk *Tautkan Perangkat*\n` +
                            `4️⃣ Arahkan kamera ke QR di atas\n\n` +
                            `⏳ *QR berlaku ~60 detik* — kalau expired, bot kirim QR baru otomatis.\n` +
                            `🔄 Bot lama tetap aktif sampai QR di-scan.`,
                    });
                    await editFn(
                        `📷 *QR Code sudah dikirim ke chat ini!*\n\n` +
                        `🖥️ Browser: *${browserVal.join(' | ')}*\n\n` +
                        `⏳ Scan QR dalam *60 detik*.\n` +
                        `Bot lama tetap berjalan normal.\n\n` +
                        `_Kalau QR expired, bot kirim QR baru otomatis._`
                    );
                } catch (e) {
                    await hisoka.sendMessage(from, {
                        text: `❌ *Gagal kirim QR Code!*\n\n${e?.message || e}`
                    }).catch(() => {});
                }
                return;
            }

            // QR expired → kirim ulang
            if (qr && !usePairingCode && qrSent && !switched) {
                qrSent = false;
                try {
                    const qrBuf = await generateQRBuffer(qr);
                    await hisoka.sendMessage(from, {
                        image: qrBuf,
                        caption:
                            `🔄 *QR Code diperbarui!*\n\n` +
                            `🖥️ *Browser:* ${browserVal.join(' | ')}\n` +
                            `⏳ Scan sebelum expired.`
                    });
                    qrSent = true;
                } catch {}
                return;
            }

            // ── OPEN: koneksi baru berhasil ──
            if (connection === 'open' && !switched) {
                switched = true;
                clearTimeout(abortTimer);

                // Step 1: Baileys emit creds.update (registered, me, account, dll) SETELAH
                // connection.update {open} — bukan sebelum. Jika kita flush langsung di sini,
                // state.creds masih belum lengkap (registered: false, me: undefined).
                //
                // Fix Bug A – Delay adaptif:
                //   Poll hingga creds.me + creds.account terisi (maks 5000ms), lalu
                //   tambahkan 300ms grace period. Ini lebih andal dari delay tetap 800ms
                //   yang bisa terlalu pendek pada perangkat baru.
                //
                // Fix Bug B – Race condition post-rename:
                //   _stopFlush() sekarang menyetel flag _sealed = true di authState,
                //   sehingga setiap scheduleFlush() berikutnya (dari creds.update yang
                //   masih di queue) jadi no-op. _flushImmediate() adalah flush FINAL
                //   ke tempFile. Setelah ini tidak ada flush baru yang bisa berjalan
                //   dan menimpa hisoka.json setelah rename.
                try {
                    if (state?.creds && !state.creds.registered) {
                        state.creds.registered = true;
                    }
                } catch {}

                // Tunggu creds.me dan creds.account terisi dari Baileys (maks 5000ms).
                // Untuk perangkat baru, Baileys emit creds.update dengan me + account
                // SETELAH connection.update {open} — durasi bisa >800ms di kondisi tertentu.
                // Polling lebih andal daripada delay tetap.
                {
                    const POLL_INTERVAL = 100;
                    const MAX_WAIT_MS   = 5000;
                    let waited = 0;
                    while ((!state.creds?.me || !state.creds?.account) && waited < MAX_WAIT_MS) {
                        await delay(POLL_INTERVAL);
                        waited += POLL_INTERVAL;
                    }
                    // Tambahkan 300ms grace period agar debounce flush terakhir sempat fire
                    // dan creds.update lain yang menyusul masuk ke state sebelum kita seal.
                    await delay(300);
                }

                // Seal flush: setelah ini scheduleFlush() jadi no-op,
                // sehingga creds.update yang masih di queue tidak bisa schedule flush baru
                // dan overwrite file setelah rename.
                try { if (_stopFlush) _stopFlush(); } catch {}
                try { if (_flushImmediate) await _flushImmediate(); } catch {}
                try { sock.ev.removeAllListeners(); } catch {}

                // Step 2: Kirim pesan sukses SEBELUM main bot di-terminate.
                // (setelah terminate, hisoka.sendMessage tidak bisa dipakai)
                await hisoka.sendMessage(from, {
                    text:
                        `╔══════════════════════════════╗\n` +
                        `║  ✅  *BROWSER BERHASIL DIGANTI!*  ✅  ║\n` +
                        `╚══════════════════════════════╝\n\n` +
                        `🟢 *Koneksi baru berhasil terhubung!*\n\n` +
                        `🔄 *Pergantian Browser:*\n` +
                        `❌ Lama : *${_oldLabel}*\n` +
                        `✅ Baru  : *${_newLabel}*\n\n` +
                        `🗑️ Session lama (*${_oldKey.toUpperCase()}*) otomatis dihapus.\n` +
                        `📲 Perangkat tertaut di WA kamu sekarang: *${_newInfo?.label || _newLabel}*\n\n` +
                        `⚠️ *Catatan:*\n` +
                        `Jika perangkat lama (*${_oldLabel}*) masih muncul\n` +
                        `di daftar Perangkat Tertaut WA kamu,\n` +
                        `silakan hapus manual:\n` +
                        `📱 WA → ⋮ → *Perangkat Tertaut*\n` +
                        `→ Tekan lama perangkat lama → *Keluar*\n\n` +
                        `🔄 *Bot restart dalam 3 detik...*`
                }).catch(() => {});

                await delay(1000); // beri waktu pesan terkirim sebelum socket dimatikan

                // Step 3: Stop main bot dari nulis ke session file.
                // Race condition: main bot bisa terima creds.update SETELAH rename
                // dan overwrite session baru dengan kredensial lama → 401 saat restart.
                // Solusi: hapus listener + terminate SEBELUM rename, tunggu pending flush selesai.
                // Juga hentikan flush timer main bot agar tidak race condition dengan instance baru.
                try { hisoka.ev.removeAllListeners(); } catch {}
                try { if (typeof global.__mainBotStopFlush === 'function') { global.__mainBotStopFlush(); global.__mainBotStopFlush = null; } } catch {}
                try { hisoka.ws?.terminate?.(); } catch {}
                await delay(500); // tunggu pending scheduleFlush (300ms debounce) selesai ke disk

                // Step 4: Simpan config + rename session files.
                try {
                    const _cfgNow = loadConfig();
                    _cfgNow.browserDevice  = { selected: newBrowserKey };
                    _cfgNow.pairedBrowserKey = newBrowserKey.toLowerCase();
                    saveConfig(_cfgNow);
                    global.__activeBrowserKey = newBrowserKey.toLowerCase();
                    global.__activeBrowserArr = browserVal;
                } catch {}

                let renameOk = false;
                try {
                    await fs.promises.rm(mainDir,  { recursive: true, force: true }).catch(() => {});
                    await fs.promises.unlink(mainFile).catch(() => {});
                    try {
                        await fs.promises.rename(tempFile, mainFile);
                        renameOk = true;
                        console.log('[BrowserSwitch] Session berhasil diganti: ' + path.basename(tempFile) + ' → ' + path.basename(mainFile));
                    } catch (re) {
                        console.error('[BrowserSwitch] Gagal rename tempFile → mainFile:', re?.message);
                    }
                    try { await fs.promises.rename(tempDir, mainDir); } catch {}
                } catch (e) {
                    console.error('[BrowserSwitch] Gagal rename session:', e?.message);
                } finally {
                    // Tunggu 400ms — jika ada flush pending yang recreate tempFile setelah rename, hapus sekarang
                    await delay(400);
                    try { if (fs.existsSync(tempFile)) { await fs.promises.unlink(tempFile); console.log('[BrowserSwitch] Sisa tempFile dihapus'); } } catch {}
                    try { if (fs.existsSync(tempDir)) await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
                    if (!renameOk) {
                        console.error('[BrowserSwitch] Rename gagal — session lama tetap dipakai. Coba .aturbrowser lagi.');
                    }
                    if (typeof global.__internalRestart === 'function') {
                        global.__internalRestart().catch(async err => {
                            console.error('[BrowserSwitch] Internal restart gagal, fallback restart:', err?.message);
                            const { restartBot } = await importLazy(path.resolve('./SEMUA_FITUR/system/shutdown.js'));
                            await restartBot(500);
                        });
                    } else {
                        const { restartBot } = await importLazy(path.resolve('./SEMUA_FITUR/system/shutdown.js'));
                        await restartBot(500);
                    }
                }
                return;
            }

            // ── CLOSE: tentukan apakah reconnect ──
            if (connection === 'close' && !switched) {
                // Sebelum pairing dimulai sama sekali dan sebelum QR dikirim
                // → reconnect otomatis tanpa user action
                if (!pairingRequested && !qrSent) {
                    reconnectCount++;
                    if (reconnectCount <= MAX_RECONNECT) {
                        // Jeda 8 detik (dulu 2 detik): retry rapat 10x berturut-turut
                        // saat 408 justru makin di-throttle WA — beri napas tiap percobaan.
                        await delay(8000);
                        await createAndConnect();
                    } else {
                        clearTimeout(abortTimer);
                        await cleanup();
                        await hisoka.sendMessage(from, {
                            text: `❌ *Koneksi switching gagal dibuka.*\n\nCoba lagi dengan *.aturbrowser*`
                        }).catch(() => {});
                    }
                    return;
                }

                // Error fatal → abort langsung
                if (FATAL_CODES.has(reason)) {
                    clearTimeout(abortTimer);
                    await cleanup();
                    await hisoka.sendMessage(from, {
                        text:
                            `❌ *Koneksi baru gagal (error fatal)!*\n\n` +
                            `Bot tetap menggunakan session lama.\n` +
                            `Alasan: \`${reason}\`\n\n` +
                            `Coba lagi dengan *.aturbrowser*`
                    }).catch(() => {});
                    return;
                }

                // 515 (restartRequired) dan non-fatal lain →
                // Baileys TIDAK auto-reconnect. Kita buat socket baru manual.
                // Creds terbaru (hasil pairing) sudah tersimpan di tempFile via saveCreds.
                reconnectCount++;
                if (reconnectCount <= MAX_RECONNECT) {
                    console.log(`[BrowserSwitch] close ${reason} → buat socket baru (#${reconnectCount})...`);
                    await delay(8000);
                    await createAndConnect();
                    return;
                }

                // Terlalu banyak reconnect → abort
                clearTimeout(abortTimer);
                await cleanup();
                await hisoka.sendMessage(from, {
                    text:
                        `❌ *Koneksi baru terputus!*\n\n` +
                        `Bot tetap menggunakan session lama.\n` +
                        `Alasan: \`${reason || 'unknown'}\` (setelah ${reconnectCount} percobaan)\n\n` +
                        `Coba lagi dengan *.aturbrowser*`
                }).catch(() => {});
            }
        });
    }

    console.log(`[BrowserSwitch] Mulai switch → browser: ${browserVal.join('|')} | usePairingCode: ${usePairingCode}`);
    await createAndConnect();
}
