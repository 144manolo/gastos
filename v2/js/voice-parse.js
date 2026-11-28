/* voice-parse.js — interpreta una frase dictada · Contabilidad MFB v2
 * Código puro (sin DOM), probado en Node. Ejemplo:
 *   "gasté doce con cincuenta en Mercadona ayer" → gasto, 12,50 €, COMIDA → MERCADONA, ayer */
(function (root) {
  'use strict';
  var U = { cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
    dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
    veintisiete: 27, veintiocho: 28, veintinueve: 29 };
  var T = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
  var H = { cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500,
    seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900 };
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[¿?¡!,;:]/g, function (m) { return m === ',' ? ',' : ' '; }); }

  // "treinta y cinco" → "35", "ciento veinte" → "120", "mil doscientos" → "1200"
  function wordsToDigits(text) {
    var tk = text.split(/\s+/), out = [], i = 0;
    function isNum(w) { return w in U || w in T || w in H || w === 'mil'; }
    while (i < tk.length) {
      if (!isNum(tk[i])) { out.push(tk[i]); i++; continue; }
      var total = 0, cur = 0, used = 0;
      while (i < tk.length) {
        var w = tk[i];
        if (w === 'y' && used && i + 1 < tk.length && (tk[i + 1] in U) && (cur % 100) >= 30 && (cur % 10) === 0) { i++; continue; }
        if (!isNum(w)) break;
        if (w in H) cur += H[w]; else if (w in T) cur += T[w]; else if (w in U) cur += U[w];
        else if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; }
        used++; i++;
      }
      out.push(String(total + cur));
    }
    return out.join(' ');
  }

  function findAmount(t) {
    var m;
    if ((m = t.match(/(\d+)[.,](\d{1,2})(?!\d)/))) return parseFloat(m[1] + '.' + m[2]);
    if ((m = t.match(/(\d+)\s*(?:euros?|€)?\s*(?:con|y)\s*(\d{1,2})(?!\d)/))) { var c = m[2].length === 1 ? m[2] + '0' : m[2]; return parseFloat(m[1] + '.' + c); }
    if ((m = t.match(/(\d+)\s*(?:euros?|€)\s*(\d{1,2})(?!\d)/))) { var c2 = m[2].length === 1 ? m[2] + '0' : m[2]; return parseFloat(m[1] + '.' + c2); }
    if ((m = t.match(/(\d+)\s*(?:euros?|€)/))) return parseFloat(m[1]);
    // primer número que no sea "el 12" (día)
    var re = /(\d+)/g, x;
    while ((x = re.exec(t))) { var before = t.slice(Math.max(0, x.index - 12), x.index); if (!/\b(el|dia)\s*$/.test(before)) return parseFloat(x[1]); }
    return null;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function findDate(t, now) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate()), m;
    if (/\bantes de ayer\b|\banteayer\b/.test(t)) { d.setDate(d.getDate() - 2); return iso(d); }
    if (/\bayer\b/.test(t)) { d.setDate(d.getDate() - 1); return iso(d); }
    if ((m = t.match(/\bel\s+(\d{1,2})\s+de\s+([a-z]+)/))) {
      var mi = MONTHS.indexOf(m[2]);
      if (mi >= 0) { var y = now.getFullYear(); var c = new Date(y, mi, +m[1]); if (c > now) c = new Date(y - 1, mi, +m[1]); return iso(c); }
    }
    if ((m = t.match(/\b(?:el|dia)\s+(\d{1,2})\b(?!\s*(?:euros?|€|con))/))) {
      var day = +m[1];
      if (day >= 1 && day <= 31) { var c2 = new Date(now.getFullYear(), now.getMonth(), day); if (c2 > now) c2 = new Date(now.getFullYear(), now.getMonth() - 1, day); return iso(c2); }
    }
    return iso(d);
  }

  function parse(text, categories, now) {
    now = now || new Date();
    var t = wordsToDigits(norm(text)).replace(/\s+/g, ' ').trim();
    var type = /\b(ingreso|ingrese|ingresado|ingresaron|cobre|cobro|cobrado|recibi|recibido|nomina|me han pagado|me pagaron|me han dado|me dieron)\b/.test(t) ? 'income' : 'expense';
    var amount = findAmount(t);
    var date = findDate(t, now);
    var cats = (categories && categories[type]) || {};
    var best = null, catOnly = null;
    Object.keys(cats).forEach(function (cat) {
      var nc = norm(cat).trim();
      if (nc.length > 2 && (' ' + t + ' ').indexOf(' ' + nc + ' ') >= 0 && (!catOnly || nc.length > catOnly.len)) catOnly = { cat: cat, len: nc.length };
      (cats[cat] || []).forEach(function (sub) {
        var ns = norm(sub).trim();
        if (ns.length < 3 || ns === nc) return;
        if ((' ' + t + ' ').indexOf(' ' + ns + ' ') >= 0 && (!best || ns.length > best.len)) best = { cat: cat, sub: sub, len: ns.length };
      });
    });
    if (catOnly && best && norm(catOnly.cat).trim() === norm(best.sub).trim()) best = null; // "ropa" = categoría ROPA, no la subcategoría ROPA de otra
    var category = best ? best.cat : (catOnly ? catOnly.cat : '');
    var subcategory = best ? best.sub : '';
    // descripción: lo dicho sin importe, fecha ni verbos de apertura
    var d = t.replace(/\b(gaste|gasto|gastado|pague|pagado|compre|compra|ingreso|ingrese|cobre|cobro|recibi|nuevo|nueva|he|hemos|ha|me|mi|sin)\b/g, ' ')
      .replace(/(\d+)\s*(?:euros?|€)?\s*(?:(?:con|y)\s*\d{1,2}\b|\d{1,2}\b)?/g, ' ')
      .replace(/\d+[.,]\d{1,2}/g, ' ')
      .replace(/\b(euros?|€|hoy|ayer|anteayer|antes de ayer|el|la|los|las|un|una|de|en|del|con|por|a|dia)\b/g, ' ')
      .replace(/[.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
    var description = d ? d.charAt(0).toUpperCase() + d.slice(1) : (subcategory || category || '');
    if (subcategory && (!d || norm(subcategory).trim() === d)) description = subcategory.charAt(0) + subcategory.slice(1).toLowerCase();
    return { type: type, amount: amount, date: date, category: category, subcategory: subcategory, description: description, heard: text };
  }

  var api = { parse: parse, wordsToDigits: wordsToDigits, norm: norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VoiceParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
