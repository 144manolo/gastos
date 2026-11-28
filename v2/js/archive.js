/* archive.js — datos unificados · Contabilidad MFB v2
 *
 *  - `transactions` (original) = lo "vivo": se guarda en el móvil y se sincroniza con el Gist.
 *  - `archiveTx` = histórico congelado (hasta 10/11/2026): vive solo en este navegador
 *    (IndexedDB), nunca se sube a ningún sitio y no hace falta tenerlo en un repositorio.
 *  - Lo que ves en pantalla (`getAllTransactions`) = vivo + archivo anterior a LIVE_START,
 *    sin repetir ids y sin movimientos borrados (lápidas en `deletedIds`).
 *    Desde LIVE_START manda siempre lo vivo, así un movimiento borrado no "revive". */

const LIVE_START = '2025-01-01';
const ARCHIVE_UNTIL = '2026-11-10';
const IDB_NAME = 'mfb', IDB_STORE = 'kv';

let archiveTx = [];
let deletedIds = [];
let _allCache = null;

function invalidateAll() { _allCache = null; }

// ---------- Lápidas (borrados) ----------
function loadDeleted() {
  try { deletedIds = JSON.parse(localStorage.getItem('nexus_deleted_ids') || '[]'); if (!Array.isArray(deletedIds)) deletedIds = []; }
  catch (e) { deletedIds = []; }
}
function setDeleted(arr) {
  deletedIds = arr;
  try { localStorage.setItem('nexus_deleted_ids', JSON.stringify(arr)); } catch (e) {}
  invalidateAll();
}
function addTombstone(id) {
  if (!deletedIds.some(x => String(x) === String(id))) setDeleted(deletedIds.concat([id]));
}

// ---------- Vista unificada ----------
function getAllTransactions() {
  if (_allCache) return _allCache;
  const liveIds = new Set(transactions.map(t => String(t.id)));
  const del = new Set(deletedIds.map(String));
  const noLive = transactions.length === 0; // equipo nuevo sin nube todavía: se ve todo el archivo
  const extra = archiveTx.filter(t =>
    !liveIds.has(String(t.id)) && !del.has(String(t.id)) && (noLive || t.date < LIVE_START));
  _allCache = transactions.concat(extra);
  return _allCache;
}
function findTransaction(id) {
  return transactions.find(x => x.id === id) || archiveTx.find(x => x.id === id) || null;
}
// Movimientos del archivo (2025 en adelante) que no están en lo vivo: posibles huecos de la nube
function archiveOnlyRecent() {
  const liveIds = new Set(transactions.map(t => String(t.id)));
  const del = new Set(deletedIds.map(String));
  return archiveTx.filter(t => t.date >= LIVE_START && !liveIds.has(String(t.id)) && !del.has(String(t.id)));
}

// ---------- IndexedDB ----------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(k) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(k);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function idbSet(k, v) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(v, k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(k) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(k);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadArchive() {
  try { const d = await idbGet('archive'); archiveTx = Array.isArray(d) ? d : []; }
  catch (e) { archiveTx = []; }
  invalidateAll();
}

function archiveMeta() {
  try { return JSON.parse(localStorage.getItem('mfb_archive_meta') || 'null'); } catch (e) { return null; }
}

// Acepta un array de movimientos o un objeto { transactions: [...] }
async function importArchive(data) {
  const arr = Array.isArray(data) ? data : (data && data.transactions);
  if (!Array.isArray(arr)) throw new Error('El archivo no tiene movimientos');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let ignored = 0;
  const valid = [];
  for (const t of arr) {
    const ok = t && t.id != null && re.test(t.date || '') && isFinite(Number(t.amount)) &&
      (t.type === 'income' || t.type === 'expense') && t.date <= ARCHIVE_UNTIL;
    if (ok) valid.push({ id: t.id, type: t.type, amount: Number(t.amount), description: String(t.description || ''),
      category: String(t.category || ''), subcategory: t.subcategory || '', date: t.date,
      imageUrl: t.imageUrl || null, attachment: t.attachment || null });
    else ignored++;
  }
  if (!valid.length) throw new Error('No hay movimientos válidos en el archivo');
  await idbSet('archive', valid);
  archiveTx = valid;
  invalidateAll();
  const dates = valid.map(t => t.date).sort();
  const meta = { count: valid.length, from: dates[0], to: dates[dates.length - 1], importedAt: new Date().toISOString(), ignored };
  try { localStorage.setItem('mfb_archive_meta', JSON.stringify(meta)); } catch (e) {}
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  return meta;
}

async function removeArchive() {
  await idbDel('archive');
  archiveTx = [];
  try { localStorage.removeItem('mfb_archive_meta'); } catch (e) {}
  invalidateAll();
}

// ---------- Fusión con la nube (read-modify-write) ----------
async function cloudFileContent(file) {
  if (!file) return null;
  if (file.truncated && file.raw_url) {
    const r = await fetch(file.raw_url);
    if (!r.ok) throw new Error('No se pudo leer el archivo completo de la nube');
    return await r.text();
  }
  return file.content;
}

// Borra sin preguntar (lo usan las pantallas de revisión); deja lápida
function deleteTransactionQuiet(id) {
  transactions = transactions.filter(t => t.id !== id);
  addTombstone(id);
}
// Copia al conjunto vivo movimientos del archivo (para editarlos o recuperarlos)
function promoteToLive(items) {
  const now = Date.now();
  items.forEach((t, i) => {
    if (!transactions.some(x => x.id === t.id)) transactions.unshift({ ...t, updatedAt: now + i });
  });
  invalidateAll();
}

// ---------- Arranque ----------
loadDeleted();
loadArchive().then(() => {
  if (archiveTx.length && document.readyState !== 'loading' && typeof updateUI === 'function') updateUI();
});

// Si un movimiento solo está en el archivo, lo pasa a lo vivo (para poder editarlo)
function ensureLive(id) {
  if (transactions.some(t => t.id === id)) return;
  const a = archiveTx.find(t => t.id === id);
  if (a) promoteToLive([a]);
}
