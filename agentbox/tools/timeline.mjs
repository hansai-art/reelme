import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let Astronomy;
try {
  Astronomy = require('astronomy-engine');
} catch {
  console.error('Install the dependency first: npm install --no-save astronomy-engine@2.1.19');
  process.exit(1);
}

const usage = `Run with --help for usage.`;
const help = `Usage:
  node agentbox/tools/timeline.mjs --date YYYY-MM-DD [--time HH:MM | --no-time]
    (--city NAME | --lat LAT --lon LON (--tz IANA | --offset +/-HOURS))
    [--now YYYY-MM-DD] [--all] [--json]
  node agentbox/tools/timeline.mjs --cities`;

function fail(message) {
  console.error(`${message}\n${usage}`);
  process.exit(1);
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--help' || x === '-h') {
      console.log(help);
      process.exit(0);
    }
    if (x === '--cities') a.cities = true;
    else if (x === '--all') a.all = true;
    else if (x === '--json') a.json = true;
    else if (x === '--no-time') a.noTime = true;
    else if (x.startsWith('--')) {
      const k = x.slice(2);
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`Missing value for --${k}.`);
      a[k] = argv[++i];
    } else fail(`Unexpected argument: ${x}`);
  }
  return a;
}

function dateParts(s, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(`Invalid ${label}; use YYYY-MM-DD.`);
  const [y, mo, d] = s.split('-').map(Number);
  const t = Date.UTC(y, mo - 1, d);
  if (new Date(t).toISOString().slice(0, 10) !== s) fail(`Invalid ${label}.`);
  return { y, mo, d, ms: t };
}

function timeParts(s) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) fail('Invalid time; use HH:MM.');
  const [h, mi] = s.split(':').map(Number);
  return { h, mi };
}

function validZone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

function offset(s) {
  if (!/^[+-](?:\d{1,2}(?:\.\d+)?|\d{1,2}:\d{2})$/.test(s)) fail('Invalid offset; use +/-HOURS.');
  let n;
  if (s.includes(':')) {
    const sign = s[0] === '-' ? -1 : 1;
    const [h, m] = s.slice(1).split(':').map(Number);
    n = sign * (h + m / 60);
  } else n = Number(s);
  if (!Number.isFinite(n) || n < -14 || n > 14) fail('Offset must be between -14 and +14 hours.');
  return Math.round(n * 60);
}

function valueMs(x) {
  if (x instanceof Date) return x.getTime();
  if (typeof x === 'number') return x;
  const n = Date.parse(x);
  if (!Number.isNaN(n)) return n;
  throw new Error('Invalid engine date.');
}
function iso(x) { return new Date(valueMs(x)).toISOString(); }
function day(x) { return iso(x).slice(0, 10); }
function month(x) { return iso(x).slice(0, 7); }
function round4(x) { return x == null ? null : Number(Number(x).toFixed(4)); }

function width(s) {
  return [...String(s)].reduce((n, c) =>
    n + (/[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff01-\uff60]/.test(c) ? 2 : 1), 0);
}
function pad(s, n) { return String(s) + ' '.repeat(Math.max(0, n - width(s))); }
function padLeft(s, n) { return ' '.repeat(Math.max(0, n - width(s))) + String(s); }
function signName(lon, signs) {
  return signs[((Math.floor(((Number(lon) % 360) + 360) % 360 / 30)) + 12) % 12];
}
function degText(lon, signs) {
  const x = ((Number(lon) % 360) + 360) % 360;
  const d = Math.floor(x % 30);
  const m = Math.floor((x - Math.floor(x)) * 60);
  return `${signName(x, signs)} ${d}°${String(m).padStart(2, '0')}'`;
}
function planet(ch, key) {
  return (ch.planets || []).find(p => p.key === key || p.name?.toLowerCase() === key);
}
function titleFor(rule, w, rules, signs) {
  let t = rules[w.rule]?.title || w.rule;
  return t.replaceAll('{sign}', signs[w.sign] ?? String(w.sign));
}

let api;
try {
  const htmlPath = new URL('../static/index.html', import.meta.url);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const beginMarker = '/* ASTRO:BEGIN */';
  const endMarker = '/* ASTRO:END */';
  const begin = html.indexOf(beginMarker);
  const end = html.indexOf(endMarker, begin + beginMarker.length);
  if (begin < 0 || end < 0) throw new Error('Astrology engine markers are missing.');
  const source = html.slice(begin + beginMarker.length, end) +
    '\n;globalThis.__api = { computeChart, lifeTimeline, TL_RULES, CITIES, SIGNS };';
  const context = {
    Astronomy, pad2: n => String(n).padStart(2, '0'), console, Intl, Date, Math,
    setTimeout, Promise
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: htmlPath.pathname, timeout: 30000 });
  api = context.__api;
} catch (e) {
  fail(`Could not load the astrology engine: ${e.message}`);
}

const a = parseArgs(process.argv.slice(2));
if (a.cities) {
  if (Object.keys(a).length !== 1) fail('--cities cannot be combined with other options.');
  console.log(api.CITIES.map(c => c[0]).join('\n'));
  process.exit(0);
}
if (!a.date) fail('Missing --date.');
const birth = dateParts(a.date, 'date');
if (a.noTime && a.time) fail('Use either --time or --no-time, not both.');
const known = !a.noTime;
const tm = known ? timeParts(a.time || '') : { h: 12, mi: 0 };

