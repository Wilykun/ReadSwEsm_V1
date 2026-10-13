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
 *  menu-cmd.js — Menu command handler
 *  Perintah .menu untuk tampilkan daftar lengkap fitur dan perintah bot
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Menu Command Handler (.menu)
 *  Tampilkan daftar lengkap semua fitur & perintah bot dengan
 *  tampilan terstruktur per kategori — mendukung sub-menu dan
 *  navigasi via tombol interaktif.
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

async function handleMenu({
        hisoka, m, tolak, logCommand, loadConfig, Button,
        getJadibotNumber, getJadibotReadsw, getJadibotAntidel, getJadibotAnticall,
        getJadibotAnticallvid, getJadibotAutoOnline, getJadibotAutoTyping, getJadibotAutoRecording,
        jadibotConnectedAt, getJadibotExpiry, getJadibotExpirySummary,
        getHandler, CEKAUTO_FITUR_LIST, BROWSER_LIST,
        getUserProfilePictureUrl, isNoSpaceError, cleanupWritePressure,
}) {
        try {
                if (hisoka?.isMainBot === false) {
                        const _jbCfg       = loadConfig();
                        const _jbBotReply  = _jbCfg?.botReply || {};
                        const _jbFooter    = loadConfig()?.botReply?.footer || '';
                        const jadibotNum = getJadibotNumber(hisoka);

                        const _jbReadsw = getJadibotReadsw(jadibotNum);
                        const _jbAntidel = getJadibotAntidel(jadibotNum);
                        const _jbAnticall = getJadibotAnticall(jadibotNum);
                        const _jbAcv = getJadibotAnticallvid(jadibotNum);
                        const _jbAo = getJadibotAutoOnline(jadibotNum);
                        const _jbAt = getJadibotAutoTyping(jadibotNum);
                        const _jbAr = getJadibotAutoRecording(jadibotNum);
                        const _jbAutoList = [
                                _jbReadsw?.enabled,
                                _jbAntidel?.enabled,
                                _jbAnticall?.enabled,
                                _jbAcv?.enabled,
                                _jbAo?.enabled,
                                _jbAt?.enabled,
                                _jbAr?.enabled,
                        ];
                        const _jbTotalAutoFitur = _jbAutoList.length;
                        const _jbFiturCount = _jbAutoList.filter(Boolean).length;
                        const _jbAutoTidakAktif = _jbTotalAutoFitur - _jbFiturCount;
                        const jadibotConnectTs = jadibotConnectedAt.get(jadibotNum) || getJadibotExpiry(jadibotNum)?.connectedAt || Date.now();
                        const jadibotUptimeMs = Date.now() - jadibotConnectTs;
                        const jadibotUptimeSec = Math.floor(jadibotUptimeMs / 1000);
                        const juh = Math.floor(jadibotUptimeSec / 3600);
                        const jum = Math.floor((jadibotUptimeSec % 3600) / 60);
                        const jus = Math.floor(jadibotUptimeSec % 60);
                        const expSum = getJadibotExpirySummary(jadibotNum);
                        const masaAktifLine = expSum.status === 'permanent'
                                ? `♾️ *Masa Aktif* : Permanent`
                                : `⏳ *Masa Aktif* : ${expSum.remaining}`;
                        const _jbNow = new Date();
                        const _jbTglFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(_jbNow);
                        const _jbJamFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(_jbNow);
                        const menuTeks = getHandler('menuJadibot')?.buildMenuJadibot({
                                pushName: m.pushName || 'User',
                                jadibotNum,
                                juh, jum, jus,
                                masaAktifLine,
                                tglFmt: _jbTglFmt,
                                jamFmt: _jbJamFmt,
                                totalAutoFitur: _jbTotalAutoFitur,
                                fiturCount: _jbFiturCount,
                                autoTidakAktif: _jbAutoTidakAktif,
                        }) ?? '❌ Menu tidak tersedia, coba lagi.';
                        let jbMenuSent = false;
                        try {
                                const btnJb = new Button()
                                        .setBody(menuTeks)
                                        .setFooter(_jbFooter);
                                await btnJb.run(m.from, hisoka, { quoted: m });
                                jbMenuSent = true;
                        } catch (_) {}
                        if (!jbMenuSent) {
                                await hisoka.sendMessage(m.from, { text: menuTeks }, { quoted: m });
                        }
                        logCommand(m, hisoka, 'menu');
                        return;
                }

                const cfg      = loadConfig();
                const totalCmdCount = Array.isArray(hisoka?.loadedCommands)
                        ? hisoka.loadedCommands.length
                        : 0;
                const botReply = cfg.botReply || {};
                const botName  = botReply.botName     || 'Wily Bot';
                const ownerNum = botReply.ownerNumber || '';
                const menuFooter = loadConfig()?.botReply?.footer || '';
                const uptime   = process.uptime();
                const uh = Math.floor(uptime / 3600);
                const um = Math.floor((uptime % 3600) / 60);
                const us = Math.floor(uptime % 60);
                const uptimeStr = `${uh} Jam ${um} Menit ${us} Detik`;
                const _mnCfg = loadConfig();
                const totalSemuaFitur = CEKAUTO_FITUR_LIST.length;
                const totalCmd = CEKAUTO_FITUR_LIST.filter(f => {
                        if (f.checkFn) return f.checkFn(_mnCfg);
                        if (f.type === 'global') return _mnCfg[f.key]?.enabled === true;
                        const groups = _mnCfg[f.key]?.groups || {};
                        return Object.values(groups).some(g => g?.enabled === true);
                }).length;
                const totalTidakAktif = totalSemuaFitur - totalCmd;
                const _mnBrowserArr  = global.__activeBrowserArr;
                const _mnBrowserKey  = (global.__activeBrowserKey || _mnCfg.browserDevice?.selected || 'v1').toLowerCase();
                const _mnBrowserInfo = BROWSER_LIST.find(b => b.key === _mnBrowserKey) || BROWSER_LIST[0];
                const _mnBrowserLabel = _mnBrowserArr && _mnBrowserArr.length >= 3
                        ? `${_mnBrowserArr[0]} + ${_mnBrowserArr[1]} (${_mnBrowserArr[2]})`
                        : `${_mnBrowserInfo.label} (${_mnBrowserInfo.value[2]})`;
                const _mnNow = new Date();
                const _mnTgl = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(_mnNow);
                const _mnJam = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(_mnNow);

                await hisoka.sendMessage(m.from, { react: { text: `🌊`, key: m.key } }).catch(() => {});

                const teks = await getHandler('menuUtama')?.buildMenuUtama({
                        pushName: m.pushName || 'User',
                        isOwner: m.isOwner,
                        uptimeStr,
                        tgl: _mnTgl,
                        jam: _mnJam,
                        browserLabel: _mnBrowserLabel,
                        totalCmdCount,
                        totalSemuaFitur,
                        fiturAktif: totalCmd,
                        fiturTidakAktif: totalTidakAktif,
                }) ?? '❌ Menu tidak tersedia, coba lagi.';
                const ppUser = await getUserProfilePictureUrl(hisoka, m.sender);
                const menuCtxInfo = ppUser
                        ? {
                                externalAdReply: {
                                        showAdAttribution: false,
                                        title: `${botName} Menu`,
                                        body: `Menu untuk ${m.pushName || 'User'}`,
                                        thumbnailUrl: ppUser,
                                        sourceUrl: ownerNum ? `https://wa.me/${ownerNum}` : undefined,
                                        mediaType: 1,
                                        renderLargerThumbnail: true
                                }
                        }
                        : {};
                let menuSent = false;
                try {
                        const btnMenu = new Button()
                                .setBody(teks)
                                .setFooter(menuFooter)
                                .setContextInfo(menuCtxInfo);
                        await btnMenu.run(m.from, hisoka, { quoted: m });
                        menuSent = true;
                } catch (_) {}
                if (!menuSent) {
                        await hisoka.sendMessage(
                                m.from,
                                Object.keys(menuCtxInfo).length ? { text: teks, contextInfo: menuCtxInfo } : { text: teks },
                                { quoted: m }
                        );
                }
        } catch (error) {
                if (!isNoSpaceError(error)) throw error;
                cleanupWritePressure();
                await hisoka.sendMessage(m.from, {
                        text:
                                `*MENU BOT*\n\n` +
                                `Menu sedang dikirim mode hemat karena storage/temp sempat penuh.\n\n` +
                                `Fitur utama:\n` +
                                `.typing\n` +
                                `.recording\n` +
                                `.online\n` +
                                `.readsw\n` +
                                `.readchat\n` +
                                `.antidel on/off\n` +
                                `.hidetag\n` +
                                `.ghosttag\n` +
                                `.quoted\n` +
                                `.rvo\n` +
                                `.rvo2\n` +
                                `.s\n` +
                                `.toimg\n` +
                                `.smeme [teks]\n` +
                                `.stickerly\n` +
                                `.listgroup\n` +
                                `.allunduh\n` +
                                `.tt\n` +
                                `.ig\n` +
                                `.fb\n` +
                                `.twdl\n` +
                                `.ytmp3\n` +
                                `.ytmp4\n` +
                                `.play\n` +
                                `.cuaca\n` +
                                `.jadibot\n` +
                                `.stopbot\n` +
                                `.listbot\n\n` +
                                `Ketik .allmenu untuk daftar lebih lengkap.`
                }, { quoted: m });
        }
        logCommand(m, hisoka, 'menu');
}

export { handleMenu };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(menu)$/i;
export const tags = ['menu'];
export const help = ['menu'];
export default handleMenu;
