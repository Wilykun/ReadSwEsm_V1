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
 *  ping.js — .ping via speedtest.net realtime
 * ───────────────────────────────
 */
'use strict';

import sharp from 'sharp';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
//  KONSTANTA
// ─────────────────────────────────────────────────────────────────────────────

const ST_SERVERS_URL = 'https://www.speedtest.net/api/js/servers?engine=js&https_functional=true&limit=5';

const ST_HDR = {
        'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept'         : 'application/json, text/plain, */*',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
        'Referer'        : 'https://www.speedtest.net/',
        'Origin'         : 'https://www.speedtest.net',
};

// ─────────────────────────────────────────────────────────────────────────────
//  ENGINE SPEEDTEST.NET
// ─────────────────────────────────────────────────────────────────────────────

function stBase(url) {
        return url.replace(/\/upload\.php$/i, '/');
}

async function stGetServers() {
        const { data } = await axios.get(ST_SERVERS_URL, { headers: ST_HDR, timeout: 10000 });
        if (!Array.isArray(data) || !data.length) throw new Error('Daftar server speedtest.net kosong');
        return data;
}

async function stPingServer(baseUrl, tries = 3) {
        const times = [];
        for (let i = 0; i < tries; i++) {
                const t0 = Date.now();
                try {
                        await axios.get(`${baseUrl}latency.txt`, {
                                headers: ST_HDR, timeout: 5000, validateStatus: () => true,
                        });
                        times.push(Date.now() - t0);
                } catch (_) {}
                if (i < tries - 1) await new Promise(r => setTimeout(r, 150));
        }
        if (!times.length) return null;
        times.sort((a, b) => a - b);
        return {
                min   : times[0],
                avg   : Math.round(times.reduce((s, v) => s + v, 0) / times.length),
                max   : times[times.length - 1],
                jitter: times[times.length - 1] - times[0],
        };
}

async function stPickBest(servers) {
        let best = null, bestAvg = Infinity;
        for (const srv of servers) {
                const base = stBase(srv.url);
                const pg   = await stPingServer(base, 3);
                if (pg && pg.avg < bestAvg) {
                        bestAvg = pg.avg;
                        best    = { ...srv, _base: base, _ping: pg };
                }
        }
        return best;
}

async function stDownload(baseUrl) {
        const sizes = [1500, 2000, 2500];
        let totalBit = 0, totalMs = 0;
        for (const sz of sizes) {
                try {
                        const t0   = Date.now();
                        const resp = await axios.get(
                                `${baseUrl}random${sz}x${sz}.jpg?x=${Date.now()}-0`,
                                { headers: ST_HDR, timeout: 20000, responseType: 'arraybuffer' }
                        );
                        const ms    = Date.now() - t0;
                        const bytes = resp.data.byteLength || 0;
                        if (bytes > 0 && ms > 0) { totalBit += bytes * 8; totalMs += ms; }
                } catch (_) { break; }
        }
        if (!totalMs) return null;
        return (totalBit / (totalMs / 1000)) / 1_000_000;
}

async function stUpload(uploadUrl) {
        const uploadSizes = [1_000_000, 2_000_000];
        let totalBit = 0, totalMs = 0;
        for (const bytes of uploadSizes) {
                try {
                        const data = Buffer.alloc(bytes, 0x41);
                        const t0   = Date.now();
                        await axios.post(uploadUrl, data, {
                                headers: {
                                        ...ST_HDR,
                                        'Content-Type'  : 'application/octet-stream',
                                        'Content-Length': bytes,
                                },
                                timeout: 25000, maxBodyLength: Infinity, validateStatus: () => true,
                        });
                        const ms = Date.now() - t0;
                        if (ms > 0) { totalBit += bytes * 8; totalMs += ms; }
                } catch (_) { break; }
        }
        if (!totalMs) return null;
        return (totalBit / (totalMs / 1000)) / 1_000_000;
}

