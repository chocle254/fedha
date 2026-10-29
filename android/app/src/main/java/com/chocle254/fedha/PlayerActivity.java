package com.chocle254.fedha;

import android.app.Activity;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.audiofx.Virtualizer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// Luxe's own player, opened from the Chill Room (luxe://watch?q=<queue>&sound=theater|max|off).
//   Theater: black, landscape, full screen, screen on, no system bars; controls only on a tap, gone after 2.5 s.
//   Sound:   bass boost + a low-end equaliser curve + virtualiser + loudness lift on the player's audio session.
//   Netflix: resumes where you stopped; skips the intro at the exact second (IntroDB, TheIntroDB as backup, by the
//            show's IMDb id + season + episode); when the credits start, "Next episode in 8" (tap to stay).
//   Watched: an episode counts as watched at 85% or at the credits, reported to Luxe (/api/chill/watched).
// The queue is the episode you tapped plus the next downloaded ones: [{ id, t, k, imdb, s, e }] (MediaStore ids).
public class PlayerActivity extends Activity {
    private static final String PREFS = "luxe_player";
    private static final String URL_WATCHED = "https://fedha.vercel.app/api/chill/watched";
    private final Handler h = new Handler(Looper.getMainLooper());

    private ExoPlayer player;
    private PlayerView view;
    private TextView pill;
    private JSONArray queue = new JSONArray();
    private int idx = 0;
    private String sound = "theater";

    private long introStart = -1, introEnd = -1, outroStart = -1;
    private boolean introDone, watchedSent, nextArmed;
    private int nextCountdown = -1;
    private long lastSave = 0;
    private long lastCount = 0;

    private Equalizer eq;
    private BassBoost bass;
    private Virtualizer virt;
    private LoudnessEnhancer loud;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readIntent(getIntent());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setBackgroundColor(Color.BLACK);
        view.setShutterBackgroundColor(Color.BLACK);
        view.setControllerShowTimeoutMs(2500);
        view.setControllerHideOnTouch(true);
        view.setShowNextButton(false);
        view.setShowPreviousButton(false);
        view.setShowSubtitleButton(true);
        view.setKeepScreenOn(true);
        root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        // The only extra on screen: a small pill that flashes "Intro skipped" / "Next episode in 8".
        pill = new TextView(this);
        pill.setTextColor(Color.WHITE);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        int px = dp(14), py = dp(8);
        pill.setPadding(px, py, px, py);
        GradientDrawable g = new GradientDrawable();
        g.setColor(0xCC000000); g.setCornerRadius(dp(20)); g.setStroke(dp(1), 0x33FFFFFF);
        pill.setBackground(g);
        pill.setVisibility(View.GONE);
        pill.setOnClickListener(v -> { if (nextCountdown >= 0) { nextCountdown = -1; nextArmed = false; hidePill(); showPill("Staying on this episode", 1500); } });
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        lp.setMargins(0, 0, dp(28), dp(72));
        root.addView(pill, lp);
        setContentView(root);