let lat, lon, tz, fixedOff, cityName = '';
if (a.city != null) {
  const city = api.CITIES.find(c => c[0] === a.city);
  if (!city) {
    console.error(`Unknown city. Valid names: ${api.CITIES.map(c => c[0]).join(', ')}`);
    process.exit(1);
  }
  [cityName, lat, lon, tz] = city;
  if (a.lat || a.lon || a.tz || a.offset) fail('--city cannot be combined with custom coordinates.');
} else {
  if (a.lat == null || a.lon == null) fail('Custom places require --lat and --lon.');
  if ((a.tz == null) === (a.offset == null)) fail('Provide exactly one of --tz or --offset.');
  lat = Number(a.lat); lon = Number(a.lon);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) fail('Invalid latitude.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) fail('Invalid longitude.');
  if (a.tz != null) {
    if (!validZone(a.tz)) fail('Invalid IANA time zone.');
    tz = a.tz;
  } else fixedOff = offset(a.offset);
}
if (a.now != null) dateParts(a.now, 'now');
const nowMs = a.now ? dateParts(a.now, 'now').ms : Date.now();
const until = Date.UTC(birth.y + 100, birth.mo - 1, birth.d);

let ch, result;
try {
  ch = api.computeChart({
    y: birth.y, mo: birth.mo, d: birth.d, h: tm.h, mi: tm.mi, tz,
    lat, lon, timeKnown: known, fixedOff
  });
  result = api.lifeTimeline(ch, { until, now: nowMs });
} catch (e) {
  fail(`Unable to calculate the timeline: ${e.message}`);
}

const windows = (result.windows || []).slice().sort((x, y) =>
  valueMs((x.exact || [x.start])[0]) - valueMs((y.exact || [y.start])[0]));
const shown = a.all ? windows : windows.filter(w => w.major);
const rules = api.TL_RULES, signs = api.SIGNS;
const sun = planet(ch, 'sun'), moon = planet(ch, 'moon');
const ascLon = ch.asc == null ? null : (typeof ch.asc === 'number' ? ch.asc : ch.asc.lon);
const mcLon = ch.mc == null ? null : (typeof ch.mc === 'number' ? ch.mc : ch.mc.lon);

if (a.json) {
  const jsonWindows = shown.map(w => ({
    id: w.id, rule: w.rule, title: titleFor(w.rule, w, rules, signs), kind: w.kind,
    major: !!w.major, age: w.age,
    exact: (w.exact || []).map(iso), start: iso(w.start), end: iso(w.end)
  }));
  console.log(JSON.stringify({
    input: { date: a.date, time: known ? a.time : null, city: cityName || null,
      lat, lon, tz: tz || null, offsetMinutes: ch.off, timeKnown: known },
    chart: { utc: iso(ch.utc), offsetMinutes: ch.off, timeKnown: !!ch.timeKnown,
      moonUncertain: !!ch.moonUncertain,
      system: ch.system, sun: round4(sun?.lon), moon: round4(moon?.lon),
      asc: round4(ascLon), mc: round4(mcLon) },
    windows: jsonWindows,
    coverage: result.coverage,
    range: { from: iso(result.range.from), to: iso(result.range.to) }
  }));
  process.exit(0);
}

console.log(`Input: ${a.date}${known ? ` ${a.time}` : ' (time unknown)'}` +
  `${cityName ? `, ${cityName}` : `, ${lat}, ${lon}, ${tz || `UTC${ch.off >= 0 ? '+' : ''}${ch.off / 60}`}`}`);
console.log(`UTC: ${iso(ch.utc).slice(0, 16)}Z   UTC offset: ${ch.off} minutes`);
if (sun) console.log(`Sun: ${degText(sun.lon, signs)}`);
if (moon) {
  const uncertainty = ch.moonUncertain && ch.moonRange
    ? ` sign uncertain: ${signs[ch.moonRange[0]]} or ${signs[ch.moonRange[1]]}`
    : '';
  console.log(`Moon: ${degText(moon.lon, signs)}${known ? '' : ` (at local noon; the Moon moves about 13° a day)`}${uncertainty}`);
}
if (known) {
  console.log(`ASC: ${degText(ascLon, signs)}`);
  console.log(`MC: ${degText(mcLon, signs)}`);
} else console.log('ASC, MC and Moon/angle windows are skipped.');
console.log(`House system: ${ch.system}`);

const rows = shown.map(w => {
  const exact = w.exact || [];
  const future = valueMs(w.start) > nowMs;
  return [
    day(exact[0] || w.start),
    String(exact.length),
    w.age == null ? '' : Number(w.age).toFixed(1),
    titleFor(w.rule, w, rules, signs),
    w.kind,
    `${month(w.start)} ~ ${month(w.end)}`,
    future ? 'future' : '',
    ...(a.all ? [w.major ? '*' : ''] : [])
  ];
});
const heads = [
  'exact (first)', 'passes', 'age', 'title', 'kind', 'window', 'future',
  ...(a.all ? ['major'] : [])
];
const widths = heads.map((h, i) => Math.max(width(h), ...rows.map(r => width(r[i]))));
console.log('\n' + heads.map((h, i) => pad(h, widths[i])).join('  '));
for (const r of rows) {
  console.log(r.map((x, i) => i === 2 ? padLeft(x, widths[i]) : pad(x, widths[i])).join('  '));
}

const pct = n => `${(Number(n || 0) * 100).toFixed(1)}%`;
console.log(`\nWindows: ${windows.length} total / ${windows.filter(w => w.major).length} major / ${shown.length} shown`);
console.log(`Coverage: any ${pct(result.coverage?.any)}, major ${pct(result.coverage?.major)}`);
console.log(`Range: ${day(result.range.from)} to ${day(result.range.to)}`);
console.log('Astronomy: Astronomy Engine 2.1.19, tropical zodiac. Interpretation: Reelme rule table (same rules for everyone). Not a prediction.');
