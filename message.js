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
 *  message.js — Dispatcher utama semua command bot
 *  Guard jadibot, owner, callback, dan hot-reload command
 * ───────────────────────────────
 */
'use strict';

import fs from 'fs';
import path from 'path';
import os from 'os';
import { PassThrough } from 'stream';
import { importLazy } from './src/helper/esmLazy.js';
import { findPlugin, resolvePluginHandler } from './handler.js';
import { isJidGroup, downloadMediaMessage, getContentType, generateWAMessageFromContent, generateWAMessageContent, prepareWAMessageMedia, proto, jidDecode, jidNormalizedUser } from '@whiskeysockets/baileys';
import crypto from 'crypto';
import { exec } from 'child_process';
import util from 'util';

import { msToTime, loadConfig, saveConfig, getCaseName, getCaseGroups, getAIPersonaName, getAIPersonaGreeting } from './src/helper/utils.js';
import { BROWSER_LIST } from './name_perangkat_tertautan.js';
import { stopAutoCleaner, restartAutoCleaner, cleanStaleSessionFiles, clearOldFiles, clearTmpFolder } from './src/helper/cleaner.js';
import { getUptimeFormatted, getBotStats } from './src/db/botStats.js';
import { logError, formatErrorReport, clearErrors, generateErrorFileTxt, getInfoErrorTxtPath, getErrorStats } from './src/db/errorLog.js';
import { startJadibot, startJadibotQR, stopJadibot, jadibotMap, jadibotClearSesiMap, jadibotSesiReportMap, jadibotConnectedAt, pendingJadibotChoices, formatPairingCode, maskNumber, parseJadibotDuration, getJadibotExpiry, formatRemainingTime, getJadibotExpirySummary, cleanupExpiredJadibots, removeJadibotExpiry, setPermanentJadibot, ensureJadibotExpiry, extendJadibotExpiry, reduceJadibotExpiry, scheduleJadibotExpiry, startJadibotAutoOnline, getLogoutSavedMs, clearLogoutSavedMs } from './src/helper/jadibot.js';
import { hasViewOnceCache, getViewOnceCache } from './src/helper/voCache.js';
import { isAntiTagSWEnabled, toggleAntiTagSW, resetWarnings, getWarnings, getAllAntiTagSWGroups, getAntiTagSWLog, clearAntiTagSWLog, resolveLidFromContacts, handleAntitagsw as _handleAntitagswFn, handleAntitagswCallbacks as _handleAntitagswCallbacksFn } from './SEMUA_FITUR/group/antitagsw.js';
import { handleAntilink as _handleAntilinkFn, handleAntilinkCallbacks as _handleAntilinkCallbacksFn, handleAntilinkStatusReply as _handleAntilinkStatusReplyFn } from './SEMUA_FITUR/group/antilink.js';
import handleAntiTagBotAuto, { handleAntitag as _handleAntitagFn } from './SEMUA_FITUR/group/antitag.js';
import { handleAd as _handleAdFn } from './SEMUA_FITUR/group/antidelete.js';
// yg bawah pindah ke sini
import { injectMessage } from './src/helper/inject.js';
import listenEvent from './SEMUA_FITUR/event/event.js';
import gemini from './src/helper/gemini.js';
import { updateUserName, getUserName } from './src/db/userDb.js';
import { loadUserMemory, detectAndUpdateMemory, clearUserMemory, clearAllUserMemory, memoryToReadable } from './src/helper/userMemory.js';
import { searchAndGetImage, searchAndGetImages, extractImagesFromText } from './src/helper/imageSearch.js';
import { extractSongsFromText, extractVideosFromText, extractReplyStickersFromText, extractTikTokFromText, extractInstagramFromText, extractFacebookFromText, extractYouTubeAudioFromText, hasMediaDownloadMarker, hasSocialDLMarker, hasStickerMarker, extractVoiceNotesFromText, extractStickersFromText, hasCuacaMarker, extractCuacaFromText } from './src/helper/aiTools.js';
import { getHistory, addToHistory, clearHistory, clearAllHistory, countHistory, getSessionKey, buildHistoryMeta, wrapCurrentUserMessage } from './src/db/aiHistory.js';
import { kvGet, kvSet } from './src/db/datadb.js';
import { sendAIReply } from './src/helper/aiReact.js';
import { buildSmartAlbumCaptionPrompt, buildSmartImageHistoryPrompt, buildSmartImageWaitPrompt, buildWilyAICommandPrompt, buildWilyFallbackUserPrompt, buildWilyMediaUserPrompt, buildWilyVisionContextPrompt, buildVideoDownloadCaptionPrompt, buildStickerAnalysisExtractionPrompt } from './src/helper/aiPrompt.js';
import { buildIgVisionPrompt, buildIgCaptionPrompt, buildIgFallbackCaption, parseIgMetaHtml, formatIgCount } from './src/helper/AiPromptIg.js';
import { buildFbVisionPrompt, buildFbCaptionPrompt, buildFbFallbackCaption, parseFbMetaHtml, formatFbCount } from './src/helper/AiPromptFb.js';
import { hashSticker, lookupSticker, saveSticker, incrementStickerSeen, buildStickerContextHint, getStickerMemoryStats } from './src/helper/stickerMemory.js';
import { getJadibotAntidel, getJadibotReadsw, getJadibotAnticall, getJadibotAnticallvid, getJadibotAutoOnline, getJadibotAutoTyping, getJadibotAutoRecording, getJadibotReadchat, setJadibotUserSetting, getJadibotNumber, addJadibotEmojis, deleteJadibotEmojis, listJadibotEmojis, getJadibotEmojiMode, setDefaultEmojiMode, setCustomEmojiMode, resetToDefaultEmojis, clearJadibotEmojis } from './src/helper/jadibotSettings.js';
import { getMode as getMainEmojiMode } from './src/helper/emoji.js';
import { pruneSwStatsAt, countActiveSW } from './src/helper/swtrack.js';
import { getHandler } from './src/helper/hotReload.js';
import { makeCekautoHelpers as _makeCekautoHelpers } from './SEMUA_FITUR/setting/cekauto-cmd.js';
import { resolveThumbnailMedia, startTyping, makeInteractiveMsg as _makeInteractiveMsg } from './SEMUA_FITUR/helper/interactive-msg.js';
import { AI_MEDIA_CACHE_TTL, AI_MEDIA_TYPES, ensureAIMediaCache, rememberAIMedia, getQuotedStanzaId, getCachedQuotedMedia, unwrapMessagePayload, getMediaTypeFromMessage, downloadMediaBuffer, getQuotedMediaBuffer, getMediaInfo } from './SEMUA_FITUR/helper/media-helper.js';
import { makeLogCmd as _makeLogCmd } from './SEMUA_FITUR/helper/log-cmd.js';
import { normalizeJadibotNumber } from './SEMUA_FITUR/jadibot/jadibot-cmd.js';
import { formatAlqLinkMsg, pickBestAlqLink, getAllAlqLinksByPriority } from './SEMUA_FITUR/anime/alqolam-helpers.js';
import { detectImageSearchQuery, extractImageCount, cleanImageTitle, makeWilyHelpers as _makeWilyHelpers } from './SEMUA_FITUR/ai/wily-helpers.js';
import { handleAutoSimi } from './SEMUA_FITUR/ai/autosimi-cmd.js';
// ─── musikai & musikai2 dihentikan (backend API tidak lagi gratis, memerlukan pembayaran) ───
// const { handleMusicAICallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/music/musikai-cmd.js'));
// const { handleMusicAI2Callbacks } = await importLazy(path.resolve('./SEMUA_FITUR/music/musikai2-cmd.js'));
import { handleAlqUpdateChoice, handleAlqDlChoice } from './SEMUA_FITUR/anime/alqanime-cmd.js';
import { handleCosplayChoice, sendCosplayImages as _sendCosplayImages } from './SEMUA_FITUR/anime/cosplay-cmd.js';
import { handleKomiktapChoice } from './SEMUA_FITUR/anime/komiktap-cmd.js';
import { handleSetbrowserListReply, handleSetbrowserConfirmReply } from './SEMUA_FITUR/setting/setbrowser-cmd.js';
import { handlePlayChoice } from './SEMUA_FITUR/music/play-cmd.js';

const WILY_VERBOSE_LOGS = process.env.WILY_VERBOSE_LOGS === 'true' || process.env.BOT_DEBUG_LOG === 'true';
const wilyLog = (...args) => {
        if (WILY_VERBOSE_LOGS) console.log(...args);
};
const wilyError = (...args) => {
        if (WILY_VERBOSE_LOGS) console.error(...args);
};

