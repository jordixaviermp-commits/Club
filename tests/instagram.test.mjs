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
