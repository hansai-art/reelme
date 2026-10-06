import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const FIXED_UNTIL = Date.UTC(2035, 11, 31);
const FIXED_NOW = Date.UTC(2026, 9, 7);

const REFERENCES = [
  {
    name: 'R1', y: 1965, mo: 7, d: 10, h: 8, mi: 30, tz: 'Asia/Taipei',
    lat: 25.033, lon: 121.565, timeKnown: true,
    saturnReturn: '1995-03-23T05:45:29.446766+00:00',
    jupiterReturn: '1977-06-22T22:14:52.383599+00:00',
    progSunSign: '1978-07-29T23:50:46.191175+00:00', progSunNewSign: 4,
  },
  {
    name: 'R2', y: 1978, mo: 11, d: 3, h: 23, mi: 45, tz: 'Europe/London',
    lat: 51.507, lon: -0.128, timeKnown: true,
    saturnReturn: '2008-09-02T03:44:43.071747+00:00',
    jupiterReturn: '1990-09-30T22:00:39.678025+00:00',
    progSunSign: '1997-07-09T19:35:37.228547+00:00', progSunNewSign: 8,
  },
  {
    name: 'R3', y: 2001, mo: 1, d: 15, h: 12, mi: 0, tz: 'Australia/Sydney',
    lat: -33.869, lon: 151.209, timeKnown: false,
    saturnReturn: '2029-08-05T22:32:50.647636+00:00',
    jupiterReturn: '2012-06-17T18:53:27.636434+00:00',
    progSunSign: '2006-01-04T03:58:27.023424+00:00', progSunNewSign: 10,
  },
];

const RULE_IDS = `
t_jupiter_conj_jupiter
t_jupiter_conj_sun
t_jupiter_conj_asc
t_jupiter_conj_mc
t_saturn_conj_saturn
t_saturn_sq_saturn
t_saturn_opp_saturn
t_saturn_conj_sun
t_saturn_conj_moon
t_saturn_conj_asc
t_saturn_conj_mc
t_saturn_sq_sun
t_saturn_sq_moon
t_saturn_sq_asc
t_saturn_sq_mc
t_saturn_opp_sun
t_saturn_opp_moon
t_saturn_opp_asc
t_saturn_opp_mc
t_uranus_sq_uranus
t_uranus_opp_uranus
t_uranus_conj_sun
t_uranus_conj_moon
t_uranus_conj_asc
t_uranus_conj_mc
t_uranus_sq_sun
t_uranus_sq_moon
t_uranus_sq_asc
t_uranus_sq_mc
t_uranus_opp_sun
t_uranus_opp_moon
t_uranus_opp_asc
t_uranus_opp_mc
t_neptune_sq_neptune
t_neptune_conj_sun
t_neptune_conj_moon
t_neptune_conj_asc
t_neptune_conj_mc
t_neptune_sq_sun
t_neptune_sq_moon
t_neptune_sq_asc
t_neptune_sq_mc
t_neptune_opp_sun
t_neptune_opp_moon
t_neptune_opp_asc
t_neptune_opp_mc
t_pluto_sq_pluto
t_pluto_conj_sun
t_pluto_conj_moon
t_pluto_conj_asc
t_pluto_conj_mc
t_pluto_sq_sun
t_pluto_sq_moon
t_pluto_sq_asc
t_pluto_sq_mc
t_pluto_opp_sun
t_pluto_opp_moon
t_pluto_opp_asc
t_pluto_opp_mc
p_sun_sign
p_moon_asc
p_moon_ic
p_moon_dsc
p_moon_mc
p_moon_return
p_newmoon
`.trim().split(/\s+/);

let passed = 0;
let failed = 0;
let slowestMs = 0;
let totalMs = 0;
let sweepCount = 0;

