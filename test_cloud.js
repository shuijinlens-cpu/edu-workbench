/* 端到端测试：共享云端存储 + 两个设备，验证登录/角色隔离/打卡/同步 */
const fs = require('fs'), vm = require('vm');
const files = ['principal.html', 'teacher.html', 'xueguan.html'];
let failures = 0;
const ok = (m) => console.log('  PASS  ' + m);
const bad = (m) => { console.log('  FAIL  ' + m); failures++; };

/* ---------- 共享云端 ---------- */
const CLOUD = {};          // databaseId -> [row]（服务端存储 = PropertyValue 写入格式）
const HANDLERS = [];
function rid(p) { return 'r' + Math.random().toString(36).slice(2, 10); }
/* 服务端返回时把 PropertyValue 拍平为 FieldValue（与真实 SDK 一致） */
function flat(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
  const keys = Object.keys(v);
  if (keys.length === 1 && ['text', 'number', 'select', 'date', 'checkbox', 'email', 'phone_number'].indexOf(keys[0]) >= 0) {
    return keys[0] === 'checkbox' ? !!v.checkbox : v[keys[0]];
  }
  return v;
}
function makeSDK() {
  return {
    query(p) {
      const all = (CLOUD[p.databaseId] || []).slice();
      const start = p.startCursor ? all.findIndex(r => r._id === p.startCursor) + 1 : 0;
      const page = all.slice(start, start + (p.pageSize || 50));
      const next = start + page.length < all.length ? page[page.length - 1]._id : '';
      return Promise.resolve({
        results: page.map(r => {
          const o = { _id: r._id };
          Object.keys(r).forEach(k => { if (k !== '_id') o[k] = flat(r[k]); });
          return o;
        }),
        nextCursor: next, hasMore: !!next
      });
    },
    addRecord(p) {
      const rec = Object.assign({}, p.properties); rec._id = rid();
      (CLOUD[p.databaseId] = CLOUD[p.databaseId] || []).push(rec);
      HANDLERS.forEach(h => h({ databaseIds: [p.databaseId] }));
      return Promise.resolve({ id: rec._id });
    },
    updateRecord(p) {
      const arr = CLOUD[p.databaseId] || [];
      const i = arr.findIndex(r => r._id === p.recordId);
      if (i >= 0) { arr[i] = Object.assign({}, arr[i], p.properties); HANDLERS.forEach(h => h({ databaseIds: [p.databaseId] })); }
      return Promise.resolve({ id: p.recordId });
    },
    deleteRecord(p) {
      const arr = CLOUD[p.databaseId] || [];
      const i = arr.findIndex(r => r._id === p.recordId);
      if (i >= 0) { arr.splice(i, 1); HANDLERS.forEach(h => h({ databaseIds: [p.databaseId] })); }
      return Promise.resolve({});
    },
    getSchema() { return Promise.resolve({ properties: [] }); },
    getUserInfo() { return Promise.resolve({ userInfo: { nickName: 'tester' } }); },
    onUpdated(h) { HANDLERS.push(h); }
  };
}
function seedCloud() {
  // 用真实接口同款结构预置（与 setup/seed 脚本一致）
  const T = (v) => ({ text: v }), N = (v) => ({ number: v }), S = (v) => ({ select: v }), CB = (v) => ({ checkbox: !!v }), D = (v) => ({ date: v }), P = (v) => ({ phone_number: v });
  const A = '应用ID';
  const put = (id, rows) => { CLOUD[id] = rows.map(r => { r._id = rid(); return r; }); };
  const ids = JSON.parse(fs.readFileSync('db_ids.json', 'utf8'));
  put(ids.teachers, [
    { 姓名: T('王老师'), 科目: T('数学'), 一对一课酬: N(80), 班课课酬: N(40), 状态: S('启用'), [A]: T('t1') },
    { 姓名: T('李老师'), 科目: T('英语'), 一对一课酬: N(75), 班课课酬: N(38), 状态: S('启用'), [A]: T('t2') }
  ]);
  const wf = JSON.stringify({ elective: { count: 1, type: '班课' }, mock: { count: 1, type: '班课' }, paper: 2, materials: { count: 1, desc: '数学包' }, voucher: 200 });
  put(ids.students, [
    { 姓名: T('小明'), 年级: S('初三'), 家长电话: P('13800000001'), 状态: S('在读'), 来源: T('转介绍'), 报名班型: S('班课'), 正课总次数: N(20), 正课剩余: N(20), 福利: T(wf), 录入学年: T('2025'), [A]: T('s1') },
    { 姓名: T('小红'), 年级: S('高一'), 家长电话: P('13800000002'), 状态: S('在读'), 来源: T('地推'), 报名班型: S('一对一'), 正课总次数: N(8), 正课剩余: N(8), 福利: T('{}'), 录入学年: T('2025'), [A]: T('s2') },
    { 姓名: T('小刚'), 年级: S('初二'), 家长电话: P('13800000003'), 状态: S('在读'), 来源: T('线上广告'), 报名班型: S('班课'), 正课总次数: N(3), 正课剩余: N(3), 福利: T('{}'), 录入学年: T('2025'), [A]: T('s3') }
  ]);
  const st = JSON.stringify([{ studentId: 's1', studentName: '小明', consume: '正课' }, { studentId: 's3', studentName: '小刚', consume: '正课' }]);
  put(ids.courses, [
    { 日期: D('2026-10-20'), 时间: T('09:00'), 教师ID: T('t1'), 教师: T('王老师（数学）'), 班型: S('班课'), 科目: T('数学'), 课时数: N(1), 状态: S('未上'), 类型: S('正课'), 学员: T(st), [A]: T('c1') },
    { 日期: D('2026-10-20'), 时间: T('15:00'), 教师ID: T('t2'), 教师: T('李老师（英语）'), 班型: S('一对一'), 科目: T('英语'), 课时数: N(1), 状态: S('未上'), 类型: S('正课'), 学员: T(JSON.stringify([{ studentId: 's2', studentName: '小红', consume: '正课' }])), [A]: T('c2') }
  ]);
  put(ids.tasks, [{ 标题: T('备好讲义'), 教师ID: T('t1'), 教师: T('王老师（数学）'), 截止: D('2026-10-18'), 完成: CB(false), 全体: CB(false), 发布人: T('校长'), [A]: T('k1') }]);
  put(ids.followups, []);
  put(ids.finance, [{ 日期: D('2026-10-10'), 学员ID: T('s1'), 学员: T('小明'), 类型: S('新签'), 金额: N(1500), 实收: N(1500), 代金券抵扣: N(0), 课时: N(20), 报名班型: S('班课'), [A]: T('i1') }]);
  put(ids.kv, [
    { 键: T('settings'), 内容: T(JSON.stringify({ priceMatrix: { 小学: { '1v1': 120, '班课': 60 }, 初中: { '1v1': 150, '班课': 75 }, 高中: { '1v1': 180, '班课': 90 } }, teacherWageDefault: { '1v1': 80, '班课': 40 }, fixedItems: [] })), [A]: T('__settings__') },
    { 键: T('fblib'), 内容: T('[]'), [A]: T('__fblib__') }
  ]);
  put(ids.accounts, [
    { 姓名: T('张校长'), 手机号: P('13800000000'), 身份: S('校长'), 登录码: T('888888'), 教师ID: T(''), 状态: S('启用'), [A]: T('a1') },
    { 姓名: T('王老师'), 手机号: P('13800000001'), 身份: S('老师'), 登录码: T('111111'), 教师ID: T('t1'), 状态: S('启用'), [A]: T('a2') },
    { 姓名: T('李老师'), 手机号: P('13800000002'), 身份: S('老师'), 登录码: T('222222'), 教师ID: T('t2'), 状态: S('启用'), [A]: T('a3') },
    { 姓名: T('小学管'), 手机号: P('13800000003'), 身份: S('学管'), 登录码: T('333333'), 教师ID: T(''), 状态: S('启用'), [A]: T('a4') }
  ]);
  return ids;
}