        player = new ExoPlayer.Builder(this).setSeekBackIncrementMs(10_000).setSeekForwardIncrementMs(10_000).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        player.setHandleAudioBecomingNoisy(true); // headphones out: pause
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onAudioSessionIdChanged(int sessionId) { attachSound(sessionId); }
            @Override public void onPlaybackStateChanged(int s) { if (s == Player.STATE_ENDED) { markWatched(); if (hasNext()) playAt(idx + 1); else finish(); } }
            @Override public void onPlayerError(PlaybackException e) { openElsewhere(); }
        });
        playAt(0);
        h.post(tick);
    }

    private void readIntent(Intent i) {
        Uri d = i == null ? null : i.getData();
        if (d == null) return;
        String s = d.getQueryParameter("sound");
        if (s != null) sound = s;
        try {
            String q = d.getQueryParameter("q");
            if (q != null) queue = new JSONArray(new String(Base64.decode(q, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
            else if (d.getQueryParameter("id") != null) queue.put(new JSONObject().put("id", Long.parseLong(d.getQueryParameter("id"))));
        } catch (Exception ignored) { }
    }

    private boolean hasNext() { return idx + 1 < queue.length(); }

    private void playAt(int i) {
        JSONObject it = queue.optJSONObject(i);
        if (it == null) { finish(); return; }
        if (i != idx) saveSpot();
        idx = i;
        introStart = introEnd = outroStart = -1;
        introDone = watchedSent = nextArmed = false;
        nextCountdown = -1;
        hidePill();
        Uri uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, it.optLong("id"));
        player.setMediaItem(MediaItem.fromUri(uri));
        long resume = getSharedPreferences(PREFS, MODE_PRIVATE).getLong("pos_" + it.optLong("id"), 0);
        player.prepare();
        if (resume > 30_000) { player.seekTo(resume); showPill("Resumed", 1200); }
        player.play();
        if (it.optString("t").length() > 0) showPill(it.optString("t"), 2500);
        fetchSegments(it);
    }

    // Intro / credits times for this episode: IntroDB first, TheIntroDB if it has nothing.
    private void fetchSegments(JSONObject it) {
        final String imdb = it.optString("imdb", "");
        final int s = it.optInt("s", 0), e = it.optInt("e", 0);
        if (imdb.isEmpty() || s <= 0 || e <= 0) return;
        final int forIdx = idx;
        new Thread(() -> {
            long is = -1, ie = -1, os = -1;
            try {
                JSONObject j = new JSONObject(get("https://api.introdb.app/segments?imdb_id=" + imdb + "&season=" + s + "&episode=" + e));
                JSONObject intro = j.optJSONObject("intro"), outro = j.optJSONObject("outro");
                if (intro != null) { is = intro.optLong("start_ms", -1); ie = intro.optLong("end_ms", -1); }
                if (outro != null) os = outro.optLong("start_ms", -1);
            } catch (Exception ignored) { }
            if (is < 0 || os < 0) {
                try {
                    JSONObject j = new JSONObject(get("https://api.theintrodb.org/v4/media?imdb_id=" + imdb + "&season=" + s + "&episode=" + e));
                    JSONArray in = j.optJSONArray("intro"), cr = j.optJSONArray("credits");
                    if (is < 0 && in != null && in.length() > 0) { is = in.getJSONObject(0).optLong("start_ms", -1); ie = in.getJSONObject(0).optLong("end_ms", -1); }
                    if (os < 0 && cr != null && cr.length() > 0) os = cr.getJSONObject(0).optLong("start_ms", -1);
                } catch (Exception ignored) { }
            }
            final long fis = is, fie = ie, fos = os;
            h.post(() -> { if (forIdx == idx) { introStart = fis; introEnd = fie; outroStart = fos; } });
        }).start();
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000); c.setReadTimeout(8000);
        try (InputStream in = c.getInputStream()) {
            byte[] buf = new byte[16384]; StringBuilder sb = new StringBuilder(); int n;
            while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
            return sb.toString();
        } finally { c.disconnect(); }
    }

    // Twice a second: skip the intro, arm "next episode" at the credits, keep the resume spot, mark watched.
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (player != null && player.getPlaybackState() == Player.STATE_READY) {
                long pos = player.getCurrentPosition(), dur = player.getDuration();
                if (!introDone && introStart >= 0 && introEnd > introStart && pos >= introStart - 300 && pos < introEnd - 1500) {
                    introDone = true;
                    player.seekTo(introEnd);
                    showPill("Intro skipped", 1500);
                }
                boolean credits = (outroStart > 0 && pos >= outroStart) || (outroStart <= 0 && dur > 0 && dur - pos < 20_000);
                if (credits) markWatched();
                if (credits && hasNext() && !nextArmed && player.isPlaying()) { nextArmed = true; nextCountdown = 8; lastCount = System.currentTimeMillis(); }
                if (dur > 0 && pos > dur * 0.85) markWatched();
                if (System.currentTimeMillis() - lastSave > 5000) saveSpot();
            }
            if (nextCountdown >= 0 && player != null && player.isPlaying()) {
                if (nextCountdown == 0) { nextCountdown = -1; playAt(idx + 1); }
                else {
                    JSONObject nx = queue.optJSONObject(idx + 1);
                    showPill("Next: " + (nx == null ? "episode" : nx.optString("t", "episode")) + "  in " + nextCountdown + "   ·   tap to stay", 1100);
                    long t = System.currentTimeMillis();
                    if (t - lastCount >= 1000) { nextCountdown--; lastCount = t; }
                }
            }
            h.postDelayed(this, 500);
        }
    };

    private void saveSpot() {
        if (player == null) return;
        JSONObject it = queue.optJSONObject(idx);
        if (it == null) return;
        lastSave = System.currentTimeMillis();
        long pos = player.getCurrentPosition(), dur = player.getDuration();
        SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
        if (dur > 0 && dur - pos < 60_000) e.remove("pos_" + it.optLong("id")); else e.putLong("pos_" + it.optLong("id"), pos);
        e.apply();
    }

    private void markWatched() {
        if (watchedSent) return;
        watchedSent = true;
        JSONObject it = queue.optJSONObject(idx);
        if (it == null || it.optString("k").isEmpty()) return;
        final JSONObject body = new JSONObject();
        try { body.put("key", it.optString("k")); body.put("id", it.optLong("id")); } catch (Exception ignored) { }
        new Thread(() -> SmsUploader.postJson(getApplicationContext(), URL_WATCHED, body)).start();
    }

    // ── Sound: deep, wide, loud ────────────────────────────────────────────────
    private void attachSound(int session) {
        releaseSound();
        if ("off".equals(sound) || session == C.AUDIO_SESSION_ID_UNSET) return;
        boolean max = "max".equals(sound);
        try {
            eq = new Equalizer(0, session);
            short[] range = eq.getBandLevelRange(); // millibels, e.g. -1500..1500
            for (short b = 0; b < eq.getNumberOfBands(); b++) {
                int hz = eq.getCenterFreq(b) / 1000;
                int level = hz <= 90 ? (max ? 1000 : 800) : hz <= 250 ? (max ? 700 : 500) : hz <= 1000 ? -100 : hz <= 4000 ? 100 : 300;
                eq.setBandLevel(b, (short) Math.max(range[0], Math.min(range[1], level)));
            }
            eq.setEnabled(true);
        } catch (RuntimeException ignored) { }
        try { bass = new BassBoost(0, session); bass.setStrength((short) (max ? 1000 : 750)); bass.setEnabled(true); } catch (RuntimeException ignored) { }
        try { virt = new Virtualizer(0, session); virt.setStrength((short) (max ? 900 : 700)); virt.setEnabled(true); } catch (RuntimeException ignored) { }
        try { loud = new LoudnessEnhancer(session); loud.setTargetGain(max ? 900 : 500); loud.setEnabled(true); } catch (RuntimeException ignored) { }
    }

    private void releaseSound() {
        try { if (eq != null) eq.release(); } catch (RuntimeException ignored) { }
        try { if (bass != null) bass.release(); } catch (RuntimeException ignored) { }
        try { if (virt != null) virt.release(); } catch (RuntimeException ignored) { }
        try { if (loud != null) loud.release(); } catch (RuntimeException ignored) { }
        eq = null; bass = null; virt = null; loud = null;
    }

    // A file the built-in decoders can't play (rare codecs like DTS): hand it to another player instead.
    private void openElsewhere() {
        JSONObject it = queue.optJSONObject(idx);
        if (it == null) { finish(); return; }
        Toast.makeText(this, "Luxe's player can't play this file's format. Opening it in another player.", Toast.LENGTH_LONG).show();
        try {
            Uri uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, it.optLong("id"));
            startActivity(Intent.createChooser(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "video/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Watch with"));
        } catch (RuntimeException ignored) { }
        finish();
    }

    private void showPill(String text, long ms) {
        pill.setText(text);
        pill.setVisibility(View.VISIBLE);
        h.removeCallbacks(hide);
        h.postDelayed(hide, ms);
    }
    private final Runnable hide = this::hidePill;
    private void hidePill() { if (pill != null) pill.setVisibility(View.GONE); }

    private int dp(int v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    // Full screen, no status or navigation bars (they come back with a swipe, then hide again).
    private void immersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) { super.onWindowFocusChanged(hasFocus); if (hasFocus) immersive(); }
    @Override protected void onResume() { super.onResume(); immersive(); }
    @Override protected void onPause() { super.onPause(); saveSpot(); if (player != null) player.pause(); }
    @Override protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        saveSpot();
        releaseSound();
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
