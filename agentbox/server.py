"""Reelme on GMI Agentbox.

Serves the life-cinema web app on :8080 and answers the page's AI calls with models from GMI MaaS.
Agentbox injects GMI_MAAS_API_KEY and GMI_MAAS_BASE_URL; nothing else is required.

Endpoints
  GET  /, /health, /healthz          static app and health checks
  POST /api/sample                   start an AI job, returns {"id": ...} at once (long jobs are polled)
  GET  /api/sample/<id>              {"status": "running"|"done"|"error", "text": ..., "model": ...}
"""
import gzip, json, mimetypes, os, re, threading, time, uuid, urllib.error, urllib.request
from collections import deque
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
PORT = int(os.environ.get('PORT', '8080'))
KEY = os.environ.get('GMI_MAAS_API_KEY') or os.environ.get('GMI_API_KEY', '')
BASE = (os.environ.get('GMI_MAAS_BASE_URL') or 'https://api.gmi-serving.com/v1').rstrip('/')
if not BASE.endswith('/v1'):
    BASE = BASE + '/v1'

# Casting: each tier has a lead and understudies. Override with comma-separated env vars.
def cast(env, default):
    return [m.strip() for m in os.environ.get(env, default).split(',') if m.strip()]
MODELS = {
    'quick': cast('REELME_MODELS_QUICK', 'openai/gpt-6-luna,moonshotai/kimi-k3'),
    'default': cast('REELME_MODELS_DEFAULT', 'openai/gpt-6-luna,moonshotai/kimi-k3,openai/gpt-5.6-sol'),
    'complex': cast('REELME_MODELS_COMPLEX', 'openai/gpt-6-sol,openai/gpt-6-luna,moonshotai/kimi-k3'),
    'vision': cast('REELME_MODELS_VISION', 'google/gemini-3.8-flash,google/gemini-3.7-flash'),
}
MAX_TOKENS = int(os.environ.get('REELME_MAX_TOKENS', '8000'))
MAX_BODY = 12 * 1024 * 1024
RATE = int(os.environ.get('REELME_RATE_PER_10MIN', '80'))          # AI calls per IP per 10 minutes
SLOTS = threading.BoundedSemaphore(int(os.environ.get('REELME_CONCURRENCY', '4')))
JOBS, JOBS_LOCK, HITS = {}, threading.Lock(), {}

SYSTEM = ('你是「人生電影院」的 AI 導演，替使用者閱讀自己的 Facebook 貼文並剪成電影。'
          '一律使用台灣繁體中文與全形標點，不要編造原文沒有的事實。')
JSON_RULE = '\n\n只輸出 JSON，不要任何說明文字，也不要用 ``` 包起來。'


def log(*a):
    print(time.strftime('%H:%M:%S'), *a, flush=True)


def to_messages(inp, images, want_json):
    msgs = [{'role': 'system', 'content': SYSTEM}]
    if isinstance(inp, str):
        turns = [{'role': 'user', 'content': inp}]
    else:
        turns = [{'role': t.get('role', 'user'), 'content': str(t.get('content', ''))} for t in (inp or [])]
    if not turns or turns[-1]['role'] != 'user':
        turns.append({'role': 'user', 'content': ''})
    if want_json:
        turns[-1]['content'] += JSON_RULE
    if images:
        parts = [{'type': 'text', 'text': turns[-1]['content']}]
        parts += [{'type': 'image_url', 'image_url': {'url': u}} for u in images]
        turns[-1] = {'role': 'user', 'content': parts}
    return msgs + turns


def stream_chat(model, messages, job):
    body = json.dumps({'model': model, 'messages': messages, 'stream': True, 'max_tokens': MAX_TOKENS, 'temperature': 0.7}).encode()
    req = urllib.request.Request(BASE + '/chat/completions', data=body, method='POST', headers={
        'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Accept': 'text/event-stream', 'User-Agent': 'reelme-agentbox/1.0'})
    text, finish = '', None
    with urllib.request.urlopen(req, timeout=300) as r:
        for raw in r:
            line = raw.decode('utf-8', 'ignore').strip()
            if not line.startswith('data:'):
                continue
            data = line[5:].strip()
            if data == '[DONE]':
                break
            try:
                ch = json.loads(data)['choices'][0]
            except Exception:
                continue
            delta = (ch.get('delta') or {}).get('content') or ''
            if delta:
                text += delta
                job['text'] = text
            finish = ch.get('finish_reason') or finish
            if job.get('cancel'):
                break
    return text, finish