const tolak = async (_hydro, m, teks) => await m.reply(teks);

// ── Initialize interactive message helpers ──
const { listbut2, sendConfirmWithButtons, sendAudioWithButtons } = _makeInteractiveMsg({ loadConfig, tolak });

// ── Initialize log command helpers ──
const { logCommand, _logCmdBox } = _makeLogCmd({ maskNumber });

// ── Initialize AI image/media helpers from wily-helpers.js ──
const {
    buildSmartImageWaitText, buildSmartAlbumCaptions, sendImageAlbum,
    buildSmartImageHistoryReply, ensureYtdlp, processAIMediaAndSend,
} = _makeWilyHelpers({
    gemini, buildSmartImageWaitPrompt, buildSmartAlbumCaptionPrompt, buildSmartImageHistoryPrompt,
    rememberAIMedia, sendAIReply, tolak,
    extractImagesFromText, hasStickerMarker, extractStickersFromText, extractReplyStickersFromText,
    extractVoiceNotesFromText, extractSongsFromText, extractVideosFromText, extractYouTubeAudioFromText,
    extractTikTokFromText, extractInstagramFromText, extractFacebookFromText, hasMediaDownloadMarker, hasSocialDLMarker,
    hasCuacaMarker, extractCuacaFromText,
    downloadMediaMessage,
    wilyLog, wilyError,
});

// ── Initialize cekauto helpers from cekauto-cmd.js ──
const {
    CEKAUTO_FITUR_LIST,
    saveCekautoTimestamp,
    handleCekauto: _handleCekautoFn,
    handleCekautoCallbacks: _handleCekautoCallbacksFn,
} = _makeCekautoHelpers({
    loadConfig, saveConfig, getAllAntiTagSWGroups, toggleAntiTagSW, isAntiTagSWEnabled,
    sendConfirmWithButtons, tolak,
});

// ── AntiTagSW callbacks (button/session reply) — imported from antitagsw.js ──

const pendingPlayChoices = new Map();
// musikai cache dihapus (fitur dihentikan karena backend tidak lagi gratis)
const pendingAlqDlChoices = new Map();
const pendingAlqUpdateChoices = new Map();
const pendingAlqNotifChoices   = new Map();
const pendingNekpoiNotifChoices    = new Map();
const pendingHentaicopNotifChoices = new Map();
const pendingAntilinkChoices = new Map();
const pendingCosplayChoices = new Map();
const pendingKomikChoices = new Map();
const pendingFontuntikChoices = new Map(); // key → { text, botMsgId, expiresAt, timeout }
const pendingWaifuChoices     = new Map(); // key → { stage, mode, botMsgKey, expiresAt, timeout }
const pendingHentaidadChoices = new Map(); // key → { results, botMsgId, expiresAt, loading, timeout }
const pendingHentaidadConfirm = new Map(); // key → { chosen, galleryData, sentKey, confirmMsgId, expiresAt, loading, timeout }
const pendingStickerlyChoices = new Map(); // key → { results, botMsgId, expiresAt, loading, timeout }
const pendingShutdownConfirm  = new Map(); // key → { type: 'mati'|'restart', expiresAt, timeout, botMsgId }
const iqcLastMsg = new Map(); // jid → injected m (pesan terakhir per chat, untuk .iqc tanpa reply)

const aiReplyCooldown = new Map(); // sender → last reply timestamp
const AI_COOLDOWN_MS = 3000; // 3 detik cooldown per user

function isAICooldown(sender) {
    const last = aiReplyCooldown.get(sender);
    if (!last) return false;
    return (Date.now() - last) < AI_COOLDOWN_MS;
}

function setAICooldown(sender) {
    aiReplyCooldown.set(sender, Date.now());
    setTimeout(() => aiReplyCooldown.delete(sender), AI_COOLDOWN_MS + 500);
}

function parseYtdlpError(stderr, fallback) {
    if (!stderr) return fallback || 'Unknown error';
    const errorLine = stderr.split('\n').find(l => l.trim().startsWith('ERROR:'));
    if (errorLine) {
        return errorLine.replace(/^ERROR:\s*/, '').replace(/^\[youtube\]\s*[^:]+:\s*/, '').trim();
    }
    return fallback || stderr.substring(0, 150);
}


function getSenderNumber(m) {
    if (m.key?.participant) return m.key.participant.split('@')[0];
    if (m.key?.remoteJid) return m.key.remoteJid.split('@')[0];
    return null;
}

function getJadibotChoiceKey(m) {
    const sender = m.key?.participant || m.key?.remoteJid || m.sender || '';
    const chat   = m.key?.remoteJid || m.from || '';
    return `${chat}::${sender}`;
}

function isMainBot(hisoka) {
    return hisoka?.isMainBot !== false;
}

function isNoSpaceError(error) {
    if (!error) return false;
    const code = error.code || '';
    const msg  = (error.message || String(error)).toLowerCase();
    return code === 'ENOSPC' || msg.includes('no space left') || msg.includes('enospc');
}

// Deteksi error "socket mati" — terjadi saat jadibot logout tapi masih ada pesan di queue
// Contoh: not-acceptable (406), EPIPE, Connection Closed, dsb.
// Jika ini terjadi, jangan log sebagai error besar & jangan coba reply (socket sudah mati)
function isDeadSocketError(error) {
    if (!error) return false;
    const msg = (error.message || String(error)).toLowerCase();
    const statusCode = error?.output?.statusCode ?? error?.data?.statusCode ?? 0;
    return statusCode === 406
        || msg === 'not-acceptable'
        || msg.includes('not-acceptable')
        || msg.includes('connection closed')
        || msg.includes('socket closed')
        || msg.includes('epipe')
        || msg.includes('stream closed')
        || msg.includes('websocket closed');
}

async function cleanupWritePressure() {
    try {
        await clearTmpFolder();
    } catch (_) {}
    try {
        await clearOldFiles();
    } catch (_) {}
}

async function getUserProfilePictureUrl(hisoka, jid) {
    try {
        // Beri timeout 4 detik — tanpa ini bisa hang lama dan .menu tidak merespon
        return await Promise.race([
            hisoka.profilePictureUrl(jid, 'image'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('pp_timeout')), 4000)),
        ]);
    } catch (_) {
        return null;
    }
}


