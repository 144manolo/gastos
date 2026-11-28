/* home.js — portada v2 · Contabilidad MFB
 * Sustituye a las funciones de portada del index.html original:
 * selector de 24 meses, saldo con comparativas, lista del mes por días,
 * deslizar para cambiar de mes y deslizar una fila para editar/borrar. */

// ---------- Utilidades ----------
function $(id) { return document.getElementById(id); }
function monthKey(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }
function fmtEUR(n) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + '€';
}
function prevMonthOf(y, m) { return m === 0 ? { y: y - 1, m: 11 } : { y: y, m: m - 1 }; }

// ---------- Meses (últimos 24, el más reciente primero) ----------
let monthList = [];
function buildMonthList() {
  const now = new Date();
  monthList = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthList.push({ y: d.getFullYear(), m: d.getMonth() });
  }
}
function populateMonthSelector() {
  buildMonthList();
  const sel = $('monthSelector');
  sel.innerHTML = '';
  monthList.forEach(({ y, m }) => {
    const o = document.createElement('option');
    o.value = y + '-' + m;
    o.textContent = MONTHS[m] + ' ' + y;
    if (y === selectedYear && m === selectedMonth) o.selected = true;
    sel.appendChild(o);
  });
}
function monthIndex() {
  return monthList.findIndex(x => x.y === selectedYear && x.m === selectedMonth);
}
// delta: -1 = mes anterior (más antiguo), +1 = mes siguiente (más reciente)
function changeMonth(delta, fromSwipe) {
  let i = monthIndex();
  if (i < 0) i = 0;
  const ni = i - delta;
  if (ni < 0 || ni >= monthList.length) { animateZone('bounce'); return; }
  selectedYear = monthList[ni].y;
  selectedMonth = monthList[ni].m;
  $('monthSelector').value = selectedYear + '-' + selectedMonth;
  closeOpenRow();
  animateZone(delta > 0 ? 'left' : 'right');
  if (fromSwipe) { try { localStorage.setItem('mfb_v2_swiped', '1'); } catch (e) {} hideSwipeHint(); }
  updateMonthDisplay();
}
function updateMonthDisplay() {
  const val = $('monthSelector').value;
  if (val) {
    const [y, m] = val.split('-').map(Number);
    selectedYear = y;
    selectedMonth = m;
  }
  $('currentMonthLabel').textContent = MONTHS_SHORT[selectedMonth] + ' ' + selectedYear;
  updateUI();
}
function getMonthTransactions() {
  const key = monthKey(selectedYear, selectedMonth);
  return getAllTransactions().filter(t => t.date && t.date.startsWith(key));
}

// ---------- Cálculos y comparativas ----------
// maxDay (opcional): solo cuenta hasta ese día del mes (para comparar con el mes en curso)
function monthStats(y, m, maxDay) {
  const key = monthKey(y, m);
  let inc = 0, exp = 0, n = 0, nAll = 0;
  for (const t of getAllTransactions()) {
    if (!t.date || !t.date.startsWith(key)) continue;
    nAll++;
    if (maxDay && parseInt(t.date.slice(8, 10), 10) > maxDay) continue;
    n++;
    if (t.type === 'income') inc += t.amount;
    else if (t.type === 'expense') exp += t.amount;
  }
  return { inc, exp, bal: inc - exp, n, nAll };
}

// Devuelve { cls, text } para un chip de comparación. goodWhenUp: true para ingresos/saldo.
function compareChip(label, curVal, ref, key, goodWhenUp, asMoney) {
  if (ref.nAll === 0) return '<span class="chip na"><i>' + label + '</i> sin datos</span>';
  const refVal = ref[key];
  const diff = curVal - refVal;
  if (Math.abs(diff) < 0.005) return '<span class="chip neutral"><i>' + label + '</i> =</span>';
  const up = diff > 0;
  const good = up === goodWhenUp;
  const arrow = up ? '▲' : '▼';
  let txt;
  if (asMoney) txt = balanceVisible ? fmtEUR(Math.abs(diff)) : '****';
  else if (refVal === 0) txt = '—';
  else txt = Math.abs(diff / refVal * 100).toFixed(0) + '%';
  return '<span class="chip ' + (good ? 'good' : 'bad') + '"><i>' + label + '</i> ' + arrow + ' ' + txt + '</span>';
}

