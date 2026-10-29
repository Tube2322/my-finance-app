// ทดสอบสูตรคำนวณใน index.html โดยไม่ต้องมีเบราว์เซอร์และไม่ต้องติดตั้งอะไรเพิ่ม
// รัน: node --test
// วิธีทำ: ดึงสคริปต์หลักจาก index.html มารันใน vm พร้อม DOM จำลองแบบหยาบ (พอให้โค้ดบนสุดผ่าน)
// ฟังก์ชันที่ประกาศด้วย const ระดับบนสุดเข้าถึงได้จากสคริปต์ถัดไปใน context เดียวกัน
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function fakeEl() {
  const store = { style: {}, dataset: {}, value: '', innerHTML: '', textContent: '' };
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'options') return [];
      if (typeof k === 'symbol') return undefined;
      return () => fakeEl();
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function loadApp() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const code = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const mem = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, Date, Math, JSON, Intl, Promise,
    document: {
      getElementById: () => fakeEl(), querySelector: () => fakeEl(), querySelectorAll: () => [],
      createElement: () => fakeEl(), addEventListener() {}, documentElement: fakeEl(), body: fakeEl(), activeElement: null,
    },
    localStorage: { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) },
    navigator: {}, location: { protocol: 'http:' },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, scrollTo() {},
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    fetch: async () => ({ json: async () => ({}) }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return vm.runInContext(`({S,C,computeOutlook,debtPayoffPlan,materializePrepayPlans,materializeDailyItems,
    addYM,localYM,localYMD,stateFrom,validateBackup,revertPrepay,simPayoff,thaiTax,computeTax,csvCell,monthSpend,FM})`, ctx);
}

const app = loadApp();
const { S, C } = app;
const reset = () => {
  Object.assign(S, {
    salary: 0, otherIncomes: [], fixedExpenses: [], debts: [], transactions: [], dailyItems: [],
    prepayPlans: [], olEvents: [], taxSsoMonthly: null, taxExtraDeduct: 0,
  });
  C.inc = 0; C.bal = 0;
};
// object จาก vm อยู่คนละ realm กับ assert → แปลงเป็น object ธรรมดาก่อน deepEqual
const plain = v => JSON.parse(JSON.stringify(v));
const approx = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('ภาษี: ขั้นบันได', () => {
  assert.equal(app.thaiTax(150000).tax, 0);
  approx(app.thaiTax(189500).tax, 1975);
  approx(app.thaiTax(1000000).tax, 7500 + 20000 + 37500 + 50000);
  assert.equal(app.thaiTax(1000000).marginal, 0.2);
});

test('ภาษี: เงินเดือน 30,000 ประกันสังคม 750/เดือน', () => {
  reset(); S.salary = 30000; S.taxSsoMonthly = 750;
  const x = app.computeTax();
  assert.equal(x.net, 360000 - 100000 - 60000 - 9000);
  approx(x.tax, (191000 - 150000) * 0.05);
});

test('ผ่อนหนี้: กรณีพิเศษ', () => {
  assert.deepEqual(plain(app.debtPayoffPlan(0, 10, 100)), { months: 0, interest: 0 });
  const z = app.debtPayoffPlan(12000, 0, 1000);
  assert.equal(z.months, 12); approx(z.interest, 0);
  assert.equal(app.debtPayoffPlan(100000, 24, 1000).months, Infinity); // ค่างวดไม่พอดอกเบี้ย
});

test('คาดการณ์: ไม่มีหนี้ ไม่ปรับอัตรา เงินโตตามเส้นตรง', () => {
  reset(); C.inc = 30000; C.bal = 20000; S.fixedExpenses = [{ amount: 10000 }];
  const o = app.computeOutlook(null, 5);
  approx(o.months[4].end, 20000 + 5 * 20000);
});

test('คาดการณ์: ขึ้นเงินเดือนเริ่มปีที่ 2', () => {
  reset(); C.inc = 30000;
  const o = app.computeOutlook(null, 13, { raise: 0.1, infl: 0 });
  approx(o.months[11].income, 30000);
  approx(o.months[12].income, 33000);
});

test('คาดการณ์: หนี้หมดเดือนเดียวกับสูตรการ์ดหนี้', () => {
  reset(); C.inc = 50000;
  S.debts = [{ id: 'd1', name: 'A', totalAmount: 10000, remaining: 10000, monthlyPayment: 1000, interestRate: 12 }];
  const k = app.debtPayoffPlan(10000, 12, 1000).months;
  const o = app.computeOutlook(null, k + 2);
  assert.ok(o.months[k - 2].debtLeft > 0);
  assert.equal(o.months[k - 1].debtLeft, 0);
});

test('คาดการณ์: แผนโปะทุกเดือนจำกัดจำนวนครั้ง', () => {
  reset(); C.inc = 50000;
  S.debts = [{ id: 'd1', name: 'A', totalAmount: 50000, remaining: 50000, monthlyPayment: 2000, interestRate: 0 }];
  const base = app.computeOutlook(null, 5).months.map(m => m.debtPaid);
  S.prepayPlans = [{ id: 'p', debtId: 'd1', amount: 500, startYM: app.localYM(), lastYM: app.localYM(), times: 3, done: 1 }];
  const withPlan = app.computeOutlook(null, 5).months.map(m => m.debtPaid);
  assert.deepEqual(plain(withPlan.map((v, i) => v - base[i])), [500, 500, 0, 0, 0]);
});