function check(description, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL: ${description}\n  ${error?.stack ?? error}`);
  }
}

function recordFailure(description, error) {
  failed++;
  console.error(`FAIL: ${description}\n  ${error?.stack ?? error}`);
}

function millis(iso) {
  return Date.parse(iso);
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14) >>> 0) >>> 0) / 4294967296;
  };
}

function randomInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function closeToAny(exacts, expected, toleranceDays) {
  return Array.isArray(exacts) &&
    exacts.some((time) => Math.abs(time - expected) <= toleranceDays * 86400000);
}

async function main() {
  const htmlPath = `${ROOT}/agentbox/static/index.html`;
  const html = fs.readFileSync(htmlPath, 'utf8');
  const beginMarker = '/* ASTRO:BEGIN */';
  const endMarker = '/* ASTRO:END */';
  const begin = html.indexOf(beginMarker);
  const end = html.indexOf(endMarker, begin + beginMarker.length);

  if (begin < 0 || end < 0) {
    throw new Error(`Missing ${beginMarker} or ${endMarker} marker in ${htmlPath}`);
  }

  const source = html.slice(begin + beginMarker.length, end) +
    '\n;globalThis.__api = { computeChart, lifeTimeline, lifeTimelineAsync, matchPosts, TL_RULES, CITIES, SIGNS };';
  const context = {
    Astronomy: require('astronomy-engine'),
    pad2: (n) => String(n).padStart(2, '0'),
    console,
    Intl,
    Date,
    Math,
    setTimeout,
    Promise,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: htmlPath, timeout: 30000 });
  const { computeChart, lifeTimeline, lifeTimelineAsync, matchPosts, TL_RULES, CITIES } = context.__api;

  check('ASTRO engine API is available', () => {
    assert.equal(typeof computeChart, 'function');
    assert.equal(typeof lifeTimeline, 'function');
    assert.equal(typeof lifeTimelineAsync, 'function');
    assert.equal(typeof matchPosts, 'function');
    assert.ok(TL_RULES && typeof TL_RULES === 'object');
    assert.ok(Array.isArray(CITIES) && CITIES.length > 0);
  });

  for (const ref of REFERENCES) {
    const label = `reference ${ref.name}`;
    try {
      const chart = computeChart({
        y: ref.y, mo: ref.mo, d: ref.d, h: ref.h, mi: ref.mi,
        timeKnown: ref.timeKnown, lat: ref.lat, lon: ref.lon, tz: ref.tz,
      });
      const result = lifeTimeline(chart, { until: FIXED_UNTIL, now: FIXED_NOW });
      const windows = result.windows;

      check(`${label}: Saturn return reference`, () => {
        const window = windows.find((item) => item.rule === 't_saturn_conj_saturn');
        assert.ok(window, 'missing Saturn return window');
        assert.ok(closeToAny(window.exact, millis(ref.saturnReturn), 2),
          `no exact within 2 days of ${ref.saturnReturn}`);
      });

      check(`${label}: Jupiter return reference after age 5`, () => {
        const window = windows.find((item) =>
          item.rule === 't_jupiter_conj_jupiter' && item.age > 5);
        assert.ok(window, 'missing Jupiter return window after age 5');
        assert.ok(closeToAny(window.exact, millis(ref.jupiterReturn), 2),
          `no exact within 2 days of ${ref.jupiterReturn}`);
      });

      check(`${label}: progressed Sun sign reference`, () => {
        const window = windows.find((item) => item.rule === 'p_sun_sign');
        assert.ok(window, 'missing progressed Sun sign window');
        assert.ok(closeToAny(window.exact, millis(ref.progSunSign), 5),
          `no exact within 5 days of ${ref.progSunSign}`);
        assert.equal(window.sign, ref.progSunNewSign);
      });
    } catch (error) {
      recordFailure(`${label}: chart/timeline computation`, error);
    }
  }

  const random = mulberry32(20261007);
  const offsets = [70, -45, 0, 64.1];

  for (let index = 0; index < 300; index++) {
    const y = randomInt(random, 1900, 2030);
    const mo = randomInt(random, 1, 12);
    const d = randomInt(random, 1, 28);
    const h = randomInt(random, 0, 23);
    const mi = randomInt(random, 0, 59);
    const timeKnown = random() < 0.7;
    let location;

    if (random() < 0.85) {
      const city = CITIES[randomInt(random, 0, CITIES.length - 1)]; // [name, lat, lon, tz]
      location = { lat: city[1], lon: city[2], tz: city[3] };
    } else {
      location = {
        lat: offsets[randomInt(random, 0, offsets.length - 1)],
        lon: random() * 360 - 180,
        tz: null,
        fixedOff: randomInt(random, -10, 12) * 60,
      };
    }

    const input = {
      y, mo, d, h, mi, timeKnown,
      lat: location.lat,
      lon: location.lon,
      tz: location.tz ?? null,
    };
    if (location.fixedOff != null) input.fixedOff = location.fixedOff;

    const started = performance.now();
    try {
      const chart = computeChart(input);
      const result = lifeTimeline(chart, { until: FIXED_UNTIL, now: FIXED_NOW });
      const elapsed = performance.now() - started;
      sweepCount++;
      totalMs += elapsed;
      slowestMs = Math.max(slowestMs, elapsed);

      check(`sweep ${index + 1}: timeline invariants`, () => {
        const { windows, coverage } = result;
        assert.ok(Array.isArray(windows), 'windows is not an array');
        for (let i = 1; i < windows.length; i++) {
          assert.ok(windows[i - 1].exact[0] <= windows[i].exact[0],
            `windows not sorted at index ${i}`);
        }
        for (const window of windows) {
          assert.ok(window.start <= window.end, `${window.id}: start exceeds end`);
          assert.ok(Array.isArray(window.exact) && window.exact.length > 0,
            `${window.id}: missing exact times`);
          for (const exact of window.exact) {
            assert.ok(window.start - 1 <= exact && exact <= window.end + 1,
              `${window.id}: exact outside window`);
          }
          assert.equal(window.passes, window.exact.length, `${window.id}: passes mismatch`);
          assert.ok(window.age >= 0, `${window.id}: negative age`);
          assert.ok(Object.hasOwn(TL_RULES, window.rule), `${window.id}: unknown rule`);
          assert.ok(window.id.startsWith(`${window.rule}#`), `${window.id}: malformed id`);
        }

        if (!timeKnown) {
          for (const window of windows) {
            assert.ok(!['moon', 'asc', 'mc', 'ic', 'dsc'].includes(window.target),
              `${window.id}: time-unknown chart has an angle/Moon target`);
            assert.ok(!window.rule.startsWith('p_moon') && window.rule !== 'p_newmoon',
              `${window.id}: time-unknown chart has a prohibited progression`);
          }
        }

        for (const key of ['any', 'major']) {
          assert.equal(typeof coverage[key], 'number', `coverage.${key} is not numeric`);
          assert.ok(coverage[key] >= 0 && coverage[key] <= 1,
            `coverage.${key} outside [0, 1]`);
        }
        assert.ok(coverage.major <= coverage.any, 'major coverage exceeds any coverage');

        const from = result.range?.from ?? chart.utc;
        const to = result.range?.to ?? FIXED_UNTIL;
        const age31 = chart.utc + 31 * 365.2422 * 86400000;
        if (to >= age31 && from <= age31) {
          assert.ok(windows.some((window) =>
            window.rule === 't_saturn_conj_saturn' && window.age >= 27 && window.age <= 31),
          'missing Saturn return between ages 27 and 31');
        }
      });
    } catch (error) {
      const elapsed = performance.now() - started;
      sweepCount++;
      totalMs += elapsed;
      slowestMs = Math.max(slowestMs, elapsed);
      recordFailure(`sweep ${index + 1}: computation`, error);
    }
  }

  check('TL_RULES contains every specified rule with valid text', () => {
    const allowedTones = new Set(['structure', 'breakthrough', 'transform', 'expand', 'dream', 'review']);
    for (const id of RULE_IDS) {
      const rule = TL_RULES[id];
      assert.ok(rule, `missing rule ${id}`);
      assert.equal(typeof rule.title, 'string', `${id}: missing title`);
      assert.ok([...rule.title.replace('{sign}', '')].length <= 10, `${id}: title exceeds 10 characters`);
      assert.equal(typeof rule.meaning, 'string', `${id}: missing meaning`);
      assert.ok(rule.meaning.trim().length > 0, `${id}: empty meaning`);
      assert.ok(Array.isArray(rule.keywords), `${id}: keywords is not an array`);
      assert.ok(rule.keywords.length >= 6 && rule.keywords.length <= 12,
        `${id}: keyword count is outside 6–12`);
      assert.ok(rule.keywords.every((keyword) => typeof keyword === 'string'),
        `${id}: keywords must be strings`);
      assert.ok(allowedTones.has(rule.tone), `${id}: invalid tone ${rule.tone}`);
    }
    assert.ok(TL_RULES.p_sun_sign.title.includes('{sign}'),
      'p_sun_sign title must contain {sign}');
  });

  check('matchPosts filters, scores, limits, and counts matches', () => {
    const rules = {
      test: { keywords: ['工作', '轉變'] },
    };
    const now = Date.UTC(2025, 0, 1);
    const day = 86400000;
    const windows = [
      { id: 'past', rule: 'test', start: now - 10 * day, end: now - 9 * day },
      { id: 'future', rule: 'test', start: now + 200 * day, end: now + 201 * day },
    ];
    const posts = [
      { i: 1, ts: now - 10 * day - 30 * day, clean: '最近工作有了新的轉變', flat: '工作有了新的轉變', len: 18, kind: 'status', hidden: false },
      { i: 2, ts: now - 10 * day, clean: '工作轉變', flat: '隱藏的工作轉變', len: 12, kind: 'status', hidden: true },
      { i: 3, ts: now - 10 * day, clean: '工作轉變', flat: '不應選入的分享', len: 12, kind: 'share', hidden: false },
      { i: 4, ts: now - 10 * day, clean: '普通生活文字內容', flat: '普通生活文字內容', len: 12, kind: 'status', hidden: false },
      { i: 5, ts: now + 200 * day, clean: '工作轉變', flat: '未來貼文', len: 12, kind: 'life', hidden: false },
    ];

    const counts = matchPosts(windows, posts, {
      badKinds: new Set(['share']),
      rules,
      padDays: 120,
      max: 1,
      now,
    });

    assert.deepEqual({ past: counts.past, withPosts: counts.withPosts, hits: counts.hits }, { past: 1, withPosts: 1, hits: 1 });
    assert.ok(Number.isFinite(counts.baseline) && counts.baseline >= 0 && counts.baseline <= 1, 'baseline must be a fraction');
    assert.ok(Number.isInteger(counts.checked), 'checked must be an integer');
    assert.equal(windows[0].posts.length, 1);
    assert.equal(windows[0].posts[0].i, 1, 'keyword post inside padding should match');
    assert.equal(windows[0].posts[0].hit, true);
    assert.equal(windows[0].hit, true);
    assert.ok(!windows[0].posts.some((post) => post.i === 2 || post.i === 3),
      'hidden or bad-kind post was included');
    assert.equal(windows[1].future, true);
    assert.deepEqual(Array.from(windows[1].posts), []);
    assert.ok(windows[0].posts.length <= 1, 'max post count was exceeded');
  });

  check('lifeTimelineAsync matches synchronous result and reports progress', async () => {
    const ref = REFERENCES[0];
    const chart = computeChart({
      y: ref.y, mo: ref.mo, d: ref.d, h: ref.h, mi: ref.mi,
      timeKnown: ref.timeKnown, lat: ref.lat, lon: ref.lon, tz: ref.tz,
    });
    const options = { until: FIXED_UNTIL, now: FIXED_NOW };
    const sync = lifeTimeline(chart, options);
    const progress = [];
    const asyncResult = await lifeTimelineAsync(chart, options, (value) => progress.push(value));

    assert.deepEqual(
      Array.from(asyncResult.windows, (window) => [window.id, Array.from(window.exact)]),
      Array.from(sync.windows, (window) => [window.id, Array.from(window.exact)]),
    );
    assert.ok(progress.length > 0, 'onProgress was not called');
    for (let i = 1; i < progress.length; i++) {
      assert.ok(progress[i] > progress[i - 1], 'progress values are not increasing');
    }
    assert.equal(progress.at(-1), 1, 'progress did not end at 1');
  });

  check('slowest sweep timeline is under 5000 ms', () => {
    assert.ok(slowestMs < 5000, `slowest chart took ${slowestMs.toFixed(1)} ms`);
  });
}

try {
  await main();
} catch (error) {
  recordFailure('test harness', error);
}

console.log(
  `Astro tests: ${passed} passed, ${failed} failed; ` +
  `sweep ${sweepCount} charts, slowest ${slowestMs.toFixed(1)} ms, ` +
  `average ${sweepCount ? (totalMs / sweepCount).toFixed(1) : '0.0'} ms`,
);
if (failed > 0) process.exitCode = 1;
