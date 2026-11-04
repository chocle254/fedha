# Kokoro voice server for Luxe (runs on a free Hugging Face Space).
# Luxe's /api/byte-voice sends Byte's and DJ Luxe's lines here when ElevenLabs is out of credits.
# POST /tts {text, voice, speed} with header X-Api-Key → MP3 (WAV if MP3 isn't available). GET / = health.
import io
import os

import soundfile as sf
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from kokoro_onnx import Kokoro
from pydantic import BaseModel

KEY = os.environ.get("API_KEY", "")
kokoro = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
try:
    VOICES = set(kokoro.get_voices())
except Exception:  # older versions: no list, trust the request
    VOICES = None

app = FastAPI()


class Req(BaseModel):
    text: str
    voice: str = "am_michael"
    speed: float = 1.0


@app.get("/")
def health():
    return {"ok": True, "voices": sorted(VOICES) if VOICES else None}


@app.post("/tts")
def tts(r: Req, x_api_key: str = Header(default="")):
    if KEY and x_api_key != KEY:
        raise HTTPException(status_code=401, detail="bad key")
    text = " ".join(r.text.split())[:800]
    if not text:
        raise HTTPException(status_code=400, detail="no text")
    voice = r.voice if (VOICES is None or r.voice in VOICES) else "am_michael"
    samples, rate = kokoro.create(text, voice=voice, speed=max(0.7, min(1.3, r.speed)), lang="en-us")
    buf = io.BytesIO()
    try:
        sf.write(buf, samples, rate, format="MP3")
        kind = "audio/mpeg"
    except Exception:
        buf = io.BytesIO()
        sf.write(buf, samples, rate, format="WAV", subtype="PCM_16")
        kind = "audio/wav"
    return Response(buf.getvalue(), media_type=kind)