// ---------- Portada: saldo, ingresos, gastos ----------
function renderHero() {
  const cur = monthStats(selectedYear, selectedMonth);
  const p = prevMonthOf(selectedYear, selectedMonth);
  // En el mes en curso se compara hasta el mismo día (no contra el mes anterior completo)
  const now = new Date();
  const cut = (selectedYear === now.getFullYear() && selectedMonth === now.getMonth()) ? now.getDate() : null;
  const prev = monthStats(p.y, p.m, cut);
  const yoy = monthStats(selectedYear - 1, selectedMonth, cut);
  $('cutNote').textContent = cut ? 'Comparativa hasta el día ' + cut + ' de cada mes' : '';
  realBalance = cur.bal; realIncome = cur.inc; realExpense = cur.exp;

  const prevLabel = MONTHS_SHORT[p.m];
  const yoyLabel = MONTHS_SHORT[selectedMonth] + ' ' + String(selectedYear - 1).slice(2);
  const vis = balanceVisible;

  $('toggleBalanceBtn').textContent = vis ? '🙈' : '👁️';
  const bal = $('totalBalance');
  bal.textContent = vis ? fmtEUR(cur.bal) : '****';
  bal.classList.toggle('neg', vis && cur.bal < 0);
  $('totalIncome').textContent = vis ? '+' + fmtEUR(cur.inc) : '+****';
  $('totalExpense').textContent = vis ? '-' + fmtEUR(cur.exp) : '-****';

  $('balanceChips').innerHTML =
    compareChip('vs ' + prevLabel, cur.bal, prev, 'bal', true, true) +
    compareChip('vs ' + yoyLabel, cur.bal, yoy, 'bal', true, true);
  $('incomeChips').innerHTML =
    compareChip(prevLabel, cur.inc, prev, 'inc', true, false) +
    compareChip(yoyLabel, cur.inc, yoy, 'inc', true, false);
  $('expenseChips').innerHTML =
    compareChip(prevLabel, cur.exp, prev, 'exp', false, false) +
    compareChip(yoyLabel, cur.exp, yoy, 'exp', false, false);

  // Barra: qué parte de lo ingresado se ha gastado
  const fill = $('ratioFill'), txt = $('ratioText');
  if (cur.n === 0) { fill.style.width = '0%'; txt.textContent = 'Sin movimientos este mes'; return; }
  if (cur.inc <= 0) {
    fill.style.width = cur.exp > 0 ? '100%' : '0%';
    fill.className = 'ratio-fill bad';
    txt.textContent = cur.exp > 0 ? 'Sin ingresos este mes' : '';
    return;
  }
  const pct = cur.exp / cur.inc * 100;
  fill.style.width = Math.min(100, pct) + '%';
  fill.className = 'ratio-fill ' + (pct > 100 ? 'bad' : pct > 85 ? 'warn' : 'good');
  txt.textContent = 'Gastado: ' + pct.toFixed(0) + '% de lo ingresado';
}

function toggleBalanceVisibility() {
  balanceVisible = !balanceVisible;
  renderHero();
}

function updateUI() {
  renderHero();
  renderList();
  if (chartExpanded) { if (chartMode === 'cats') renderCatPanel(); else updateCharts(); }
  updateBudgetAlert();
  updateReviewBadge();
  if (typeof histRefresh === 'function') histRefresh();
  if (typeof reviewRefresh === 'function') reviewRefresh();
}

// Punto rojo en el menú si hay datos que revisar
function updateReviewBadge() {
  const b = $('reviewBadge');
  if (!b || typeof DataCheck === 'undefined') return;
  const c = DataCheck.findIssues(getAllTransactions(), categories).counts;
  const n = c.zeros + c.negatives + c.duplicateExtras + c.unknownSubGroups + c.noSub + c.tests + archiveOnlyRecent().length;
  b.textContent = n > 0 ? n : '';
  b.style.display = n > 0 ? 'inline-block' : 'none';
}

