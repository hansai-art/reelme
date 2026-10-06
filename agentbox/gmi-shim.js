/* Reelme on GMI Agentbox: when the page is not opened inside Claude, its AI calls (window.claude.use('sample'))
   are answered by this container's /api/sample, which uses models from GMI MaaS. Long answers are polled,
   because Agentbox expects requests over ~30 s to return a job id first. */
(function () {
  if (window.claude && typeof window.claude.use === 'function') return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
  const toDataURL = b => typeof b === 'string' ? Promise.resolve(b) : new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
  function parseJSON(t) {
    const s = String(t || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (e) {}
    const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
    throw err('bad_json', 'model did not return JSON');
  }
  async function call(input, opts, json) {
    opts = opts || {};
    const sig = opts.signal;
    if (sig && sig.aborted) throw err('cancelled');
    const body = { input, json, tier: opts.modelTier || 'default' };
    if (opts.images && opts.images.length) body.images = await Promise.all([...opts.images].map(toDataURL));
    let r;
    try { r = await fetch('api/sample', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: sig }); }
    catch (e) { throw err(sig && sig.aborted ? 'cancelled' : 'unavailable', String(e && e.message || e)); }
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw err(j.code || (r.status === 429 ? 'rate_limited' : 'unavailable'), j.error); }
    const { id } = await r.json();
    let last = '', wait = 700;
    const stop = () => { fetch('api/sample/' + id, { method: 'DELETE' }).catch(() => {}); };
    if (sig) sig.addEventListener('abort', stop, { once: true });
    for (;;) {
      await sleep(wait); wait = Math.min(1500, wait + 200);
      if (sig && sig.aborted) throw err('cancelled');
      let j;
      try { j = await (await fetch('api/sample/' + id, { cache: 'no-store' })).json(); } catch (e) { continue; }
      if (j.text && j.text !== last && typeof opts.onText === 'function') { const delta = j.text.slice(last.length); last = j.text; try { opts.onText({ text: j.text, delta }); } catch (e) {} }
      if (j.status === 'done') return { text: j.text, truncated: !!j.truncated, model: j.model };
      if (j.status === 'error') throw err(j.code || 'unavailable', j.error);
    }
  }
  function makeSample() {
    const sample = (input, opts) => call(input, opts, false);
    sample.json = async (input, opts) => parseJSON((await call(input, opts, true)).text);
    sample.limits = async () => ({ images: { maxCount: 4 } });
    return sample;
  }
  window.REELME_HOST = 'gmi-agentbox';
  window.claude = { use: name => Promise.resolve(name === 'sample' ? makeSample() : null) };
})();
