/* ocr.js — OCR de tickets v2 · Contabilidad MFB
 * Mejoras sobre la versión anterior:
 *  - Prepara la imagen (escala de grises + contraste + tamaño) antes de leerla.
 *  - Un único motor Tesseract reutilizado (la 1ª vez descarga el idioma, luego es rápido).
 *  - Si no encuentra el total, reintenta con otro modo de lectura.
 *  - Detecta importe, fecha y comercio y propone categoría según tus movimientos.
 *  - Para tickets de Google Drive (sin permiso CORS) lee la imagen tal cual. */

let ocrWorker = null, ocrWorkerLoading = null, ocrLogCb = null;
let lastDetected = null;

function ocrSetStatus(text, percent) {
  const st = document.getElementById('ocrStatus');
  const fill = document.getElementById('ocrProgressFill');
  if (st && text) st.textContent = text;
  if (fill && typeof percent === 'number') fill.style.width = percent + '%';
}

async function getOcrWorker() {
  if (ocrWorker) return ocrWorker;
  if (!ocrWorkerLoading) {
    ocrWorkerLoading = Tesseract.createWorker('spa', 1, {
      logger: m => { if (ocrLogCb) ocrLogCb(m); }
    }).then(async w => {
      await w.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
      ocrWorker = w;
      return w;
    }).catch(err => { ocrWorkerLoading = null; throw err; });
  }
  return ocrWorkerLoading;
}

function loadImageForOcr(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('imagen no accesible'));
    img.src = src;
  });
}

// Escala de grises + estirado de contraste (percentiles 2–98) + tamaño ~1800 px
async function preprocessForOCR(src) {
  try {
    const img = await loadImageForOcr(src);
    const scale = Math.min(2, 1800 / Math.max(img.naturalWidth, 1));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h); // lanza error si la imagen no permite CORS
    const px = data.data, hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = g; hist[g]++;
    }
    const total = w * h;
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.02) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.02) { hi = i; break; } }
    const range = Math.max(hi - lo, 40);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    return c;
  } catch (e) {
    return src; // sin permiso para tocar la imagen: se lee tal cual
  }
}

async function recognizeWith(worker, source, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
  const r = await worker.recognize(source);
  return (r && r.data && r.data.text) || '';
}

// Devuelve { text, parsed } con el mejor de los dos modos de lectura
async function runOcr(source) {
  let worker;
  try {
    ocrLogCb = m => {
      if (m.status === 'recognizing text') ocrSetStatus('Leyendo ticket… ' + Math.round(m.progress * 100) + '%', Math.round(m.progress * 100));
      else if (/^loading/.test(m.status)) ocrSetStatus('Preparando el lector (solo la primera vez)… ' + Math.round((m.progress || 0) * 100) + '%');
    };
    worker = await getOcrWorker();
  } catch (e) {
    // Plan B: método antiguo
    const r = await Tesseract.recognize(source, 'spa');
    const text = r.data.text || '';
    return { text, parsed: TicketParser.parseTicketText(text) };
  }
  let text = await recognizeWith(worker, source, 4);   // columna de texto de tamaños variables
  let parsed = TicketParser.parseTicketText(text);
  if (parsed.total === null) {
    ocrSetStatus('Reintentando con otro modo de lectura…');
    const text2 = await recognizeWith(worker, source, 6); // bloque uniforme
    const parsed2 = TicketParser.parseTicketText(text2);
    if (parsed2.total !== null || text2.length > text.length) { text = text2; parsed = parsed2; }
  }
  return { text, parsed };
}

// Compatibilidad con el OCR masivo: devuelve { text, amount, date, merchant }
async function performOCR(imageUrl) {
  try {
    const source = await preprocessForOCR(imageUrl);
    const { text, parsed } = await runOcr(source);
    return { text, amount: parsed.total, date: parsed.date, merchant: parsed.merchant };
  } catch (error) {
    console.error('OCR Error:', error);
    return null;
  }
}

function showDetection(parsed, suggestion) {
  const box = document.getElementById('ocrDetectBox');
  const rows = [];
  if (parsed.total !== null) rows.push('💶 Total: <b>' + fmtEUR(parsed.total) + '</b>' + (parsed.confidence === 'low' ? ' <em>(poco seguro)</em>' : ''));
  if (parsed.date) rows.push('📅 Fecha: <b>' + parsed.date.split('-').reverse().join('/') + '</b>');
  if (parsed.merchant) rows.push('🏪 Comercio: <b>' + escapeHtml(parsed.merchant) + '</b>');
  if (suggestion) rows.push('🏷️ Categoría: <b>' + escapeHtml(suggestion.category) + ' → ' + escapeHtml(suggestion.subcategory) + '</b> <em>(según tus movimientos)</em>');
  if (!rows.length) { box.classList.remove('show'); return; }
  document.getElementById('ocrDetectRows').innerHTML = rows.map(r => '<div>' + r + '</div>').join('');
  box.classList.add('show');
}

function applyDetection() {
  if (!lastDetected) return;
  const { parsed, suggestion } = lastDetected;
  if (parsed.total !== null) document.getElementById('amount').value = parsed.total.toFixed(2);
  if (parsed.date) document.getElementById('date').value = parsed.date;
  const desc = document.getElementById('description');
  if (parsed.merchant && !desc.value.trim()) desc.value = parsed.merchant;
  if (suggestion) {
    selectType('expense');
    document.getElementById('category').value = suggestion.category;
    updateSubcategories();
    document.getElementById('subcategory').value = suggestion.subcategory;
  }
  document.getElementById('ocrDetectBox').classList.remove('show');
  showNotification('✓ Datos del ticket aplicados. Revísalos antes de guardar');
}

async function scanTicketInline() {
  const imageUrl = pendingImageUrl || document.getElementById('imageUrlInput').value.trim();
  if (!imageUrl) { showNotification('Primero añade una imagen del ticket', true); return; }
  const btn = document.getElementById('scanTicketBtn');
  const progress = document.getElementById('ocrProgress');
  const previewBox = document.getElementById('ocrPreviewBox');
  btn.disabled = true;
  progress.style.display = 'block';
  previewBox.classList.remove('show');
  document.getElementById('ocrDetectBox').classList.remove('show');
  ocrSetStatus('Preparando imagen…', 0);
  try {
    const source = await preprocessForOCR(convertToImageUrl(imageUrl));
    const { text, parsed } = await runOcr(source);
    progress.style.display = 'none';
    if (text && text.trim()) {
      document.getElementById('ocrPreviewText').value = text.trim();
      previewBox.classList.add('show');
      const suggestion = TicketParser.suggestFromHistory(text, TicketParser.buildMerchantIndex(transactions));
      lastDetected = { parsed, suggestion };
      showDetection(parsed, suggestion);
      showNotification(parsed.total !== null ? '✓ Ticket leído. Pulsa "Aplicar" para rellenar el formulario' : 'Texto leído, pero no he encontrado el total');
    } else {
      showNotification('No se pudo extraer texto del ticket', true);
    }
  } catch (error) {
    progress.style.display = 'none';
    showNotification('Error en OCR: ' + error.message, true);
  } finally {
    btn.disabled = false;
  }
}
