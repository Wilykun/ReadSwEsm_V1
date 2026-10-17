/**
 * ───────────────────────────────
 *  Base Script : Bang Dika Ardnt
 *  Recode By   : Bang Wilykun
 *  WhatsApp    : 6289688206739
 *  Telegram    : @Wilykun1994
 * ───────────────────────────────
 *
 *  infobola-cmd.js — .infobola : info sepak bola Indonesia
 *  (klasemen Super League realtime dari OneFootball)
 * ───────────────────────────────
 */
'use strict';

import https from 'https';
import sharp from 'sharp';
import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

/* ── Fetch HTML OneFootball ── */
function fetchHtml(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html',
                'Accept-Language': 'id-ID,id;q=0.9',
            },
            timeout: 20000,
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

/* ── Parse klasemen dari HTML (termasuk logo) ── */
function parseKlasemen(html) {
    const pattern = /"position":(\d+),"positionChange":(-?\d+),"teamName":"([^"]+)","imageObject":\{"path":"([^"]+)".*?"playedMatchesCount":(\d+),"wonMatchesCount":(\d+),"drawnMatchesCount":(\d+),"lostMatchesCount":(\d+),"goalsDiff":(-?\d+),"points":(\d+)/g;
    const rows = [];
    let m;
    while ((m = pattern.exec(html)) !== null) {
        rows.push({
            pos: parseInt(m[1]),
            chg: parseInt(m[2]),
            nama: m[3],
            logo: m[4],
            main: parseInt(m[5]),
            menang: parseInt(m[6]),
            seri: parseInt(m[7]),
            kalah: parseInt(m[8]),
            sg: parseInt(m[9]),
            poin: parseInt(m[10]),
        });
    }
    return rows.sort((a, b) => a.pos - b.pos);
}

/* ── Download logo jadi base64 ── */
function fetchLogo(url) {
    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const mime = res.headers['content-type'] || 'image/png';
                resolve(`data:${mime};base64,${buf.toString('base64')}`);
            });
        }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
    });
}

/* ── Generate gambar klasemen ala FlashScore (dark theme + logo) ── */
async function buildKlasemenSvg(rows) {
    const W = 760, rowH = 48, headerH = 90;
    const H = headerH + rows.length * rowH + 50;

    /* Download semua logo paralel */
    const logos = await Promise.all(rows.map(r => fetchLogo(r.logo)));

    let y = headerH;
    let rowsSvg = '';
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const bg = r.pos % 2 === 0 ? '#1a1a2e' : '#16213e';
        const posColor = r.pos <= 2 ? '#00ff88' : (r.pos >= 16 ? '#ff4444' : '#ffffff');
        const arrow = r.chg > 0 ? '▲' : (r.chg < 0 ? '▼' : '•');
        const arrowColor = r.chg > 0 ? '#00ff88' : (r.chg < 0 ? '#ff4444' : '#888888');
        const logoImg = logos[i]
            ? `<image href="${logos[i]}" x="70" y="${y+8}" width="32" height="32"/>`
            : '';
        const namaX = logos[i] ? 112 : 75;
        rowsSvg +=
            `<rect x="10" y="${y}" width="${W-20}" height="${rowH}" rx="6" fill="${bg}"/>` +
            `<text x="35" y="${y+31}" font-family="Arial" font-size="20" font-weight="bold" fill="${posColor}">${r.pos}</text>` +
            logoImg +
            `<text x="${namaX}" y="${y+31}" font-family="Arial" font-size="17" fill="#ffffff">${r.nama.length > 18 ? r.nama.slice(0,18) : r.nama}</text>` +
            `<text x="350" y="${y+31}" font-family="Arial" font-size="15" fill="#aaaaaa">${r.main}</text>` +
            `<text x="395" y="${y+31}" font-family="Arial" font-size="15" fill="#aaaaaa">${r.menang}</text>` +
            `<text x="440" y="${y+31}" font-family="Arial" font-size="15" fill="#aaaaaa">${r.seri}</text>` +
            `<text x="485" y="${y+31}" font-family="Arial" font-size="15" fill="#aaaaaa">${r.kalah}</text>` +
            `<text x="540" y="${y+31}" font-family="Arial" font-size="15" fill="#aaaaaa">${r.sg > 0 ? '+' : ''}${r.sg}</text>` +
            `<text x="605" y="${y+31}" font-family="Arial" font-size="20" font-weight="bold" fill="#ffdd00">${r.poin}</text>` +
            `<text x="675" y="${y+31}" font-family="Arial" font-size="15" fill="${arrowColor}">${arrow}</text>`;
        y += rowH;
    }

    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">` +
        `<rect width="${W}" height="${H}" fill="#0f0f1a"/>` +
        `<text x="20" y="40" font-family="Arial" font-size="28" font-weight="bold" fill="#ffffff">⚽ KLASEMEN SUPER LEAGUE</text>` +
        `<text x="20" y="65" font-family="Arial" font-size="14" fill="#888888">${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • OneFootball</text>` +
        `<text x="35" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">#</text>` +
        `<text x="75" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">TIM</text>` +
        `<text x="350" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">M</text>` +
        `<text x="395" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">W</text>` +
        `<text x="440" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">D</text>` +
        `<text x="485" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">L</text>` +
        `<text x="535" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">SG</text>` +
        `<text x="600" y="${headerH-10}" font-family="Arial" font-size="13" fill="#666666">PTS</text>` +
        rowsSvg +
        `<text x="20" y="${H-15}" font-family="Arial" font-size="12" fill="#666666">🟢 Zona AFC  •  🔴 Degradasi</text>` +
        `</svg>`;
}

