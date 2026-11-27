/* ticket-parser.js — lectura del texto de un ticket (OCR) · Contabilidad MFB v2
 * Código puro (sin DOM): se usa en la app y se puede probar en Node.
 * Extrae importe total, fecha y comercio, y sugiere categoría según el histórico. */
(function (root) {
  'use strict';

  function strip(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Corrige confusiones típicas del OCR dentro de números (O→0, l→1, S→5…)
  function fixDigits(token) {
    if (!/^[\dOoIl|SB.,\/\-]+$/.test(token)) return token;
    if ((token.match(/\d/g) || []).length < 2) return token;
    return token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
  }

  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(function (line) {
        return line.replace(/[^\s]+/g, fixDigits).replace(/[ \t]+/g, ' ').trim();
      })
      .filter(function (l) { return l.length > 0; });
  }

  // "1.234,56" · "28,35" · "28.35" → número
  var AMOUNT_RE = /(?<![\d,.])(\d{1,3}(?:\.\d{3})+,\d{2}|\d+[,.]\d{2})(?!\d)/g;

  function toNumber(s) {
    var t = String(s);
    if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function amountsInLine(line) {
    var out = [], m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(line)) !== null) {
      var n = toNumber(m[1]);
      if (n !== null && n > 0 && n < 100000) out.push(n);
    }
    return out;
  }

  var TOTAL_KEY = /(^|[^a-z])(total|a pagar|importe|pvp total)([^a-z]|$)/;
  var TOTAL_EXCLUDE = /subtotal|sub-total|base|cuota|iva|i\.v\.a|descuento|dto|entregado|cambio|efectivo|ahorro|puntos|bonific|devuelto|propina|articulos|n\.?\s?articulos|unidades|cant/;

  function findTotal(lines) {
    var norm = lines.map(function (l) { return strip(l).toLowerCase(); });
    var cands = [];
    for (var i = 0; i < lines.length; i++) {
      if (!TOTAL_KEY.test(norm[i]) || TOTAL_EXCLUDE.test(norm[i])) continue;
      var a = amountsInLine(lines[i]);
      if (!a.length && i + 1 < lines.length) {
        // el importe a veces cae en la línea siguiente
        var nextOnly = amountsInLine(lines[i + 1]);
        if (nextOnly.length && lines[i + 1].replace(AMOUNT_RE, '').replace(/[€\s:EURuR]/g, '').length === 0) a = nextOnly;
      }
      if (a.length) cands.push(a[a.length - 1]);
    }
    if (cands.length) return { value: Math.max.apply(null, cands), confidence: 'high' };

    // Sin palabra TOTAL: el importe que más se repite (total, pago con tarjeta…)
    var freq = {};
    lines.forEach(function (l, idx) {
      if (TOTAL_EXCLUDE.test(norm[idx])) return;
      amountsInLine(l).forEach(function (v) { freq[v] = (freq[v] || 0) + 1; });
    });
    var best = null;
    Object.keys(freq).forEach(function (k) {
      var v = parseFloat(k);
      if (freq[k] >= 2 && (best === null || freq[k] > freq[best] || (freq[k] === freq[best] && v > best))) best = v;
    });
    return best === null ? { value: null, confidence: 'none' } : { value: best, confidence: 'low' };
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function findDate(lines, now) {
    now = now || new Date();
    var maxYear = now.getFullYear() + 1;
    var re = /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/g;
    for (var i = 0; i < lines.length; i++) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(lines[i])) !== null) {
        var d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
        if (m[3].length === 2) y += 2000;
        if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2015 && y <= maxYear) {
          var dt = new Date(y, mo - 1, d);
          if (dt.getMonth() === mo - 1) return y + '-' + pad2(mo) + '-' + pad2(d);
        }
      }
    }
    return null;
  }

  var MERCHANT_SKIP = /ticket|factura|simplificada|cif|nif|n\.i\.f|tel|telf|fax|c\/|calle|avda|avenida|plaza|pol\.|ctra|www\.|http|@|gracias|bienvenid|duplicado|copia|caja|fecha|hora|operador|cajero|mesa|descripcion|concepto|articulo|precio|unit|cant|importe/;
var LEGAL_SUFFIX = /[,\s]+(s\.?\s?l\.?u?\.?|s\.?\s?a\.?u?\.?|s\.?\s?coop\.?|s\.?c\.?)\s*$/i;

  function findMerchant(lines) {
    var top = lines.slice(0, 8);
    for (var i = 0; i < top.length; i++) {
      var l = top[i].replace(LEGAL_SUFFIX, '');
      var letters = (strip(l).match(/[A-Za-z]/g) || []).length;
      if (letters < 3 || letters / l.length < 0.6) continue;
      if (MERCHANT_SKIP.test(strip(l).toLowerCase())) continue;
      var name = l.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.]+$/g, '').replace(/\s+/g, ' ');
      if (name.length >= 3) return name.toUpperCase().slice(0, 40);
    }
    return null;
  }

  function parseTicketText(text, now) {
    var lines = cleanText(text);
    var total = findTotal(lines);
    return {
      total: total.value,
      confidence: total.confidence,
      date: findDate(lines, now),
      merchant: findMerchant(lines),
      lines: lines.length
    };
  }

  // ---- Sugerencia de categoría según lo que ya has registrado ----
  // En tus datos la tienda es la subcategoría (COMIDA → MERCADONA, LIDL…):
  // si el encabezado del ticket contiene ese nombre, se propone esa categoría.
  function normPhrase(s) {
    return strip(s).toUpperCase().replace(/[^A-Z0-9&]+/g, ' ').trim();
  }

  function buildMerchantIndex(transactions) {
    var idx = {};
    (transactions || []).forEach(function (t) {
      if (t.type !== 'expense' || !t.category || !t.subcategory || t.subcategory === t.category) return;
      var k = normPhrase(t.subcategory);
      if (k.length < 4 || /^OTROS|VARIOS$|^BARES/.test(k)) return;
      var e = idx[k] || (idx[k] = { n: 0, cats: {}, sub: t.subcategory });
      e.n++;
      e.cats[t.category] = (e.cats[t.category] || 0) + 1;
    });
    return idx;
  }

  function suggestFromHistory(text, index) {
    var header = cleanText(text).slice(0, 8).join(' ');
    var hay = ' ' + normPhrase(header) + ' ';
    var best = null;
    Object.keys(index || {}).forEach(function (k) {
      var e = index[k];
      if (e.n < 3 || hay.indexOf(' ' + k + ' ') === -1) return;
      if (!best || k.length > best.key.length || (k.length === best.key.length && e.n > best.e.n)) best = { key: k, e: e };
    });
    if (!best) return null;
    var cats = best.e.cats;
    var cat = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0];
    return { merchantKey: best.key, category: cat, subcategory: best.e.sub, n: best.e.n };
  }

  var api = {
    parseTicketText: parseTicketText,
    buildMerchantIndex: buildMerchantIndex,
    suggestFromHistory: suggestFromHistory,
    _amountsInLine: amountsInLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TicketParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