async function stGetIsp() {
        try {
                const { data } = await axios.get('https://ipinfo.io/json', {
                        headers: { ...ST_HDR, Accept: 'application/json' }, timeout: 6000,
                });
                return {
                        ip    : data?.ip     || '-',
                        isp   : (data?.org   || '-').replace(/^AS\d+\s*/i, '').trim().slice(0, 30),
                        kota  : data?.city   || '-',
                        negara: data?.country || '-',
                };
        } catch (_) {
                return { ip: '-', isp: '-', kota: '-', negara: '-' };
        }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER FORMAT
// ─────────────────────────────────────────────────────────────────────────────

// Escape karakter XML agar SVG tidak gagal parse saat ISP/server mengandung & < > " '
function xe(str) {
        if (!str) return '-';
        return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
}

function fmtNum(v) {
        if (v === null || v === undefined) return { num: 'N/A', unit: '' };
        if (v >= 1000) return { num: (v / 1000).toFixed(2), unit: 'Gbps' };
        return { num: v.toFixed(2), unit: 'Mbps' };
}

// warna lingkaran ping persis speedtest.net: hijau < 20, kuning 20-50, oranye 50-100, merah >= 100
function pingClr(ms) {
        if (ms == null) return '#6b7280';
        if (ms < 20)   return '#4ade80';   // hijau
        if (ms < 50)   return '#facc15';   // kuning
        if (ms < 100)  return '#fb923c';   // oranye
        return '#f87171';                  // merah
}

// ─────────────────────────────────────────────────────────────────────────────
//  GRADE — nilai kualitas koneksi berdasarkan download & ping
// ─────────────────────────────────────────────────────────────────────────────

function speedGrade(dl, pingIdle) {
        if (dl == null) return { grade: '-', label: 'Tidak Diketahui', color: '#6b7280', desc: 'Pengukuran gagal.' };
        const score = (dl >= 100 ? 50 : dl >= 50 ? 40 : dl >= 20 ? 30 : dl >= 10 ? 20 : 10)
                    + (pingIdle == null ? 15 : pingIdle < 20 ? 50 : pingIdle < 50 ? 40 : pingIdle < 100 ? 25 : 10);
        if (score >= 90) return { grade: 'A+', label: 'Luar Biasa', color: '#4ade80', desc: 'Siap untuk 4K streaming, cloud gaming & live.' };
        if (score >= 75) return { grade: 'A',  label: 'Sangat Baik', color: '#a3e635', desc: 'Lancar untuk HD streaming, video call & game.' };
        if (score >= 55) return { grade: 'B',  label: 'Baik',        color: '#facc15', desc: 'Cukup untuk streaming HD & browsing cepat.' };
        if (score >= 35) return { grade: 'C',  label: 'Cukup',       color: '#fb923c', desc: 'Bisa untuk SD streaming & chat, gaming kurang.' };
        return                         { grade: 'D',  label: 'Lambat',      color: '#f87171', desc: 'Hanya cukup untuk chat & browsing ringan.' };
}

// Arc gauge untuk speedometer: dari -120° ke +120°
function gaugeArc(cx, cy, r, frac, color, bg = '#1e293b', w = 14) {
        const a0 = -210, a1 = 30; // derajat
        const rad = d => (d * Math.PI) / 180;
        const px = a => cx + r * Math.cos(rad(a));
        const py = a => cy + r * Math.sin(rad(a));
        const bgArc = `M ${px(a0)} ${py(a0)} A ${r} ${r} 0 1 1 ${px(a1)} ${py(a1)}`;
        const ae = a0 + (a1 - a0) * Math.max(0, Math.min(1, frac));
        const fgArc = frac > 0.01
                ? `M ${px(a0)} ${py(a0)} A ${r} ${r} 0 ${ae - a0 > 180 ? 1 : 0} 1 ${px(ae)} ${py(ae)}`
                : '';
        return `<path d="${bgArc}" fill="none" stroke="${bg}" stroke-width="${w}" stroke-linecap="round"/>`
             + (fgArc ? `<path d="${fgArc}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>` : '');
}

function buildSvg({ dl, ul, pingIdle, pingDl, pingUl, srv, isp, durasi }) {
        const dlF = fmtNum(dl);
        const ulF = fmtNum(ul);
        const gr  = speedGrade(dl, pingIdle);

        const DL_CLR  = '#00c8ff';
        const UL_CLR  = '#be52f2';
        const NUM_CLR = '#f8fafc';

        const piC = pingClr(pingIdle);
        const pdC = pingClr(pingDl);
        const puC = pingClr(pingUl);

        const ispName    = xe((isp.isp    || '-').slice(0, 24));
        const kotaName   = xe((isp.kota   || '-').slice(0, 20));
        const negaraName = xe((isp.negara || '-').slice(0, 10));
        const srvSponsor = xe((srv?.sponsor || 'speedtest.net').slice(0, 24));
        const srvCity    = xe((srv?.name    || '-').slice(0, 20));
        const waktu      = xe(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));
        const gradeDesc  = xe(gr.desc);

        // Fraksi gauge: skala logaritmik 0–1000 Mbps
        const dlFrac = dl ? Math.min(1, Math.log10(Math.max(dl, 1)) / 3) : 0;
        const ulFrac = ul ? Math.min(1, Math.log10(Math.max(ul, 1)) / 3) : 0;

        return `<svg width="720" height="660" xmlns="http://www.w3.org/2000/svg"
  font-family="'Helvetica Neue',Helvetica,Arial,sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#0a0f1a"/>
      <stop offset="100%" stop-color="#141b2e"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#1a2740"/>
      <stop offset="100%" stop-color="#121c30"/>
    </linearGradient>
    <linearGradient id="gaugeDL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0090ff"/>
      <stop offset="100%" stop-color="#00e5ff"/>
    </linearGradient>
    <radialGradient id="glowDL" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="${DL_CLR}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${DL_CLR}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.45"/></filter>
  </defs>

  <rect width="720" height="660" fill="url(#bg)"/>

  <!-- ══ TOP BAR ══ -->
  <rect x="0" y="0" width="720" height="52" fill="#07070e"/>
  <circle cx="28" cy="26" r="17" fill="#07070e" stroke="${DL_CLR}" stroke-width="1.5"/>
  <text x="28" y="22" text-anchor="middle" font-size="9" fill="${DL_CLR}" font-weight="800">ST</text>
  <text x="28" y="33" text-anchor="middle" font-size="8" fill="${DL_CLR}">NET</text>
  <text x="54" y="20" font-size="9"  fill="#475569" font-weight="500" letter-spacing="2">SPEEDTEST</text>
  <text x="54" y="37" font-size="15" fill="#f1f5f9" font-weight="700">by Ookla</text>
  <text x="700" y="20" text-anchor="end" font-size="9"  fill="#334155">HASIL TEST</text>
  <text x="700" y="37" text-anchor="end" font-size="10" fill="${DL_CLR}" font-weight="600">${waktu} WIB</text>

  <!-- ══ HERO: SPEEDOMETER DOWNLOAD ══ -->
  <rect x="18" y="62" width="684" height="252" rx="16" fill="url(#card)" stroke="#243448" stroke-width="1.5" filter="url(#soft)"/>
  <ellipse cx="270" cy="190" rx="230" ry="110" fill="url(#glowDL)"/>

  <!-- Gauge arc -->
  ${gaugeArc(270, 205, 105, dlFrac, 'url(#gaugeDL)')}
  <!-- Tick marks -->
  ${[0, 1, 10, 100, 1000].map((v, i) => {
      const a = (-210 + (240 * i) / 4) * Math.PI / 180;
      const x1 = 270 + 88 * Math.cos(a), y1 = 205 + 88 * Math.sin(a);
      const x2 = 270 + 96 * Math.cos(a), y2 = 205 + 96 * Math.sin(a);
      const lx = 270 + 76 * Math.cos(a), ly = 205 + 76 * Math.sin(a);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#3b4f6b" stroke-width="2"/>`
           + `<text x="${lx.toFixed(1)}" y="${(ly + 3).toFixed(1)}" text-anchor="middle" font-size="8" fill="#4b617f">${v >= 1000 ? '1G' : v}</text>`;
  }).join('')}

  <!-- Angka download -->
  <text x="270" y="200" text-anchor="middle" font-size="64" fill="${NUM_CLR}" font-weight="800">${dlF.num}</text>
  <text x="270" y="224" text-anchor="middle" font-size="13" fill="#64748b" letter-spacing="2">${dlF.unit} — DOWNLOAD</text>

  <!-- Grade badge kanan -->
  <rect x="520" y="92" width="150" height="150" rx="14" fill="#0b1322" stroke="${gr.color}" stroke-width="2"/>
  <text x="595" y="112" text-anchor="middle" font-size="9" fill="#4b617f" letter-spacing="2">SKOR</text>
  <text x="595" y="168" text-anchor="middle" font-size="52" fill="${gr.color}" font-weight="800">${gr.grade}</text>
  <text x="595" y="192" text-anchor="middle" font-size="11" fill="${gr.color}" font-weight="600">${xe(gr.label)}</text>
  <text x="595" y="222" text-anchor="middle" font-size="8" fill="#4b617f">kualitas koneksi</text>

  <!-- Upload mini kanan-bawah hero -->
  <text x="520" y="262" font-size="10" fill="${UL_CLR}" font-weight="700" letter-spacing="1.5">↑ UPLOAD</text>
  <text x="670" y="290" text-anchor="end" font-size="26" fill="${NUM_CLR}" font-weight="700">${ulF.num} <tspan font-size="11" fill="#64748b">${ulF.unit}</tspan></text>
  <rect x="520" y="298" width="150" height="6" rx="3" fill="#1e293b"/>
  <rect x="520" y="298" width="${Math.max(4, 150 * ulFrac).toFixed(1)}" height="6" rx="3" fill="${UL_CLR}"/>

  <!-- ══ PING ROW ══ -->
  <rect x="18" y="324" width="684" height="118" rx="14" fill="url(#card)" stroke="#243448" stroke-width="1"/>
  <text x="38" y="348" font-size="10" fill="#475569" font-weight="700" letter-spacing="1.5">PING</text>
  <text x="38" y="363" font-size="9" fill="#2d4060">milidetik · ms</text>
  ${[
      { x: 200, v: pingIdle, c: piC, l: 'IDLE' },
      { x: 360, v: pingDl,   c: pdC, l: 'SAAT UNDUH' },
      { x: 520, v: pingUl,   c: puC, l: 'SAAT UNGGAH' },
  ].map(p => `
  <circle cx="${p.x}" cy="372" r="27" fill="#09111e" stroke="${p.c}" stroke-width="2.5"/>
  <text x="${p.x}" y="380" text-anchor="middle" font-size="16" fill="${p.c}" font-weight="700">${p.v ?? '-'}</text>
  <text x="${p.x}" y="414" text-anchor="middle" font-size="9" fill="#3d5068" letter-spacing="1">${p.l}</text>`).join('')}

  <!-- ══ VERDICT ══ -->
  <rect x="18" y="452" width="684" height="56" rx="10" fill="#0b1322" stroke="${gr.color}" stroke-width="1" stroke-opacity="0.5"/>
  <circle cx="52" cy="480" r="14" fill="${gr.color}" fill-opacity="0.15"/>
  <text x="52" y="486" text-anchor="middle" font-size="14" fill="${gr.color}" font-weight="800">${gr.grade}</text>
  <text x="76" y="474" font-size="12" fill="#e2e8f0" font-weight="700">${xe(gr.label)}</text>
  <text x="76" y="493" font-size="10" fill="#7d90aa">${gradeDesc}</text>

  <!-- ══ INFO BAR ══ -->
  <rect x="18" y="518" width="684" height="66" rx="10" fill="#0c1520" stroke="#1c2b3e" stroke-width="1"/>
  <text x="36" y="542" font-size="8" fill="#3d5068" letter-spacing="1.5">ISP</text>
  <text x="36" y="561" font-size="12" fill="#e2e8f0" font-weight="600">${ispName}</text>
  <text x="36" y="576" font-size="9" fill="#3d5068">${kotaName}</text>
  <line x1="240" y1="526" x2="240" y2="576" stroke="#1c2b3e" stroke-width="1"/>
  <text x="256" y="542" font-size="8" fill="#3d5068" letter-spacing="1.5">SERVER</text>
  <text x="256" y="561" font-size="12" fill="#e2e8f0" font-weight="600">${srvSponsor}</text>
  <text x="256" y="576" font-size="9" fill="#3d5068">${srvCity}</text>
  <line x1="480" y1="526" x2="480" y2="576" stroke="#1c2b3e" stroke-width="1"/>
  <text x="496" y="542" font-size="8" fill="#3d5068" letter-spacing="1.5">NEGARA · IP</text>
  <text x="496" y="561" font-size="12" fill="#e2e8f0" font-weight="600">${negaraName}</text>
  <text x="496" y="576" font-size="9" fill="#3d5068">${xe(isp.ip || '-')}</text>

  <!-- ══ FOOTER ══ -->
  <rect x="0" y="594" width="720" height="66" fill="#060810"/>
  <line x1="0" y1="594" x2="720" y2="594" stroke="#172030" stroke-width="1"/>
  <text x="36" y="616" font-size="8" fill="#243448" letter-spacing="1.5">DURASI TEST</text>
  <text x="36" y="636" font-size="14" fill="#475569" font-weight="600">${durasi}s</text>
  <text x="360" y="620" text-anchor="middle" font-size="10" fill="#1e3050">speedtest.net · WILY BOT</text>
  <text x="360" y="638" text-anchor="middle" font-size="9" fill="#172540">${waktu} WIB</text>
  <text x="684" y="616" text-anchor="end" font-size="8" fill="#243448" letter-spacing="1.5">POWERED BY</text>
  <text x="684" y="636" text-anchor="end" font-size="15" fill="${DL_CLR}" font-weight="700">Ookla</text>
