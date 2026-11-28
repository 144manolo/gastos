/* insights.js — patrones e insights con viñetas de cómic · Contabilidad MFB v2
 * Sustituye a renderInsights del original. Cada hallazgo sale como una viñeta con un
 * personaje de dibujo propio (hucha, carrito, hormiga, cohete…) y un bocadillo. */

const CM_INK = '#0a0e1a';
let cmUid = 0;

// ---------- Personajes (SVG, estilo cómic: trazo grueso y colores planos) ----------
const CM_ART = {
  pig: (m) => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<ellipse cx="90" cy="86" rx="52" ry="38" fill="#ff9ec7"/><path d="M52 62 L44 38 L70 54Z" fill="#ff7bb3"/>' +
    '<rect x="68" y="108" width="14" height="22" rx="5" fill="#ff7bb3"/><rect x="104" y="108" width="14" height="22" rx="5" fill="#ff7bb3"/>' +
    '<ellipse cx="136" cy="90" rx="14" ry="11" fill="#ff7bb3"/><circle cx="132" cy="90" r="2.5" fill="' + CM_INK + '"/><circle cx="141" cy="90" r="2.5" fill="' + CM_INK + '"/>' +
    '<path d="M72 68 h34" stroke-width="6"/><circle cx="118" cy="76" r="4.5" fill="' + CM_INK + '"/>' +
    (m === 'sad' ? '<path d="M120 100 q8 -7 16 0" fill="none"/><path d="M100 64 q-4 8 0 12" fill="#7fe0ff" stroke="#7fe0ff"/>' : '<path d="M120 100 q8 8 16 0" fill="none"/><circle cx="92" cy="30" r="13" fill="#ffd23f"/><text x="92" y="36" text-anchor="middle" font-size="16" font-weight="900" stroke="none" fill="' + CM_INK + '">€</text>') + '</g>',
  cart: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M30 40 h22 l18 62 h70 l14 -46 h-96" fill="#ffd23f"/><circle cx="82" cy="120" r="11" fill="#fff"/><circle cx="140" cy="120" r="11" fill="#fff"/>' +
    '<rect x="90" y="30" width="22" height="26" rx="4" fill="#00f0ff"/><rect x="118" y="38" width="18" height="18" rx="4" fill="#ff2d95"/><circle cx="76" cy="46" r="10" fill="#00ff88"/></g>',
  ant: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M60 108 l-14 18 M82 112 l-6 20 M104 112 l6 20 M126 108 l16 18" fill="none"/>' +
    '<ellipse cx="62" cy="88" rx="24" ry="20" fill="#ff7a2f"/><ellipse cx="102" cy="90" rx="18" ry="15" fill="#ff7a2f"/><circle cx="136" cy="76" r="20" fill="#ff7a2f"/>' +
    '<path d="M130 58 q-8 -18 -20 -22 M144 58 q4 -18 16 -24" fill="none"/><circle cx="141" cy="72" r="5" fill="#fff"/><circle cx="143" cy="72" r="2" fill="' + CM_INK + '"/>' +
    '<path d="M132 86 q8 6 14 0" fill="none"/><circle cx="46" cy="64" r="9" fill="#ffd23f"/></g>',
  up: () => CM_BURST('#ff2d95') + '<path d="M90 112 V52 M66 76 L90 48 L114 76" fill="none" stroke="' + CM_INK + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M90 112 V52 M66 76 L90 48 L114 76" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  down: () => CM_BURST('#00ff88') + '<path d="M90 48 V108 M66 84 L90 112 L114 84" fill="none" stroke="' + CM_INK + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M90 48 V108 M66 84 L90 112 L114 84" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
  trophy: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M62 30 h56 v30 a28 28 0 0 1 -56 0z" fill="#ffd23f"/><path d="M62 38 q-24 0 -20 20 q4 14 22 16 M118 38 q24 0 20 20 q-4 14 -22 16" fill="none"/>' +
    '<rect x="82" y="86" width="16" height="16" fill="#ffb300"/><rect x="64" y="102" width="52" height="14" rx="4" fill="#ffd23f"/><path d="M80 48 l6 8 l12 -14" fill="none" stroke-width="5"/></g>',
  calendar: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<rect x="42" y="34" width="96" height="86" rx="10" fill="#fff"/><path d="M42 58 h96" /><rect x="42" y="34" width="96" height="24" rx="10" fill="#ff2d95"/>' +
    '<path d="M64 26 v16 M116 26 v16" stroke-width="6"/><g fill="' + CM_INK + '" stroke="none"><circle cx="62" cy="78" r="4"/><circle cx="82" cy="78" r="4"/><circle cx="102" cy="78" r="4"/><circle cx="122" cy="78" r="4"/><circle cx="62" cy="98" r="4"/><circle cx="82" cy="98" r="4"/></g><circle cx="102" cy="98" r="9" fill="#00f0ff"/></g>',
  magnifier: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<circle cx="82" cy="68" r="34" fill="#bff4ff"/><path d="M106 94 L138 126" stroke-width="12"/><path d="M106 94 L138 126" stroke="#b026ff" stroke-width="6"/>' +
    '<text x="82" y="82" text-anchor="middle" font-size="40" font-weight="900" stroke="none" fill="' + CM_INK + '">?</text></g>',
  rocket: () => '<g stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">' +
    '<path d="M90 20 q30 24 22 70 h-44 q-8 -46 22 -70z" fill="#fff"/><circle cx="90" cy="58" r="11" fill="#00f0ff"/><path d="M68 78 l-20 24 l22 -6z M112 78 l20 24 l-22 -6z" fill="#ff2d95"/>' +
    '<path d="M76 90 q14 40 28 0z" fill="#ffd23f"/></g>'
};
function CM_BURST(color) {
  let p = ''; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 36 : 54; p += (i ? 'L' : 'M') + (90 + Math.cos(a) * r).toFixed(1) + ' ' + (80 + Math.sin(a) * r).toFixed(1); }
  return '<path d="' + p + 'Z" fill="' + color + '" stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round"/>';
}

