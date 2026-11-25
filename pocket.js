/* Aisle Nine Pocket: scan and check in the aisle. Everything stays on this phone until you send it to your PC. */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], f = $('#f'), els = f.elements;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = Fees.num, usd = (v, sign) => { v = num(v); return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + '$' + Math.abs(v).toFixed(2); };
const mem = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('This phone would not save it. Send your leads to the PC'); return false; } };
let settings = (s => { if (!mem('goals-2026-11', false)) { if (s.minProfit === 4) s.minProfit = 5; if (s.minRoi === 35) s.minRoi = 30; try { localStorage.setItem('settings', JSON.stringify(s)); localStorage.setItem('goals-2026-11', 'true'); } catch { /* private mode */ } } return { ...Fees.DEFAULTS, ...s }; })(mem('settings', {})), leads = mem('leads', []), pc = mem('pc', ''), asking = mem('asking', []), item = {}, editing = null, toastTimer;

function toast(text, action, fn) {
  const t = $('#toast'); t.innerHTML = `<span>${esc(text)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('on'); fn(); };
  t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), action ? 6000 : 2800);
}
const state = (t, cls = 'blue') => { $('#state').textContent = t; $('#state').className = 'note ' + cls; };
const pic = src => src ? `<img alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc(src)}">` : '';

/* ---------- the check ---------- */
els.cat.innerHTML = Object.entries(Fees.CATS).map(([k, v]) => [k, v[0]]).sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('');
const values = () => { const o = { ...item }; for (const e of els) if (e.name && (e.type !== 'radio' || e.checked)) o[e.name] = e.type === 'checkbox' ? e.checked : e.value.trim(); o.oz = num(o.lb) * 16; o.sizeGuess = !!o.how; delete o.how; return o; };
// generous on purpose: a size that is guessed too small hides fees
const SIZES = { flat: [10, 7, .7, .5], book: [9, 6, 2, 1.1], shoe: [13, 8, 5, 3], big: [18, 14, 8, 7] };
function clearForm(keepCode) {
  item = {}; editing = null;
  for (const e of els) { if (!e.name || e.name === 'store' || (keepCode && e.name === 'code')) continue; if (e.type === 'radio') e.checked = e.value === ''; else if (e.type === 'checkbox') e.checked = false; else e.value = e.name === 'cat' ? 'other' : ''; }
  $('#found').innerHTML = ''; state(''); show();
  if (!keepCode) keep('draft', null);
}
function show() {
  const x = values(), r = Fees.check(x, settings), c = Codes.read(x.code);
  const paid = num(x.cost) > 0, reasons = list => `<ul class="reasons">${list.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>`;
  // The big number is what you compare with the shelf tag, so it shows as soon as the Amazon price is in.
  $('#out').innerHTML = !r.verdict && r.priceUsed ? `<div class="hero none"><div><div class="soft">Pay at most, each</div><div class="big">${usd(r.maxCost)}</div></div></div>
    <p class="soft">Meets your $${num(settings.minProfit)}, ${num(settings.minRoi)}% and ${num(settings.minMargin)}% goals at ${usd(r.priceUsed)} on Amazon. Tag above it: walk on. Tag well below: type it to check the rest.</p>${reasons(r.info.map(t => ['blue', t]))}`
    : !r.verdict ? '<p class="soft">Add the Amazon price to see the most you can pay. Add the shelf price for the full answer. It works with no signal.</p>'
    : `<div class="hero ${r.verdict}"><div><div class="soft">${paid ? 'Profit each' : 'Verdict'}</div><div class="big">${paid ? usd(r.profit, 1) : 'Skip it'}</div></div><span class="chip ${r.verdict}">${r.verdict}</span></div>
    ${paid ? `<div class="flow"><div><span class="soft">Pay at most</span><strong>${usd(r.maxCost)}</strong></div><div><span class="soft">Return</span><strong>${Math.round(r.roi)}%</strong></div><div><span class="soft">Shelf vs Amazon</span><strong>${Math.round(r.costPct)}%</strong></div><div><span class="soft">If price drops ${r.stress || 10}%</span><strong>${usd(r.stress ? r.dropS : r.drop10, 1)}</strong></div></div>` : ''}
    <ul class="reasons">${[...r.no.map(t => ['bad', t]), ...r.warn.map(t => ['maybe', t]), ...r.info.map(t => ['blue', t]), ...r.good.map(t => ['good', t])].map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>${r.ratesOld ? '<p class="soft">These are 2026 fees. Check for an update.</p>' : ''}`;
  const asin = item.asin || c.asin, isCode = ['upc', 'ean', 'isbn'].includes(c.type), word = isCode ? c.value : item.title || (c.type === 'text' ? c.value : ''), enc = encodeURIComponent, q = enc(word), shared = /^https:\/\/(a\.co|amzn\.)/.test(item.url || '') ? item.url : '';
  const main = asin ? ['Open it on Amazon', `https://www.amazon.com/dp/${enc(asin)}`] : shared ? ['Open it on Amazon', shared] : q ? [isCode ? 'Search Amazon for this barcode' : 'Search Amazon', `https://www.amazon.com/s?k=${q}`] : null;
  $('#amz').hidden = !main;
  if (main) { $('#amzGo').textContent = main[0]; $('#amzGo').href = main[1]; }
  // Keepa opens the product by ASIN, or its search by barcode or name, so the 90-day low is one tap away.
  const kp = asin ? `https://keepa.com/#!product/1-${enc(asin)}` : q ? `https://keepa.com/#!search/1-${q}` : ''; $('#keepaGo').hidden = !kp; if (kp) $('#keepaGo').href = kp;
  const named = item.title && isCode, nm = $('#amzName'); nm.textContent = named ? 'Search by name' : 'Search Google'; nm.href = named ? `https://www.amazon.com/s?k=${enc(item.title.slice(0, 90))}` : `https://www.google.com/search?q=${enc('amazon ' + word)}`;
  const list = [asin && ['Can I sell it?', `https://sellercentral.amazon.com/abis/listing/syh?asin=${enc(asin)}`], asin && ['Price history', `https://camelcamelcamel.com/product/${enc(asin)}`], q && ['eBay sold', `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`]].filter(Boolean);
  $('#links').innerHTML = list.map(([n, u]) => `<a class="btn slim" target="_blank" rel="noopener" href="${u}">${n}</a>`).join('');
  if (x.code || x.cost || x.price) keep('draft', { t: Date.now(), form: rawForm(), item, editing, lastKey });
}
/* iPhone can drop this page while you are in Amazon, so the item in progress is kept and put back */
const rawForm = () => { const o = {}; for (const e of els) if (e.name && (e.type !== 'radio' || e.checked)) o[e.name] = e.type === 'checkbox' ? e.checked : e.value; return o; };
function putForm(o) { for (const e of els) { if (!e.name || !(e.name in o)) continue; if (e.type === 'radio') e.checked = e.value === String(o[e.name]); else if (e.type === 'checkbox') e.checked = !!o[e.name]; else e.value = o[e.name]; } }
const showFound = () => { $('#found').innerHTML = item.title ? `${item.image ? `<span class="shot">${pic(item.image)}</span>` : ''}<strong>${esc(item.title)}</strong>` : ''; };

