/**
 * cmdalias.js — Fuzzy command matching ("Maksudnya...?")
 *
 * Saat user salah ketik command (typo), bot cari command terdaftar yang
 * paling mirip via Levenshtein distance, tampilkan persen kemiripan.
 *
 * Contoh:
 *   .s3r      → .sticker (75%)
 *   .stictjke → .sticker (88%)
 *   .ply      → .play (86%)
 *
 * Aturan:
 *   - Kemiripan >= 70% → otomatis jalankan + tampilkan "Maksudnya .x? (N%)"
 *   - Kemiripan < 70%  → diam (dianggap bukan typo command)
 *   - Hanya untuk command yang TIDAK ketemu exact match
 */
'use strict';

/** Levenshtein distance (edit distance) antara dua string. */
export function levenshtein(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    // Optimasi: pakai 2 baris saja
    let prev = new Array(n + 1), curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        const ca = a.charCodeAt(i - 1);
        for (let j = 1; j <= n; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
}

/** Persen kemiripan 0-100 dari dua string. */
export function similarity(a, b) {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 100;
    const dist = levenshtein(a, b);
    return Math.round(((maxLen - dist) / maxLen) * 100);
}

/**
 * Cari command terdaftar yang paling mirip dengan ketikan user.
 * @param {string} typed - command yang diketik user (tanpa prefix)
 * @param {string[]} candidates - daftar nama command terdaftar
 * @param {number} minScore - threshold persen minimum (default 60)
 * @returns {{name:string, score:number}|null}
 */
export function findClosestCommand(typed, candidates, minScore = 60) {
    typed = String(typed || '').toLowerCase().trim();
    if (!typed || typed.length < 2) return null;

    // ── Rule 1: Prefix match (untuk typo kayak .s3r → .s) ──
    // Jika ketikan diawali command terdaftar + sisa <= 3 char → kemungkinan typo.
    let prefixBest = null, prefixScore = 0;
    for (const name of candidates) {
        const n = String(name || '').toLowerCase().trim();
        if (!n || n === typed) continue;
        if (typed.startsWith(n) && n.length >= 1) {
            const extra = typed.length - n.length;
            if (extra >= 1 && extra <= 3) {
                const score = Math.max(70, 100 - extra * 10);
                if (score > prefixScore) { prefixScore = score; prefixBest = n; }
            }
        }
    }
    if (prefixBest) return { name: prefixBest, score: prefixScore };

    // ── Rule 2: Levenshtein distance ──
    let best = null, bestScore = 0;
    for (const name of candidates) {
        const n = String(name || '').toLowerCase().trim();
        if (!n || n === typed) continue;
        const score = similarity(typed, n);
        if (score > bestScore) {
            bestScore = score;
            best = n;
        }
    }
    if (best && bestScore >= minScore) return { name: best, score: bestScore };
    return null;
}

/**
 * Cari TOP-N command terdaftar yang paling mirip (untuk daftar saran).
 * @param {string} typed - command yang diketik user (tanpa prefix)
 * @param {string[]} candidates - daftar nama command terdaftar
 * @param {number} limit - jumlah maksimal saran (default 3)
 * @param {number} minScore - threshold persen minimum (default 50)
 * @returns {Array<{name:string, score:number}>} urut skor tertinggi dulu
 */
export function findTopMatches(typed, candidates, limit = 3, minScore = 50) {
    typed = String(typed || '').toLowerCase().trim();
    if (!typed || typed.length < 2) return [];

    const scored = [];
    const seen = new Set();

    // Rule 1: prefix match (skor tinggi)
    for (const name of candidates) {
        const n = String(name || '').toLowerCase().trim();
        if (!n || n === typed || seen.has(n)) continue;
        if (typed.startsWith(n) && n.length >= 1) {
            const extra = typed.length - n.length;
            if (extra >= 1 && extra <= 3) {
                scored.push({ name: n, score: Math.max(70, 100 - extra * 10) });
                seen.add(n);
            }
        }
    }

    // Rule 2: levenshtein untuk sisanya
    for (const name of candidates) {
        const n = String(name || '').toLowerCase().trim();
        if (!n || n === typed || seen.has(n)) continue;
        const score = similarity(typed, n);
        if (score >= minScore) {
            scored.push({ name: n, score });
            seen.add(n);
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}
