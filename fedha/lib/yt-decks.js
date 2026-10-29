// Two YouTube players ("decks") so one song can blend into the next, like a DJ: the next song starts on the other
// deck at volume 0 and the volumes cross over `blend` seconds. YouTube requires its player to stay visible, so the
// decks live in a small floating card (components/MiniPlayer / MusicContext) while music from YouTube plays.
let apiReady = null;
function loadApi() {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    document.head.appendChild(s);
  });
  return apiReady;
}

export class Decks {
  constructor(hostA, hostB, { onEnded, onError } = {}) {
    this.hosts = [hostA, hostB];
    this.players = [null, null];
    this.active = 0;
    this.onEnded = onEnded || (() => {});
    this.onError = onError || (() => {});
    this.base = [80, 80]; // each deck's normal volume (loudness-matched per song)
    this.ready = this.init();
  }

  async init() {
    const YT = await loadApi();
    await Promise.all([0, 1].map((i) => new Promise((resolve) => {
      this.players[i] = new YT.Player(this.hosts[i], {
        width: '100%', height: '100%',
        // Data saver: a small player makes YouTube stream a low resolution; vq asks for the lowest too.
        playerVars: { autoplay: 0, controls: 0, playsinline: 1, modestbranding: 1, rel: 0, iv_load_policy: 3, fs: 0, disablekb: 1, vq: 'tiny' },
        events: {
          onReady: () => resolve(),
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED && i === this.active) this.onEnded(); },
          onError: () => { if (i === this.active) this.onError(); },
        },
      });
    })));
  }

  get player() { return this.players[this.active]; }
  get other() { return 1 - this.active; }

  // Loudness match: Deezer's gain is the song's loudness in dB; aim every song at the same level.
  static volumeFor(gain) {
    if (typeof gain !== 'number' || !Number.isFinite(gain)) return 80;
    return Math.max(35, Math.min(100, Math.round(80 * Math.pow(10, (-10 - gain) / 20))));
  }

  async play(videoId, gain) {
    await this.ready;
    const p = this.player;
    this.base[this.active] = Decks.volumeFor(gain);
    p.setVolume(this.base[this.active]);
    p.loadVideoById({ videoId, suggestedQuality: 'tiny' });
    try { p.setPlaybackQuality?.('tiny'); } catch { /* not supported any more on some builds */ }
    p.playVideo();
    this.players[this.other]?.pauseVideo();
  }

  // Start videoId on the other deck and cross the volumes over `seconds`. Resolves when the blend is done.
  async blend(videoId, gain, seconds = 8, duck = null) {
    await this.ready;
    const from = this.active; const to = this.other;
    const a = this.players[from]; const b = this.players[to];
    this.base[to] = Decks.volumeFor(gain);
    b.setVolume(0); b.loadVideoById({ videoId, suggestedQuality: 'tiny' }); try { b.setPlaybackQuality?.('tiny'); } catch { /* ignore */ } b.playVideo();
    const steps = Math.max(8, Math.round(seconds * 10));
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, (seconds * 1000) / steps));
      const k = i / steps; const d = duck ? duck() : 1;
      a.setVolume(Math.round(this.base[from] * (1 - k) * d));
      b.setVolume(Math.round(this.base[to] * k * d));
    }
    a.pauseVideo();
    this.active = to;
    return to;
  }

  // DJ talking: dip the music under the voice, then bring it back.
  setDuck(level) { const p = this.player; if (p?.setVolume) p.setVolume(Math.round(this.base[this.active] * level)); }

  toggle() { const p = this.player; if (!p) return; if (p.getPlayerState?.() === 1) p.pauseVideo(); else p.playVideo(); }
  pause() { this.players.forEach((p) => p?.pauseVideo?.()); }
  seek(s) { this.player?.seekTo?.(s, true); }
  time() { const p = this.player; return { cur: p?.getCurrentTime?.() || 0, dur: p?.getDuration?.() || 0, playing: p?.getPlayerState?.() === 1 }; }
}

// DJ Luxe's voice: the phone's own text-to-speech, a little slower and lower, like a radio host.
export function speak(text, { onStart, onEnd } = {}) {
  if (!text || typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return; }
  const u = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  u.voice = voices.find((v) => /en[-_](US|GB)/i.test(v.lang) && /male|guy|david|daniel|google uk english male/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  u.rate = 0.98; u.pitch = 0.85; u.volume = 1;
  u.onstart = () => onStart?.(); u.onend = () => onEnd?.(); u.onerror = () => onEnd?.();
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