class Button {
    constructor() {
        this._title = '';
        this._subtitle = '';
        this._body = '';
        this._footer = '';
        this._beton = [];
        this._data = undefined;
        this._contextInfo = {};
        this._currentSelectionIndex = -1;
        this._currentSectionIndex = -1;
        this._type = 0;
        this._betonOld = [];
        this._params = {};
        this._selfReply = false;
    }
    selfReply() { this._selfReply = true; return this; }
    setVideo(path, options = {}) {
        Buffer.isBuffer(path) ? this._data = { video: path, ...options } : this._data = { video: { url: path }, ...options };
        return this;
    }
    setImage(path, options = {}) {
        Buffer.isBuffer(path) ? this._data = { image: path, ...options } : this._data = { image: { url: path }, ...options };
        return this;
    }
    setDocument(path, options = {}) {
        Buffer.isBuffer(path) ? this._data = { document: path, ...options } : this._data = { document: { url: path }, ...options };
        return this;
    }
    setMedia(obj) {
        if (typeof obj === 'object' && !Array.isArray(obj)) { this._data = obj; } else { return 'Type of media must be an Object'; }
        return this;
    }
    setTitle(title) { this._title = title; return this; }
    setSubtitle(subtitle) { this._subtitle = subtitle; return this; }
    setBody(body) { this._body = body; return this; }
    setFooter(footer) { this._footer = footer; return this; }
    setContextInfo(obj) {
        if (typeof obj === 'object' && !Array.isArray(obj)) { this._contextInfo = obj; } else { return 'Type of contextInfo must be an Object'; }
        return this;
    }
    setParams(obj) {
        if (typeof obj === 'object' && !Array.isArray(obj)) { this._params = obj; } else { return 'Type of params must be an Object'; }
        return this;
    }
    setButton(name, params) { this._beton.push({ name, buttonParamsJson: JSON.stringify(params) }); return this; }
    setButtonV2(params) { this._betonOld.push(params); return this; }
    makeRow(header = '', title = '', description = '', id = '') {
        if (this._currentSelectionIndex === -1 || this._currentSectionIndex === -1) throw new Error('You need to create a selection and a section first');
        const buttonParams = JSON.parse(this._beton[this._currentSelectionIndex].buttonParamsJson);
        buttonParams.sections[this._currentSectionIndex].rows.push({ header, title, description, id });
        this._beton[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
        return this;
    }
    makeSections(title = '', highlight_label = '') {
        if (this._currentSelectionIndex === -1) throw new Error('You need to create a selection first');
        const buttonParams = JSON.parse(this._beton[this._currentSelectionIndex].buttonParamsJson);
        buttonParams.sections.push({ title, highlight_label, rows: [] });
        this._currentSectionIndex = buttonParams.sections.length - 1;
        this._beton[this._currentSelectionIndex].buttonParamsJson = JSON.stringify(buttonParams);
        return this;
    }
    addSelection(title) {
        this._beton.push({ name: 'single_select', buttonParamsJson: JSON.stringify({ title, sections: [] }) });
        this._currentSelectionIndex = this._beton.length - 1;
        this._currentSectionIndex = -1;
        return this;
    }
    addReply(display_text = '', id = '') { this._beton.push({ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text, id }) }); return this; }
    addReplyV2(displayText = 'Nixel', buttonId = 'Nixel') { this._betonOld.push({ buttonId, buttonText: { displayText }, type: 1 }); this._type = 1; return this; }
    addCall(display_text = '', id = '') { this._beton.push({ name: 'cta_call', buttonParamsJson: JSON.stringify({ display_text, id }) }); return this; }
    addUrl(display_text = '', url = '', merchant_url = '') { this._beton.push({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text, url, merchant_url }) }); return this; }
    addCopy(display_text = '', copy_code = '', id = '') { this._beton.push({ name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text, copy_code, id }) }); return this; }
    async run(jid, conn, quoted = '') {
        if (this._type === 0) {
            const header = {
                title: this._title,
                subtitle: this._subtitle,
                hasMediaAttachment: !!this._data,
                ...(this._data ? await prepareWAMessageMedia(this._data, { upload: conn.waUploadToServer }) : {})
            };

            // Fungsi pembuat content BARU tiap kali dipanggil
            // → mencegah circular reference akibat Baileys mutasi contextInfo in-place
            const makeContent = () => ({
                interactiveMessage: {
                    body: { text: this._body },
                    footer: { text: this._footer },
                    header,
                    contextInfo: { ...this._contextInfo },
                    nativeFlowMessage: {
                        messageParamsJson: JSON.stringify(this._params),
                        buttons: this._beton
                    }
                }
            });

            // ── Self-reply: generate temp (content baru) → ambil ID →
            //   generate final (content baru lagi) dengan ID sama + quoted=temp
            //   → Baileys inject contextInfo self-reply tanpa circular reference ✓
            let finalQuoted = quoted;
            let forceMessageId;
            if (this._selfReply) {
                const temp = generateWAMessageFromContent(jid, makeContent(), { userJid: conn.user?.id });
                finalQuoted    = temp;
                forceMessageId = temp.key.id;
            }

            const msg = generateWAMessageFromContent(jid, makeContent(), {
                userJid : conn.user?.id,
                quoted  : finalQuoted,
                ...(forceMessageId ? { messageId: forceMessageId } : {})
            });
            await conn.relayMessage(msg.key.remoteJid, msg.message, {
                messageId: msg.key.id,
                additionalNodes: [{
                    tag: 'biz',
                    attrs: {},
                    content: [{
                        tag: 'interactive',
                        attrs: { type: 'native_flow', v: '1' },
                        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                    }]
                }]
            });
            return msg;
        } else {
            return await conn.sendMessage(jid, {
                ...(this._data ? this._data : {}),
                [this._data ? 'caption' : 'text']: this._body,
                title: (!!this._data ? null : this._title),
                footer: this._footer,
                viewOnce: true,
                contextInfo: this._contextInfo,
                buttons: [
                    ...this._betonOld,
                    ...this._beton.map(b => ({
                        buttonId: 'id',
                        buttonText: { displayText: 'btn' },
                        type: 1,
                        nativeFlowInfo: { name: b.name, paramsJson: b.buttonParamsJson }
                    }))
                ]
            }, { quoted });
        }
    }
}

// ── ZIP FILE PARSER (pure Node.js, no external lib) ──

const pendingAturBrowser = new Map();
const listAturBrowserMap = new Map();

