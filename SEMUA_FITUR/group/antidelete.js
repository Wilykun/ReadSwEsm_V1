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
 *  antidelete.js — Handler pesan terhapus
 *  Tangkap & kirim ulang pesan/media yang dihapus
 * ───────────────────────────────
 */
/**
 * ═══════════════════════════════════════════════════════════════
 *  Anti-Delete Message Handler
 *  Fitur untuk mendeteksi dan menyimpan pesan yang dihapus
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

import fs from 'fs';
import path from 'path';
import { jidNormalizedUser, jidDecode, isJidGroup, getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import { isPnUser } from '../../src/helper/socketCompat.js';
import { getTmpPath } from '../../src/helper/cleaner.js';
import { getJadibotAntidel, getJadibotNumber } from '../../src/helper/jadibotSettings.js';

function loadConfig() {
        try {
                const configPath = path.join(process.cwd(), 'config.json');
                if (fs.existsSync(configPath)) {
                        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                }
        } catch (err) {}
        return {};
}

function getMediaTypeInfo(type) {
        const mediaTypes = {
                imageMessage: ['Gambar', '🖼️', 'jpg'],
                videoMessage: ['Video', '🎥', 'mp4'],
                audioMessage: ['Audio', '🎵', 'mp3'],
                stickerMessage: ['Sticker', '🎨', 'webp'],
                documentMessage: ['Dokumen', '📄', 'bin'],
                extendedTextMessage: ['Teks', '📝', null],
                conversation: ['Teks', '📝', null],
                viewOnceMessageV2: ['View Once', '👁️', null],
                viewOnceMessage: ['View Once', '👁️', null],
                viewOnceMessageV2Extension: ['View Once', '👁️', null],
                contactMessage: ['Kontak', '👤', null],
                contactsArrayMessage: ['Kontak', '👥', null],
                locationMessage: ['Lokasi', '📍', null],
                liveLocationMessage: ['Live Lokasi', '📍', null],
                pollCreationMessage: ['Poll', '📊', null],
        };
        return mediaTypes[type] || ['Media', '📨', 'bin'];
}

function formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleString('id-ID', { 
                timeZone: 'Asia/Jakarta',
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
        });
}

function extractTextFromMessage(message) {
        if (!message) return '';
        
        const type = getContentType(message);
        const content = message[type];
        
        if (!content) return '';
        
        return content.text || 
               content.conversation || 
               content.caption || 
               content.selectedButtonId ||
               content.selectedId ||
               content.contentText ||
               content.selectedDisplayText ||
               content.title ||
               content.name ||
               message.conversation ||
               '';
}

function getMessageContent(cachedMsg) {
        if (!cachedMsg || !cachedMsg.message) return null;
        
        let message = cachedMsg.message;
        
        if (message.ephemeralMessage?.message) {
                message = message.ephemeralMessage.message;
        }
        
        if (message.viewOnceMessage?.message) {
                message = message.viewOnceMessage.message;
        }
        
        if (message.viewOnceMessageV2?.message) {
                message = message.viewOnceMessageV2.message;
        }
        
        if (message.viewOnceMessageV2Extension?.message) {
                message = message.viewOnceMessageV2Extension.message;
        }
        
        return message;
}

const _noopLogger = { info: () => {}, error: () => {}, debug: () => {}, warn: () => {}, trace: () => {}, child: () => _noopLogger };

async function downloadMedia(hisoka, cachedMsg, messageContent) {
        const type = getContentType(messageContent);
        if (!type) return null;

        const content = messageContent[type];
        if (!content || !content.mimetype) return null;

        // Cek pre-cache dulu (sudah didownload saat pesan masuk — instan, no CDN)
        const precached = hisoka.mediaCacheAntidel?.get(cachedMsg?.key?.id);
        if (precached && precached.length > 0) return precached;

        const safeLogger = hisoka.logger || _noopLogger;
        const msgForDownload = { ...cachedMsg, message: messageContent };

        // Attempt 1: refresh URL via updateMediaMessage dulu, lalu download
        try {
                if (typeof hisoka.updateMediaMessage === 'function') {
                        const refreshed = await hisoka.updateMediaMessage(msgForDownload);
                        if (refreshed?.message) {
                                const refreshedContent = refreshed.message[type] || refreshed.message;
                                const media = await downloadMediaMessage(
                                        { ...msgForDownload, message: { [type]: refreshedContent } },
                                        'buffer',
                                        {},
                                        { logger: safeLogger, reuploadRequest: hisoka.updateMediaMessage }
                                );
                                if (media && media.length > 0) return media;
                        }
                }
        } catch (_) {}

        // Attempt 2: download langsung tanpa refresh
        try {
                const media = await downloadMediaMessage(
                        msgForDownload,
                        'buffer',
                        {},
                        { logger: safeLogger, reuploadRequest: hisoka.updateMediaMessage }
                );
                if (media && media.length > 0) return media;
        } catch (_) {}

        // Attempt 3: retry setelah 2 detik (URL CDN kadang butuh waktu)
        await new Promise(r => setTimeout(r, 2000));
        try {
                const media = await downloadMediaMessage(
                        msgForDownload,
                        'buffer',
                        {},
                        { logger: safeLogger, reuploadRequest: hisoka.updateMediaMessage }
                );
                if (media && media.length > 0) return media;
        } catch (err) {
                console.error('\x1b[31m[AntiDelete] Gagal download media setelah 3 percobaan:\x1b[39m', err.message);
        }

        return null;
}

/* ======= KIRIM PESAN KE TARGET SESUAI SETTING sendTo ======= */
async function sendToTargets(hisoka, targets, type, messageContent, headerText, ext) {
        const content = messageContent[type];
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
        const isMediaMessage = mediaTypes.includes(type);

        for (const target of targets) {
                try {
                        if (!isMediaMessage) {
                                await hisoka.sendMessage(target, { text: headerText });
                                continue;
                        }

                        const mediaBuffer = await downloadMedia(hisoka, null, messageContent).catch(() => null);

                        // Pakai downloadMedia dari cachedMsg langsung
                        if (!mediaBuffer) {
                                await hisoka.sendMessage(target, {
                                        text: headerText + '\n\n⚠️ _Media tidak dapat diunduh_'
                                });
                                continue;
                        }

                        let mediaExt = ext;
                        if (content?.mimetype) {
                                if (content.mimetype.includes('webp')) mediaExt = 'webp';
                                else if (content.mimetype.includes('mp4')) mediaExt = 'mp4';
                                else if (content.mimetype.includes('jpeg') || content.mimetype.includes('jpg')) mediaExt = 'jpg';
                                else if (content.mimetype.includes('png')) mediaExt = 'png';
                                else if (content.mimetype.includes('gif')) mediaExt = 'gif';
                                else if (content.mimetype.includes('mp3')) mediaExt = 'mp3';
                                else if (content.mimetype.includes('ogg')) mediaExt = 'ogg';
                                else if (content.mimetype.includes('pdf')) mediaExt = 'pdf';
                        }
                        if (content?.fileName) {
                                const docExt = content.fileName.split('.').pop();
                                if (docExt) mediaExt = docExt;
                        }

                        if (type === 'imageMessage') {
                                await hisoka.sendMessage(target, { image: mediaBuffer, caption: headerText });
                        } else if (type === 'videoMessage') {
                                await hisoka.sendMessage(target, { video: mediaBuffer, caption: headerText });
                        } else if (type === 'audioMessage') {
                                await hisoka.sendMessage(target, { text: headerText });
                                await hisoka.sendMessage(target, {
                                        audio: mediaBuffer,
                                        mimetype: content?.mimetype || 'audio/mpeg',
                                        ptt: content?.ptt || false,
                                });
                        } else if (type === 'stickerMessage') {
                                await hisoka.sendMessage(target, { text: headerText });
                                await hisoka.sendMessage(target, { sticker: mediaBuffer });
                        } else if (type === 'documentMessage') {
                                await hisoka.sendMessage(target, { text: headerText });
                                await hisoka.sendMessage(target, {
                                        document: mediaBuffer,
                                        mimetype: content?.mimetype || 'application/octet-stream',
                                        fileName: content?.fileName || `document.${mediaExt}`,
                                });
                        }
                } catch (sendErr) {
                        console.error('\x1b[31m[AntiDelete] Error sending to', target, ':\x1b[39m', sendErr.message);
                }
        }
}