test('แผนโปะทุกเดือน: ทำย้อนหลังครบ ไม่ซ้ำ และเลิกเมื่อครบครั้ง', () => {
  reset();
  S.debts = [{ id: 'd1', name: 'A', totalAmount: 50000, remaining: 50000, monthlyPayment: 2000, interestRate: 0 }];
  S.prepayPlans = [{ id: 'p', debtId: 'd1', amount: 1000, startYM: app.addYM(app.localYM(), -2), lastYM: null, times: null, done: 0 }];
  app.materializePrepayPlans();
  assert.equal(S.transactions.filter(t => t.prepay).length, 3);
  assert.equal(S.debts[0].remaining, 47000);
  app.materializePrepayPlans();
  assert.equal(S.transactions.filter(t => t.prepay).length, 3, 'ห้ามสร้างซ้ำ');

  reset();
  S.debts = [{ id: 'd1', name: 'A', totalAmount: 50000, remaining: 50000, monthlyPayment: 2000, interestRate: 0 }];
  S.prepayPlans = [{ id: 'p', debtId: 'd1', amount: 1000, startYM: app.addYM(app.localYM(), -2), lastYM: null, times: 2, done: 0 }];
  app.materializePrepayPlans();
  assert.equal(S.transactions.filter(t => t.prepay).length, 2);
  assert.equal(S.prepayPlans.length, 0, 'ครบ 2 ครั้งแล้วต้องเลิกแผน');
});

test('ยกเลิกการโปะ: คืนยอดหนี้และลบรายการ', () => {
  reset();
  const d = { id: 'd1', name: 'A', totalAmount: 10000, remaining: 8000, monthlyPayment: 500, prepaidTotal: 2000 };
  S.debts = [d];
  const tx = { id: 't1', amount: 2000, prepay: true, debtId: 'd1', date: app.localYMD() };
  S.transactions = [tx];
  app.revertPrepay(tx, d);
  assert.equal(d.remaining, 10000);
  assert.equal(d.prepaidTotal, 0);
  assert.equal(S.transactions.length, 0);
});

test('รายจ่ายทุกวัน: สร้างย้อนหลังและไม่ซ้ำ', () => {
  reset();
  const start = app.localYMD(new Date(Date.now() - 2 * 864e5));
  S.dailyItems = [{ id: 'r1', name: 'ข้าว', amount: 150, category: 'food', startDate: start, lastGenAt: null }];
  assert.equal(app.materializeDailyItems(), true);
  assert.equal(S.transactions.length, 3);
  assert.equal(app.materializeDailyItems(), false);
});

test('ไฟล์สำรอง: ตรวจรูปแบบ', () => {
  assert.deepEqual(plain(app.validateBackup({ salary: 1, transactions: [] })), []);
  assert.ok(app.validateBackup(null).length);
  assert.ok(app.validateBackup([1, 2]).length);
  assert.ok(app.validateBackup({ foo: 1 }).length);
  assert.ok(app.validateBackup({ transactions: [{ amount: '100', date: '2026-01-01' }] }).length);
  assert.ok(app.validateBackup({ debts: 'x' }).length);
});

test('stateFrom: ค่าเริ่มต้นและเพดาน', () => {
  const s = app.stateFrom({ outlookMonths: 99999 });
  assert.equal(s.outlookMonths, 1200);
  assert.equal(s.outlookRaisePct, 3);
  assert.equal(app.stateFrom({ outlookRaisePct: 0 }).outlookRaisePct, 0);
  assert.equal(app.stateFrom({ emergencySavings: -5 }).emergencySavings, 0);
});

test('ปลดหนี้: Avalanche ดอกเบี้ยไม่มากกว่า Snowball และเร็วกว่าจ่ายแบบเดิม', () => {
  const ds = [{ name: 'A', rem: 10000, rate: 24, min: 500 }, { name: 'B', rem: 3000, rate: 5, min: 200 }];
  const base = app.simPayoff(ds, 0, 'min'), sb = app.simPayoff(ds, 1000, 'snowball'), av = app.simPayoff(ds, 1000, 'avalanche');
  assert.ok(av.interest <= sb.interest + 1e-9);
  assert.ok(sb.months <= base.months && av.months <= base.months);
  assert.equal(sb.seq[0].name, 'B');
  assert.equal(av.seq[0].name, 'A');
  assert.equal(ds[0].rem, 10000, 'ห้ามแก้ข้อมูลต้นทาง');
});

test('สรุปรายเดือน: แยกหมวด ไม่นับโปะหนี้ และตัดตามวัน', () => {
  reset();
  S.transactions = [
    { amount: 100, category: 'food', date: '2026-03-02' },
    { amount: 50, category: 'food', date: '2026-03-20' },
    { amount: 300, category: 'transport', date: '2026-03-05' },
    { amount: 999, category: 'personal', date: '2026-03-05', prepay: true },
  ];
  const a = app.monthSpend('2026-03');
  assert.equal(a.total, 450); assert.equal(a.by.food, 150); assert.equal(a.prepay, 999);
  assert.equal(app.monthSpend('2026-03', 10).total, 400);
});

test('CSV: กันสูตร Excel และ escape', () => {
  assert.equal(app.csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(app.csvCell('a,b'), '"a,b"');
  assert.equal(app.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(app.csvCell(-5), '-5');
});

test('แสดงยอดเงินเลขเต็ม ไม่ย่อ', () => {
  assert.equal(app.FM.compact(1500), '฿1,500');
  assert.equal(app.FM.compact(32000), '฿32,000');
  assert.equal(app.FM.compact(1500.5), '฿1,500.50');
  assert.equal(app.FM.compact(-2000), '−฿2,000');
});

test('วันที่ท้องถิ่น', () => {
  assert.match(app.localYMD(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(app.localYMD(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(app.addYM('2026-12', 1), '2027-01');
});