</svg>`;
}

// PNG penuh (dikirim sebagai gambar utama)
async function buatGambar(data) {

        return sharp(Buffer.from(buildSvg(data))).png().toBuffer();
}

// ─────────────────────────────────────────────────────────────────────────────
//  CAPTION WhatsApp — format lengkap (bold/italic/coret/mono/list/poin/kutip)
// ─────────────────────────────────────────────────────────────────────────────

function labelKecepatan(mbps) {
        if (!mbps) return { e: '❌', t: 'Gagal' };
        if (mbps >= 1000) return { e: '🚀', t: 'Luar Biasa' };
        if (mbps >= 100)  return { e: '⚡', t: 'Sangat Cepat' };
        if (mbps >= 50)   return { e: '✅', t: 'Cepat' };
        if (mbps >= 20)   return { e: '🟡', t: 'Normal' };
        if (mbps >= 5)    return { e: '🟠', t: 'Lumayan' };
        return                    { e: '🐢', t: 'Lambat' };
}

function labelWaLatency(ms) {
        if (ms == null)  return { e: '❓', t: 'Tidak Diketahui' };
        if (ms < 100)    return { e: '🚀', t: 'Sangat Cepat' };
        if (ms < 500)    return { e: '⚡', t: 'Normal' };
        if (ms < 2000)   return { e: '🟡', t: 'Agak Lambat' };
        return                   { e: '🐢', t: 'Lambat' };
}

function fmtDurasi(ms) {
        const totalSec = Math.floor(ms / 1000);
        const d   = Math.floor(totalSec / 86400);
        const h   = Math.floor((totalSec % 86400) / 3600);
        const mnt = Math.floor((totalSec % 3600) / 60);
        return `${d}d ${h}h ${mnt}m`;
}

function buildCaption({ dl, ul, pingIdle, pingDl, pingUl, srv, isp, durasi, waLatency, uptimeStr, sessionStr, restartCount }) {
        const SEP  = '━━━━━━━━━━━━━━━━━━━━';
        const SEP2 = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

        const dlF   = fmtNum(dl);
        const ulF   = fmtNum(ul);
        const dlLbl = labelKecepatan(dl);
        const ulLbl = labelKecepatan(ul);
        const waLbl = labelWaLatency(waLatency);
        const gr    = speedGrade(dl, pingIdle);

        const dlTxt = dl
                ? `*${dlF.num} ${dlF.unit}* — ${dlLbl.e} _${dlLbl.t}_`
                : '~Gagal diukur~';
        const ulTxt = ul
                ? `*${ulF.num} ${ulF.unit}* — ${ulLbl.e} _${ulLbl.t}_`
                : '~Gagal diukur~';

        const pgI = pingIdle != null ? `\`${pingIdle} ms\`` : '`-`';
        const pgD = pingDl   != null ? `\`${pingDl} ms\``   : '`-`';
        const pgU = pingUl   != null ? `\`${pingUl} ms\``   : '`-`';

        const srvLine  = srv ? `_${srv.sponsor} — ${srv.name}, ${srv.country}_` : '_-_';
        const kotaLine = `_${isp.kota || '-'}, ${isp.negara || '-'}_`;
        const ispLine  = `_${isp.isp  || '-'}_`;
        const waMs     = waLatency != null ? `\`${waLatency} ms\`` : '`-`';
        const waktu    = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        return (
                `🌐 *SPEEDTEST.NET — REALTIME*\n` +
                `${SEP}\n\n` +

                `🏆 *Skor: ${gr.grade}* — _${gr.label}_\n` +
                `> _${gr.desc}_\n\n` +

                `*📊 Hasil Kecepatan*\n\n` +
                `1. 📥 *Download*\n` +
                `   • Kecepatan : ${dlTxt}\n\n` +
                `2. 📤 *Upload*\n` +
                `   • Kecepatan : ${ulTxt}\n\n` +
                `3. 🏓 *Ping (ms)*\n` +
                `   • ⚫ Idle     : ${pgI}\n` +
                `   • ↓ Unduh   : ${pgD}\n` +
                `   • ↑ Unggah  : ${pgU}\n\n` +

                `${SEP}\n` +

                `*📋 Info Koneksi*\n` +
                `${SEP2}\n` +
                `• 🔗 Koneksi : Multi\n` +
                `• 🏢 ISP     : ${ispLine}\n` +
                `• 📍 Lokasi  : ${kotaLine}\n` +
                `• 🌍 Server  : ${srvLine}\n` +
                `• 🌍 Negara  : _${isp.negara || '-'}_\n\n` +

                `> ℹ️ Ini kecepatan *server bot*, ~bukan koneksi internet kamu~ — wajar berbeda dari speedtest.net di browser\n\n` +

                `${SEP}\n` +

                `*⚡ Respons Bot ke WA*\n` +
                `${SEP2}\n` +
                `• Latensi : ${waMs} — ${waLbl.e} _${waLbl.t}_\n\n` +

                `${SEP}\n` +
                `*📊 Status Bot*\n` +
                `${SEP2}\n` +
                `│ ⏱️ Uptime  » ${uptimeStr}\n` +
                `│ 🔁 Restart » ${restartCount ?? 0}x\n` +
                `│ 🔄 Session  » ${sessionStr}\n\n` +

                `${SEP}\n` +
                `⏱️ _Selesai dalam ${durasi}s · ${waktu} WIB_`
        );
}

