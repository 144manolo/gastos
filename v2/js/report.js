/* report.js — informe para compartir (imagen o PDF) · Contabilidad MFB v2
 * Un cuestionario corto pregunta periodo y contenido; se dibuja en un canvas
 * (gráfico redondo de gastos por categoría, totales, comparativa…) y se envía con el
 * menú "Compartir" del móvil (WhatsApp, etc.). Sin librerías: el PDF se escribe a mano. */

const REP_COLORS = ['#00f0ff', '#ff2d95', '#b026ff', '#ffd23f', '#00ff88', '#ff7a2f', '#4d7cff', '#ff5c5c', '#7c8aa5'];
const REP_DEFAULT = { period: 'month', from: '', to: '', title: '', note: '', fmt: 'png',
  sec: { totals: true, donut: true, topcats: true, compare: true, bigs: false, merchants: false, incomes: false } };
let rep = null, repBlob = null, repOpen = false;

function repPad(n) { return (n < 10 ? '0' : '') + n; }
function repISO(y, m, d) { return y + '-' + repPad(m + 1) + '-' + repPad(d); }
function repMoney(n) { return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €'; }
function repShort(s) { const d = s.split('-'); return d[2] + '/' + d[1] + '/' + d[0]; }

// Rango de fechas [from,to] según la respuesta del cuestionario
function repRange(r) {
  const y = selectedYear, m = selectedMonth, now = new Date();
  const last = (yy, mm) => new Date(yy, mm + 1, 0).getDate();
  let from, to, label;
  if (r.period === 'month') { from = repISO(y, m, 1); to = repISO(y, m, last(y, m)); label = MONTHS[m] + ' ' + y; }
  else if (r.period === 'prev') { const p = prevMonthOf(y, m); from = repISO(p.y, p.m, 1); to = repISO(p.y, p.m, last(p.y, p.m)); label = MONTHS[p.m] + ' ' + p.y; }
  else if (r.period === '3m') { let a = { y, m }; for (let i = 0; i < 2; i++) a = prevMonthOf(a.y, a.m); from = repISO(a.y, a.m, 1); to = repISO(y, m, last(y, m)); label = 'Últimos 3 meses (' + MONTHS_SHORT[a.m] + ' ' + a.y + ' – ' + MONTHS_SHORT[m] + ' ' + y + ')'; }
  else if (r.period === 'year') { from = repISO(y, 0, 1); to = repISO(y, 11, 31); label = 'Año ' + y; }
  else if (r.period === 'lastyear') { from = repISO(y - 1, 0, 1); to = repISO(y - 1, 11, 31); label = 'Año ' + (y - 1); }
  else { from = r.from || repISO(now.getFullYear(), now.getMonth(), 1); to = r.to || repISO(now.getFullYear(), now.getMonth(), now.getDate()); if (from > to) { const t = from; from = to; to = t; } label = repShort(from) + ' – ' + repShort(to); }
  return { from, to, label };
}
// Periodo con el que se compara: mes → mes anterior, año → año anterior, 3 meses → los 3 anteriores, fechas → misma duración
function repPrevRange(from, to, period) {
  const A = new Date(from + 'T00:00:00'), B = new Date(to + 'T00:00:00');
  const f = d => repISO(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === 'month' || period === 'prev') { const p = new Date(A.getFullYear(), A.getMonth() - 1, 1); return { from: f(p), to: f(new Date(p.getFullYear(), p.getMonth() + 1, 0)) }; }
  if (period === 'year' || period === 'lastyear') return { from: repISO(A.getFullYear() - 1, 0, 1), to: repISO(A.getFullYear() - 1, 11, 31) };
  if (period === '3m') { const p = new Date(A.getFullYear(), A.getMonth() - 3, 1); return { from: f(p), to: f(new Date(A.getFullYear(), A.getMonth(), 0)) }; }
  const days = Math.round((B - A) / 86400000) + 1;
  const pb = new Date(A); pb.setDate(pb.getDate() - 1);
  const pa = new Date(pb); pa.setDate(pa.getDate() - days + 1);
  return { from: f(pa), to: f(pb) };
}

// Todos los cálculos del informe (separados del dibujo para poder probarlos)
function repCompute(r) {
  const rg = repRange(r), pr = repPrevRange(rg.from, rg.to, r.period);
  const all = getAllTransactions();
  const inR = (t, f, to) => t.date >= f && t.date <= to;
  const cur = all.filter(t => inR(t, rg.from, rg.to)), prev = all.filter(t => inR(t, pr.from, pr.to));
  const sum = (a, type) => a.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0);
  const inc = sum(cur, 'income'), exp = sum(cur, 'expense'), pinc = sum(prev, 'income'), pexp = sum(prev, 'expense');
  const group = (a, keyf, type) => {
    const o = {};
    a.filter(t => t.type === type).forEach(t => { const k = keyf(t); o[k] = (o[k] || 0) + t.amount; });
    return Object.keys(o).map(k => ({ name: k, v: o[k] })).filter(x => x.v > 0).sort((x, y) => y.v - x.v);
  };
  const cats = group(cur, t => t.category || 'Sin categoría', 'expense');
  const pcats = {}; group(prev, t => t.category || 'Sin categoría', 'expense').forEach(x => pcats[x.name] = x.v);
  return {
    range: rg, prevRange: pr, inc, exp, bal: inc - exp, pinc, pexp, n: cur.length,
    cats, pcats,
    merchants: group(cur, t => (t.subcategory && t.subcategory !== t.category) ? t.subcategory : t.category, 'expense').slice(0, 8),
    bigs: cur.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5),
    incomes: group(cur, t => t.subcategory || t.category || 'Ingreso', 'income').slice(0, 6)
  };
}

