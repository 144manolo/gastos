/* data-check.js — revisión de datos · Contabilidad MFB v2
 * Código puro (sin DOM). Detecta importes raros, duplicados, subcategorías que no están
 * en la lista y movimientos de prueba. También sirve para avisar de un posible duplicado
 * al guardar un movimiento nuevo. */
(function (root) {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' '); }
  function cents(n) { return Math.round(Number(n) * 100); }

  // Misma fecha, tipo, importe, categoría, subcategoría y descripción
  function duplicateKey(t) {
    return [t.date, t.type, cents(t.amount), norm(t.category), norm(t.subcategory || t.category), norm(t.description)].join('|');
  }

  // Para avisar al guardar: mismo día, tipo, importe, categoría y subcategoría
  function similarTo(nt, txs) {
    var sub = norm(nt.subcategory || nt.category);
    for (var i = 0; i < txs.length; i++) {
      var t = txs[i];
      if (t.date === nt.date && t.type === nt.type && cents(t.amount) === cents(nt.amount) &&
          norm(t.category) === norm(nt.category) && norm(t.subcategory || t.category) === sub) return t;
    }
    return null;
  }

  function hasSub(list, sub) {
    var s = norm(sub);
    for (var i = 0; i < list.length; i++) if (norm(list[i]) === s) return true;
    return false;
  }

  function findIssues(txs, categories) {
    categories = categories || {};
    var zeros = [], negatives = [], tests = [], noSub = [];
    var seen = {}, dupGroups = [];
    var unknown = {}; // "tipo|categoría|sub" -> { type, category, sub, items: [] }

    txs.forEach(function (t) {
      var a = Number(t.amount);
      if (!isFinite(a) || a === 0) zeros.push(t);
      else if (a < 0) negatives.push(t);
      if (/^\s*(prueba|test)\b/i.test(t.description || '')) tests.push(t);

      var table = categories[t.type] || {};
      var catKey = Object.keys(table).filter(function (c) { return norm(c) === norm(t.category); })[0];
      var subs = catKey ? table[catKey] : null;
      var sub = t.subcategory;

      if (!sub || (norm(sub) === norm(t.category) && subs && subs.length && !hasSub(subs, sub))) {
        if (subs && subs.length) noSub.push(t);
      } else if (!subs || !hasSub(subs, sub)) {
        var k = t.type + '|' + t.category + '|' + sub;
        (unknown[k] || (unknown[k] = { type: t.type, category: t.category, sub: sub, categoryMissing: !subs, items: [] })).items.push(t);
      }

      var dk = duplicateKey(t);
      if (seen[dk]) { if (seen[dk].length === 1) dupGroups.push(seen[dk]); seen[dk].push(t); }
      else seen[dk] = [t];
    });

    var unknownSubs = Object.keys(unknown).map(function (k) { return unknown[k]; })
      .sort(function (a, b) { return b.items.length - a.items.length; });

    return {
      zeros: zeros, negatives: negatives, tests: tests, noSub: noSub,
      duplicates: dupGroups,                       // cada grupo: [original, copia, copia…]
      unknownSubs: unknownSubs,                    // agrupadas por categoría → subcategoría
      counts: {
        zeros: zeros.length, negatives: negatives.length, tests: tests.length, noSub: noSub.length,
        duplicateGroups: dupGroups.length,
        duplicateExtras: dupGroups.reduce(function (n, g) { return n + g.length - 1; }, 0),
        unknownSubGroups: unknownSubs.length,
        unknownSubItems: unknownSubs.reduce(function (n, g) { return n + g.items.length; }, 0)
      }
    };
  }

  var api = { findIssues: findIssues, similarTo: similarTo, duplicateKey: duplicateKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