// ─────────────────────────────────────────────────────────────────────────────
//  HANDLER: .ping  (speedtest.net realtime)
// ─────────────────────────────────────────────────────────────────────────────

async function handlePing({ hisoka, m, tolak, logCommand, getBotStats, os }) {
        let statusMsg;
        try {
                // Ukur WA latency sebelum apapun
                const waLatency = Math.abs(Date.now() - m.messageTimestamp * 1000);

                statusMsg = await m.reply('🌐 _Menghubungi speedtest.net..._');
                const t0 = Date.now();

                // 1. ISP info + server list (paralel)
                const [ispInfo, servers] = await Promise.all([stGetIsp(), stGetServers()]);

                await hisoka.sendMessage(m.from, {
                        edit: statusMsg.key, text: '🔍 _Memilih server terbaik..._',
                });

                // 2. Pilih server terbaik
                const srv = await stPickBest(servers);
                if (!srv) throw new Error('Tidak ada server speedtest.net yang bisa dihubungi');

                const pingIdle = srv._ping?.min ?? null;
                const pingDl   = srv._ping?.avg ?? null;
                const pingUl   = srv._ping?.max ?? null;

                await hisoka.sendMessage(m.from, {
                        edit: statusMsg.key,
                        text: `⚡ _Server: ${srv.sponsor} (${srv.name})_\n📥 _Mengukur download..._`,
                });

                // 3. Download
                const dlMbps = await stDownload(srv._base);

                await hisoka.sendMessage(m.from, {
                        edit: statusMsg.key,
                        text: `📥 ${dlMbps ? dlMbps.toFixed(2) + ' Mbps' : 'Gagal'}\n📤 _Mengukur upload..._`,
                });

                // 4. Upload
                const ulMbps = await stUpload(srv.url);

                const durasi = ((Date.now() - t0) / 1000).toFixed(1);

                const stats        = typeof getBotStats === 'function' ? getBotStats() : null;
                const uptimeStr    = fmtDurasi(stats?.currentUptime || 0);
                const sessionStr   = fmtDurasi(process.uptime() * 1000);
                const restartCount = stats?.totalRestarts ?? 0;

                const hasil  = {
                        dl: dlMbps, ul: ulMbps, pingIdle, pingDl, pingUl, srv, isp: ispInfo, durasi, waLatency,
                        uptimeStr, sessionStr, restartCount,
                };

                // 5. Render gambar PNG + caption paralel
                const [imgBuf, caption] = await Promise.all([
                        buatGambar(hasil),
                        Promise.resolve(buildCaption(hasil)),
                ]);

                // 6. Hapus pesan status
                await hisoka.sendMessage(m.from, { delete: statusMsg.key });

                // 7. Kirim gambar PNG + caption
                await hisoka.sendMessage(m.from, {
                        image   : imgBuf,
                        mimetype: 'image/png',
                        caption,
                }, { quoted: m });

                logCommand(m, hisoka, 'ping');

        } catch (err) {
                console.error('\x1b[31m[ping/speedtest] Error:\x1b[39m', err.message);
                const errMsg = `❌ *Ping/Speedtest gagal*\n\`${err.message}\``;
                if (statusMsg?.key) {
                        await hisoka.sendMessage(m.from, { edit: statusMsg.key, text: errMsg });
                } else {
                        await m.reply(errMsg);
                }
        }
}

export { handlePing };
/**
 * ── Plugin ESM (auto-migrasi dari switch-case message.js) ──
 */
export const command = /^(ping|p)$/i;
export const tags = ['info'];
export const help = ['ping'];
export default handlePing;
