(() => {
  'use strict';

  /* ================= الثوابت ================= */
  const BASE = window.RECIPES || [];
  let RECIPES = BASE;
  const CAT = { p: { i: '🍗', l: 'بروتين' }, n: { i: '🥗', l: 'بدون بروتين' }, d: { i: '🍰', l: 'حلويات' } };
  const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const KEY = 'kitchen-week-v2';
  const OLD_KEY = 'kitchen-week-v1';
  const ME_KEY = 'kitchen-me-v1';
  const SYNC_KEY = 'kitchen-sync-v1';
  const COLORS = ['#1f7a8c', '#b5651d', '#7a4fa3', '#2e8b57', '#c2415a', '#3b5bdb', '#8a6d00', '#0f766e'];
  const SHARED = ['members', 'startCook', 'protein', 'meals', 'tasks', 'log', 'admins', 'overrides', 'desserts', 'custom', 'supers', 'duties', 'bank', 'wk', 'cleanDay', 'weeklyList'];
  const MAX_MEMBERS = 12;
  const DUTY_COOK = 20;      // نقاط الطبخ
  const DUTY_PRO = 10;       // زيادة لو يوم بروتين
  const DUTY_CLEAN = 15;     // الترتيب والتنظيف العادي
  const DUTY_AREA = 15;      // منطقة في تنظيف الجمعة
  const DUTY_PERSONAL = 10;  // أوضتك وأغراضك في تنظيف الجمعة
  const DEFAULT_AREAS = ['الحمام', 'الأرضيات', 'المطبخ (تنظيف عميق)', 'الشبابيك والأتربة', 'التلاجة', 'البلكونة والمدخل'];
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mkMember = (name, i) => ({ id: uid(), name, color: COLORS[i % COLORS.length] });
  const newTaskId = () => Date.now() + Math.floor(Math.random() * 1000);
  const isoOf = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

  /* ================= الحالة والتخزين ================= */
  function defaultState() {
    const a = mkMember('آية', 0);
    const b = mkMember('هبه', 1);
    return {
      members: [a, b],
      startCook: 0,
      protein: [0, 3, 5],
      meals: {},
      tasks: [
        { id: 1, title: 'غسيل المواعين', who: a.id, day: -1, done: false },
        { id: 2, title: 'مسح المطبخ', who: b.id, day: -1, done: false },
        { id: 3, title: 'ترتيب الصالة', who: a.id, day: -1, done: false },
        { id: 4, title: 'إخراج الزبالة', who: b.id, day: -1, done: false },
        { id: 5, title: 'تنظيف الحمام', who: a.id, day: 6, done: false }
      ],
      log: [],
      updatedAt: 0
    };
  }

  function migrateV1(o) {
    const members = (o.names || ['آية', 'هبه']).map((n, i) => mkMember(n, i));
    return {
      members,
      startCook: o.startCook || 0,
      protein: o.protein || [0, 3, 5],
      meals: o.meals || {},
      tasks: (o.tasks || []).map((t) => ({
        id: t.id, title: t.title, day: t.day, done: !!t.done,
        who: t.who >= 0 && members[t.who] ? members[t.who].id : null
      })),
      log: [],
      updatedAt: 0
    };
  }

  const asArr = (v) => (Array.isArray(v) ? v.filter((x) => x != null)
    : (v && typeof v === 'object' ? Object.values(v) : []));

  function normMeals(m) {
    const o = {};
    if (Array.isArray(m)) m.forEach((v, i) => { if (v) o[i] = v; });
    else if (m && typeof m === 'object') Object.keys(m).forEach((k) => { if (m[k]) o[k] = m[k]; });
    return o;
  }

  function normalize(s) {
    s.members = asArr(s.members).map((m, i) => ({
      id: String(m.id || uid()),
      name: String(m.name || 'عضو').slice(0, 20),
      color: /^#[0-9a-f]{6}$/i.test(m.color || '') ? m.color : COLORS[i % COLORS.length]
    }));
    if (!s.members.length) s.members = [mkMember('عضو', 0)];
    s.tasks = asArr(s.tasks).map((t) => Object.assign({}, t, {
      who: t.who || null,
      day: typeof t.day === 'number' ? t.day : -1,
      done: !!t.done
    }));
    s.log = asArr(s.log);
    s.admins = asArr(s.admins).map(String);
    const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    s.supers = asArr(s.supers).map(String).filter((id) => s.members.some((m) => m.id === id));
    s.duties = asObj(s.duties);
    s.bank = asObj(s.bank);
    const cut = isoOf(new Date(Date.now() - 60 * 864e5));
    Object.keys(s.duties).forEach((k) => { if (k.slice(0, 10) < cut) delete s.duties[k]; });
    s.wk = typeof s.wk === 'string' ? s.wk : '';
    s.cleanDay = s.cleanDay === undefined || s.cleanDay === null ? 6 : Number(s.cleanDay);
    s.weeklyList = asArr(s.weeklyList).map(String).filter(Boolean);
    if (!s.weeklyList.length) s.weeklyList = DEFAULT_AREAS.slice();
    s.desserts = normMeals(s.desserts);
    s.custom = asArr(s.custom).filter((r) => r && r.id && r.name).map((r) => ({
      id: String(r.id), name: String(r.name).slice(0, 40), time: String(r.time || '—').slice(0, 20),
      cat: CAT[r.cat] ? r.cat : 'n', ing: asArr(r.ing).map(String), steps: asArr(r.steps).map(String), custom: true, by: r.by || null
    }));
    RECIPES = BASE.concat(s.custom);
    s.overrides = normMeals(s.overrides);
    s.protein = asArr(s.protein).map(Number);
    s.meals = normMeals(s.meals);
    s.startCook = (Number(s.startCook) || 0) % s.members.length;
    s.updatedAt = Number(s.updatedAt) || 0;
    return s;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw));
      const old = localStorage.getItem(OLD_KEY);
      if (old) return normalize(migrateV1(JSON.parse(old)));
    } catch (e) { /* تجاهل */ }
    return normalize(defaultState());
  }

  function writeLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* تجاهل */ }
  }

  function save() {
    S.updatedAt = Date.now();
    writeLocal();
    schedulePush();
  }

  let S = load();
  let taskFilter = 'all';
  let recipeFilter = 'all';
  let recipeQuery = '';
  let viewMember = null;
  const openDetails = {};
  let chooserOpen = false;

  /* ================= أدوات مساعدة ================= */
  const $ = (sel) => document.querySelector(sel);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const todayIdx = () => (new Date().getDay() + 1) % 7; // السبت = ٠
  const N = () => S.members.length;
  const member = (id) => S.members.find((m) => m.id === id) || null;
  const mName = (id) => (member(id) ? member(id).name : 'بدون توزيع');
  const isSuper = (id) => S.supers.includes(id);
  const W = () => { const w = S.members.filter((m) => !isSuper(m.id)); return w.length ? w : S.members; }; // اللي بيتكلّفوا بمهام
  const NW = () => W().length;
  const rot = (i) => W()[((i % NW()) + NW()) % NW()].id;
  const ov = (d, k) => {
    const v = S.overrides[d] && S.overrides[d][k];
    const a = (typeof v === 'string' ? [v] : asArr(v)).filter((x) => member(x) && !isSuper(x));
    return a.length ? a : null;
  };
  const cooks = (d) => ov(d, 'cook') || [rot(S.startCook + d)];
  const cookId = (d) => cooks(d)[0];
  const cleans = (d) => ov(d, 'clean') || [rot(S.startCook + d + (NW() > 1 ? 1 : 0))];
  const cleanId = (d) => cleans(d)[0];
  const isProtein = (d) => S.protein.includes(d);
  const catOfDay = (d) => (isProtein(d) ? 'p' : 'n');
  const recipeById = (id) => RECIPES.find((r) => r.id === id);

  function mcSpan(id) {
    const m = member(id);
    return `<span class="mc" style="--c:${m ? m.color : '#5f747c'}">${esc(m ? m.name : 'بدون توزيع')}</span>`;
  }

  function me() {
    const id = localStorage.getItem(ME_KEY);
    return id ? member(id) : null;
  }

  const isAdmin = () => { const m = me(); return !!m && S.admins.includes(m.id); };
  function needAdmin() {
    if (isAdmin()) return true;
    toast(S.admins.length ? 'ده للأدمن بس 🔒' : 'اعملي نفسك أدمن الأول من تبويب الأعضاء');
    return false;
  }


  function requireWorker() {
    if (!requireMe()) return false;
    if (isSuper(me().id)) { toast('المشرفة بتتابع بس، مفيش مهام ولا نقاط عليها 👀'); return false; }
    return true;
  }

  function addLog(entry) {
    S.log.unshift(entry);
    if (S.log.length > 800) {
      S.log.splice(800).forEach((l) => { S.bank[l.by] = (Number(S.bank[l.by]) || 0) + (l.pts || 10); });
    }
  }

  /* ================= التواريخ والمهام الأساسية (الطبخ + التنظيف) ================= */
  function weekStartDate() {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() - todayIdx());
    return t;
  }
  function dateKey(d) {
    const x = weekStartDate();
    x.setDate(x.getDate() + d);
    return isoOf(x);
  }
  function weekNo() {
    const x = weekStartDate();
    return Math.floor(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / (7 * 864e5));
  }
  const isCleanDay = (d) => S.cleanDay === d;
  const dkey = (d, k, id) => `${dateKey(d)}-${k}${id ? `-${id}` : ''}`;
  const dutyIcon = (k) => (k === 'c' ? '🍳' : k === 'n' ? '🧹' : '🧼');

  // مهام اليوم الأساسية: طبخ + (ترتيب وتنظيف، أو تنظيف أسبوعي للكل)
  function dutiesOf(d) {
    const out = [];
    const day = DAYS[d];
    cooks(d).forEach((id) => out.push({ key: dkey(d, 'c', id), k: 'c', id, d, label: `طبخ يوم ${day}`, pts: DUTY_COOK + (isProtein(d) ? DUTY_PRO : 0) }));
    if (isCleanDay(d)) {
      const w = W();
      S.weeklyList.forEach((area, i) => out.push({ key: dkey(d, `a${i}`), k: 'a', id: w[(weekNo() + i) % w.length].id, d, label: `تنظيف أسبوعي: ${area}`, pts: DUTY_AREA }));
      w.forEach((m) => out.push({ key: dkey(d, 'p', m.id), k: 'p', id: m.id, d, label: 'تنظيف أسبوعي: أوضتك وأغراضك', pts: DUTY_PERSONAL }));
    } else {
      cleans(d).forEach((id) => out.push({ key: dkey(d, 'n', id), k: 'n', id, d, label: `ترتيب وتنظيف يوم ${day}`, pts: DUTY_CLEAN }));
    }
    return out;
  }

  function findDuty(key) {
    for (let d = 0; d < 7; d++) {
      const it = dutiesOf(d).find((x) => x.key === key);
      if (it) return it;
    }
    return null;
  }

  function dutyRow(it) {
    const rec = S.duties[it.key];
    const m = member(it.id);
    const future = it.d > todayIdx();
    const who = rec && member(rec.by) ? member(rec.by).name : (rec ? 'عضو' : '');
    const doneBy = rec ? `<span class="doneinfo">✔ ${esc(who)} — ${when(rec.at)}</span>` : '';
    return `<li class="task duty ${rec ? 'done' : ''}">
      <label><input type="checkbox" data-act="toggleduty" data-key="${it.key}" ${rec ? 'checked' : ''} ${future && !rec ? 'disabled' : ''}><span>${dutyIcon(it.k)} ${esc(it.label)}</span></label>
      <span class="who" style="--c:${m ? m.color : '#5f747c'}">${esc(m ? m.name : '—')}</span>
      <span class="when">${it.pts}⭐</span>${doneBy}
    </li>`;
  }

  function toggleDuty(key, checked) {
    const it = findDuty(key);
    if (!it) return;
    if (checked) {
      if (!requireWorker()) { renderAll(); return; }
      if (it.d > todayIdx()) { toast('اليوم ده لسه ما جاش'); renderAll(); return; }
      const m = me();
      const at = Date.now();
      S.duties[key] = { by: m.id, at };
      addLog({ id: key, title: it.label, by: m.id, byName: m.name, at, assigned: it.id || null, pts: it.pts, kind: 'duty' });
      pushNotify('مهمة اتنفّذت', `${m.name} خلّصت «${it.label}» ✔`);
      toast(`تسجّلت باسمك يا ${m.name} ✔ (+${it.pts}⭐)`);
    } else {
      const rec = S.duties[key];
      const m = me();
      if (rec && m && rec.by !== m.id && !isAdmin()) { toast('اللي علّمتها بس أو الأدمن يقدر يشيلها'); renderAll(); return; }
      delete S.duties[key];
      const i = S.log.findIndex((l) => l.id === key);
      if (i >= 0) S.log.splice(i, 1);
    }
    save();
    renderAll();
  }

  const dutyIconOf = (k) => dutyIcon(k);

  // اللي على الشخص النهارده (للتذكير وللمتابعة)
  function agendaOf(id) {
    const t = todayIdx();
    const parts = dutiesOf(t).filter((x) => x.id === id && !S.duties[x.key]).map((x) => `${dutyIconOf(x.k)} ${x.label} (+${x.pts}⭐)`);
    const mine = S.tasks.filter((x) => x.who === id && !x.done && (x.day === t || x.day < 0));
    if (mine.length) parts.push(`📝 ${mine.length} مهام: ${mine.slice(0, 3).map((x) => x.title).join('، ')}`);
    return parts;
  }

  function watchHtml() {
    const m = me();
    if (!m || !isSuper(m.id)) return '';
    const t = todayIdx();
    const since = weekStartDate().getTime();
    const rows = W().map((w) => {
      const du = dutiesOf(t).filter((x) => x.id === w.id);
      const ts = S.tasks.filter((x) => x.who === w.id && (x.day < 0 || x.day === t));
      const total = du.length + ts.length;
      const done = du.filter((x) => S.duties[x.key]).length + ts.filter((x) => x.done).length;
      const pend = [...du.filter((x) => !S.duties[x.key]).map((x) => x.label), ...ts.filter((x) => !x.done).map((x) => x.title)];
      const pts = S.log.filter((l) => l.by === w.id && l.at >= since).reduce((a, l) => a + (l.pts || 10), 0);
      return `<li style="--c:${w.color}"><div class="wrow"><b class="mc">${esc(w.name)}</b><span>${done}/${total}</span><span class="pts">${pts}⭐</span></div>
        <div class="meter"><i style="width:${total ? Math.round((done / total) * 100) : 100}%"></i></div>
        <small>${pend.length ? `متبقي: ${esc(pend.slice(0, 3).join('، '))}${pend.length > 3 ? ` +${pend.length - 3}` : ''}` : 'خلّصت كل حاجة ✔'}</small></li>`;
    }).join('');
    return `<section class="panel watch"><h3 class="sub" style="margin-top:0">👀 متابعة النهارده</h3><ul>${rows}</ul>
      <p class="help">انتي مشرفة: بتتابعي بس، ومفيش عليكي مهام ولا نقاط.</p></section>`;
  }

  function when(ts) {
    const d = new Date(ts);
    const now = new Date();
    const t = d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return `النهارده ${t}`;
    if (d.toDateString() === new Date(now.getTime() - 864e5).toDateString()) return `امبارح ${t}`;
    return `${d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })} ${t}`;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  function openSheet(html) {
    chooserOpen = false;
    $('#sheetBody').innerHTML = html;
    $('#sheet').hidden = false;
    document.body.classList.add('lock');
  }

  function closeSheet() {
    chooserOpen = false;
    $('#sheet').hidden = true;
    document.body.classList.remove('lock');
  }

  /* ================= الأعضاء والملف الشخصي ================= */
  function requireMe() {
    if (me()) return true;
    chooserSheet();
    toast('اختاري مين انتي الأول علشان نسجل اللي نفّذتيه');
    return false;
  }

  function chooserSheet() {
    openSheet(`
      <h2>مين انتي؟</h2>
      <p class="muted">اختاري اسمك علشان يتسجل باسمك أي مهمة تخلّصيها. الاختيار ده على جهازك بس.</p>
      <div class="rlist">
        ${S.members.map((m) => `<button class="rcard" style="border-inline-start-color:${m.color}" data-act="setme" data-id="${m.id}">
          <span class="ico">👤</span><span><b>${esc(m.name)}</b></span></button>`).join('')}
      </div>`);
    chooserOpen = true;
  }

  function renderHeader() {
    const t = todayIdx();
    const meal = S.meals[t] ? recipeById(S.meals[t]) : null;
    $('#todayLine').textContent =
      `اليوم ${DAYS[t]}: الطبخ ${cooks(t).map(mName).join(' و')} — ${isProtein(t) ? 'بروتين' : 'بدون بروتين'}` +
      (meal ? ` — ${meal.name}` : '');
    const m = me();
    $('#meBtn').textContent = m ? `👤 ${m.name}` : '👤 مين انتي؟';
  }

  function stats(id) {
    const since = Date.now() - WEEK_MS;
    let cook = 0;
    let cookPro = 0;
    for (let d = 0; d < 7; d++) {
      if (cooks(d).includes(id)) { cook++; if (isProtein(d)) cookPro++; }
    }
    return {
      open: S.tasks.filter((t) => t.who === id && !t.done).length + dutiesOf(todayIdx()).filter((x) => x.id === id && !S.duties[x.key]).length,
      doneWeek: S.log.filter((l) => l.by === id && l.at >= since).length,
      cook, cookPro
    };
  }

  function feedHtml(entries) {
    if (!entries.length) return '<div class="empty">لسه مفيش مهام اتنفذت.</div>';
    return `<ul class="feed">${entries.map((l) => {
      const m = member(l.by);
      const color = m ? m.color : '#5f747c';
      const name = m ? m.name : (l.byName || 'عضو محذوف');
      return `<li style="--c:${color}"><b class="mc">${esc(name)}</b> خلّصت «${esc(l.title)}»<small>${when(l.at)}</small></li>`;
    }).join('')}</ul>`;
  }

  function renderMembers() {
    const m = member(viewMember) || me() || S.members[0];
    viewMember = m.id;
    const st = stats(m.id);
    const mine = me();
    const isMe = mine && mine.id === m.id;
    const openTasks = S.tasks.filter((t) => t.who === m.id && !t.done);
    const sync = getSync();

    $('#tab-members').innerHTML = `
      <div class="chips">
        ${S.members.map((x) => `<button class="chip ${x.id === m.id ? 'on' : ''}" data-act="viewmember" data-id="${x.id}"><i class="dot" style="--c:${x.color}"></i>${esc(x.name)}</button>`).join('')}
      </div>

      <section class="panel profile" style="--c:${m.color}">
        <h2>${esc(m.name)} ${isMe ? '<span class="tag">انتي</span>' : ''}</h2>
        <div class="stats">
          <div class="stat"><b>${st.open}</b><span>مهام متبقية</span></div>
          <div class="stat"><b>${st.doneWeek}</b><span>خلّصتها آخر ٧ أيام</span></div>
          <div class="stat"><b>${st.cook}</b><span>أيام طبخ (${st.cookPro} بروتين)</span></div>
        </div>

        <h3 class="sub">مهامها المتبقية</h3>
        ${openTasks.length ? `<ul class="tasks">${openTasks.map(taskRow).join('')}</ul>` : '<div class="empty">مفيش مهام متبقية 🎉</div>'}

        <h3 class="sub">اللي نفّذته مؤخرًا</h3>
        ${feedHtml(S.log.filter((l) => l.by === m.id).slice(0, 10))}

        <h3 class="sub">تعديل</h3>
        <label class="field">الاسم<input type="text" data-mname="${m.id}" value="${esc(m.name)}" maxlength="20"></label>
        <div class="swatches">
          ${COLORS.map((c) => `<button class="sw ${c === m.color ? 'on' : ''}" style="--c:${c}" data-act="setcolor" data-id="${m.id}" data-c="${c}" aria-label="لون"></button>`).join('')}
        </div>
        <div class="row">
          ${isMe ? '' : `<button class="btn alt" data-act="setme" data-id="${m.id}">ده أنا</button>`}
          ${N() > 1 ? `<button class="btn danger" data-act="removemember" data-id="${m.id}">حذف ${esc(m.name)}</button>` : ''}
        </div>
      </section>

      <section class="panel">
        <h3 class="sub" style="margin-top:0">كل اللي اتنفّذ</h3>
        ${feedHtml(S.log.slice(0, 15))}
      </section>

      ${adminPanel()}${supervisorPanel()}${notePanel()}
      <form class="panel" id="memberForm" autocomplete="off">
        <h3 class="sub" style="margin-top:0">إضافة عضو جديد</h3>
        <div class="inline-form">
          <input type="text" id="newMember" placeholder="الاسم" maxlength="20" required>
          <button class="btn" type="submit">إضافة</button>
        </div>
        <p class="help">الحد الأقصى ${MAX_MEMBERS} أعضاء. الطبخ والترتيب بيتوزعوا على الكل بالدور.</p>
      </form>

      ${isStandalone() ? '' : `<section class="panel">
        <h3 class="sub" style="margin-top:0">ثبّتيه كتطبيق</h3>
        ${deferredInstall ? '<button class="btn gold" data-act="installapp">📲 تثبيت التطبيق</button>' : ''}
        <p class="help">أندرويد (كروم): القائمة ⋮ ثم «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».<br>آيفون (سفاري): زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».</p>
      </section>`}

      <details class="panel" data-key="sync" ${openDetails.sync || !sync ? 'open' : ''}>
        <summary>المزامنة اللحظية بين الأجهزة</summary>
        <p class="help">وصّلي كل الأجهزة بنفس قاعدة بيانات Firebase ونفس كود الغرفة، وأي تغيير هيظهر عند الكل في ثواني.</p>
        <form id="syncForm" autocomplete="off" class="addform" style="margin-top:10px">
          <label class="field">رابط قاعدة البيانات (أو الصقي رابط الدعوة هنا)
            <input type="text" id="syncUrl" dir="ltr" placeholder="https://xxxx-default-rtdb.firebaseio.com" value="${esc(sync ? sync.url : '')}">
          </label>
          <label class="field">كود الغرفة (اختاري كود طويل صعب التخمين)
            <input type="text" id="syncRoom" dir="ltr" placeholder="مثال: family-x7k29q" value="${esc(sync ? sync.room : '')}">
          </label>
          <div class="row" style="margin-top:0">
            <button class="btn" type="submit">حفظ وتشغيل</button>
            ${sync ? '<button type="button" class="btn gold" data-act="copyinvite">نسخ رابط الدعوة</button><button type="button" class="btn soft" data-act="syncnow">مزامنة الآن</button><button type="button" class="btn danger" data-act="syncoff">إيقاف</button>' : ''}
          </div>
        </form>
        <p class="status" id="syncStatus">${esc(syncStatusText)}</p>
        <p class="help">قواعد الأمان في Firebase (Rules):
          <code>{ "rules": { "rooms": { "$room": { ".read": true, ".write": true } } } }</code>
          رابط الدعوة فيه رابط القاعدة وكود الغرفة، فابعتيه للعيلة بس.
        </p>
      </details>`;
  }

  function addMember(name) {
    if (N() >= MAX_MEMBERS) { toast('وصلتي للحد الأقصى من الأعضاء'); return; }
    const used = S.members.map((m) => m.color);
    const color = COLORS.find((c) => !used.includes(c)) || COLORS[N() % COLORS.length];
    const m = { id: uid(), name: name.trim().slice(0, 20), color };
    S.members.push(m);
    viewMember = m.id;
    save();
    renderAll();
    toast(`اتضافت ${m.name}`);
  }

  function removeMember(id) {
    const m = member(id);
    if (!m || N() <= 1) return;
    if (!confirm(`حذف ${m.name}؟ المهام اللي معاها هتبقى بدون توزيع، وسجل اللي نفّذته هيفضل ظاهر.`)) return;
    S.log.forEach((l) => { if (l.by === id && !l.byName) l.byName = m.name; });
    S.tasks.forEach((t) => {
      if (t.who === id) t.who = null;
      if (t.doneBy === id) { t.doneByName = t.doneByName || m.name; }
    });
    S.admins = S.admins.filter((x) => x !== id);
    S.supers = S.supers.filter((x) => x !== id);
    S.members = S.members.filter((x) => x.id !== id);
    S.startCook %= NW();
    if (localStorage.getItem(ME_KEY) === id) localStorage.removeItem(ME_KEY);
    viewMember = null;
    save();
    renderAll();
    toast(`اتحذفت ${m.name}`);
  }

  /* ================= الجدول ================= */
  function taskRow(t) {
    const m = member(t.who);
    const doneBy = t.done && t.doneAt
      ? `<span class="doneinfo">✔ ${esc(mName(t.doneBy) === 'بدون توزيع' ? (t.doneByName || 'عضو') : mName(t.doneBy))} — ${when(t.doneAt)}</span>`
      : '';
    return `<li class="task ${t.done ? 'done' : ''}">
      <label><input type="checkbox" data-act="toggletask" data-id="${t.id}" ${t.done ? 'checked' : ''}><span>${esc(t.title)}</span></label>
      <button class="who ${m ? '' : 'none'}" ${m ? `style="--c:${m.color}"` : ''} data-act="cycletask" data-id="${t.id}" title="غيّري المسؤولة">${esc(m ? m.name : 'بدون توزيع')}</button>
      <span class="when">${t.day < 0 ? 'أي يوم' : DAYS[t.day]} · ${t.pts || 10}⭐</span>
      <button class="x" data-act="deltask" data-id="${t.id}" aria-label="حذف المهمة">✕</button>
      ${doneBy}
    </li>`;
  }

  function dayCard(d, today) {
    const pro = isProtein(d);
    const r = S.meals[d] ? recipeById(S.meals[d]) : null;
    const dayTasks = S.tasks.filter((t) => t.day === d);
    const ds = S.desserts[d] ? recipeById(S.desserts[d]) : null;
    return `<article class="day ${pro ? 'pro' : 'veg'} ${d === today ? 'today' : ''}">
      <header>
        <h3>${DAYS[d]}${d === today ? '<span class="now">اليوم</span>' : ''}</h3>
        <button class="ghost" data-act="editday" data-d="${d}" aria-label="تعديل المسؤولة">✏️</button><button class="kind" data-act="toggleprotein" data-d="${d}">${pro ? '🍗 بروتين' : '🥗 بدون بروتين'}</button>
      </header>
      <dl>
        <div><dt>الطبخ</dt><dd>${cooks(d).map((x) => mcSpan(x)).join('، ')}</dd></div>
        <div><dt>الترتيب والتنظيف</dt><dd>${isCleanDay(d) ? '🧼 الكل (تنظيف أسبوعي)' : cleans(d).map((x) => mcSpan(x)).join('، ')}</dd></div>
      </dl>
      ${(() => {
        const du = dutiesOf(d);
        const dn = du.filter((x) => S.duties[x.key]).length;
        const key = `duty${d}`;
        const open = openDetails[key] === undefined ? d === today : openDetails[key];
        return `<details class="dutybox" data-key="${key}" ${open ? 'open' : ''}><summary>المهام الأساسية (${dn}/${du.length})${isCleanDay(d) ? ' 🧼' : ''}</summary><ul class="tasks mini">${du.map(dutyRow).join('')}</ul></details>`;
      })()}
      <div class="meal">
        ${r ? `<div class="mealline">
          <button class="mealname" data-act="viewrecipe" data-id="${r.id}" data-d="${d}">${esc(r.name)}<small>${r.time}</small></button>
          <button class="ghost" data-act="clearmeal" data-d="${d}" aria-label="شيل الوصفة">✕</button>
        </div>` : '<span class="muted">لسه ما اتحددتش وصفة لليوم ده</span>'}
        <div class="mealbtns">
          <button data-act="pick" data-d="${d}">اختيار وصفة</button>
          <button data-act="random" data-d="${d}">🎲 اقتراح عشوائي</button>
        </div>
      </div>
      <div class="dessert">${ds
        ? `<div class="mealline"><button class="mealname" data-act="viewrecipe" data-id="${ds.id}" data-d="${d}">🍰 ${esc(ds.name)}<small>${ds.time}</small></button><button class="ghost" data-act="cleardessert" data-d="${d}" aria-label="شيل الحلو">✕</button></div>`
        : `<button class="btn soft" data-act="pickdessert" data-d="${d}">🍰 إضافة حلو (اختياري)</button>`}</div>
      ${dayTasks.length ? `<ul class="tasks mini">${dayTasks.map(taskRow).join('')}</ul>` : ''}
    </article>`;
  }

  function renderSchedule() {
    const today = todayIdx();
    $('#tab-schedule').innerHTML = `
      <details class="panel" data-key="sched" ${openDetails.sched ? 'open' : ''}>
        <summary>إعدادات الأسبوع</summary>
        <div class="row">
          <button class="btn alt" data-act="preset" data-n="2">يومين بروتين</button>
          <button class="btn alt" data-act="preset" data-n="3">٣ أيام بروتين</button>
        </div>
        <div class="row">
          <button class="btn gold" data-act="swapweek">كمّل الدور للأسبوع الجاي</button>
          <button class="btn soft" data-act="randomall">اقتراح وصفات لكل الأسبوع</button>
          <button class="btn soft" data-act="clearmeals">مسح كل الوصفات</button>
        </div>
        <p class="muted">الطبخ بيدور على ${N()} أعضاء يوم بعد يوم، ومن بعد اللي بتطبخ بتيجي اللي بترتب وتنظف. الأعضاء بيتضافوا ويتحذفوا من تبويب «الأعضاء». اضغطي على نوع اليوم (🍗 / 🥗) علشان تغيّريه.</p>
        <label class="field">يوم التنظيف الأسبوعي للكل
          <select data-cleanday>
            <option value="-1" ${S.cleanDay === -1 ? 'selected' : ''}>من غير</option>
            ${DAYS.map((n, i) => `<option value="${i}" ${S.cleanDay === i ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </label>
        <label class="field">مناطق التنظيف الأسبوعي (كل سطر منطقة)
          <textarea id="weeklyList" rows="5">${esc(S.weeklyList.join('\n'))}</textarea>
        </label>
        <button class="btn alt" data-act="saveweekly">حفظ قائمة التنظيف</button>
        <p class="muted">في يوم التنظيف الأسبوعي كل واحدة (غير المشرفة) ليها أوضتها، والمناطق بتتوزع عليهم بالدور، وكلها بنقاط.</p>
      </details>
      ${watchHtml()}
      <div class="days">${DAYS.map((_, d) => dayCard(d, today)).join('')}</div>`;
    renderHeader();
  }

  /* ================= المهام ================= */
  function openCount(id) { return S.tasks.filter((t) => t.who === id && !t.done).length; }

  function pickLeastLoaded() {
    return W().reduce((best, m) => (openCount(m.id) < openCount(best.id) ? m : best), W()[0]).id;
  }

  function coreHtml() {
    const t = todayIdx();
    let items = dutiesOf(t);
    if (taskFilter === 'none') items = [];
    else if (taskFilter === 'done') items = items.filter((x) => S.duties[x.key]);
    else if (taskFilter !== 'all') items = items.filter((x) => x.id === taskFilter);
    if (!items.length) return '';
    return `<h3 class="sub" style="margin-top:0">🍳 الأساسية النهارده${isCleanDay(t) ? ' — يوم التنظيف الأسبوعي 🧼' : ''}</h3><ul class="tasks">${items.map(dutyRow).join('')}</ul>`;
  }

  function renderTasks() {
    const unassigned = S.tasks.filter((t) => !t.who && !t.done).length;
    let list = S.tasks;
    if (taskFilter === 'none') list = list.filter((t) => !t.who);
    else if (taskFilter === 'done') list = list.filter((t) => t.done);
    else if (taskFilter !== 'all') list = list.filter((t) => t.who === taskFilter);

    const chip = (f, label) => `<button class="chip ${taskFilter === f ? 'on' : ''}" data-act="tfilter" data-f="${f}">${label}</button>`;

    $('#tab-tasks').innerHTML = `
      <div class="counts">
        ${W().map((m) => {
          const st = stats(m.id);
          return `<div class="count" style="--c:${m.color}"><span class="mc">${esc(m.name)}</span><b>${st.open} متبقية</b><span class="muted">${st.doneWeek} خلّصتها آخر ٧ أيام</span></div>`;
        }).join('')}
      </div>

      ${coreHtml()}

      <form class="panel addform" id="taskForm" autocomplete="off">
        <label class="field">مهمة جديدة<input type="text" id="taskTitle" placeholder="مثال: تنظيف التلاجة" maxlength="60" required></label>
        <div class="pair">
          <label class="field">مين تعملها
            <select id="taskWho">
              <option value="auto">توزيع تلقائي</option>
              ${W().map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field">اليوم
            <select id="taskDay">
              <option value="-1">أي يوم</option>
              ${DAYS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}
            </select>
          </label>
        </div>
        <label class="field">النقاط<select id="taskPts"><option>5</option><option selected>10</option><option>20</option><option>30</option></select></label>
        <button class="btn" type="submit">إضافة المهمة</button>
      </form>

      <div class="row" style="margin-top:0">
        <button class="btn alt" data-act="dist">وزّع غير الموزعة${unassigned ? ` (${unassigned})` : ''}</button>
        <button class="btn soft" data-act="distall">إعادة توزيع الكل بالتساوي</button>
        <button class="btn soft" data-act="cleardone">مسح المنجزة</button>
      </div>

      <div class="chips">
        ${chip('all', 'الكل')}
        ${W().map((m) => chip(m.id, `<i class="dot" style="--c:${m.color}"></i>${esc(m.name)}`)).join('')}
        ${chip('none', 'بدون توزيع')}${chip('done', '✔ المنجزة')}
      </div>

      ${list.length
        ? `<ul class="tasks">${list.map(taskRow).join('')}</ul>`
        : '<div class="empty">مفيش مهام هنا. أضيفي مهمة من النموذج فوق.</div>'}

      <h3 class="sub">آخر ما تم تنفيذه</h3>
      ${feedHtml(S.log.slice(0, 5))}
      <p class="muted">اضغطي على اسم المسؤولة جنب المهمة علشان تنقليها للي بعدها.</p>`;
  }

  function addTask(title, whoVal, day) {
    if (!needAdmin()) return;
    const who = whoVal === 'auto' ? pickLeastLoaded() : whoVal;
    S.tasks.push({ id: newTaskId(), title: title.trim(), who, day: Number(day), done: false, pts: Number(($('#taskPts') || {}).value) || 10 });
    save();
    renderAll();
    toast(`اتضافت المهمة لـ ${mName(who)}`);
    pushNotify('📝 مهمة جديدة', `${title.trim()} — على ${mName(who)}`, who);
  }

  function distribute(all) {
    if (!needAdmin()) return;
    const targets = S.tasks.filter((t) => !t.done && (all || !t.who));
    if (!targets.length) { toast('مفيش مهام محتاجة توزيع'); return; }
    const load = {};
    W().forEach((m) => { load[m.id] = all ? 0 : openCount(m.id); });
    targets.forEach((t) => {
      const best = W().reduce((b, m) => (load[m.id] < load[b.id] ? m : b), W()[0]);
      t.who = best.id;
      load[best.id]++;
    });
    save();
    renderAll();
    toast('تم توزيع المهام بالتساوي');
  }

  function toggleTask(id, checked) {
    const t = S.tasks.find((x) => x.id === id);
    if (!t) return;
    if (checked) {
      if (!requireWorker()) { renderTasks(); return; }
      const m = me();
      t.done = true;
      t.doneBy = m.id;
      t.doneByName = m.name;
      t.doneAt = Date.now();
      addLog({ id: t.id, title: t.title, by: m.id, byName: m.name, at: t.doneAt, assigned: t.who || null, pts: t.pts || 10 });
      if (!S.tasks.some((x) => x.who === m.id && !x.done) && !dutiesOf(todayIdx()).some((x) => x.id === m.id && !S.duties[x.key])) S.log[0].all = true;
      pushNotify(S.log[0].all ? 'برافو 🎉' : 'مهمة اتنفّذت', `${m.name} ${S.log[0].all ? 'خلّصت كل مهامها 🎉' : `خلّصت «${t.title}» ✔`}`);
      toast(S.log[0].all ? `برافو يا ${m.name}! خلّصتي كل مهامك 🎉` : `تسجّلت باسمك يا ${m.name} ✔ (+${t.pts || 10}⭐)`);
    } else {
      t.done = false;
      delete t.doneBy;
      delete t.doneByName;
      delete t.doneAt;
      const i = S.log.findIndex((l) => l.id === t.id);
      if (i >= 0) S.log.splice(i, 1);
    }
    save();
    renderAll();
  }

  /* ================= الوصفات ================= */
  function recipeCard(r, d) {
    return `<button class="rcard ${r.cat}" data-act="viewrecipe" data-id="${r.id}" ${d !== undefined ? `data-d="${d}"` : ''}>
      <span class="ico">${CAT[r.cat].i}</span>
      <span><b>${esc(r.name)}</b><small>${r.time} — ${CAT[r.cat].l}</small></span>
    </button>`;
  }

  function renderRecipeList() {
    const items = RECIPES.filter((r) =>
      (recipeFilter === 'all' || r.cat === recipeFilter) &&
      (!recipeQuery || r.name.includes(recipeQuery) || r.ing.some((i) => i.includes(recipeQuery))));
    $('#rlist').innerHTML = items.length
      ? items.map((r) => recipeCard(r)).join('')
      : '<div class="empty">مفيش وصفة بالاسم ده.</div>';
  }

  function renderRecipes() {
    const chip = (f, label) => `<button class="chip ${recipeFilter === f ? 'on' : ''}" data-act="rfilter" data-f="${f}">${label}</button>`;
    $('#tab-recipes').innerHTML = `
      <button class="btn gold" data-act="newrecipe" style="margin-bottom:10px">➕ وصفة جديدة</button>
      <input type="search" id="rsearch" placeholder="ابحثي باسم الأكلة أو مكوّن" value="${esc(recipeQuery)}">
      <div class="chips">${chip('all', 'الكل')}${chip('p', '🍗 بروتين')}${chip('n', '🥗 بدون بروتين')}${chip('d', '🍰 حلويات')}</div>
      <div class="rlist" id="rlist"></div>`;
    renderRecipeList();
  }

  function recipeSheet(id, d) {
    const r = recipeById(id);
    if (!r) return;
    const day = d === undefined ? todayIdx() : d;
    openSheet(`
      <h2>${esc(r.name)}</h2>
      <span class="tag ${r.cat}">${CAT[r.cat].i} ${CAT[r.cat].l}</span>
      <span class="muted"> ${r.time}</span>
      <h4>المكونات</h4>
      <ul class="list">${r.ing.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <h4>الطريقة</h4>
      <ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="addbox">
        <label class="field">أضيفها لليوم
          <select id="sheetDay">
            ${DAYS.map((n, i) => `<option value="${i}" ${i === day ? 'selected' : ''}>${n} ${isProtein(i) ? '🍗' : '🥗'}</option>`).join('')}
          </select>
        </label>
        <button class="btn" data-act="addmeal" data-id="${r.id}">إضافة للجدول</button>
        ${r.custom && (isAdmin() || r.by === (me() || {}).id) ? `<button class="btn danger" data-act="delrecipe" data-id="${r.id}">حذف الوصفة</button>` : ''}
      </div>`);
  }

  function pickerSheet(d) {
    const cat = catOfDay(d);
    const items = RECIPES.filter((r) => r.cat === cat);
    openSheet(`
      <h2>وصفة ${DAYS[d]}</h2>
      <p class="muted">${cat === 'p' ? 'يوم بروتين: وصفات فراخ ولحمة وسمك' : 'يوم بدون بروتين: وصفات خضار وأرز ومكرونة'}</p>
      <div class="rlist">${items.map((r) => recipeCard(r, d)).join('')}</div>`);
  }

  function setMeal(d, id) {
    const r = recipeById(id);
    if (!r) return;
    if (r.cat === 'd') { S.desserts[d] = id; save(); renderSchedule(); toast(`اتضاف حلو ${r.name} ليوم ${DAYS[d]}`); return; }
    const need = r.cat === 'p';
    if (need !== isProtein(d)) {
      S.protein = need ? [...S.protein, d] : S.protein.filter((x) => x !== d);
      toast(`${DAYS[d]} بقى يوم ${need ? 'بروتين' : 'بدون بروتين'}`);
    } else {
      toast(`اتضافت ${r.name} ليوم ${DAYS[d]}`);
    }
    S.meals[d] = id;
    save();
    renderSchedule();
  }

  function randomMeal(d, silent) {
    const pool = RECIPES.filter((r) => r.cat === catOfDay(d));
    if (!pool.length) return;
    const others = pool.filter((r) => r.id !== S.meals[d]);
    const src = others.length ? others : pool;
    const r = src[Math.floor(Math.random() * src.length)];
    S.meals[d] = r.id;
    if (!silent) { save(); renderSchedule(); toast(`اقتراح: ${r.name}`); }
  }

  function setPreset(n) {
    S.protein = n === 2 ? [0, 4] : [0, 3, 5];
    Object.keys(S.meals).forEach((d) => {
      const r = recipeById(S.meals[d]);
      if (r && r.cat !== catOfDay(Number(d))) delete S.meals[d];
    });
    save();
    renderSchedule();
    toast(n === 2 ? 'يومين بروتين: السبت والأربعاء' : '٣ أيام بروتين: السبت والثلاثاء والخميس');
  }

  /* ================= المزامنة اللحظية (Firebase Realtime Database عبر REST + SSE) ================= */
  let syncStatusText = 'المزامنة متوقفة';
  let lastSyncAt = null;
  let pushTimer = null;
  let pullTimer = null;
  let pulling = false;
  let pendingRender = false;
  let syncedOnce = false;
  let es = null;
  let esTimer = null;
  let deferredInstall = null;

  function getSync() {
    try {
      const raw = localStorage.getItem(SYNC_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c && c.url && c.room) return c;
      }
    } catch (e) { /* تجاهل */ }
    return null;
  }

  const endpoint = (c) => `${c.url.replace(/\/+$/, '')}/rooms/${encodeURIComponent(c.room)}.json`;
  const nowLabel = () => new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

  function liveBadge() {
    if (!getSync()) return 'المزامنة متوقفة';
    const live = es && es.readyState === 1;
    return (live ? '🟢 متصل لحظيًا' : '🟡 بيتحدّث كل كام ثانية') + (lastSyncAt ? ` — آخر تحديث ${lastSyncAt}` : '');
  }

  function refreshStatus(extra) {
    syncStatusText = extra ? `${liveBadge()} — ${extra}` : liveBadge();
    const el = $('#syncStatus');
    if (el) el.textContent = syncStatusText;
  }

  function sharedOf() {
    const o = { updatedAt: S.updatedAt };
    SHARED.forEach((k) => { o[k] = S[k]; });
    return o;
  }

  function schedulePush() {
    if (!getSync()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 400);
  }

  async function push() {
    const c = getSync();
    if (!c) return;
    try {
      if (!S.updatedAt) { S.updatedAt = Date.now(); writeLocal(); }
      const res = await fetch(endpoint(c), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sharedOf())
      });
      if (!res.ok) throw new Error(res.status);
      lastSyncAt = nowLabel();
      refreshStatus();
    } catch (e) {
      refreshStatus('تعذّر الرفع، اتأكدي من الإنترنت ومن قواعد Firebase');
    }
  }

  function isTyping() {
    const a = document.activeElement;
    return !!a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox';
  }

  function applyRemote(remote) {
    const prevTop = S.log[0] ? S.log[0].at : 0;
    const empty = { members: [], startCook: 0, protein: [], meals: {}, tasks: [], log: [] };
    SHARED.forEach((k) => { S[k] = remote[k] !== undefined ? remote[k] : empty[k]; });
    S.updatedAt = Number(remote.updatedAt) || 0;
    normalize(S);
    if (localStorage.getItem(ME_KEY) && !me()) localStorage.removeItem(ME_KEY);
    writeLocal();
    if (chooserOpen) chooserSheet();
    if (isTyping()) pendingRender = true; else renderAll();

    const mine = me();
    const fresh = S.log.filter((l) => l.at > prevTop && (!mine || l.by !== mine.id));
    if (syncedOnce && fresh.length) {
      const l = fresh[0];
      notify(l.all ? 'برافو 🎉' : 'مهمة اتنفّذت', `${member(l.by) ? member(l.by).name : (l.byName || 'عضو')} ${l.all ? 'خلّصت كل مهامها 🎉' : `خلّصت «${l.title}» ✔`}`);
    }
  }

  async function pull() {
    const c = getSync();
    if (!c || pulling) return;
    pulling = true;
    try {
      const res = await fetch(endpoint(c));
      if (!res.ok) throw new Error(res.status);
      const remote = await res.json();
      if (remote === null) {
        await push();
      } else {
        const rt = Number(remote.updatedAt) || 0;
        if (rt > S.updatedAt) applyRemote(remote);
        else if (rt < S.updatedAt) await push();
        syncedOnce = true;
        lastSyncAt = nowLabel();
        if (!me() && $('#sheet').hidden) chooserSheet();
        refreshStatus();
      }
    } catch (e) {
      refreshStatus('تعذّرت المزامنة، اتأكدي من الرابط ومن الإنترنت');
    } finally {
      pulling = false;
    }
  }

  function stopStream() {
    clearTimeout(esTimer);
    if (es) { es.close(); es = null; }
  }

  function startStream() {
    stopStream();
    const c = getSync();
    if (!c || typeof EventSource === 'undefined') return;
    try {
      es = new EventSource(endpoint(c));
      const onChange = () => {
        clearTimeout(pullTimer);
        pullTimer = setTimeout(pull, 120);
      };
      es.addEventListener('put', onChange);
      es.addEventListener('patch', onChange);
      es.onopen = () => refreshStatus();
      es.onerror = () => {
        refreshStatus();
        if (es && es.readyState === 2) {
          clearTimeout(esTimer);
          esTimer = setTimeout(startStream, 5000);
        }
      };
    } catch (e) { es = null; }
  }

  function parseInvite(text) {
    try {
      const u = new URL(String(text).trim());
      const db = u.searchParams.get('db');
      const room = u.searchParams.get('room');
      if (db && room) return { url: db, room };
    } catch (e) { /* مش رابط دعوة */ }
    return null;
  }

  function inviteLink() {
    const c = getSync();
    if (!c) return '';
    const base = location.href.split('?')[0].split('#')[0];
    return `${base}?db=${encodeURIComponent(c.url)}&room=${encodeURIComponent(c.room)}`;
  }

  function enableSync(url, room) {
    const inv = parseInvite(url);
    const u = (inv ? inv.url : url).trim();
    const r = (inv ? inv.room : room).trim();
    if (!/^https:\/\/[^\s/]+/i.test(u)) { toast('الرابط لازم يبدأ بـ https://'); return; }
    if (!/^[A-Za-z0-9_-]{4,40}$/.test(r)) { toast('كود الغرفة: حروف إنجليزي وأرقام و - و _ فقط (٤ على الأقل)'); return; }
    localStorage.setItem(SYNC_KEY, JSON.stringify({ url: u, room: r }));
    refreshStatus('جاري الاتصال...');
    renderMembers();
    startStream();
    pull();
    toast('اتشغّلت المزامنة اللحظية');
  }

  setInterval(pull, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !getSync()) return;
    pull();
    if (!es || es.readyState === 2) startStream();
  });
  window.addEventListener('online', () => { if (getSync()) { startStream(); pull(); } });

  const isStandalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (!isTyping()) renderMembers();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    renderMembers();
    toast('اتثبّت التطبيق');
  });

  function dessertSheet(d) {
    openSheet(`<h2>حلو ${DAYS[d]} 🍰</h2><p class="muted">اختياري: يتقدم بعد الأكل الأساسي</p>
      <div class="rlist">${RECIPES.filter((r) => r.cat === 'd').map((r) => recipeCard(r, d)).join('')}</div>`);
  }

  function recipeForm() {
    openSheet(`<h2>وصفة جديدة</h2><div class="addform">
      <label class="field">اسم الأكلة<input type="text" id="rfName" maxlength="40"></label>
      <div class="pair">
        <label class="field">الوقت<input type="text" id="rfTime" maxlength="20" placeholder="٣٠ دقيقة"></label>
        <label class="field">النوع<select id="rfCat"><option value="p">🍗 بروتين</option><option value="n">🥗 بدون بروتين</option><option value="d">🍰 حلويات</option></select></label>
      </div>
      <label class="field">المكونات (كل مكوّن في سطر)<textarea id="rfIng" rows="5"></textarea></label>
      <label class="field">الطريقة (كل خطوة في سطر)<textarea id="rfSteps" rows="5"></textarea></label>
      <button class="btn" data-act="saverecipe">حفظ الوصفة</button></div>`);
  }

  function saveRecipe() {
    const name = $('#rfName').value.trim();
    const lines = (s) => $(s).value.split('\n').map((x) => x.trim()).filter(Boolean);
    const ing = lines('#rfIng');
    const steps = lines('#rfSteps');
    if (!name || !ing.length || !steps.length) { toast('اكتبي الاسم والمكونات والطريقة'); return; }
    const m = me();
    S.custom.push({ id: 'c' + Date.now().toString(36), cat: $('#rfCat').value, name: name.slice(0, 40), time: ($('#rfTime').value.trim() || '—').slice(0, 20), ing, steps, custom: true, by: m ? m.id : null });
    RECIPES = BASE.concat(S.custom);
    save(); closeSheet(); renderAll(); toast('اتضافت الوصفة ✔');
  }

  /* ================= المتصدرين والأدمن والإشعارات ================= */
  let boardRange = 'week';
  const REMIND_KEY = 'kitchen-remind-v1';

  function renderBoard() {
    const since = boardRange === 'week' ? Date.now() - WEEK_MS : 0;
    const rows = W().map((m) => {
      const ls = S.log.filter((l) => l.by === m.id && l.at >= since);
      return { m, n: ls.length, pts: ls.reduce((a, l) => a + (l.pts || 10), 0) + (boardRange === 'all' ? (Number(S.bank[m.id]) || 0) : 0) };
    }).sort((a, b) => b.pts - a.pts || b.n - a.n);
    const medal = ['🥇', '🥈', '🥉'];
    const max = Math.max(1, rows[0].pts);
    const chip = (f, l) => `<button class="chip ${boardRange === f ? 'on' : ''}" data-act="brange" data-f="${f}">${l}</button>`;
    $('#tab-board').innerHTML = `<div class="chips">${chip('week', 'هذا الأسبوع')}${chip('all', 'الكل')}</div>
      <ol class="board">${rows.map((r, i) => `<li style="--c:${r.m.color}"><span class="rank">${medal[i] || i + 1}</span>
        <div class="bw"><b>${esc(r.m.name)}</b><small>${r.n} مهمة</small><i style="width:${Math.round(r.pts / max * 100)}%"></i></div>
        <span class="pts">${r.pts}⭐</span></li>`).join('')}</ol>
      <p class="muted">كل مهمة بتخلّصيها بتدّيكي نقاطها اللي حددها الأدمن.</p>`;
  }

  function daySheet(d) {
    const chk = (k, cur) => W().map((m) => `<label class="chip"><input type="checkbox" name="ov-${k}" value="${m.id}" ${cur.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('');
    const opts = (cur) => S.members.map((m) => `<option value="${m.id}" ${m.id === cur ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    openSheet(`<h2>مسؤولات ${DAYS[d]}</h2>
      <h4>الطبخ (تقدري تختاري أكتر من واحدة)</h4><div class="chips">${chk('cook', cooks(d))}</div>
      <h4>الترتيب والتنظيف</h4><div class="chips">${chk('clean', cleans(d))}</div>
      <div class="row"><button class="btn" data-act="saveday" data-d="${d}">حفظ</button>
      <button class="btn soft" data-act="resetday" data-d="${d}">رجوع للدور التلقائي</button></div>`);
  }

  function adminPanel() {
    const head = '<h3 class="sub" style="margin-top:0">👑 الأدمن</h3>';
    if (!S.admins.length) {
      return `<section class="panel">${head}<p class="help">لسه مفيش أدمن. الأدمن بس هو اللي بيضيف ويعدّل ويحذف المهام ويغيّر مسؤولات الأيام.</p><button class="btn gold" data-act="claimadmin">اجعليني الأدمن</button></section>`;
    }
    return `<section class="panel">${head}<div class="chips">${S.members.map((x) => {
      const a = S.admins.includes(x.id);
      return `<button class="chip ${a ? 'on' : ''}" ${isAdmin() ? `data-act="toggleadmin" data-id="${x.id}"` : 'disabled'}>${a ? '👑 ' : ''}${esc(x.name)}</button>`;
    }).join('')}</div><p class="help">${isAdmin() ? 'اضغطي على اسم لإضافته أو إزالته كأدمن.' : 'الأدمن بس يقدر يضيف أدمن تاني.'}</p></section>`;
  }

  function supervisorPanel() {
    const head = '<h3 class="sub" style="margin-top:0">👀 المشرفة (الأم)</h3>';
    return `<section class="panel">${head}<div class="chips">${S.members.map((x) => {
      const a = isSuper(x.id);
      return `<button class="chip ${a ? 'on' : ''}" data-act="togglesuper" data-id="${x.id}">${a ? '👀 ' : ''}${esc(x.name)}</button>`;
    }).join('')}</div><p class="help">المشرفة بتشوف كل المهام والإنجازات ولوحة متابعة، لكن مفيش عليها مهام ولا بتطبخ ولا بتاخد نقاط. تغييرها من الأدمن.</p></section>`;
  }

  let chan = null; // حالة قنوات الإشعارات من الـ Worker: { push, tg, bot }

  function notePanel() {
    const head = '<h3 class="sub" style="margin-top:0">🔔 الإشعارات</h3>';
    if (!S.wk) {
      return `<section class="panel">${head}
        <p class="help">علشان الإشعارات توصل والتطبيق مقفول (من أي متصفح أو من تيليجرام) محتاجين Worker على Cloudflare. الكود جاهز في ملف <b>worker.js</b> وخطواته في README. بعد ما تنشريه حطي رابطه هنا مرة واحدة وهيوصل لكل الأجهزة.</p>
        <label class="field">رابط الـ Worker<input type="text" id="wkUrl" dir="ltr" placeholder="https://kitchen-push.xxx.workers.dev"></label>
        <button class="btn alt" data-act="savewk" style="margin-top:8px">حفظ للكل</button></section>`;
    }
    const pushOn = !!localStorage.getItem(PUSH_KEY);
    const tgOn = !!(chan && chan.tg);
    const canTg = !chan || chan.bot !== false;
    return `<section class="panel">${head}
      <div class="chan"><div><b>🌐 المتصفح</b><small>${pushOn ? 'مفعّل على الجهاز ده ✔' : 'مش مفعّل على الجهاز ده'}</small></div>
        ${pushOn ? '' : '<button class="btn alt" data-act="pushon">تفعيل</button>'}</div>
      <div class="chan"><div><b>✈️ تيليجرام</b><small>${tgOn ? 'مربوط ✔ (بيوصلك على أي جهاز)' : (canTg ? 'مش مربوط' : 'البوت مش متظبط في الـ Worker')}</small></div>
        ${tgOn ? '<button class="btn soft" data-act="tgunlink">فك الربط</button>' : '<button class="btn alt" data-act="tglink">ربط</button>'}</div>
      <div class="row"><button class="btn soft" data-act="pushtest">جرّبي إشعار</button>
        ${isAdmin() ? '<button class="btn soft" data-act="clearwk">تغيير الـ Worker</button>' : ''}</div>
      <p class="help">بيوصلك تذكير الصبح والمسا بمهامك، وإشعار لما حد يديكي مهمة جديدة أو يخلّص مهمة. ${me() && isSuper(me().id) ? 'وبما إنك مشرفة هيجيلك ملخص آخر اليوم.' : ''} تقدرين تفعّلي القناتين مع بعض.</p></section>`;
  }

  async function refreshChan() {
    const c = getSync();
    const m = me();
    if (!S.wk || !c || !m) { chan = null; return; }
    try {
      const r = await fetch(`${S.wk}/status?room=${encodeURIComponent(c.room)}&me=${encodeURIComponent(m.id)}`);
      if (!r.ok) throw new Error(r.status);
      chan = await r.json();
      if (!isTyping()) renderMembers();
    } catch (e) { /* تجاهل */ }
  }

  async function tgLink() {
    const c = getSync();
    const m = me();
    if (!S.wk || !c || !m) { toast('فعّلي المزامنة واختاري اسمك الأول'); return; }
    try {
      const r = await fetch(`${S.wk}/link`, { method: 'POST', body: JSON.stringify({ room: c.room, me: m.id }) });
      const j = await r.json();
      if (!r.ok || !j.bot) throw new Error(j.error || 'البوت مش متظبط في الـ Worker');
      toast('اضغطي Start في تيليجرام وارجعي هنا');
      window.location.href = `https://t.me/${j.bot}?start=${j.code}`;
      setTimeout(refreshChan, 8000);
    } catch (e) { alert(`تعذّر الربط\n${e && e.message ? e.message : e}`); }
  }

  async function tgUnlink() {
    const c = getSync();
    const m = me();
    if (!S.wk || !c || !m) return;
    try {
      await fetch(`${S.wk}/unlink`, { method: 'POST', body: JSON.stringify({ room: c.room, me: m.id }) });
      toast('اتفك الربط');
      refreshChan();
    } catch (e) { toast('تعذّر فك الربط'); }
  }

  async function pushTest() {
    const c = getSync();
    const m = me();
    if (!S.wk || !c || !m) { toast('فعّلي المزامنة واختاري اسمك الأول'); return; }
    try {
      const r = await fetch(`${S.wk}/notify`, { method: 'POST', body: JSON.stringify({ room: c.room, from: '', to: m.id, title: '🔔 تجربة', body: `الإشعارات شغالة يا ${m.name} ✔` }) });
      const j = await r.json();
      toast(j.sent ? `اتبعت (${j.sent})، لو ماوصلش اتأكدي من القنوات` : 'مفيش قناة مفعّلة ليكي لسه');
    } catch (e) { toast('تعذّر الوصول للـ Worker'); }
  }

  const PUSH_KEY = 'kitchen-push-v1';
  const wkUrl = () => S.wk || localStorage.getItem(PUSH_KEY) || '';
  const u8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function enablePush(url) {
    let step = 'start';
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('المتصفح ده مش بيدعم الإشعارات.\nجرّبي كروم أو فايرفوكس أو إيدج أو سامسونج إنترنت، ومتفتحيش اللينك من جوه واتساب أو تطبيق تاني.');
        return;
      }
      url = String(url || S.wk).trim().replace(/\/+$/, '');
      if (!/^https:\/\/[^\s/]+/i.test(url)) { toast('الرابط لازم يبدأ بـ https://'); return; }
      if (!getSync()) { toast('فعّلي المزامنة الأول'); return; }
      if ((await Notification.requestPermission()) !== 'granted') { toast('لازم توافقي على الإشعارات'); return; }
      step = 'sw';
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('service worker مش شغال')), 6000))]);
      step = 'key';
      const { key } = await (await fetch(`${url}/key`)).json();
      step = 'subscribe';
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(key) });
      await caches.open('kitchen-cfg').then((c) => c.put('cfg', new Response(JSON.stringify({ wk: url }))));
      step = 'save';
      const r = await fetch(`${url}/subscribe`, { method: 'POST', body: JSON.stringify({ room: getSync().room, me: me() ? me().id : '', sub: sub.toJSON() }) });
      if (!r.ok) throw new Error(r.status);
      localStorage.setItem(PUSH_KEY, url);
      if (!S.wk) { S.wk = url; save(); }
      refreshChan();
      renderMembers();
      toast('اتفعّلت الإشعارات حتى والتطبيق مقفول 🔔');
    } catch (e) { alert(`تعذّر التفعيل\nالخطوة: ${step}\n${e && e.name ? e.name + ': ' : ''}${e && e.message ? e.message : e}`); }
  }

  function pushNotify(title, body, to) {
    const c = getSync();
    const m = me();
    if (!c || !wkUrl() || !m) return;
    fetch(`${wkUrl()}/notify`, { method: 'POST', body: JSON.stringify({ room: c.room, from: m.id, to: to || '', title, body }) }).catch(() => {});
  }

  function notify(title, body) {
    toast(body);
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    navigator.serviceWorker.getRegistration().then((r) => {
      if (r) r.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', dir: 'rtl', lang: 'ar' });
    });
  }

  function dailyReminder() {
    const m = me();
    if (!m || isSuper(m.id) || new Date().getHours() < 8) return;
    if (localStorage.getItem(PUSH_KEY) || (chan && chan.tg)) return; // الـ Worker بيبعت التذكيرات
    const key = new Date().toDateString() + m.id;
    if (localStorage.getItem(REMIND_KEY) === key) return;
    const parts = agendaOf(m.id);
    if (!parts.length) return;
    localStorage.setItem(REMIND_KEY, key);
    notify(`مهام ${DAYS[todayIdx()]}`, parts.join(' — '));
  }

  /* ================= التحكم والأحداث ================= */
  function renderAll() {
    renderBoard();
    renderRecipes();
    renderSchedule();
    renderTasks();
    renderMembers();
  }

  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
    document.querySelectorAll('.bar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    window.scrollTo(0, 0);
    if (name === 'members') refreshChan();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const d = el.dataset.d !== undefined ? Number(el.dataset.d) : undefined;
    const id = el.dataset.id;

    switch (act) {
      case 'tab': switchTab(el.dataset.tab); break;
      case 'closesheet': closeSheet(); break;
      case 'chooseme': chooserSheet(); break;
      case 'setme':
        localStorage.setItem(ME_KEY, id);
        viewMember = id;
        closeSheet();
        renderAll();
        toast(`أهلًا ${mName(id)}`);
        break;
      case 'viewmember': viewMember = id; renderMembers(); break;
      case 'setcolor': {
        const m = member(id);
        if (m) { m.color = el.dataset.c; save(); renderAll(); }
        break;
      }
      case 'removemember': removeMember(id); break;

      case 'syncnow': refreshStatus('جاري المزامنة...'); push().then(pull); break;
      case 'syncoff':
        stopStream();
        localStorage.removeItem(SYNC_KEY);
        lastSyncAt = null;
        refreshStatus();
        renderMembers();
        toast('اتوقفت المزامنة');
        break;
      case 'copyinvite': {
        const link = inviteLink();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(() => toast('اتنسخ رابط الدعوة')).catch(() => window.prompt('انسخي الرابط:', link));
        } else {
          window.prompt('انسخي الرابط:', link);
        }
        break;
      }
      case 'installapp':
        if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; renderMembers(); }
        break;

      case 'preset': setPreset(Number(el.dataset.n)); break;
      case 'swapweek':
        S.startCook = (S.startCook + 7) % NW();
        save(); renderSchedule();
        toast(`السبت الجاي الطبخ مع ${mName(cookId(0))}`);
        break;
      case 'clearmeals': S.meals = {}; save(); renderSchedule(); toast('اتمسحت الوصفات'); break;
      case 'randomall':
        for (let i = 0; i < 7; i++) randomMeal(i, true);
        save(); renderSchedule(); toast('اتقترحت وصفات للأسبوع كله');
        break;

      case 'toggleprotein': {
        S.protein = isProtein(d) ? S.protein.filter((x) => x !== d) : [...S.protein, d];
        const r = S.meals[d] ? recipeById(S.meals[d]) : null;
        if (r && r.cat !== catOfDay(d)) delete S.meals[d];
        save(); renderSchedule();
        break;
      }
      case 'pick': pickerSheet(d); break;
      case 'random': randomMeal(d); break;
      case 'clearmeal': delete S.meals[d]; save(); renderSchedule(); break;
      case 'viewrecipe': recipeSheet(id, d); break;
      case 'addmeal': {
        const day = Number($('#sheetDay').value);
        closeSheet();
        setMeal(day, id);
        break;
      }
      case 'rfilter': recipeFilter = el.dataset.f; renderRecipes(); break;

      case 'tfilter': taskFilter = el.dataset.f; renderTasks(); break;
      case 'toggletask': toggleTask(Number(id), el.checked); break;
      case 'cycletask': {
        if (!needAdmin()) break;
        const t = S.tasks.find((x) => x.id === Number(id));
        if (t) {
          const ws = W();
          const i = ws.findIndex((m) => m.id === t.who);
          t.who = ws[(i + 1) % ws.length].id;
          save(); renderAll();
        }
        break;
      }
      case 'deltask':
        if (!needAdmin()) break;
        S.tasks = S.tasks.filter((x) => x.id !== Number(id));
        save(); renderAll();
        break;
      case 'dist': distribute(false); break;
      case 'distall': distribute(true); break;
      case 'cleardone':
        if (!needAdmin()) break;
        S.tasks = S.tasks.filter((t) => !t.done);
        save(); renderAll(); toast('اتمسحت المهام المنجزة');
        break;
      case 'editday': if (needAdmin()) daySheet(d); break;
      case 'saveday':
        {
          const pick = (k) => [...document.querySelectorAll(`input[name="ov-${k}"]:checked`)].map((x) => x.value);
          const ck = pick('cook');
          const cl = pick('clean');
          if (!ck.length || !cl.length) { toast('اختاري واحدة على الأقل في كل قسم'); break; }
          S.overrides[d] = { cook: ck, clean: cl };
        }
        save(); closeSheet(); renderAll(); toast('اتعدّلت مسؤولات اليوم');
        break;
      case 'resetday': delete S.overrides[d]; save(); closeSheet(); renderAll(); toast('رجع الدور التلقائي'); break;
      case 'brange': boardRange = el.dataset.f; renderBoard(); break;
      case 'claimadmin':
        if (!requireMe()) break;
        if (!S.admins.length) { S.admins = [me().id]; save(); renderAll(); toast('بقيتي الأدمن 👑'); }
        break;
      case 'toggleadmin':
        if (!needAdmin()) break;
        if (S.admins.includes(id)) {
          if (S.admins.length < 2) { toast('لازم يفضل أدمن واحد على الأقل'); break; }
          S.admins = S.admins.filter((x) => x !== id);
        } else S.admins.push(id);
        save(); renderAll();
        break;
      case 'pushon': enablePush(S.wk); break;
      case 'savewk': {
        if (!needAdmin()) break;
        const u = String($('#wkUrl').value).trim().replace(/\/+$/, '');
        if (!/^https:\/\/[^\s/]+/i.test(u)) { toast('الرابط لازم يبدأ بـ https://'); break; }
        S.wk = u; save(); renderAll(); toast('اتحفظ رابط الـ Worker لكل الأجهزة'); refreshChan();
        break;
      }
      case 'clearwk':
        if (!needAdmin() || !confirm('تغيير رابط الـ Worker؟ لازم كل جهاز يفعّل الإشعارات تاني.')) break;
        S.wk = ''; localStorage.removeItem(PUSH_KEY); chan = null; save(); renderAll();
        break;
      case 'tglink': tgLink(); break;
      case 'tgunlink': tgUnlink(); break;
      case 'pushtest': pushTest(); break;
      case 'toggleduty': toggleDuty(el.dataset.key, el.checked); break;
      case 'togglesuper':
        if (!needAdmin()) break;
        if (isSuper(id)) {
          S.supers = S.supers.filter((x) => x !== id);
        } else {
          if (!S.members.some((m) => m.id !== id && !isSuper(m.id))) { toast('لازم يفضل عضو واحد على الأقل بيتكلّف بمهام'); break; }
          S.supers.push(id);
          S.tasks.forEach((t) => { if (t.who === id) t.who = null; });
          toast('بقت مشرفة 👀 والمهام اللي كانت معاها بقت من غير توزيع');
        }
        save(); renderAll();
        break;
      case 'saveweekly': {
        if (!needAdmin()) break;
        const list = String($('#weeklyList').value).split('\n').map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 12);
        S.weeklyList = list.length ? list : DEFAULT_AREAS.slice();
        save(); renderAll(); toast('اتحفظت قائمة التنظيف');
        break;
      }
      case 'notifon': Notification.requestPermission().then(() => { renderMembers(); dailyReminder(); }); break;
      case 'pickdessert': dessertSheet(d); break;
      case 'cleardessert': delete S.desserts[d]; save(); renderSchedule(); break;
      case 'newrecipe': recipeForm(); break;
      case 'saverecipe': saveRecipe(); break;
      case 'delrecipe':
        if (!confirm('حذف الوصفة دي؟')) break;
        S.custom = S.custom.filter((r) => r.id !== id);
        RECIPES = BASE.concat(S.custom);
        save(); closeSheet(); renderAll(); toast('اتحذفت الوصفة');
        break;
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const cd = e.target.closest('[data-cleanday]');
    if (cd) {
      if (!needAdmin()) { renderSchedule(); return; }
      S.cleanDay = Number(cd.value);
      save(); renderAll();
      toast(S.cleanDay < 0 ? 'اتلغى يوم التنظيف الأسبوعي' : `يوم التنظيف الأسبوعي: ${DAYS[S.cleanDay]}`);
      return;
    }
    const input = e.target.closest('[data-mname]');
    if (!input) return;
    const m = member(input.dataset.mname);
    const v = input.value.trim();
    if (m && v) { m.name = v.slice(0, 20); save(); }
    renderAll();
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'rsearch') {
      recipeQuery = e.target.value.trim();
      renderRecipeList();
    }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target.id;
    if (f === 'taskForm') {
      e.preventDefault();
      const title = $('#taskTitle').value;
      if (title.trim()) addTask(title, $('#taskWho').value, $('#taskDay').value);
    } else if (f === 'memberForm') {
      e.preventDefault();
      const v = $('#newMember').value;
      if (v.trim()) addMember(v);
    } else if (f === 'syncForm') {
      e.preventDefault();
      enableSync($('#syncUrl').value, $('#syncRoom').value);
    }
  });

  document.addEventListener('toggle', (e) => {
    const k = e.target && e.target.dataset && e.target.dataset.key;
    if (k) openDetails[k] = e.target.open;
  }, true);

  document.addEventListener('focusout', () => {
    if (!pendingRender) return;
    setTimeout(() => {
      if (!isTyping()) { pendingRender = false; renderAll(); }
    }, 80);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
  });

  /* ================= تشغيل ================= */
  if (!S.wk && localStorage.getItem(PUSH_KEY)) { S.wk = localStorage.getItem(PUSH_KEY); save(); }
  renderAll();
  renderRecipes();
  refreshChan();
  setInterval(dailyReminder, 60000);
  setTimeout(dailyReminder, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) dailyReminder(); });

  const qs = new URLSearchParams(location.search);
  if (qs.get('db') && qs.get('room')) {
    enableSync(qs.get('db'), qs.get('room'));
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* تجاهل */ }
  } else if (getSync()) {
    refreshStatus('جاري الاتصال...');
    startStream();
    pull();
  }

  if (!me()) {
    if (getSync()) {
      // جهاز بيدخل على مزامنة: استني أول تحديث علشان الأسماء تبقى الصح
      setTimeout(() => { if (!me() && !syncedOnce && $('#sheet').hidden) chooserSheet(); }, 4000);
    } else {
      setTimeout(chooserSheet, 400);
    }
  }

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* تجاهل */ });
  }
})();