export default async function ({ message, type: messagesType }, hisoka) {
        let m;
        try {
                m = await injectMessage(hisoka, message);

                if (!m || !m.message) return;

                // ── IQC: simpan pesan terakhir per chat (bukan command bot) ──
                try {
                        const _isCmd = /^[.!/]/.test(String(m.text || '').trim());
                        const _msgType = String(m.type || '');
                        if (!_isCmd && (_msgType === 'conversation' || _msgType === 'extendedTextMessage' || _msgType === 'stickerMessage' || _msgType === 'imageMessage') && m.from) {
                                if (iqcLastMsg.size > 500) {
                                        const _first = iqcLastMsg.keys().next().value;
                                        iqcLastMsg.delete(_first);
                                }
                                iqcLastMsg.set(m.from, m);
                        }
                } catch (_) {}

                // Guard: jika ini jadibot socket tapi sudah logout dari jadibotMap → skip
                // Mencegah pesan yang sudah masuk queue diproses setelah socket mati
                if (hisoka?.isMainBot === false) {
                        const _jbNum = typeof getJadibotNumber === 'function' ? getJadibotNumber(hisoka) : null;
                        if (_jbNum && !jadibotMap.has(_jbNum)) return;
                        // Tambahan: cek ws.readyState — 1 = OPEN, selain itu socket sudah mati
                        const _wsState = hisoka?.ws?.readyState;
                        if (typeof _wsState === 'number' && _wsState !== 1) return;
                }

                // Pesan channel tetap diblokir, kecuali command cekjidch yang memang
                // dipakai untuk membaca JID channel tempat command tersebut dikirim.
                if (m.from?.endsWith('@newsletter') && m.command !== 'cekjidch') return;

                // Fire-and-forget — jangan await listenEvent agar command tidak tertunda
                // listenEvent lakukan network calls (read receipt, react SW, delay) yang tidak
                // perlu memblokir eksekusi command. Hasilnya tidak dipakai di sini.
                Promise.resolve(listenEvent(m, hisoka)).catch(() => {});

                const quoted = m.isMedia ? m : m.isQuoted ? m.quoted : m;
                const text = m.text;
                const query = m.query || quoted.query;

                if (!m.key) return;

                // Simpan nama user ke DB per-user
                if (m.sender && m.pushName) {
                        updateUserName(m.sender, m.pushName);
                }
                // Blokir SEMUA pesan yang dikirim oleh bot sendiri (fromMe + ID 3EB0)
                // — bot tidak boleh memproses pesannya sendiri sebagai command apapun
                if (m.isBot) return;
                // Blokir pesan dari device lain (sinkronisasi) kecuali ada command
                if (messagesType === 'append' && !m.command) return;

                // Anti-Tag Bot sudah dihandle via dedicated listener di index.js

                // AutoSimi / WilyAutoReply → autosimi-cmd.js
                if (await handleAutoSimi({ hisoka, m, messagesType,
                        loadConfig, gemini, getUserName, getAIPersonaName, getAIPersonaGreeting,
                        getMediaTypeFromMessage, getCachedQuotedMedia, getQuotedMediaBuffer, getMediaInfo,
                        detectImageSearchQuery, extractImageCount,
                        buildWilyFallbackUserPrompt, buildWilyMediaUserPrompt, buildWilyAICommandPrompt, buildWilyVisionContextPrompt,
                        buildSmartImageWaitText, buildSmartAlbumCaptions, sendImageAlbum, buildSmartImageHistoryReply,
                        searchAndGetImage, searchAndGetImages,
                        rememberAIMedia, processAIMediaAndSend,
                        addToHistory, getHistory, getSessionKey, buildHistoryMeta, wrapCurrentUserMessage,
                        detectAndUpdateMemory, startTyping,
                        hashSticker, lookupSticker, saveSticker, incrementStickerSeen, buildStickerContextHint,
                        buildStickerAnalysisExtractionPrompt,
                        resolveLidFromContacts,
                        isAICooldown, setAICooldown, tolak, wilyLog, wilyError,
                })) return;
                
                // === GUARD SELF-MODE ===
                // Pisahkan 3 identitas jelas: owner asli, bot sendiri, userjadibot
                if (hisoka?.isMainBot === false) {
                        // ── JADIBOT: izinkan isOwner (owner config) ATAU pemilik sesi jadibot ini
                        const _senderNum = String(m.sender || '').split('@')[0].split(':')[0];
                        const _jadibotUserNum = String(hisoka.jadibotUserNumber || '').split('@')[0].split(':')[0];
                        const _isJadibotUser = !!_jadibotUserNum && _senderNum === _jadibotUserNum;
                        if (!m.isOwner && !_isJadibotUser) {
                            return;
                        }
                        const jadibotAllowedCommands = new Set([
                            'p', 'ping',
                            'menu',
                            'rvo', 'viewonce', 'vo', 'rvo2',
                            'antidel', 'ad',
                            'readsw',
                            'anticall', 'ac',
                            'anticallvid', 'acv',
                            'autocallaudio', 'aca',
                            'online',
                            'readchat',
                            'typing', 'typ',
                            'recording', 'record',
                            'allunduh', 'unduhsemua', 'dl', 'tt', 'ig', 'fb', 'facebook', 'fbdl', 'twdl', 'xdl', 'twitterdl', 'twitter', 'ytmp3', 'ytmp4', 'play',
                            'animgif', 'animegif', 'gifanime',
                            'sticker', 'stiker', 's',
                            'wm', 'swm',
                            'toimg',
                            'hd', 'remini', 'hdr', 'hdvid', 'vidhd', 'hdvideo',
                            'upswgc', 'swgc', 'swgrup', 'swgroup', 'statusgrup', 'statusgroup',

                            'ceksw',
                            'ceksetting',
                            'emoji',
                            'emojiadd', 'emojidel', 'emojilist',
                            'emojidefault', 'emojicustom', 'emojiclear',
                            'ceksesi',
                            'clearsesi', 'cs',
                             'del', 'd', 'delbot',
                            'font', 'fontgen',
                            'fontuntik',
                             'getppuser',
                            'logo'
                        ]);
                        const _rawText = (m.text || '').trim();
                        const _isFontuntikChoice = _rawText.startsWith('fu_');
                        if (!_isFontuntikChoice && !jadibotAllowedCommands.has(m.command)) {
                            return;
                        }
                } else {
                        // ── BOT UTAMA: self mode
                        // Jika sender adalah nomor jadibot aktif → skip, biarkan jadibotnya merespon
                        const _senderPhoneNum = String(m.sender || '').split('@')[0].split(':')[0];
                        if (m.command && jadibotMap.has(_senderPhoneNum)) {
                            return;
                        }

                        // Hanya isRealOwner yang boleh jalankan command di bot utama
                        // Pengecualian: pilihan play (1/2) tetap diproses meski ada di pendingPlayChoices
                        const _isPendingPlay = pendingPlayChoices.has(m.sender);
                        const _choice = (m.text || '').trim();
                        const _isPlayChoice = _isPendingPlay && (_choice === '1' || _choice === '2');

                        if (m.command && !m.isRealOwner && !_isPlayChoice) {
                            return;
                        }
                }


                if (hisoka?.isMainBot === true && m.isOwner) {
                        const jadibotChoiceKey = getJadibotChoiceKey(m);
                        const pendingJadibot = pendingJadibotChoices.get(jadibotChoiceKey);
                        if (pendingJadibot) {
                                const now = Date.now();
                                const rawChoice = String(m.text || '').trim();
                                const lowerChoice = rawChoice.toLowerCase();

                                // Harus reply ke pesan listbot, bukan sembarang pesan
                                const quotedId = getQuotedStanzaId(m);
                                // Jika botMsgId tidak tertangkap (kosong), izinkan reply apapun ke chat ini
                                const isReplyToList = m.isQuoted && (
                                        !pendingJadibot.botMsgId || quotedId === pendingJadibot.botMsgId
                                );

                                if (!rawChoice || ['jadibot', 'stopbot', 'listbot', 'jadibotmenu'].includes(m.command)) {
                                        // pesan command, abaikan
                                } else if (!isReplyToList) {
                                        // bukan reply ke pesan listbot, biarkan lanjut normal
                                } else if (pendingJadibot.expiresAt && pendingJadibot.expiresAt <= now) {
                                        pendingJadibotChoices.delete(jadibotChoiceKey);
                                        await tolak(hisoka, m, '⏳ *Waktu pemilihan sudah habis.*\n> _Ketik_ `.listbot` _lagi untuk refresh._');
                                        return;
                                } else if (lowerChoice === 'batal' || lowerChoice === 'cancel') {
                                        if (pendingJadibot.timeout) clearTimeout(pendingJadibot.timeout);
                                        pendingJadibotChoices.delete(jadibotChoiceKey);
                                        await tolak(hisoka, m, '✅ *Dibatalkan.*\n_Bot tidak dihentikan._');
                                        return;
                                } else {
                                        // ── Confirm mode: user sudah pilih nomor/multi, tinggal tap Yes/No ──
                                        if (pendingJadibot.confirmMode) {
                                                const _confirmNum     = pendingJadibot.confirmNumber;
                                                const _confirmTargets = pendingJadibot.confirmTargets;
                                                const _isMulti = Array.isArray(_confirmTargets) && _confirmTargets.length > 0;
                                                const _isYes = rawChoice === '__jbstop_yes__' || ['ya','yes','iya','y'].includes(lowerChoice);
                                                const _isNo  = rawChoice === '__jbstop_no__'  || ['tidak','no','n','batal','cancel'].includes(lowerChoice);
                                                if (_isYes) {
                                                        if (pendingJadibot.timeout) clearTimeout(pendingJadibot.timeout);
                                                        pendingJadibotChoices.delete(jadibotChoiceKey);
                                                        if (_isMulti) {
                                                                // Multi-stop
                                                                const _activeNow  = [...jadibotMap.keys()];
                                                                const _stillActive = _confirmTargets.filter(t => _activeNow.includes(t.num));
                                                                if (_stillActive.length === 0) {
                                                                        await tolak(hisoka, m, '❌ *Semua bot sudah tidak aktif.*\n> _Ketik `.listbot` untuk refresh._');
                                                                        return;
                                                                }
                                                                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                                                                const _label = _stillActive.map(t => `\`+${maskNumber(t.num)}\``).join(' · ');
                                                                await tolak(hisoka, m, `🛑 *Menghentikan ${_stillActive.length} bot...*\n${_label}`);
                                                                for (const { num } of _stillActive) {
                                                                        await stopJadibot(num, async (text) => { await tolak(hisoka, m, text); });
                                                                }
                                                        } else {
                                                                // Single stop
                                                                if (!_confirmNum || ![...jadibotMap.keys()].includes(_confirmNum)) {
                                                                        await tolak(hisoka, m, '❌ *Bot sudah tidak aktif atau tidak ditemukan.*\n> _Ketik `.listbot` untuk refresh._');
                                                                        return;
                                                                }
                                                                await hisoka.sendMessage(m.from, { react: { text: '⏳', key: m.key } });
                                                                await stopJadibot(_confirmNum, async (text) => { await tolak(hisoka, m, text); });
                                                        }
                                                } else if (_isNo) {
                                                        if (pendingJadibot.timeout) clearTimeout(pendingJadibot.timeout);
                                                        pendingJadibotChoices.delete(jadibotChoiceKey);
                                                        await tolak(hisoka, m, '❌ *Dibatalkan.*\n_Bot tidak dihentikan._\n\n> _Ketik `.listbot` untuk kembali ke daftar._');
                                                } else {
                                                        await tolak(hisoka, m, '⚠️ Pilih tombol *✅ Ya, Stop* atau *❌ Tidak, Batal* di atas.');
                                                }
                                                return;
                                        }

                                        await cleanupExpiredJadibots(async () => {});
                                        const activeList = [...jadibotMap.keys()];
                                        const maxNum = pendingJadibot.numbers.length;

                                        // Cek format multi-stop: "1,2,3" atau "1.2.3"
                                        // (semua bagian angka murni, min 2 bagian, pemisah , atau .)
                                        const multiParts = rawChoice.split(/[,.]+/).map(s => s.trim()).filter(Boolean);
                                        const isMultiStop = multiParts.length >= 2 && multiParts.every(s => /^\d{1,3}$/.test(s));
                                        if (isMultiStop) {
                                                const seen = new Set();
                                                const validTargets = [];
                                                for (const part of multiParts) {
                                                        if (seen.has(part)) continue;
                                                        seen.add(part);
                                                        const idx = Number(part);
                                                        if (idx < 1 || idx > pendingJadibot.numbers.length) continue;
                                                        const tNum = pendingJadibot.numbers[idx - 1];
                                                        if (!tNum || !activeList.includes(tNum)) continue;
                                                        validTargets.push({ idx, num: tNum });
                                                }
                                                if (validTargets.length === 0) {
                                                        await tolak(hisoka, m,
                                                                `❌ *Tidak ada bot valid untuk dihentikan.*\n` +
                                                                `_Urutan tidak ditemukan atau sudah tidak aktif._\n` +
                                                                `> _Ketik_ \`.listbot\` _untuk refresh._`
                                                        );
                                                        return;
                                                }
                                                // Jangan langsung stop — tampilkan daftar & minta konfirmasi Button Quick Reply
                                                const _multiLines = validTargets.map(t =>
                                                        `  *${t.idx}.* +${maskNumber(t.num)}`
                                                ).join('\n');

                                                pendingJadibot.confirmMode    = true;
                                                pendingJadibot.confirmTargets = validTargets;
                                                pendingJadibot.confirmNumber  = null;

                                                const _multiBody =
                                                        `🛑 *Konfirmasi Stop ${validTargets.length} Jadibot*\n` +
                                                        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                                                        `📋 *Bot yang akan dihentikan:*\n` +
                                                        `${_multiLines}\n\n` +
                                                        `⚠️ Yakin ingin menghentikan *${validTargets.length} bot* sekaligus?\n` +
                                                        `> _Tindakan ini tidak bisa dibatalkan setelah dikonfirmasi._`;

                                                try {
                                                        const _confirmBtn = new Button()
                                                                .setBody(_multiBody)
                                                                .setFooter(`⚡ Wily Bot • Stop Jadibot`)
                                                                .addReply(`✅ Ya, Stop ${validTargets.length} Bot`, '__jbstop_yes__')
                                                                .addReply('❌ Tidak, Batal', '__jbstop_no__');
                                                        await _confirmBtn.run(m.from, hisoka, m);
                                                } catch (_) {
                                                        await tolak(hisoka, m,
                                                                _multiBody + `\n\n` +
                                                                `✅ Reply \`ya\` untuk stop semua\n` +
                                                                `❌ Reply \`batal\` untuk batal`
                                                        );
                                                }
                                                return;
                                        }

                                        // Cek format atur durasi (upbot/downbot), satu atau BANYAK target sekaligus
                                        // dipisah "|". Tiap bagian formatnya "idx,durasi":
                                        //   - "3,1d,20m"      → target 3, tambah 1 hari 20 menit (upbot)
                                        //   - "1,-45m"        → target 1, kurangi 45 menit (downbot, prefix "-")
                                        //   - "2,p"           → target 2, ubah ke permanent
                                        //   - "3,1d,20m|1,30d" → banyak target sekaligus, dipisah "|"
                                        const ADJUST_SEGMENT_RE = /^(\d{1,3})\s*[,.]\s*(-)?\s*(.+)$/;
                                        const adjustSegmentsRaw = rawChoice.split('|').map(s => s.trim()).filter(Boolean);
                                        const isAdjustFormat = adjustSegmentsRaw.length >= 1 &&
                                                adjustSegmentsRaw.every(seg => ADJUST_SEGMENT_RE.test(seg));

                                        if (isAdjustFormat) {
                                                const results = [];

                                                for (const seg of adjustSegmentsRaw) {
                                                        const segMatch = seg.match(ADJUST_SEGMENT_RE);
                                                        const idx = Number(segMatch[1]);
                                                        const isMinus = !!segMatch[2];
                                                        const durStr = segMatch[3].trim();
                                                        const durInfo = parseJadibotDuration(durStr);

                                                        if (idx < 1 || idx > pendingJadibot.numbers.length) {
                                                                results.push({ idx, ok: false, error: `Urutan tidak valid _(masukkan 1-${maxNum})_.` });
                                                                continue;
                                                        }
                                                        const targetNum = pendingJadibot.numbers[idx - 1];
                                                        if (!targetNum || !activeList.includes(targetNum)) {
                                                                results.push({ idx, ok: false, error: 'Bot tidak ditemukan atau sudah tidak aktif.' });
                                                                continue;
                                                        }
                                                        if (!durInfo) {
                                                                results.push({ idx, targetNum, ok: false, error: `Format durasi \`${durStr}\` tidak valid.` });
                                                                continue;
                                                        }
                                                        if (isMinus && durInfo.ms === 'permanent') {
                                                                results.push({ idx, targetNum, ok: false, error: `Tidak bisa kurangi ke "permanent". Pakai \`${idx},p\` (tanpa "-") untuk set permanent.` });
                                                                continue;
                                                        }

                                                        const adjSendReply = async (msg) => tolak(hisoka, m, msg);
                                                        const oldInfo = getJadibotExpirySummary(targetNum);
                                                        const oldLabel = oldInfo?.remaining || 'Tidak ada data';
                                                        const oldExpire = oldInfo?.expiresAtText || '-';

                                                        if (isMinus) {
                                                                const downResult = reduceJadibotExpiry(targetNum, durInfo.ms, 'active');
                                                                if (!downResult) {
                                                                        results.push({ idx, targetNum, ok: false, error: 'Data masa berlaku tidak ditemukan.' });
                                                                        continue;
                                                                }
                                                                if (downResult.error === 'permanent') {
                                                                        results.push({ idx, targetNum, ok: false, error: 'Status *Permanent* ♾️, tidak punya batas waktu yang bisa dikurangi.' });
                                                                        continue;
                                                                }
                                                                scheduleJadibotExpiry(targetNum, adjSendReply);
                                                                const newInfo = downResult.expiredNow ? null : getJadibotExpirySummary(targetNum);
                                                                results.push({
                                                                        idx, targetNum, ok: true, kind: 'down',
                                                                        durLabel: durInfo.label, oldLabel, oldExpire,
                                                                        expiredNow: downResult.expiredNow,
                                                                        newLabel: newInfo ? newInfo.remaining : 'Kedaluwarsa',
                                                                        newExpire: newInfo ? newInfo.expiresAtText : '-'
                                                                });
                                                        } else if (durInfo.ms === 'permanent') {
                                                                setPermanentJadibot(targetNum, 'active');
                                                                results.push({ idx, targetNum, ok: true, kind: 'perm', oldLabel });
                                                        } else {
                                                                extendJadibotExpiry(targetNum, durInfo.ms, 'active');
                                                                scheduleJadibotExpiry(targetNum, adjSendReply);
                                                                const newInfo = getJadibotExpirySummary(targetNum);
                                                                results.push({
                                                                        idx, targetNum, ok: true, kind: 'up',
                                                                        durLabel: durInfo.label, oldLabel, oldExpire,
                                                                        newLabel: newInfo.remaining, newExpire: newInfo.expiresAtText
                                                                });
                                                        }
                                                }

                                                const okCount = results.filter(r => r.ok).length;
                                                const failCount = results.length - okCount;
                                                const isMulti = results.length > 1;
                                                await hisoka.sendMessage(m.from, {
                                                        react: { text: failCount === 0 ? '✅' : (okCount === 0 ? '❌' : '⚠️'), key: m.key }
                                                });

                                                if (!isMulti) {
                                                        const r = results[0];
                                                        if (!r.ok) {
                                                                await tolak(hisoka, m, `❌ *Gagal!*\n${r.targetNum ? `+${maskNumber(r.targetNum)} — ` : ''}${r.error}`);
                                                        } else if (r.kind === 'perm') {
                                                                await tolak(hisoka, m,
                                                                        `♾️ *Durasi diperbarui ke Permanent!*\n` +
                                                                        `📱 \`+${maskNumber(r.targetNum)}\`\n\n` +
                                                                        `📊 *Perubahan masa berlaku:*\n` +
                                                                        `⏮️ Sebelumnya : ~${r.oldLabel}~\n` +
                                                                        `✨ Terbaru    : *Permanent* ♾️\n\n` +
                                                                        `> _Bot tetap aktif tanpa batas waktu._`
                                                                );
                                                        } else if (r.kind === 'down') {
                                                                await tolak(hisoka, m,
                                                                        `⏬ *Durasi dikurangi!*\n` +
                                                                        `📱 \`+${maskNumber(r.targetNum)}\`\n\n` +
                                                                        `📊 *Perubahan masa berlaku:*\n` +
                                                                        `⏮️ Sebelumnya : ~${r.oldLabel}~\n` +
                                                                        `   _Exp lama_ : _${r.oldExpire}_\n` +
                                                                        `➖ Dikurangi  : *${r.durLabel}*\n` +
                                                                        `✨ Sisa baru  : *${r.newLabel}*\n` +
                                                                        (r.expiredNow ? '' : `   _Exp baru_ : _${r.newExpire}_\n`) +
                                                                        `\n> _${r.expiredNow ? 'Sisa waktu sudah habis, bot langsung dihentikan & sesi dihapus.' : 'Bot tetap aktif, durasi dikurangi.'}_`
                                                                );
                                                        } else {
                                                                await tolak(hisoka, m,
                                                                        `⏫ *Durasi diperbarui!*\n` +
                                                                        `📱 \`+${maskNumber(r.targetNum)}\`\n\n` +
                                                                        `📊 *Perubahan masa berlaku:*\n` +
                                                                        `⏮️ Sebelumnya : ~${r.oldLabel}~\n` +
                                                                        `   _Exp lama_ : _${r.oldExpire}_\n` +
                                                                        `➕ Ditambah   : *+${r.durLabel}*\n` +
                                                                        `✨ Total baru : *${r.newLabel}*\n` +
                                                                        `   _Exp baru_ : _${r.newExpire}_\n\n` +
                                                                        `> _Bot tetap aktif, durasi diperpanjang._`
                                                                );
                                                        }
                                                } else {
                                                        const lines = results.map(r => {
                                                                if (!r.ok) {
                                                                        return `*${r.idx}.* ❌ ${r.targetNum ? `+${maskNumber(r.targetNum)} — ` : ''}${r.error}`;
                                                                }
                                                                if (r.kind === 'perm') {
                                                                        return `*${r.idx}.* ♾️ +${maskNumber(r.targetNum)} → *Permanent* _(sebelumnya ${r.oldLabel})_`;
                                                                }
                                                                if (r.kind === 'down') {
                                                                        return `*${r.idx}.* ⏬ +${maskNumber(r.targetNum)} ➖ *${r.durLabel}* → sisa *${r.newLabel}*${r.expiredNow ? ' _(dihentikan)_' : ` _(exp: ${r.newExpire})_`}`;
                                                                }
                                                                return `*${r.idx}.* ⏫ +${maskNumber(r.targetNum)} ➕ *${r.durLabel}* → sisa *${r.newLabel}* _(exp: ${r.newExpire})_`;
                                                        });
                                                        await tolak(hisoka, m,
                                                                `📋 *Update ${results.length} target — ${okCount} berhasil${failCount ? `, ${failCount} gagal` : ''}*\n` +
                                                                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                                                                lines.join('\n')
                                                        );
                                                }
                                                return;
                                        }

                                        // Format stop: hanya angka atau nomor WA
                                        let selectedNumber = '';
                                        const indexChoice = rawChoice.match(/^\d{1,3}$/) ? Number(rawChoice) : 0;
                                        if (indexChoice >= 1 && indexChoice <= pendingJadibot.numbers.length) {
                                                selectedNumber = pendingJadibot.numbers[indexChoice - 1];
                                        } else {
                                                selectedNumber = normalizeJadibotNumber(rawChoice);
                                        }
                                        if (selectedNumber && pendingJadibot.numbers.includes(selectedNumber) && activeList.includes(selectedNumber)) {
                                                // Jangan langsung stop — minta konfirmasi dulu via Button Quick Reply
                                                const _meta  = getJadibotExpiry(selectedNumber);
                                                const _isPerm = _meta?.permanent === true;
                                                const _sisa  = !_meta ? '-' : _isPerm ? 'Permanent ♾️' : (getJadibotExpirySummary(selectedNumber)?.remaining || '-');
                                                const _masked = maskNumber(selectedNumber);

                                                // Update pending state ke confirmMode
                                                pendingJadibot.confirmMode   = true;
                                                pendingJadibot.confirmNumber = selectedNumber;

                                                const _confirmBody =
                                                        `🛑 *Konfirmasi Stop Jadibot*\n` +
                                                        `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                                                        `📱 *Nomor :* +${_masked}\n` +
                                                        `⏳ *Sisa  :* ${_sisa}\n\n` +
                                                        `⚠️ Yakin ingin menghentikan bot ini?\n` +
                                                        `> _Tindakan ini tidak bisa dibatalkan setelah dikonfirmasi._`;

                                                try {
                                                        const _confirmBtn = new Button()
                                                                .setBody(_confirmBody)
                                                                .setFooter(`⚡ Wily Bot • Stop Jadibot`)
                                                                .addReply('✅ Ya, Stop', '__jbstop_yes__')
                                                                .addReply('❌ Tidak, Batal', '__jbstop_no__');
                                                        await _confirmBtn.run(m.from, hisoka, m);
                                                } catch (_) {
                                                        // Fallback teks jika Button gagal
                                                        await tolak(hisoka, m,
                                                                _confirmBody + `\n\n` +
                                                                `✅ Reply \`ya\` untuk stop\n` +
                                                                `❌ Reply \`batal\` untuk batal`
                                                        );
                                                }
                                                return;
                                        }
                                        // Pilihan tidak dikenali
                                        await tolak(
                                                hisoka,
                                                m,
                                                `❌ *Pilihan tidak valid.*\n\n` +
                                                `📌 *Cara reply listbot:*\n` +
                                                `1. Ketik \`1\` → stop 1 bot\n` +
                                                `2. Ketik \`1,2,3\` atau \`1.2.3\` → stop beberapa\n` +
                                                `3. Ketik \`1,3j\` → perpanjang 3 jam\n` +
                                                `4. Ketik \`1,-3j\` → kurangi 3 jam\n` +
                                                `5. Ketik \`1,p\` → ubah ke permanent\n` +
                                                `6. Ketik \`3,1d,20m|1,30d\` → banyak target sekaligus, dipisah \`|\`\n` +
                                                `7. Ketik \`batal\` → batalkan\n\n` +
                                                `> _Singkatan: m=menit · j=jam · h=hari · p=permanent_`
                                        );
                                        return;
                                }
                        }
                }

                // (pendingCredsJson handler dihapus — flow baru pakai startJadibot otomatis)

                // ── Handle tombol .animquote — hapus quote lama lalu kirim quote baru ──
                {
                        const { handleAnimquoteCallback } = await importLazy(path.resolve('./SEMUA_FITUR/anime/animquote.js'));
                        if (await handleAnimquoteCallback({ hisoka, m, tolak, logCommand, logError, Button, getQuotedStanzaId })) return;
                }

                // ── Handle tap tombol format .animgif (__tengif_*) ──
                {
                        const { handleTenorGifCallback } = await importLazy(path.resolve('./SEMUA_FITUR/anime/tenor-gif.js'));
                        if (await handleTenorGifCallback({ hisoka, m, tolak, logCommand, Button })) return;
                }

                // ── Handle tap suara .tts (__tts_voice_*) ──
                {
                        const { handleTtsCallback } = await importLazy(path.resolve('./SEMUA_FITUR/media/anyvoice.js'));
                        if (await handleTtsCallback({ hisoka, m, tolak, logCommand, logError, Button })) return;
                }

                // ── Handle pending alqupdate list choice → alqanime-cmd.js ──
                if (await handleAlqUpdateChoice({ hisoka, m, fs, pendingAlqUpdateChoices, pendingAlqDlChoices, getJadibotChoiceKey, getQuotedStanzaId, pickBestAlqLink, getAllAlqLinksByPriority, formatAlqLinkMsg, tolak, logError })) return;


                // ── Handle pending alqdl choice → alqanime-cmd.js ──
                if (await handleAlqDlChoice({ hisoka, m, fs, pendingAlqDlChoices, getJadibotChoiceKey, getQuotedStanzaId, pickBestAlqLink, getAllAlqLinksByPriority, formatAlqLinkMsg, tolak, logError })) return;

                // ── Handle reply ke status alqanimenotif (add/del GC) ──
                {
                        const { handleAlqNotifReply } = await importLazy(path.resolve('./SEMUA_FITUR/anime/alqanime-monitor.js'));
                        if (await handleAlqNotifReply({ hisoka, m, pendingAlqNotifChoices, getQuotedStanzaId, tolak, logCommand, loadConfig, fs, path })) return;
                }

                // ── Handle button callback alqanimenotif (__alqnotif_*) ──
                {
                        const { handleAlqanimeNotifCallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/anime/alqanime-monitor.js'));
                        if (await handleAlqanimeNotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, fs, path })) return;
                }

                // ── Handle button callback doujindesu (__doujinnotif_*) ──
                {
                        const { handleDoujinNotifCallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/anime/doujindesu-monitor.js'));
                        if (await handleDoujinNotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, saveConfig })) return;
                }

                // ── Handle reply ke status nekopoinotif (add/del GC) ──
                {
                        const { handleNekpoiNotifReply } = await importLazy(path.resolve('./SEMUA_FITUR/anime/nekopoi-monitor.js'));
                        if (await handleNekpoiNotifReply({ hisoka, m, pendingNekpoiNotifChoices, getQuotedStanzaId, tolak, logCommand, loadConfig, fs, path })) return;
                }

                // ── Handle button callback nekopoinotif (__nknotif_*) ──
                {
                        const { handleNekopoinotifCallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/anime/nekopoi-monitor.js'));
                        if (await handleNekopoinotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, fs, path })) return;
                }

                // ── Handle reply ke status hentaicopnotif (add/del GC) ──
                {
                        const { handleHentaicopNotifReply } = await importLazy(path.resolve('./SEMUA_FITUR/anime/hentaicop-monitor.js'));
                        if (await handleHentaicopNotifReply({ hisoka, m, pendingHentaicopNotifChoices, getQuotedStanzaId, tolak, logCommand, loadConfig, fs, path })) return;
                }

                // ── Handle button callback hentaicopnotif (__hcnotif_*) ──
                {
                        const { handleHentaicopnotifCallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/anime/hentaicop-monitor.js'));
                        if (await handleHentaicopnotifCallbacks({ hisoka, m, tolak, logCommand, Button, loadConfig, fs, path })) return;
                }

                // ── Handle tap button single-select .wilyai ───────────────────────────
                {
                        const { handleWilyaiCallbacks } = await importLazy(path.resolve('./SEMUA_FITUR/tools/wilyai.js'));
                        if (await handleWilyaiCallbacks({ hisoka, m, tolak, logCommand, loadConfig, saveConfig, isMainBot, countHistory, clearAllHistory, clearAllUserMemory, Button })) return;
                }

                // ── Handle pending hentaidad confirm (Lanjutkan/Tidak) → hentaidad.js ──
                {
                        const { handleHentaidadConfirm } = await importLazy(path.resolve('./SEMUA_FITUR/anime/hentaidad.js'));
                        if (await handleHentaidadConfirm({ hisoka, m, pendingHentaidadConfirm, getQuotedStanzaId, logError })) return;
                }

                // ── Handle pending hentaidad choice → hentaidad.js ──
                {
                        const { handleHentaidadChoice } = await importLazy(path.resolve('./SEMUA_FITUR/anime/hentaidad.js'));
                        if (await handleHentaidadChoice({ hisoka, m, pendingHentaidadChoices, pendingHentaidadConfirm, getQuotedStanzaId, tolak, logCommand, logError })) return;
                }

                // ── Handle pending stickerly choice → stickerly.js ──
                {
                        const { handleStickerlyChoice } = await importLazy(path.resolve('./SEMUA_FITUR/download/stickerly.js'));
                        if (await handleStickerlyChoice({ hisoka, m, pendingStickerlyChoices, getQuotedStanzaId, tolak, logCommand, logError })) return;
                }

                // ── Handle pending cosplaytele search choice → cosplay-cmd.js ──
                if (await handleCosplayChoice({ hisoka, m, pendingCosplayChoices, getQuotedStanzaId, tolak, logCommand, logError })) return;

                // ── Handle pending komiktap interactive reply → komiktap-cmd.js ──
                if (await handleKomiktapChoice({ hisoka, m, pendingKomikChoices, getJadibotChoiceKey, getQuotedStanzaId, tolak, logError })) return;

                // ── Handle reply ke pesan list .setbrowser → setbrowser-cmd.js ──
                if (await handleSetbrowserListReply({ hisoka, m, listAturBrowserMap, pendingAturBrowser, isMainBot, loadConfig, getQuotedStanzaId, BROWSER_LIST, logCommand, Button })) return;

                // ── Handle reply ke pesan konfirmasi .setbrowser → setbrowser-cmd.js ──
                if (await handleSetbrowserConfirmReply({ hisoka, m, pendingAturBrowser, isMainBot, loadConfig, getQuotedStanzaId, BROWSER_LIST, logCommand })) return;

                // ── Handle pending fontuntik choice → fontuntik.js ──
                {
                        const { handleFontuntikChoice } = await importLazy(path.resolve('./SEMUA_FITUR/tools/fontuntik.js'));
                        if (await handleFontuntikChoice({ hisoka, m, pendingFontuntikChoices, getJadibotChoiceKey, getQuotedStanzaId, Button, tolak, logCommand })) return;
                }

                // ── Handle pending waifu choice → waifu.js ──
                {
                        const { handleWaifuChoice } = await importLazy(path.resolve('./SEMUA_FITUR/anime/waifu.js'));
                        if (await handleWaifuChoice({ hisoka, m, pendingWaifuChoices, getJadibotChoiceKey, getQuotedStanzaId, Button, tolak, logCommand })) return;
                }

                // ── Handle pending play choice → play-cmd.js ──
                if (await handlePlayChoice({ hisoka, m, pendingPlayChoices, ensureYtdlp, parseYtdlpError, tolak, logCommand })) return;

                // ─── Cekauto callbacks (interaktif button/list reply) ──────────────────
                if (await _handleCekautoCallbacksFn({ hisoka, m, tolak, restartAutoCleaner, stopAutoCleaner })) return;

                // ─── AntiTagSW callbacks (session reply + button callbacks) ──────────
                if (await _handleAntitagswCallbacksFn({ hisoka, m, tolak, toggleAntiTagSW, resetWarnings, getAllAntiTagSWGroups })) return;

                // ─── AntiLink callbacks (session reply dari .antilink list) ────────────
                if (await _handleAntilinkCallbacksFn({ hisoka, m, tolak })) return;

                // ─── AntiLink status reply (add/del GC via .antilink status) ─────────
                if (await _handleAntilinkStatusReplyFn({ hisoka, m, pendingAntilinkChoices, getQuotedStanzaId, tolak, logCommand })) return;

                // ─── MusicAI callbacks DIHENTIKAN (backend API tidak lagi gratis) ────
                // if (await handleMusicAICallbacks({ hisoka, m, ... })) return;
                // if (await handleMusicAI2Callbacks({ hisoka, m, ... })) return;
                // ──────────────────────────────────────────────────────────────────────

                // ── Handle konfirmasi .mati / .restart (button quick reply) ───────────
                if (m.isOwner && pendingShutdownConfirm.has(m.sender)) {
                        const _sdPending = pendingShutdownConfirm.get(m.sender);
                        const _sdRaw     = String(m.text || '').trim();
                        const _sdLower   = _sdRaw.toLowerCase();
                        const _sdQuoted  = getQuotedStanzaId(m);
                        const _sdIsReply = m.isQuoted && (!_sdPending.botMsgId || _sdQuoted === _sdPending.botMsgId);

                        // Jika bukan reply ke pesan konfirmasi → biarkan lanjut ke command biasa
                        if (!_sdIsReply && !['__mati_yes__','__mati_no__','__restart_yes__','__restart_no__'].includes(_sdRaw)) {
                                // lanjut normal
                        } else if (_sdPending.expiresAt && _sdPending.expiresAt <= Date.now()) {
                                if (_sdPending.timeout) clearTimeout(_sdPending.timeout);
                                pendingShutdownConfirm.delete(m.sender);
                                await tolak(hisoka, m, '⏳ *Waktu konfirmasi habis.*\n> _Ulangi perintah jika ingin lanjut._');
                                return;
                        } else {
                                const _sdIsYes = ['__mati_yes__','__restart_yes__'].includes(_sdRaw) || ['ya','yes','iya','y'].includes(_sdLower);
                                const _sdIsNo  = ['__mati_no__','__restart_no__'].includes(_sdRaw)   || ['tidak','no','n','batal','cancel'].includes(_sdLower);

                                if (_sdIsYes) {
                                        if (_sdPending.timeout) clearTimeout(_sdPending.timeout);
                                        pendingShutdownConfirm.delete(m.sender);
                                        const { shutdownBot, restartBot } = await importLazy(path.resolve('./SEMUA_FITUR/system/shutdown.js'));
                                        if (_sdPending.type === 'mati') {
                                                await hisoka.sendMessage(m.from, { react: { text: '⛔', key: m.key } });
                                                await tolak(hisoka, m,
                                                        `╔══════════════════════╗\n` +
                                                        `║  ⛔  *B O T  M A T I*  ║\n` +
                                                        `╚══════════════════════╝\n\n` +
                                                        `🔴 *Bot dimatikan sekarang!*\n\n` +
                                                        `⚙️ Dimatikan oleh: @${m.sender.split('@')[0]}\n` +
                                                        `🕐 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
                                                        `ℹ️ Untuk menjalankan bot kembali,\n` +
                                                        `jalankan ulang dari Replit.`,
                                                        { mentions: [m.sender] }
                                                );
                                                logCommand(m, hisoka, 'mati');
                                                shutdownBot(2000);
                                        } else {
                                                await hisoka.sendMessage(m.from, { react: { text: '🔄', key: m.key } });
                                                const _rstSent = await tolak(hisoka, m,
                                                        `╔══════════════════════╗\n` +
                                                        `║  🔄  *R E S T A R T*  ║\n` +
                                                        `╚══════════════════════╝\n\n` +
                                                        `♻️ *Bot direstart sekarang!*\n\n` +
                                                        `⚙️ Direstart oleh: @${m.sender.split('@')[0]}\n` +
                                                        `🕐 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
                                                        `⏳ Menunggu bot online kembali...`,
                                                        { mentions: [m.sender] }
                                                );
                                                try {
                                                        const { kvSet: _sdKvSet } = await import('./src/db/datadb.js');
                                                        _sdKvSet('system/restart_notify', { from: m.from, key: _rstSent?.key || null, by: m.sender, time: Date.now() });
                                                } catch (_) {}
                                                logCommand(m, hisoka, 'restart');
                                                restartBot(2000);
                                        }
                                } else if (_sdIsNo) {
                                        if (_sdPending.timeout) clearTimeout(_sdPending.timeout);
                                        pendingShutdownConfirm.delete(m.sender);
                                        await hisoka.sendMessage(m.from, { react: { text: '❌', key: m.key } });
                                        await tolak(hisoka, m,
                                                _sdPending.type === 'mati'
                                                        ? `❌ *Dibatalkan.*\n_Bot tidak dimatikan._`
                                                        : `❌ *Dibatalkan.*\n_Bot tidak direstart._`
                                        );
                                } else {
                                        // Balasan tidak valid
                                        const _sdLabel = _sdPending.type === 'mati' ? 'matikan bot' : 'restart bot';
                                        await tolak(hisoka, m,
                                                `⚠️ *Pilihan tidak valid.*\n\n` +
                                                `Tap tombol atau balas pesan konfirmasi dengan:\n` +
                                                `• \`ya\` / \`iya\` — untuk ${_sdLabel}\n` +
                                                `• \`tidak\` / \`batal\` — untuk membatalkan`
                                        );
                                }
                                return;
                        }
                }

                // ── PLUGIN DISPATCHER (pengganti switch-case raksasa) ──
                // Tiap command di-resolve ke plugin di SEMUA_FITUR via pluginLoader.
                // Daftar command dikenali di inject.js dari hisoka.loadedCommands.
                const pfx = m.prefix || '.';
                const _plugCtx = {
                        BROWSER_LIST,
                        Button,
                        CEKAUTO_FITUR_LIST,
                        _handleCekautoFn,
                        _sendCosplayImages,
                        addJadibotEmojis,
                        addToHistory,
                        buildFbCaptionPrompt,
                        buildFbFallbackCaption,
                        buildFbVisionPrompt,
                        buildHistoryMeta,
                        buildIgCaptionPrompt,
                        buildIgFallbackCaption,
                        buildIgVisionPrompt,
                        buildSmartAlbumCaptions,
                        buildSmartImageHistoryReply,
                        buildSmartImageWaitText,
                        buildVideoDownloadCaptionPrompt,
                        buildWilyAICommandPrompt,
                        buildWilyMediaUserPrompt,
                        formatFbCount,
                        formatIgCount,
                        cleanStaleSessionFiles,
                        cleanupExpiredJadibots,
                        cleanupWritePressure,
                        clearAllHistory,
                        clearAllUserMemory,
                        clearAntiTagSWLog,
                        clearErrors,
                        clearHistory,
                        clearJadibotEmojis,
                        clearOldFiles,
                        clearUserMemory,
                        countActiveSW,
                        countHistory,
                        deleteJadibotEmojis,
                        detectAndUpdateMemory,
                        detectImageSearchQuery,
                        downloadMediaBuffer,
                        downloadMediaMessage,
                        ensureJadibotExpiry,
                        ensureYtdlp,
                        exec,
                        extendJadibotExpiry,
                        extractImageCount,
                        formatErrorReport,
                        formatRemainingTime,
                        fs,
                        gemini,
                        generateErrorFileTxt,
                        generateWAMessageContent,
                        generateWAMessageFromContent,
                        getAllAntiTagSWGroups,
                        getAntiTagSWLog,
                        getBotStats,
                        getCachedQuotedMedia,
                        getErrorStats,
                        getHandler,
                        getHistory,
                        getInfoErrorTxtPath,
                        getJadibotAnticall,
                        getJadibotAnticallvid,
                        getJadibotAntidel,
                        getJadibotAutoOnline,
                        getJadibotAutoRecording,
                        getJadibotAutoTyping,
                        getJadibotChoiceKey,
                        getJadibotEmojiMode,
                        getJadibotExpiry,
                        getJadibotExpirySummary,
                        getJadibotNumber,
                        getJadibotReadchat,
                        getJadibotReadsw,
                        getLogoutSavedMs,
                        getMainEmojiMode,
                        getMediaInfo,
                        getMediaTypeFromMessage,
                        getQuotedMediaBuffer,
                        getQuotedStanzaId,
                        getSessionKey,
                        getUserName,
                        getUserProfilePictureUrl,
                        getViewOnceCache,
                        getWarnings,
                        hasViewOnceCache,
                        hisoka,
                        injectMessage,
                        isAntiTagSWEnabled,
                        isJidGroup,
                        isMainBot,
                        isNoSpaceError,
                        jadibotClearSesiMap,
                        jadibotConnectedAt,
                        jadibotMap,
                        jadibotSesiReportMap,
                        kvGet,
                        kvSet,
                        listAturBrowserMap,
                        listJadibotEmojis,
                        loadConfig,
                        loadUserMemory,
                        logCommand,
                        logError,
                        m,
                        maskNumber,
                        memoryToReadable,
                        os,
                        parseFbMetaHtml,
                        parseIgMetaHtml,
                        parseJadibotDuration,
                        path,
                        pendingAlqDlChoices,
                        pendingAlqNotifChoices,
                        pendingAlqUpdateChoices,
                        pendingAntilinkChoices,
                        pendingAturBrowser,
                        pendingCosplayChoices,
                        pendingFontuntikChoices,
                        pendingHentaicopNotifChoices,
                        pendingHentaidadChoices,
                        pendingStickerlyChoices,
                        iqcLastMsg,
                        pendingJadibotChoices,
                        pendingKomikChoices,
                        pendingNekpoiNotifChoices,
                        pendingPlayChoices,
                        pendingShutdownConfirm,
                        pendingWaifuChoices,
                        pfx,
                        processAIMediaAndSend,
                        pruneSwStatsAt,
                        query,
                        quoted,
                        reduceJadibotExpiry,
                        rememberAIMedia,
                        removeJadibotExpiry,
                        resetToDefaultEmojis,
                        resetWarnings,
                        resolveLidFromContacts,
                        restartAutoCleaner,
                        saveCekautoTimestamp,
                        saveConfig,
                        scheduleJadibotExpiry,
                        searchAndGetImages,
                        sendConfirmWithButtons,
                        sendImageAlbum,
                        setCustomEmojiMode,
                        setJadibotUserSetting,
                        setPermanentJadibot,
                        startJadibot,
                        startJadibotAutoOnline,
                        startTyping,
                        stopAutoCleaner,
                        stopJadibot,
                        text,
                        toggleAntiTagSW,
                        tolak,
                        txt: query,
                        unwrapMessagePayload,
                        util,
                        wrapCurrentUserMessage,
                };
                const _plug = await findPlugin(m.command);
                if (_plug) {
                        const _plugMod = await importLazy(path.resolve(_plug.file));
                        const _plugFn = resolvePluginHandler(_plugMod, _plug);
                        await _plugFn(_plugCtx);
                }
        } catch (error) {
                const errMsg = error?.message || String(error);
                const cmdSrc = `command:${m?.command || '?'}`;

                // Jika error karena socket mati (not-acceptable, EPIPE, dll):
                // — Jangan log sebagai error besar (bukan bug kode, hanya race condition logout)
                // — Jangan coba kirim reply (socket sudah mati, akan error lagi)
                if (isDeadSocketError(error)) {
                        console.warn(`\x1b[33m[Handler] Socket mati saat proses command "${m?.command || '?'}" → ${errMsg} (diabaikan)\x1b[39m`);
                        return;
                }

                console.error(`\x1b[31m[Handler] Error on command "${m?.command || '?'}":\x1b[39m`, errMsg);
                if (isNoSpaceError(error)) cleanupWritePressure();
                logError(error, cmdSrc);
                try {
                        if (m?.reply && m?.command) {
                                const errorText = isNoSpaceError(error)
                                        ? `❌ Perintah *.${m.command}* sempat gagal karena ruang tulis sementara penuh.\n\nPembersihan otomatis sudah dijalankan. Coba ketik perintahnya lagi.`
                                        : `❌ Terjadi error pada perintah *.${m.command}*\n\n_${errMsg}_\n\nBot tetap berjalan, coba lagi atau gunakan perintah lain.`;
                                await hisoka.sendMessage(m.from, { text: errorText }, { quoted: m });
                        }
                } catch (_) {}
        }
}
