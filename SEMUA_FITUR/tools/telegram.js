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
 *  telegram.js — Telegram bridge command
 *  Perintah .tele untuk kirim pesan dan media dari WhatsApp ke Telegram
 * ───────────────────────────────
 */
'use strict';

import { telegram } from '../../src/helper/index.js';

// ── Pesan peringatan context-aware bila token/chatId belum lengkap ───────────
// Dipakai .tele on dan tombol .readsw tele on. Kembalikan '' bila lengkap.
export function pesanTeleBelumLengkap(tcfg) {
	const tokenAda = !!String(tcfg?.token || '').trim();
	const chatAda = !!String(tcfg?.chatId || '').trim();
	if (tokenAda && chatAda) return '';
	if (!tokenAda && !chatAda) {
		return `\n\n⚠️ Tapi belum lengkap: *Token & Chat ID* belum diset — status tidak akan terkirim ke Telegram sampai dilengkapi.\n> Cara lengkap: \`.tele tutorial\``;
	}
	if (!chatAda) {
		return `\n\n⚠️ *Chat ID* belum diset — token sudah ada, tinggal satu langkah:\n\n*Cara dapat Chat ID:*\n1. Buka https://t.me/userinfobot di Telegram\n2. Klik *Start*\n3. Bot membalas dengan ID kamu (angka) — copy angka itu\n4. Kirim ke bot ini: \`.tele chatid <id>\`\n5. Tes dengan \`.tele test\`\n\n> *PENTING:* chat dulu bot notifikasi kamu (klik *Start* di botnya) agar bot bisa mengirim pesan ke kamu.`;
	}
	return `\n\n⚠️ *Token* belum diset — Chat ID sudah ada, tinggal tokennya:\n\n*Cara dapat Token:*\n1. Buka https://t.me/BotFather di Telegram\n2. Kirim /newbot lalu ikuti langkahnya\n3. Copy token yang diberikan\n4. Kirim ke bot ini: \`.tele token <token>\`\n5. Tes dengan \`.tele test\``;
}

// ── COMMAND HANDLER ───────────────────────────────────────────────────────────