def run_job(job, inp, images, tier, want_json):
    chain = MODELS['vision'] if images else MODELS.get(tier) or MODELS['default']
    messages = to_messages(inp, images, want_json)
    with SLOTS:
        last_err = 'no model answered'
        for model in chain:
            if job.get('cancel'):
                job.update(status='error', code='cancelled', error='cancelled'); return
            job.update(model=model, text='')
            t0 = time.time()
            try:
                text, finish = stream_chat(model, messages, job)
                if text.strip():
                    job.update(status='done', text=text, truncated=finish == 'length')
                    log('ok', model, f'{time.time() - t0:.1f}s', len(text), 'chars')
                    return
                last_err = f'{model} returned an empty answer'
            except urllib.error.HTTPError as e:
                last_err = f'{model} HTTP {e.code}'
            except Exception as e:  # network, timeout
                last_err = f'{model} {type(e).__name__}'
            log('recast:', last_err)
        job.update(status='error', code='unavailable', error=last_err)


def rate_ok(ip):
    now = time.time(); q = HITS.setdefault(ip, deque())
    while q and now - q[0] > 600:
        q.popleft()
    if len(q) >= RATE:
        return False
    q.append(now); return True


def gc_jobs():
    while True:
        time.sleep(60)
        with JOBS_LOCK:
            for k in [k for k, j in JOBS.items() if time.time() - j['t'] > 1800]:
                JOBS.pop(k, None)


class H(BaseHTTPRequestHandler):
    server_version = 'reelme-agentbox'

    def log_message(self, fmt, *a):
        pass

    def send_json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/health', '/healthz', '/api/health'):
            return self.send_json(200, {'ok': True, 'models': MODELS, 'key': bool(KEY)})
        m = re.match(r'^/api/sample/([0-9a-f]{32})$', path)
        if m:
            j = JOBS.get(m.group(1))
            if not j:
                return self.send_json(404, {'status': 'error', 'code': 'not_found', 'error': 'unknown job'})
            return self.send_json(200, {k: j.get(k) for k in ('status', 'text', 'model', 'code', 'error', 'truncated')})
        self.serve_static(path)

    def do_HEAD(self):
        self.serve_static(self.path.split('?', 1)[0], head=True)

    def do_DELETE(self):
        m = re.match(r'^/api/sample/([0-9a-f]{32})$', self.path.split('?', 1)[0])
        j = JOBS.get(m.group(1)) if m else None
        if j:
            j['cancel'] = True
        self.send_json(200 if j else 404, {'ok': bool(j)})

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        n = int(self.headers.get('Content-Length') or 0)
        if path != '/api/sample':
            return self.send_json(404, {'error': 'not found'})
        if n <= 0 or n > MAX_BODY:
            return self.send_json(413, {'code': 'too_large', 'error': 'request too large'})
        if not KEY:
            return self.send_json(503, {'code': 'unavailable', 'error': 'GMI_MAAS_API_KEY is not set'})
        ip = (self.headers.get('X-Forwarded-For') or self.client_address[0]).split(',')[0].strip()
        if not rate_ok(ip):
            return self.send_json(429, {'code': 'rate_limited', 'error': 'too many requests, try again later'})
        try:
            req = json.loads(self.rfile.read(n))
        except Exception:
            return self.send_json(400, {'code': 'bad_request', 'error': 'invalid JSON'})
        images = [u for u in (req.get('images') or []) if isinstance(u, str) and u.startswith('data:image/')][:8]
        job = {'id': uuid.uuid4().hex, 'status': 'running', 'text': '', 't': time.time()}
        with JOBS_LOCK:
            JOBS[job['id']] = job
        threading.Thread(target=run_job, args=(job, req.get('input', ''), images, req.get('tier', 'default'), bool(req.get('json'))), daemon=True).start()
        self.send_json(202, {'id': job['id']})

    def serve_static(self, path, head=False):
        if path in ('', '/'):
            path = '/index.html'
        full = os.path.realpath(os.path.join(ROOT, path.lstrip('/')))
        if not full.startswith(ROOT + os.sep) or not os.path.isfile(full):
            return self.send_json(404, {'error': 'not found'})
        ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
        size = os.path.getsize(full)
        cache = 'no-cache' if full.endswith('.html') else 'public, max-age=86400'
        rng = self.headers.get('Range')
        gz = ctype.startswith(('text/', 'application/json', 'application/javascript')) and 'gzip' in (self.headers.get('Accept-Encoding') or '') and not rng
        if gz:
            with open(full, 'rb') as f:
                body = gzip.compress(f.read(), 6)
            self.send_response(200); self.send_header('Content-Type', ctype + ('; charset=utf-8' if ctype.startswith('text/') else ''))
            self.send_header('Content-Encoding', 'gzip'); self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', cache); self.end_headers()
            if not head:
                self.wfile.write(body)
            return
        start, end, code = 0, size - 1, 200
        m = re.match(r'bytes=(\d*)-(\d*)', rng or '')
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1); code = 206
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - start + 1)); self.send_header('Cache-Control', cache)
        if code == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.end_headers()
        if head:
            return
        with open(full, 'rb') as f:
            f.seek(start); left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 16, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)


if __name__ == '__main__':
    threading.Thread(target=gc_jobs, daemon=True).start()
    log(f'Reelme on :{PORT}  key={"set" if KEY else "MISSING"}  base={BASE}')
    ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