/* ---------- DOM 桩 ---------- */
function buildSandbox() {
  const elCache = {};
  function makeEl(id) {
    const el = {
      id, value: '', _html: '', _t: '', checked: false, dataset: {}, options: [], style: {}, files: [],
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute() {}, getAttribute() { return null; }, appendChild() {}, remove() {}, focus() {}, click() {},
      addEventListener() {}, removeEventListener() {},
      querySelector() { return makeEl('__q'); }, querySelectorAll() { return []; },
      closest() { return makeEl('__modal'); }
    };
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); } });
    Object.defineProperty(el, 'textContent', { get() { return el._t; }, set(v) { el._t = String(v); } });
    return el;
  }
  const ge = (id) => elCache[id] || (elCache[id] = makeEl(id));
  const store = new Map();
  const body = makeEl('body');
  const doc = {
    readyState: 'complete', body, getElementById: ge,
    querySelectorAll: () => [], querySelector: () => makeEl('__qs'),
    addEventListener() {}, createElement: () => makeEl('__new')
  };
  return {
    document: doc, window: { addEventListener() {}, removeEventListener() {} },
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k), clear: () => store.clear()
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    location: { protocol: 'https:', href: 'https://x/principal.html', reload() {} },
    alert: () => {}, confirm: () => true, prompt: () => '', console, Math, Date, JSON, Number, String, Array, Object,
    Boolean, RegExp, Error, isNaN, parseInt, parseFloat, Promise, setTimeout, setInterval, clearTimeout, Symbol,
    Blob, FileReader: function () {}, URL: { createObjectURL: () => 'blob:x' }
  };
}
function loadApp(sb, file) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');
  vm.createContext(sb);
  vm.runInContext(scripts, sb);
  sb.window.__SMART_PAGE__ = { database: makeSDK() };
  vm.runInContext('start()', sb);
}
function waitFor(fn, ms) {
  const t0 = Date.now();
  return new Promise((res, rej) => {
    (function tick() {
      let v = false; try { v = fn(); } catch (e) {}
      if (v) return res(v);
      if (Date.now() - t0 > (ms || 4000)) return rej(new Error('timeout'));
      setTimeout(tick, 20);
    })();
  });
}