async function klasemenToImage(rows) {
    const svg = await buildKlasemenSvg(rows);
    return sharp(Buffer.from(svg)).png().toBuffer();
}

/* ── Format klasemen ── */
function formatKlasemen(rows) {
    const tgl = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    let out = `⚽ *KLASEMEN SUPER LEAGUE*\n_${tgl}_\n\n`;

    /* Top 3 */
    out += `*TOP 3*\n`;
    for (let i = 0; i < 3 && i < rows.length; i++) {
        const r = rows[i];
        const medal = ['🥇', '🥈', '🥉'][i];
        out += `${medal} _${r.nama}_ — *${r.poin} pts*\n`;
    }
    out += `\n`;

    /* Daftar lengkap */
    out += `*DAFTAR KLASEMEN*\n`;
    for (const r of rows) {
        const arrow = r.chg > 0 ? '🔼' : (r.chg < 0 ? '🔽' : '▪️');
        const zona = r.pos >= 16 ? '🔴' : (r.pos <= 2 ? '🟢' : '');
        out += `${r.pos}. ${r.nama} ${zona}\n`;
        out += `   \`M:${r.main} W:${r.menang} D:${r.seri} L:${r.kalah}\` SG:${r.sg > 0 ? '+' : ''}${r.sg} • *${r.poin}* ${arrow}\n`;
    }

    out += `\n> 🟢 _Zona AFC_\n> 🔴 _Degradasi_\n`;
    out += `> _Sumber: OneFootball_`;
    return out;
}

/* ── Parse jadwal/hasil dari __NEXT_DATA__ ── */
function parseMatches(html) {
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!m) return [];
    try {
        const data = JSON.parse(m[1]);
        const results = [];
        (function find(obj) {
            if (!obj || typeof obj !== 'object') return;
            if (Array.isArray(obj)) { obj.forEach(find); return; }
            if (obj.homeTeam && obj.awayTeam && obj.kickoff) {
                results.push({
                    home: obj.homeTeam.name || '?',
                    away: obj.awayTeam.name || '?',
                    hs: obj.homeTeam.score || '',
                    as: obj.awayTeam.score || '',
                    kickoff: obj.kickoff,
                });
            }
            Object.values(obj).forEach(find);
        })(data);
        return results;
    } catch { return []; }
}

function formatHasil(matches) {
    const hasil = matches.filter(x => x.hs || x.as);
    if (!hasil.length) return `📋 *HASIL PERTANDINGAN*\n\n_Belum ada hasil terbaru._`;
    let out = `📋 *HASIL PERTANDINGAN*\n_Super League_\n\n`;
    for (const x of hasil.slice(0, 10)) {
        out += `• *${x.home}* ${x.hs}-${x.as} _${x.away}_\n`;
    }
    out += `\n_Sumber: OneFootball_`;
    return out;
}