// ---------- Lista del mes, agrupada por día ----------
function dayHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  let s = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderList() {
  const list = $('activityList');
  const items = getFilteredTransactions(getMonthTransactions())
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || ((b.id || 0) - (a.id || 0)));
  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💳</div><div>Sin movimientos este mes</div></div>';
    return;
  }
  let html = '', day = null, buf = '', dayNet = 0;
  const flush = () => {
    if (day === null) return;
    const cls = dayNet >= 0 ? 'pos' : 'neg';
    html += '<div class="mfb-day"><div class="mfb-day-head"><span>' + dayHeader(day) + '</span><span class="mfb-day-total ' + cls + '">' +
      (dayNet >= 0 ? '+' : '-') + fmtEUR(Math.abs(dayNet)) + '</span></div>' + buf + '</div>';
  };
  for (const t of items) {
    if (t.date !== day) { flush(); day = t.date; buf = ''; dayNet = 0; }
    dayNet += t.type === 'income' ? t.amount : -t.amount;
    const sub = t.subcategory && t.subcategory !== t.category ? ' → ' + escapeHtml(t.subcategory) : '';
    const clip = (t.imageUrl || t.attachment) ? ' 📎' : '';
    buf += '<div class="swipe-row">' +
      '<div class="swipe-actions"><button class="sa-edit" onclick="closeOpenRow();editTransaction(' + t.id + ')">✏️</button>' +
      '<button class="sa-del" onclick="closeOpenRow();deleteTransaction(' + t.id + ')">🗑️</button></div>' +
      '<div class="activity-item" onclick="rowTap(' + t.id + ')">' +
      '<div class="activity-info"><h4>' + escapeHtml(t.description) + '</h4><span>' + escapeHtml(t.category) + sub + clip + '</span></div>' +
      '<div class="activity-amount ' + (t.type === 'income' ? 'positive' : 'negative') + '">' +
      (t.type === 'income' ? '+' : '-') + fmtEUR(t.amount) + '</div></div></div>';
  }
  flush();
  list.innerHTML = html;
  openRow = null;
}