export default async function handleDeletedMessage(update, hisoka) {
        try {
                let antiDeleteConfig;
                if (hisoka?.isMainBot === false) {
                        const jadibotNum = getJadibotNumber(hisoka);
                        antiDeleteConfig = getJadibotAntidel(jadibotNum);
                } else {
                        const config = loadConfig();
                        antiDeleteConfig = config.antiDelete || {};
                }
                
                if (!antiDeleteConfig.enabled) return;
                
                const { key, update: msgUpdate } = update;
                
                if (!key || !key.id) return;
                
                const isRevoked = msgUpdate?.messageStubType === 1 || 
                                  msgUpdate?.message === null ||
                                  (msgUpdate?.messageStubType === undefined && msgUpdate?.message === undefined && Object.keys(msgUpdate).length === 0);
                
                if (!isRevoked) return;
                
                const cachedMsg = hisoka.cacheMsg.get(key.id);
                if (!cachedMsg) return;

                // Skip pesan yang dihapus oleh antitagsw (sudah ada notif sendiri)
                if (global.__antiTagSWDeletedIds && global.__antiTagSWDeletedIds.has(key.id)) return;
                
                const from = key.remoteJid;
                const isGroup = isJidGroup(from);
                const isPrivate = isPnUser(from);
                
                if (isGroup && !antiDeleteConfig.groupChat) return;
                if (isPrivate && !antiDeleteConfig.privateChat) return;
                
                const botNumber = jidNormalizedUser(hisoka.user.id);
                
                const senderJid = await hisoka.resolveLidToPN(cachedMsg.key);
                const senderNumber = jidDecode(senderJid)?.user || 'Unknown';
                const senderName = cachedMsg.pushName || hisoka.getName(senderJid, true) || senderNumber;
                
                let groupName = '';
                if (isGroup) {
                        const groupData = hisoka.groups.read(from);
                        groupName = groupData?.subject || jidDecode(from)?.user || 'Unknown Group';
                }
                
                /* ===== SKIP PESAN VIEW ONCE ===== */
                const originalMsg = cachedMsg.message;
                const isViewOnce = !!(
                        originalMsg?.viewOnceMessage?.message ||
                        originalMsg?.viewOnceMessageV2?.message ||
                        originalMsg?.viewOnceMessageV2Extension?.message ||
                        originalMsg?.ephemeralMessage?.message?.viewOnceMessage?.message ||
                        originalMsg?.ephemeralMessage?.message?.viewOnceMessageV2?.message
                );
                if (isViewOnce) return; // abaikan pesan view once

                const messageContent = getMessageContent(cachedMsg);
                if (!messageContent) return;
                
                const type = getContentType(messageContent);
                const [typeName, typeEmoji, ext] = getMediaTypeInfo(type);
                const text = extractTextFromMessage(messageContent);
                const timestamp = cachedMsg.messageTimestamp || Math.floor(Date.now() / 1000);

                /* ===== TENTUKAN TARGET PENGIRIMAN ===== */
                // sendTo: "self" (ke saved messages bot) | "chat" (ke grup/chat asal) | "both"
                const sendTo = antiDeleteConfig.sendTo || 'self';
                const targets = []

                if (sendTo === 'self' || sendTo === 'both') {
                        targets.push(botNumber)
                }
                if ((sendTo === 'chat' || sendTo === 'both') && from) {
                        // Hanya kirim ke chat asal jika belum ada botNumber (hindari duplikat)
                        if (!targets.includes(from)) targets.push(from)
                }
                // Fallback jika kosong
                if (targets.length === 0) targets.push(botNumber)

                /* ===== BUAT HEADER PESAN ===== */
                // Header berbeda tergantung apakah dikirim ke chat asal atau ke self
                const isSendingToChat = sendTo === 'chat' || sendTo === 'both';

                let headerText = `╔══════════════════════════╗\n` +
                        `║  🗑️  *PESAN DIHAPUS*  🗑️  ║\n` +
                        `╚══════════════════════════╝\n\n` +
                        `📍 *Lokasi:* ${isGroup ? `Grup "${groupName}"` : 'Chat Pribadi'}\n` +
                        `👤 *Pengirim:* ${senderName}\n` +
                        `📞 *Nomor:* +${senderNumber}\n` +
                        `⏰ *Waktu:* ${formatTimestamp(timestamp)}\n` +
                        `📦 *Tipe:* ${typeEmoji} ${typeName}`;

                if (text) {
                        headerText += `\n\n💬 *Isi Pesan:*\n${text}`;
                }

                headerText += '\n\n══════════════════════════';

                /* ===== KIRIM KE SEMUA TARGET ===== */
                const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'];
                const isMediaMessage = mediaTypes.includes(type);

                for (const target of targets) {
                        try {
                                if (!isMediaMessage) {
                                        await hisoka.sendMessage(target, { text: headerText });
                                        continue;
                                }

                                const mediaBuffer = await downloadMedia(hisoka, cachedMsg, messageContent);

                                if (mediaBuffer) {
                                        try {
                                                const content = messageContent[type];
                                                let mediaExt = ext;

                                                if (content?.mimetype) {
                                                        if (content.mimetype.includes('webp')) mediaExt = 'webp';
                                                        else if (content.mimetype.includes('mp4')) mediaExt = 'mp4';
                                                        else if (content.mimetype.includes('jpeg') || content.mimetype.includes('jpg')) mediaExt = 'jpg';
                                                        else if (content.mimetype.includes('png')) mediaExt = 'png';
                                                        else if (content.mimetype.includes('gif')) mediaExt = 'gif';
                                                        else if (content.mimetype.includes('mp3')) mediaExt = 'mp3';
                                                        else if (content.mimetype.includes('ogg')) mediaExt = 'ogg';
                                                        else if (content.mimetype.includes('pdf')) mediaExt = 'pdf';
                                                }
                                                if (content?.fileName) {
                                                        const docExt = content.fileName.split('.').pop();
                                                        if (docExt) mediaExt = docExt;
                                                }

                                                if (type === 'imageMessage') {
                                                        await hisoka.sendMessage(target, { image: mediaBuffer, caption: headerText });
                                                } else if (type === 'videoMessage') {
                                                        await hisoka.sendMessage(target, { video: mediaBuffer, caption: headerText });
                                                } else if (type === 'audioMessage') {
                                                        await hisoka.sendMessage(target, { text: headerText });
                                                        await hisoka.sendMessage(target, {
                                                                audio: mediaBuffer,
                                                                mimetype: content?.mimetype || 'audio/mpeg',
                                                                ptt: content?.ptt || false,
                                                        });
                                                } else if (type === 'stickerMessage') {
                                                        await hisoka.sendMessage(target, { text: headerText });
                                                        await hisoka.sendMessage(target, { sticker: mediaBuffer });
                                                } else if (type === 'documentMessage') {
                                                        await hisoka.sendMessage(target, { text: headerText });
                                                        await hisoka.sendMessage(target, {
                                                                document: mediaBuffer,
                                                                mimetype: content?.mimetype || 'application/octet-stream',
                                                                fileName: content?.fileName || `document.${mediaExt}`,
                                                        });
                                                }
                                        } catch (sendErr) {
                                                console.error('\x1b[31m[AntiDelete] Error sending media to', target, ':\x1b[39m', sendErr.message);
                                                await hisoka.sendMessage(target, {
                                                        text: headerText + '\n\n⚠️ _Media gagal dikirim_'
                                                });
                                        }
                                } else {
                                        await hisoka.sendMessage(target, {
                                                text: headerText + '\n\n⚠️ _Media tidak dapat diunduh_'
                                        });
                                }
                        } catch (err) {
                                console.error('\x1b[31m[AntiDelete] Error send to target', target, ':\x1b[39m', err.message);
                        }
                }

                logAntiDelete(senderName, typeName, isGroup, groupName, sendTo);
                
        } catch (err) {
                console.error('\x1b[31m[AntiDelete] Error:\x1b[39m', err);
        }
}

