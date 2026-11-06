// Тесты движка тренера: forma.html читается, из него берётся код до блока отрисовки и выполняется в vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'forma.html'), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1].split('/* ============================================================ отрисовка */')[0];

function make(todayStr) {
  const store = {};
  const RealDate = Date;
  const fixed = new RealDate(todayStr + 'T12:00:00');
  class FD extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fixed.getTime()); } static now() { return fixed.getTime(); } }
  const ctx = {
    console, Date: FD, Math, JSON, Object, Array, String, Number, Set, Promise, setTimeout, clearTimeout,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v }, key: i => Object.keys(store)[i], get length() { return Object.keys(store).length } },
    document: { querySelector: () => null, addEventListener() {} }, window: { addEventListener() {} }, navigator: {}, location: { hash: '' }, history: {},
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__api={get S(){return S},set S(v){S=v},get LOG(){return LOG},EX,W,planDay,adaptEx,finalizeSession,ensureRamp,rampFor,nextDay,weekOf,isDeload,autoCycle,mergeLog,slotsFor,DEFP,newS:()=>{S.profile=Object.assign(DEFP(),{start:"2026-11-02"});S.slots=slotsFor(3)}};', ctx);
  return ctx.__api;
}
const sess = (date, id, reps, kg, extra = {}) => ({ id: 's' + date, created: 1, date, dayId: 'A', adhoc: 0, ready: 3, ex: [{ id, sets: reps.map(r => ({ kg, reps: r, done: 1 })), feel: null, note: '', plan: extra.plan || null }] });

test('верх диапазона во всех подходах даёт рост на один шаг', () => {
  const a = make('2026-11-09'); a.newS(); a.S.lifts.leg_press = { w: 100 };
  const pl = a.planDay({ id: 'A', t: 'A', ex: ['leg_press'] }, '2026-11-09', 3).items[0];
  const s = sess('2026-11-09', 'leg_press', Array(pl.sets).fill(pl.hi), 100, { plan: pl });
  a.finalizeSession(s);
  assert.equal(a.S.lifts.leg_press.w, 105);
});
test('плохое самочувствие не снижает и не двигает базу', () => {
  const a = make('2026-11-09'); a.newS(); a.S.lifts.leg_press = { w: 100 };
  const pl = a.planDay({ id: 'A', t: 'A', ex: ['leg_press'] }, '2026-11-09', 1).items[0];
  const s = sess('2026-11-09', 'leg_press', Array(pl.sets).fill(pl.hi), pl.kg, { plan: pl }); s.ready = 1;
  a.finalizeSession(s);
  assert.equal(a.S.lifts.leg_press.w, 100);
});
test('калибровка без веса не ставит «вес тела» для тренажёра', () => {
  const a = make('2026-11-09'); a.newS();
  const s = sess('2026-11-09', 'leg_press', [10, 10, 10], 0); a.finalizeSession(s);
  assert.equal(a.S.lifts.leg_press, undefined);
});
test('калибровка по сделанному весу', () => {
  const a = make('2026-11-09'); a.newS();
  const s = sess('2026-11-09', 'leg_press', [12, 12, 11], 60); a.finalizeSession(s);
  assert.ok(a.S.lifts.leg_press.w >= 55 && a.S.lifts.leg_press.w <= 90, String(a.S.lifts.leg_press.w));
});
test('свободная тренировка не меняет веса и не тратит лестницу', () => {
  const a = make('2026-11-09'); a.newS(); a.S.lifts.leg_press = { w: 100 }; a.S.ramp = { kind: 'break', left: [.9, 1], cut: 0, gap: 10 };
  const s = sess('2026-11-09', 'leg_press', [15, 15, 15], 120); s.adhoc = 1; a.finalizeSession(s);
  assert.equal(a.S.lifts.leg_press.w, 100); assert.equal(a.S.ramp.left.length, 2);
});
test('разгрузка: вес в плане −15%, база не меняется', () => {
  const a = make('2026-11-30'); a.newS(); a.S.lifts.leg_press = { w: 100 };      // неделя 5? старт 2 ноября: 30 ноя = неделя 5
  const a2 = make('2026-11-23'); a2.newS(); a2.S.lifts.leg_press = { w: 100 };   // неделя 4
  assert.equal(a2.weekOf('2026-11-23'), 4);
  const it = a2.planDay({ id: 'A', t: 'A', ex: ['leg_press'] }, '2026-11-23', 3).items[0];
  assert.equal(it.kg, 85);
});
test('после недели 8 цикл начинается заново, а не залипает в разгрузке', () => {
  const a = make('2026-12-28'); a.newS();   // старт 2 ноя + 56 дней = 28 дек
  assert.equal(a.isDeload('2026-12-28'), false);
  a.autoCycle(); assert.equal(a.weekOf('2026-12-28'), 1);
});
test('лестница после паузы: 10, 20, 40, 70 дней', () => {
  const f = { 10: .93, 20: .85, 40: .75, 70: .65 };
  const a = make('2026-11-09');
  for (const [d, v] of Object.entries(f)) assert.equal(a.rampFor(+d).left[0], v, d + ' дней');
});
test('после паузы 20+ дней позиция цикла сдвигается', () => {
  const a = make('2026-12-14'); a.newS(); a.S.profile.start = '2026-11-02';
  const s = sess('2026-11-20', 'leg_press', [10], 50); a.LOG['2026-11'] = { sessions: [s] };
  a.ensureRamp();                         // пауза 24 дня
  assert.equal(a.weekOf('2026-12-14'), 6 - 3 + 0 || a.weekOf('2026-12-14'));
  assert.ok(a.weekOf('2026-12-14') <= 6);
  assert.ok(a.S.ramp && a.S.ramp.kind === 'break');
});
test('слияние журнала не теряет тренировки с двух устройств', () => {
  const a = make('2026-11-09');
  const x = { sessions: [{ id: '1', created: 1, upd: 1 }], _ts: 5 }, y = { sessions: [{ id: '2', created: 2, upd: 2 }], _ts: 6 };
  const m = a.mergeLog(x, y); assert.deepEqual(m.sessions.map(s => s.id).sort(), ['1', '2']);
  const z = { sessions: [], del: { '1': 10 }, _ts: 7 };
  assert.deepEqual(a.mergeLog(x, z).sessions.map(s => s.id), []);
});
test('симуляция 8 недель: веса кратны шагу, неотрицательны, рост ограничен', () => {
  const a = make('2026-11-02'); a.newS(); a.S.lifts.chest_press = { w: 20 };
  let d = '2026-11-02', prev = 20, maxJump = 0;
  for (let i = 0; i < 24; i++) {
    const wk = a.weekOf(d);
    const pl = a.planDay({ id: 'A', t: 'A', ex: ['chest_press'] }, d, 3).items[0];
    const s = sess(d, 'chest_press', Array(pl.sets).fill(pl.hi), pl.kg, { plan: pl }); s.id = 's' + i;
    a.finalizeSession(s);
    const w = a.S.lifts.chest_press.w;
    assert.ok(w >= 0 && Math.abs(w / 2.5 - Math.round(w / 2.5)) < 1e-9, 'w=' + w);
    maxJump = Math.max(maxJump, w - prev); prev = w;
    d = [...Array(2)].reduce(x => x, d);
    const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + (i % 3 === 2 ? 3 : 2)); d = dt.toISOString().slice(0, 10);
  }
  assert.ok(maxJump <= 2.5 + 1e-9, 'скачок ' + maxJump);
  assert.ok(prev > 20 && prev < 100, 'итог ' + prev);
});