// ---------- Dibujo ----------
function repRoundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function repFit(c, text, maxW) {
  if (c.measureText(text).width <= maxW) return text;
  while (text.length > 3 && c.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}
function repWrap(c, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur);
  return lines;
}

function repDraw(r, data) {
  const W = 1080, P = 56, IW = W - P * 2, FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const cv = document.createElement('canvas'); cv.width = W; cv.height = 4600;
  const c = cv.getContext('2d');
  let y = 0;
  const bg = () => { c.fillStyle = '#0a0e1a'; c.fillRect(0, 0, W, cv.height); };
  bg();
  // Cabecera
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#00f0ff'); g.addColorStop(1, '#b026ff');
  c.fillStyle = g; c.fillRect(0, 0, W, 10);
  y = 84;
  c.fillStyle = '#ffffff'; c.font = '700 46px ' + FONT; c.textBaseline = 'alphabetic';
  repWrap(c, r.title || ('Resumen — ' + data.range.label), IW).forEach(l => { c.fillText(l, P, y); y += 56; });
  c.fillStyle = '#8892a4'; c.font = '400 28px ' + FONT;
  c.fillText(data.range.label + ' · ' + data.n + ' movimientos', P, y); y += 28;
  if (r.note) { y += 18; c.fillStyle = '#d6dbe6'; c.font = 'italic 28px ' + FONT; repWrap(c, '“' + r.note + '”', IW).forEach(l => { c.fillText(l, P, y + 22); y += 38; }); y += 6; }
  y += 30;

  // Totales
  if (r.sec.totals) {
    const showInc = r.showIncome !== false;
    const boxes = showInc
      ? [['INGRESOS', '+' + repMoney(data.inc), '#00f0ff'], ['GASTOS', '-' + repMoney(data.exp), '#ff2d95'], ['SALDO', (data.bal < 0 ? '-' : '') + repMoney(Math.abs(data.bal)), data.bal >= 0 ? '#00ff88' : '#ff5c5c']]
      : [['GASTOS', '-' + repMoney(data.exp), '#ff2d95']];
    const bw = (IW - 20 * (boxes.length - 1)) / boxes.length;
    boxes.forEach((b, i) => {
      const x = P + i * (bw + 20);
      c.fillStyle = '#121a2e'; repRoundRect(c, x, y, bw, 130, 22); c.fill();
      c.strokeStyle = b[2]; c.globalAlpha = .45; c.lineWidth = 2; c.stroke(); c.globalAlpha = 1;
      c.fillStyle = '#8892a4'; c.font = '600 22px ' + FONT; c.textAlign = 'center'; c.fillText(b[0], x + bw / 2, y + 42);
      c.fillStyle = b[2]; c.font = '700 ' + (boxes.length === 1 ? 52 : 34) + 'px ' + FONT; c.fillText(repFit(c, b[1], bw - 20), x + bw / 2, y + 96);
    });
    c.textAlign = 'left'; y += 130 + 44;
  }

  // Comparativa
  if (r.sec.compare) {
    const line = (label, cur, prev, goodUp) => {
      if (!prev) return [label, 'sin datos del periodo anterior', '#8892a4'];
      const d = cur - prev, p = Math.abs(d / prev * 100).toFixed(0) + '%';
      if (Math.abs(d) < 0.005) return [label, 'igual que el periodo anterior', '#8892a4'];
      const good = goodUp ? d > 0 : d < 0;
      return [label, (d > 0 ? '▲ ' : '▼ ') + p + ' (' + (d > 0 ? '+' : '-') + repMoney(Math.abs(d)) + ')', good ? '#00ff88' : '#ff5c5c'];
    };
    const rows = [line('Gastos', data.exp, data.pexp, false)];
    if (r.showIncome !== false) rows.unshift(line('Ingresos', data.inc, data.pinc, true));
    c.fillStyle = '#8892a4'; c.font = '600 24px ' + FONT; c.fillText('FRENTE AL PERIODO ANTERIOR (' + repShort(data.prevRange.from) + ' – ' + repShort(data.prevRange.to) + ')', P, y); y += 14;
    rows.forEach(rw => {
      y += 42; c.fillStyle = '#d6dbe6'; c.font = '500 30px ' + FONT; c.fillText(rw[0], P, y);
      c.fillStyle = rw[2]; c.font = '700 30px ' + FONT; c.textAlign = 'right'; c.fillText(rw[1], W - P, y); c.textAlign = 'left';
    });
    y += 50;
  }

  // Gráfico redondo
  const slices = (() => {
    const top = data.cats.slice(0, 8), rest = data.cats.slice(8).reduce((s, x) => s + x.v, 0);
    return rest > 0 ? top.concat([{ name: 'Otras', v: rest }]) : top;
  })();
  if (r.sec.donut && slices.length) {
    const total = data.exp; const R = 250, cx = W / 2, cy = y + R + 10;
    c.fillStyle = '#8892a4'; c.font = '600 24px ' + FONT; c.fillText('EN QUÉ SE VA EL DINERO', P, y); y += 14;
    let a0 = -Math.PI / 2;
    slices.forEach((s, i) => {
      const a1 = a0 + s.v / total * Math.PI * 2;
      c.beginPath(); c.moveTo(cx, cy + 20); c.arc(cx, cy + 20, R, a0, a1); c.closePath();
      c.fillStyle = REP_COLORS[i % REP_COLORS.length]; c.fill();
      c.strokeStyle = '#0a0e1a'; c.lineWidth = 5; c.stroke();
      a0 = a1;
    });
    c.beginPath(); c.arc(cx, cy + 20, R * 0.58, 0, Math.PI * 2); c.fillStyle = '#0a0e1a'; c.fill();
    c.textAlign = 'center'; c.fillStyle = '#8892a4'; c.font = '500 26px ' + FONT; c.fillText('GASTADO', cx, cy + 4);
    c.fillStyle = '#ffffff'; c.font = '700 44px ' + FONT; c.fillText(repFit(c, repMoney(total), R * 1.05), cx, cy + 56);
    c.textAlign = 'left';
    y = cy + R + 70;
    // Leyenda en dos columnas
    const colW = IW / 2; let rowsN = Math.ceil(slices.length / 2);
    slices.forEach((s, i) => {
      const col = i < rowsN ? 0 : 1, row = i % rowsN, x = P + col * colW, yy = y + row * 46;
      c.fillStyle = REP_COLORS[i % REP_COLORS.length]; repRoundRect(c, x, yy - 22, 24, 24, 6); c.fill();
      c.fillStyle = '#e8ecf5'; c.font = '500 26px ' + FONT; c.fillText(repFit(c, s.name, colW - 230), x + 38, yy);
      c.fillStyle = '#8892a4'; c.textAlign = 'right'; c.fillText((s.v / total * 100).toFixed(0) + '%', x + colW - 24, yy); c.textAlign = 'left';
    });
    y += rowsN * 46 + 30;
  }

  // Lista de categorías con barra
  const barList = (titleTxt, items, color, total, withDelta) => {
    if (!items.length) return;
    c.fillStyle = '#8892a4'; c.font = '600 24px ' + FONT; c.fillText(titleTxt, P, y); y += 18;
    const max = items[0].v;
    items.forEach((it, i) => {
      y += 48;
      c.fillStyle = '#e8ecf5'; c.font = '500 28px ' + FONT; c.fillText(repFit(c, it.name, IW - 360), P, y);
      c.textAlign = 'right'; c.font = '700 28px ' + FONT; c.fillStyle = '#ffffff'; c.fillText(repMoney(it.v), W - P, y);
      if (withDelta && data.pcats) {
        const pv = data.pcats[it.name];
        if (pv) { const d = (it.v - pv) / pv * 100; c.font = '600 22px ' + FONT; c.fillStyle = d > 0 ? '#ff5c5c' : '#00ff88'; c.fillText((d > 0 ? '▲' : '▼') + Math.abs(d).toFixed(0) + '%', W - P - 200, y); }
      }
      c.textAlign = 'left';
      c.fillStyle = 'rgba(255,255,255,.07)'; repRoundRect(c, P, y + 12, IW, 10, 5); c.fill();
      c.fillStyle = color || REP_COLORS[i % REP_COLORS.length]; repRoundRect(c, P, y + 12, Math.max(10, IW * it.v / max), 10, 5); c.fill();
      y += 22;
    });
    y += 40;
  };
  if (r.sec.topcats) barList('CATEGORÍAS QUE MÁS PESAN', data.cats.slice(0, 8), null, data.exp, true);
  if (r.sec.merchants) barList('DÓNDE SE GASTA MÁS (SUBCATEGORÍA / COMERCIO)', data.merchants, '#b026ff', data.exp, false);
  if (r.sec.incomes && data.incomes.length) barList('INGRESOS', data.incomes, '#00f0ff', data.inc, false);
  if (r.sec.bigs && data.bigs.length) {
    c.fillStyle = '#8892a4'; c.font = '600 24px ' + FONT; c.fillText('LOS 5 GASTOS MÁS GRANDES', P, y); y += 10;
    data.bigs.forEach(t => {
      y += 48; c.fillStyle = '#8892a4'; c.font = '400 24px ' + FONT; c.fillText(t.date.slice(8) + '/' + t.date.slice(5, 7), P, y);
      c.fillStyle = '#e8ecf5'; c.font = '500 28px ' + FONT; c.fillText(repFit(c, t.description, IW - 330), P + 90, y);
      c.textAlign = 'right'; c.fillStyle = '#ff2d95'; c.font = '700 28px ' + FONT; c.fillText('-' + repMoney(t.amount), W - P, y); c.textAlign = 'left';
    });
    y += 44;
  }

  // Pie
  c.fillStyle = '#4b5568'; c.font = '400 22px ' + FONT; c.fillText('Contabilidad MFB · generado el ' + new Date().toLocaleDateString('es-ES'), P, y + 10);
  y += 50;
  const out = document.createElement('canvas'); out.width = W; out.height = y;
  const oc = out.getContext('2d'); oc.drawImage(cv, 0, 0);
  return out;
}