function logAntiDelete(senderName, typeName, isGroup, groupName, sendTo = 'self') {
        const cyan = '\x1b[36m';
        const yellow = '\x1b[33m';
        const green = '\x1b[32m';
        const reset = '\x1b[0m';
        const bold = '\x1b[1m';
        
        const location = isGroup ? `Grup "${groupName}"` : 'Chat Pribadi';
        const dest = sendTo === 'self' ? 'Saved Messages' : sendTo === 'chat' ? 'Chat Asal' : 'Keduanya';
        
        console.log(`${cyan}[AntiDelete]${reset} ${yellow}${typeName}${reset} dari ${bold}${senderName}${reset} @ ${location} → ${green}${dest}${reset}`);
}

// ── Merged from antidel.js ────────────────────────────────────────────────────
export async function handleAd({ hisoka, m, query, tolak, logCommand, loadConfig, saveConfig, getJadibotNumber, getJadibotAntidel, setJadibotUserSetting }) {
	const _isJadibotUserCtx_adel = hisoka?.isMainBot === false && (() => {
		const _sn = (m.sender || '').split('@')[0].split(':')[0];
		const _jn = String(hisoka?.jadibotUserNumber || '').split('@')[0].split(':')[0];
		return !!_jn && _sn === _jn;
	})();
	if (!m.isOwner && !_isJadibotUserCtx_adel) return;
	try {
		const isJadibot  = hisoka?.isMainBot === false;
		const jadibotNum = isJadibot ? getJadibotNumber(hisoka) : null;

		const getAntiDelete  = () => isJadibot
			? getJadibotAntidel(jadibotNum)
			: (loadConfig().antiDelete || { enabled: false, privateChat: false, groupChat: false, sendTo: 'self' });

		const saveAntiDelete = (newVal) => {
			if (isJadibot) setJadibotUserSetting(jadibotNum, 'antidel', newVal);
			else { const cfg = loadConfig(); cfg.antiDelete = newVal; saveConfig(cfg); }
		};

		const antiDelete = getAntiDelete();
		const args       = query ? query.toLowerCase().split(' ') : [];
		const sendTo     = antiDelete.sendTo || 'self';
		const jadibotNote = isJadibot ? `\n_⚙️ Setting khusus jadibot +${jadibotNum}_` : '';

		const sendToLabel = {
			self: '📲 Saved Messages (bot)',
			chat: '💬 Chat / Grup Asal',
			both: '📲 Saved Messages + 💬 Chat Asal'
		};

		if (args.length === 0) {
			const text =
				`╔═══════════════════════╗\n║  🗑️  *ANTI DELETE*  🗑️  ║\n╚═══════════════════════╝\n\n` +
				`📊 *Status:* ${antiDelete.enabled ? '✅ Aktif' : '❌ Nonaktif'}\n` +
				`💬 *Private Chat:* ${antiDelete.privateChat ? '✅' : '❌'}\n` +
				`👥 *Group Chat:* ${antiDelete.groupChat ? '✅' : '❌'}\n` +
				`📤 *Kirim ke:* ${sendToLabel[sendTo] || sendToLabel.self}\n\n` +
				`📋 *Perintah:*\n` +
				`• *.antidel on/off* — Aktifkan/nonaktifkan\n` +
				`• *.antidel private on/off* — Untuk chat pribadi\n` +
				`• *.antidel group on/off* — Untuk grup\n` +
				`• *.antidel all on/off* — Private + Group\n` +
				`• *.antidel sendto self* — Kirim ke saved messages bot\n` +
				`• *.antidel sendto chat* — Kirim balik ke chat/grup asal\n` +
				`• *.antidel sendto both* — Kirim ke keduanya\n\n` +
				`📦 *Didukung:* Teks, Gambar, Video, Audio, Sticker, Dokumen` +
				jadibotNote;
			await tolak(hisoka, m, text);
			return;
		}

		if (args[0] === 'on') {
			if (antiDelete.enabled) await tolak(hisoka, m, 'ℹ️ Anti Delete sudah aktif.');
			else {
				saveAntiDelete({ ...antiDelete, enabled: true });
				await tolak(hisoka, m,
					`✅ *Anti Delete diaktifkan!*\n\n📤 Pesan dihapus akan dikirim ke:\n*${sendToLabel[sendTo] || sendToLabel.self}*\n\n💡 Atur tujuan dengan: *.antidel sendto self/chat/both*` + jadibotNote
				);
			}
		} else if (args[0] === 'off') {
			if (!antiDelete.enabled) await tolak(hisoka, m, 'ℹ️ Anti Delete sudah nonaktif.');
			else { saveAntiDelete({ ...antiDelete, enabled: false }); await tolak(hisoka, m, '✅ *Anti Delete dinonaktifkan.*' + jadibotNote); }
		} else if (args[0] === 'private' && args[1]) {
			const enabled = args[1] === 'on';
			saveAntiDelete({ ...antiDelete, privateChat: enabled });
			await tolak(hisoka, m, `${enabled ? '✅' : '❌'} Anti Delete *Private Chat* ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` + jadibotNote);
		} else if (args[0] === 'group' && args[1]) {
			const enabled = args[1] === 'on';
			saveAntiDelete({ ...antiDelete, groupChat: enabled });
			await tolak(hisoka, m, `${enabled ? '✅' : '❌'} Anti Delete *Group Chat* ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` + jadibotNote);
		} else if (args[0] === 'all' && args[1]) {
			const enabled = args[1] === 'on';
			saveAntiDelete({ ...antiDelete, privateChat: enabled, groupChat: enabled });
			await tolak(hisoka, m, `${enabled ? '✅' : '❌'} Anti Delete *Private + Group* ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` + jadibotNote);
		} else if (args[0] === 'sendto' && args[1]) {
			const valid = ['self', 'chat', 'both'];
			const val   = args[1];
			if (!valid.includes(val)) {
				await tolak(hisoka, m,
					`❌ Nilai tidak valid!\n\nGunakan salah satu:\n• *.antidel sendto self* — Kirim ke saved messages bot\n• *.antidel sendto chat* — Kirim balik ke chat/grup asal\n• *.antidel sendto both* — Kirim ke keduanya`
				);
				return;
			}
			saveAntiDelete({ ...antiDelete, sendTo: val });
			await tolak(hisoka, m,
				`✅ *Tujuan pengiriman anti delete diubah!*\n\n📤 Sekarang dikirim ke:\n*${sendToLabel[val]}*\n\n` +
				`${val === 'chat' ? '⚠️ Semua orang di grup/chat bisa melihat pesan yang dihapus.' : ''}` + jadibotNote
			);
		} else {
			await tolak(hisoka, m, `❌ Perintah tidak valid.\nKetik *.antidel* untuk melihat bantuan.`);
		}
		logCommand(m, hisoka, 'antidel');
	} catch (error) {
		console.error('\x1b[31m[AntiDelete] Error:\x1b[39m', error.message);
		await tolak(hisoka, m, `Terjadi kesalahan: ${error.message}`);
	}
}


/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const plugins = [
    { command: /^(antidel|ad)$/i, tags: ['group'], help: ['antidel'], handler: 'handleAd' },
];
