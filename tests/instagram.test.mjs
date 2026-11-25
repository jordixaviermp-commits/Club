import test from 'node:test';
import assert from 'node:assert/strict';
import { igSummary } from '../js/logic.js';

const rows = [
  { kind: 'day', key: '2026-10-15', data: { views: 870, reach: 360, interactions: 21, follows: 0, views_f: 492, views_nf: 378 } },
  { kind: 'day', key: '2026-10-16', data: { views: 1056, reach: 657, interactions: 15, follows: 1, views_f: 340, views_nf: 716 } },
  { kind: 'day', key: '2026-11-02', data: { views: 120, reach: 75, interactions: 8, follows: 0, views_f: 99, views_nf: 21 } },
  { kind: 'media', key: 'a', data: { ts: '2026-10-15T06:02:33+0000', type: 'CAROUSEL_ALBUM', product: 'FEED', views: 615, likes: 17 } },
  { kind: 'media', key: 'b', data: { ts: '2026-10-25T19:47:09+0000', type: 'CAROUSEL_ALBUM', product: 'FEED', views: 1291, likes: 42 } },
  { kind: 'media', key: 'c', data: { ts: '2026-11-01T10:00:00+0000', type: 'VIDEO', product: 'REELS', views: 50, likes: 2 } },
  { kind: 'account', key: '2026-10-15', data: { followers: 940 } },
  { kind: 'account', key: '2026-11-14', data: { followers: 944, following: 670, media: 587 } },
  { kind: 'audience', key: '2026-11-14', data: { gender_age: { 'M.35-44': 164, 'F.35-44': 52, 'U.25-34': 61 }, country: { ES: 886, FR: 2 }, city: { 'Monzón, Aragón': 226 } } },
];

test('suma de días, alcance medio y % de no seguidores', () => {
  const s = igSummary(rows);
  assert.equal(s.nDays, 3);
  assert.equal(s.totals.views, 2046);
  assert.equal(s.totals.interactions, 44);
  assert.equal(s.totals.reachAvg, Math.round((360 + 657 + 75) / 3));
  assert.equal(s.totals.pctNonFollowers, Math.round((1115 / 2046) * 100));
  assert.equal(s.first, '2026-10-15'); assert.equal(s.last, '2026-11-02');
});

test('el periodo recorta días y publicaciones; los meses se agrupan', () => {
  const s = igSummary(rows, '2026-10-01', '2026-10-31');
  assert.equal(s.nDays, 2);
  assert.deepEqual(s.byMonth.map((m) => [m.ym, m.views]), [['2026-10', 1926]]);
  assert.deepEqual(s.posts.map((p) => p.id), ['b', 'a']);   // la más vista primero
});

test('tipos de publicación, seguidores y audiencia', () => {
  const s = igSummary(rows);
  assert.equal(s.byKind.find((k) => k.kind === 'Carruseles').n, 2);
  assert.equal(s.byKind.find((k) => k.kind === 'Reels').n, 1);
  assert.equal(s.account.followers, 944); assert.equal(s.account.delta, 4);
  assert.equal(s.audience.gender.M, 164); assert.equal(s.audience.pctMen, Math.round((164 / 277) * 100));
  assert.equal(s.audience.ages.find((a) => a.age === '35-44').v, 216);
  assert.equal(s.audience.cities[0].name, 'Monzón, Aragón');
});

test('sin datos no inventa nada', () => {
  const s = igSummary([]);
  assert.equal(s.nDays, 0); assert.equal(s.account, null); assert.equal(s.audience, null);
  assert.equal(s.totals.pctNonFollowers, null); assert.equal(s.stories.n, 0); assert.deepEqual(s.posts, []);
});

test('día/franja de publicación, desglose edad-género y comparación con el periodo anterior', async () => {
  const { igPrevTotals } = await import('../js/logic.js');
  const s = igSummary(rows);
  assert.equal(s.byWeekday.reduce((n, d) => n + d.n, 0), 3);
  assert.equal(s.bySlot.reduce((n, x) => n + x.n, 0), 3);
  assert.deepEqual(s.audience.genderAge['35-44'], { F: 52, M: 164, U: 0 });
  assert.equal(s.followerSeries.length, 2);
  const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'day', key: `2026-11-${String(i + 1).padStart(2, '0')}`, data: { views: i < 10 ? 10 : 20, follows: 1 } }));
  assert.equal(igPrevTotals(many, '2026-11-11', '2026-11-20').views, 100);
  assert.equal(igPrevTotals(many, '', ''), null);
  assert.equal(igPrevTotals(many, '2026-11-01', '2026-11-10'), null);   // antes no hay nada guardado
});

