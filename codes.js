// Reads whatever gets typed, scanned or pasted: barcodes, ISBNs, ASINs, links, or a whole copied Amazon page.
// Pure functions, shared by the desktop app, the phone page and the tests.
(function (root) {
  const sum = (d, odd, even) => [...d].reduce((a, ch, i) => a + +ch * (i % 2 ? even : odd), 0);
  const last = s => (10 - s % 10) % 10;
  const upcCheck = d11 => last(sum(d11, 3, 1));            // 11 digits in, also works for GTIN-14 bodies (13) and EAN-8 bodies (7)
  const ean13Check = d12 => last(sum(d12, 1, 3));
  const isbn10Check = d9 => { const c = (11 - [...d9].reduce((a, ch, i) => a + +ch * (10 - i), 0) % 11) % 11; return c === 10 ? 'X' : String(c); };
  const okUpc = t => /^\d{12}$/.test(t) && upcCheck(t.slice(0, 11)) === +t[11];
  const okEan = t => /^\d{13}$/.test(t) && ean13Check(t.slice(0, 12)) === +t[12];
  const okIsbn10 = t => /^\d{9}[\dX]$/.test(t) && isbn10Check(t.slice(0, 9)) === t[9];
  const isAsin = t => /^B(?=.*\d)[A-Z0-9]{9}$/.test(t);     // a digit is required, so words like BASKETBALL stay words

  function upcE(t) { // 8 digits to 12
    if (!/^[01]\d{7}$/.test(t)) return '';
    const [s, a, b, c, d, e, f, k] = t, body = f <= '2' ? s + a + b + f + '0000' + c + d + e : f === '3' ? s + a + b + c + '00000' + d + e : f === '4' ? s + a + b + c + d + '00000' + e : s + a + b + c + d + e + '0000' + f;
    return upcCheck(body) === +k ? body + k : '';
  }
  const isbn13 = t => ({ type: 'isbn', value: t, asin: t.startsWith('978') ? t.slice(3, 12) + isbn10Check(t.slice(3, 12)) : '' });
  const isbn10 = t => { const b = '978' + t.slice(0, 9); return { type: 'isbn', value: b + ean13Check(b), asin: t }; };
  const upc = (t, note) => ({ type: 'upc', value: t, ...(note ? { note } : {}) });

  function digits(t) {
    switch (t.length) {
      case 14: {
        if (upcCheck(t.slice(0, 13)) !== +t[13]) return null;
        if (t[0] === '0') return digits(t.slice(1));
        const b = t.slice(1, 13), u = b + ean13Check(b); // a case code: step down to the single unit
        return { ...digits(u), note: 'That is a case barcode, so the single-unit barcode was used.' };
      }
      case 13: return !okEan(t) ? null : /^97[89]/.test(t) ? isbn13(t) : t[0] === '0' ? upc(t.slice(1)) : { type: 'ean', value: t };
      case 12: return okUpc(t) ? (/^[24]/.test(t) ? upc(t, 'That barcode was made inside one store, so it may mean nothing anywhere else.') : upc(t)) : null;
      case 11: return okUpc('0' + t) ? upc('0' + t, 'A leading zero was missing, so it was put back.') : upc(t + upcCheck(t), 'One digit was missing, so the check digit was worked out. Make sure the product matches.');
      case 10: return okIsbn10(t) ? isbn10(t) : null;
      case 9: return okIsbn10('0' + t) ? { ...isbn10('0' + t), note: 'A leading zero was missing, so it was put back.' } : null;
      case 8: { const e = upcE(t); return e ? upc(e) : upcCheck(t.slice(0, 7)) === +t[7] ? { type: 'ean', value: t } : null; }
      case 15: case 17: case 18: case 16: { // a book or magazine barcode with the small price barcode stuck on the end
        const n = t.length > 16 ? t.length - 5 : t.length - 2, hit = [12, 13].includes(n) ? digits(t.slice(0, n)) : null;
        return hit;
      }
      default: return null;
    }
  }
  function badDigits(t) {
    if (t.length === 12 || t.length === 13) { const want = t.length === 12 ? upcCheck(t.slice(0, 11)) : ean13Check(t.slice(0, 12)); return `The last digit does not match. If the rest is right it should end in ${want}, so check for a typo.`; }
    if (t.length === 10 || t.length === 9) return 'That is not a valid ISBN. Check for a typo, or scan the barcode.';
    return `A product barcode has 8, 12, 13 or 14 digits. This has ${t.length}.`;
  }

  const MARKETS = { 'amazon.ca': 'Canada', 'amazon.co.uk': 'the UK', 'amazon.de': 'Germany', 'amazon.fr': 'France', 'amazon.it': 'Italy', 'amazon.es': 'Spain', 'amazon.com.mx': 'Mexico', 'amazon.co.jp': 'Japan', 'amazon.in': 'India', 'amazon.com.au': 'Australia', 'amazon.com.br': 'Brazil', 'amazon.nl': 'the Netherlands', 'amazon.se': 'Sweden', 'amazon.pl': 'Poland', 'amazon.com.be': 'Belgium', 'amazon.sg': 'Singapore', 'amazon.ae': 'the UAE', 'amazon.sa': 'Saudi Arabia', 'amazon.com.tr': 'Turkey', 'amazon.eg': 'Egypt', 'amazon.ie': 'Ireland' };
  const words = s => { let t = s; try { t = decodeURIComponent(s.replace(/\+/g, ' ')); } catch { /* keep it as it is */ } return t.replace(/\.(html?|aspx?|p|php)$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(); };
  const product = t => isAsin(t) ? { type: 'asin', value: t, asin: t } : okIsbn10(t) ? isbn10(t) : /^\d{9}[\dX]$/.test(t) ? { type: 'asin', value: t, asin: t } : null;

  function link(raw) {
    let u; try { u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch { return null; }
    const host = u.hostname.toLowerCase().replace(/^(www|m|smile|mobile)\./, '');
    if (!host.includes('.')) return null;
    const url = u.href.split('#')[0].slice(0, 600), short = /^(a\.co|amzn\.(to|eu|asia|com)|amzlink\.to)$/.test(host);
    if (short) { const p = host === 'amzn.com' && product((u.pathname.match(/^\/(?:dp\/)?([A-Z0-9]{10})(?=\/|$)/i) || [])[1]?.toUpperCase() || ''); return p ? { ...p, url } : { type: 'short', value: u.href }; }
    const all = u.href.replace(/%2F/gi, '/').replace(/%3D/gi, '=').replace(/%3F/gi, '?').replace(/%26/gi, '&');
    if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
      const m = all.match(/\/(?:dp(?:\/product)?|gp\/(?:product|aw\/d|aw\/reviews|offer-listing|customer-reviews|your-account\/buy-again)|exec\/obidos\/(?:asin|tg\/detail\/-)|o\/asin|asin|product-reviews|d|reviews|ask\/questions\/asin|review\/product|glance)(?:\/[^/?#]*)??\/([A-Z0-9]{10})(?=[/?#&]|$)/i)
        || all.match(/[?&](?:asin|pd_rd_i|creativeASIN|parentASIN|ASIN\.1|itemId|asins?|searchTerms|field-keywords|k)=([A-Z0-9]{10})(?=[&#]|$)/i);
      const p = m && product(m[1].toUpperCase());
      const site = Object.keys(MARKETS).find(k => host === k || host.endsWith('.' + k)), note = site ? `That link is from Amazon in ${MARKETS[site]}. The numbers here are for amazon.com.` : '';
      if (!p) { const k = u.searchParams.get('k') || u.searchParams.get('field-keywords'); return k ? { type: 'text', value: k, url } : { type: 'bad', value: raw, why: 'That Amazon link is not a product page. Open the product itself and copy that link.' }; }
      const slug = all.match(/amazon\.[a-z.]+\/(?:-\/[a-z]{2}\/)?([^/?#]+)\/(?:dp|gp\/product|product-reviews)\//i) || all.match(/[?&]url=\/([^/?#]+)\/dp\//i), name = slug && !/^(gp|dp|-|exec|o|d|s|ref=.*)$/i.test(slug[1]) ? words(slug[1]) : '';
      return { ...p, url, ...(name ? { name } : {}), ...(note ? { note } : {}) };
    }
    if (/(keepa|camelcamelcamel|selleramp|jungleszout|helium10|revseller|buybotpro|selleramp|fbatoolkit|amzscout|tacticalarbitrage)\./.test(host + '.')) {
      const m = (u.pathname + u.search + u.hash).match(/(?:^|[^A-Z0-9])(B(?=[A-Z0-9]*\d)[A-Z0-9]{9}|\d{9}[\dX])(?![A-Z0-9])/i), p = m && product(m[1].toUpperCase());
      if (p) return { ...p };
    }
    for (const [k, v] of u.searchParams) if (/^(upc|ean|gtin|gtin12|gtin13|barcode|isbn|_?nkw)$/i.test(k)) { const h = /^\d{8,14}$/.test(v) && digits(v); if (h) return { ...h, url }; }
    const parts = u.pathname.split('/').filter(Boolean), id = { bestbuy: (u.searchParams.get('skuId') || (all.match(/\/(\d{7})(?:\.p|\/?$)/) || [])[1]), ebay: (u.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/) || [])[1] };
    const name = words(parts.filter(p => /[a-z]/i.test(p) && /[-_ ]|%20/.test(p)).sort((a, b) => b.length - a.length)[0] || '').replace(/\b(sku|prod|id|a)?\s?\d{6,}\b/gi, '').trim();
    return { type: 'link', value: url, url, store: host, name, ...(host.endsWith('bestbuy.com') && id.bestbuy ? { sku: id.bestbuy } : {}), ...(/(^|\.)ebay\./.test(host) && id.ebay ? { item: id.ebay } : {}) };
  }

  function read(raw) {
    const s = String(raw ?? '').normalize('NFKC').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').replace(/[‐-―−]/g, '-').trim();
    if (!s) return { type: 'text', value: '' };
    const found = s.match(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>]*)?/i);
    if (found && (/^https?:/i.test(found[0]) || (found[0].includes('/') && found.index === 0))) { const l = link(found[0].replace(/[),.;]+$/, '')); if (l) return l; }
    if (/^\d(?:\.\d+)?e\+?\d{1,2}$/i.test(s)) return { type: 'bad', value: s, why: 'A spreadsheet rounded that barcode. Format its column as text and copy the code again.' };
    const t = s.toUpperCase().replace(/^(UPC(-?[AE])?|EAN(-?\d+)?|GTIN(-?\d+)?|ISBN(-?1[03])?|ASIN|FNSKU|BARCODE|CODE|SKU)\s*(NUMBER|NO\.?|#)?\s*[:#=-]?\s*/, '').replace(/[\s.-]/g, '');
    if (isAsin(t)) return { type: 'asin', value: t, asin: t };
    if (/^X0[A-Z0-9]{8}$/.test(t)) return { type: 'fnsku', value: t };
    if (/^\d{9}X$/.test(t) && okIsbn10(t)) return isbn10(t);
    if (/^\d{8}X$/.test(t) && okIsbn10('0' + t)) return { ...isbn10('0' + t), note: 'A leading zero was missing, so it was put back.' };
    if (/^\d{8,18}$/.test(t)) return digits(t) || { type: 'bad', value: t, why: badDigits(t) };
    if (/^\d{9}X$/.test(t)) return { type: 'bad', value: t, why: badDigits(t) };
    // a code inside a longer line, like "LEGO Bonsai (ASIN B08HW1ZJM6)" or "Tissues UPC: 0 36000 29145 2"
    const inA = s.match(/(?:^|[^A-Za-z0-9])(B0[A-Z0-9]{8})(?![A-Za-z0-9])/i); if (inA && isAsin(inA[1].toUpperCase())) return { type: 'asin', value: inA[1].toUpperCase(), asin: inA[1].toUpperCase() };
    for (const m of s.matchAll(/(?:^|[^\d])((?:97[89][\s-]?)?\d(?:[\s-]?\d){7,13})(?!\d)/g)) { const n = m[1].replace(/[\s-]/g, ''); if (n.length >= 12) { const h = digits(n); if (h) return h; } }
    return { type: 'text', value: s.slice(0, 200) };
  }

  /* ---- a whole Amazon product page, copied by hand ---- */
  const CATEGORY = [[/toys?( &| and|$)/i, 'toys'], [/video game/i, 'games'], [/baby/i, 'baby'], [/pet supplies|animals & pet/i, 'pets'], [/beauty|health|personal care|household supplies/i, 'beauty'], [/grocery|gourmet|food, bev|beverages/i, 'grocery'], [/shoe|footwear/i, 'shoes'], [/clothing|apparel/i, 'clothing'], [/^books|kindle|cds|vinyl|movies|dvd|media|music$/i, 'media'], [/cell phones?|accessories.*electronic|electronics accessories/i, 'eaccess'], [/computer/i, 'computers'], [/electronics|camera/i, 'electronics'], [/office|school supplies/i, 'office'], [/sport|outdoor recreation|sporting goods/i, 'sports'], [/lawn|garden(?! >)|patio/i, 'lawn'], [/automotive|vehicles/i, 'auto'], [/tools|hardware/i, 'tools'], [/musical instr/i, 'music'], [/industrial|scientific|business/i, 'business'], [/luggage|handbag|backpack/i, 'bags'], [/jewelry/i, 'jewelry'], [/watches/i, 'watches'], [/appliances/i, 'appliances'], [/furniture/i, 'furniture'], [/home|kitchen|dining|crafts|arts/i, 'home']];
  const category = t => (CATEGORY.find(([re]) => re.test(String(t || '').trim())) || [])[1] || '';
  const INCH = { inch: 1, in: 1, '"': 1, centimeter: 1 / 2.54, cm: 1 / 2.54, millimeter: 1 / 25.4, mm: 1 / 25.4, feet: 12, foot: 12, ft: 12 }, OUNCE = { pound: 16, lb: 16, ounce: 1, oz: 1, gram: 1 / 28.3495, g: 1 / 28.3495, kilogram: 35.274, kg: 35.274 };
  const unit = (table, u) => table[u.toLowerCase().replace(/s$/, '')] ?? table[u.toLowerCase()];
  const r2 = x => Math.round(x * 100) / 100;
  const size = t => { const m = t.match(/([\d.]+)\s*"?\s*[LWHD]?\s*[x×]\s*([\d.]+)\s*"?\s*[LWHD]?\s*[x×]\s*([\d.]+)\s*"?\s*[LWHD]?\s*(inch(?:es)?|in\b|cm|centimeters?|millimeters?|mm|feet|ft)?/i); if (!m) return null; const k = unit(INCH, (m[4] || 'in').replace(/inches/i, 'inch')) || 1; return { l: r2(m[1] * k), w: r2(m[2] * k), h: r2(m[3] * k) }; };
  const weigh = t => { const m = t.match(/([\d.]+)\s*(pounds?|lbs?|ounces?|oz|kilograms?|kg|grams?|g)\b/i); return m ? r2(m[1] * unit(OUNCE, m[2])) : 0; };
  const isPage = t => String(t).length > 250 && /best sellers rank|customer reviews|add to cart|buy now|product (details|information)|about this item/i.test(t) && /amazon|asin/i.test(t);

  function page(raw) {
    const t = String(raw).normalize('NFKC').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n'), out = {};
    const row = (...names) => { for (const n of names) { const m = t.match(new RegExp(`(?:^|\\n|\\. )\\s*${n}\\s*[:\\n ]\\s*:?\\s*([^\\n]+)`, 'i')); if (m) return m[1].trim(); } return ''; };
    const a = t.match(/\bASIN\s*[:\n ]\s*:?\s*(B[A-Z0-9]{9}|\d{9}[\dX])\b/) || t.match(/\/dp\/([A-Z0-9]{10})\b/); if (a) out.asin = a[1];
    const i13 = t.match(/ISBN-13\s*[:\n ]\s*:?\s*([\d-]{13,17})/i), up = row('UPC', 'Global Trade Identification Number', 'GTIN', 'EAN');
    const code = i13 ? read(i13[1]) : (up.match(/\d{8,14}/g) || []).map(read).find(c => ['upc', 'ean', 'isbn'].includes(c.type)) || {};
    if (['upc', 'ean', 'isbn'].includes(code.type)) { out.upc = code.value; if (code.asin && !out.asin) out.asin = code.asin; }
    const rank = t.match(/Best Sellers Rank\s*:?\s*#?([\d,]+)(?: Paid| Free)? in ([^\n(#]+)/i) || t.match(/#([\d,]+) in ([^\n(#]+?) ?\(See Top 100/i);
    if (rank) { out.rank = +rank[1].replace(/,/g, ''); out.rankIn = rank[2].trim(); const c = category(out.rankIn); if (c) out.cat = c; }
    // price: the words Amazon reads out loud are the safest, then a dollar amount that is not a list price, unit price or shipping rule
    const cash = s => +s.replace(/,/g, ''), said = t.match(/\$([\d,]+\.\d\d) with \d+ ?(?:%|percent) savings/i) || t.match(/(?:^|\n)(?:Buy new|One-time purchase|Price|With Deal|Deal Price|Our Price)\s*:?\s*\n?\$ ?([\d,]+\.\d\d)/i) || t.match(/\$([\d,]+\.\d\d)(?= ?\n? ?\$\1\b)/);
    if (said) out.price = cash(said[1]);
    else {
      const from = Math.max(0, t.search(/out of 5 stars|\d[\d,]* ratings?|Visit the .+ Store/i));
      for (const m of t.slice(from).matchAll(/\$[ \n]?([\d,]+)(?:\.(\d\d)|\n\.?\n?(\d\d)(?=\n))/g)) {
        const before = t.slice(Math.max(0, from + m.index - 40), from + m.index), after = t.slice(from + m.index + m[0].length, from + m.index + m[0].length + 28);
        if (/(list|typical|was|retail|rrp|save|saving|coupon|shipping|delivery|over|orders? of|from|off|gift card|\/mo|month)[^\n$]{0,16}$|\($/i.test(before.replace(/\n/g, ' ')) || /^ ?\n?(\/|per |each\/|off|shipping|delivery|\/ ?(count|ounce|fl|oz)| ?x \d)/i.test(after)) continue;
        out.price = cash(m[1] + '.' + (m[2] || m[3])); break;
      }
    }
    const pack = row('Package Dimensions'), prod = row('Product Dimensions', 'Item Dimensions LxWxH', 'Item Dimensions[^\\n:]{0,12}', 'Parcel Dimensions'), d = size(pack) || size(prod);
    if (d) Object.assign(out, d, { sizeFrom: size(pack) ? 'package' : 'product' });
    const oz = weigh(pack) || weigh(row('Item Weight', 'Package Weight', 'Product Weight')) || weigh(prod); if (oz) out.oz = oz;
    const brand = t.match(/Visit the (.+?) Store\b/) || t.match(/(?:^|\n)Brand\s*[:\n ]\s*:?\s*([^\n]{2,40})/); if (brand) out.brand = brand[1].trim();
    const lines = t.split('\n').map(x => x.trim()), at = lines.findIndex(x => /^Visit the .+ Store$|^Brand: |^by .{2,60}\((Author|Artist|Format)/i.test(x) || /^\d(\.\d)? ?\d?(\.\d)? ?out of 5 stars/i.test(x));
    for (let i = at - 1; i >= 0 && i > at - 6; i--) if (lines[i].length > 12 && !/^(›|back to results|image|roll over|click|video|share|sponsored|\d+ videos?)/i.test(lines[i])) { out.title = lines[i].slice(0, 200); break; }
    if (!out.title) { const m = t.match(/Amazon\.com ?: ([^\n]{12,200})/); if (m) out.title = m[1].trim(); }
    const n = t.match(/\bNew \((\d+)\) from/i) || t.match(/New & Used \((\d+)\)/i) || t.match(/See All Buying Options[\s\S]{0,40}?\((\d+)\)/i); if (n) out.offers = +n[1];
    const sold = t.match(/(?:Sold by|Seller)\s*:?\s*\n?([^\n]{2,50})/i); if (sold) out.amazonSells = /^Amazon(\.com)?\b(?! (resale|warehouse|renewed))/i.test(sold[1].trim()); if (/ships from and sold by amazon\.com|Shipper ?\/ ?Seller\s*\n?Amazon\.com/i.test(t)) out.amazonSells = true;
    const month = t.match(/([\d.]+K?)\+ bought in past month/i); if (month) out.bought = month[1] + '+';
    if (/currently unavailable/i.test(t)) out.unavailable = true;
    return out;
  }

  const api = { read, page, isPage, category, upcCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Codes = api;
})(typeof self !== 'undefined' ? self : this);
