/* voice.js — dictado con confirmación y pregunta del ticket · Contabilidad MFB v2
 * Sustituye a startVoice del original. Flujo: hablas → se interpreta (VoiceParse) →
 * hoja de confirmación → "¿Tienes el ticket?" (foto) → guardar. Nunca guarda sin que lo confirmes. */

let voiceRec = null, voiceLast = null;

function voiceEnsureSheet() {
  if (document.getElementById('voiceSheet')) return;
  const d = document.createElement('div');
  d.id = 'voiceSheet'; d.className = 'voice-sheet';
  document.body.appendChild(d);
}

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showNotification('Este navegador no tiene dictado por voz. Usa Chrome en Android.', true); return; }
  if (voiceRec) { try { voiceRec.stop(); } catch (e) {} return; }
  voiceCloseSheet();
  const r = new SR(); voiceRec = r;
  r.lang = 'es-ES'; r.continuous = false; r.interimResults = false;
  const btn = document.getElementById('voiceBtn'), txt = document.getElementById('voiceText'), res = document.getElementById('voiceResult');
  btn.classList.add('listening'); txt.textContent = 'Escuchando… (toca para parar)';
  r.onresult = e => {
    const said = e.results[0][0].transcript;
    res.textContent = '🎤 "' + said + '"'; res.classList.add('show');
    voiceHandle(said);
  };
  r.onerror = e => showNotification(e.error === 'not-allowed' ? 'Permite el micrófono en el navegador' : e.error === 'no-speech' ? 'No te he oído' : 'Error de voz: ' + e.error, true);
  r.onend = () => { voiceRec = null; btn.classList.remove('listening'); txt.textContent = 'Dictar transacción completa'; };
  r.start();
}

function voiceQuick() { openModal(); setTimeout(startVoice, 250); }

function voiceHandle(said) {
  const p = VoiceParse.parse(said, categories, new Date());
  voiceLast = p;
  selectType(p.type);
  if (p.amount != null) document.getElementById('amount').value = p.amount;
  document.getElementById('description').value = p.description || '';
  document.getElementById('date').value = p.date;
  if (p.category) {
    document.getElementById('category').value = p.category; updateSubcategories();
    if (p.subcategory) document.getElementById('subcategory').value = p.subcategory;
  }
  voiceShowSheet(p);
}

function voiceShowSheet(p) {
  voiceEnsureSheet();
  const missing = [];
  if (p.amount == null || !(p.amount > 0)) missing.push('el importe');
  if (!p.category) missing.push('la categoría');
  const row = (k, v, warn) => '<div class="vs-row' + (warn ? ' warn' : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  const dtxt = new Date(p.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  document.getElementById('voiceSheet').innerHTML =
    '<div class="vs-card"><div class="vs-heard">🎤 “' + escapeHtml(p.heard) + '”</div>' +
    row('Tipo', p.type === 'income' ? '📈 Ingreso' : '📉 Gasto') +
    row('Importe', p.amount != null ? (p.type === 'income' ? '+' : '-') + fmtEUR(p.amount) : '¿?', p.amount == null) +
    row('Categoría', p.category ? escapeHtml(p.category) + (p.subcategory ? ' → ' + escapeHtml(p.subcategory) : '') : '¿?', !p.category) +
    row('Fecha', escapeHtml(dtxt)) + row('Descripción', escapeHtml(p.description || '—')) +
    (missing.length ? '<div class="vs-warn">Falta ' + missing.join(' y ') + '. Pulsa Corregir y complétalo en el formulario.</div>' :
      '<div class="vs-ask">¿Tienes el ticket?</div>' +
      '<div class="vs-btns"><button onclick="voiceTicket()">📷 Sí, hacer foto</button><button class="ok" onclick="voiceSave()">💾 No, guardar</button></div>') +
    '<div class="vs-btns"><button class="sec" onclick="voiceCloseSheet()">✏️ Corregir</button><button class="sec" onclick="voiceCloseSheet(); startVoice()">🎤 Repetir</button></div></div>';
  document.getElementById('voiceSheet').classList.add('active');
}
function voiceCloseSheet() { const s = document.getElementById('voiceSheet'); if (s) s.classList.remove('active'); }
function voiceTicket() { voiceCloseSheet(); showImageChoice('transaction'); showNotification('Haz la foto y pulsa AGREGAR cuando esté cargada'); }
function voiceSave() { voiceCloseSheet(); saveTransaction(); }