// ---------- Gráfico y búsqueda (barra de herramientas) ----------
let chartMode = 'evol';
function toggleChart() {
  chartExpanded = !chartExpanded;
  $('chartCard').style.display = chartExpanded ? 'block' : 'none';
  $('chartBtn').classList.toggle('active', chartExpanded);
  if (chartExpanded) setTimeout(() => setChartMode(chartMode), 50);
}
function setChartMode(mode) {
  chartMode = mode;
  document.querySelectorAll('#chartTabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('chartContainer').style.display = mode === 'evol' ? 'block' : 'none';
  $('catPanel').style.display = mode === 'cats' ? 'block' : 'none';
  if (mode === 'evol') updateCharts(); else renderCatPanel();
}
// Gastos del mes por categoría, con variación frente al mes anterior y al mismo mes del año pasado
function catTotals(y, m, maxDay) {
  const key = monthKey(y, m), o = {};
  for (const t of getAllTransactions()) {
    if (t.type !== 'expense' || !t.date || !t.date.startsWith(key)) continue;
    if (maxDay && parseInt(t.date.slice(8, 10), 10) > maxDay) continue;
    o[t.category] = (o[t.category] || 0) + t.amount;
  }
  return o;
}
function renderCatPanel() {
  const now = new Date();
  const cut = (selectedYear === now.getFullYear() && selectedMonth === now.getMonth()) ? now.getDate() : null;
  const cur = catTotals(selectedYear, selectedMonth);
  const p = prevMonthOf(selectedYear, selectedMonth);
  const prev = catTotals(p.y, p.m, cut), yoy = catTotals(selectedYear - 1, selectedMonth, cut);
  const curCmp = cut ? catTotals(selectedYear, selectedMonth, cut) : cur;
  const rows = Object.keys(cur).map(c => ({ c, v: cur[c] })).filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  const total = rows.reduce((s, r) => s + r.v, 0);
  const box = $('catPanel');
  if (!rows.length) { box.innerHTML = '<div class="empty-state"><div>Sin gastos este mes</div></div>'; return; }
  const delta = (v, ref) => {
    if (!ref) return '<span class="cd na">nuevo</span>';
    const d = v - ref;
    if (Math.abs(d) < 0.005) return '<span class="cd">=</span>';
    return '<span class="cd ' + (d > 0 ? 'bad' : 'good') + '">' + (d > 0 ? '▲' : '▼') + Math.abs(d / ref * 100).toFixed(0) + '%</span>';
  };
  const max = rows[0].v;
  box.innerHTML = '<div class="cat-head"><span>CATEGORÍA</span><span>vs ' + MONTHS_SHORT[p.m] + '</span><span>vs ' + String(selectedYear - 1).slice(2) + '</span></div>' +
    rows.map(r => '<div class="cat-row" onclick="openCatHistory(\'' + r.c.replace(/'/g, "\\'") + '\')">' +
      '<div class="cat-top"><b>' + escapeHtml(r.c) + '</b><span>' + fmtEUR(r.v) + ' · ' + (r.v / total * 100).toFixed(0) + '%</span>' +
      delta(curCmp[r.c] || 0, prev[r.c]) + delta(curCmp[r.c] || 0, yoy[r.c]) + '</div>' +
      '<div class="cat-bar"><i style="width:' + (r.v / max * 100) + '%"></i></div></div>').join('') +
    '<div class="cat-foot">Toca una categoría para ver sus movimientos' + (cut ? ' · variación hasta el día ' + cut : '') + '</div>';
}
function openCatHistory(cat) {
  openHistorico({ filters: { year: String(selectedYear), month: String(selectedMonth), cat, type: 'expense' } });
}
function openAllFromToolbar() { openHistorico({ focusSearch: true }); }

// ---------- Gestos ----------
const ACT_W = 116;
let openRow = null, swipedAt = 0;

function closeOpenRow() {
  if (openRow) { openRow.style.transform = ''; openRow = null; }
}
function rowTap(id) {
  if (Date.now() - swipedAt < 350) return;
  if (openRow) { closeOpenRow(); return; }
  viewTransaction(id, 'list-' + currentFilter);
}
function animateZone(kind) {
  const z = $('swipeZone');
  z.classList.remove('anim-left', 'anim-right', 'anim-bounce');
  void z.offsetWidth;
  z.classList.add('anim-' + kind);
}
function hideSwipeHint() {
  const h = $('swipeHint');
  if (h) h.style.display = 'none';
}

(function initGestures() {
  const zone = $('swipeZone');
  let sx = 0, sy = 0, st = 0, mode = null, rowItem = null, curX = 0;

  zone.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now(); mode = null; curX = 0;
    rowItem = e.target.closest('.swipe-row .activity-item');
    if (openRow && openRow !== rowItem) closeOpenRow();
  }, { passive: true });

  zone.addEventListener('touchmove', e => {
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (mode === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      mode = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'h' : 'v';
    }
    if (mode === 'h' && rowItem) {
      const base = rowItem === openRow ? -ACT_W : 0;
      curX = Math.max(-ACT_W - 24, Math.min(0, base + dx));
      rowItem.style.transition = 'none';
      rowItem.style.transform = 'translateX(' + curX + 'px)';
    }
  }, { passive: true });

  zone.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (mode === 'h') {
      swipedAt = Date.now();
      if (rowItem) {
        rowItem.style.transition = '';
        if (curX < -ACT_W / 2) { rowItem.style.transform = 'translateX(' + (-ACT_W) + 'px)'; openRow = rowItem; }
        else { rowItem.style.transform = ''; if (openRow === rowItem) openRow = null; }
      } else if (Math.abs(dx) > 70 && Date.now() - st < 800) {
        changeMonth(dx < 0 ? 1 : -1, true);
      }
    }
    mode = null; rowItem = null;
  }, { passive: true });
})();

// ---------- Arranque de la portada ----------
(function initHomeExtras() {
  try { if (localStorage.getItem('mfb_v2_swiped')) hideSwipeHint(); } catch (e) {}
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' }).catch(err => console.log('SW:', err));
    });
  }
})();
