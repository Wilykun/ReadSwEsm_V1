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
 *  cekauto-cmd.js — Cek auto features command
 *  Perintah .cekauto untuk tampilkan status & toggle semua fitur otomatis bot
 * ───────────────────────────────
 */
'use strict';

import { jidNormalizedUser, jidDecode,
        generateWAMessageFromContent, prepareWAMessageMedia, } from '@whiskeysockets/baileys';

function makeCekautoHelpers({
        loadConfig, saveConfig,
        getAllAntiTagSWGroups, toggleAntiTagSW, isAntiTagSWEnabled,
        sendConfirmWithButtons, tolak,
}) {
        const CEKAUTO_FITUR_LIST = [
                { key: 'antiCall',       nama: 'Anti Call',        cmd: '.anticall on/off',        type: 'global', toggleKey: 'antiCall',       toggleable: true  },
                { key: 'antiCallVideo',  nama: 'Anti Call Video',  cmd: '.anticallvid on/off',     type: 'global', toggleKey: 'antiCallVideo',  toggleable: true  },
                { key: 'antiDelete',     nama: 'Anti Delete',      cmd: '.antidel on/off',         type: 'global', toggleKey: 'antiDelete',     toggleable: true  },
                { key: 'antiTagSW',      nama: 'Anti Tag SW',      cmd: '.antitagsw on/off',       type: 'global', toggleKey: 'antiTagSW',      toggleable: true  },
                { key: 'autoCleaner',    nama: 'Auto Cleaner',     cmd: '.autocleaner on/off',     type: 'global', toggleKey: 'autoCleaner',    toggleable: true  },
                { key: 'autoOnline',     nama: 'Auto Online',      cmd: '.online on/off',          type: 'global', toggleKey: 'autoOnline',     toggleable: true  },
                { key: 'autoReadStory',  nama: 'Auto Read Story',  cmd: '.readsw on/off',          type: 'global', toggleKey: 'autoReadStory',  toggleable: true  },
                { key: 'autoRecording',  nama: 'Auto Recording',   cmd: '.recording on/off',       type: 'global', toggleKey: 'autoRecording',  toggleable: true  },
                { key: 'autoSimi',       nama: 'Auto Simi (AI)',   cmd: '.simi on/off',            type: 'global', toggleKey: 'autoSimi',       toggleable: true  },
                { key: 'autoTyping',     nama: 'Auto Typing',      cmd: '.typing on/off',          type: 'global', toggleKey: 'autoTyping',     toggleable: true  },
                { key: 'infowibu',       nama: 'Info Wibu',        cmd: '.infowibu on/off',        type: 'group',  toggleable: false             },
                { key: 'memoryMonitor',  nama: 'Memory Monitor',   cmd: '.ram',                    type: 'global', toggleable: false, checkFn: () => !!global.memoryMonitor },
                { key: 'sessionCleaner', nama: 'Session Cleaner',  cmd: '.sessioncleaner on/off',  type: 'global', toggleKey: 'sessionCleaner', toggleable: true  },
                { key: 'telegram',       nama: 'Telegram Bridge',  cmd: '.telegram on/off',        type: 'global', toggleKey: 'telegram',       toggleable: true  },
                { key: 'welcomeGoodbye', nama: 'Welcome/Goodbye',  cmd: '.welcome on/off',         type: 'global', toggleable: false, checkFn: (cfg) => { const g = cfg.welcomeGoodbye?.groups || {}; return Object.values(g).some(v => v?.welcome === true || v?.goodbye === true); } },
                { key: 'wilyAI',         nama: 'Wily AI',          cmd: '.wilyai on/off',          type: 'global', toggleKey: 'wilyAI',         toggleable: true  },
                { key: 'cekswTracking',  nama: 'Cek SW Tracking',  cmd: '.ceksw on/off',           type: 'custom', toggleKey: 'cekswTracking',  toggleable: true,  checkFn: (cfg) => cfg.cekswTracking !== false },
                { key: 'alqanimenotif',  nama: 'Alqanime Notif',   cmd: '.alqanimenotif on/off',   type: 'group',  toggleable: false             },
                { key: 'animasu',        nama: 'Animasu Notif',    cmd: '.animasu on/off',         type: 'group',  toggleable: false             },
                { key: 'malnews',        nama: 'MAL News',         cmd: '.malnews on/off',         type: 'group',  toggleable: false             },
                { key: 'tvonenews',      nama: 'TV One News',      cmd: '.tvone on/off',           type: 'group',  toggleable: false             },
                { key: 'autoSholat',     nama: 'Auto Sholat',      cmd: '.autosholat add/remove',  type: 'group',  toggleable: false, checkFn: (cfg) => { const g = cfg.autoSholat?.groups; return Array.isArray(g) ? g.length > 0 : (g && typeof g === 'object' ? Object.values(g).some(v => v?.enabled === true) : false); } },
        ];

        const CEKAUTO_GROUP_FITUR_LIST = [
                {
                        key: 'infowibu', nama: 'Info Wibu', cmd: '.infowibu on/off', toggleable: true,
                        desc: 'Kirim info & jadwal anime/wibu terbaru ke grup ini secara otomatis.',
                        checkFn: (cfg, jid) => cfg.infowibu?.groups?.[jid]?.enabled === true
                },
                {
                        key: 'animasu', nama: 'Animasu Notif', cmd: '.animasu on/off', toggleable: true,
                        desc: 'Notifikasi update episode anime terbaru dari Animasu ke grup.',
                        checkFn: (cfg, jid) => cfg.animasu?.groups?.[jid]?.enabled === true
                },
                {
                        key: 'alqanimenotif', nama: 'Alqanime Notif', cmd: '.alqanimenotif on/off', toggleable: true,
                        desc: 'Notifikasi rilis anime terbaru dari Alqanime ke grup ini.',
                        checkFn: (cfg, jid) => cfg.alqanimenotif?.groups?.[jid]?.enabled === true
                },
                {
                        key: 'tvonenews', nama: 'TV One News', cmd: '.tvone on/off', toggleable: true,
                        desc: 'Kirim berita terkini dari TV One ke grup ini secara otomatis.',
                        checkFn: (cfg, jid) => cfg.tvonenews?.groups?.[jid]?.enabled === true
                },
                {
                        key: 'malnews', nama: 'MAL News', cmd: '.malnews on/off', toggleable: true,
                        desc: 'Kirim berita & update anime/manga dari MyAnimeList ke grup.',
                        checkFn: (cfg, jid) => cfg.malnews?.groups?.[jid]?.enabled === true
                },
                {
                        key: 'welcome', nama: 'Welcome', cmd: '.welcome on/off', toggleable: true,
                        desc: 'Kirim pesan sambutan otomatis saat member baru bergabung ke grup.',
                        checkFn: (cfg, jid) => cfg.welcomeGoodbye?.groups?.[jid]?.welcome === true
                },
                {
                        key: 'goodbye', nama: 'Goodbye', cmd: '.goodbye on/off', toggleable: true,
                        desc: 'Kirim pesan perpisahan otomatis saat member keluar atau dikick.',
                        checkFn: (cfg, jid) => cfg.welcomeGoodbye?.groups?.[jid]?.goodbye === true
                },
                {
                        key: 'antiTagSWGrup', nama: 'Anti Tag SW (Grup)', cmd: '.antitagsw on/off', toggleable: true,
                        descFn: (cfg) => {
                                const globalOn = cfg.antiTagSW?.enabled === true;
                                return `Cegah member mentag grup via SW. Global: ${globalOn ? '🟢 Aktif' : '🔴 Nonaktif → ketik .antitagsw global on'}`;
                        },
                        checkFn: (_cfg, jid) => isAntiTagSWEnabled(jid)
                },
                {
                        key: 'autoSholat', nama: 'Auto Sholat', cmd: '.autosholat add/remove', toggleable: true,
                        desc: 'Kirim notif waktu sholat + gambar masjid + suara adzan ke grup otomatis.',
                        checkFn: (cfg, jid) => { const g = cfg.autoSholat?.groups; return Array.isArray(g) ? g.includes(jid) : (g?.[jid]?.enabled === true); }
                },
        ];

        function getFeatureTimestamp(featureKey, jid) {
                const cfg = loadConfig();
                if (['infowibu', 'animasu', 'alqanimenotif', 'tvonenews', 'malnews'].includes(featureKey)) {
                        return cfg[featureKey]?.groups?.[jid]?.diubahPada || cfg.cekautoTimestamps?.[featureKey]?.[jid] || null;
                }
                return cfg.cekautoTimestamps?.[featureKey]?.[jid] || null;
        }

        function saveCekautoTimestamp(featureKey, jid) {
                const cfg = loadConfig();
                if (!cfg.cekautoTimestamps) cfg.cekautoTimestamps = {};
                if (!cfg.cekautoTimestamps[featureKey]) cfg.cekautoTimestamps[featureKey] = {};
                cfg.cekautoTimestamps[featureKey][jid] = Date.now();
                saveConfig(cfg);
        }

        function formatRelativeTime(ts) {
                if (!ts) return null;
                const diff = Date.now() - ts;
                const days = Math.floor(diff / 86400000);
                const hours = Math.floor(diff / 3600000);
                const mins = Math.floor(diff / 60000);
                if (days >= 1) return `${days} hari lalu`;
                if (hours >= 1) return `${hours} jam lalu`;
                if (mins >= 1) return `${mins} menit lalu`;
                return 'baru saja';
        }

        function getActiveGroupsForFeature(featureKey) {
                const cfg = loadConfig();
                if (featureKey === 'welcome') {
                        return Object.entries(cfg.welcomeGoodbye?.groups || {})
                                .filter(([, v]) => v?.welcome === true).map(([jid]) => jid);
                }
                if (featureKey === 'goodbye') {
                        return Object.entries(cfg.welcomeGoodbye?.groups || {})
                                .filter(([, v]) => v?.goodbye === true).map(([jid]) => jid);
                }
                if (featureKey === 'antiTagSWGrup') return getAllAntiTagSWGroups();
                return Object.entries(cfg[featureKey]?.groups || {})
                        .filter(([, v]) => v?.enabled === true).map(([jid]) => jid);
        }

        function disableFeatureForGroup(featureKey, jid) {
                const cfg = loadConfig();
                if (featureKey === 'welcome' || featureKey === 'goodbye') {
                        if (!cfg.welcomeGoodbye) cfg.welcomeGoodbye = { enabled: true, groups: {} };
                        if (!cfg.welcomeGoodbye.groups) cfg.welcomeGoodbye.groups = {};
                        if (!cfg.welcomeGoodbye.groups[jid]) cfg.welcomeGoodbye.groups[jid] = {};
                        cfg.welcomeGoodbye.groups[jid][featureKey] = false;
                        saveConfig(cfg);
                } else if (featureKey === 'antiTagSWGrup') {
                        toggleAntiTagSW(jid, false);
                } else {
                        if (!cfg[featureKey]) cfg[featureKey] = { groups: {} };
                        if (!cfg[featureKey].groups) cfg[featureKey].groups = {};
                        cfg[featureKey].groups[jid] = { enabled: false, diubahPada: Date.now() };
                        saveConfig(cfg);
                }
        }

        function disableFeatureForAllGroups(featureKey) {
                const groups = getActiveGroupsForFeature(featureKey);
                for (const jid of groups) disableFeatureForGroup(featureKey, jid);
        }

        async function sendCekautoGrupSelectMsg(hisoka, m, featureKey) {
                const namaMapSel = {
                        infowibu: 'Info Wibu', animasu: 'Animasu Notif',
                        alqanimenotif: 'Alqanime Notif', tvonenews: 'TV One News',
                        malnews: 'MAL News', welcome: 'Welcome',
                        goodbye: 'Goodbye',
                        antiTagSWGrup: 'Anti Tag SW (Grup)',
                };
                const namFitur = namaMapSel[featureKey] || featureKey;
                const activeJids = getActiveGroupsForFeature(featureKey);

                if (activeJids.length === 0) {
                        return sendConfirmWithButtons(hisoka, m,
                                `ℹ️ Tidak ada grup yang aktif untuk fitur *${namFitur}*.`,
                                [{ text: '🏘️ Lihat Fitur GC', id: '__cekauto_gc__' }]
                        );
                }

                const resolveAdminName = (p) => {
                        let realJid = p.id || '';
                        if (realJid.endsWith('@lid')) {
                                const pn = p.phoneNumber || p.jid || '';
                                if (pn && !pn.endsWith('@lid')) realJid = jidNormalizedUser(pn);
                        } else if (realJid) {
                                realJid = jidNormalizedUser(realJid);
                        }
                        const numOnly = jidDecode(realJid)?.user || realJid.split('@')[0];
                        let name = hisoka.getName
                                ? (hisoka.getName(realJid, true) || hisoka.getName(realJid) || null)
                                : null;
                        if (!name || name === numOnly) {
                                const contact = hisoka.contacts?.read ? hisoka.contacts.read(realJid) : null;
                                name = contact?.name || contact?.notify || contact?.verifiedName || null;
                        }
                        return name || `+${numOnly}`;
                };

                const grupRows = [];
                for (const jid of activeJids) {
                        try {
                                const meta = await hisoka.groupMetadata(jid);
                                const memberCount = meta.participants?.length || 0;
                                const adminNames = (meta.participants || [])
                                        .filter(p => p.admin)
                                        .map(p => resolveAdminName(p));
                                const adminText = adminNames.length
                                        ? `Admin: ${adminNames.slice(0, 3).join(', ')}${adminNames.length > 3 ? ` +${adminNames.length - 3} lainnya` : ''}`
                                        : 'Tidak ada admin';
                                const ts = getFeatureTimestamp(featureKey, jid);
                                const tsText = ts ? ` • Aktif ${formatRelativeTime(ts)}` : '';
                                grupRows.push({
                                        header: `🏘️ ${meta.subject || jid}`,
                                        title: `👥 ${memberCount} member${tsText}`,
                                        description: adminText,
                                        id: `__cgrupoff__${featureKey}__${jid}`
                                });
                        } catch (_) {
                                grupRows.push({
                                        header: `🏘️ ${jid}`,
                                        title: '⚠️ Gagal ambil info grup',
                                        description: jid,
                                        id: `__cgrupoff__${featureKey}__${jid}`
                                });
                        }
                }

                const sections = [
                        { title: `🏘️ Pilih Grup — Nonaktifkan ${namFitur}`, rows: grupRows },
                        {
                                title: '⚠️ Opsi Lainnya',
                                rows: [{
                                        header: '🔴 Off Semua Grup',
                                        title: `Matikan ${namFitur} di semua ${activeJids.length} grup`,
                                        description: 'Nonaktifkan sekaligus untuk semua grup aktif',
                                        id: `__cgrupall__${featureKey}`
                                }]
                        }
                ];

                let txt =
                        `╔══════════════════════════╗\n` +
                        `║  🏘️  *PILIH GRUP*  ║\n` +
                        `╚══════════════════════════╝\n\n` +
                        `Fitur: *${namFitur}*\n` +
                        `Aktif di *${activeJids.length}* grup\n\n` +
                        `Pilih grup yang ingin di-nonaktifkan,\natau pilih *Off Semua Grup* untuk sekaligus.\n\n` +
                        `┌─────────────────────────────┐\n` +
                        `│  🟢 *Grup Aktif*\n` +
                        `└─────────────────────────────┘\n` +
                        grupRows.map(r => `  🏘️  *${r.header.replace('🏘️ ', '')}*\n     _↳ ${r.title} · ${r.description}_`).join('\n') + '\n\n' +
                        `_Gunakan tombol di bawah untuk memilih_`;

                const replyCtx = m.key?.id ? {
                        stanzaId: m.key.id,
                        participant: m.sender || m.key?.participant || '',
                        quotedMessage: m.message || {},
                } : {};

                let botPpMedia = {};
                try {
                        const botJid = hisoka.user?.id;
                        if (botJid) {
                                const ppUrl = await hisoka.profilePictureUrl(botJid, 'image');
                                if (ppUrl) {
                                        botPpMedia = await prepareWAMessageMedia(
                                                { image: { url: ppUrl } },
                                                { upload: hisoka.waUploadToServer }
                                        );
                                }
                        }
                } catch (_) {}

                const hasPp = Object.keys(botPpMedia).length > 0;
                const selMsg = generateWAMessageFromContent(
                        m.from,
                        {
                                viewOnceMessage: {
                                        message: {
                                                messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                                                interactiveMessage: {
                                                        contextInfo: replyCtx,
                                                        ...(hasPp ? { header: { hasMediaAttachment: true, ...botPpMedia } } : {}),
                                                        body: { text: txt },
                                                        nativeFlowMessage: {
                                                                buttons: [
                                                                        {
                                                                                name: 'single_select',
                                                                                buttonParamsJson: JSON.stringify({ title: '🏘️ Pilih Grup', sections })
                                                                        },
                                                                        {
                                                                                name: 'quick_reply',
                                                                                buttonParamsJson: JSON.stringify({ display_text: '🏘️ Lihat Fitur GC', id: '__cekauto_gc__' })
                                                                        }
                                                                ]
                                                        }
                                                }
                                        }
                                }
                        },
                        {},
                        {}
                );
                await hisoka.relayMessage(selMsg.key.remoteJid, selMsg.message, { messageId: selMsg.key.id });
        }

        async function sendCekautoGrupMsg(hisoka, m) {
                if (!m.isGroup) return m.reply('❌ Perintah ini hanya bisa digunakan di dalam grup!');
                const cfg = loadConfig();
                const jid = m.from;

                const totalAktif = CEKAUTO_GROUP_FITUR_LIST.filter(f => f.checkFn(cfg, jid)).length;
                const totalMati  = CEKAUTO_GROUP_FITUR_LIST.length - totalAktif;

                const allGrupFitur = CEKAUTO_GROUP_FITUR_LIST;
                const aktifGrup   = allGrupFitur.filter(f => f.checkFn(cfg, jid));
                const nonaktifGrup = allGrupFitur.filter(f => !f.checkFn(cfg, jid));
                aktifGrup.sort((a, b) => a.nama.localeCompare(b.nama));
                nonaktifGrup.sort((a, b) => a.nama.localeCompare(b.nama));

                let txt =
                        `╔══════════════════════════╗\n` +
                        `║  🏘️  *FITUR GRUP*  ║\n` +
                        `╚══════════════════════════╝\n\n` +
                        `┌─────────────────────────────┐\n` +
                        `│  ✅ *AKTIF*  ·  ${totalAktif} fitur aktif\n` +
                        `└─────────────────────────────┘\n` +
                        (aktifGrup.length
                                ? aktifGrup.map(f => `  🟢  *${f.nama}*`).join('\n') + '\n'
                                : `  _Tidak ada fitur yang aktif_\n`) +
                        `\n┌─────────────────────────────┐\n` +
                        `│  ❌ *NONAKTIF*  ·  ${totalMati} fitur mati\n` +
                        `└─────────────────────────────┘\n` +
                        (nonaktifGrup.length
                                ? nonaktifGrup.map(f => `  🔴  *${f.nama}*`).join('\n') + '\n'
                                : `  _Semua fitur aktif_ ✨\n`) +
                        `\n╔══════════════════════════╗\n` +
                        `║  📦 *Total* : ${CEKAUTO_GROUP_FITUR_LIST.length} fitur terdaftar\n` +
                        `╚══════════════════════════╝\n\n` +
                        `┌─────────────────────────────┐\n` +
                        `│  📋 *DAFTAR PERINTAH*\n` +
                        `└─────────────────────────────┘\n` +
                        [...CEKAUTO_GROUP_FITUR_LIST]
                                .sort((a, b) => a.nama.localeCompare(b.nama))
                                .map(f => `  • *${f.nama}* → \`${f.cmd}\``)
                                .join('\n');

                await m.reply(txt);
        }

        async function sendCekautoMsg(hisoka, m) {
                const cfg = loadConfig();
                const aktif = [];
                const nonaktif = [];

                for (const f of CEKAUTO_FITUR_LIST) {
                        const val = cfg[f.key];
                        let isOn = false;
                        if (f.checkFn) {
                                isOn = f.checkFn(cfg);
                        } else if (f.type === 'global') {
                                isOn = val?.enabled === true;
                        } else {
                                const groups = val?.groups || {};
                                isOn = Object.values(groups).some(g => g?.enabled === true);
                        }
                        (isOn ? aktif : nonaktif).push({ nama: f.nama, cmd: f.cmd, key: f.key });
                }

                aktif.sort((a, b) => a.nama.localeCompare(b.nama));
                nonaktif.sort((a, b) => a.nama.localeCompare(b.nama));

                let txt =
                        `╔══════════════════════════╗\n` +
                        `║  ⚙️  *AUTO FITUR BOT*  ║\n` +
                        `╚══════════════════════════╝\n\n`;
                txt += `┌─────────────────────────────┐\n`;
                txt += `│  ✅ *AKTIF*  ·  ${aktif.length} fitur aktif\n`;
                txt += `└─────────────────────────────┘\n`;
                txt += aktif.length
                        ? aktif.map(f => `  🟢  *${f.nama}*`).join('\n') + '\n'
                        : `  _Tidak ada fitur yang aktif_\n`;
                txt += `\n┌─────────────────────────────┐\n`;
                txt += `│  ❌ *NONAKTIF*  ·  ${nonaktif.length} fitur mati\n`;
                txt += `└─────────────────────────────┘\n`;
                txt += nonaktif.length
                        ? nonaktif.map(f => `  🔴  *${f.nama}*`).join('\n') + '\n'
                        : `  _Semua fitur aktif_ ✨\n`;
                txt += `\n╔══════════════════════════╗\n`;
                txt += `║  📦 *Total* : ${CEKAUTO_FITUR_LIST.length} fitur terdaftar\n`;
                txt += `╚══════════════════════════╝\n\n`;
                txt += `┌─────────────────────────────┐\n`;
                txt += `│  📋 *DAFTAR PERINTAH*\n`;
                txt += `└─────────────────────────────┘\n`;
                txt += [...CEKAUTO_FITUR_LIST]
                        .sort((a, b) => a.nama.localeCompare(b.nama))
                        .map(f => `  • *${f.nama}* → \`${f.cmd}\``)
                        .join('\n');

                await m.reply(txt);
        }

        async function handleCekauto({ hisoka, m, query, tolak: _tolak, logCommand }) {
                const t = _tolak || tolak;
                if (!m.isOwner) return t(hisoka, m, '❌ Fitur ini hanya untuk owner!');
                const subCekauto = (query || '').trim().toLowerCase();
                if (subCekauto === 'gc' || subCekauto === 'grup' || subCekauto === 'group') {
                        await sendCekautoGrupMsg(hisoka, m);
                        logCommand(m, hisoka, 'cekauto gc');
                } else {
                        await sendCekautoMsg(hisoka, m);
                        logCommand(m, hisoka, 'cekauto');
                }
        }

        // ─── handleCekautoCallbacks ───────────────────────────────────────────────
        // Menangani semua callback interaktif cekauto (button/list reply dari WA).
        // Dipanggil di message.js sebelum switch-case.
        // @returns {boolean} true jika pesan sudah ditangani
        // ─────────────────────────────────────────────────────────────────────────
        async function handleCekautoCallbacks({ hisoka, m, tolak: _tolak, restartAutoCleaner, stopAutoCleaner }) {
                const t = _tolak || tolak;
                if (!m.isOwner) return false;
                const txt = typeof m.text === 'string' ? m.text : '';

                // ── __cauto__ — toggle fitur global ──────────────────────────────────
                if (txt.startsWith('__cauto__')) {
                        const parts = txt.split('__').filter(Boolean);
                        if (parts.length === 3 && parts[0] === 'cauto') {
                                const configKey = parts[1];
                                const action = parts[2];
                                if ((action === 'on' || action === 'off') && configKey) {
                                        try {
                                                const cfgToggle = loadConfig();
                                                if (configKey === 'cekswTracking') {
                                                        cfgToggle.cekswTracking = action === 'on';
                                                        saveConfig(cfgToggle);
                                                } else if (configKey === 'autoCleaner') {
                                                        const currentVal = cfgToggle[configKey] || {};
                                                        cfgToggle[configKey] = { ...currentVal, enabled: action === 'on' };
                                                        saveConfig(cfgToggle);
                                                        if (action === 'on') { if (restartAutoCleaner) restartAutoCleaner(); }
                                                        else { if (stopAutoCleaner) stopAutoCleaner(); }
                                                } else if (configKey === 'autoOnline') {
                                                        const currentVal = cfgToggle[configKey] || {};
                                                        cfgToggle[configKey] = { ...currentVal, enabled: action === 'on' };
                                                        saveConfig(cfgToggle);
                                                        if (global.startAutoOnline) {
                                                                global.startAutoOnline();
                                                        }
                                                } else {
                                                        const currentVal = cfgToggle[configKey] || {};
                                                        cfgToggle[configKey] = { ...currentVal, enabled: action === 'on' };
                                                        saveConfig(cfgToggle);
                                                }
                                                const icon = action === 'on' ? '✅' : '❌';
                                                await hisoka.sendMessage(m.from, { react: { text: icon, key: m.key } });
                                                await sendCekautoMsg(hisoka, m);
                                        } catch (e) {
                                                await t(hisoka, m, `❌ Gagal toggle fitur: ${e.message}`);
                                        }
                                        return true;
                                }
                        }
                        return false;
                }

                // ── __cgrup__ — toggle fitur grup ─────────────────────────────────────
                if (m.isGroup && txt.startsWith('__cgrup__')) {
                        const parts = txt.split('__').filter(Boolean);
                        if (parts.length === 3 && parts[0] === 'cgrup') {
                                const featureKey = parts[1];
                                const action = parts[2];
                                if ((action === 'on' || action === 'off') && featureKey) {
                                        try {
                                                const cfgGrup = loadConfig();
                                                const jidGrup = m.from;
                                                const enable = action === 'on';
                                                if (featureKey === 'welcome' || featureKey === 'goodbye') {
                                                        if (!cfgGrup.welcomeGoodbye) cfgGrup.welcomeGoodbye = { enabled: true, groups: {} };
                                                        if (!cfgGrup.welcomeGoodbye.groups) cfgGrup.welcomeGoodbye.groups = {};
                                                        if (!cfgGrup.welcomeGoodbye.groups[jidGrup]) cfgGrup.welcomeGoodbye.groups[jidGrup] = {};
                                                        cfgGrup.welcomeGoodbye.groups[jidGrup][featureKey] = enable;
                                                        saveConfig(cfgGrup);
                                                        if (enable) saveCekautoTimestamp(featureKey, jidGrup);
                                                } else if (featureKey === 'antiTagSWGrup') {
                                                        toggleAntiTagSW(jidGrup, enable);
                                                        if (enable) saveCekautoTimestamp('antiTagSWGrup', jidGrup);
                                                } else {
                                                        if (!cfgGrup[featureKey]) cfgGrup[featureKey] = {};
                                                        if (!cfgGrup[featureKey].groups) cfgGrup[featureKey].groups = {};
                                                        cfgGrup[featureKey].groups[jidGrup] = { enabled: enable, diubahPada: Date.now() };
                                                        saveConfig(cfgGrup);
                                                }
                                                const icon = enable ? '✅' : '❌';
                                                await hisoka.sendMessage(m.from, { react: { text: icon, key: m.key } });
                                                await sendCekautoGrupMsg(hisoka, m);
                                        } catch (e) {
                                                await t(hisoka, m, `❌ Gagal toggle fitur grup: ${e.message}`);
                                        }
                                        return true;
                                }
                        }
                        return false;
                }

                // ── __cgrupsel__ — tampil list grup aktif untuk satu fitur ────────────
                if (txt.startsWith('__cgrupsel__')) {
                        const parts = txt.split('__').filter(Boolean);
                        if (parts.length === 2 && parts[0] === 'cgrupsel') {
                                const featureKey = parts[1];
                                try {
                                        await sendCekautoGrupSelectMsg(hisoka, m, featureKey);
                                } catch (e) {
                                        await t(hisoka, m, `❌ Gagal ambil daftar grup: ${e.message}`);
                                }
                                return true;
                        }
                        return false;
                }

                // ── __cgrup_allon__ — aktifkan SEMUA fitur untuk grup ini ─────────────
                if (m.isGroup && txt === '__cgrup_allon__') {
                        try {
                                const cfgAll = loadConfig();
                                const jidAll = m.from;
                                for (const f of CEKAUTO_GROUP_FITUR_LIST) {
                                        if (!f.toggleable) continue;
                                        if (f.key === 'welcome' || f.key === 'goodbye') {
                                                if (!cfgAll.welcomeGoodbye) cfgAll.welcomeGoodbye = { enabled: true, groups: {} };
                                                if (!cfgAll.welcomeGoodbye.groups) cfgAll.welcomeGoodbye.groups = {};
                                                if (!cfgAll.welcomeGoodbye.groups[jidAll]) cfgAll.welcomeGoodbye.groups[jidAll] = {};
                                                cfgAll.welcomeGoodbye.groups[jidAll][f.key] = true;
                                        } else if (f.key === 'antiTagSWGrup') {
                                                toggleAntiTagSW(jidAll, true);
                                        } else {
                                                if (!cfgAll[f.key]) cfgAll[f.key] = {};
                                                if (!cfgAll[f.key].groups) cfgAll[f.key].groups = {};
                                                cfgAll[f.key].groups[jidAll] = { enabled: true, diubahPada: Date.now() };
                                        }
                                        saveCekautoTimestamp(f.key, jidAll);
                                }
                                saveConfig(cfgAll);
                                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                                await sendCekautoGrupMsg(hisoka, m);
                        } catch (e) {
                                await t(hisoka, m, `❌ Gagal aktifkan semua fitur: ${e.message}`);
                        }
                        return true;
                }

                // ── __cgrup_alloff__ — matikan SEMUA fitur untuk grup ini ─────────────
                if (m.isGroup && txt === '__cgrup_alloff__') {
                        try {
                                const cfgOff = loadConfig();
                                const jidOff = m.from;
                                for (const f of CEKAUTO_GROUP_FITUR_LIST) {
                                        if (!f.toggleable) continue;
                                        if (f.key === 'welcome' || f.key === 'goodbye') {
                                                if (cfgOff.welcomeGoodbye?.groups?.[jidOff]) {
                                                        cfgOff.welcomeGoodbye.groups[jidOff][f.key] = false;
                                                }
                                        } else if (f.key === 'antiTagSWGrup') {
                                                toggleAntiTagSW(jidOff, false);
                                        } else {
                                                if (cfgOff[f.key]?.groups?.[jidOff]) {
                                                        cfgOff[f.key].groups[jidOff] = { enabled: false, diubahPada: Date.now() };
                                                }
                                        }
                                }
                                saveConfig(cfgOff);
                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                await sendCekautoGrupMsg(hisoka, m);
                        } catch (e) {
                                await t(hisoka, m, `❌ Gagal matikan semua fitur: ${e.message}`);
                        }
                        return true;
                }

                // ── __cgrupoff__ — nonaktifkan fitur untuk grup tertentu ──────────────
                if (txt.startsWith('__cgrupoff__')) {
                        const raw = txt.slice('__cgrupoff__'.length);
                        const sepIdx = raw.indexOf('__');
                        if (sepIdx !== -1) {
                                const featureKey = raw.slice(0, sepIdx);
                                const targetJid = raw.slice(sepIdx + 2);
                                if (featureKey && targetJid) {
                                        try {
                                                disableFeatureForGroup(featureKey, targetJid);
                                                const namaMapOff = {
                                                        infowibu: 'Info Wibu', animasu: 'Animasu Notif',
                                                        alqanimenotif: 'Alqanime Notif', tvonenews: 'TV One News',
                                                        malnews: 'MAL News', welcome: 'Welcome',
                                                        goodbye: 'Goodbye', antiTagSWGrup: 'Anti Tag SW (Grup)',
                                                };
                                                let grupNama = targetJid;
                                                try { const meta = await hisoka.groupMetadata(targetJid); grupNama = meta.subject || targetJid; } catch (_) {}
                                                await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                                const txtOff =
                                                        `╭══『 ❌ *FITUR DINONAKTIFKAN* 』══╮\n` +
                                                        `│\n` +
                                                        `│ 📌 Fitur : *${namaMapOff[featureKey] || featureKey}*\n` +
                                                        `│ 🏘️ Grup  : *${grupNama}*\n` +
                                                        `│\n` +
                                                        `│ ✅ Fitur berhasil dinonaktifkan\n` +
                                                        `│    untuk grup ini.\n` +
                                                        `│\n` +
                                                        `│ 💡 Gunakan tombol di bawah untuk\n` +
                                                        `│    melihat grup lain yang masih\n` +
                                                        `│    aktif, atau aktifkan kembali\n` +
                                                        `│    fitur ini jika berubah pikiran.\n` +
                                                        `│\n` +
                                                        `╰══════════════════════════════╯`;
                                                await sendConfirmWithButtons(hisoka, m, txtOff, [
                                                        { text: '🏘️ Lihat Sisa Grup Aktif', id: `__cgrupsel__${featureKey}` },
                                                        { text: '↩️ Aktifkan Kembali', id: `__cgrupre__${featureKey}__${targetJid}` },
                                                ], { quoteBot: true });
                                        } catch (e) {
                                                await t(hisoka, m, `❌ Gagal nonaktifkan fitur: ${e.message}`);
                                        }
                                        return true;
                                }
                        }
                        return false;
                }

                // ── __cgrupall__ — off fitur untuk SEMUA grup sekaligus ───────────────
                if (txt.startsWith('__cgrupall__')) {
                        const featureKey = txt.slice('__cgrupall__'.length).trim();
                        if (featureKey) {
                                try {
                                        const sebelumnya = getActiveGroupsForFeature(featureKey);
                                        disableFeatureForAllGroups(featureKey);
                                        const namaMapAll = {
                                                infowibu: 'Info Wibu', animasu: 'Animasu Notif',
                                                alqanimenotif: 'Alqanime Notif', tvonenews: 'TV One News',
                                                malnews: 'MAL News', welcome: 'Welcome',
                                                goodbye: 'Goodbye', antiTagSWGrup: 'Anti Tag SW (Grup)',
                                        };
                                        const grupNamaList = [];
                                        for (const gjid of sebelumnya) {
                                                try { const meta = await hisoka.groupMetadata(gjid); grupNamaList.push(meta.subject || gjid); } catch (_) { grupNamaList.push(gjid); }
                                        }
                                        const grupLines = grupNamaList.map(n => `│  🔴 ${n}`).join('\n');
                                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                        const txtAll =
                                                `╭══『 🔴 *OFF SEMUA GRUP* 』══╮\n` +
                                                `│\n` +
                                                `│ Fitur: *${namaMapAll[featureKey] || featureKey}*\n` +
                                                `│ Dinonaktifkan di *${sebelumnya.length}* grup:\n` +
                                                `│\n` +
                                                grupLines + '\n' +
                                                `│\n` +
                                                `│ ✅ Semua grup berhasil di-off!\n` +
                                                `│\n` +
                                                `╰══════════════════════════════╯`;
                                        await sendConfirmWithButtons(hisoka, m, txtAll, [
                                                { text: '🏘️ Cek Status Fitur', id: `__cgrupsel__${featureKey}` },
                                                { text: '🏘️ Lihat Fitur GC', id: '__cekauto_gc__' },
                                        ]);
                                } catch (e) {
                                        await t(hisoka, m, `❌ Gagal off semua grup: ${e.message}`);
                                }
                                return true;
                        }
                        return false;
                }

                // ── __cgrupre__ — aktifkan kembali fitur untuk grup tertentu ──────────
                if (txt.startsWith('__cgrupre__')) {
                        const raw = txt.slice('__cgrupre__'.length);
                        const sepIdx = raw.indexOf('__');
                        if (sepIdx !== -1) {
                                const featureKey = raw.slice(0, sepIdx);
                                const targetJid = raw.slice(sepIdx + 2);
                                if (featureKey && targetJid) {
                                        try {
                                                const cfgRe = loadConfig();
                                                if (featureKey === 'welcome' || featureKey === 'goodbye') {
                                                        if (!cfgRe.welcomeGoodbye) cfgRe.welcomeGoodbye = { enabled: true, groups: {} };
                                                        if (!cfgRe.welcomeGoodbye.groups) cfgRe.welcomeGoodbye.groups = {};
                                                        if (!cfgRe.welcomeGoodbye.groups[targetJid]) cfgRe.welcomeGoodbye.groups[targetJid] = {};
                                                        cfgRe.welcomeGoodbye.groups[targetJid][featureKey] = true;
                                                        saveConfig(cfgRe);
                                                        saveCekautoTimestamp(featureKey, targetJid);
                                                } else if (featureKey === 'antiTagSWGrup') {
                                                        toggleAntiTagSW(targetJid, true);
                                                        saveCekautoTimestamp('antiTagSWGrup', targetJid);
                                                } else {
                                                        if (!cfgRe[featureKey]) cfgRe[featureKey] = { groups: {} };
                                                        if (!cfgRe[featureKey].groups) cfgRe[featureKey].groups = {};
                                                        cfgRe[featureKey].groups[targetJid] = { enabled: true, diubahPada: Date.now() };
                                                        saveConfig(cfgRe);
                                                }
                                                const namaMapRe = {
                                                        infowibu: 'Info Wibu', animasu: 'Animasu Notif',
                                                        alqanimenotif: 'Alqanime Notif', tvonenews: 'TV One News',
                                                        malnews: 'MAL News', welcome: 'Welcome',
                                                        goodbye: 'Goodbye', antiTagSWGrup: 'Anti Tag SW (Grup)',
                                                };
                                                let grupNamaRe = targetJid;
                                                try { const meta = await hisoka.groupMetadata(targetJid); grupNamaRe = meta.subject || targetJid; } catch (_) {}
                                                await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                                                const txtRe =
                                                        `╭══『 ✅ *FITUR DIAKTIFKAN* 』══╮\n` +
                                                        `│\n` +
                                                        `│ Fitur: *${namaMapRe[featureKey] || featureKey}*\n` +
                                                        `│ Grup: *${grupNamaRe}*\n` +
                                                        `│\n` +
                                                        `│ ✅ Berhasil diaktifkan kembali!\n` +
                                                        `│\n` +
                                                        `╰══════════════════════════════╯`;
                                                await sendConfirmWithButtons(hisoka, m, txtRe, [
                                                        { text: '🏘️ Lihat Status Grup', id: `__cgrupsel__${featureKey}` },
                                                        { text: '❌ Nonaktifkan Lagi', id: `__cgrupoff__${featureKey}__${targetJid}` },
                                                ], { quoteBot: true });
                                        } catch (e) {
                                                await t(hisoka, m, `❌ Gagal aktifkan fitur: ${e.message}`);
                                        }
                                        return true;
                                }
                        }
                        return false;
                }

                // ── __cekauto_gc__ — shortcut fitur grup dari main menu ───────────────
                if (txt === '__cekauto_gc__') {
                        if (!m.isGroup) { await t(hisoka, m, '❌ Fitur ini hanya bisa digunakan di dalam grup!'); return true; }
                        try { await sendCekautoGrupMsg(hisoka, m); } catch (e) { await t(hisoka, m, `❌ ${e.message}`); }
                        return true;
                }

                // ── __cekauto_main__ — kembali ke main menu cekauto ──────────────────
                if (txt === '__cekauto_main__') {
                        try { await sendCekautoMsg(hisoka, m); } catch (e) { await t(hisoka, m, `❌ ${e.message}`); }
                        return true;
                }

                // ── __addallgrp__ — aktifkan fitur untuk SEMUA grup sekaligus ─────────
                if (txt.startsWith('__addallgrp__')) {
                        const featureKey = txt.slice('__addallgrp__'.length).trim();
                        if (featureKey) {
                                try {
                                        const namaMapAddAll = {
                                                infowibu: 'Info Wibu', animasu: 'Animasu Notif',
                                                alqanimenotif: 'Alqanime Notif', tvonenews: 'TV One News',
                                                malnews: 'MAL News', anigame: 'AN1.COM Game Notif',
                                                nekopoinotif: 'Nekopoi Notif',
                                                welcome: 'Welcome', goodbye: 'Goodbye',
                                                antiTagSWGrup: 'Anti Tag SW (Grup)',
                                        };
                                        await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                                        const allGroupsObj = await hisoka.groupFetchAllParticipating();
                                        const allJids = Object.keys(allGroupsObj || {}).filter(Boolean);
                                        let count = 0;
                                        if (featureKey === 'antiTagSWGrup') {
                                                for (const jid of allJids) {
                                                        toggleAntiTagSW(jid, true);
                                                        saveCekautoTimestamp('antiTagSWGrup', jid);
                                                        count++;
                                                }
                                        } else if (featureKey === 'welcome' || featureKey === 'goodbye') {
                                                const cfgWG = loadConfig();
                                                if (!cfgWG.welcomeGoodbye) cfgWG.welcomeGoodbye = { enabled: true, groups: {} };
                                                if (!cfgWG.welcomeGoodbye.groups) cfgWG.welcomeGoodbye.groups = {};
                                                for (const jid of allJids) {
                                                        if (!cfgWG.welcomeGoodbye.groups[jid]) cfgWG.welcomeGoodbye.groups[jid] = {};
                                                        cfgWG.welcomeGoodbye.groups[jid][featureKey] = true;
                                                        saveCekautoTimestamp(featureKey, jid);
                                                        count++;
                                                }
                                                saveConfig(cfgWG);
                                        } else {
                                                const cfgFeat = loadConfig();
                                                if (!cfgFeat[featureKey]) cfgFeat[featureKey] = { groups: {} };
                                                if (!cfgFeat[featureKey].groups) cfgFeat[featureKey].groups = {};
                                                for (const jid of allJids) {
                                                        cfgFeat[featureKey].groups[jid] = { enabled: true, diubahPada: Date.now() };
                                                        count++;
                                                }
                                                saveConfig(cfgFeat);
                                        }
                                        await hisoka.sendMessage(m.from, { react: { text: '✅', key: m.key } });
                                        await sendConfirmWithButtons(hisoka, m,
                                                `╭══『 ✅ *ADD ALL GRUP* 』══╮\n` +
                                                `│\n` +
                                                `│ Fitur: *${namaMapAddAll[featureKey] || featureKey}*\n` +
                                                `│ Total: *${count}* grup berhasil diaktifkan!\n` +
                                                `│\n` +
                                                `│ ✅ Semua grup sudah aktif secara realtime!\n` +
                                                `│\n` +
                                                `╰══════════════════════════════╯`,
                                                [
                                                        { text: '🏘️ Lihat Status Grup', id: `__cgrupsel__${featureKey}` },
                                                        { text: '🏘️ Lihat Fitur GC', id: '__cekauto_gc__' },
                                                ]
                                        );
                                } catch (e) {
                                        await t(hisoka, m, `❌ Gagal add all grup: ${e.message}`);
                                }
                                return true;
                        }
                        return false;
                }

                return false;
        }

        return {
                CEKAUTO_FITUR_LIST,
                CEKAUTO_GROUP_FITUR_LIST,
                getFeatureTimestamp,
                saveCekautoTimestamp,
                formatRelativeTime,
                getActiveGroupsForFeature,
                disableFeatureForGroup,
                disableFeatureForAllGroups,
                sendCekautoGrupSelectMsg,
                sendCekautoGrupMsg,
                sendCekautoMsg,
                handleCekauto,
                handleCekautoCallbacks,
        };
}

export { makeCekautoHelpers };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(cekauto|cekfitur|autolist)$/i;
export const tags = ['setting'];
export const help = ['cekauto'];
async function runCekauto(ctx) {
    const { _handleCekautoFn, hisoka, logCommand, m, query, tolak } = ctx;
    await _handleCekautoFn({ hisoka, m, query, tolak, logCommand });
}
export default runCekauto;
// (handler diambil dari ctx._handleCekautoFn — singleton factory message.js)
