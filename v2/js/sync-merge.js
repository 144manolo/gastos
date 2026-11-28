/* sync-merge.js — fusión de movimientos entre el móvil y la nube · Contabilidad MFB v2
 * Código puro (sin DOM): se usa en la app y se prueba en Node.
 *
 * Reglas (por movimiento, no por archivo entero):
 *  - Un movimiento borrado en cualquier sitio (lápida) no vuelve a aparecer.
 *  - Si está en los dos lados, gana el que tenga `updatedAt` más reciente (empate: la nube).
 *  - Si solo está en el móvil se conserva (es nuevo y aún no se ha subido).
 *  - Si solo está en la nube se añade al móvil.
 * Compatibilidad: los movimientos antiguos no tienen `updatedAt` (cuentan como 0) y la app
 * antigua ignora los campos nuevos (`updatedAt`, `deletedIds`). */
(function (root) {
  'use strict';

  function stamp(t) { return t && typeof t.updatedAt === 'number' ? t.updatedAt : 0; }
  function key(id) { return String(id); }

  function mergeTransactions(local, remote, localDeleted, remoteDeleted) {
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var deleted = new Set();
    var deletedList = [];
    [].concat(localDeleted || [], remoteDeleted || []).forEach(function (id) {
      if (!deleted.has(key(id))) { deleted.add(key(id)); deletedList.push(id); }
    });

    var lmap = new Map(), rmap = new Map(), noId = [];
    local.forEach(function (t) { if (t && t.id != null) lmap.set(key(t.id), t); else if (t) noId.push(t); });
    remote.forEach(function (t) { if (t && t.id != null) rmap.set(key(t.id), t); });

    var out = [], localAhead = false, changed = false;
    var ids = new Set();
    rmap.forEach(function (_, k) { ids.add(k); });
    lmap.forEach(function (_, k) { ids.add(k); });

    ids.forEach(function (k) {
      var l = lmap.get(k), r = rmap.get(k);
      if (deleted.has(k)) {
        if (l) changed = true;        // el móvil perdía un movimiento borrado en otro sitio
        if (r) localAhead = true;     // la nube aún lo tiene: hay que subir la lápida
        return;
      }
      if (l && r) {
        if (stamp(l) > stamp(r)) { out.push(l); localAhead = true; }
        else { out.push(r); if (JSON.stringify(l) !== JSON.stringify(r)) changed = true; }
      } else if (l) { out.push(l); localAhead = true; }
      else { out.push(r); changed = true; }
    });

    out.sort(function (a, b) { return (Number(b.id) || 0) - (Number(a.id) || 0); });
    return { merged: noId.concat(out), deleted: deletedList, localAhead: localAhead || noId.length > 0, changed: changed };
  }

  var api = { mergeTransactions: mergeTransactions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SyncMerge = api;
})(typeof window !== 'undefined' ? window : globalThis);
