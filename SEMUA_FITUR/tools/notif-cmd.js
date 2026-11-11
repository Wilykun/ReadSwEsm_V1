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
 *  notif-cmd.js — Notifikasi Event WhatsApp (.notif / .notifuser)
 *  Owner only, bot utama saja.
 *
 *  Cara kerja: buat event WA via API pihak ketiga (gql.nixel.dev),
 *  undang target, lalu hapus event-nya lagi — pembuatan + undangan
 *  event memicu notifikasi di HP target ("Woi").
 *
 *  ⚠️ PERINGATAN KEAMANAN (baca sebelum pakai):
 *  API ini butuh kredensial bot (me.lid + noiseKey public & PRIVATE)
 *  yang dikirim ke server pihak ketiga (gql.nixel.dev, bukan Meta).
 *  noiseKey private = identitas kriptografi akun WA bot — siapa pun
 *  yang menyimpannya bisa menyamar jadi akun bot. Klaim "tidak
 *  disimpan" di kode asli tidak bisa diverifikasi dari sini.
 *  Pakai fitur ini = percaya server itu. Risiko ditanggung owner.
 *
 *  Batasan: maks 500x per perintah (anti-spam / anti-banned).
 */
'use strict';

import { delay } from '@whiskeysockets/baileys';
import { parseMention } from '../../src/helper/utils.js';

const API_URL = 'https://gql.nixel.dev';
const MAKS_JUMLAH = 500; // maks pengulangan per perintah
const FETCH_TIMEOUT_MS = 15_000; // timeout tiap request API
const MAKS_PERCOBAAN = 15; // total percobaan API sebelum menyerah

export const command = /^(notif|notifuser)$/i;
export const tags = ['tools'];
export const help = [
	'notif <teks>|<jumlah>',
	'notifuser <@user/nomor>|<teks>|<jumlah>'
];

/** Kirim reaksi ke pesan pemicu (m.react tidak ada di bot ini). */
async function react(hisoka, m, emoji) {
	try {
		await hisoka.sendMessage(m.from, { react: { text: emoji, key: m.key } });
	} catch (_) {}
}

function getApiCreds(hisoka) {
	const creds = hisoka?.authState?.creds;
	if (!creds?.me?.lid || !creds?.noiseKey?.public || !creds?.noiseKey?.private) {
		throw new Error('Kredensial bot tidak lengkap (me.lid / noiseKey tidak ada di sesi).');
	}
	return {
		me: {
			lid: creds.me.lid
		},
		noiseKey: {
			public: Buffer.from(creds.noiseKey.public).toString('base64'),
			private: Buffer.from(creds.noiseKey.private).toString('base64')
		}
	};
}