test('periodos de Insights: totales sumables, solapes y audiencia más reciente', async () => {
  const { igPeriods } = await import('../js/logic.js');
  const rows = [
    { kind: 'period', key: '2026-10-15_2026-11-13', data: { views: 11736, net_follows: 3, viewers: 2666, v_story: 6900, v_feed: 4700, gender: { M: 56, F: 17 } } },
    { kind: 'period', key: '2026-11-14_2026-12-13', data: { views: 5000, net_follows: 2, viewers: 1800, interactions: 100, ages: { '35-44': 30 } } },
    { kind: 'period', key: '2026-12-01_2026-12-31', data: { views: 1 } },
    { kind: 'period', key: 'mal', data: { views: 99 } },
    { kind: 'day', key: '2026-11-01', data: { views: 5 } },
  ];
  const g = igPeriods(rows);
  assert.equal(g.list.length, 3);
  assert.equal(g.list[0].days, 30);
  assert.equal(g.totals.views, 16737); assert.equal(g.totals.net_follows, 5); assert.equal(g.totals.interactions, 100);
  assert.equal(g.totals.viewersMax, 2666); assert.equal(g.totals.viewersAvg, 2233);      // los espectadores no se suman
  assert.equal(g.overlaps.length, 1);                                                    // 14/11–13/12 y 01/12–31/12 se pisan
  assert.equal(g.audience.to, '2026-12-13'); assert.deepEqual(g.audience.ages, { '35-44': 30 });
  assert.equal(g.topHours, null);
  assert.deepEqual(igPeriods([{ kind: 'period', key: '2026-10-15_2026-11-13', data: { top_hours: ['Domingos 21–24 h'] } }]).topHours.list, ['Domingos 21–24 h']);
  assert.equal(igPeriods(rows, '2026-12-20', '').list.length, 1);
  assert.equal(igPeriods([], '', '').list.length, 0);
});

test('igHeadline: la base son los datos diarios; los periodos solo rellenan días sin datos diarios', async () => {
  const { igHeadline } = await import('../js/logic.js');
  const per = [
    { kind: 'period', key: '2026-09-15_2026-10-14', data: { views: 8400, viewers: 2100, interactions: 210, net_follows: 5 } },
    { kind: 'period', key: '2026-10-15_2026-11-13', data: { views: 11736, viewers: 2666, interactions: 294, net_follows: 3 } },
  ];
  const days = [{ kind: 'day', key: '2026-10-20', data: { views: 100, reach: 40, interactions: 7, follows: 2, views_f: 60, views_nf: 40 } },
    { kind: 'day', key: '2026-11-20', data: { views: 300, reach: 80, interactions: 13, follows: 1, views_f: 200, views_nf: 100 } }];
  const acc = [{ kind: 'account', key: '2026-11-20', data: { followers: 960, media: 340 } }];
  const full = igHeadline([...per, ...days, ...acc]);
  // el periodo 15 oct–13 nov ya tiene un día diario dentro → no se cuenta; el de septiembre no tiene ninguno → rellena
  assert.equal(full.source, 'mixed'); assert.equal(full.views, 100 + 300 + 8400); assert.equal(full.interactions, 20 + 210);
  assert.equal(full.follows, 3 + 5); assert.equal(full.periods, 1); assert.equal(full.followers, 960); assert.equal(full.from, '2026-09-15'); assert.equal(full.to, '2026-11-20');
  assert.equal(full.viewersKind, 'daily'); assert.equal(full.viewers, 60); assert.equal(full.nonF, 35);
  // lo que recibe el corredor (periodos + días + último nº de seguidores) da exactamente lo mismo
  assert.deepEqual(igHeadline([...per, ...days, { kind: 'account', key: '2026-11-20', data: { followers: 960 } }]), full);
  // solo diarios
  const d = igHeadline([...days, ...acc]);
  assert.equal(d.source, 'day'); assert.equal(d.views, 400); assert.equal(d.periods, 0);
  // solo periodos (aún no hay captura diaria)
  const p = igHeadline(per);
  assert.equal(p.source, 'period'); assert.equal(p.views, 20136); assert.equal(p.viewers, 2666); assert.equal(p.viewersKind, 'unique');
  assert.equal(igHeadline([]).source, null);
});