(async function () {
  const ids = seedCloud();

  /* ===== 1. 静态检查 ===== */
  console.log('\n[1] 静态检查');
  for (const f of files) {
    const h = fs.readFileSync(f, 'utf8');
    const role = f === 'principal.html' ? '校长' : f === 'teacher.html' ? '老师' : '学管';
    const checks = [
      ['云端ID已注入', h.indexOf(ids.accounts) > 0 && h.indexOf(ids.students) > 0 && h.indexOf(ids.kv) > 0],
      ['身份=' + role, h.indexOf("ROLE='" + role + "'") > 0],
      ['登录门', h.indexOf('id="gate"') > 0 && h.indexOf('id="gBtn"') > 0],
      ['同步工具条', h.indexOf('id="syncChip"') > 0 && h.indexOf('id="btnExport"') > 0],
      ['start() 启动', /readyState==='loading'\)\{window\.addEventListener\('DOMContentLoaded',start/.test(h)],
      ['旧 seed 已移除', h.indexOf('function seed(){') < 0],
      ['PWA manifest', h.indexOf('rel="manifest"') > 0]
    ];
    checks.forEach(([n, v]) => v ? ok(f + ' · ' + n) : bad(f + ' · ' + n));
  }
  const ph = fs.readFileSync('principal.html', 'utf8');
  [
    ['账号管理卡片', ph.indexOf('id="acList"') > 0 && ph.indexOf('renderAccounts') > 0],
    ['教师表单含登录码', ph.indexOf('id="ntCode"') > 0],
    ['添加账号按钮', ph.indexOf('id="acAdd"') > 0]
  ].forEach(([n, v]) => v ? ok('principal · ' + n) : bad('principal · ' + n));
  const th = fs.readFileSync('teacher.html', 'utf8');
  [
    ['已去掉老师切换下拉', th.indexOf('id="curTeacher"') < 0],
    ['显示当前教师', th.indexOf('id="whoName"') > 0],
    ['按会话绑定教师', th.indexOf('SESS.teacherId') > 0]
  ].forEach(([n, v]) => v ? ok('teacher · ' + n) : bad('teacher · ' + n));

  /* ===== 2. 校长端：登录 + 打卡 ===== */
  console.log('\n[2] 校长端（设备A）');
  const A = buildSandbox();
  loadApp(A, 'principal.html');
  await new Promise(r => setTimeout(r, 700));
  console.log('   [debug] SYNC=' + JSON.stringify(A.SYNC) + ' accounts=' + (A.STORE.accounts || []).length + ' students=' + (A.STORE.students || []).length + ' err=' + (A.__lastErr || ''));
  await waitFor(() => A.SYNC && A.SYNC.txt === '已同步');
  ok('云端连接成功，数据已拉取');
  A.document.getElementById('gName').value = '张校长';
  A.document.getElementById('gCode').value = '888888';
  A.document.getElementById('gBtn').onclick();
  A.SESS && A.SESS.role === '校长' ? ok('校长登录成功') : bad('校长登录失败');

  // 错误身份拒绝
  A._sessSet(null);
  A.document.getElementById('gName').value = '王老师';
  A.document.getElementById('gCode').value = '111111';
  A.document.getElementById('gBtn').onclick();
  A.SESS === null && A.document.getElementById('gErr')._t.indexOf('身份') > 0
    ? ok('老师账号在校长端被拒绝（身份校验生效）') : bad('身份校验未生效');
  A.document.getElementById('gName').value = '张校长';
  A.document.getElementById('gCode').value = '888888';
  A.document.getElementById('gBtn').onclick();

  // 错误登录码
  const before = A.getStudents().find(s => s.id === 's1').regular.left;
  const consume0 = A.calcBiz('2026-10').consume;
  A.setCourseDone('c1');
  const after = A.getStudents().find(s => s.id === 's1').regular.left;
  const consume1 = A.calcBiz('2026-10').consume;
  const st3 = A.getStudents().find(s => s.id === 's3').regular.left;
  after === before - 1 && st3 === 2 ? ok('打卡扣课时：小明 ' + before + '→' + after + '，小刚 3→' + st3) : bad('打卡扣课时异常');
  consume1 > consume0 ? ok('校长端课消 ' + consume0 + '→' + consume1) : bad('课消未变动');

  // 等待写队列落库
  await waitFor(() => {
    const rows = (CLOUD[ids.students] || []).filter(r => r['应用ID'].text === 's1');
    return rows.length && rows[0]['正课剩余'] && rows[0]['正课剩余'].number === 19;
  }, 3000);
  ok('云端学员表已更新（小明剩余 19）');
  const cloudDone = (CLOUD[ids.courses] || []).find(r => r['应用ID'].text === 'c1');
  cloudDone && cloudDone['状态'] && cloudDone['状态'].select === '已上' ? ok('云端排课表状态=已上') : bad('云端排课状态未更新');

  /* ===== 3. 教师端（设备B）：只可见自己的 ===== */
  console.log('\n[3] 教师端（设备B · 同步校长端改动）');
  const B = buildSandbox();
  loadApp(B, 'teacher.html');
  await waitFor(() => B.SYNC && B.SYNC.txt === '已同步');
  B.document.getElementById('gName').value = '王老师';
  B.document.getElementById('gCode').value = '111111';
  B.document.getElementById('gBtn').onclick();
  B.SESS && B.SESS.role === '老师' ? ok('王老师登录成功') : bad('王老师登录失败');
  const mine = B.myCourses();
  mine.length === 1 && mine[0].teacherId === 't1' ? ok('只看自己的课（1 节，无切换入口）') : bad('教师端课程隔离异常: ' + mine.length);
  const bLeft = B.getStudents().find(s => s.id === 's1').regular.left;
  bLeft === 19 ? ok('教师端已同步到校长端打卡结果（小明剩余 19）') : bad('教师端未同步，剩余=' + bLeft);
  // 学管身份拒绝
  B._sessSet(null);
  B.document.getElementById('gName').value = '小学管';
  B.document.getElementById('gCode').value = '333333';
  B.document.getElementById('gBtn').onclick();
  B.SESS === null ? ok('学管账号在教师端被拒绝') : bad('学管账号在教师端未被拒绝');

  /* ===== 4. 学管端（设备C） ===== */
  console.log('\n[4] 学管端（设备C）');
  const C = buildSandbox();
  loadApp(C, 'xueguan.html');
  await waitFor(() => C.SYNC && C.SYNC.txt === '已同步');
  C.document.getElementById('gName').value = '小学管';
  C.document.getElementById('gCode').value = '333333';
  C.document.getElementById('gBtn').onclick();
  C.SESS && C.SESS.role === '学管' ? ok('学管登录成功') : bad('学管登录失败');
  const cAll = C.getCourses();
  cAll.length === 2 ? ok('学管端看到排课（同一云端，2 节）') : bad('学管端排课数量异常: ' + cAll.length);
  const c1seen = cAll.find(c => c.id === 'c1');
  c1seen && c1seen.status === '已上' ? ok('学管端可见校长端打卡状态（c1=已上）') : bad('学管端未见校长端改动');

  /* ===== 5. 反向同步：学管打卡 → 校长端可见 ===== */
  console.log('\n[5] 反向同步');
  C.setCourseDone('c2');
  await waitFor(() => {
    const rows = (CLOUD[ids.students] || []).filter(r => r['应用ID'].text === 's2');
    return rows.length && rows[0]['正课剩余'] && rows[0]['正课剩余'].number === 7;
  }, 3000);
  ok('学管端打卡已写入云端（小红剩余 7）');
  const A2 = buildSandbox();
  loadApp(A2, 'principal.html');
  await waitFor(() => A2.SYNC && A2.SYNC.txt === '已同步');
  const a2left = A2.getStudents().find(s => s.id === 's2').regular.left;
  a2left === 7 ? ok('校长端重新打开即见学管端打卡结果') : bad('反向同步失败，剩余=' + a2left);

  /* ===== 6. 添加教师并开通账号 → 新账号可登录 ===== */
  console.log('\n[6] 校长端添加教师+开通账号');
  A.document.getElementById('ntName').value = '赵老师';
  A.document.getElementById('ntSubj').value = '物理';
  A.document.getElementById('ntW1').value = '90';
  A.document.getElementById('ntWb').value = '45';
  A.document.getElementById('ntPhone').value = '13800000009';
  A.document.getElementById('ntCode').value = '444444';
  A.document.getElementById('ntAdd').onclick();
  await waitFor(() => {
    const rows = (CLOUD[ids.teachers] || []).filter(r => r['应用ID'] && r['应用ID'].text && r['姓名'] && r['姓名'].text === '赵老师');
    return rows.length && rows[0]['一对一课酬'] && rows[0]['一对一课酬'].number === 90 && rows[0]['状态'].select === '启用';
  }, 3000);
  ok('云端教师表新增赵老师（课酬/状态正确包装）');
  await waitFor(() => {
    const rows = (CLOUD[ids.accounts] || []).filter(r => r['应用ID'] && r['应用ID'].text && r['姓名'] && r['姓名'].text === '赵老师');
    return rows.length && rows[0]['身份'].select === '老师' && rows[0]['登录码'].text === '444444' && rows[0]['手机号'].phone_number === '13800000009';
  }, 3000);
  ok('云端账号表同步开通（身份/登录码/手机号格式正确）');
  const D = buildSandbox();
  loadApp(D, 'teacher.html');
  await waitFor(() => D.SYNC && D.SYNC.txt === '已同步');
  D.document.getElementById('gName').value = '赵老师';
  D.document.getElementById('gCode').value = '444444';
  D.document.getElementById('gBtn').onclick();
  D.SESS && D.SESS.role === '老师' ? ok('新开通账号在教师端登录成功') : bad('新账号登录失败');

  /* ===== 7. XSS 转义往返 ===== */
  console.log('\n[7] XSS 转义往返（云端存原文 · 读取转义 · 不双重转义）');
  {
    const stus = A.getStudents();
    stus.push({ id: 'sX', name: '<b>小险</b>&&"', grade: '初三', phone: '13800000009', status: '在读', source: '<script>', note: "O'Brien", regular: { type: '班课', total: 10, left: 10 }, welfare: { elective: { count: 1, type: '班课' }, mock: { count: 0, type: '班课' }, paper: 0, materials: { count: 0, desc: '<i>包</i>' }, voucher: 0 }, enrollYear: 2026 });
    A.save('students', stus);
    await waitFor(() => {
      const rows = (CLOUD[ids.students] || []).filter(r => r['应用ID'] && r['应用ID'].text === 'sX');
      return rows.length && rows[0]['姓名'] && rows[0]['姓名'].text === '<b>小险</b>&&"';
    }, 3000);
    ok('云端存原文（<b>小险</b> 未转义落库）');
    const wf = (CLOUD[ids.students] || []).find(r => r['应用ID'].text === 'sX')['福利'].text;
    wf.indexOf('<i>包</i>') >= 0 ? ok('福利 JSON 内存原文') : bad('福利 JSON 被转义: ' + wf.slice(0, 60));
    // 重新 hydrate 后读取侧应为转义态
    await new Promise(r => setTimeout(r, 1200));
    const E = buildSandbox();
    loadApp(E, 'principal.html');
    await waitFor(() => E.SYNC && E.SYNC.txt === '已同步');
    const sx = E.getStudents().find(s => s.id === 'sX');
    sx && sx.name === '&lt;b&gt;小险&lt;/b&gt;&amp;&amp;&quot;' ? ok('读取侧已转义（防 XSS）') : bad('读取侧未转义: ' + (sx && sx.name));
    sx && sx.welfare.materials.desc === '&lt;i&gt;包&lt;/i&gt;' ? ok('嵌套 JSON 字段同样转义') : bad('嵌套字段未转义');
    // 再写一次不双重转义
    E.save('students', E.getStudents());
    await waitFor(() => {
      const rows = (CLOUD[ids.students] || []).filter(r => r['应用ID'] && r['应用ID'].text === 'sX');
      return rows.length && rows[0]['姓名'] && rows[0]['姓名'].text === '<b>小险</b>&&"';
    }, 3000);
    ok('二次写入无双重转义（云端仍为原文）');
  }

  /* ===== 8. 铁律自检 ===== */
  console.log('\n[8] 铁律自检（render 不互调）');
  const names = ['renderBanner', 'renderBiz', 'renderStu', 'renderTeacher', 'renderAccounts', 'renderAll', 'renderSched', 'renderFb', 'renderFbOut', 'renderStudents', 'renderMine', 'renderFollow', 'renderWarn', 'renderToday', 'renderCalendar', 'renderCourseStuBox', 'renderTop', 'renderSchedule', 'renderFeedback'];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    let inR = null, v = [];
    for (const ln of lines) {
      const m = ln.match(/function\s+(render\w*)\s*\(/);
      if (m) { inR = m[1]; continue; }
      if (/^\s*\}\s*$/.test(ln) && inR) { inR = null; continue; }
      if (!inR) continue;
      (ln.match(/(render\w*)\(\)/g) || []).forEach(c => { const n = c.replace('()', ''); if (names.includes(n) && n !== inR) v.push(inR + '→' + n); });
    }
    v.length ? bad(f + ' 渲染互调: ' + v.join(',')) : ok(f + ' 无渲染互调');
  }

  console.log('\n==== ' + (failures ? failures + ' 项失败' : '全部通过') + ' ====');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('测试异常:', e); process.exit(1); });