async function handleTele({ hisoka, m, query, tolak, logCommand, isMainBot, loadConfig, saveConfig }) {
	if (!isMainBot(hisoka)) return;
	if (!m.isOwner) return;
	try {
		const config = loadConfig();
		const telegramConfig = config.telegram || { enabled: true, token: '', chatId: '' };
		const telegramQuery  = m.query ? m.query.toLowerCase().trim() : '';
		const args           = telegramQuery ? telegramQuery.split(' ') : [];
		const validCommands  = ['on', 'off', 'true', 'false', 'token', 'chatid', 'chat_id', 'id', 'tutorial', 'help', 'test', 'cek', 'check'];

		const validateToken = async (token) => {
			try {
				const res  = await fetch(`https://api.telegram.org/bot${token}/getMe`);
				const data = await res.json();
				if (data.ok) return { valid: true, botName: data.result.first_name, username: data.result.username };
				return { valid: false, error: data.description };
			} catch (e) { return { valid: false, error: e.message, netError: true }; }
		};

		const validateChatId = async (token, chatId) => {
			try {
				const res  = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
				const data = await res.json();
				if (data.ok) return { valid: true, chatType: data.result.type, chatTitle: data.result.first_name || data.result.title };
				return { valid: false, error: data.description };
			} catch (e) { return { valid: false, error: e.message, netError: true }; }
		};

		const showHelp = async () => {
			const statusText = telegramConfig.enabled ? '✅ Aktif' : '❌ Nonaktif';
			let tokenStatus = '❌ Belum diset', botInfo = '';
			if (telegramConfig.token) {
				const tokenCheck = await validateToken(telegramConfig.token);
				if (tokenCheck.valid) { tokenStatus = `✅ Valid`; botInfo = `\n┃ *Bot:* @${tokenCheck.username}`; }
				else tokenStatus = `❌ Invalid`;
			}
			let chatIdStatus = '❌ Belum diset', chatInfo = '';
			if (telegramConfig.chatId && telegramConfig.token) {
				const chatCheck = await validateChatId(telegramConfig.token, telegramConfig.chatId);
				if (chatCheck.valid) { chatIdStatus = `✅ Valid`; chatInfo = `\n┃ *Chat:* ${chatCheck.chatTitle}`; }
				else chatIdStatus = `❌ Invalid`;
			} else if (telegramConfig.chatId && !telegramConfig.token) {
				chatIdStatus = '⚠️ Set token dulu';
			}
			let text = `*TELEGRAM NOTIF*\n\n`;
			text += `*Status:* ${statusText}\n*Token:* ${tokenStatus}${botInfo}\n*Chat ID:* ${chatIdStatus}${chatInfo}\n\n`;
			text += `*Penggunaan:*\n`;
			text += `1. \`.tele on\` — aktifkan notifikasi\n`;
			text += `2. \`.tele off\` — nonaktifkan\n`;
			text += `3. \`.tele token <token>\` — set token bot\n`;
			text += `4. \`.tele chatid <id>\` — set chat ID tujuan\n`;
			text += `5. \`.tele test\` — tes kirim\n`;
			text += `6. \`.tele tutorial\` — cara dapat token & chat ID\n\n`;
			text += `> Fitur ini mengirim story WA yang dibaca ke bot Telegram kamu.\n\n`;
			text += `_Multi-prefix, tanpa titik — bot tetap merespon_`;
			return text;
		};

		const showTutorial = () => {
			let text = `*TUTORIAL TELEGRAM*\n\n`;
			text += `*CARA DAPAT BOT TOKEN:*\n`;
			text += `1. Buka https://t.me/BotFather di Telegram\n`;
			text += `2. Kirim /newbot\n`;
			text += `3. Masukkan nama bot\n`;
			text += `4. Masukkan username bot (harus diakhiri \`bot\`)\n`;
			text += `5. Copy token yang diberikan\n`;
			text += `6. Kirim ke bot ini: \`.tele token <token>\`\n\n`;
			text += `*CARA DAPAT CHAT ID:*\n`;
			text += `1. Buka https://t.me/userinfobot di Telegram\n`;
			text += `2. Klik *Start*\n`;
			text += `3. Bot membalas dengan ID kamu (angka)\n`;
			text += `4. Copy angka tersebut\n`;
			text += `5. Kirim ke bot ini: \`.tele chatid <id>\`\n\n`;
			text += `> *PENTING:* setelah dapat token, kamu HARUS chat bot notifikasi kamu dulu (klik *Start* di botnya) agar bot bisa mengirim pesan ke kamu!`;
			return text;
		};

		if (args.length === 0 || !validCommands.includes(args[0])) {
			await tolak(hisoka, m, await showHelp());
			return;
		}

		if (args[0] === 'tutorial' || args[0] === 'help') {
			await tolak(hisoka, m, showTutorial());
		} else if (args[0] === 'test' || args[0] === 'cek' || args[0] === 'check') {
			if (!telegramConfig.token || !telegramConfig.chatId) {
				await tolak(hisoka, m, '❌ Token dan Chat ID harus diset dulu!\n\nGunakan `.tele tutorial` untuk panduan.');
				return;
			}
			try {
				const testMsg = `✅ *Test Berhasil!*\n\nBot WhatsApp kamu berhasil terhubung ke Telegram.\n\n_Pesan ini dikirim pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}_`;
				const res  = await fetch(`https://api.telegram.org/bot${telegramConfig.token}/sendMessage`, {
					method : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body   : JSON.stringify({ chat_id: telegramConfig.chatId, text: testMsg, parse_mode: 'Markdown' })
				});
				const data = await res.json();
				if (!data.ok) {
					await tolak(hisoka, m, `❌ Gagal: ${data.description}\n\nPastikan kamu sudah Start bot di Telegram.`);
					return;
				}
				// Tes jalur media (foto) — jalur yang sama dipakai backup status
				let mediaOk = false, mediaErr = '';
				try {
					const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
					const r2 = await telegram.send(telegramConfig.chatId, png1x1, { type: 'image', caption: '🧪 Tes media .tele — jalur foto OK' });
					mediaOk = !!r2?.ok;
					if (!mediaOk) mediaErr = r2?.description || 'ditolak Telegram';
				} catch (e) { mediaErr = e.message; }
				await tolak(hisoka, m, `✅ *Test teks:* terkirim\n${mediaOk ? '✅' : '❌'} *Test media (foto):* ${mediaOk ? 'terkirim' : `gagal (${mediaErr})`}\n\nCek Telegram kamu.`);
			} catch (e) { await tolak(hisoka, m, `❌ Error: ${e.message}`); }
		} else if (args[0] === 'on' || args[0] === 'true') {
			const _warn = pesanTeleBelumLengkap(telegramConfig);
			if (telegramConfig.enabled) { await tolak(hisoka, m, 'ℹ️ Telegram notifikasi sudah aktif sebelumnya' + _warn); }
			else { config.telegram = { ...telegramConfig, enabled: true }; saveConfig(config); await tolak(hisoka, m, '✅ Telegram notifikasi diaktifkan' + _warn); }
		} else if (args[0] === 'off' || args[0] === 'false') {
			if (!telegramConfig.enabled) { await tolak(hisoka, m, 'ℹ️ Telegram notifikasi sudah nonaktif sebelumnya'); }
			else { config.telegram = { ...telegramConfig, enabled: false }; saveConfig(config); await tolak(hisoka, m, '❌ Telegram notifikasi dinonaktifkan'); }
		} else if (args[0] === 'token' && args[1]) {
			const token = (m.query || '').replace(/^token\s*/i, '').trim();
			const _diganti = !!String(telegramConfig.token || '').trim();
			const _loading = await tolak(hisoka, m, _diganti ? '🔄 *Mengganti token...*\n_Memeriksa token baru ke Telegram..._' : '⏳ *Memeriksa token...*');
			const cek = await validateToken(token);
			let _hasil;
			if (cek.valid) {
				config.telegram = { ...telegramConfig, token }; saveConfig(config);
				const chatAda = !!String(config.telegram.chatId || '').trim();
				_hasil = `✅ *Token ${_diganti ? 'diganti & ' : ''}valid* — @${cek.username}\n\n*Status:*\n*Token:* ✅ valid (@${cek.username})\n*Chat ID:* ${chatAda ? '✅ sudah diset' : '❌ belum diset'}${chatAda ? '\n\n> Semua lengkap — tes dengan `.tele test`.' : '\n\n> Lanjut: `.tele chatid <id>` — cara: `.tele tutorial`'}`;
			} else if (cek.netError) {
				config.telegram = { ...telegramConfig, token }; saveConfig(config);
				_hasil = `⚠️ Token tersimpan, tapi verifikasi gagal (jaringan).\nCek lagi dengan \`.tele\` nanti.`;
			} else {
				_hasil = `❌ *Token tidak valid:* ${cek.error || 'ditolak Telegram'}\n\nToken tidak disimpan. Ambil token baru via https://t.me/BotFather lalu coba lagi.`;
			}
			try {
				if (_loading?.key) await m.reply({ edit: _loading.key, text: _hasil });
				else await tolak(hisoka, m, _hasil);
			} catch (_) { await tolak(hisoka, m, _hasil); }
		} else if ((args[0] === 'chatid' || args[0] === 'chat_id' || args[0] === 'id') && args[1]) {
			const chatIdValue = (m.query || '').replace(/^(chatid|chat_id|id)\s*/i, '').trim();
			const tokenNow = String(telegramConfig.token || '').trim();
			const _diganti = !!String(telegramConfig.chatId || '').trim();
			const _loading = await tolak(hisoka, m, _diganti ? '🔄 *Mengganti Chat ID...*\n_Memeriksa ke Telegram..._' : '⏳ *Memeriksa Chat ID...*');
			let _hasil;
			if (!tokenNow) {
				config.telegram = { ...telegramConfig, chatId: chatIdValue }; saveConfig(config);
				_hasil = `✅ *Chat ID tersimpan:* \`${chatIdValue}\`\n\n*Status:*\n*Token:* ❌ belum diset\n*Chat ID:* ✅ sudah diset (belum terverifikasi — token belum ada)\n\n> Lanjut: set token dulu (\`.tele tutorial\`), lalu \`.tele test\`.`;
			} else {
				const cekTok = await validateToken(tokenNow);
				if (!cekTok.valid && !cekTok.netError) {
					config.telegram = { ...telegramConfig, chatId: chatIdValue }; saveConfig(config);
					_hasil = `✅ *Chat ID tersimpan:* \`${chatIdValue}\`\n\n⚠️ *Token* bermasalah (${cekTok.error || 'tidak valid'}) — Chat ID belum bisa diverifikasi.\nPerbaiki token via \`.tele token <token>\`.`;
				} else {
					const cekChat = await validateChatId(tokenNow, chatIdValue);
					if (cekChat.valid) {
						config.telegram = { ...telegramConfig, chatId: chatIdValue }; saveConfig(config);
						const namaTok = cekTok.valid ? ` (@${cekTok.username})` : '';
						_hasil = `✅ *Chat ID ${_diganti ? 'diganti & ' : ''}valid* — ${cekChat.chatTitle}\n\n*Status:*\n*Token:* ✅ ${cekTok.valid ? 'valid' : 'sudah diset (belum terverifikasi)'}${namaTok}\n*Chat ID:* ✅ valid\n\n> Semua lengkap — tes dengan \`.tele test\`.`;
					} else if (cekChat.netError) {
						config.telegram = { ...telegramConfig, chatId: chatIdValue }; saveConfig(config);
						_hasil = `⚠️ Chat ID tersimpan, tapi verifikasi gagal (jaringan).\nCek lagi dengan \`.tele\` nanti.`;
					} else {
						_hasil = `❌ *Chat ID tidak valid:* ${cekChat.error || 'ditolak Telegram'}\n\nChat ID tidak disimpan. Pastikan kamu sudah klik *Start* di bot notifikasi kamu, lalu ambil ID dari https://t.me/userinfobot.`;
					}
				}
			}
			try {
				if (_loading?.key) await m.reply({ edit: _loading.key, text: _hasil });
				else await tolak(hisoka, m, _hasil);
			} catch (_) { await tolak(hisoka, m, _hasil); }
		} else if (args[0] === 'token' && !args[1]) {
			await tolak(hisoka, m, '❌ Format: `.tele token <bot_token>`');
		} else if ((args[0] === 'chatid' || args[0] === 'chat_id' || args[0] === 'id') && !args[1]) {
			await tolak(hisoka, m, '❌ Format: `.tele chatid <chat_id>`');
		} else {
			await tolak(hisoka, m, await showHelp());
		}

		logCommand(m, hisoka, 'telegram');
	} catch (error) {
		console.error('\x1b[31m[Telegram] Error:\x1b[39m', error.message);
		await tolak(hisoka, m, `Error: ${error.message}`);
	}
}

export { handleTele };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(telegram|tele)$/i;
export const tags = ['tools'];
export const help = ['telegram'];
export default handleTele;
