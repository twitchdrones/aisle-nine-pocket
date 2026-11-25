// Amazon US fee engine. Pure functions, shared by the desktop app, the phone page and the tests.
// Referral table: sell.amazon.com/pricing, read 2026-11-24.
// FBA tables: amzprep.com rate card and holiday page, read 2026-11-24 (third party; Amazon's own page needs a login).
(function (root) {
  const CATS = {
    home: ['Home and Kitchen', 15], toys: ['Toys and Games', 15], beauty: ['Beauty, Health and Personal Care', 'low10'],
    grocery: ['Grocery and Gourmet', 'low15', 0], clothing: ['Clothing and Accessories', 'cloth'], shoes: ['Footwear', 15],
    media: ['Books, DVD, Music, Software', 15, 0, 1.8], games: ['Video Games and Accessories', 15, 0], consoles: ['Video Game Consoles', 8, 0],
    electronics: ['Consumer Electronics', 8], eaccess: ['Electronics Accessories', [[100, 15], [1e9, 8]]], computers: ['Computers', 8],
    tools: ['Tools and Home Improvement', 15], powertools: ['Base Equipment Power Tools', 12], office: ['Office Products', 15],
    sports: ['Sports and Outdoors', 15], pets: ['Pet Supplies', 15], baby: ['Baby Products', 'low10'], lawn: ['Lawn and Garden', 15],
    auto: ['Automotive and Powersports', 12], bags: ['Backpacks, Handbags, Luggage', 15], jewelry: ['Jewelry', [[250, 20], [1e9, 5]]],
    watches: ['Watches', [[1500, 16], [1e9, 3]]], eyewear: ['Eyewear', 15], furniture: ['Furniture', [[200, 15], [1e9, 10]]],
    appliances: ['Appliances, Compact', [[300, 15], [1e9, 8]]], bigappliances: ['Appliances, Full-size', 8],
    business: ['Business, Industrial, Scientific', 12], music: ['Musical Instruments, AV', 15], printers: ['3D Printers', [[200, 12], [1e9, 5]]],
    other: ['Everything Else', 15],
  };
  const SM = [2, 4, 6, 8, 10, 12, 14, 16], LG = [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];
  // $10-$50 column; [small standard, large standard to 3 lb, large standard 3+ lb base]
  const T = {
    std: [[3.32, 3.42, 3.45, 3.54, 3.68, 3.78, 3.91, 3.96], [3.73, 3.95, 4.2, 4.6, 5.04, 5.42, 5.57, 5.82, 5.92, 6.1, 6.26, 6.67], 6.97],
    app: [[3.51, 3.54, 3.59, 3.69, 3.91, 4.09, 4.2, 4.25], [4.3, 4.5, 4.72, 5.17, 5.87, 6.04, 6.14, 6.25, 6.6, 6.72, 6.77, 6.9], 6.97],
    haz: [[4.29, 4.36, 4.37, 4.43, 4.55, 4.61, 4.72, 4.78], [4.55, 4.76, 4.99, 5.19, 5.64, 6.02, 6.13, 6.31, 6.38, 6.56, 6.72, 7.13], 7.43],
    stdPeak: [[3.51, 3.61, 3.65, 3.74, 3.89, 3.99, 4.13, 4.18], [3.97, 4.21, 4.48, 4.89, 5.34, 5.73, 5.89, 6.15, 6.29, 6.49, 6.66, 7.08], 7.51],
    appPeak: [[3.74, 3.77, 3.84, 3.94, 4.18, 4.36, 4.49, 4.54], [4.61, 4.82, 5.05, 5.51, 6.24, 6.41, 6.53, 6.64, 7.04, 7.16, 7.23, 7.36], 7.64],
    hazPeak: [[4.63, 4.73, 4.77, 4.86, 5.01, 5.1, 5.24, 5.33], [5.14, 5.38, 5.64, 5.86, 6.33, 6.73, 6.9, 7.06, 7.15, 7.35, 7.52, 7.94], 8.33],
  };
  const SMALL_OFF = [.89, .93, .89, .88, .91, .96, .99, 1.01], SMALL_OFF_APP = [.89, .9, .91, .88, .91, .99, 1, .95];
  // [small bulky, large bulky, XL to 50 lb, XL to 70, XL to 150, XL over 150]
  const BIG = {
    std: [7.55, 9.35, 26.33, 37.32, 51.32, 194.95], stdPeak: [8.59, 10.39, 29.06, 40.13, 55.74, 203.46],
    haz: [8.27, 10.07, 28.44, 40.53, 58.45, 219.53], hazPeak: [9.83, 11.63, 32.48, 44.63, 64.81, 231.61],
  };
  const BIG_STEP = [[1, .38], [1, .38], [1, .38], [51, .75], [71, .75], [151, .19]];
  const TIERS = ['Small standard', 'Large standard', 'Small bulky', 'Large bulky', 'Extra-large'];
  const FUEL = .035, RATES_END = '2027-01-15';
  // 2027 rates: Amazon announced only average changes per band (Seller Central G201411300, read 2026-11-25), so this adds the
  // average to the 2026 fee. Replace with the real 2027 rate card when it has been read. Bulky items get no change here.
  // 'auto' switches on from Dec 15: a unit bought then sells after the new rates start on Jan 15.
  const START_2027 = '2026-12-15', NO_LOW_2027 = new Set(['auto', 'appliances', 'computers', 'music', 'media']);
  function uplift2027(tier, price) {
    if (tier === 0) return price < 10 ? .2 : price <= 50 ? .4 : .7;
    if (tier === 1) return price < 10 ? 0 : price <= 50 ? .12 : .47;
    return 0;
  }

  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const num = x => { const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : 0; };

  function referral(price, cat) {
    const [, rule, min = .3] = CATS[cat] || CATS.other;
    let fee;
    if (Array.isArray(rule)) { let prev = 0; fee = 0; for (const [to, pct] of rule) { if (price > prev) fee += (Math.min(price, to) - prev) * pct / 100; prev = to; } }
    else {
      const pct = rule === 'low10' ? (price <= 10 ? 8 : 15) : rule === 'low15' ? (price <= 15 ? 8 : 15) : rule === 'cloth' ? (price <= 15 ? 5 : price <= 20 ? 10 : 17) : rule;
      fee = price * pct / 100;
    }
    return r2(Math.max(fee, min));
  }
  const closing = cat => (CATS[cat] || CATS.other)[3] || 0;

  function isPeak(d) { const k = (d.getMonth() + 1) * 100 + d.getDate(); return k >= 1015 || k <= 114; }

  function size(oz, dims) {
    const [a, b, c] = dims.map(num).sort((x, y) => y - x), lb = oz / 16, girth = a + 2 * (b + c);
    // Divisor 139, the 2 in floor for bulky items and the 37x28x20 small-bulky limit are from memory, not the read pages.
    const dim = (x, y, z) => x * y * z / 139 * 16;
    if (oz <= 16 && a <= 15 && b <= 12 && c <= .75) return { tier: 0, oz };
    let ship = Math.max(oz, dim(a, b, c));
    if (ship <= 320 && a <= 18 && b <= 14 && c <= 8) return { tier: 1, oz: ship };
    ship = Math.max(oz, dim(a, Math.max(b, 2), Math.max(c, 2)));
    if (ship <= 800 && a <= 37 && b <= 28 && c <= 20 && girth <= 130) return { tier: 2, oz: ship };
    if (ship <= 800 && a <= 59 && b <= 33 && c <= 33 && girth <= 130) return { tier: 3, oz: ship };
    return { tier: 4, oz: lb > 150 ? oz : ship };
  }

  function fulfillment(price, oz, dims, o = {}) {
    const s = size(oz, dims), key = (o.hazmat ? 'haz' : o.apparel ? 'app' : 'std') + (o.peak ? 'Peak' : ''), t = T[key], low = price < 10 && !o.noLow, high = price > 50;
    let fee;
    if (s.tier === 0) { const i = SM.findIndex(x => s.oz <= x); fee = t[0][i] - (low ? (o.apparel && !o.hazmat ? SMALL_OFF_APP : SMALL_OFF)[i] : 0) + (high ? .26 : 0); }
    else if (s.tier === 1) {
      const i = LG.findIndex(x => s.oz <= x);
      fee = i >= 0 ? t[1][i] : t[2] + (o.apparel && !o.hazmat ? Math.ceil((s.oz - 48) / 8) * .16 : Math.ceil((s.oz - 48) / 4) * .08);
      fee += low ? -.82 : high ? .26 : 0;
    } else {
      const lb = s.oz / 16, i = s.tier < 4 ? s.tier - 2 : lb <= 50 ? 2 : lb <= 70 ? 3 : lb <= 150 ? 4 : 5, big = BIG[(o.hazmat ? 'haz' : 'std') + (o.peak ? 'Peak' : '')];
      fee = big[i] - (low ? .77 : 0) + Math.max(0, Math.ceil(lb - BIG_STEP[i][0])) * BIG_STEP[i][1];
    }
    if (o.y2027) fee += uplift2027(s.tier, price);
    return { tier: TIERS[s.tier], standard: s.tier < 2, oz: s.oz, base: r2(fee), fuel: r2(fee * FUEL), total: r2(fee) + r2(fee * FUEL) };
  }

  // Middle of Amazon's range for sending everything to one warehouse.
  function placement(sz) {
    if (sz.tier === TIERS[0]) return sz.oz <= 8 ? .23 : .24;
    if (sz.tier === TIERS[1]) return sz.oz <= 12 ? .3 : sz.oz <= 24 ? .37 : sz.oz <= 48 ? .47 : .6; // shortcut: over 3 lb is an estimate, replace when the exact band is known
    return 2.5; // shortcut: bulky estimate
  }
  function storage(sz, dims, months, date) {
    const cuft = dims.map(num).reduce((a, b) => a * b, 1) / 1728, q4 = date.getMonth() >= 9;
    return r2(cuft * months * (sz.standard ? (q4 ? 2.4 : .78) : (q4 ? 1.4 : .56)));
  }

  const DEFAULTS = { tax: 0, prep: .25, inboundLb: .5, months: 2, returns: 3, plan: 'individual', placement: 'auto', season: 'auto', fees2027: 'auto', minProfit: 5, minRoi: 30, minMargin: 15, stress: 15, maxRank: 200000, maxOffers: 15 };

  // x: one unit being considered. s: settings.
  function check(x, s, now = new Date()) {
    s = Object.assign({}, DEFAULTS, s);
    const listed = num(x.price), low90 = num(x.low90), price = low90 > 0 && (!listed || low90 < listed) ? low90 : listed, pack = Math.max(1, Math.round(num(x.pack)) || 1), oz = num(x.oz), dims = [num(x.l), num(x.w), num(x.h)];
    const known = oz > 0 && dims.every(d => d > 0), fbm = x.mode === 'fbm';
    const y2027 = s.fees2027 === 'on' || (s.fees2027 !== 'off' && now.toISOString().slice(0, 10) >= START_2027);
    // In 2027 mode the unit sells after Jan 14, so no holiday fee and January storage rates.
    const peak = !y2027 && (s.season === 'peak' || (s.season !== 'normal' && isPeak(now))), storeDate = y2027 && now.getMonth() >= 9 ? new Date(now.getFullYear() + 1, 1, 1) : now;
    const apparel = x.cat === 'clothing' || x.cat === 'shoes';
    const list = num(x.cost) * pack, after = list * (1 - num(x.coupon) / 100) * (1 - num(x.gift) / 100);
    const tax = x.exempt ? 0 : list * (1 - num(x.coupon) / 100) * num(s.tax) / 100;
    const unit = r2(after + tax - after * num(x.cashback) / 100 + num(x.shipTo));
    const useOz = known ? oz : 16, useDims = known ? dims : [9, 6, 3];
    const costs = p => {
      const f = fulfillment(p, useOz, useDims, { peak, apparel, hazmat: !!x.hazmat, y2027, noLow: y2027 && NO_LOW_2027.has(x.cat) });
      const c = { unit, referral: referral(p, x.cat), closing: closing(x.cat), item: s.plan === 'individual' ? .99 : 0, returns: r2(p * num(s.returns) / 100) };
      if (fbm) c.ship = num(x.fbmShip);
      else Object.assign(c, {
        fba: num(x.fbaFee) || f.base, fuel: r2((num(x.fbaFee) || f.base) * FUEL), placement: s.placement === 'auto' || s.placement === '' ? placement(f) : num(s.placement),
        storage: storage(f, useDims, num(s.months), storeDate), inbound: r2(useOz / 16 * num(s.inboundLb)), prep: num(s.prep),
      });
      c.total = r2(Object.values(c).reduce((a, b) => a + b, 0));
      return { c, f };
    };
    const at = p => r2(p - costs(p).c.total);
    const { c, f } = costs(price), profit = at(price), roi = unit > 0 ? profit / unit * 100 : 0;
    const first = (goal) => { let lo = 0, hi = 5000; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; goal(m) ? hi = m : lo = m; } return hi; };
    const breakeven = r2(first(p => at(p) >= 0));
    // Highest landed cost that still meets both goals.
    // room - unit is the profit, so each goal caps the unit cost: profit, return on cost, and margin on the sale price.
    const room = profit + unit, maxUnit = Math.max(0, Math.min(room - num(s.minProfit), room / (1 + num(s.minRoi) / 100), room - price * num(s.minMargin) / 100));
    const perList = list > 0 ? (unit - num(x.shipTo)) / list : 1 + num(s.tax) / 100;
    const maxCost = Math.max(0, Math.floor((maxUnit - num(x.shipTo)) / (perList || 1) / pack * 100) / 100);
    const drop10 = at(price * .9), drop20 = at(price * .8), stress = Math.min(50, Math.max(0, num(s.stress))), dropS = stress ? at(price * (1 - stress / 100)) : profit;
    const margin = price ? r2(profit / price * 100) : 0;

    const no = [], warn = [], good = [], info = [], bought = num(x.bought), counted = String(x.bought ?? '') !== '';
    // These rule an item out whatever it costs, so they show as soon as you know them.
    if (x.bbSuppressed) no.push('Buy Box is suppressed: Amazon is hiding the price, so it will not sell');
    if (x.amazon90) no.push('Amazon sold it in the last 90 days');
    if (x.amazonSells) no.push('Amazon sells it on this listing now');
    if (x.approved === 'no') no.push('Your account is blocked from selling it');
    const stop = no.length > 0;
    if (price && price < listed) info.push(`Priced at its 90-day low of $${price.toFixed(2)}, not today's $${listed.toFixed(2)}`);
    if (!price) no.push('Add the Amazon price');
    if (!num(x.cost)) no.push('Add what you would pay');
    const ready = price > 0 && num(x.cost) > 0;
    if (ready) {
      if (profit <= 0) no.push('Loses money at this price');
      else {
        if (profit < num(s.minProfit)) no.push(`Profit is under your $${num(s.minProfit)} goal`);
        if (roi < num(s.minRoi)) no.push(`Return is under your ${num(s.minRoi)}% goal`);
        if (margin < num(s.minMargin)) no.push(`Margin is under your ${num(s.minMargin)}% goal`);
      }
      if (x.approved !== 'yes' && x.approved !== 'no') warn.push('Check that you are approved to sell it before you pay');
      if (!known && !fbm) warn.push('Size is a guess (1 lb, 9 x 6 x 3 in)');
      if (!x.sameItem) for (const d of x.doubts || []) warn.push(d);
      if (x.priceAt && now.getTime() / 1000 - x.priceAt > 86400) warn.push(`The Amazon price is ${Math.floor((now.getTime() / 1000 - x.priceAt) / 86400)} day${now.getTime() / 1000 - x.priceAt < 172800 ? '' : 's'} old`);
      if (x.hazmat) warn.push('Hazmat: needs extra paperwork and higher fees');
      if (x.melt) warn.push('Meltable: Amazon refuses it from April 15 to October 15');
      if (num(x.rank) > num(s.maxRank)) warn.push(`Sales rank is worse than your ${num(s.maxRank).toLocaleString('en-US')} limit`);
      if (!num(x.rank) && bought < 50) warn.push(counted ? (bought ? 'Fewer than 50 sold last month' : 'Amazon shows no recent sales count, so it may sell slowly') : 'No sales rank or sales count, so you cannot tell if it sells');
      if (num(x.offers) > num(s.maxOffers)) warn.push(`${num(x.offers)} sellers will split the sales`);
      if (num(x.avg90) && price > num(x.avg90) * 1.15) warn.push(`Price is above its 90-day average of $${num(x.avg90).toFixed(2)}`);
      if (x.sizeGuess && known && !fbm) {
        info.push('Size is your estimate');
        if (profit >= num(s.minProfit) && check({ ...x, sizeGuess: false, oz: oz * 1.5, h: num(x.h) * 1.4 }, s, now).profit < num(s.minProfit)) warn.push('If it is bigger than you picked, it misses your profit goal');
      }
      // Stress test: would a lower Amazon price still pay what you want? Checked once the item meets the goal at today's price.
      if (profit >= num(s.minProfit) && stress && dropS < num(s.minProfit)) warn.push(dropS < 0 ? `A ${stress}% price drop makes it lose money` : `A ${stress}% price drop cuts profit to $${dropS.toFixed(2)}, under your $${num(s.minProfit)} goal`);
      else if (profit > 0 && drop10 < 0) warn.push('A 10% price drop wipes out the profit');
      if (num(x.rank) && num(x.rank) <= num(s.maxRank) / 4) good.push('Strong sales rank');
      if (bought >= 500) good.push(`${bought.toLocaleString('en-US')}+ sold last month`);
      if (profit > 0 && drop20 >= num(s.minProfit)) good.push('Still meets your profit goal if the price falls 20%');
      if (x.approved === 'yes') good.push('You are approved to sell it');
      if (roi >= num(s.minRoi) * 2) good.push('Return is at least double your goal');
    }
    if (y2027 && price && !fbm) info.push(f.standard ? 'Fees are a 2027 estimate: 2026 rates plus Amazon\'s announced average increase' : 'Fees are 2026 rates. Amazon has not published a 2027 average for bulky items');
    const verdict = stop && price ? 'SKIP' : !ready ? '' : no.length ? 'SKIP' : warn.length ? 'MAYBE' : 'BUY';
    let score = 0;
    if (ready && profit > 0) score = Math.min(35, roi / Math.max(1, num(s.minRoi)) * 18) + Math.min(25, profit / Math.max(.01, num(s.minProfit)) * 12) + (drop20 >= 0 ? 20 : drop10 >= 0 ? 10 : 0) + ((num(x.rank) && num(x.rank) <= num(s.maxRank)) || bought >= 50 ? 10 : 0) + (x.approved === 'yes' ? 10 : 0) - Math.max(0, warn.length - 1) * 4;
    if (no.length) score = Math.min(score, 30);
    score = Math.max(0, Math.min(100, Math.round(score)));
    const today = now.toISOString().slice(0, 10);
    return { verdict, score, profit, roi: r2(roi), margin, unit, costs: c, fees: r2(c.total - unit), payout: r2(price - (c.total - unit)), tier: f.tier, peak, known, breakeven, maxCost, drop10, drop20, stress, dropS, y2027, listed, priceUsed: price, costPct: price && num(x.cost) ? r2(unit / price * 100) : 0, no, warn, good, info, ratesOld: today >= RATES_END };
  }

  const api = { CATS, TIERS, DEFAULTS, RATES_END, referral, closing, isPeak, size, fulfillment, placement, storage, check, num, r2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Fees = api;
})(typeof self !== 'undefined' ? self : this);
