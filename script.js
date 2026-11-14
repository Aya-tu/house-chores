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
  const SHARED = ['members', 'startCook', 'protein', 'meals', 'tasks', 'log', 'admins', 'overrides', 'desserts', 'custom'];
  const MAX_MEMBERS = 12;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mkMember = (name, i) => ({ id: uid(), name, color: COLORS[i % COLORS.length] });
  const newTaskId = () => Date.now() + Math.floor(Math.random() * 1000);

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
  const ov = (d, k) => {
    const v = S.overrides[d] && S.overrides[d][k];
    const a = (typeof v === 'string' ? [v] : asArr(v)).filter((x) => member(x));
    return a.length ? a : null;
  };
  const cooks = (d) => ov(d, 'cook') || [S.members[(S.startCook + d) % N()].id];
  const cookId = (d) => cooks(d)[0];
  const cleans = (d) => ov(d, 'clean') || [S.members[(S.startCook + d + (N() > 1 ? 1 : 0)) % N()].id];
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
      open: S.tasks.filter((t) => t.who === id && !t.done).length,
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

      ${adminPanel()}${notePanel()}
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
    S.members = S.members.filter((x) => x.id !== id);
    S.startCook %= N();
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
        <div><dt>الترتيب والتنظيف</dt><dd>${cleans(d).map((x) => mcSpan(x)).join('، ')}</dd></div>
      </dl>
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
      </details>
      <div class="days">${DAYS.map((_, d) => dayCard(d, today)).join('')}</div>`;
    renderHeader();
  }

  /* ================= المهام ================= */
  function openCount(id) { return S.tasks.filter((t) => t.who === id && !t.done).length; }

  function pickLeastLoaded() {
    return S.members.reduce((best, m) => (openCount(m.id) < openCount(best.id) ? m : best), S.members[0]).id;
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
        ${S.members.map((m) => {
          const st = stats(m.id);
          return `<div class="count" style="--c:${m.color}"><span class="mc">${esc(m.name)}</span><b>${st.open} متبقية</b><span class="muted">${st.doneWeek} خلّصتها آخر ٧ أيام</span></div>`;
        }).join('')}
      </div>

      <form class="panel addform" id="taskForm" autocomplete="off">
        <label class="field">مهمة جديدة<input type="text" id="taskTitle" placeholder="مثال: تنظيف التلاجة" maxlength="60" required></label>
        <div class="pair">
          <label class="field">مين تعملها
            <select id="taskWho">
              <option value="auto">توزيع تلقائي</option>
              ${S.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
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
        ${S.members.map((m) => chip(m.id, `<i class="dot" style="--c:${m.color}"></i>${esc(m.name)}`)).join('')}
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
  }

  function distribute(all) {
    if (!needAdmin()) return;
    const targets = S.tasks.filter((t) => !t.done && (all || !t.who));
    if (!targets.length) { toast('مفيش مهام محتاجة توزيع'); return; }
    const load = {};
    S.members.forEach((m) => { load[m.id] = all ? 0 : openCount(m.id); });
    targets.forEach((t) => {
      const best = S.members.reduce((b, m) => (load[m.id] < load[b.id] ? m : b), S.members[0]);
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
      if (!requireMe()) { renderTasks(); return; }
      const m = me();
      t.done = true;
      t.doneBy = m.id;
      t.doneByName = m.name;
      t.doneAt = Date.now();
      S.log.unshift({ id: t.id, title: t.title, by: m.id, byName: m.name, at: t.doneAt, assigned: t.who || null, pts: t.pts || 10 });
      S.log = S.log.slice(0, 300);
      if (!S.tasks.some((x) => x.who === m.id && !x.done)) S.log[0].all = true;
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
    const rows = S.members.map((m) => {
      const ls = S.log.filter((l) => l.by === m.id && l.at >= since);
      return { m, n: ls.length, pts: ls.reduce((a, l) => a + (l.pts || 10), 0) };
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
    const chk = (k, cur) => S.members.map((m) => `<label class="chip"><input type="checkbox" name="ov-${k}" value="${m.id}" ${cur.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('');
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

  function notePanel() {
    const p = 'Notification' in window ? Notification.permission : 'unsupported';
    const body = p === 'granted' ? '<p class="help">مفعّلة ✔ هتوصلك تذكيرات مهام اليوم وإشعار لما حد يخلّص مهامه.</p>'
      : p === 'unsupported' ? '<p class="help">المتصفح ده مش بيدعم الإشعارات. على الآيفون ثبّتي التطبيق على الشاشة الرئيسية الأول.</p>'
      : '<button class="btn alt" data-act="notifon">تفعيل الإشعارات</button>';
    return `<section class="panel"><h3 class="sub" style="margin-top:0">🔔 الإشعارات</h3>${body}${wkUrl() ? '<p class="help">🔔 إشعارات التطبيق المقفول مفعّلة على الجهاز ده ✔</p>' : `<label class="field" style="margin-top:10px">رابط الـ Worker (للإشعارات والتطبيق مقفول)<input type="text" id="wkUrl" dir="ltr" placeholder="https://kitchen-push.xxx.workers.dev"></label><button class="btn alt" data-act="pushon" style="margin-top:8px">تفعيل إشعارات التطبيق المقفول</button>`}</section>`;
  }

  const PUSH_KEY = 'kitchen-push-v1';
  const wkUrl = () => localStorage.getItem(PUSH_KEY) || '';
  const u8 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  async function enablePush(url) {
    let step = 'start';
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('المتصفح ده مش بيدعم الإشعارات.\nجرّبي كروم أو فايرفوكس أو إيدج أو سامسونج إنترنت، ومتفتحيش اللينك من جوه واتساب أو تطبيق تاني.');
        return;
      }
      url = String(url).trim().replace(/\/+$/, '');
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
      renderMembers();
      toast('اتفعّلت الإشعارات حتى والتطبيق مقفول 🔔');
    } catch (e) { alert(`تعذّر التفعيل\nالخطوة: ${step}\n${e && e.name ? e.name + ': ' : ''}${e && e.message ? e.message : e}`); }
  }

  function pushNotify(title, body) {
    const c = getSync();
    const m = me();
    if (!c || !wkUrl() || !m) return;
    fetch(`${wkUrl()}/notify`, { method: 'POST', body: JSON.stringify({ room: c.room, from: m.id, title, body }) }).catch(() => {});
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
    if (!m || new Date().getHours() < 8) return;
    const key = new Date().toDateString() + m.id;
    if (localStorage.getItem(REMIND_KEY) === key) return;
    const t = todayIdx();
    const mine = S.tasks.filter((x) => x.who === m.id && !x.done && (x.day === t || x.day < 0));
    const parts = [];
    if (cooks(t).includes(m.id)) parts.push('النهارده دورك في الطبخ 🍳');
    if (cleans(t).includes(m.id)) parts.push('ودورك في الترتيب والتنظيف 🧹');
    if (mine.length) parts.push(`عندك ${mine.length} مهام: ${mine.slice(0, 3).map((x) => x.title).join('، ')}`);
    if (!parts.length) return;
    localStorage.setItem(REMIND_KEY, key);
    notify(`مهام ${DAYS[t]}`, parts.join(' — '));
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
        S.startCook = (S.startCook + 7) % N();
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
          const i = S.members.findIndex((m) => m.id === t.who);
          t.who = S.members[(i + 1) % N()].id;
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
      case 'pushon': enablePush($('#wkUrl').value); break;
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
  renderAll();
  renderRecipes();
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