async function api(hisoka, path, body = {}) {
	const errorRetries = {};
	const apiCreds = getApiCreds(hisoka);
	let totalPercobaan = 0;

	while (true) {
		totalPercobaan++;
		if (totalPercobaan > MAKS_PERCOBAAN) {
			throw new Error(`API ${API_URL} tidak merespons setelah ${MAKS_PERCOBAAN}x percobaan.`);
		}
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
			let response;
			try {
				response = await fetch(`${API_URL}${path}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ creds: apiCreds, ...body }),
					signal: controller.signal
				});
			} finally {
				clearTimeout(timer);
			}

			const text = await response.text();
			let result;
			try {
				result = JSON.parse(text);
			} catch {
				throw new Error(`Respons API tidak valid: ${text.slice(0, 200)}`);
			}

			if (!response.ok || !result.success) {
				throw new Error(result.message || `HTTP ${response.status}`);
			}

			return result;
		} catch (err) {
			const errKey = err.message || 'Unknown Error';
			errorRetries[errKey] = (errorRetries[errKey] || 0) + 1;

			if (errorRetries[errKey] > 5) {
				throw err;
			}

			await delay(1000);
		}
	}
}

async function createEvent(hisoka, eventDetails) {
	return api(hisoka, '/api/event/create', eventDetails);
}

async function addInvitations(hisoka, eventId, userLid) {
	return api(hisoka, '/api/event/invite', { eventId, userLid });
}

async function deleteEvent(hisoka, eventId) {
	return api(hisoka, '/api/event/delete', { eventId });
}

async function triggerEventNotif(hisoka, eventDetails, memberLids) {
	const now = Math.floor(Date.now() / 1000);
	const res = await createEvent(hisoka, {
		name: eventDetails.name || 'New Event',
		description: eventDetails.description || '',
		chatJid: eventDetails.chatJid,
		start_ts_sec: eventDetails.start_ts_sec || now + 3600,
		end_ts_sec: eventDetails.end_ts_sec || now + 7200,
		reminder_ts_sec: eventDetails.reminder_ts_sec || now + 3000
	});

	const eventId = res.data?.id || res.event?.id;
	if (!eventId) throw new Error('Event ID tidak ditemukan di respons API.');

	// Undang gagal = notifikasi tidak terkirim → tugas ini GAGAL.
	// Event tetap dihapus dulu (cleanup) sebelum throw.
	let inviteError = null;
	if (memberLids && memberLids.length > 0) {
		const userLid = memberLids.length === 1 ? memberLids[0] : memberLids;
		try {
			await addInvitations(hisoka, eventId, userLid);
		} catch (err) {
			inviteError = err;
			console.error(`[Notif] invite gagal (event ${eventId}):`, err.message);
		}
	}

	// Hapus gagal = event nyangkut (notifikasi sudah terkirim).
	let hapusGagal = false;
	try {
		await deleteEvent(hisoka, eventId);
	} catch (err) {
		hapusGagal = true;
		console.error(`[Notif] hapus event gagal (${eventId}):`, err.message);
	}

	if (inviteError) throw new Error(`Undang gagal: ${inviteError.message}`);
	return { ok: true, hapusGagal };
}

/**
 * Normalisasi nomor ke format 62xxx (WAJIB, sesuai scraper/API).
 * 0858xxx → 62858xxx ; 858xxx → 62858xxx ; 62858xxx → tetap.
 * Kembalikan null bila bukan nomor Indonesia yang valid.
 */
function normalisasiNomor(nomor) {
	const digits = String(nomor || '').replace(/[^0-9]/g, '');
	if (!digits) return null;
	let n = digits;
	if (n.startsWith('0')) n = '62' + n.slice(1);
	else if (n.startsWith('8')) n = '62' + n;
	if (!/^62\d{7,14}$/.test(n)) return null;
	return n;
}

async function toLid(hisoka, jid) {
	if (jid.endsWith('@lid') || jid.endsWith('@g.us')) return jid;
	const pn = jid.includes('@') ? jid : `${jid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
	const lid = await hisoka.signalRepository?.lidMapping?.getLIDForPN?.(pn);
	if (!lid) throw new Error(`LID tidak ditemukan untuk ${pn}`);
	return lid;
}

/**
 * Jalankan tugas bertahap (chunk 10) — 500x paralel sekaligus bisa
 * bikin socket habis / API rate-limit, jadi dipecah per chunk.
 * Kembalikan hasil per tugas (sukses/gagal + alasan) untuk ringkasan akurat.
 */
async function jalankanBertahap(tasks, ukuranChunk = 10) {
	const hasil = [];
	for (let i = 0; i < tasks.length; i += ukuranChunk) {
		const chunk = tasks.slice(i, i + ukuranChunk);
		const out = await Promise.all(chunk.map(async (t) => {
			try {
				const r = await t.run();
				return { label: t.label, ok: true, hapusGagal: !!r?.hapusGagal };
			} catch (e) {
				return { label: t.label, ok: false, error: e.message || String(e) };
			}
		}));
		hasil.push(...out);
	}
	return hasil;
}

/**
 * Ringkasan hasil realtime (hitungan dari hasil asli tiap tugas).
 * Format WA lengkap sesuai konteks: quote, bold, italic, coret, kode,
 * daftar bernomor (per target), daftar berpoint (hasil). Tanpa format bersarang.
 */
function bangunRingkasan({ perintah, teks, jenisTarget, jumlahTarget, hasil, durasiDetik }) {
	const berhasil = hasil.filter(h => h.ok).length;
	const gagal = hasil.length - berhasil;
	const hapusGagal = hasil.filter(h => h.hapusGagal).length;

	const perTarget = new Map();
	for (const h of hasil) {
		const t = perTarget.get(h.label) || { label: h.label, ok: 0, fail: 0 };
		if (h.ok) t.ok++;
		else t.fail++;
		perTarget.set(h.label, t);
	}

	const judul = berhasil === 0 ? '❌ *Notifikasi Event Gagal*'
		: gagal > 0 ? '⚠️ *Notifikasi Event Selesai — Ada yang Gagal*'
		: '✅ *Notifikasi Event Selesai*';
	const targetBaris = jenisTarget === 'grup'
		? `*Target:* *${jumlahTarget}* anggota grup`
		: `*Target:* *${jumlahTarget}* pengguna`;

	const baris = [];
	baris.push(`> ${judul}`, '');
	baris.push(`*Perintah:* \`${perintah}\``);
	baris.push(`*Pesan:* \`${teks}\``);
	baris.push(targetBaris, '');
	baris.push('*Hasil:*');
	baris.push(`• *Berhasil:* *${berhasil}*`);
	baris.push(`• *Gagal:* *${gagal}*`);

	if (jenisTarget === 'user' && perTarget.size > 1) {
		baris.push('', '*Per target:*');
		let i = 0;
		for (const t of perTarget.values()) {
			i++;
			if (i > 10) { baris.push(`...dan *${perTarget.size - 10}* target lainnya`); break; }
			const total = t.ok + t.fail;
			if (t.fail === 0) baris.push(`${i}. \`${t.label}\` — *Berhasil* (${t.ok}/${total})`);
			else if (t.ok === 0) baris.push(`${i}. ~${t.label}~ — *Gagal* (0/${total})`);
			else baris.push(`${i}. \`${t.label}\` — *Berhasil* ${t.ok}/${total}, *Gagal* ${t.fail}`);
		}
	}

	if (gagal > 0) {
		const alasan = [...new Set(hasil.filter(h => !h.ok).map(h => h.error).filter(Boolean))].slice(0, 3);
		if (alasan.length) {
			baris.push('', '*Alasan gagal:*');
			for (const a of alasan) baris.push(`• _${a}_`);
		}
	}

	baris.push('', `*Total:* \`${hasil.length}\` notifikasi · *Waktu:* \`${durasiDetik} detik\``);
	if (hapusGagal > 0) baris.push(`_Catatan: ${hapusGagal} event tidak terhapus otomatis._`);
	baris.push('', gagal === 0
		? '> _Semua notifikasi berhasil terkirim._'
		: berhasil === 0
			? '> _Tidak ada notifikasi yang terkirim._'
			: '> _Cek lagi target yang gagal, lalu ulangi._');
	return baris.join('\n');
}

async function handleNotif({ hisoka, m, query, pfx, isMainBot }) {
	// Hanya bot utama, hanya owner.
	if (!isMainBot(hisoka)) return;
	if (!m.isOwner) return;

	const isNotifUser = m.command === 'notifuser';
	const text = (query || '').trim();

	if (!text) {
		if (isNotifUser) {
			return m.reply(
				`Contoh penggunaan (nomor 62xxx WAJIB):\n` +
				`*${pfx}notifuser 62858xxx|woi*\n` +
				`*${pfx}notifuser @62858xxx @62859xxx|woi|5*\n` +
				`*${pfx}notifuser 62858xxx Gw jago | 2*\n` +
				`_Nomor 0858xxx otomatis jadi 62xxx. Maks ${MAKS_JUMLAH}x per perintah._`
			);
		}
		return m.reply(
			`Contoh penggunaan:\n` +
			`*${pfx}notif woi*\n` +
			`*${pfx}notif woi|10*\n` +
			`_Maks ${MAKS_JUMLAH}x per perintah._`
		);
	}

	await react(hisoka, m, '⌛');

	try {
		const t0 = Date.now();
		const now = Math.floor(Date.now() / 1000);
		const startTime = now + 3600;
		const endTime = now + 7200;
		const reminderTime = now + 3000;
		const tasks = [];
		const batasi = (n) => Math.min(Math.max(n || 1, 1), MAKS_JUMLAH);
		let namaEvent = 'Woi';
		let jenisTarget = 'grup';
		let jumlahTarget = 0;

		if (isNotifUser) {
			const parts = text.split('|').map(v => v.trim());
			let targetPart = '';
			let eventName = 'Woi';
			let count = 1;

			if (parts.length >= 3) {
				targetPart = parts[0];
				eventName = parts[1] || 'Woi';
				const parsedCount = parseInt(parts[2]);
				if (!isNaN(parsedCount) && parsedCount > 0) count = parsedCount;
			} else if (parts.length === 2) {
				if (/^\d+$/.test(parts[1])) {
					count = parseInt(parts[1]);
					const firstPart = parts[0];
					const numMatch = firstPart.match(/^(\+?\d{8,16})\s+([\s\S]+)$/);
					if (numMatch) {
						targetPart = numMatch[1];
						eventName = numMatch[2].trim();
					} else {
						targetPart = firstPart;
						eventName = firstPart.replace(/@\S+/g, '').trim() || 'Woi';
					}
				} else {
					targetPart = parts[0];
					eventName = parts[1] || 'Woi';
				}
			} else {
				const numMatch = parts[0].match(/^(\+?\d{8,16})\s+([\s\S]+)$/);
				if (numMatch) {
					targetPart = numMatch[1];
					eventName = numMatch[2].trim();
				} else {
					targetPart = parts[0];
					eventName = parts[0].replace(/@\S+/g, '').trim() || 'Woi';
				}
			}
			count = batasi(count);

			let rawTargets = parseMention(targetPart) || [];

			// Fallback 1: nomor polos di teks (628xxx tanpa @)
			if (rawTargets.length === 0) {
				const numbers = targetPart.match(/\d{8,16}/g) || [];
				for (const num of numbers) {
					rawTargets.push(`${num}@s.whatsapp.net`);
				}
			}

			// Fallback 2: mention beneran yang diketuk di pesan (m.mentions)
			if (rawTargets.length === 0 && Array.isArray(m.mentions) && m.mentions.length) {
				rawTargets = [...m.mentions];
			}

			// WAJIB nomor 62xxx (sesuai scraper/API): normalisasi tiap target
			// ke format 62xxx; target tanpa nomor valid dibuang.
			const target62 = [];
			for (const jid of rawTargets) {
				if (String(jid).endsWith('@lid')) { target62.push(jid); continue; }
				const num = normalisasiNomor(String(jid).split('@')[0]);
				if (num) target62.push(`${num}@s.whatsapp.net`);
			}
			rawTargets = target62;

			if (rawTargets.length === 0) {
				throw new Error('Nomor 62xxx wajib ada! Contoh: .notifuser 62858xxx|woi|5');
			}

			const targetLids = [...new Set(await Promise.all(rawTargets.map(jid => toLid(hisoka, jid))))];
			namaEvent = eventName;
			jenisTarget = 'user';
			jumlahTarget = targetLids.length;

			for (const lid of targetLids) {
				for (let i = 0; i < count; i++) {
					tasks.push({
						label: String(lid).split('@')[0],
						run: () =>
							triggerEventNotif(hisoka, {
								name: eventName,
								description: 'Created and deleted silently',
								chatJid: lid,
								start_ts_sec: startTime,
								end_ts_sec: endTime,
								reminder_ts_sec: reminderTime
							}, [lid])
					});
				}
			}
		} else {
			const parts = text.split('|').map(v => v.trim());
			const eventName = parts[0] || 'Woi';
			const parsedCount = parseInt(parts[1]);
			const count = batasi(!isNaN(parsedCount) && parsedCount > 0 ? parsedCount : 1);

			let chatJid = m.chat;
			let memberLids = [];

			if (m.chat.endsWith('@g.us')) {
				const groupMetadata = await hisoka.groupMetadata(m.chat);
				const participants = groupMetadata.participants || [];
				memberLids = await Promise.all(
					participants.map(async ({ id }) => {
						if (id.endsWith('@lid')) return id;
						const lid = await hisoka.signalRepository?.lidMapping?.getLIDForPN?.(id);
						return lid || id;
					})
				);
			} else {
				chatJid = await toLid(hisoka, m.chat);
				memberLids = [chatJid];
			}
			namaEvent = eventName;
			if (m.chat.endsWith('@g.us')) {
				jenisTarget = 'grup';
				jumlahTarget = memberLids.length;
			} else {
				jenisTarget = 'user';
				jumlahTarget = 1;
			}

			for (let i = 0; i < count; i++) {
				tasks.push({
					label: 'grup',
					run: () =>
						triggerEventNotif(hisoka, {
							name: eventName,
							description: 'Created and deleted silently',
							chatJid: chatJid,
							start_ts_sec: startTime,
							end_ts_sec: endTime,
							reminder_ts_sec: reminderTime
						}, memberLids)
				});
			}
		}

		await react(hisoka, m, '⏳');
		// Maks 500x TOTAL per perintah (bukan per target).
		const tugasJalan = tasks.slice(0, MAKS_JUMLAH);
		const hasil = await jalankanBertahap(tugasJalan);
		const durasiDetik = ((Date.now() - t0) / 1000).toFixed(1);
		const berhasil = hasil.filter(h => h.ok).length;
		const gagal = hasil.length - berhasil;
		await react(hisoka, m, berhasil === 0 ? '❌' : gagal > 0 ? '⚠️' : '✅');
		m.reply(bangunRingkasan({
			perintah: m.command,
			teks: namaEvent,
			jenisTarget,
			jumlahTarget,
			hasil,
			durasiDetik
		}));
	} catch (e) {
		console.error('[Notif]', e);
		await react(hisoka, m, '❌');
		m.reply(`Terjadi kesalahan: ${e.message}`);
	}
}

export default handleNotif;
