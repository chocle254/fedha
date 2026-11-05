# Kokoro voice for Byte and DJ Luxe, running as a Vercel Python function inside Luxe (no extra server).
# POST /api/tts {text, voice, speed} with header X-Api-Key = KOKORO_KEY, or by default a key derived from the
# Supabase service key (both sides are in this project, so no new setting is needed) → MP3 (WAV if MP3 isn't available).
# The model (~325 MB full-quality + 28 MB voices) downloads to /tmp on a cold start and stays loaded while warm.
import hashlib, io, json, os, threading, urllib.request
from http.server import BaseHTTPRequestHandler

BASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
MODEL = os.environ.get('KOKORO_MODEL', 'kokoro-v1.0.onnx')  # full quality (int8 sounded hoarse)
_tts = None
_lock = threading.Lock()


def _fetch(name):
    path = f'/tmp/{name}'
    if not os.path.exists(path):
        tmp = path + '.part'
        urllib.request.urlretrieve(BASE + name, tmp)
        os.replace(tmp, path)
    return path


def tts():
    global _tts
    with _lock:
        if _tts is None:
            from kokoro_onnx import Kokoro
            _tts = Kokoro(_fetch(MODEL), _fetch('voices-v1.0.bin'))
    return _tts


def encode(samples, rate):
    import soundfile as sf
    buf = io.BytesIO()
    for opts in ({'compression_level': 0.0, 'bitrate_mode': 'CONSTANT'}, {}):  # best MP3 quality first
        try:
            buf = io.BytesIO()
            sf.write(buf, samples, rate, format='MP3', **opts)
            return buf.getvalue(), 'audio/mpeg'
        except Exception:
            pass
    if True:
        buf = io.BytesIO()
        sf.write(buf, samples, rate, format='WAV', subtype='PCM_16')
        return buf.getvalue(), 'audio/wav'


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype='application/json'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        # A GET wakes it: loads the model so the next line is quick.
        try:
            tts()
        except Exception as e:
            return self._send(500, json.dumps({'error': str(e)[:300]}).encode())
        self._send(200, json.dumps({'ok': True, 'model': MODEL, 'loaded': _tts is not None}).encode())

    def do_POST(self):
        key = os.environ.get('KOKORO_KEY') or (hashlib.sha256(('kokoro:' + os.environ['SUPABASE_SERVICE_ROLE_KEY']).encode()).hexdigest() if os.environ.get('SUPABASE_SERVICE_ROLE_KEY') else '')
        if not key or self.headers.get('X-Api-Key') != key:
            return self._send(401, b'{"error":"bad key"}')
        try:
            n = int(self.headers.get('Content-Length') or 0)
            b = json.loads(self.rfile.read(n) or b'{}')
            text = str(b.get('text') or '').strip()[:800]
            if not text:
                return self._send(400, b'{"error":"no text"}')
            voice = str(b.get('voice') or 'am_michael')
            speed = max(0.5, min(1.5, float(b.get('speed') or 1.0)))
            samples, rate = tts().create(text, voice=voice, speed=speed, lang='en-us')
            audio, ctype = encode(samples, rate)
            self._send(200, audio, ctype)
        except Exception as e:
            self._send(500, json.dumps({'error': str(e)[:300]}).encode())
