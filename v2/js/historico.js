/* historico.js — pantalla única de histórico · Contabilidad MFB v2
 * Sustituye a "Ver todos los movimientos" y "Ver histórico 2022-2026".
 * Filtros (texto, año, mes, categoría, subcategoría, tipo), totales, gráfico que se
 * puede tocar para bajar de año → mes → día, lista por páginas y exportación a CSV. */

const HIST_PAGE = 80;
let hist = { q: '', year: '', month: '', cat: '', sub: '', type: 'all', shown: HIST_PAGE };
let histChartObj = null, histIsOpen = false, histQTimer = null, histLevel = 'year', histLabels = [];

function hnorm(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function hDate(d) { const p = d.split('-'); return p[2] + '/' + p[1] + '/' + p[0].slice(2); }
function hN(n) { return Number(n).toLocaleString('es-ES', { useGrouping: 'always' }); }

function openHistorico(opts) {
  opts = opts || {};
  hist = Object.assign({ q: '', year: '', month: '', cat: '', sub: '', type: 'all', shown: HIST_PAGE }, opts.filters || {});
  document.getElementById('histOverlay').classList.add('active');
  histIsOpen = true;
  document.getElementById('histQ').value = hist.q;
  histRender();
  document.getElementById('histBody').scrollTop = 0;
  if (opts.focusSearch) setTimeout(() => document.getElementById('histQ').focus(), 150);
}
function closeHistorico() {
  document.getElementById('histOverlay').classList.remove('active');
  histIsOpen = false;
  if (histChartObj) { histChartObj.destroy(); histChartObj = null; }
}
function histRefresh() { if (histIsOpen) histRender(); }

function histFiltered() {
  const q = hnorm(hist.q).trim();
  const mm = hist.month === '' ? '' : String(Number(hist.month) + 1).padStart(2, '0');
  return getAllTransactions().filter(t => {
    if (hist.type !== 'all' && t.type !== hist.type) return false;
    if (hist.year && t.date.slice(0, 4) !== hist.year) return false;
    if (mm && t.date.slice(5, 7) !== mm) return false;
    if (hist.cat && t.category !== hist.cat) return false;
    if (hist.sub && (t.subcategory || t.category) !== hist.sub) return false;
    if (q && !hnorm(t.description + ' ' + t.category + ' ' + (t.subcategory || '') + ' ' + t.amount).includes(q)) return false;
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date) || ((b.id || 0) - (a.id || 0)));
}

function histSet(field, value) {
  hist[field] = value;
  if (field === 'cat') hist.sub = '';
  hist.shown = HIST_PAGE;
  histRender();
}
function histSearchInput() {
  clearTimeout(histQTimer);
  histQTimer = setTimeout(() => { hist.q = document.getElementById('histQ').value; hist.shown = HIST_PAGE; histRender(); }, 220);
}
// ◀ ▶ de año y de mes: recorren "Todos" + valores, dando la vuelta al llegar al final
function histStepYear(d) {
  const ys = [...new Set(getAllTransactions().map(t => t.date.slice(0, 4)))].sort();
  const list = [''].concat(ys);
  const i = list.indexOf(hist.year);
  hist.year = list[(Math.max(i, 0) + d + list.length) % list.length];
  hist.shown = HIST_PAGE;
  histRender();
}
function histStepMonth(d) {
  const i = hist.month === '' ? 0 : Number(hist.month) + 1;
  const n = (i + d + 13) % 13;
  hist.month = n === 0 ? '' : String(n - 1);
  hist.shown = HIST_PAGE;
  histRender();
}
function histClear() {
  hist = { q: '', year: '', month: '', cat: '', sub: '', type: 'all', shown: HIST_PAGE };
  document.getElementById('histQ').value = '';
  histRender();
}
function histMore() { hist.shown += HIST_PAGE; histRender(false); }
function histView(id) { viewTransaction(id, 'hist'); }

function histFillSelects(all) {
  const years = [...new Set(all.map(t => t.date.slice(0, 4)))].sort().reverse();
  const cats = [...new Set(all.map(t => t.category))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
  const subs = hist.cat ? [...new Set(all.filter(t => t.category === hist.cat).map(t => t.subcategory || t.category))].sort((a, b) => a.localeCompare(b, 'es')) : [];
  const opt = (v, l, sel) => '<option value="' + escapeHtml(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + escapeHtml(l) + '</option>';
  document.getElementById('histYearLbl').textContent = hist.year || 'Todos';
  document.getElementById('histMonthLbl').textContent = hist.month !== '' ? MONTHS[Number(hist.month)] : 'Todos';
  document.getElementById('histCat').innerHTML = opt('', 'Todas las categorías', hist.cat) + cats.map(c => opt(c, c, hist.cat)).join('');
  const subSel = document.getElementById('histSub');
  subSel.disabled = !hist.cat;
  subSel.innerHTML = opt('', hist.cat ? 'Todas las subcategorías' : 'Subcategoría', hist.sub) + subs.map(s => opt(s, s, hist.sub)).join('');
  document.querySelectorAll('#histTypes .filter-chip').forEach(b => b.classList.toggle('active', b.dataset.filter === hist.type));
}

function histRender(keepPage) {
  const all = getAllTransactions();
  histFillSelects(all);
  histRenderArchive();
  const list = histFiltered();

  let inc = 0, exp = 0;
  list.forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
  const bal = inc - exp;
  document.getElementById('histSummary').innerHTML =
    '<div class="hs inc"><span>INGRESOS</span><b>+' + fmtEUR(inc) + '</b></div>' +
    '<div class="hs exp"><span>GASTOS</span><b>-' + fmtEUR(exp) + '</b></div>' +
    '<div class="hs ' + (bal >= 0 ? 'pos' : 'neg') + '"><span>SALDO</span><b>' + (bal < 0 ? '-' : '') + fmtEUR(Math.abs(bal)) + '</b></div>' +
    '<div class="hs"><span>MOVIMIENTOS</span><b>' + hN(list.length) + '</b></div>';

  histRenderChart(list);

  const box = document.getElementById('histList');
  if (!list.length) {
    box.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔎</div><div>Nada con esos filtros</div></div>';
    document.getElementById('histMore').style.display = 'none';
    return;
  }
  const page = list.slice(0, hist.shown);
  box.innerHTML = page.map(t => {
    const sub = t.subcategory && t.subcategory !== t.category ? ' → ' + escapeHtml(t.subcategory) : '';
    const clip = (t.imageUrl || t.attachment) ? ' 📎' : '';
    return '<div class="hrow" onclick="histView(' + t.id + ')"><div class="hrow-date">' + hDate(t.date) + '</div>' +
      '<div class="hrow-info"><h4>' + escapeHtml(t.description) + '</h4><span>' + escapeHtml(t.category) + sub + clip + '</span></div>' +
      '<div class="activity-amount ' + (t.type === 'income' ? 'positive' : 'negative') + '">' + (t.type === 'income' ? '+' : '-') + fmtEUR(t.amount) + '</div></div>';
  }).join('');
  const rest = list.length - page.length;
  const more = document.getElementById('histMore');
  more.style.display = rest > 0 ? 'block' : 'none';
  more.textContent = 'Mostrar ' + Math.min(HIST_PAGE, rest) + ' más (' + hN(rest) + ' restantes)';
}

// ---------- Gráfico: años → meses → días ----------
function histRenderChart(list) {
  histLevel = !hist.year ? 'year' : (hist.month === '' ? 'month' : 'day');
  let labels = [], keyOf;
  if (histLevel === 'year') {
    labels = [...new Set(list.map(t => t.date.slice(0, 4)))].sort();
    keyOf = t => t.date.slice(0, 4);
  } else if (histLevel === 'month') {
    labels = MONTHS_SHORT.slice();
    keyOf = t => MONTHS_SHORT[Number(t.date.slice(5, 7)) - 1];
  } else {
    const dim = new Date(Number(hist.year), Number(hist.month) + 1, 0).getDate();
    for (let i = 1; i <= dim; i++) labels.push(String(i).padStart(2, '0'));
    keyOf = t => t.date.slice(8, 10);
  }
  histLabels = labels;
  const inc = labels.map(() => 0), exp = labels.map(() => 0);
  list.forEach(t => { const i = labels.indexOf(keyOf(t)); if (i >= 0) { if (t.type === 'income') inc[i] += t.amount; else exp[i] += t.amount; } });

  document.getElementById('histHint').textContent =
    histLevel === 'year' ? 'Toca una barra para ver ese año' : histLevel === 'month' ? 'Toca una barra para ver ese mes' : '';
  if (histChartObj) histChartObj.destroy();
  histChartObj = new Chart(document.getElementById('histChart').getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Ingresos', data: inc, backgroundColor: 'rgba(0,240,255,.7)', borderRadius: 3 },
      { label: 'Gastos', data: exp, backgroundColor: 'rgba(255,45,149,.7)', borderRadius: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: (e, els) => {
        if (!els.length || histLevel === 'day') return;
        const lab = histLabels[els[0].index];
        if (histLevel === 'year') hist.year = lab; else hist.month = String(MONTHS_SHORT.indexOf(lab));
        hist.shown = HIST_PAGE;
        histRender();
      },
      plugins: { legend: { labels: { color: '#8892a4', font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8892a4', font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 16 } },
        y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8892a4', font: { size: 9 } } } }
    }
  });
}

// ---------- Archivo (histórico anterior a la nube) ----------
function histRenderArchive() {
  const el = document.getElementById('histArchive');
  if (!archiveTx.length) {
    el.innerHTML = '<div class="arch-box"><b>📚 Histórico anterior sin cargar</b>' +
      '<p>Tus datos de la nube empiezan en 2025. Carga aquí el archivo 2022-2024: se guarda solo en este móvil, no se sube a ningún sitio.</p>' +
      '<div class="arch-btns"><button onclick="archiveFromRepo()">Importar del repositorio</button>' +
      '<button class="sec" onclick="document.getElementById(\'histFile\').click()">Elegir archivo…</button></div>' +
      '<input type="file" id="histFile" accept=".json,application/json" style="display:none" onchange="archiveFromFile(event)"></div>';
    return;
  }
  const old = archiveTx.filter(t => t.date < LIVE_START);
  const dates = old.map(t => t.date).sort();
  el.innerHTML = '<div class="arch-ok">📚 Archivo cargado: ' + hN(old.length) + ' movimientos' +
    (dates.length ? ' (' + hDate(dates[0]) + ' → ' + hDate(dates[dates.length - 1]) + ')' : '') +
    ' · <a onclick="archiveRemoveAsk()">quitar</a></div>';
}
function archiveAfterChange(msg) {
  invalidateAll();
  updateUI();
  histRender();
  showNotification(msg);
}
async function archiveFromRepo() {
  try {
    showNotification('Descargando histórico…');
    const r = await fetch('../datos-2022-2026.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('no encuentro datos-2022-2026.json en el repositorio (' + r.status + ')');
    const meta = await importArchive(await r.json());
    archiveAfterChange('✓ Histórico cargado: ' + hN(meta.count) + ' movimientos');
  } catch (e) { showNotification('Error: ' + e.message, true); }
}
function archiveFromFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = async () => {
    try {
      const meta = await importArchive(JSON.parse(rd.result));
      archiveAfterChange('✓ Histórico cargado: ' + hN(meta.count) + ' movimientos');
    } catch (e) { showNotification('Error: ' + e.message, true); }
  };
  rd.readAsText(f);
}
async function archiveRemoveAsk() {
  if (!confirm('¿Quitar el archivo histórico de este móvil? Tus datos de la nube no se tocan y podrás volver a cargarlo.')) return;
  await removeArchive();
  archiveAfterChange('Archivo quitado');
}

// ---------- CSV ----------
function exportHistCsv() {
  const list = histFiltered();
  const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const rows = [['Fecha', 'Tipo', 'Importe', 'Categoría', 'Subcategoría', 'Descripción', 'Ticket'].map(q).join(';')];
  list.forEach(t => rows.push([
    q(t.date), q(t.type === 'income' ? 'Ingreso' : 'Gasto'),
    ((t.type === 'income' ? 1 : -1) * t.amount).toFixed(2).replace('.', ','),
    q(t.category), q(t.subcategory || ''), q(t.description), q(t.imageUrl || '')].join(';')));
  const blob = new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'historico-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showNotification('✓ CSV con ' + hN(list.length) + ' movimientos');
}
