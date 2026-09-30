/* 스파크 M300 정비수첩 — 앱 로직 (외부 라이브러리 없음)
   데이터: db.js (window.SPARK_DB), manual_text.js (지침서 본문, 필요할 때만 불러옴) */
(() => {
  'use strict';

  const DB = window.SPARK_DB;
  const main = document.getElementById('main');
  if (!DB) {
    main.innerHTML = '<div class="wrap"><div class="empty">db.js 를 불러오지 못했습니다. index.html 과 같은 폴더에 db.js 가 있는지 확인하세요.</div></div>';
    return;
  }

  /* ───────── 저장소 (이 브라우저에만 저장) ───────── */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 사생활 보호 모드 등 */ } },
  };
  const KEY = { settings: 'spark.settings.v2', car: 'spark.car.v2', list: 'spark.list.v2', recent: 'spark.recent.v2' };
  const settings = Object.assign({ unit: 'nm', theme: 'auto', big: false, specOnly: true, pdfDir: DB.meta.pdfDir }, store.get(KEY.settings, {}));
  let car = store.get(KEY.car, null);
  let list = store.get(KEY.list, { title: '', items: [] });
  let recent = store.get(KEY.recent, []);
  const saveSettings = () => store.set(KEY.settings, settings);
  const saveList = () => { store.set(KEY.list, list); updateCounts(); };

  /* ───────── 작은 도구들 ───────── */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = n => (n == null ? '' : n.toLocaleString('ko-KR') + '원');
  const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const nospace = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const cmallUrl = id => `http://www.c-mall.co.kr/shop/shopdetail.html?branduid=${encodeURIComponent(id)}`;
  const APP_NAME = '스파크(마티즈크리에이티브) M300 정비 시스템';
  const CONTACT = 'zsdvvv@gmail.com';
  const VOL_NAME = { 1: '일반·바디·브레이크', 2: '드라이브라인·엔진·HVAC', 3: '전원·배선·안전', 4: '시트·스티어링·서스펜션·변속기' };

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('on'), 1800);
  }
  async function copy(text, label = '복사했습니다') {
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* 무시 */ }
      ta.remove();
    }
    toast(label);
  }
  // 공개 사이트(웹)에서는 내 PC의 PDF를 열 수 없고, 지침서 본문은 공개용 빌드에서 뺀다 (tools/make_public.py)
  const PUBLIC = window.SPARK_PUBLIC || null;
  const IS_FILE = location.protocol === 'file:';
  const canPdf = () => IS_FILE || /^https?:/i.test((settings.pdfDir || '').trim());
  const HAS_FULLTEXT = !(PUBLIC && PUBLIC.fulltext === false);
  function pdfHref(v, p) {
    let dir = (settings.pdfDir || '').trim().replace(/\\/g, '/');
    if (dir && !dir.endsWith('/')) dir += '/';
    const file = `${dir}M300_SM_Volume${v}.pdf`;
    const url = /^(file|https?):/i.test(file) ? encodeURI(file) : 'file:///' + encodeURI(file);
    return `${url}#page=${p}`;
  }
  const pdfLink = (v, p, label) => {
    if (canPdf()) return `<a class="open" href="${pdfHref(v, p)}" target="_blank" rel="noopener">${label || `원문 ${p}쪽`} ${icon('ext', 's')}</a>`;
    if (label === '열기') return '';
    return `<span class="open cite" title="정비지침서 Vol.${v} PDF ${p}쪽 — 원문은 가지고 계신 지침서에서 확인하세요">Vol${v} p${p}</span>`;
  };

  /* ───────── 토크 단위 ───────── */
  function fmt(v, d) { return (+v.toFixed(d)).toLocaleString('ko-KR', { maximumFractionDigits: d }); }
  function tqParts(nm, unit = settings.unit) {
    if (unit === 'kgfm') return [fmt(nm * 0.101972, nm < 10 ? 2 : 1), 'kgf·m'];
    if (unit === 'lbft') return nm < 13.6 ? [fmt(nm * 8.85075, 0), 'lb·in'] : [fmt(nm * 0.737562, 0), 'lb·ft'];
    return [fmt(nm, 1), 'N·m'];
  }
  function tqText(t, unit = settings.unit) {
    const [a, u] = tqParts(t.nm, unit);
    let s = a;
    if (t.mx) s += '–' + tqParts(t.mx, unit)[0];
    return { v: s, u, ang: t.ang ? ` ${t.ang.replace('+', '+ ')}` : '' };
  }
  function tqOthers(t) {
    return ['nm', 'kgfm', 'lbft'].filter(u => u !== settings.unit).map(u => { const x = tqText(t, u); return `${x.v} ${x.u}`; }).join(' · ');
  }

  /* ───────── 용어 사전 → 개념 (tools/terms.py 와 같은 규칙) ───────── */
  const MODS = new Set(DB.syn.modifiers);
  const STOP = new Set(DB.syn.stop);
  const IMPLIES = DB.syn.implies || {};
  const OPP = { 프런트: '리어', 리어: '프런트', 운전석: '조수석', 조수석: '운전석', 로어: '어퍼', 어퍼: '로어' };
  const VARIANTS = [];
  for (const g of DB.syn.groups) {
    for (const v of g) {
      const key = nospace(v);
      if (!key) continue;
      const whole = key.length <= 2 || /^[a-z0-9/ ]+$/.test(key);
      const body = [...key].map(reEsc).join('\\s*');
      const src = whole ? `(?<![가-힣a-z0-9])${body}(?![가-힣a-z0-9])` : body;
      VARIANTS.push({ len: key.length, canon: g[0], word: v, re: new RegExp(src), reg: new RegExp(src, 'g') });
    }
  }
  VARIANTS.sort((a, b) => b.len - a.len);
  const MODEL_RE = /^(쉐보레\s*)?(더\s*뉴\s*)?((마티즈\s*크리에이티브|스파크(?!\s*플러그)\s*s?|스파크\s*ev)\s*\/?\s*)+/i;
  const normText = s => s.toLowerCase().replace(/["'\[\]()+&,·•:~]/g, ' ').replace(/\s+/g, ' ').trim();

  function concepts(text) {
    const t = normText(String(text).replace(MODEL_RE, ''));
    const core = new Set(), mods = new Set(), hits = [];
    for (const v of VARIANTS) if (MODS.has(v.canon) && v.re.test(t)) mods.add(v.canon);
    let masked = t;
    for (const v of VARIANTS) {
      if (!v.re.test(masked)) continue;
      if (!MODS.has(v.canon)) { core.add(v.canon); hits.push([v.word, v.canon]); }
      masked = masked.replace(v.reg, ' | ');
    }
    const rest = new Set();
    for (const w of masked.split(/[\s|/\-]+/)) {
      if (w.length >= 2 && !STOP.has(w) && !/^\d+(개|mm|년식?|년형)?$/.test(w)) rest.add(w);
      else if (w.length === 1 && /[가-힣]/.test(w) && masked.trim() === w) rest.add(w);
    }
    return { core, mods, rest, hits };
  }

  /* ───────── 색인 ───────── */
  const P = new Map(DB.parts.map(p => [p.id, p]));
  const T = new Map(DB.torques.map(t => [t.id, t]));
  const DG = new Map(DB.diagrams.map(d => [d.id, d]));
  for (const p of DB.parts) {
    p._k = new Set(p.k.split(' ').filter(Boolean));
    p._ns = nospace(p.n);
    p._pn = p.pn.map(x => x[0]);
  }
  for (const t of DB.torques) {
    t._k = new Set(t.k.split(' ').filter(Boolean));
    t._ns = nospace(t.n);
    t._ctx = nospace(t.s + t.g + t.pr);
  }
  const PROCS = [];
  for (const vol of DB.toc) for (const g of vol.groups) for (const s of g.subs) for (const it of s.items) {
    PROCS.push({ v: vol.v, p: it[0], title: it[1], code: it[2], g: g.g, s: s.s, _k: new Set((it[3] || '').split(' ').filter(Boolean)), _ns: nospace(it[1]) });
  }
  // 도면 → 상품 역참조
  const partDiagrams = new Map();
  for (const d of DB.diagrams) d.pins.forEach((pin, i) => pin.b.forEach(b => {
    if (!partDiagrams.has(b)) partDiagrams.set(b, []);
    partDiagrams.get(b).push([d.id, i]);
  }));
  // 오타 교정용 어휘
  const VOCAB = new Set();
  for (const p of DB.parts) p._k.forEach(w => VOCAB.add(w));
  for (const t of DB.torques) t._k.forEach(w => VOCAB.add(w));
  for (const v of VARIANTS) if (v.len >= 2) VOCAB.add(nospace(v.word));

  /* ───────── 검색 ───────── */
  function parseQuery(raw) {
    const q = String(raw || '').trim();
    const pnums = [...q.matchAll(/([a-z]?)(\d{6,8})(?!\d)/gi)].map(m => m[2]);
    const c = concepts(q.replace(/[a-z]?\d{6,8}/gi, ' '));
    return { raw: q, pnums, ...c, ns: nospace(q.replace(/[a-z]?\d{6,8}/gi, '')) };
  }
  function scoreDoc(q, k, ns, extraNs = '') {
    let s = 0, miss = 0, hit = 0;
    for (const c of q.core) { if (k.has(c)) { s += 4; hit++; } else miss++; }
    for (const w of q.rest) {
      if (ns.includes(w)) { s += 2.5; hit++; }
      else if (k.has(w) || (extraNs && extraNs.includes(w))) { s += 1.5; hit++; }
      else miss++;
    }
    for (const m of q.mods) {
      if (k.has(m)) { s += 1; hit++; }
      else if (OPP[m] && k.has(OPP[m])) { s -= 3; miss++; }
    }
    if (q.ns.length >= 2 && ns.includes(q.ns)) { s += 3; if (!hit) hit = 1; if (miss && q.ns.length >= 3) miss = 0; }
    return { s, miss, hit };
  }
  function searchParts(q) {
    const exact = [], partial = [];
    for (const p of DB.parts) {
      let r;
      if (q.pnums.length) {
        const ok = q.pnums.some(n => p._pn.some(x => x.startsWith(n) || n.startsWith(x)));
        if (!ok) continue;
        r = q.core.size || q.rest.size ? scoreDoc(q, p._k, p._ns) : { s: 10, miss: 0, hit: 1 };
        r.s += 10;
        exact.push([r.s, p]);
        continue;
      }
      r = scoreDoc(q, p._k, p._ns);
      if (!r.hit) continue;
      if (r.miss === 0) exact.push([r.s, p]);
      else if (r.hit >= 1 && r.s > 2) partial.push([r.s - r.miss * 2, p]);
    }
    const by = (a, b) => b[0] - a[0] || (b[1].pr ? 1 : 0) - (a[1].pr ? 1 : 0) || a[1].n.length - b[1].n.length;
    return { exact: exact.sort(by).map(x => x[1]), partial: partial.sort(by).map(x => x[1]) };
  }
  function searchTorques(q) {
    const out = [];
    if (!q.core.size && !q.rest.size && !q.mods.size) return out;
    for (const t of DB.torques) {
      if (t.weak) continue;
      const r = scoreDoc(q, t._k, t._ns, t._ctx);
      if (r.hit && r.miss === 0) out.push([r.s + (t.kind === 'spec' ? 1 : 0), t]);
    }
    out.sort((a, b) => b[0] - a[0]);
    return dedupeTorques(out.map(x => x[1]));
  }
  function dedupeTorques(arr) {
    const seen = new Set();
    return arr.filter(t => { const k = t._ns + '|' + t.nm + '|' + (t.ang || ''); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function searchProcs(q) {
    const out = [];
    if (!q.core.size && !q.rest.size) return out;
    for (const pr of PROCS) {
      const r = scoreDoc(q, pr._k, pr._ns, nospace(pr.s));
      if (r.hit && r.miss === 0) out.push([r.s, pr]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].v - b[1].v || a[1].p - b[1].p);
    const seen = new Set();
    return out.map(x => x[1]).filter(pr => { const k = pr.title; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function levenshtein(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return m[a.length][b.length];
  }
  function suggest(q) {
    // 어휘에 없는 단어를 가장 가까운 단어로 바꿔 본다 (예: 써모스텟 → 써모스탯)
    const fixes = [];
    for (const w of q.rest) {
      if ([...VOCAB].some(v => v.includes(w))) continue;
      let best = null, bd = 9;
      for (const v of VOCAB) {
        if (v.length < 2) continue;
        const d = levenshtein(w, v);
        const lim = w.length >= 5 ? 2 : w.length >= 3 ? 1 : 0;
        if (d <= lim && d < bd) { best = v; bd = d; }
      }
      if (best) fixes.push([w, best]);
    }
    return fixes;
  }

  /* ───────── 내 차에 맞는지 ───────── */
  const CAR_OPTS = {
    model: [['base', '스파크 (2011~15)'], ['S', '스파크S (2013~15)'], ['EV', '스파크 EV'], ['mc', '마티즈 크리에이티브']],
    fuel: [['가솔린', '가솔린'], ['LPG', 'LPG(LPI)']],
    tm: [['AT', '오토 (A/T)'], ['MT', '수동 (M/T)'], ['CVT', 'CVT']],
  };
  const TM_LABEL = { AT: '오토', MT: '수동', CVT: 'CVT' };
  function carLabel() {
    if (!car) return '내 차 설정';
    const m = { base: '스파크', S: '스파크S', EV: '스파크 EV', mc: '마티즈C' }[car.model] || '스파크';
    return [m, car.model !== 'EV' ? car.fuel : null, car.model !== 'EV' ? TM_LABEL[car.tm] : null, car.year ? car.year + '년' : null].filter(Boolean).join(' · ');
  }
  function fitOf(p) {
    if (!car) return null;
    const a = p.a || {};
    const bad = [], warn = [], good = [];
    const model = car.model === 'mc' ? 'base' : car.model;
    if (a.model === 'S' && model !== 'S') bad.push('스파크S 전용 부품');
    if (a.model === 'EV' && model !== 'EV') bad.push('스파크 EV 전용 부품');
    if (model === 'S' && a.notS) bad.push('스파크S에는 맞지 않는다고 적혀 있음');
    if (model === 'EV' && a.fuel && a.model !== 'EV') bad.push(`${a.fuel.join('/')} 엔진용`);
    if (a.model === model && model !== 'base') good.push(model === 'S' ? '스파크S 용' : 'EV 용');
    if (model !== 'EV') {
      if (a.fuel) (a.fuel.includes(car.fuel) ? good : bad).push(a.fuel.includes(car.fuel) ? `${car.fuel} 용` : `${a.fuel.join('/')} 전용`);
      if (a.tm && car.tm) (a.tm.includes(car.tm) ? good : bad).push(a.tm.includes(car.tm) ? `${TM_LABEL[car.tm]} 용` : `${a.tm.map(x => TM_LABEL[x]).join('/')} 전용`);
    }
    if (a.yr && car.year) {
      if (car.year < a.yr[0] || car.year > a.yr[1]) warn.push(`${a.yr[0]}~${a.yr[1]}년식 부품 — 내 차(${car.year}년)는 범위 밖`);
      else good.push(`${a.yr[0]}~${a.yr[1]}년식`);
    }
    const level = bad.length ? 'no' : warn.length ? 'check' : good.length ? 'ok' : null;
    return level ? { level, bad, warn, good } : null;
  }
  function fitTag(p) {
    const f = fitOf(p);
    if (!f) return '';
    if (f.level === 'ok') return `<span class="tag ok">${icon('check', 's')}내 차</span>`;
    if (f.level === 'check') return '<span class="tag warn">연식 확인</span>';
    return '<span class="tag bad">안 맞음</span>';
  }

  /* ───────── 공통 조각 ───────── */
  function partAttrs(p) {
    const a = p.a || {}, bits = [];
    if (a.model === 'S') bits.push('스파크S');
    if (a.model === 'EV') bits.push('EV');
    if (a.fuel) bits.push(a.fuel.join('/'));
    if (a.tm) bits.push(a.tm.map(x => TM_LABEL[x]).join('/'));
    if (a.yr) bits.push(`${a.yr[0]}~${String(a.yr[1]).slice(2)}년`);
    return bits;
  }
  function thumb(p, cls = 'thumb') {
    return p.img
      ? `<img class="${cls}" src="${esc(p.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} none',textContent:'—'}))">`
      : `<span class="${cls} none">—</span>`;
  }
  function partRow(p) {
    const pn = p.pn.length ? `<span class="mono">${esc(p.pn[0][0])}${p.pn.length > 1 ? ` 외 ${p.pn.length - 1}` : ''}</span>` : '';
    const f = fitOf(p);
    return `<button class="row${f && f.level === 'no' ? ' dim' : ''}" type="button" data-open="part:${esc(p.id)}">
      ${thumb(p)}
      <span><span class="t">${esc(p.n)}</span>
        <span class="sub">${fitTag(p)}<span>${esc(p.c)}</span>${pn}${partAttrs(p).map(x => `<span class="tag">${esc(x)}</span>`).join('')}${p.so ? '<span class="tag bad">품절</span>' : ''}${partDiagrams.has(p.id) ? `<span class="tag sig">${icon('pin', 's')}도면</span>` : ''}</span></span>
      <span class="price num">${p.pr ? won(p.pr) : '<small>가격 없음</small>'}</span>
    </button>`;
  }
  function tqRow(t, opts = {}) {
    const x = tqText(t);
    const alt = t.alt && t.alt.length ? '<span class="tag warn">지침서 내 값 다름</span>' : '';
    return `<div class="tq${t.kind === 'step' ? ' step' : ''}" role="button" tabindex="0" data-open="torque:${esc(t.id)}">
      <div><div class="t">${esc(t.n)}${t.q ? ` <span class="faint small">×${t.q}</span>` : ''}</div>
        <div class="src">${opts.noSub ? '' : `<span>${esc(t.s)}</span>`}<span class="mono">Vol${t.v} ${esc(t.code)}</span>${t.kind === 'step' && t.pr ? `<span>· ${esc(t.pr)}</span>` : ''}${alt}</div></div>
      <div class="v"><b>${x.v}</b><span>${x.u}${esc(x.ang)}</span><small>${tqOthers(t)}</small></div>
    </div>`;
  }
  function procRow(pr, hl) {
    const title = hl ? highlight(pr.title, hl) : esc(pr.title);
    return `<div class="pg"><span class="code">${esc(pr.code || '')}</span><span class="t">${title}<small>Vol${pr.v} · ${esc(pr.s)}</small></span>${pdfLink(pr.v, pr.p, `${pr.p}쪽`)}</div>`;
  }
  function highlight(text, words) {
    let s = esc(text);
    for (const w of words) {
      if (!w || w.length < 2) continue;
      const re = new RegExp([...w].map(reEsc).join('\\s?'), 'gi');
      s = s.replace(re, m => `<mark>${m}</mark>`);
    }
    return s;
  }

  /* ───────── 화면: 찾기 ───────── */
  const JOBS = [
    ['엔진오일 교환', '오일 필터·드레인 플러그', '오일 필터'],
    ['점화플러그', '플러그·점화코일', '점화플러그'],
    ['휀벨트 교환', '구동벨트·텐셔너', '휀벨트'],
    ['냉각수 호스', '라디에이터·히터 호스', '라디에이터 호스'],
    ['서모스탯·워터펌프', '냉각 계통', '서모스탯'],
    ['앞 브레이크 패드', '패드·캘리퍼', '프런트 브레이크 패드'],
    ['브레이크 디스크', '디스크·고정 볼트', '브레이크 디스크'],
    ['앞 쇼바', '스트럿·마운트', '프런트 쇼바'],
    ['로어암', '볼조인트·부싱', '로어암'],
    ['활대 링크', '스테빌라이저', '활대링크'],
    ['엔진·미션 미미', '마운트', '미미'],
    ['와이퍼', '블레이드·모터', '와이퍼'],
    ['에어컨 필터', '항균 필터', '에어컨 필터'],
    ['전구·램프', '헤드램프·테일램프', '전구'],
  ];
  let findState = { cat: null, sort: 'rel', onlyPrice: false, onlyFit: false, showN: 40 };

  function viewFind(params) {
    const q = params.get('q') || '';
    $('#q').value = q;
    if (!q.trim()) return renderHome();
    renderResults(q);
  }

  function renderHome() {
    const recentHtml = recent.slice(0, 8).map(r => {
      if (r.t === 'part' && P.has(r.id)) { const p = P.get(r.id); return `<button class="row" type="button" data-open="part:${esc(p.id)}">${thumb(p)}<span><span class="t">${esc(p.n)}</span><span class="sub">${esc(p.c)}</span></span><span class="price num">${won(p.pr)}</span></button>`; }
      if (r.t === 'torque' && T.has(r.id)) return tqRow(T.get(r.id));
      return '';
    }).join('');
    const dgs = [...DB.diagrams].sort((a, b) => b.pins.length - a.pins.length).slice(0, 6);
    const c = DB.meta.counts;
    main.innerHTML = `<div class="wrap">
      <section class="hello">
        <h1>${APP_NAME}</h1>
        <p class="only-m300"><span class="tag acc">M300 전용</span> 2009~2015 마티즈 크리에이티브·스파크·스파크S·스파크 EV 용입니다. 더 넥스트 스파크(M400)와는 부품이 다릅니다.</p>
        <p>부품 이름이나 GM 품번을 위 칸에 입력하세요. 쇼바·미미·로아암 같은 말도 알아듣습니다. 씨몰 가격, 조임 토크, 정비지침서 쪽, 분해도 위치가 한 번에 나옵니다.</p>
      </section>
      <h2 class="sec">자주 하는 정비</h2>
      <div class="jobs">${JOBS.map(([t, s, q]) => `<button class="job" type="button" data-q="${esc(q)}"><b>${esc(t)}</b><span>${esc(s)}</span></button>`).join('')}</div>
      <div class="home-grid">
        <div>
          <h2 class="sec">분해도로 찾기 <a class="more" href="#/diagrams">전체 ${DB.diagrams.length}장 보기</a></h2>
          ${dgs.length ? `<div class="dg-grid">${dgs.map(dgCard).join('')}</div>` : '<div class="empty">분해도 데이터가 없습니다.</div>'}
        </div>
        <div>
          <h2 class="sec">최근 본 것 ${recent.length ? '<button class="btn ghost sm more" type="button" data-act="clear-recent">지우기</button>' : ''}</h2>
          ${recentHtml ? `<div class="rows">${recentHtml}</div>` : '<div class="note">부품이나 토크를 열어 보면 여기에 남습니다.</div>'}
          ${list.items.length ? `<h2 class="sec">작업 목록 <a class="more" href="#/list">열기</a></h2><div class="note"><b>${list.items.length}개</b> 담겨 있습니다${listTotal() ? ` · 부품 합계 <b>${won(listTotal())}</b>` : ''}.</div>` : ''}
        </div>
      </div>
      <div class="stat-line">
        <span>씨몰 상품 <b>${c.parts.toLocaleString()}</b>개 (가격 <b>${c.priced.toLocaleString()}</b>개, ${esc(DB.meta.built)} 기준)</span>
        <span>지침서 조임 토크 <b>${c.torques}</b>개 (제원표 ${c.spec})</span>
        <span>분해도 <b>${c.diagrams}</b>장 · 핀 ${c.pins}</span>
        <span>지침서 <b>${c.pages.toLocaleString()}</b>쪽</span>
        <span>데이터 v${esc(DB.meta.version)}</span>
      </div>
      <p class="maker-note">제작자는 자동차정비산업기사 실기(’26년 10월) 수험생으로, M300으로 공부하고 있습니다.
        c-mall 등이 자주 접속되지 않아 학습에 어려움을 겪어, 학습용으로 이 시스템을 직접 만들었습니다.
        공개된 정보만 이용했으며 공개 자료 자체의 오류(약 8%)가 포함되어 있을 수 있습니다. 이용에 따른 책임은 이용자 본인에게 있습니다.</p>
    </div>`;
  }

  function renderResults(raw) {
    const q = parseQuery(raw);
    let used = q, fixes = [];
    let parts = searchParts(q);
    if (!parts.exact.length && !q.pnums.length) {
      fixes = suggest(q);
      if (fixes.length) {
        const fixed = fixes.reduce((s, [a, b]) => s.replace(a, b), raw);
        used = parseQuery(fixed);
        parts = searchParts(used);
      }
    }
    let rows = parts.exact.length ? parts.exact : parts.partial;
    let procs = searchProcs(used);
    // 품번으로 찾았거나 제목이 맞는 절차가 없으면, 찾은 부품에 연결된 절차를 보여 준다
    if (!procs.length && parts.exact.length) {
      const seen = new Set();
      parts.exact.slice(0, 5).forEach(p => p.pg.forEach(([key, ti]) => {
        const pr = PROCS.find(x => `${x.v}-${x.p}` === key && x.title === ti);
        if (pr && !seen.has(ti)) { seen.add(ti); procs.push(pr); }
      }));
    }
    // 토크: 이름이 맞는 것 → 찾은 부품에 연결된 것 → 맞는 절차 속 값 순서
    const fromParts = parts.exact.slice(0, 5).flatMap(p => p.tq.map(id => T.get(id))).filter(Boolean);
    const fromProcs = procs.slice(0, 3).flatMap(pr => DB.torques.filter(t => !t.weak && t.pr === pr.title && t.v === pr.v));
    const tqs = dedupeTorques([...searchTorques(used), ...fromParts, ...fromProcs])
      .sort((a, b) => (a.kind === 'spec' ? 0 : 1) - (b.kind === 'spec' ? 0 : 1));
    const isPartial = !parts.exact.length && parts.partial.length > 0;
    const cats = new Map();
    rows.forEach(p => cats.set(p.c, (cats.get(p.c) || 0) + 1));
    if (findState.cat && !cats.has(findState.cat)) findState.cat = null;
    let shown = rows.filter(p => (!findState.cat || p.c === findState.cat) && (!findState.onlyPrice || p.pr) && (!findState.onlyFit || !fitOf(p) || fitOf(p).level !== 'no'));
    if (findState.sort === 'price') shown = [...shown].sort((a, b) => (a.pr || 9e9) - (b.pr || 9e9));
    // 검색된 부품이 들어 있는 분해도
    const dgHits = new Map();
    rows.slice(0, 60).forEach(p => (partDiagrams.get(p.id) || []).forEach(([d]) => dgHits.set(d, (dgHits.get(d) || 0) + 1)));
    const dgs = [...dgHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d]) => DG.get(d)).filter(Boolean);

    const expl = [];
    if (fixes.length) expl.push(`<span>‘${esc(fixes.map(f => f[0]).join(', '))}’을(를) <b>‘${esc(fixes.map(f => f[1]).join(', '))}’</b>로 고쳐 찾았습니다.</span>`);
    if (used.hits.length) expl.push('<span>이렇게 알아들었어요:</span>' + used.hits.map(([w, c]) => `<span class="tag acc">${esc(w)}${nospace(w) !== nospace(c) ? ' → ' + esc(c) : ''}</span>`).join(''));
    if (used.mods.size) expl.push([...used.mods].map(m => `<span class="tag">${esc(m)}</span>`).join(''));
    if (q.pnums.length) expl.push(`<span>품번</span><span class="tag acc mono">${esc(q.pnums.join(', '))}</span>`);

    main.innerHTML = `<div class="wrap">
      <div class="view-head"><div><h1>‘${esc(raw)}’</h1><p>${isPartial ? '정확히 맞는 부품이 없어 비슷한 것을 보여 드립니다.' : `부품 ${rows.length}개 · 조임 토크 ${tqs.length}개 · 정비 절차 ${procs.length}개`}</p></div></div>
      ${expl.length ? `<div class="expl">${expl.join('')}</div>` : ''}
      <div class="results">
        <section>
          <h2 class="sec">씨몰 순정부품 <span class="n">${shown.length}</span></h2>
          ${rows.length ? `<div class="filters">
            <div class="pills">${[...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `<button class="pill" type="button" data-cat="${esc(c)}" aria-pressed="${findState.cat === c}">${esc(c)} <span class="n">${n}</span></button>`).join('')}</div>
          </div>
          <div class="filters">
            <div class="seg" role="group" aria-label="정렬"><button type="button" data-sort="rel" aria-pressed="${findState.sort === 'rel'}">관련도</button><button type="button" data-sort="price" aria-pressed="${findState.sort === 'price'}">낮은 가격</button></div>
            <button class="pill" type="button" data-flt="onlyPrice" aria-pressed="${findState.onlyPrice}">가격 있는 것만</button>
            ${car ? `<button class="pill" type="button" data-flt="onlyFit" aria-pressed="${findState.onlyFit}">내 차에 안 맞는 것 빼기</button>` : '<button class="pill" type="button" data-act="car">내 차 설정하고 걸러 보기</button>'}
          </div>` : ''}
          ${shown.length ? `<div class="rows">${shown.slice(0, findState.showN).map(partRow).join('')}</div>
            ${shown.length > findState.showN ? `<div style="text-align:center;margin-top:12px"><button class="btn" type="button" data-act="more">${shown.length - findState.showN}개 더 보기</button></div>` : ''}`
            : `<div class="empty">씨몰 상품 중 맞는 것이 없습니다.<br><span class="small">다른 이름(예: 쇼바 ↔ 쇼크업소버)이나 GM 품번 8자리로 찾아보세요.</span></div>`}
        </section>
        <aside class="col-side">
          <h2 class="sec">조임 토크 <span class="n">${tqs.length}</span>${tqs.length > 6 ? `<a class="more" href="#/torque?q=${encodeURIComponent(raw)}">모두 보기</a>` : ''}</h2>
          ${tqs.length ? `<div class="rows">${tqs.slice(0, 6).map(t => tqRow(t)).join('')}</div>` : '<div class="note">이 검색어로 찾은 조임 토크가 없습니다. 부품을 열면 연결된 토크가 보입니다.</div>'}
          <h2 class="sec">정비 절차 (지침서) <span class="n">${procs.length}</span></h2>
          ${procs.length ? `<div class="rows">${procs.slice(0, 6).map(pr => procRow(pr, [...used.rest])).join('')}</div>` : '<div class="note">제목이 맞는 절차가 없습니다.</div>'}
          ${HAS_FULLTEXT ? `<h2 class="sec">지침서 본문에서 <span class="n" id="ftCount"></span><a class="more" href="#/manual?ft=${encodeURIComponent(raw)}">본문 검색</a></h2>
          <div id="ftBox"><div class="note small">본문을 불러오는 중…</div></div>` : ''}
          ${dgs.length ? `<h2 class="sec">분해도</h2><div class="dg-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">${dgs.map(dgCard).join('')}</div>` : ''}
        </aside>
      </div>
    </div>`;
    if (HAS_FULLTEXT) fullTextInto($('#ftBox'), raw, 4, $('#ftCount'));
  }

  /* 지침서 본문 검색 (manual_text.js 를 처음 쓸 때 불러온다) */
  let manualTextPromise = null;
  function loadManualText() {
    if (window.MANUAL_TEXT) return Promise.resolve();
    if (!manualTextPromise) manualTextPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'manual_text.js';
      s.onload = () => res();
      s.onerror = () => { manualTextPromise = null; rej(new Error('manual_text.js')); };
      document.body.appendChild(s);
    });
    return manualTextPromise;
  }
  function synonymsOf(w) {
    const k = nospace(w);
    const g = DB.syn.groups.find(gr => gr.some(v => nospace(v) === k));
    const alts = g ? g.map(nospace).filter(v => v.length >= 2 && !/^[a-z0-9/ ]+$/.test(v)) : [];
    return [...new Set([k, ...alts])].sort((a, b) => b.length - a.length);
  }
  function fullText(raw, limit = 40) {
    const words = raw.trim().split(/\s+/).filter(w => w.length >= 2 && !/^\d{6,8}$/.test(w));
    if (!words.length) return [];
    // 낱말마다 같은 뜻 표기를 모두 허용 (쇼바 → 스트러트·쇼크업소버 …)
    const res = words.map(w => new RegExp(synonymsOf(w).map(v => [...v].map(reEsc).join('\\s?')).join('|'), 'gi'));
    const out = [];
    for (const [key, text] of Object.entries(window.MANUAL_TEXT)) {
      let score = 0, first = -1;
      for (const re of res) {
        re.lastIndex = 0;
        const m = text.match(re);
        if (!m) { score = 0; break; }
        score += m.length;
        if (first < 0) { re.lastIndex = 0; const mm = re.exec(text); first = mm ? mm.index : 0; }
      }
      if (score) out.push({ key, score, first, text });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit).map(o => {
      const [v, p] = o.key.split('-').map(Number);
      const meta = DB.pages[o.key] || ['', '', ''];
      const a = Math.max(0, o.first - 50);
      return { v, p, code: meta[0], g: meta[1], s: meta[2], snip: (a ? '…' : '') + o.text.slice(a, a + 150) + '…', words: words.flatMap(synonymsOf) };
    });
  }
  function fullTextInto(box, raw, limit, countEl) {
    loadManualText().then(() => {
      if (!box.isConnected) return;
      const hits = fullText(raw, 60);
      if (countEl) countEl.textContent = hits.length >= 60 ? '60+' : hits.length;
      box.innerHTML = hits.length
        ? `<div class="rows">${hits.slice(0, limit).map(h => `<div class="pg"><span class="code">${esc(h.code)}</span><span class="t"><span class="small">${highlight(h.snip, h.words)}</span><small>Vol${h.v} · ${esc(h.s)}</small></span>${pdfLink(h.v, h.p, `${h.p}쪽`)}</div>`).join('')}</div>`
        : '<div class="note small">본문에서도 찾지 못했습니다.</div>';
    }).catch(() => { if (box.isConnected) box.innerHTML = '<div class="note small">manual_text.js 를 불러오지 못해 본문 검색을 쓸 수 없습니다.</div>'; });
  }

  /* ───────── 화면: 분해도 목록 ───────── */
  let dgState = { sys: null, q: '' };
  function dgCard(d) {
    const n = d.pins.length;
    return `<a class="dg-card" href="#/diagram/${esc(d.id)}"><span class="img"><img src="${esc(d.img)}" alt="" loading="lazy"></span><span class="meta"><b>${esc(d.t)}</b><span>${esc(d.sys)} · 부품 핀 ${n}개</span></span></a>`;
  }
  function viewDiagrams() {
    const systems = new Map();
    DB.diagrams.forEach(d => systems.set(d.sys, (systems.get(d.sys) || 0) + 1));
    const qn = nospace(dgState.q);
    const qc = dgState.q ? parseQuery(dgState.q) : null;
    const items = DB.diagrams.filter(d => (!dgState.sys || d.sys === dgState.sys) && (!qn || nospace(d.t).includes(qn) || d.pins.some(pin => pin.b.some(b => {
      const p = P.get(b); if (!p) return false;
      if (p._ns.includes(qn)) return true;
      const r = scoreDoc(qc, p._k, p._ns); return r.hit && !r.miss;
    }))));
    main.innerHTML = `<div class="wrap">
      <div class="view-head"><div><h1>분해도</h1><p>씨몰 상품 설명에 실린 GM 부품 분해도입니다. 도면의 번호를 누르면 그 부품의 가격·품번·조임 토크가 나옵니다.</p></div>
        <input class="field" style="max-width:280px" id="dgQ" type="search" placeholder="도면·부품 이름으로 검색" value="${esc(dgState.q)}"></div>
      <div class="pills" style="margin-bottom:16px">
        <button class="pill" type="button" data-sys="" aria-pressed="${!dgState.sys}">전체 <span class="n">${DB.diagrams.length}</span></button>
        ${[...systems.entries()].sort((a, b) => (a[0] === '기타') - (b[0] === '기타') || b[1] - a[1]).map(([s, n]) => `<button class="pill" type="button" data-sys="${esc(s)}" aria-pressed="${dgState.sys === s}">${esc(s)} <span class="n">${n}</span></button>`).join('')}
      </div>
      ${items.length ? `<div class="dg-grid">${items.map(dgCard).join('')}</div>` : '<div class="empty">조건에 맞는 분해도가 없습니다.</div>'}
    </div>`;
    const inp = $('#dgQ');
    inp.addEventListener('input', debounce(() => { dgState.q = inp.value; const pos = inp.selectionStart; viewDiagrams(); const n = $('#dgQ'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
  }

  /* ───────── 화면: 분해도 보기 ───────── */
  let viewer = null;
  function pinLabel(pin) { return pin.n == null ? '·' : String(pin.n); }
  function pinTitle(pin) {
    const ps = pin.b.map(b => P.get(b)).filter(Boolean);
    if (!ps.length) return '';
    return ps[0].n.replace(MODEL_RE, '') + (ps.length > 1 ? ` 외 ${ps.length - 1}` : '');
  }
  function viewDiagram(id, params) {
    const d = DG.get(id);
    if (!d) { main.innerHTML = '<div class="wrap"><div class="empty">분해도를 찾을 수 없습니다. <a href="#/diagrams">목록으로</a></div></div>'; return; }
    const sel = params.get('pin');
    main.innerHTML = `<div class="wrap" style="max-width:none">
      <div class="view-head"><div><a class="small" href="#/diagrams">← 분해도 목록</a><h1 style="margin-top:4px">${esc(d.t)}</h1><p>${esc(d.sys)} · 번호 핀 ${d.pins.length}개 · 핀을 누르면 부품 정보가 열립니다</p></div></div>
      <div class="dv">
        <div class="dv-stage" id="stage">
          <div class="dv-canvas" id="canvas" style="width:${d.w}px;height:${d.h}px">
            <img class="dv-img" src="${esc(d.img)}" width="${d.w}" height="${d.h}" alt="${esc(d.t)} 분해도" draggable="false">
            ${d.pins.map((pin, i) => `<button class="pin${pin.n == null ? ' nonum' : ''}" type="button" data-pin="${i}" style="left:${pin.x}px;top:${pin.y}px" title="${esc(pinLabel(pin) + ' ' + pinTitle(pin))}" aria-label="${esc(pinLabel(pin))}번 ${esc(pinTitle(pin))}">${pin.n == null ? '' : pin.n}</button>`).join('')}
          </div>
          <div class="dv-tools">
            <button class="btn icon" type="button" data-z="in" aria-label="확대">${icon('plus')}</button>
            <button class="btn icon" type="button" data-z="out" aria-label="축소">${icon('minus')}</button>
            <button class="btn icon" type="button" data-z="fit" aria-label="화면에 맞춤">${icon('fit')}</button>
          </div>
          <div class="dv-hint">휠·두 손가락으로 확대, 끌어서 이동</div>
        </div>
        <div class="dv-side">
          <div class="hd"><input class="field" id="pinQ" type="search" placeholder="이 도면에서만 부품 검색"></div>
          <div class="dv-list" id="pinList">${d.pins.map((pin, i) => {
            const ps = pin.b.map(b => P.get(b)).filter(Boolean);
            const prices = ps.map(p => p.pr).filter(Boolean);
            return `<div class="dv-item" data-pin="${i}" data-text="${esc(nospace(ps.map(p => p.n).join(' ')))}" role="button" tabindex="0">
              <span class="no${pin.n == null ? ' nonum' : ''}">${pin.n == null ? '·' : pin.n}</span>
              <span class="t">${esc(pinTitle(pin))}</span>
              <span class="p num">${prices.length ? won(Math.min(...prices)) : ''}</span></div>`;
          }).join('')}</div>
        </div>
      </div>
    </div>`;
    const stage = $('#stage'), canvas = $('#canvas');
    viewer = makeViewer(stage, canvas, d.w, d.h, i => selectPin(d, i, true));
    const img = $('.dv-img', canvas);
    const ready = () => { viewer.fit(); if (sel != null && d.pins[+sel]) { viewer.focus(d.pins[+sel].x, d.pins[+sel].y); selectPin(d, +sel, true); } };
    if (img.complete) requestAnimationFrame(ready); else img.addEventListener('load', ready, { once: true });
    $$('[data-z]', stage).forEach(b => b.addEventListener('click', () => {
      const r = stage.getBoundingClientRect();
      if (b.dataset.z === 'fit') viewer.fit(); else viewer.zoomAt(b.dataset.z === 'in' ? 1.4 : 1 / 1.4, r.width / 2, r.height / 2);
    }));
    const listEl = $('#pinList');
    listEl.addEventListener('click', e => { const it = e.target.closest('.dv-item'); if (it) { const i = +it.dataset.pin; viewer.focus(d.pins[i].x, d.pins[i].y); selectPin(d, i, true); } });
    listEl.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.closest('.dv-item')?.click(); });
    const hot = (i, on) => { $(`.pin[data-pin="${i}"]`, canvas)?.classList.toggle('hot', on); $(`.dv-item[data-pin="${i}"]`, listEl)?.classList.toggle('hot', on); };
    listEl.addEventListener('mouseover', e => { const it = e.target.closest('.dv-item'); if (it) hot(it.dataset.pin, true); });
    listEl.addEventListener('mouseout', e => { const it = e.target.closest('.dv-item'); if (it) hot(it.dataset.pin, false); });
    canvas.addEventListener('mouseover', e => { const p = e.target.closest('.pin'); if (p) hot(p.dataset.pin, true); });
    canvas.addEventListener('mouseout', e => { const p = e.target.closest('.pin'); if (p) hot(p.dataset.pin, false); });
    $('#pinQ').addEventListener('input', e => {
      const qn = nospace(e.target.value);
      $$('.dv-item', listEl).forEach(it => { const on = !qn || it.dataset.text.includes(qn) || it.querySelector('.no').textContent === e.target.value.trim(); it.classList.toggle('hidden', !on); $(`.pin[data-pin="${it.dataset.pin}"]`, canvas)?.classList.toggle('faded', !on); });
    });
  }
  function selectPin(d, i, open) {
    $$('.pin.active').forEach(x => x.classList.remove('active'));
    $$('.dv-item.active').forEach(x => x.classList.remove('active'));
    $(`.pin[data-pin="${i}"]`)?.classList.add('active');
    const it = $(`.dv-item[data-pin="${i}"]`);
    if (it) { it.classList.add('active'); it.scrollIntoView({ block: 'nearest' }); }
    const url = `#/diagram/${d.id}?pin=${i}`;
    if (location.hash !== url) history.replaceState(history.state, '', url);
    if (open) openPanel({ type: 'pin', d: d.id, i }, { reset: true });
  }
  function makeViewer(stage, canvas, w, h, onPin) {
    let s = 1, x = 0, y = 0, minS = 0.2;
    const pts = new Map();
    let pinch = null, moved = 0, downTarget = null;
    const apply = () => { canvas.style.transform = `translate(${x}px, ${y}px) scale(${s})`; canvas.style.setProperty('--inv', String(Math.min(2.2, Math.max(0.55, 1 / s)))); };
    const clamp = v => Math.min(6, Math.max(minS, v));
    function fit() {
      const r = stage.getBoundingClientRect();
      s = Math.min(r.width / w, r.height / h) * 0.96; minS = s * 0.6;
      x = (r.width - w * s) / 2; y = (r.height - h * s) / 2; apply();
    }
    function zoomAt(f, cx, cy) { const ns = clamp(s * f); x = cx - (cx - x) * (ns / s); y = cy - (cy - y) * (ns / s); s = ns; apply(); }
    function focus(px, py) {
      const r = stage.getBoundingClientRect();
      s = clamp(Math.max(s, Math.min(r.width / w, r.height / h) * 1.8));
      x = r.width / 2 - px * s; y = r.height / 2 - py * s;
      canvas.style.transition = 'transform .25s ease'; apply();
      setTimeout(() => { canvas.style.transition = ''; }, 260);
    }
    stage.addEventListener('wheel', e => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.dv-tools')) return;
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { moved = 0; downTarget = e.target.closest('.pin'); stage.classList.add('dragging'); }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s };
      }
    });
    stage.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        x += dx; y += dy; apply();
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const r = stage.getBoundingClientRect();
        const nd = Math.hypot(a.x - b.x, a.y - b.y);
        moved += 10;
        zoomAt((pinch.s * nd / pinch.d) / s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      }
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) {
        stage.classList.remove('dragging');
        if (moved < 6 && downTarget) onPin(+downTarget.dataset.pin);
        downTarget = null;
      }
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', e => { const r = stage.getBoundingClientRect(); zoomAt(1.8, e.clientX - r.left, e.clientY - r.top); });
    stage.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('.pin')) onPin(+e.target.dataset.pin); });
    window.addEventListener('resize', debounce(() => { if (stage.isConnected) fit(); }, 150));
    return { fit, zoomAt, focus };
  }

  /* ───────── 화면: 조임 토크 ───────── */
  let tqState = { q: '' };
  function viewTorque(params) {
    if (params.has('q')) tqState.q = params.get('q');
    const q = tqState.q.trim() ? parseQuery(tqState.q) : null;
    let items = DB.torques.filter(t => !t.weak && (!settings.specOnly || t.kind === 'spec'));
    if (q) items = items.filter(t => { const r = scoreDoc(q, t._k, t._ns, t._ctx); return r.hit && !r.miss; });
    // 같은 소분류·같은 이름·같은 값은 한 줄로
    const groups = new Map();
    for (const t of items) {
      const key = `${t.v}|${t.g}|${t.s}`;
      if (!groups.has(key)) groups.set(key, { v: t.v, g: t.g, s: t.s, first: t.p, items: [] });
      groups.get(key).items.push(t);
    }
    const secs = [...groups.values()].sort((a, b) => a.v - b.v || a.first - b.first);
    secs.forEach(sec => { sec.items = dedupeTorques(sec.items.sort((a, b) => a.p - b.p)); });
    const byG = new Map();
    secs.forEach((sec, i) => { const k = `Vol${sec.v} · ${sec.g}`; if (!byG.has(k)) byG.set(k, []); byG.get(k).push([sec, i]); });
    main.innerHTML = `<div class="wrap">
      <div class="view-head"><div><h1>조임 토크</h1><p>정비지침서 원문에서 다시 뽑은 값입니다. 모든 값에 권·쪽을 달았으니 중요한 체결 전에는 원문을 한 번 더 확인하세요.</p></div></div>
      <div class="tq-tools">
        <input class="field grow" id="tqQ" type="search" placeholder="부품 이름으로 검색 (예: 캘리퍼, 휠 너트, 쇼바)" value="${esc(tqState.q)}">
        <div class="seg" role="group" aria-label="단위">${[['nm', 'N·m'], ['kgfm', 'kgf·m'], ['lbft', 'lb·ft']].map(([u, l]) => `<button type="button" data-unit="${u}" aria-pressed="${settings.unit === u}">${l}</button>`).join('')}</div>
        <div class="seg" role="group" aria-label="범위"><button type="button" data-spec="1" aria-pressed="${settings.specOnly}">제원표 값</button><button type="button" data-spec="0" aria-pressed="${!settings.specOnly}">절차 속 값까지</button></div>
      </div>
      <details class="box conv-box"${window.innerWidth > 760 ? ' open' : ''}>
        <summary class="small muted"><b style="color:var(--ink)">단위 환산</b> — 아무 칸에나 숫자를 넣으세요</summary>
        <div class="conv">${[['nm', 'N·m'], ['kgfm', 'kgf·m'], ['lbft', 'lb·ft'], ['lbin', 'lb·in']].map(([u, l]) => `<div><label for="cv-${u}">${l}</label><input class="field num" id="cv-${u}" data-cv="${u}" inputmode="decimal" type="text"></div>`).join('')}</div>
      </details>
      <select class="field toc-jump" aria-label="분류로 이동"><option value="">분류로 이동…</option>${secs.map((sec, i) => `<option value="tq-${i}">Vol${sec.v} · ${esc(sec.s)} (${sec.items.length})</option>`).join('')}</select>
      <div class="tq-layout">
        <nav class="toc-side" aria-label="토크 분류">${[...byG.entries()].map(([g, arr]) => `<div class="g">${esc(g)}</div>${arr.map(([sec, i]) => `<a href="#tq-${i}" data-jump="tq-${i}">${esc(sec.s)} <span class="faint">${sec.items.length}</span></a>`).join('')}`).join('')}</nav>
        <div>${secs.length ? secs.map((sec, i) => `<section class="tq-group" id="tq-${i}"><h3>${esc(sec.s)} <small>Vol${sec.v} · ${esc(sec.g)}</small></h3>${sec.items.map(t => tqRow(t, { noSub: true })).join('')}</section>`).join('')
          : `<div class="empty">맞는 토크가 없습니다.${settings.specOnly ? ' ‘절차 속 값까지’를 눌러 보세요.' : ''}</div>`}</div>
      </div>
    </div>`;
    $('.toc-jump').addEventListener('change', e => { if (e.target.value) document.getElementById(e.target.value)?.scrollIntoView({ behavior: 'smooth' }); });
    const inp = $('#tqQ');
    inp.addEventListener('input', debounce(() => { tqState.q = inp.value; const pos = inp.selectionStart; viewTorque(new URLSearchParams()); const n = $('#tqQ'); n.focus(); n.setSelectionRange(pos, pos); }, 250));
    const F = { nm: 1, kgfm: 1 / 0.101972, lbft: 1 / 0.737562, lbin: 1 / 8.85075 };
    $$('[data-cv]').forEach(el => el.addEventListener('input', () => {
      const v = parseFloat(el.value.replace(',', '.'));
      if (isNaN(v)) return;
      const nm = v * F[el.dataset.cv];
      $$('[data-cv]').forEach(o => { if (o !== el) o.value = fmt(nm / F[o.dataset.cv], o.dataset.cv === 'kgfm' ? 2 : 1).replace(/,/g, ''); });
    }));
  }

  /* ───────── 화면: 정비지침서 ───────── */
  let manState = { v: 1, ft: '' };
  function viewManual(params) {
    if (params.has('v')) manState.v = +params.get('v') || 1;
    if (params.has('ft')) manState.ft = params.get('ft');
    const vol = DB.toc.find(x => x.v === manState.v) || DB.toc[0];
    main.innerHTML = `<div class="wrap">
      <div class="view-head"><div><h1>정비지침서</h1><p>2010 Matiz Creative(M300) 정비지침서 4권의 목차입니다. ${canPdf() ? '제목을 누르면 PDF가 그 쪽에서 열립니다.' : '쪽 번호를 참고해 가지고 계신 정비지침서에서 찾아보세요.'}</p></div></div>
      <div class="vol-tabs">${DB.toc.map(x => `<button class="pill" type="button" data-vol="${x.v}" aria-pressed="${x.v === vol.v}">Vol.${x.v} <span class="n">${esc(VOL_NAME[x.v])}</span></button>`).join('')}</div>
      <div class="man-layout">
        <div>${vol.groups.map((g, gi) => `<details class="grp"${gi === 0 ? ' open' : ''}><summary>${esc(g.g)} <small>${g.subs.length}개 단원</small></summary>
          ${g.subs.map(s => `<div class="subsec"><h4>${esc(s.s)} <small>${s.from}–${s.to}쪽</small> ${pdfLink(vol.v, s.from, '열기')}</h4>
            ${s.items.length ? `<ul class="proc-list">${s.items.map(it => `<li><span class="code">${esc(it[2])}</span>${canPdf() ? `<a href="${pdfHref(vol.v, it[0])}" target="_blank" rel="noopener">${esc(it[1])}</a>` : `<span>${esc(it[1])} <span class="faint xs">p${it[0]}</span></span>`}</li>`).join('')}</ul>` : ''}</div>`).join('')}
        </details>`).join('')}</div>
        <aside>
          ${HAS_FULLTEXT ? `<div class="box" style="padding:16px">
            <label class="lbl" for="ftQ">지침서 본문 검색</label>
            <input class="field" id="ftQ" type="search" placeholder="예: 블리딩, 드레인 플러그, 냉각수 용량" value="${esc(manState.ft)}">
            <div id="ftRes" style="margin-top:10px"></div>
          </div>` : ''}
          ${canPdf() ? `<div class="box pdf-set" style="padding:16px;margin-top:14px">
            <b>PDF 위치</b>
            <div style="margin:6px 0"><code>${esc(settings.pdfDir)}</code></div>
            <div class="muted">PDF 링크는 이 파일(index.html)을 내 컴퓨터에서 직접 열었을 때 동작합니다. 폴더를 옮겼다면 설정에서 바꾸세요.</div>
            <div style="display:flex;gap:8px;margin-top:10px"><a class="btn sm" href="${pdfHref(1, 1)}" target="_blank" rel="noopener">열리는지 확인</a><button class="btn sm" type="button" data-act="settings">경로 바꾸기</button></div>
          </div>` : `<div class="note small">정비지침서 원문(PDF)은 저작권 때문에 이 사이트에 올리지 않았습니다. 목차·쪽 번호와 조임 토크 값만 제공합니다.</div>`}
        </aside>
      </div>
    </div>`;
    if (!HAS_FULLTEXT) return;
    const inp = $('#ftQ'), res = $('#ftRes');
    const run = () => {
      manState.ft = inp.value;
      if (inp.value.trim().length < 2) { res.innerHTML = '<div class="faint small">두 글자 이상 입력하세요.</div>'; return; }
      res.innerHTML = '<div class="faint small">찾는 중…</div>';
      loadManualText().then(() => {
        const hits = fullText(inp.value, 40);
        res.innerHTML = hits.length ? `<div class="small faint" style="margin-bottom:6px">${hits.length >= 40 ? '40쪽 이상' : hits.length + '쪽'}에서 찾음</div>` + hits.map(h => `<div class="pg" style="padding:8px 0"><span class="t"><span class="small">${highlight(h.snip, h.words)}</span><small>Vol${h.v} · ${esc(h.code)} ${esc(h.s)}</small></span>${pdfLink(h.v, h.p, `${h.p}쪽`)}</div>`).join('') : '<div class="note small">찾지 못했습니다.</div>';
      }).catch(() => { res.innerHTML = '<div class="note small">manual_text.js 를 불러오지 못했습니다.</div>'; });
    };
    inp.addEventListener('input', debounce(run, 300));
    if (manState.ft) run();
  }

  /* ───────── 화면: 작업 목록 ───────── */
  function listTotal() {
    return list.items.filter(it => it.t === 'part' && P.get(it.id)?.pr).reduce((s, it) => s + P.get(it.id).pr * (it.qty || 1), 0);
  }
  function inList(t, id) { return list.items.some(it => it.t === t && it.id === id); }
  function addToList(t, id) {
    if (inList(t, id)) { toast('이미 작업 목록에 있습니다'); return; }
    list.items.push(t === 'part' ? { t, id, qty: 1, memo: '' } : { t, id, done: false });
    saveList();
    toast('작업 목록에 담았습니다');
  }
  function viewList() {
    const parts = list.items.filter(it => it.t === 'part' && P.has(it.id));
    const tqs = list.items.filter(it => it.t === 'torque' && T.has(it.id));
    const total = listTotal();
    const ship = total >= 100000 || !total ? 0 : 3500;
    // 담은 부품에 연결된 토크 중 아직 안 담은 것 제안
    const suggestT = [];
    parts.forEach(it => P.get(it.id).tq.slice(0, 3).forEach(tid => { const t = T.get(tid); if (t && t.kind === 'spec' && !inList('torque', tid) && !suggestT.includes(t)) suggestT.push(t); }));
    main.innerHTML = `<div class="wrap">
      <div class="view-head"><div><h1>작업 목록</h1><p>살 부품과 조일 토크를 모아 두는 곳입니다. 이 브라우저에 저장되고, 글로 복사하거나 인쇄해 차고에 들고 갈 수 있습니다.</p></div>
        <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" type="button" data-act="copy-list" ${list.items.length ? '' : 'disabled'}>${icon('copy', 's')}글로 복사</button>
          <button class="btn" type="button" data-act="print" ${list.items.length ? '' : 'disabled'}>${icon('print', 's')}인쇄</button>
          <button class="btn ghost" type="button" data-act="clear-list" ${list.items.length ? '' : 'disabled'}>${icon('trash', 's')}비우기</button>
        </div></div>
      <input class="field" id="listTitle" style="max-width:420px;margin-bottom:6px" placeholder="작업 이름 (예: 2026 가을 냉각수 호스 교체)" value="${esc(list.title)}">
      <div class="list-layout">
        <div>
          <h2 class="sec">살 부품 <span class="n">${parts.length}</span></h2>
          ${parts.length ? parts.map(it => { const p = P.get(it.id); return `<div class="li" data-li="${esc(p.id)}">
            ${thumb(p)}
            <div><div class="t"><a href="#" data-open="part:${esc(p.id)}">${esc(p.n)}</a></div>
              <div class="sub small faint" style="margin-top:3px">${p.pn.map(x => `<span class="mono">${esc(x[0])}</span>`).join(' · ') || '품번 없음'} ${fitTag(p)} ${p.so ? '<span class="tag bad">품절</span>' : ''}</div>
              <div class="ctrl no-print"><span class="qty"><button type="button" data-qty="-1" aria-label="수량 줄이기">−</button><input class="num" data-qty-in value="${it.qty || 1}" inputmode="numeric" aria-label="수량"><button type="button" data-qty="1" aria-label="수량 늘리기">+</button></span>
                <input class="field memo" data-memo placeholder="메모 (다른 곳 가격 등)" value="${esc(it.memo || '')}">
                <a class="btn sm" href="${cmallUrl(p.id)}" target="_blank" rel="noopener">씨몰 ${icon('ext', 's')}</a>
                <button class="btn sm ghost" type="button" data-rm="part:${esc(p.id)}">빼기</button></div>
            </div>
            <div class="right num" style="text-align:right;font-weight:700">${p.pr ? won(p.pr * (it.qty || 1)) : '<span class="faint small">가격 없음</span>'}${(it.qty || 1) > 1 && p.pr ? `<div class="faint xs">${won(p.pr)} × ${it.qty}</div>` : ''}</div>
          </div>`; }).join('') : '<div class="empty">부품을 열고 ‘작업 목록에 담기’를 누르세요.</div>'}
          <h2 class="sec">조일 곳 (토크 체크리스트) <span class="n">${tqs.length}</span></h2>
          ${tqs.length ? tqs.map(it => { const t = T.get(it.id); const x = tqText(t); return `<label class="check-row${it.done ? ' done' : ''}"><input type="checkbox" data-done="${esc(t.id)}" ${it.done ? 'checked' : ''}>
            <span style="flex:1"><span class="t">${esc(t.n)}</span><br><span class="faint xs">Vol${t.v} ${esc(t.code)} · ${esc(t.s)} · ${pdfLink(t.v, t.p, t.p + '쪽')}</span></span>
            <b class="num" style="font-size:1.2rem">${x.v} <span class="small muted">${x.u}${esc(x.ang)}</span></b>
            <button class="btn sm ghost no-print" type="button" data-rm="torque:${esc(t.id)}" aria-label="빼기">${icon('close', 's')}</button></label>`; }).join('') : '<div class="note">토크를 열고 ‘체크리스트에 담기’를 누르면 여기서 하나씩 지워 가며 작업할 수 있습니다.</div>'}
          ${suggestT.length ? `<div class="no-print"><h2 class="sec">담은 부품에 필요한 토크 <span class="n">제안</span></h2>${suggestT.slice(0, 6).map(t => `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1">${tqRow(t)}</div><button class="btn sm" type="button" data-addt="${esc(t.id)}">담기</button></div>`).join('')}</div>` : ''}
        </div>
        <aside class="box summary">
          <div class="sum-row"><span>부품 ${parts.reduce((s, it) => s + (it.qty || 1), 0)}개</span><span class="num">${won(total) || '0원'}</span></div>
          <div class="sum-row"><span>씨몰 배송비 <span class="faint xs">(10만 원 이상 무료)</span></span><span class="num">${ship ? won(ship) : total ? '무료' : '—'}</span></div>
          ${total && total < 100000 ? `<div class="ship-bar"><i style="width:${Math.round(total / 1000)}%"></i></div><div class="faint xs">무료배송까지 ${won(100000 - total)}</div>` : ''}
          <div class="sum-row total"><span>합계</span><span class="num">${won(total + ship) || '0원'}</span></div>
          <p class="faint xs" style="margin:10px 0 0">가격은 ${esc(DB.meta.built)}에 씨몰에서 읽은 값입니다. 주문 전 씨몰에서 다시 확인하세요. 같은 GM 품번으로 네이버·쿠팡 가격도 비교해 볼 수 있습니다(부품 상세의 품번 옆 버튼).</p>
        </aside>
      </div>
    </div>`;
    $('#listTitle').addEventListener('input', debounce(e => { list.title = e.target.value; saveList(); }, 300));
  }
  function listAsText() {
    const lines = [`[스파크 M300 작업 목록] ${list.title || ''}`.trim(), `작성: ${new Date().toLocaleDateString('ko-KR')}`, ''];
    const parts = list.items.filter(it => it.t === 'part' && P.has(it.id));
    if (parts.length) {
      lines.push('■ 부품');
      parts.forEach(it => {
        const p = P.get(it.id);
        lines.push(`- ${p.n} ×${it.qty || 1}  ${p.pr ? won(p.pr * (it.qty || 1)) : '가격 없음'}  품번 ${p.pnr || p.pn.map(x => x[0]).join(', ') || '-'}`);
        lines.push(`  ${cmallUrl(p.id)}`);
        if (it.memo) lines.push(`  메모: ${it.memo}`);
      });
      const total = listTotal();
      lines.push(`합계(씨몰): ${won(total)}${total && total < 100000 ? ' + 배송비 3,500원' : ''}`, '');
    }
    const tqs = list.items.filter(it => it.t === 'torque' && T.has(it.id));
    if (tqs.length) {
      lines.push('■ 조임 토크');
      tqs.forEach(it => { const t = T.get(it.id); const x = tqText(t, 'nm'); lines.push(`- [${it.done ? 'x' : ' '}] ${t.n}: ${x.v} N·m${t.ang || ''} (Vol${t.v} ${t.code}, ${t.p}쪽)`); });
    }
    return lines.join('\n');
  }

  /* ───────── 상세 패널 ───────── */
  const panelEl = $('#panel'), scrim = $('#scrim');
  let stack = [];
  function openPanel(item, { reset = false } = {}) {
    const wasOpen = panelEl.classList.contains('on');
    if (reset || !wasOpen) stack = [];
    stack.push(item);
    if (item.type === 'part' || item.type === 'torque') {
      recent = [{ t: item.type, id: item.id }, ...recent.filter(r => !(r.t === item.type && r.id === item.id))].slice(0, 16);
      store.set(KEY.recent, recent);
    }
    renderPanel();
    if (!wasOpen) {
      panelEl.classList.add('on'); panelEl.setAttribute('aria-hidden', 'false');
      if (!(item.type === 'pin' && window.innerWidth > 1100)) scrim.classList.add('on');
      history.pushState({ panel: true }, '', location.href);
    }
  }
  function closePanel(fromPop) {
    if (!panelEl.classList.contains('on')) return;
    panelEl.classList.remove('on'); panelEl.setAttribute('aria-hidden', 'true');
    scrim.classList.remove('on');
    stack = [];
    $$('.pin.active, .dv-item.active').forEach(x => x.classList.remove('active'));
    if (!fromPop && history.state && history.state.panel) history.back();
  }
  function renderPanel() {
    const it = stack[stack.length - 1];
    if (!it) return;
    $('#panelBack').style.visibility = stack.length > 1 ? 'visible' : 'hidden';
    const body = $('#panelBody');
    let html = '', title = '';
    if (it.type === 'part') { const p = P.get(it.id); title = '부품'; html = p ? partDetail(p) : '없는 부품'; }
    else if (it.type === 'torque') { const t = T.get(it.id); title = '조임 토크'; html = t ? torqueDetail(t) : '없는 항목'; }
    else if (it.type === 'pin') { const d = DG.get(it.d); title = d ? d.t : '도면'; html = d ? pinDetail(d, it.i) : ''; }
    $('#panelTitle').textContent = title;
    body.innerHTML = html;
    body.scrollTop = 0;
  }

  function partDetail(p) {
    const f = fitOf(p);
    const dgs = (partDiagrams.get(p.id) || []).reduce((m, [d, i]) => { (m[d] = m[d] || []).push(i); return m; }, {});
    const tqs = dedupeTorques(p.tq.map(id => T.get(id)).filter(Boolean));
    const specT = tqs.filter(t => t.kind === 'spec'), stepT = tqs.filter(t => t.kind !== 'spec');
    const codi = p.codi.map(id => P.get(id)).filter(Boolean);
    const pnLinks = no => `<span class="links">
      <button class="btn icon sm ghost" type="button" data-copy="${esc(no)}" aria-label="품번 복사" title="복사">${icon('copy', 's')}</button>
      <a class="btn sm ghost" href="https://search.shopping.naver.com/search/all?query=${encodeURIComponent(no)}" target="_blank" rel="noopener" title="네이버쇼핑에서 이 품번 찾기">네이버</a>
      <a class="btn sm ghost" href="https://www.coupang.com/np/search?q=${encodeURIComponent(no)}" target="_blank" rel="noopener" title="쿠팡에서 이 품번 찾기">쿠팡</a></span>`;
    return `
      <div class="hero">${p.img ? `<img src="${esc(p.img)}" alt="" referrerpolicy="no-referrer">` : '<span></span>'}
        <div><h2 class="title">${esc(p.n)}</h2>
          <div class="pills" style="gap:4px">${[p.c, ...partAttrs(p)].map(x => `<span class="tag">${esc(x)}</span>`).join('')}${p.so ? '<span class="tag bad">품절</span>' : ''}</div>
          <div class="price-big num" style="margin-top:8px">${p.pr ? won(p.pr) : '<span class="faint" style="font-size:1rem">가격 정보 없음</span>'}</div>
          <div class="faint xs">씨몰 판매가 · ${esc(DB.meta.built)} 확인</div></div></div>
      ${f ? `<div class="fitbox ${f.level}"><b>${f.level === 'ok' ? '내 차에 맞습니다' : f.level === 'check' ? '연식을 확인하세요' : '내 차에 맞지 않을 수 있습니다'}</b> <span class="xs">(${esc(carLabel())})</span><br>${[...f.bad, ...f.warn, ...f.good].map(esc).join(' · ')}</div>`
        : (!car && (p.a && Object.keys(p.a).length) ? '<div class="note small" style="margin-top:10px">연식·연료·변속기가 정해진 부품입니다. <a href="#" data-act="car">내 차를 설정</a>하면 맞는지 알려 드립니다.</div>' : '')}
      <div class="actions">
        <button class="btn primary" type="button" data-add="part:${esc(p.id)}">${icon(inList('part', p.id) ? 'check' : 'cart', 's')}${inList('part', p.id) ? '작업 목록에 있음' : '작업 목록에 담기'}</button>
        <a class="btn" href="${cmallUrl(p.id)}" target="_blank" rel="noopener">씨몰에서 보기 ${icon('ext', 's')}</a>
      </div>
      <h3>GM 품번 <span class="n">같은 품번으로 다른 곳 가격도 비교해 보세요</span></h3>
      ${p.pn.length ? `<div class="pn-list">${p.pn.map(([no, q]) => `<div class="pn"><span class="mono">${esc(no)}</span>${q ? `<span class="qtyx">×${q}</span>` : ''}${pnLinks(no)}</div>`).join('')}</div>${p.pnr && p.pn.length > 1 ? `<div class="faint xs" style="margin-top:4px">원문 표기: ${esc(p.pnr)}</div>` : ''}` : '<div class="note small">씨몰에 품번이 적혀 있지 않습니다.</div>'}
      ${p.note.length ? `<h3>판매처 안내</h3><ul class="notes">${p.note.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${Object.entries(dgs).map(([d, pins]) => { const dg = DG.get(d); if (!dg) return ''; return `<h3>분해도 위치 <span class="n">${esc(dg.t)}</span></h3>
        <a class="mini-dg" href="#/diagram/${esc(dg.id)}?pin=${pins[0]}" style="display:block;aspect-ratio:${dg.w}/${dg.h}"><img src="${esc(dg.img)}" alt="${esc(dg.t)}">
        ${pins.map(i => { const pin = dg.pins[i]; return `<span class="pin${pin.n == null ? ' nonum' : ''}" style="left:${pin.x / dg.w * 100}%;top:${pin.y / dg.h * 100}%">${pin.n == null ? '' : pin.n}</span>`; }).join('')}</a>`; }).join('')}
      <h3>조임 토크 <span class="n">${specT.length ? '지침서 제원표' : ''}</span></h3>
      ${specT.length || stepT.length ? `<div class="rows">${[...specT, ...stepT].slice(0, 8).map(t => tqRow(t)).join('')}</div>` : '<div class="note small">이 부품과 이름이 맞는 토크 항목을 찾지 못했습니다. 아래 정비 절차 쪽에서 확인하세요.</div>'}
      ${p.pg.length ? `<h3>정비 절차 (지침서)</h3>${p.pg.map(([key, ti, ids]) => { const [v, pg] = key.split('-').map(Number); const meta = DB.pages[key] || ['']; const ts = dedupeTorques((ids || []).map(id => T.get(id)).filter(Boolean)); return `<div class="proc-card"><div class="h"><b>${esc(ti)}</b>${pdfLink(v, pg, `Vol${v} ${meta[0] || pg + '쪽'}`)}</div>${ts.length ? `<ul>${ts.slice(0, 6).map(t => { const x = tqText(t); return `<li><a href="#" data-open="torque:${esc(t.id)}">${esc(t.n)}</a><b>${x.v} ${x.u}${esc(x.ang)}</b></li>`; }).join('')}</ul>` : ''}</div>`; }).join('')}` : ''}
      ${codi.length ? `<h3>함께 사는 부품 <span class="n">씨몰 추천</span></h3><div class="codi">${codi.map(c => `<button type="button" data-open="part:${esc(c.id)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}${esc(c.n.replace(MODEL_RE, ''))}<br><b class="num">${won(c.pr)}</b></button>`).join('')}</div>` : ''}
      <p class="faint xs" style="margin-top:24px">씨몰 상품번호 ${esc(p.id)}</p>`;
  }

  function torqueDetail(t) {
    const x = tqText(t);
    const same = dedupeTorques(DB.torques.filter(o => o.id !== t.id && o._ns === t._ns && !o.weak)).slice(0, 6);
    const parts = t.parts.map(id => P.get(id)).filter(Boolean);
    return `
      <div class="faint small">${esc(t.s)} · Vol${t.v} ${esc(t.g)}</div>
      <h2 class="title" style="margin-top:4px">${esc(t.n)}${t.q ? ` <span class="faint">×${t.q}</span>` : ''}</h2>
      <div class="val-big" style="margin:14px 0 6px">${x.v}<span>${x.u}${esc(x.ang)}</span></div>
      <div class="muted small">${tqOthers(t)}</div>
      ${t.ang ? `<div class="note small" style="margin-top:10px">토크로 조인 뒤 <b>${esc(t.ang.replace('+', ''))}</b> 더 돌려 조이는 각도법 체결입니다.</div>` : ''}
      ${t.alt && t.alt.length ? `<div class="note warn alt-warn"><b>지침서 안에서 값이 다르게 적힌 곳이 있습니다.</b><br>${t.alt.map(([nm, v, p]) => `${fmt(nm, 1)} N·m — Vol${v} ${pdfLink(v, p, p + '쪽')}`).join('<br>')}<br><span class="xs">엔진·연료별로 다른 값일 수 있으니 원문 문맥을 확인하세요.</span></div>` : ''}
      <div class="actions">
        <button class="btn primary" type="button" data-add="torque:${esc(t.id)}">${icon(inList('torque', t.id) ? 'check' : 'list', 's')}${inList('torque', t.id) ? '체크리스트에 있음' : '체크리스트에 담기'}</button>
        ${canPdf() ? `<a class="btn" href="${pdfHref(t.v, t.p)}" target="_blank" rel="noopener">${icon('pdf', 's')}원문 ${t.p}쪽 열기</a>` : ''}
      </div>
      <h3>출처</h3>
      <div class="note small">정비지침서 Vol.${t.v} (${esc(VOL_NAME[t.v])}) · ${esc(t.g)} › ${esc(t.s)} · 쪽 표기 <span class="mono">${esc(t.code)}</span> · PDF ${t.p}쪽<br>${t.kind === 'spec' ? '단원 앞의 ‘조임 토크’ 제원표에 실린 값' : `‘${esc(t.pr)}’ 절차 속에 적힌 값`}</div>
      ${same.length ? `<h3>다른 쪽의 같은 항목</h3><div class="rows">${same.map(o => tqRow(o)).join('')}</div>` : ''}
      ${parts.length ? `<h3>이 토크와 연결된 씨몰 부품 <span class="n">${parts.length}</span></h3><div class="rows">${parts.map(partRow).join('')}</div>` : ''}`;
  }

  function pinDetail(d, i) {
    const pin = d.pins[i];
    if (!pin) return '';
    const ps = pin.b.map(b => P.get(b)).filter(Boolean);
    const tids = [];
    ps.forEach(p => p.tq.forEach(id => { if (!tids.includes(id)) tids.push(id); }));
    const tqs = dedupeTorques(tids.map(id => T.get(id)).filter(Boolean)).slice(0, 6);
    return `
      <div style="display:flex;align-items:center;gap:10px"><span class="pin" style="position:static;transform:none;display:inline-block">${pin.n == null ? '·' : pin.n}</span><h2 class="title" style="margin:0">${pin.n == null ? '번호 미확인' : pin.n + '번'} 부품</h2></div>
      <p class="faint small" style="margin:6px 0 0">${esc(d.t)}</p>
      <h3>씨몰 상품 <span class="n">${ps.length}</span></h3>
      <div class="rows">${ps.map(partRow).join('')}</div>
      ${tqs.length ? `<h3>관련 조임 토크</h3><div class="rows">${tqs.map(t => tqRow(t)).join('')}</div>` : ''}
      ${pin.n == null ? '<p class="faint xs" style="margin-top:14px">이 핀은 도면의 강조 표시 위치에서 자동으로 찾았지만 번호 숫자를 확실히 읽지 못했습니다.</p>' : ''}`;
  }

  /* ───────── 대화상자: 내 차 / 설정 ───────── */
  function segHtml(name, opts, cur) {
    return `<div class="opt-row" role="radiogroup">${opts.map(([v, l]) => `<button class="pill" type="button" data-opt="${name}" data-v="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function openCar() {
    const c = car || { model: 'base', fuel: '가솔린', tm: 'AT', year: '' };
    const years = []; for (let y = 2009; y <= 2016; y++) years.push(y);
    const body = $('#carBody');
    const draw = () => {
      body.innerHTML = `
        <div><label class="lbl">차종</label>${segHtml('model', CAR_OPTS.model, c.model)}</div>
        ${c.model !== 'EV' ? `<div><label class="lbl">연료</label>${segHtml('fuel', CAR_OPTS.fuel, c.fuel)}</div>
        <div><label class="lbl">변속기</label>${segHtml('tm', CAR_OPTS.tm, c.tm)}</div>` : ''}
        <div><label class="lbl" for="carYear">연식 (모르면 비워 두세요)</label><select class="field" id="carYear"><option value="">모름</option>${years.map(y => `<option ${String(c.year) === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></div>`;
    };
    draw();
    body.onclick = e => { const b = e.target.closest('[data-opt]'); if (b) { c[b.dataset.opt] = b.dataset.v; draw(); } };
    body.onchange = e => { if (e.target.id === 'carYear') c.year = e.target.value ? +e.target.value : ''; };
    const dlg = $('#carDialog');
    dlg.onclose = () => {
      if (dlg.returnValue === 'save') { car = { ...c }; store.set(KEY.car, car); toast('내 차 사양을 저장했습니다'); }
      else if (dlg.returnValue === 'reset') { car = null; try { localStorage.removeItem(KEY.car); } catch (e) { /* 무시 */ } }
      updateCounts(); route(); if (stack.length) renderPanel();
    };
    dlg.showModal();
  }
  function openSettings() {
    const body = $('#setBody');
    const draw = () => {
      body.innerHTML = `
        <div><label class="lbl">화면</label>${segHtml('theme', [['auto', '시스템 따라'], ['light', '밝게'], ['dark', '어둡게']], settings.theme)}</div>
        <div><label class="lbl">글자 크기</label>${segHtml('big', [['false', '보통'], ['true', '크게 (차고에서)']], settings.big)}</div>
        <div><label class="lbl">토크 기본 단위</label>${segHtml('unit', [['nm', 'N·m'], ['kgfm', 'kgf·m'], ['lbft', 'lb·ft']], settings.unit)}</div>
        ${IS_FILE ? `<div><label class="lbl" for="pdfDir">정비지침서 PDF 폴더</label><input class="field mono" id="pdfDir" value="${esc(settings.pdfDir)}">
          <div class="faint xs" style="margin-top:4px">M300_SM_Volume1~4.pdf 가 있는 폴더. 기본값: ${esc(DB.meta.pdfDir)}</div></div>` : ''}
        <div class="small">문의 <a href="mailto:${CONTACT}">${CONTACT}</a></div>
        <div class="faint xs">데이터 v${esc(DB.meta.version)} · ${esc(DB.meta.built)} 생성 · 상품 ${DB.meta.counts.parts} · 토크 ${DB.meta.counts.torques} · 분해도 ${DB.meta.counts.diagrams}</div>`;
    };
    draw();
    body.onclick = e => {
      const b = e.target.closest('[data-opt]');
      if (!b) return;
      const k = b.dataset.opt, v = b.dataset.v;
      settings[k] = k === 'big' ? v === 'true' : v;
      applySettings(); draw();
    };
    body.oninput = e => { if (e.target.id === 'pdfDir') { settings.pdfDir = e.target.value; saveSettings(); } };
    $('#setDialog').onclose = () => { route(); if (stack.length) renderPanel(); };
    $('#setDialog').showModal();
  }
  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === 'auto') delete root.dataset.theme; else root.dataset.theme = settings.theme;
    root.classList.toggle('big', !!settings.big);
    saveSettings();
  }

  /* ───────── 라우팅 ───────── */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    return { view: parts[0] || 'find', arg: parts[1] ? decodeURIComponent(parts[1]) : null, params: new URLSearchParams(qs || '') };
  }
  function route() {
    const r = parseHash();
    const navView = r.view === 'diagram' ? 'diagrams' : r.view;
    $$('.rail a').forEach(a => { if (a.dataset.view === navView) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (r.view !== 'find') $('#q').value = r.view === 'torque' && r.params.get('q') ? r.params.get('q') : $('#q').value;
    switch (r.view) {
      case 'diagrams': viewDiagrams(); break;
      case 'diagram': viewDiagram(r.arg, r.params); break;
      case 'torque': viewTorque(r.params); break;
      case 'manual': viewManual(r.params); break;
      case 'list': viewList(); break;
      default: viewFind(r.params);
    }
    const vt = { diagrams: '분해도', diagram: '분해도', torque: '조임 토크', manual: '정비지침서', list: '작업 목록' }[r.view];
    document.title = vt ? `${vt} · 스파크 M300 정비 시스템` : APP_NAME;
  }
  let lastView = null;
  window.addEventListener('hashchange', () => {
    const v = parseHash().view;
    if (panelEl.classList.contains('on') && !(v === 'diagram' && lastView === 'diagram')) closePanel(true);
    lastView = v;
    route();
    if (v !== 'diagram') window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', () => { if (panelEl.classList.contains('on') && !(history.state && history.state.panel)) closePanel(true); });

  function updateCounts() {
    const n = list.items.length;
    const rc = $('#railCount');
    rc.textContent = n; rc.classList.toggle('hidden', !n);
    const cb = $('#carBtn');
    $('#carLabel').textContent = carLabel();
    cb.dataset.set = car ? '1' : '0';
  }

  /* ───────── 이벤트 (위임) ───────── */
  const searchInput = $('#q');
  const doSearch = (push) => {
    const v = searchInput.value.trim();
    const url = v ? `#/find?q=${encodeURIComponent(v)}` : '#/find';
    findState.showN = 40;
    if (location.hash === url) return;
    if (push || parseHash().view !== 'find') location.hash = url;
    else { history.replaceState(history.state, '', url); route(); }
  };
  searchInput.addEventListener('input', debounce(() => { if (parseHash().view === 'find' || searchInput.value.trim().length >= 2) doSearch(false); }, 220));
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); doSearch(true); searchInput.blur(); });

  document.addEventListener('click', e => {
    const t = e.target;
    const open = t.closest('[data-open]');
    if (open) {
      e.preventDefault();
      const [type, id] = open.dataset.open.split(':');
      openPanel({ type, id }, { reset: !panelEl.contains(open) });
      return;
    }
    const jq = t.closest('[data-q]');
    if (jq) { searchInput.value = jq.dataset.q; doSearch(true); return; }
    const cat = t.closest('[data-cat]');
    if (cat) { findState.cat = findState.cat === cat.dataset.cat ? null : cat.dataset.cat; findState.showN = 40; route(); return; }
    const srt = t.closest('[data-sort]');
    if (srt) { findState.sort = srt.dataset.sort; route(); return; }
    const flt = t.closest('[data-flt]');
    if (flt) { findState[flt.dataset.flt] = !findState[flt.dataset.flt]; route(); return; }
    const sys = t.closest('[data-sys]');
    if (sys) { dgState.sys = sys.dataset.sys || null; viewDiagrams(); return; }
    const unit = t.closest('[data-unit]');
    if (unit) { settings.unit = unit.dataset.unit; saveSettings(); route(); if (stack.length) renderPanel(); return; }
    const spec = t.closest('[data-spec]');
    if (spec) { settings.specOnly = spec.dataset.spec === '1'; saveSettings(); route(); return; }
    const vol = t.closest('[data-vol]');
    if (vol) { location.hash = `#/manual?v=${vol.dataset.vol}`; return; }
    const jump = t.closest('[data-jump]');
    if (jump) { e.preventDefault(); document.getElementById(jump.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); $$('.toc-side a.on').forEach(a => a.classList.remove('on')); jump.classList.add('on'); return; }
    const add = t.closest('[data-add]');
    if (add) { const [ty, id] = add.dataset.add.split(':'); addToList(ty, id); renderPanel(); if (parseHash().view === 'list') viewList(); return; }
    const addt = t.closest('[data-addt]');
    if (addt) { addToList('torque', addt.dataset.addt); viewList(); return; }
    const rm = t.closest('[data-rm]');
    if (rm) { e.preventDefault(); const [ty, id] = rm.dataset.rm.split(':'); list.items = list.items.filter(it => !(it.t === ty && it.id === id)); saveList(); viewList(); return; }
    const qb = t.closest('[data-qty]');
    if (qb) { const li = qb.closest('[data-li]'); const it = list.items.find(x => x.t === 'part' && x.id === li.dataset.li); it.qty = Math.max(1, (it.qty || 1) + +qb.dataset.qty); saveList(); viewList(); return; }
    const cp = t.closest('[data-copy]');
    if (cp) { copy(cp.dataset.copy, `품번 ${cp.dataset.copy} 복사`); return; }
    const act = t.closest('[data-act]');
    if (act) {
      e.preventDefault();
      const a = act.dataset.act;
      if (a === 'more') { findState.showN += 60; route(); }
      else if (a === 'car') openCar();
      else if (a === 'settings') openSettings();
      else if (a === 'clear-recent') { recent = []; store.set(KEY.recent, recent); route(); }
      else if (a === 'copy-list') copy(listAsText(), '작업 목록을 글로 복사했습니다');
      else if (a === 'print') window.print();
      else if (a === 'clear-list') { if (confirm('작업 목록을 비울까요?')) { list = { title: '', items: [] }; saveList(); viewList(); } }
    }
  });
  document.addEventListener('change', e => {
    const d = e.target.closest('[data-done]');
    if (d) { const it = list.items.find(x => x.t === 'torque' && x.id === d.dataset.done); if (it) { it.done = d.checked; saveList(); d.closest('.check-row').classList.toggle('done', d.checked); } }
    const qi = e.target.closest('[data-qty-in]');
    if (qi) { const li = qi.closest('[data-li]'); const it = list.items.find(x => x.t === 'part' && x.id === li.dataset.li); it.qty = Math.max(1, parseInt(qi.value, 10) || 1); saveList(); viewList(); }
  });
  document.addEventListener('input', debounce(e => {
    const m = e.target.closest('[data-memo]');
    if (m) { const li = m.closest('[data-li]'); const it = list.items.find(x => x.t === 'part' && x.id === li.dataset.li); if (it) { it.memo = m.value; saveList(); } }
  }, 300));
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); searchInput.focus(); searchInput.select(); }
    else if (e.key === 'Escape' && panelEl.classList.contains('on') && !document.querySelector('dialog[open]')) closePanel();
    else if (e.key === 'Enter' && e.target.matches('.tq[data-open]')) e.target.click();
  });
  $('#panelClose').addEventListener('click', () => closePanel());
  $('#panelBack').addEventListener('click', () => { if (stack.length > 1) { stack.pop(); renderPanel(); } });
  scrim.addEventListener('click', () => closePanel());
  $('#carBtn').addEventListener('click', openCar);
  $('#setBtn').addEventListener('click', openSettings);

  // 시작
  if (window.innerWidth <= 760) searchInput.placeholder = '부품·품번·정비 작업 (예: 쇼바)';
  applySettings();
  updateCounts();
  lastView = parseHash().view;
  route();
  // 본문 검색을 빨리 쓰도록 한가할 때 미리 불러 둔다
  if (HAS_FULLTEXT) (window.requestIdleCallback || setTimeout)(() => loadManualText().catch(() => {}), 1500);
})();