function formatJadwal(matches) {
    const jadwal = matches.filter(x => !x.hs && !x.as);
    if (!jadwal.length) return `📅 *JADWAL PERTANDINGAN*\n\n_Belum ada jadwal._`;
    let out = `📅 *JADWAL PERTANDINGAN*\n_Super League_\n\n`;
    for (const x of jadwal.slice(0, 10)) {
        let tgl = x.kickoff;
        try {
            const d = new Date(x.kickoff);
            tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' +
                  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        } catch {}
        out += `• _${tgl}_ WIB\n  *${x.home}* vs _${x.away}_\n`;
    }
    out += `\n_Sumber: OneFootball_`;
    return out;
}

/* ── Map untuk hapus pesan menu setelah dipilih ── */
const _menuMsgMap = new Map();
async function _deleteMenuMsg(hisoka, jid) {
    const key = _menuMsgMap.get(jid);
    if (!key) return;
    try { await hisoka.sendMessage(jid, { delete: key }); } catch (_) {}
    _menuMsgMap.delete(jid);
}

/* ── Generate gambar hasil pertandingan ── */
async function hasilToImage(matches) {
    const hasil = matches.filter(x => x.hs || x.as).slice(0, 10);
    const W = 720, rowH = 52, headerH = 90;
    const H = headerH + hasil.length * rowH + 50;
    let y = headerH;
    let rowsSvg = '';
    for (let i = 0; i < hasil.length; i++) {
        const x = hasil[i];
        const bg = i % 2 === 0 ? '#1a1a2e' : '#16213e';
        rowsSvg +=
            `<rect x="10" y="${y}" width="${W-20}" height="${rowH}" rx="6" fill="${bg}"/>` +
            `<text x="30" y="${y+33}" font-family="Arial" font-size="17" fill="#ffffff" text-anchor="end">${x.home.length > 18 ? x.home.slice(0,18) : x.home}</text>` +
            `<text x="${W/2}" y="${y+33}" font-family="Arial" font-size="22" font-weight="bold" fill="#ffdd00" text-anchor="middle">${x.hs} - ${x.as}</text>` +
            `<text x="${W-30}" y="${y+33}" font-family="Arial" font-size="17" fill="#ffffff" text-anchor="start">${x.away.length > 18 ? x.away.slice(0,18) : x.away}</text>`;
        y += rowH;
    }
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${W}" height="${H}" fill="#0f0f1a"/>` +
        `<text x="20" y="40" font-family="Arial" font-size="28" font-weight="bold" fill="#ffffff">📋 HASIL PERTANDINGAN</text>` +
        `<text x="20" y="65" font-family="Arial" font-size="14" fill="#888888">${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} • OneFootball</text>` +
        rowsSvg + `</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

/* ── Generate gambar jadwal pertandingan ── */
async function jadwalToImage(matches) {
    const jadwal = matches.filter(x => !x.hs && !x.as).slice(0, 10);
    const W = 720, rowH = 56, headerH = 90;
    const H = headerH + jadwal.length * rowH + 50;
    let y = headerH;
    let rowsSvg = '';
    for (let i = 0; i < jadwal.length; i++) {
        const x = jadwal[i];
        const bg = i % 2 === 0 ? '#1a1a2e' : '#16213e';
        let tgl = '';
        try {
            const d = new Date(x.kickoff);
            tgl = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }) + ' ' +
                  d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
        } catch {}
        rowsSvg +=
            `<rect x="10" y="${y}" width="${W-20}" height="${rowH}" rx="6" fill="${bg}"/>` +
            `<text x="30" y="${y+24}" font-family="Arial" font-size="13" fill="#888888">${tgl} WIB</text>` +
            `<text x="30" y="${y+44}" font-family="Arial" font-size="17" fill="#ffffff">${(x.home.length > 20 ? x.home.slice(0,20) : x.home)} vs ${(x.away.length > 20 ? x.away.slice(0,20) : x.away)}</text>` +
            `<text x="${W-30}" y="${y+34}" font-family="Arial" font-size="14" fill="#00ff88" text-anchor="end">VS</text>`;
        y += rowH;
    }
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${W}" height="${H}" fill="#0f0f1a"/>` +
        `<text x="20" y="40" font-family="Arial" font-size="28" font-weight="bold" fill="#ffffff">📅 JADWAL PERTANDINGAN</text>` +
        `<text x="20" y="65" font-family="Arial" font-size="14" fill="#888888">Super League • OneFootball</text>` +
        rowsSvg + `</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

async function handleInfobola({ hisoka, m, query, tolak, logCommand, Button }) {
    try {
        if (typeof logCommand === 'function') logCommand(m, hisoka, 'infobola');

        const arg = String(query || '').trim().toLowerCase();

        /* Menu dengan single-select Button (cara .readsw yang work) */
        if (!arg || arg === 'menu') {
            if (Button) {
                try {
                    const btn = new Button()
                        .setBody(`⚽ *INFO BOLA*\n_Super League Indonesia_\n\nPilih info yang mau dilihat:`)
                        .setFooter(`Data realtime • OneFootball`)
                        .addSelection(`📋 Pilih Menu`)
                        .makeSections(`Menu Info Bola`)
                        .makeRow('📊 Klasemen', 'Klasemen', 'Klasemen Super League + gambar', `.infobola klasemen`)
                        .makeRow('📋 Hasil', 'Hasil Pertandingan', 'Hasil laga terakhir', `.infobola hasil`)
                        .makeRow('📅 Jadwal', 'Jadwal Pertandingan', 'Jadwal laga berikutnya', `.infobola jadwal`);
                    const result = await btn.run(m.from, hisoka, m);
                    if (result?.key) _menuMsgMap.set(m.from, result.key);
                    return;
                } catch (e) {
                    console.error('[INFOBOLA] Button gagal:', e?.message);
                }
            }
            /* Fallback teks */
            await m.reply(
                `⚽ *INFO BOLA*\n_Super League Indonesia_\n\n` +
                `Pilih:\n` +
                `• _.infobola klasemen_ — 📊 Klasemen\n` +
                `• _.infobola hasil_ — 📋 Hasil pertandingan\n` +
                `• _.infobola jadwal_ — 📅 Jadwal pertandingan\n\n` +
                `_Data realtime dari OneFootball._`
            );
            return;
        }

        /* Hasil & Jadwal — hapus pesan menu dulu, kirim gambar */
        if (arg === 'hasil' || arg === 'jadwal') {
            await _deleteMenuMsg(hisoka, m.from);
            await m.reply(`⏳ _Mengambil ${arg}..._`);
            try {
                const html = await fetchHtml('https://onefootball.com/id/kompetisi/liga-super-148/jadwal');
                const matches = parseMatches(html);
                const isHasil = arg === 'hasil';
                const caption = isHasil ? formatHasil(matches) : formatJadwal(matches);
                try {
                    const imgBuf = isHasil ? await hasilToImage(matches) : await jadwalToImage(matches);
                    await hisoka.sendMessage(m.from, {
                        image: imgBuf,
                        caption,
                        mimetype: 'image/png',
                    }, { quoted: m });
                } catch {
                    await m.reply(caption);
                }
            } catch (err) {
                console.error('[INFOBOLA] Fetch error:', err?.message);
                await tolak(hisoka, m, `❌ *Gagal ambil ${arg}.* Coba lagi nanti.`);
            }
            return;
        }

        /* .infobola klasemen — hapus pesan menu dulu */
        await _deleteMenuMsg(hisoka, m.from);
        await m.reply(`⏳ _Mengambil klasemen..._`);
        try {
            const html = await fetchHtml('https://onefootball.com/id/kompetisi/liga-super-148/klasemen');
            const rows = parseKlasemen(html);
            if (rows.length === 0) throw new Error('Data kosong');
            try {
                const imgBuf = await klasemenToImage(rows);
                await hisoka.sendMessage(m.from, {
                    image: imgBuf,
                    caption: formatKlasemen(rows),
                    mimetype: 'image/png',
                }, { quoted: m });
            } catch {
                await m.reply(formatKlasemen(rows));
            }
        } catch (err) {
            console.error('[INFOBOLA] Fetch error:', err?.message);
            await tolak(hisoka, m, `❌ *Gagal ambil klasemen.* Coba lagi nanti.`);
        }
    } catch (err) {
        console.error('[INFOBOLA] Error:', err?.message);
        await tolak(hisoka, m, `❌ *Gagal ambil info bola.*`);
    }
}

export { handleInfobola, parseKlasemen, formatKlasemen, buildKlasemenSvg, klasemenToImage, parseMatches, formatHasil, formatJadwal, hasilToImage, jadwalToImage };
/**
 * ── Plugin ESM ──
 */
export const command = /^(infobola)$/i;
export const tags = ['info'];
export const help = ['infobola'];
export default handleInfobola;
