// Pelacak waktu join & keluar anggota grup buat .cfc — biar kirim langsung nggak perlu isi menit:
// jam pesan otomatis jatuh di jendela saat target belum join (1 menit sebelum join, atau tengah masa absen bila keluar-masuknya sebentar).
// File JSON di data/cfc-join.json (override env CFC_JOIN_PATH); entri lebih tua dari 30 hari dibuang tiap tulis.
import fs from 'node:fs';
import path from 'node:path';

const JOIN_PATH = process.env.CFC_JOIN_PATH || path.join(process.cwd(), 'data', 'cfc-join.json');
const TTL_DETIK = 30 * 24 * 60 * 60;

function kunciJid(jid) {
  return String(jid || '').split(':')[0].split('@')[0].replace(/\D/g, '');
}

function bacaSemua() {
  try {
    const d = JSON.parse(fs.readFileSync(JOIN_PATH, 'utf8'));
    return d && typeof d === 'object' ? d : {};
  } catch { return {}; }
}

function tulisSemua(data) {
  try {
    fs.mkdirSync(path.dirname(JOIN_PATH), { recursive: true });
    fs.writeFileSync(JOIN_PATH, JSON.stringify(data, null, 2));
  } catch (e) { console.log('[cfc-join] gagal simpan:', e?.message || e); }
}

function rapikan(data) {
  const kini = Math.floor(Date.now() / 1000);
  for (const [gg, daftar] of Object.entries(data)) {
    for (const [pp, entri] of Object.entries(daftar)) {
      const terbaru = Math.max(entri?.join || 0, entri?.keluar || 0);
      if (kini - terbaru > TTL_DETIK) delete daftar[pp];
    }
    if (!Object.keys(daftar).length) delete data[gg];
  }
}

// Catat waktu join (Unix detik) tiap peserta yang masuk grup; dipanggil dari handler group-participants.update di index.js.
export function catatJoin(grupJid, pesertaJid, tsDetik = Math.floor(Date.now() / 1000)) {
  const g = kunciJid(grupJid);
  const p = kunciJid(pesertaJid);
  if (!g || !p) return;
  const data = bacaSemua();
  if (!data[g]) data[g] = {};
  data[g][p] = { ...(data[g][p] || {}), join: tsDetik };
  rapikan(data);
  tulisSemua(data);
}

// Catat waktu keluar tiap peserta yang meninggalkan grup; dipakai bareng waktu join buat hitung tengah masa absen.
export function catatKeluar(grupJid, pesertaJid, tsDetik = Math.floor(Date.now() / 1000)) {
  const g = kunciJid(grupJid);
  const p = kunciJid(pesertaJid);
  if (!g || !p) return;
  const data = bacaSemua();
  if (!data[g]) data[g] = {};
  data[g][p] = { ...(data[g][p] || {}), keluar: tsDetik };
  rapikan(data);
  tulisSemua(data);
}

function cariEntri(grupJid, ...kunci) {
  const data = bacaSemua();
  const daftar = data[kunciJid(grupJid)];
  if (!daftar) return null;
  for (const k of kunci) {
    const kk = kunciJid(k);
    if (kk && daftar[kk]) return daftar[kk];
  }
  return null;
}

// Baca waktu join terakhir target di grup ini; coba beberapa kunci (nomor HP, lalu LID) karena event join bisa datang dalam bentuk salah satunya.
export function bacaJoin(grupJid, ...kunci) {
  const entri = cariEntri(grupJid, ...kunci);
  return entri?.join || null;
}

// Baca waktu keluar terakhir target sebelum join terakhirnya.
export function bacaKeluar(grupJid, ...kunci) {
  const entri = cariEntri(grupJid, ...kunci);
  return entri?.keluar || null;
}