function cmPanel(art, mood, bubble) {
  const id = 'cmh' + (++cmUid), bg = mood === 'warn' ? '#ffb84d' : mood === 'good' ? '#5ef2c0' : '#7fd4ff';
  const lines = String(bubble).split('|');
  const text = lines.map((l, i) => '<tspan x="237" dy="' + (i ? 24 : (lines.length > 1 ? 0 : 9)) + '">' + escapeHtml(l) + '</tspan>').join('');
  return '<svg viewBox="0 0 320 140" class="cm-svg" role="img" aria-hidden="true"><defs><pattern id="' + id + '" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.6" fill="' + CM_INK + '" opacity=".16"/></pattern></defs>' +
    '<rect x="2" y="2" width="316" height="136" rx="10" fill="' + bg + '" stroke="' + CM_INK + '" stroke-width="4"/><rect x="2" y="2" width="316" height="136" rx="10" fill="url(#' + id + ')"/>' +
    (CM_ART[art] || CM_ART.magnifier)(mood === 'warn' && art === 'pig' ? 'sad' : 'happy') +
    '<path d="M180 24 h108 a12 12 0 0 1 12 12 v44 a12 12 0 0 1 -12 12 h-66 l-26 22 l6 -22 h-14 a12 12 0 0 1 -12 -12 v-44 a12 12 0 0 1 12 -12z" fill="#fff" stroke="' + CM_INK + '" stroke-width="4" stroke-linejoin="round"/>' +
    '<text y="' + (lines.length > 1 ? 52 : 59) + '" text-anchor="middle" font-size="20" font-weight="900" font-style="italic" fill="' + CM_INK + '" font-family="Impact, \'Arial Black\', system-ui, sans-serif">' + text + '</text></svg>';
}

// ---------- Cálculo de los hallazgos (separado del dibujo) ----------
function cmMonthTx(y, m, maxDay) {
  const key = monthKey(y, m);
  return getAllTransactions().filter(t => t.date && t.date.startsWith(key) && (!maxDay || parseInt(t.date.slice(8, 10), 10) <= maxDay));
}
function cmSum(a, type) { return a.filter(t => t.type === type).reduce((s, t) => s + t.amount, 0); }
function cmGroup(a, f) { const o = {}; a.filter(t => t.type === 'expense').forEach(t => { const k = f(t); o[k] = (o[k] || 0) + t.amount; }); return o; }

