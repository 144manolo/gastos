/* ticket-items.js — líneas de un ticket, carta del sitio y reparto por lo consumido · Contabilidad MFB v2
 * Código puro (sin DOM), probado en Node. Todo el dinero se maneja en céntimos. */
(function (root) {
  'use strict';
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  var STOP = /\b(total|subtotal|sub-total|iva|i\.v\.a|base|cambio|entregado|entrega|tarjeta|efectivo|visa|mastercard|mesa|fecha|hora|cif|nif|tel|telf|telefono|gracias|camarero|camarera|factura|simplificada|ticket|propina|descuento|importe|pagado|a pagar|le atendio|atendido|cliente|comensales|numero|n[ºo°]|calle|avda|plaza|direccion|www|http|@)\b/;
  var PRICE = /(\d{1,4}[.,]\d{2})\s*(?:€|eur|euros)?\s*$/i;

  function toNum(s) { return parseFloat(String(s).replace(',', '.')); }
  function cents(x) { return Math.round(x * 100); }

  // "1/2 T. ATUN" (media tostada) y sus lecturas erróneas del OCR ("112 TOST.", "1/21. JAMON")
  function cleanName(rest) {
    var name = rest.toUpperCase().replace(/\s+/g, ' ').trim();
    var m = name.match(/^(1\s?\/\s?2[7IL]?|11\/21|1\/21|112|172|12)[\.\s]+(TOSTADA|TOST\.?|T\.?|1\.|7\s)?\s*/);
    if (m && name.slice(m[0].length).length > 2) {
      var tost = m[2] || (m[1] === '1/21' ? 'T' : '');
      name = 'MEDIA ' + (tost ? 'TOSTADA ' : '') + name.slice(m[0].length);
    }
    return name.replace(/\b(?:O?ST|TOST|TOS TADA|OSTADA)\.?(?=\s)/g, 'TOSTADA').replace(/\bOSTADA\b/g,'TOSTADA').replace(/\bTOS TADA\b/g,'TOSTADA').replace(/[^A-ZÁÉÍÓÚÜÑ0-9\/\s\.\-]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Texto OCR → { items: [{ qty, name, unit, total }], total, date }
  // Formato típico de bar: "Ud. Descripción Precio Importe"; el nombre puede continuar en la línea siguiente.
  function parseItems(text) {
    var items = [], total = null, done = false, last = null;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      if (done) return;
      var line = raw.replace(/[|_]/g, ' ').replace(/\s+/g, ' ').trim();
      if (line.length < 3) return;
      var n = norm(line);
      var tm = n.match(/\b(?:total|a pagar|importe)\b[^0-9]*(\d{1,4}[.,]\d{2})/);
      if (tm && !/subtotal|sub-total|iva|base|precio/.test(n)) { var v = toNum(tm[1]); if (total === null || v > total) total = v; if (items.length) done = true; return; }
      if (STOP.test(n)) { last = null; return; }
      var pm = line.match(PRICE);
      if (!pm) {
        // sin precio: continuación del nombre anterior (todo en mayúsculas y corta)
        var letters = line.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '');
        if (last && letters.length >= 3 && line.length <= 40 && line === line.toUpperCase() && !/\d{2,}/.test(line)) last.name = (last.name + ' ' + cleanName(line)).trim();
        return;
      }
      var lastP = toNum(pm[1]);
      var rest = line.slice(0, pm.index).trim();
      var pm2 = rest.match(/(\d{1,4}[.,]\d{2})\s*(?:€|eur|euros)?\s*$/i), unit = null;
      if (pm2) { unit = toNum(pm2[1]); rest = rest.slice(0, pm2.index).trim(); }
      var qty = 1, qm = rest.match(/^(\d{1,2})\s*(?:[x×*]\s*|\s+)(?=\S)/i);
      if (qm && !/[A-Za-zÁÉÍÓÚÑ]/.test(rest.slice(qm[0].length))) qm = null;
      if (qm) { qty = parseInt(qm[1], 10); rest = rest.slice(qm[0].length).trim(); if (qty >= 10 && /^TOST/i.test(rest)) { rest = qm[1] + ' ' + rest; qty = 1; } }
      else if ((qm = rest.match(/\s+[x×]\s*(\d{1,2})$/i))) { qty = parseInt(qm[1], 10); rest = rest.slice(0, qm.index).trim(); }
      rest = rest.replace(/^[\-\.\*:·\s]+|[\-\.\*:·\s€]+$/g, '').replace(/\s+[x×]$/i, '').trim();
      if (rest.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').length < 2) return;
      var un;
      if (unit !== null && qty >= 1 && Math.abs(unit * qty - lastP) < 0.011) un = unit;
      else if (unit !== null && qty > 1) un = lastP / qty;
      else un = qty > 0 ? lastP / qty : lastP;
      last = { qty: qty, name: cleanName(rest), unit: Math.round(un * 100) / 100, total: Math.round(lastP * 100) / 100 };
      items.push(last);
    });
    if (total === null && items.length) total = Math.round(items.reduce(function (s, i) { return s + i.total; }, 0) * 100) / 100;
    var dm = String(text || '').match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})/);
    var date = dm ? dm[3] + '-' + ('0' + dm[2]).slice(-2) + '-' + ('0' + dm[1]).slice(-2) : null;
    return { items: items, total: total, date: date };
  }

  // ---------- Carta del sitio ----------
  function tokens(name) { return norm(name).replace(/[^a-z0-9ñ ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1 && !/^(de|del|la|el|los|las|con|y|al|a|en|un|una)$/.test(w); }).map(stem); }
  function stem(w) { return w.length > 4 ? w.replace(/(es|s)$/, '') : w.replace(/s$/, ''); }
  function similarity(a, b) {
    var A = tokens(a), B = tokens(b); if (!A.length || !B.length) return 0;
    var inter = A.filter(function (t) { return B.indexOf(t) >= 0; }).length;
    return inter / (A.length + B.length - inter);
  }
  function matchItem(name, catalog) {
    var best = null, bs = 0, nn = norm(name).trim();
    (catalog || []).forEach(function (c) {
      var s = norm(c.name).trim() === nn ? 1 : similarity(name, c.name);
      if (s > bs) { bs = s; best = c; }
    });
    return bs >= 0.8 ? best : null;
  }
  // Distancia de edición normalizada (0-1) para corregir lecturas del OCR contra la carta
  function charSim(a, b) {
    a = norm(a).replace(/[^a-z0-9]/g, ''); b = norm(b).replace(/[^a-z0-9]/g, '');
    if (!a.length || !b.length) return 0;
    var prev = [], i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { var cur = [i]; for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return 1 - prev[b.length] / Math.max(a.length, b.length);
  }
  // Si el nombre leído no está en la carta pero se parece mucho a UN plato (y claramente más que al resto), usa el de la carta
  function fixNames(items, catalog) {
    var fixed = 0;
    items.forEach(function (it) {
      var exact = (catalog || []).some(function (c) { return norm(c.name).trim() === norm(it.name).trim(); });
      if (exact || !(catalog || []).length) return;
      var sc = catalog.map(function (c) { return [charSim(it.name, c.name), c]; }).sort(function (x, y) { return y[0] - x[0]; });
      if (sc[0][0] >= 0.88 && (sc.length < 2 || sc[0][0] - sc[1][0] >= 0.06)) { it.name = sc[0][1].name; it.fixed = true; fixed++; }
    });
    return fixed;
  }
  // Para cada línea del ticket: igual / cambió el precio / nuevo
  function compareWithCatalog(items, catalog) {
    return items.map(function (it) {
      var m = matchItem(it.name, catalog);
      if (!m) return { status: 'new', item: it, catalogItem: null };
      if (Math.abs(m.price - it.unit) < 0.005) return { status: 'same', item: it, catalogItem: m };
      return { status: 'changed', item: it, catalogItem: m };
    });
  }

  // ---------- Dictado: "Ana una caña y unas bravas, yo el café" ----------
  var NUMW = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: 0.5, media: 0.5 };
  function parseAssign(text, people, lines) {
    var me = people[0], words = norm(text).replace(/[.,;:¿?¡!]/g, ' , ').split(/\s+/).filter(Boolean);
    // sustituir números escritos
    words = words.map(function (w) { return (w in NUMW && NUMW[w] >= 1) ? String(NUMW[w]) : w; });
    var pnorm = people.map(function (p) { return norm(p).trim(); });
    var ME = /^(yo|mi|me)$/;
    var out = [], unknown = [], shared = [], cur = null, used = {};
    var lineTokens = lines.map(function (l) { return tokens(l.name); });
    var uniq = {}; lineTokens.forEach(function (T) { T.forEach(function (t) { uniq[t] = (uniq[t] || 0) + 1; }); });
    var i = 0;
    while (i < words.length) {
      var w = words[i];
      var pi = pnorm.indexOf(w);
      if (pi >= 0) { cur = people[pi]; i++; continue; }
      if (ME.test(w)) { cur = me; i++; continue; }
      if (/^(todos|compartido|compartidas|compartimos|mitad|medias)$/.test(w)) { cur = '*'; i++; continue; }
      if (w === ',' || /^(y|ha|han|ido|tomado|tomo|toma|tomaron|pedido|pidio|bebio|comio|se|el|la|los|las|de|del|ha|he|hemos|a|para|su|sus)$/.test(w)) { i++; continue; }
      // ¿empieza aquí el nombre de una línea?
      var bestL = -1, bestLen = 0, bestRatio = 0, bestEnd = 1;
      lines.forEach(function (l, li) {
        var T = lineTokens[li]; if (!T.length) return;
        var win = words.slice(i, i + T.length + 3).map(function (x) { return stem(x); });
        var hit = T.filter(function (t) { return win.indexOf(t) >= 0; }).length, ratio = hit / T.length, end = 1;
        T.forEach(function (t) { var p = win.indexOf(t); if (p >= 0 && p + 1 > end) end = p + 1; });
        // la palabra actual debe ser una del nombre y haber acertado al menos la mitad del nombre
        if (T.indexOf(stem(w)) >= 0 && (ratio >= 0.5 || hit >= 2 || (hit === 1 && uniq[stem(w)] === 1)) && (hit > bestLen || (hit === bestLen && ratio > bestRatio))) { bestL = li; bestLen = hit; bestRatio = ratio; bestEnd = end; }
      });
      if (bestL >= 0) {
        var qty = 1;
        var prev = words[i - 1];
        if (prev && /^\d+$/.test(prev)) qty = parseInt(prev, 10);
        else if (prev && /^(los|las|todos|todas|unos|unas)$/.test(prev) && /^(los|las)$/.test(prev)) qty = 999; // "los refrescos" = todos los que haya
        if (cur === '*') shared.push(bestL);
        else if (cur) out.push({ person: cur, line: bestL, qty: qty });
        else unknown.push(lines[bestL].name);
        i += bestEnd; continue;
      }
      if (!/^\d+$/.test(w) && w.length > 2) unknown.push(w);
      i++;
    }
    return { assigns: out, shared: shared, unknown: unknown };
  }

  // ---------- Reparto exacto en céntimos ----------
  // lines: [{ qty, total, assigned: { persona: unidades } }] · ticketTotal opcional (propina, ajuste…)
  // Devuelve { perPerson: {persona: céntimos}, sumLines, extra } y suma exactamente ticketTotal si se da.
  function allocate(people, lines, ticketTotal) {
    var acc = {}; people.forEach(function (p) { acc[p] = 0; });
    var sumLines = 0, unassignedCents = 0;
    lines.forEach(function (l) {
      var lt = cents(l.total), q = l.qty > 0 ? l.qty : 1; sumLines += lt;
      var assigned = 0, entries = [];
      Object.keys(l.assigned || {}).forEach(function (p) { if ((p in acc) && l.assigned[p] > 0) { var u = Math.min(l.assigned[p], q - assigned); if (u > 0) { entries.push([p, u]); assigned += u; } } });
      var left = q - assigned;
      // partes por persona (unidades asignadas) + el resto a partes iguales
      var shares = {}; people.forEach(function (p) { shares[p] = 0; });
      entries.forEach(function (e) { shares[e[0]] += e[1] / q; });
      var rest = left / q; people.forEach(function (p) { shares[p] += rest / people.length; });
      distribute(lt, shares, acc);
    });
    var extra = 0;
    if (ticketTotal != null && !isNaN(ticketTotal)) {
      var tt = cents(ticketTotal); extra = tt - sumLines;
      if (extra !== 0) {
        var base = {}; var sub = 0; people.forEach(function (p) { base[p] = acc[p]; sub += acc[p]; });
        var w = {}; people.forEach(function (p) { w[p] = sub > 0 ? base[p] / sub : 1 / people.length; });
        distribute(extra, w, acc);
      }
    }
    return { perPerson: acc, sumLines: sumLines, extra: extra };
  }
  // Reparte `amount` céntimos según pesos `w` (que suman ~1) sin perder ni inventar céntimos
  function distribute(amount, w, acc) {
    var names = Object.keys(w), sign = amount < 0 ? -1 : 1, a = Math.abs(amount), given = 0, fr = [];
    var sw = names.reduce(function (s, n) { return s + w[n]; }, 0) || 1;
    names.forEach(function (n) { var exact = a * (w[n] / sw), f = Math.floor(exact + 1e-9); given += f; acc[n] += sign * f; fr.push([n, exact - f]); });
    fr.sort(function (x, y) { return y[1] - x[1]; });
    for (var k = 0; k < a - given; k++) acc[fr[k % fr.length][0]] += sign;
  }

  var api = { fixNames: fixNames, charSim: charSim, parseItems: parseItems, matchItem: matchItem, compareWithCatalog: compareWithCatalog, parseAssign: parseAssign, allocate: allocate, similarity: similarity, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TicketItems = api;
})(typeof window !== 'undefined' ? window : globalThis);