// ---------- PDF mínimo (una página con la imagen) ----------
function repPdfFromCanvas(cv) {
  const jpg = atob(cv.toDataURL('image/jpeg', 0.92).split(',')[1]);
  const bytes = new Uint8Array(jpg.length); for (let i = 0; i < jpg.length; i++) bytes[i] = jpg.charCodeAt(i);
  const pw = 595, ph = Math.round(595 * cv.height / cv.width);
  const enc = new TextEncoder(), parts = []; let len = 0; const offs = [];
  const push = u8 => { parts.push(u8); len += u8.length; };
  const str = s => push(enc.encode(s));
  str('%PDF-1.4\n');
  offs[1] = len; str('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  offs[2] = len; str('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  offs[3] = len; str('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
  offs[4] = len; str('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytes.length + ' >>\nstream\n'); push(bytes); str('\nendstream\nendobj\n');
  const content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
  offs[5] = len; str('5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
  const xref = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n'; for (let i = 1; i <= 5; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  str(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
  const all = new Uint8Array(len); let p = 0; parts.forEach(u => { all.set(u, p); p += u.length; });
  return new Blob([all], { type: 'application/pdf' });
}

// ---------- Cuestionario ----------
function repEnsureDom() {
  if (document.getElementById('repOverlay')) return;
  const d = document.createElement('div');
  d.className = 'v2-overlay'; d.id = 'repOverlay';
  d.innerHTML = '<div class="v2-head"><button onclick="closeReport()" aria-label="Volver">‹</button><h2>INFORME PARA COMPARTIR</h2></div><div class="v2-body" id="repBody"></div>';
  document.body.appendChild(d);
}
function openReport() {
  repEnsureDom();
  rep = JSON.parse(JSON.stringify(REP_DEFAULT));
  repBlob = null;
  document.getElementById('repOverlay').classList.add('active'); repOpen = true;
  repRender();
}
function closeReport() { document.getElementById('repOverlay').classList.remove('active'); repOpen = false; }

function repSet(k, v) { rep[k] = v; repBlob = null; repRender(); }
function repToggle(k) { rep.sec[k] = !rep.sec[k]; repBlob = null; repRender(); }

function repRender() {
  const P = [['month', 'Mes elegido'], ['prev', 'Mes anterior'], ['3m', 'Últimos 3 meses'], ['year', 'Este año'], ['lastyear', 'Año pasado'], ['custom', 'Fechas…']];
  const S = [['totals', 'Totales (ingresos, gastos, saldo)'], ['donut', 'Gráfico redondo de gastos por categoría'], ['topcats', 'Categorías que más pesan (con variación)'],
    ['compare', 'Comparación con el periodo anterior'], ['merchants', 'Dónde se gasta más (comercios)'], ['bigs', 'Los 5 gastos más grandes'], ['incomes', 'Detalle de ingresos']];
  const rg = repRange(rep);
  const chip = (on, label, fn) => '<button class="rep-chip' + (on ? ' on' : '') + '" onclick="' + fn + '">' + label + '</button>';
  document.getElementById('repBody').innerHTML =
    '<div class="rep-q"><b>1. ¿De qué periodo?</b><div class="rep-chips">' + P.map(p => chip(rep.period === p[0], p[1], "repSet('period','" + p[0] + "')")).join('') + '</div>' +
    (rep.period === 'custom' ? '<div class="rep-dates"><input type="date" value="' + rep.from + '" onchange="repSet(\'from\', this.value)"><input type="date" value="' + rep.to + '" onchange="repSet(\'to\', this.value)"></div>' : '') +
    '<small>' + escapeHtml(rg.label) + '</small></div>' +
    '<div class="rep-q"><b>2. ¿Qué quieres incluir?</b>' + S.map(s => '<label class="rep-check"><input type="checkbox" ' + (rep.sec[s[0]] ? 'checked' : '') + ' onchange="repToggle(\'' + s[0] + '\')"><span>' + s[1] + '</span></label>').join('') +
    '<label class="rep-check"><input type="checkbox" ' + (rep.showIncome === false ? '' : 'checked') + ' onchange="rep.showIncome = this.checked ? true : false; repBlob = null"><span>Mostrar ingresos y saldo (desmárcalo para enseñar solo gastos)</span></label></div>' +
    '<div class="rep-q"><b>3. Título y nota (opcional)</b><input type="text" class="rep-in" placeholder="Título: Resumen de ' + escapeHtml(rg.label) + '" value="' + escapeHtml(rep.title) + '" oninput="rep.title = this.value; repBlob = null">' +
    '<input type="text" class="rep-in" placeholder="Una nota, por ejemplo: ojo con Regalos este mes" value="' + escapeHtml(rep.note) + '" oninput="rep.note = this.value; repBlob = null"></div>' +
    '<div class="rep-q"><b>4. ¿En qué formato?</b><div class="rep-chips">' + chip(rep.fmt === 'png', '🖼️ Imagen', "repSet('fmt','png')") + chip(rep.fmt === 'pdf', '📄 PDF', "repSet('fmt','pdf')") + '</div></div>' +
    '<div class="rep-actions"><button class="rev-main sec" onclick="repPreview()">👁️ Vista previa</button><button class="rev-main" onclick="repShare()">📤 Enviar (WhatsApp…)</button></div>' +
    '<div id="repPreview"></div>';
}

async function repBuild() {
  const data = repCompute(rep);
  if (!data.n) { showNotification('No hay movimientos en ese periodo', true); return null; }
  const cv = repDraw(rep, data);
  const slug = (rep.title || data.range.label).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'resumen';
  if (rep.fmt === 'pdf') return { blob: repPdfFromCanvas(cv), name: 'resumen-' + slug + '.pdf', canvas: cv };
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  return { blob, name: 'resumen-' + slug + '.png', canvas: cv };
}
async function repPreview() {
  const r = await repBuild(); if (!r) return;
  repBlob = r;
  const box = document.getElementById('repPreview');
  box.innerHTML = '<img class="rep-img" alt="Vista previa">' + (rep.fmt === 'pdf' ? '<small>Vista previa de la imagen; se enviará como PDF.</small>' : '');
  box.firstChild.src = r.canvas.toDataURL('image/jpeg', 0.85);
}
async function repShare() {
  const r = repBlob || await repBuild(); if (!r) return;
  const file = new File([r.blob], r.name, { type: r.blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: rep.title || 'Resumen de gastos' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(r.blob);
  const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  showNotification('Descargado: adjúntalo en WhatsApp desde tus archivos');
}