function generateComicInsights() {
  const out = [], y = selectedYear, m = selectedMonth, now = new Date();
  const isNow = y === now.getFullYear() && m === now.getMonth();
  const cut = isNow ? now.getDate() : null;
  const dim = new Date(y, m + 1, 0).getDate();
  const cur = cmMonthTx(y, m), curCut = cut ? cmMonthTx(y, m, cut) : cur;
  const p = prevMonthOf(y, m), prevAll = cmMonthTx(p.y, p.m), prevCut = cmMonthTx(p.y, p.m, cut || undefined);
  const exp = cmSum(cur, 'expense'), inc = cmSum(cur, 'income'), expCut = cmSum(curCut, 'expense'), pexpCut = cmSum(prevCut, 'expense'), pexpAll = cmSum(prevAll, 'expense');
  if (!cur.length) return out;
  const label = MONTHS[m] + ' ' + y, f = fmtEUR;

  // 1. Ritmo / cierre del mes
  if (isNow && cut >= 5 && pexpAll > 0) {
    const proj = expCut / cut * dim, d = (proj - pexpAll) / pexpAll * 100;
    out.push({ mood: Math.abs(d) < 5 ? 'info' : d > 0 ? 'warn' : 'good', art: d > 5 ? 'rocket' : 'calendar', bubble: d > 5 ? '¡Vas|rápido!' : d < -5 ? '¡Vas|genial!' : 'Ritmo|normal',
      title: 'A este ritmo cerrarás en ' + f(proj), text: 'Llevas ' + f(expCut) + ' en ' + cut + ' días. ' + MONTHS[p.m] + ' cerró en ' + f(pexpAll) + (Math.abs(d) >= 5 ? ' (' + (d > 0 ? 'unos ' : 'unos ') + Math.abs(d).toFixed(0) + '% ' + (d > 0 ? 'más' : 'menos') + ').' : ', vas parecido.'), w: d > 5 ? 10 : 5 });
  } else if (!isNow && pexpAll > 0) {
    const d = (exp - pexpAll) / pexpAll * 100;
    out.push({ mood: d > 5 ? 'warn' : d < -5 ? 'good' : 'info', art: 'calendar', bubble: d > 5 ? '¡Más|gasto!' : d < -5 ? '¡Menos|gasto!' : 'Parecido',
      title: label + ' cerró en ' + f(exp), text: (Math.abs(d) < 5 ? 'Casi igual' : Math.abs(d).toFixed(0) + '% ' + (d > 0 ? 'más' : 'menos')) + ' que ' + MONTHS[p.m] + ' (' + f(pexpAll) + ').', w: 5 });
  }

  // 2 y 3. Categoría que más sube y que más baja (mismo tramo del mes anterior)
  const cc = cmGroup(curCut, t => t.category), pc = cmGroup(prevCut, t => t.category);
  let up = null, down = null;
  Object.keys(cc).forEach(k => { const pv = pc[k] || 0, d = cc[k] - pv; if (pv >= 30 && d > 25 && (!up || d > up.d)) up = { k, d, pv, v: cc[k] }; if (pv >= 30 && -d > 25 && (!down || -d > down.d)) down = { k, d: -d, pv, v: cc[k] }; });
  if (up) out.push({ mood: 'warn', art: 'up', bubble: '¡Sube!', title: up.k + ' sube ' + f(up.d), text: f(up.v) + ' frente a ' + f(up.pv) + ' en ' + MONTHS[p.m] + (cut ? ' (hasta el día ' + cut + ')' : '') + '.', w: 9, cat: up.k });
  if (down) out.push({ mood: 'good', art: 'down', bubble: '¡Baja!', title: down.k + ' baja ' + f(down.d), text: f(down.v) + ' frente a ' + f(down.pv) + ' en ' + MONTHS[p.m] + (cut ? ' (hasta el día ' + cut + ')' : '') + '.', w: 6, cat: down.k });

  // 4. Ahorro
  if (inc > 0 && !isNow || (isNow && inc > 0 && cut >= 10)) {
    const rate = (inc - exp) / inc * 100;
    out.push(rate >= 10
      ? { mood: 'good', art: 'pig', bubble: '¡A la|hucha!', title: 'Estás ahorrando el ' + rate.toFixed(0) + '%', text: 'De ' + f(inc) + ' ingresados te quedan ' + f(inc - exp) + '.', w: 7 }
      : rate >= 0 ? { mood: 'info', art: 'pig', bubble: 'Justito', title: 'Te sobra solo el ' + rate.toFixed(0) + '%', text: 'De ' + f(inc) + ' ingresados has gastado ' + f(exp) + '.', w: 6 }
        : { mood: 'warn', art: 'pig', bubble: '¡Hucha|vacía!', title: 'Gastas más de lo que ingresas', text: 'Ingresos ' + f(inc) + ' · gastos ' + f(exp) + ': faltan ' + f(-(inc - exp)) + '.', w: 11 });
  }

  // 5. Gastos hormiga (≤ 5 €)
  const small = curCut.filter(t => t.type === 'expense' && t.amount > 0 && t.amount <= 5);
  const smallSum = small.reduce((s, t) => s + t.amount, 0);
  if (small.length >= 8 && smallSum >= 20) out.push({ mood: 'info', art: 'ant', bubble: '¡Hormigas!', title: small.length + ' gastos pequeños suman ' + f(smallSum), text: 'Compras de 5 € o menos: ' + (expCut ? (smallSum / expCut * 100).toFixed(0) : 0) + '% de lo gastado este mes.', w: 5 });

  // 6. Comercio estrella
  const mer = {}; curCut.filter(t => t.type === 'expense' && t.subcategory && t.subcategory !== t.category && t.amount > 0).forEach(t => { const e = mer[t.subcategory] || (mer[t.subcategory] = { n: 0, v: 0 }); e.n++; e.v += t.amount; });
  const star = Object.keys(mer).sort((a, b) => mer[b].n - mer[a].n)[0];
  if (star && mer[star].n >= 4) out.push({ mood: 'info', art: 'cart', bubble: '¡Mi|favorito!', title: star + ': ' + mer[star].n + ' visitas', text: 'Has gastado ' + f(mer[star].v) + ' en total, ' + f(mer[star].v / mer[star].n) + ' de media por compra.', w: 4 });

  // 7. Día de la semana más caro (últimos 12 meses)
  const from = new Date(y, m - 11, 1), fromS = from.getFullYear() + '-' + String(from.getMonth() + 1).padStart(2, '0') + '-01';
  const toS = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(dim).padStart(2, '0');
  const dow = [0, 0, 0, 0, 0, 0, 0], dn = [0, 0, 0, 0, 0, 0, 0];
  getAllTransactions().filter(t => t.type === 'expense' && t.date >= fromS && t.date <= toS).forEach(t => { const k = (new Date(t.date + 'T00:00:00').getDay() + 6) % 7; dow[k] += t.amount; });
  for (let d = new Date(from); d <= new Date(y, m, dim); d.setDate(d.getDate() + 1)) dn[(d.getDay() + 6) % 7]++;
  const avg = dow.map((v, i) => dn[i] ? v / dn[i] : 0), maxI = avg.indexOf(Math.max(...avg)), tot = avg.reduce((a, b) => a + b, 0);
  const NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  if (tot > 0 && avg[maxI] / (tot / 7) >= 1.25) out.push({ mood: 'info', art: 'calendar', bubble: '¡Cuidado|con el ' + NAMES[maxI].slice(0, 3) + '!', title: 'Los ' + NAMES[maxI] + ' es cuando más gastas', text: 'En el último año, de media ' + f(avg[maxI]) + ' cada ' + NAMES[maxI].replace(/s$/, '') + ', un ' + ((avg[maxI] / (tot / 7) - 1) * 100).toFixed(0) + '% más que un día normal.', w: 3 });

  // 8. Datos por revisar
  if (typeof DataCheck !== 'undefined') {
    const c = DataCheck.findIssues(getAllTransactions(), categories).counts;
    const n = c.negatives + c.duplicateExtras + c.unknownSubGroups + c.tests;
    if (n > 0) out.push({ mood: 'info', art: 'magnifier', bubble: '¿Eso es|raro?', title: n + ' cosas que revisar en tus datos', text: 'Duplicados, importes negativos o pruebas. Mejor limpiarlos para que las cuentas salgan bien.', w: 8, action: 'review' });
  }
  return out.sort((a, b) => (b.w || 0) - (a.w || 0)).slice(0, 7);
}

function renderInsights() {
  const box = document.getElementById('insightsContent');
  const list = generateComicInsights();
  if (!list.length) { box.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🧠</div><div>Todavía no hay movimientos este mes para sacar conclusiones</div></div>'; return; }
  box.innerHTML = '<p class="cm-intro">' + MONTHS[selectedMonth] + ' ' + selectedYear + ' · ' + list.length + ' cosas que he visto</p>' + list.map(i =>
    '<div class="cm-card">' + cmPanel(i.art, i.mood, i.bubble) + '<h4>' + escapeHtml(i.title) + '</h4><p>' + escapeHtml(i.text) + '</p>' +
    (i.action === 'review' ? '<button class="rev-main" onclick="closeInsightsModal(); openReview()">🧹 Revisar datos</button>' :
      i.cat ? '<button class="rev-main sec" onclick="closeInsightsModal(); openCatHistory(\'' + i.cat.replace(/'/g, "\\'") + '\')">Ver movimientos de ' + escapeHtml(i.cat) + '</button>' : '') + '</div>').join('');
}