/* whatever was copied in Amazon: its link with the name, a price, a sales count, a rank, or a whole page */
function takeText(t) {
  t = t.trim(); if (!t) return state('Nothing is copied yet. In Amazon tap Share, then Copy', 'maybe');
  const mine = item.asin || Codes.read(els.code.value).asin, got = [], set = (k, v, n) => { els[k].value = v; got.push(n); };
  const bought = n => { const v = [...f.querySelectorAll('[name=bought]')], pick = n >= 1000 ? '1000' : n >= 200 ? '200' : n >= 50 ? '50' : '0'; v.forEach(e => { e.checked = e.value === pick; }); got.push('recent sales'); };
  if (Codes.isPage(t)) {
    const p = Codes.page(t);
    if (p.asin && mine && p.asin !== mine) return state('That page is a different product from the one you scanned', 'bad');
    if (p.asin) { item.asin = p.asin; got.push('ASIN'); } if (p.title) { item.title ||= p.title; } if (p.brand) item.brand ||= p.brand;
    for (const [k, n] of [['price', 'price'], ['rank', 'rank'], ['offers', 'sellers'], ['l', 'size'], ['w', ''], ['h', '']]) if (p[k]) set(k, p[k], n);
    if (p.oz) set('lb', Fees.r2(p.oz / 16), 'weight'); if (p.l) f.querySelector('[name=how][value=""]').checked = true; if (p.cat) els.cat.value = p.cat; if (p.bought) bought(p.bought); if (p.amazonSells) { els.amazonSells.checked = true; got.push('Amazon is a seller'); }
  } else {
    const c = Codes.read(t), url = (t.match(/https?:\/\/\S+/) || [''])[0], before = t.slice(0, url ? t.indexOf(url) : 0).replace(/^(check (this )?out|look at this)[:!\s-]*/i, '').replace(/[\s:|-]+$/, '').trim();
    if (c.type === 'asin' || c.type === 'isbn' || c.type === 'short') {
      if (c.asin && mine && c.asin !== mine) return state('That link is a different product from the one you scanned. Tap New item first if you meant to switch', 'bad');
      if (c.asin) { item.asin = c.asin; got.push('ASIN'); } if (url) item.url = url;
      const name = before.length > 5 ? before : c.name || ''; if (name) { item.title = name.slice(0, 200); got.push('name'); const k = Codes.category(name); if (k && els.cat.value === 'other') els.cat.value = k; }
      if (!els.code.value) { els.code.value = c.asin || t; lastKey = keyOf(els.code.value); }
      if (!got.length && url) got.push('link');
    } else {
      const price = t.match(/^\$?\s?([\d,]{1,6}\.\d\d)$/) || t.match(/\$\s?([\d,]{1,6}\.\d\d)/), rank = t.match(/#\s?([\d,]+)\s+in\b/i), sold = t.match(/([\d.]+)(k?)\+?\s+bought/i);
      if (price) set('price', price[1].replace(/,/g, ''), 'price'); if (rank) set('rank', rank[1].replace(/,/g, ''), 'rank'); if (sold) bought(parseFloat(sold[1]) * (sold[2] ? 1000 : 1));
    }
  }
  showFound(); show();
  state(got.length ? `Filled in: ${[...new Set(got.filter(Boolean))].join(', ')}.${els.price.value ? ' Check the price.' : ''}` : 'That did not look like an Amazon link, price, rank or page', got.length ? 'good' : 'maybe');
}

/* ---------- product names, straight from free services ---------- */
async function get(url, ms = 7000) { const a = new AbortController(), t = setTimeout(() => a.abort(), ms); try { const r = await fetch(url, { signal: a.signal, credentials: 'omit' }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } }
async function nameOf(c) {
  const e = encodeURIComponent(c.value);
  if (c.type === 'isbn') { const r = (await get(`https://openlibrary.org/api/books?bibkeys=ISBN:${e}&format=json&jscmd=data`))?.[`ISBN:${c.value}`]; return r ? { title: r.title, brand: (r.authors || []).map(a => a.name).slice(0, 2).join(', '), image: r.cover?.medium || '', cat: 'media' } : null; }
  if (c.type === 'upc' || c.type === 'ean') {
    const facts = await Promise.all([['food', 'grocery'], ['beauty', 'beauty'], ['petfood', 'pets'], ['products', '']].map(async ([h, cat]) => { const p = (await get(`https://world.open${h}facts.org/api/v2/product/${e}.json?fields=product_name,brands,quantity,image_front_url`))?.product; if (!p?.product_name) return null; const b = (p.brands || '').split(',')[0].trim(); return { title: [b && !p.product_name.toLowerCase().includes(b.toLowerCase()) ? b : '', p.product_name, p.quantity].filter(Boolean).join(' '), brand: b, image: p.image_front_url || '', cat }; }));
    const hit = facts.find(Boolean); if (hit) return hit;
  }
  const field = { upc: 'barcode', ean: 'barcode', asin: 'asin' }[c.type], rs = field && (await get(`https://musicbrainz.org/ws/2/release/?query=${field}:${e}&fmt=json&limit=5`))?.releases;
  if (rs?.length) { const x = rs.find(y => y.asin) || rs[0], who = (x['artist-credit'] || []).map(a => a.name).join(' / '); return { title: `${who} - ${x.title}`, brand: who, asin: x.asin || '', image: `https://coverartarchive.org/release/${x.id}/front-250`, cat: 'media' }; }
  return null;
}
let no = 0, lastKey = '';
const keyOf = t => { const c = Codes.read(t); return c.value ? c.type + c.value : ''; };
async function look() {
  const c = Codes.read(els.code.value), mine = ++no; lastKey = keyOf(els.code.value);
  if (!c.value) return state('Scan or type a barcode first', 'maybe');
  if (c.type === 'bad') return state(c.why, 'bad');
  if (c.type === 'fnsku') return state('That is an Amazon warehouse label. Scan the product barcode instead', 'bad');
  if (c.type === 'short') return state('Short Amazon links only open in a browser. Open it, then copy the full address', 'maybe');
  item = { asin: c.asin || '', title: c.name || (c.type === 'text' ? c.value : ''), url: c.url || '' };
  if (c.store && !els.store.value) els.store.value = c.store;
  state('Looking for the name'); show();
  const i = ['upc', 'ean', 'isbn', 'asin'].includes(c.type) ? await nameOf(c) : null;
  if (mine !== no) return;
  if (i) { item = { ...item, ...i, asin: item.asin || i.asin || '' }; if (i.cat && els.cat.value === 'other') els.cat.value = i.cat; }
  showFound();
  state([c.note, item.title ? '' : navigator.onLine ? 'No free name for this one. Search Amazon below.' : 'No signal. The math still works.'].filter(Boolean).join(' '), item.title ? 'blue' : 'maybe');
  show();
}
f.addEventListener('input', e => {
  if (e.target.name === 'code') { const k = keyOf(els.code.value); if (k !== lastKey) { no++; const had = lastKey; lastKey = k; if (had) clearForm(true); else { item = {}; $('#found').innerHTML = ''; state(''); } } }
  if (e.target.name === 'how' && SIZES[e.target.value]) ['l', 'w', 'h', 'lb'].forEach((k, i) => { els[k].value = SIZES[e.target.value][i]; });
  if (e.target.name === 'how' && !e.target.value) ['l', 'w', 'h', 'lb'].forEach(k => { els[k].value = ''; });
  if (['l', 'w', 'h', 'lb'].includes(e.target.name)) f.querySelector('[name=how][value=""]').checked = true;
  show();
});
f.addEventListener('submit', e => { e.preventDefault(); document.activeElement.blur(); look(); });
els.code.addEventListener('paste', e => {
  const t = e.clipboardData?.getData('text/plain') || ''; if (!Codes.isPage(t) && !(els.code.value && /^\$|https?:\/\/|bought|^#/i.test(t.trim()))) return;
  e.preventDefault(); takeText(t);
});
$('#look').onclick = () => look();
$('#paste').onclick = async () => { let t; try { t = await navigator.clipboard.readText(); } catch { return state('Your phone blocked pasting. Press and hold the barcode box and tap Paste instead', 'maybe'); } takeText(t); };
$('#fresh').onclick = () => { clearForm(); lastKey = ''; scrollTo(0, 0); };

/* ---------- camera ---------- */
const TURNS = [0, 14, -14, 0, 28, -28, 45, -45];
let frame = 0;
const FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'ITF', 'QRCode'];
ZXingWASM.prepareZXingModule({ overrides: { locateFile: (p, pre) => p.endsWith('.wasm') ? 'vendor/zxing_reader.wasm' : pre + p }, fireImmediately: true });
let stream = null, track = null, seen = '', seenAt = 0, busy = false, audio = null;
const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
function beep() { try { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 1320; g.gain.value = .08; o.connect(g).connect(audio.destination); o.start(); o.stop(audio.currentTime + .09); } catch { /* sound is a bonus */ } navigator.vibrate?.(40); }
async function startCam() {
  tab('scan');
  if (!navigator.mediaDevices?.getUserMedia) return state('This browser cannot open the camera here. Use Safari, or Photo in Setup', 'bad');
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch { audio = null; }
  stopCam(); $('#go').disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (e) { $('#go').disabled = false; return state(e.name === 'NotAllowedError' ? 'Camera is blocked. On iPhone: Settings, Apps, Safari, Camera, then Ask or Allow' : 'The camera would not open', 'bad'); }
  $('#go').disabled = false;
  track = stream.getVideoTracks()[0]; track.onended = stopCam;
  const caps = track.getCapabilities?.() || {}; $('#torch').hidden = !caps.torch;
  if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  const v = $('#video'); v.srcObject = stream; $('#cam').hidden = false; $('#go').textContent = 'Close'; scrollTo(0, 0);
  try { await v.play(); } catch { /* it starts on the first frame */ }
  seen = ''; loop(stream);
}
function stopCam() { stream?.getTracks().forEach(t => t.stop()); stream = track = null; $('#video').srcObject = null; $('#cam').hidden = true; $('#go').textContent = 'Scan'; $('#aim').classList.remove('hit'); }
async function read(img) { const r = await ZXingWASM.readBarcodes(img, { formats: FORMATS, tryHarder: true, tryRotate: true, tryInvert: false, maxNumberOfSymbols: 1 }); return r.find(x => x.isValid && x.text) || null; }
async function loop(mine) {
  const v = $('#video');
  while (stream === mine && stream) {
    if (v.videoWidth && !busy) {
      busy = true;
      try {
        // the part of the picture inside the aiming box, at up to 1100 px wide
        const vw = v.videoWidth, vh = v.videoHeight, box = v.getBoundingClientRect(), s = Math.max(box.width / vw, box.height / vh) || 1, w = Math.min(vw, box.width * .9 / s), hh = Math.min(vh, box.height * .6 / s), k = Math.min(1, 1100 / w);
        canvas.width = Math.round(w * k); canvas.height = Math.round(hh * k);
        const turn = TURNS[frame++ % TURNS.length] * Math.PI / 180; // nobody holds a phone level, so some frames are straightened first
        ctx.setTransform(1, 0, 0, 1, canvas.width / 2, canvas.height / 2); ctx.rotate(turn);
        ctx.drawImage(v, (vw - w) / 2, (vh - hh) / 2, w, hh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const hit = await read(ctx.getImageData(0, 0, canvas.width, canvas.height));
        if (stream !== mine) return;
        if (hit) { const now = Date.now(); if (hit.text === seen && now - seenAt < 2500) { scanned(hit.text); return; } seen = hit.text; seenAt = now; }
      } catch { /* a bad frame is skipped */ } finally { busy = false; }
    }
    await new Promise(r => setTimeout(r, 45));
  }
}
function scanned(text) {
  $('#aim').classList.add('hit'); beep(); stopCam();
  if (text.startsWith('AISLE9|')) return pair(text);
  clearForm(); els.code.value = text; look();
}
async function fromPhoto(file) {
  state('Reading the photo');
  try { const b = await createImageBitmap(file), k = Math.min(1, 2000 / Math.max(b.width, b.height)); canvas.width = b.width * k; canvas.height = b.height * k; ctx.drawImage(b, 0, 0, canvas.width, canvas.height); const hit = await read(ctx.getImageData(0, 0, canvas.width, canvas.height)); if (!hit) return state('No barcode found. Get closer and fill the photo with it', 'bad'); tab('scan'); scanned(hit.text); } catch { state('That photo could not be read', 'bad'); }
}
$('#go').onclick = () => stream ? stopCam() : startCam();
$('#stop').onclick = stopCam;
$('#torch').onclick = async () => { const on = !track.getSettings().torch; try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch { toast('The light is not available'); } };
$('#photo').onchange = e => { const p = e.target.files[0]; e.target.value = ''; if (p) fromPhoto(p); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });

/* ---------- leads ---------- */
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
$('#save').onclick = () => {
  const x = values(), c = Codes.read(x.code), r = Fees.check(x, settings);
  if (!x.code && !x.title && !x.notes) return toast('Scan something first');
  const old = leads.find(l => l.uid === editing), lead = { ...x, uid: old?.uid || uid(), when: old?.when || Date.now(), sent: 0, title: x.title || x.notes || c.value || x.code, upc: ['upc', 'ean', 'isbn'].includes(c.type) ? c.value : '', asin: x.asin || c.asin || '', verdict: r.verdict, profit: r.verdict ? r.profit : '' };
  const next = old ? leads.map(l => l === old ? lead : l) : [lead, ...leads];
  if (!keep('leads', next)) return;
  leads = next; keep('store', x.store); clearForm(); lastKey = ''; counts(); scrollTo(0, 0); toast(old ? 'Updated' : 'Saved on this phone');
};
const waiting = () => leads.filter(l => !l.sent);
const counts = () => { $('#count').textContent = waiting().length ? `(${waiting().length})` : ''; };
function drawLeads() {
  const w = waiting().length;
  $('#leads').innerHTML = `<section class="glass pane"><div class="row"><strong>${w ? `${w} not sent yet` : leads.length ? 'All sent to your PC' : 'No leads yet'}</strong></div>
    ${asking.length ? `<div class="note blue"><p><strong>Did your PC say it got ${asking.length === 1 ? 'it' : 'them'}?</strong></p><div class="row" style="margin-top:10px"><button class="btn go" data-do="gotIt">Yes</button><button class="btn" data-do="notYet">No</button></div></div>` : ''}
    ${leads.length ? `<div class="acts"><button class="btn go full" data-do="send" ${w ? '' : 'disabled'}>Send ${w || ''} to my PC</button><button class="btn" data-do="share">Share a file</button><button class="btn" data-do="clearSent" ${leads.some(l => l.sent) ? '' : 'disabled'}>Clear sent</button></div>` : '<p class="soft">Scan something and tap Save lead. Leads stay on this phone until you send them.</p>'}
    ${leads.length && !pc ? '<p class="soft">To send in one tap, pair with your PC in Setup. Or share a file and open it on the PC.</p>' : ''}</section>
    ${leads.map(l => `<button class="lead ${l.sent ? 'sent' : ''}" data-lead="${esc(l.uid)}"><span class="shot">${pic(l.image)}</span><div><span class="name">${esc(l.title)}</span><span class="line">${esc([l.store, l.cost && usd(l.cost), l.sent ? 'sent' : ''].filter(Boolean).join(' · '))}</span></div><span class="end">${l.verdict ? `<span class="chip ${esc(l.verdict)}">${esc(l.verdict)}</span><span class="soft">${usd(l.profit, 1)}</span>` : ''}</span></button>`).join('')}`;
}
const pack = list => list.map(({ when, sent, code, verdict, profit, ...l }) => ({ ...l, ...Object.fromEntries(['cost', 'price', 'low90', 'rank', 'offers', 'l', 'w', 'h'].map(k => [k, l[k] === '' || l[k] === undefined ? '' : num(l[k])])) }));
const b64 = o => { let s = ''; for (const b of new TextEncoder().encode(JSON.stringify(o))) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const DO = {
  send() {
    if (!pc) return toast('Pair with your PC in Setup first');
    const batch = waiting().slice(-25), a = document.createElement('a'); // oldest first, small enough for one link
    a.href = `${pc}in#${b64(pack(batch))}`; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
    asking = batch.map(l => l.uid); keep('asking', asking); drawLeads();
  },
  gotIt() { leads.forEach(l => { if (asking.includes(l.uid)) l.sent = Date.now(); }); keep('leads', leads); asking = []; keep('asking', asking); counts(); drawLeads(); },
  notYet() { asking = []; keep('asking', asking); drawLeads(); toast('Still saved here. Check that you are on home Wi-Fi and the PC app is open'); },
  async share() {
    const file = new File([JSON.stringify({ app: 'Aisle Nine Pocket', leads: pack(leads) })], 'aisle-nine-leads.json', { type: 'application/json' });
    try { if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'Aisle Nine leads' }); } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
  clearSent() { const old = leads; leads = leads.filter(l => !l.sent); keep('leads', leads); counts(); drawLeads(); toast('Cleared', 'Undo', () => { leads = old; keep('leads', leads); counts(); drawLeads(); }); },
  photo() { $('#photo').click(); },
  unpair() { pc = ''; keep('pc', ''); drawSetup(); toast('Unpaired'); },
  open(el, id) { const l = leads.find(x => x.uid === id); clearForm(); for (const e of els) { if (!e.name) continue; if (e.type === 'radio') e.checked = e.value === String(l[e.name] ?? ''); else if (e.type === 'checkbox') e.checked = !!l[e.name]; else e.value = l[e.name] ?? (e.name === 'cat' ? 'other' : ''); } item = { title: l.title, image: l.image, asin: l.asin, brand: l.brand, url: l.url }; editing = l.uid; if (l.sizeGuess) { const k = Object.keys(SIZES).find(n => SIZES[n].every((v, i) => num(l[['l', 'w', 'h', 'lb'][i]]) === v)); if (k) f.querySelector(`[name=how][value=${k}]`).checked = true; } lastKey = keyOf(els.code.value); $('#found').innerHTML = `${l.image ? `<span class="shot">${pic(l.image)}</span>` : ''}<strong>${esc(l.title)}</strong>`; tab('scan'); show(); state(''); toast('Opened. Save lead updates it', 'Delete', () => { const old = leads; leads = leads.filter(x => x.uid !== id); keep('leads', leads); counts(); clearForm(); lastKey = ''; toast('Deleted', 'Undo', () => { leads = old; keep('leads', leads); counts(); }); }); },
};

/* ---------- setup ---------- */
const FIELDS = [['tax', 'Sales tax (%)'], ['minProfit', 'Least profit each ($)'], ['minRoi', 'Least return (%)'], ['minMargin', 'Least margin (%)'], ['stress', 'Price drop to test (%)'], ['maxRank', 'Worst sales rank'], ['maxOffers', 'Most sellers'], ['prep', 'Prep each ($)'], ['inboundLb', 'Shipping to Amazon per lb ($)'], ['months', 'Months in storage'], ['returns', 'Returns set-aside (%)']];
function drawSetup() {
  $('#setup').innerHTML = `<section class="glass pane"><strong>Your PC</strong><p class="soft">${pc ? `Paired with ${esc(new URL(pc).host)}. Leads send when you are on your home Wi-Fi with the PC app open.` : 'On the PC open Aisle Nine, Connections, Phone, and turn it on. Then tap Scan here and point at the pairing code. Your goals and tax rate copy over too.'}</p><div class="row"><button class="btn" data-do="photo">Read a photo</button>${pc ? '<button class="btn" data-do="unpair">Unpair</button>' : ''}</div></section>
  <section class="glass pane"><strong>Your goals</strong><form id="set"><div class="fields pair">${FIELDS.map(([k, n]) => `<label class="field">${n}<input name="${k}" inputmode="decimal" value="${esc(settings[k])}"></label>`).join('')}<label class="field all">Seller plan<select name="plan"><option value="individual" ${settings.plan === 'individual' ? 'selected' : ''}>Individual, $0.99 a sale</option><option value="pro" ${settings.plan === 'pro' ? 'selected' : ''}>Professional, $39.99 a month</option></select></label></div><button class="btn go" style="width:100%;margin-top:14px">Save</button></form></section>
  <section class="glass pane"><strong>About</strong><p class="soft">Leads and settings stay on this phone. Barcodes are sent only to Open Library, Open Food Facts and MusicBrainz to find a name. No account, no tracking. Fees are 2026 estimates, with Amazon's announced 2027 increase added from Dec 15.</p></section>`;
}
document.addEventListener('submit', e => { if (e.target.id !== 'set') return; e.preventDefault(); const next = { ...settings, plan: e.target.elements.plan.value }; for (const [k, n] of FIELDS) { const t = e.target.elements[k].value.replace(/[$,%\s]/g, ''); if (t === '' || !(+t >= 0) || +t > 1e8) return toast(`${n} must be a number`); next[k] = +t; } settings = next; if (keep('settings', settings)) toast('Saved'); show(); });
function pair(text) {
  try {
    const p = JSON.parse(text.slice(7)), u = new URL(p.u);
    if (u.protocol !== 'http:' || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(u.hostname)) throw 0;
    pc = u.href; keep('pc', pc);
    for (const k of Object.keys(Fees.DEFAULTS)) if (p.s && ['number', 'string'].includes(typeof p.s[k])) settings[k] = p.s[k];
    keep('settings', settings); show(); toast('Paired with your PC');
  } catch { state('That is not an Aisle Nine pairing code', 'bad'); }
}

/* ---------- tabs ---------- */
function tab(id) {
  $$('#tabs button').forEach(b => b.dataset.tab === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  for (const m of ['scan', 'leads', 'setup']) $('#' + m).hidden = m !== id;
  if (id !== 'scan') stopCam();
  $('#title').textContent = { scan: 'Scan', leads: 'Leads', setup: 'Setup' }[id]; $('#fresh').hidden = id !== 'scan'; $('#save').hidden = id !== 'scan'; $('#bar').classList.toggle('one', id !== 'scan');
  if (id === 'leads') drawLeads(); if (id === 'setup') drawSetup(); scrollTo(0, 0);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-tab],[data-do],[data-lead]'); if (!b) return; if (b.dataset.tab) return tab(b.dataset.tab); if (b.dataset.lead) return DO.open(b, b.dataset.lead); DO[b.dataset.do](b); });
document.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);

$('#tip').hidden = navigator.standalone || matchMedia('(display-mode: standalone)').matches || !/iPhone|iPad|Android/i.test(navigator.userAgent);
els.store.value = mem('store', ''); els.cat.value = 'other'; counts();
const draft = mem('draft', null);
if (draft && Date.now() - draft.t < 12 * 3600e3) { putForm(draft.form); item = draft.item || {}; editing = draft.editing || null; lastKey = draft.lastKey || ''; showFound(); }
show();
navigator.storage?.persist?.();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
