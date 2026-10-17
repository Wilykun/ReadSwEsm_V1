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
    let out = `⚽ *KLASEMEN SUPER LEAGUE*\n_${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}_\n\n`;
    out += `*Pos | Tim | M | Poin*\n`;
    out += `─────────────────\n`;
    for (const r of rows) {
        const arrow = r.chg > 0 ? '🔼' : (r.chg < 0 ? '🔽' : '▪️');
        // Zona degradasi (3 terbawah)
        const zona = r.pos >= 16 ? '🔴' : (r.pos <= 2 ? '🟢' : '');
        out += `${r.pos}. ${r.nama} ${zona}\n`;
        out += `   M:${r.main} | ${r.menang}W ${r.seri}D ${r.kalah}L | SG:${r.sg > 0 ? '+' : ''}${r.sg} | *${r.poin} pts* ${arrow}\n`;
    }
    out += `\n🟢 _Zona AFC_ | 🔴 _Degradasi_`;
    out += `\n_Sumber: OneFootball_`;
    return out;
}

async function handleInfobola({ hisoka, m, query, tolak, logCommand }) {
    try {
        if (typeof logCommand === 'function') logCommand(m, hisoka, 'infobola');

        const arg = String(query || '').trim().toLowerCase();

        /* .infobola langsung tampilkan klasemen (tanpa submenu) */
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

export { handleInfobola, parseKlasemen, formatKlasemen, buildKlasemenSvg, klasemenToImage };
/**
 * ── Plugin ESM ──
 */
export const command = /^(infobola)$/i;
export const tags = ['info'];
export const help = ['infobola'];
export default handleInfobola;
