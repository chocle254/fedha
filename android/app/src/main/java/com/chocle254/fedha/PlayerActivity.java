package com.chocle254.fedha;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentUris;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;
import org.videolan.libvlc.util.VLCVideoLayout;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;

// Luxe's own player, opened from the Chill Room (luxe://watch?q=<queue>&sound=theater|max|off).
//   Engine:  libVLC (the engine inside VLC), so almost any file plays: MKV/MP4/AVI/..., HEVC 10-bit, Dolby, DTS,
//            and MKVs that keep their track list at the end of the file.
//   Theater: black, landscape, full screen, screen on, no system bars; controls only on a tap, gone after 3 s.
//   Sound:   VLC equaliser with a deep low end ("max" pushes it further), "off" leaves it flat.
//   Netflix: resumes where you stopped; skips the intro at the exact second (IntroDB, TheIntroDB as backup, by the
//            show's IMDb id + season + episode); when the credits start, "Next episode in 8" (tap to stay).
//   Watched: only when you WATCH your way to the end credits (or 92%): a minute of real play before it, so dragging
//   the seek bar to the end doesn't count. Credits times must sit in the last quarter (TheIntroDB sometimes lists
//   the opening credits as "credits"). Reported to Luxe (/api/chill/watched).
// The queue is the episode you tapped plus the next downloaded ones: [{ id, t, k, imdb, s, e }] (MediaStore ids).
public class PlayerActivity extends Activity {
    private static final String PREFS = "luxe_player";
    private static final String URL_WATCHED = "https://fedha.vercel.app/api/chill/watched";
    private final Handler h = new Handler(Looper.getMainLooper());

    private LibVLC vlc;
    private MediaPlayer mp;
    private VLCVideoLayout video;
    private ParcelFileDescriptor pfd; // the open file of the episode playing
    private boolean started, attached;

    private TextView pill, title, playBtn, timeNow, timeEnd;
    private SeekBar bar;
    private View controls, topBar, bottomBar, centerRow;
    private boolean scrubbing;

    private JSONArray queue = new JSONArray();
    private int idx = 0;
    private String sound = "theater";

    private long introStart = -1, introEnd = -1, outroStart = -1;
    private boolean introDone, watchedSent, nextArmed;
    private long lastTickPos = -1, runMs = 0; // continuous play since the last seek
    private int nextCountdown = -1;
    private long lastSave = 0, lastCount = 0, lastReport = 0;

    // Gestures: tap = controls, pinch = fill / fit, vertical swipe right = volume, left = brightness,
    // sideways = seek, double-tap edges = ±10 s, double-tap middle = pause.
    private GestureDetector gestures;
    private ScaleGestureDetector pinch;
    private AudioManager audio;
    private int swipe = 0; // 0 none, 1 volume, 2 brightness, 3 seek
    private float swipeStartY, swipeStartValue;
    private long seekFrom, seekTarget;
    private boolean onControl;  // this touch started on a button, the seek bar or the pill

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        readIntent(getIntent());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        video = new VLCVideoLayout(this);
        root.addView(video, new FrameLayout.LayoutParams(-1, -1));
        // VLC sizes the picture from the view: redo it whenever the view changes size (e.g. after turning landscape).
        video.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
            if (r - l != or - ol || b - t != ob - ot) h.post(this::applyScale);
        });
        buildControls(root);

        pill = new TextView(this);
        pill.setTextColor(Color.WHITE);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        pill.setPadding(dp(14), dp(8), dp(14), dp(8));
        pill.setBackground(round(0xCC000000, 20));
        pill.setVisibility(View.GONE);
        pill.setOnClickListener(v -> { if (nextCountdown >= 0) { nextCountdown = -1; nextArmed = false; hidePill(); showPill("Staying on this episode", 1500); } });
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-2, -2, Gravity.TOP | Gravity.END);
        lp.setMargins(0, dp(24), dp(28), 0);
        root.addView(pill, lp);
        setContentView(root);

        ArrayList<String> opts = new ArrayList<>();
        opts.add("--audio-time-stretch");
        opts.add("--avcodec-skiploopfilter=1"); // keeps software HEVC 10-bit smooth on mid-range phones
        opts.add("--freetype-rel-fontsize=16");
        vlc = new LibVLC(this, opts);
        mp = new MediaPlayer(vlc);
        mp.setEventListener(this::onVlcEvent);
        attachSound();

        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        setupGestures();
        h.post(tick);
    }

    // ── Controls: title + Subtitles / Audio on top, ⏮ ⏪ ⏸ ⏩ ⏭ in the middle, time + seek bar at the bottom ──
    private void buildControls(FrameLayout root) {
        FrameLayout c = new FrameLayout(this);
        c.setBackgroundColor(0x66000000);
        controls = c;

        LinearLayout top = new LinearLayout(this);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(20), dp(14), dp(20), dp(8));
        title = text("", 16);
        title.setSingleLine(true);
        top.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        top.addView(button("Subtitles", v -> pickTrack(true)));
        top.addView(button("Audio", v -> pickTrack(false)));
        top.addView(button("Fill / Fit", v -> setFill(!fill())));
        topBar = top;
        c.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));

        LinearLayout mid = new LinearLayout(this);
        mid.setGravity(Gravity.CENTER);
        mid.addView(icon("⏮", 26, v -> { if (idx > 0) playAt(idx - 1); }));
        mid.addView(icon("⏪", 26, v -> seekBy(-10_000)));
        playBtn = icon("⏸", 40, v -> togglePlay());
        mid.addView(playBtn);
        mid.addView(icon("⏩", 26, v -> seekBy(10_000)));
        mid.addView(icon("⏭", 26, v -> { if (hasNext()) playAt(idx + 1); }));
        centerRow = mid;
        c.addView(mid, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER));

        LinearLayout bottom = new LinearLayout(this);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(dp(20), dp(4), dp(20), dp(28));
        timeNow = text("0:00", 13);
        timeEnd = text("0:00", 13);
        bar = new SeekBar(this);
        bar.setPadding(dp(16), dp(14), dp(16), dp(14)); // a fat touch target
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) { timeNow.setText(clock(p * 1000L)); keepControls(); } }
            @Override public void onStartTrackingTouch(SeekBar s) { scrubbing = true; keepControls(); }
            @Override public void onStopTrackingTouch(SeekBar s) { scrubbing = false; if (mp != null) mp.setTime(s.getProgress() * 1000L); runMs = 0; keepControls(); }
        });
        bottom.addView(timeNow);
        bottom.addView(bar, new LinearLayout.LayoutParams(0, -2, 1));
        bottom.addView(timeEnd);
        bottomBar = bottom;
        // Full screen puts the bottom bar on the bottom edge, where a sideways drag is Android's swipe-between-apps
        // gesture: lift it above that strip so the seek bar can be dragged.
        bottom.setOnApplyWindowInsetsListener((v, in) -> {
            int b = dp(28), side = dp(20);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                b = Math.max(b, in.getMandatorySystemGestureInsets().bottom + dp(10));
                side = Math.max(side, Math.max(in.getSystemGestureInsets().left, in.getSystemGestureInsets().right));
            }
            v.setPadding(side, dp(4), side, b);
            return in;
        });
        c.addView(bottom, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        c.setVisibility(View.GONE);
        root.addView(c, new FrameLayout.LayoutParams(-1, -1));
    }

    private TextView text(String s, int sp) {
        TextView t = new TextView(this);
        t.setText(s); t.setTextColor(Color.WHITE); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        return t;
    }
    private TextView button(String s, View.OnClickListener l) {
        TextView t = text(s, 14);
        t.setPadding(dp(14), dp(8), dp(14), dp(8));
        t.setBackground(round(0x33FFFFFF, 18));
        t.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
        lp.setMargins(dp(8), 0, 0, 0);
        t.setLayoutParams(lp);
        return t;
    }
    private TextView icon(String s, int sp, View.OnClickListener l) {
        TextView t = text(s, sp);
        t.setGravity(Gravity.CENTER);
        t.setPadding(dp(18), dp(10), dp(18), dp(10));
        t.setOnClickListener(l);
        return t;
    }
    private GradientDrawable round(int color, int radius) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color); g.setCornerRadius(dp(radius)); g.setStroke(dp(1), 0x33FFFFFF);
        return g;
    }

    private final Runnable hideControls = () -> { if (!scrubbing && controls != null) controls.setVisibility(View.GONE); };
    private void showControls() { controls.setVisibility(View.VISIBLE); refreshBar(); keepControls(); }
    private void keepControls() { h.removeCallbacks(hideControls); h.postDelayed(hideControls, 3000); }
    private void toggleControls() { if (controls.getVisibility() == View.VISIBLE) controls.setVisibility(View.GONE); else showControls(); }

    private void refreshBar() {
        if (mp == null || scrubbing) return;
        long len = Math.max(0, mp.getLength()), pos = Math.max(0, mp.getTime());
        bar.setMax((int) (len / 1000));
        bar.setProgress((int) (pos / 1000));
        timeNow.setText(clock(pos));
        timeEnd.setText(clock(len));
        playBtn.setText(mp.isPlaying() ? "⏸" : "▶");
    }

    private void togglePlay() {
        if (mp == null) return;
        if (mp.isPlaying()) mp.pause(); else mp.play();
        h.postDelayed(this::refreshBar, 150);
        keepControls();
    }
    private void seekBy(long ms) {
        if (mp == null) return;
        long len = mp.getLength();
        long to = Math.max(0, mp.getTime() + ms);
        if (len > 0) to = Math.min(to, len - 1000);
        mp.setTime(to);
        runMs = 0;
        showPill(ms < 0 ? "⏪ 10 s" : "10 s ⏩", 700);
        refreshBar();
    }

    // Subtitles / audio language: VLC lists the file's tracks (and "Disable").
    private void pickTrack(boolean subs) {
        if (mp == null) return;
        MediaPlayer.TrackDescription[] tracks = subs ? mp.getSpuTracks() : mp.getAudioTracks();
        if (tracks == null || tracks.length == 0) { showPill(subs ? "No subtitles in this file" : "Only one audio track", 1500); return; }
        int current = subs ? mp.getSpuTrack() : mp.getAudioTrack(), checked = -1;
        String[] names = new String[tracks.length];
        for (int i = 0; i < tracks.length; i++) { names[i] = tracks[i].name; if (tracks[i].id == current) checked = i; }
        h.removeCallbacks(hideControls);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(subs ? "Subtitles" : "Audio")
                .setSingleChoiceItems(names, checked, (d, i) -> {
                    if (subs) mp.setSpuTrack(tracks[i].id); else mp.setAudioTrack(tracks[i].id);
                    d.dismiss();
                })
                .setOnDismissListener(d -> { immersive(); keepControls(); })
                .show();
    }

    private void setupGestures() {
        pinch = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            float total = 1f;
            @Override public boolean onScaleBegin(ScaleGestureDetector d) { total = 1f; return true; }
            @Override public boolean onScale(ScaleGestureDetector d) { total *= d.getScaleFactor(); return true; }
            @Override public void onScaleEnd(ScaleGestureDetector d) {
                if (total > 1.08f) setFill(true); else if (total < 0.92f) setFill(false);
            }
        });
        gestures = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { swipe = 0; swipeStartY = e.getY(); return false; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { toggleControls(); return true; }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (e1 == null || pinch.isInProgress() || mp == null) return false;
                float moved = e1.getY() - e2.getY(), across = e2.getX() - e1.getX();
                float w = video.getWidth(), ht = video.getHeight();
                // Sideways: seek (the whole width = 3 minutes, set on release).
                if (swipe == 3 || (swipe == 0 && Math.abs(across) >= dp(24) && Math.abs(across) > Math.abs(moved) * 1.5f && mp.getLength() > 0)) {
                    if (swipe != 3) { swipe = 3; seekFrom = mp.getTime(); }
                    long len = mp.getLength();
                    seekTarget = Math.max(0, Math.min(len - 1000, seekFrom + (long) (across / w * 180_000)));
                    long diff = seekTarget - seekFrom;
                    showPill((diff < 0 ? "-" : "+") + clock(Math.abs(diff)) + "   " + clock(seekTarget) + " / " + clock(len), 1200);
                    return true;
                }
                if (swipe == 0) {
                    if (Math.abs(moved) < dp(24) || Math.abs(moved) < Math.abs(across)) return false;
                    boolean right = e1.getX() > w / 2f;
                    swipe = right ? 1 : 2;
                    swipeStartY = e2.getY();
                    swipeStartValue = right ? volumeFraction() : brightness();
                }
                float delta = (swipeStartY - e2.getY()) / (ht * 0.7f);
                float v = Math.max(0f, Math.min(1f, swipeStartValue + delta));
                if (swipe == 1) setVolume(v); else setBrightness(v);
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                float x = e.getX(), w = video.getWidth();
                if (x < w * 0.35f) seekBy(-10_000);
                else if (x > w * 0.65f) seekBy(10_000);
                else togglePlay();
                return true;
            }
        });
    }

    private boolean hits(View v, MotionEvent ev) {
        if (v == null || v.getVisibility() != View.VISIBLE || !v.isShown()) return false;
        Rect r = new Rect();
        if (!v.getGlobalVisibleRect(r)) return false;
        return r.contains((int) ev.getRawX(), (int) ev.getRawY());
    }

    // Touches on the buttons, seek bar and pill go straight to them; everything else is a gesture on the video.
    @Override
    public boolean dispatchTouchEvent(MotionEvent ev) {
        if (pinch == null) return super.dispatchTouchEvent(ev);
        int a = ev.getActionMasked();
        if (a == MotionEvent.ACTION_DOWN) onControl = hits(topBar, ev) || hits(bottomBar, ev) || hits(centerRow, ev) || hits(pill, ev);
        if (onControl) {
            if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) onControl = false;
            return super.dispatchTouchEvent(ev);
        }
        pinch.onTouchEvent(ev);
        gestures.onTouchEvent(ev);
        if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) {
            if (swipe == 3 && a == MotionEvent.ACTION_UP && mp != null) { mp.setTime(seekTarget); runMs = 0; refreshBar(); }
            swipe = 0;
        }
        return true;
    }

    // Fill (the default) crops the picture's edges to cover the whole screen; Fit shows all of it with black bars.
    private boolean fill() { return getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("fill_screen", true); }
    private void setFill(boolean fill) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("fill_screen", fill).apply();
        applyScale();
        showPill(fill ? "Fill screen" : "Fit to screen", 1000);
    }
    // Only works once the view is attached (VLC ignores it before), so it runs on attach, on resize and on pinch.
    private void applyScale() {
        if (mp == null || !attached) return;
        mp.setVideoScale(fill() ? MediaPlayer.ScaleType.SURFACE_FIT_SCREEN : MediaPlayer.ScaleType.SURFACE_BEST_FIT);
        mp.updateVideoSurfaces();
    }

    private float volumeFraction() {
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        return max > 0 ? audio.getStreamVolume(AudioManager.STREAM_MUSIC) / (float) max : 0f;
    }
    private void setVolume(float f) {
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        try { audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(f * max), 0); } catch (SecurityException ignored) { }
        showPill("🔊 " + Math.round(f * 100) + "%", 700);
    }
    private float brightness() {
        float b = getWindow().getAttributes().screenBrightness;
        if (b >= 0) return b;
        try { return android.provider.Settings.System.getInt(getContentResolver(), android.provider.Settings.System.SCREEN_BRIGHTNESS) / 255f; } catch (Exception e) { return 0.5f; }
    }
    private void setBrightness(float f) {
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = Math.max(0.01f, f);
        getWindow().setAttributes(lp);
        showPill("☀️ " + Math.round(f * 100) + "%", 700);
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

    private Uri uriOf(JSONObject it) { return ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, it.optLong("id")); }

    private void playAt(int i) {
        JSONObject it = queue.optJSONObject(i);
        if (it == null) { finish(); return; }
        if (started && i != idx) saveSpot();
        idx = i;
        introStart = introEnd = outroStart = -1;
        introDone = watchedSent = nextArmed = false;
        lastTickPos = -1; runMs = 0;
        nextCountdown = -1;
        hidePill();
        mp.stop();
        closeFile();
        try {
            pfd = getContentResolver().openFileDescriptor(uriOf(it), "r");
        } catch (Exception e) { openElsewhere(); return; }
        if (pfd == null) { openElsewhere(); return; }
        Media m = new Media(vlc, pfd.getFileDescriptor());
        m.setHWDecoderEnabled(true, false); // the phone's video chip when it can, VLC's own decoders when it can't
        long resume = getSharedPreferences(PREFS, MODE_PRIVATE).getLong("pos_" + it.optLong("id"), 0);
        if (resume > 30_000) m.addOption(":start-time=" + (resume / 1000.0));
        mp.setMedia(m);
        m.release();
        mp.play();
        started = true;
        String t = it.optString("t");
        title.setText(t);
        if (resume > 30_000) showPill("Resumed", 1200);
        else if (t.length() > 0) showPill(t, 2500);
        fetchSegments(it);
    }

    private void onVlcEvent(MediaPlayer.Event ev) {
        switch (ev.type) {
            case MediaPlayer.Event.EndReached: {
                if (runMs >= 60_000) markWatched();
                JSONObject it = queue.optJSONObject(idx);
                if (it != null) getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("pos_" + it.optLong("id")).apply();
                // Leave VLC's own callback before loading the next file.
                h.post(() -> { if (hasNext()) playAt(idx + 1); else finish(); });
                break;
            }
            case MediaPlayer.Event.EncounteredError:
                h.post(this::openElsewhere);
                break;
            case MediaPlayer.Event.Vout:
                h.post(this::applyScale);
                break;
            case MediaPlayer.Event.Playing:
            case MediaPlayer.Event.Paused:
            case MediaPlayer.Event.LengthChanged:
                if (controls.getVisibility() == View.VISIBLE) refreshBar();
                break;
            default:
        }
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
                    if (os < 0 && cr != null && cr.length() > 0) os = cr.getJSONObject(cr.length() - 1).optLong("start_ms", -1); // the END credits are the last entry
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
            if (mp != null && started && mp.getLength() > 0) {
                long pos = mp.getTime(), dur = mp.getLength();
                boolean playing = mp.isPlaying();
                if (!introDone && introStart >= 0 && introEnd > introStart && pos >= introStart - 300 && pos < introEnd - 1500) {
                    introDone = true;
                    mp.setTime(introEnd);
                    showPill("Intro skipped", 1500);
                }
                // A jump of more than 2.5 s between ticks is a seek: start counting real play again.
                if (playing) { if (lastTickPos >= 0 && Math.abs(pos - lastTickPos) > 2500) runMs = 0; else runMs += 500; }
                lastTickPos = pos;
                boolean outroOk = outroStart > 0 && outroStart > dur * 0.75;
                boolean credits = (outroOk && pos >= outroStart) || (!outroOk && dur - pos < 20_000);
                boolean reallyWatched = runMs >= 60_000;
                if (credits && reallyWatched) markWatched();
                if (credits && hasNext() && !nextArmed && playing) { nextArmed = true; nextCountdown = 8; lastCount = System.currentTimeMillis(); }
                if (pos > dur * 0.92 && reallyWatched) markWatched();
                if (System.currentTimeMillis() - lastSave > 5000) saveSpot();
                if (controls.getVisibility() == View.VISIBLE) refreshBar();
                if (nextCountdown >= 0 && playing) {
                    if (nextCountdown == 0) { nextCountdown = -1; playAt(idx + 1); }
                    else {
                        JSONObject nx = queue.optJSONObject(idx + 1);
                        showPill("Next: " + (nx == null ? "episode" : nx.optString("t", "episode")) + "  in " + nextCountdown + "   ·   tap to stay", 1100);
                        long t = System.currentTimeMillis();
                        if (t - lastCount >= 1000) { nextCountdown--; lastCount = t; }
                    }
                }
            }
            h.postDelayed(this, 500);
        }
    };

    private void saveSpot() {
        if (mp == null || !started) return;
        JSONObject it = queue.optJSONObject(idx);
        if (it == null) return;
        lastSave = System.currentTimeMillis();
        long pos = mp.getTime(), dur = mp.getLength();
        if (dur <= 0) return;
        SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
        if (dur - pos < 60_000) e.remove("pos_" + it.optLong("id")); else e.putLong("pos_" + it.optLong("id"), pos);
        e.apply();
        reportProgress(pos, dur, false);
    }

    // Where you are, for the Chill Room's "Continue Watching" (at most every 30 s, and when you leave).
    private void reportProgress(long pos, long dur, boolean force) {
        JSONObject it = queue.optJSONObject(idx);
        if (it == null || it.optString("k").isEmpty() || dur <= 0) return;
        long now = System.currentTimeMillis();
        if (!force && now - lastReport < 30_000) return;
        lastReport = now;
        final JSONObject body = new JSONObject();
        try { body.put("key", it.optString("k")); body.put("id", it.optLong("id")); body.put("pos", pos / 1000); body.put("dur", dur / 1000); body.put("progress", true); } catch (Exception ignored) { }
        new Thread(() -> SmsUploader.postJson(getApplicationContext(), URL_WATCHED, body)).start();
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

    // ── Sound: deep low end through VLC's equaliser (10 bands, 31 Hz … 16 kHz, in dB) ──
    private void attachSound() {
        if ("off".equals(sound)) return;
        boolean max = "max".equals(sound);
        try {
            MediaPlayer.Equalizer eq = MediaPlayer.Equalizer.create();
            for (int b = 0; b < MediaPlayer.Equalizer.getBandCount(); b++) {
                float hz = MediaPlayer.Equalizer.getBandFrequency(b);
                float db = hz <= 90 ? (max ? 9f : 6f) : hz <= 250 ? (max ? 6f : 4f) : hz <= 1000 ? -1f : hz <= 4000 ? 1f : 3f;
                eq.setAmp(b, db);
            }
            eq.setPreAmp(max ? 3f : 1f);
            mp.setEqualizer(eq);
        } catch (RuntimeException ignored) { }
    }

    // A file VLC itself can't open: hand it to another player instead.
    private void openElsewhere() {
        JSONObject it = queue.optJSONObject(idx);
        if (it == null) { finish(); return; }
        Toast.makeText(this, "Luxe's player can't open this file. Opening it in another player.", Toast.LENGTH_LONG).show();
        try {
            startActivity(Intent.createChooser(new Intent(Intent.ACTION_VIEW).setDataAndType(uriOf(it), "video/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Watch with"));
        } catch (RuntimeException ignored) { }
        finish();
    }

    private void closeFile() {
        try { if (pfd != null) pfd.close(); } catch (Exception ignored) { }
        pfd = null;
    }

    private void showPill(String text, long ms) {
        pill.setText(text);
        pill.setVisibility(View.VISIBLE);
        h.removeCallbacks(hide);
        h.postDelayed(hide, ms);
    }
    private final Runnable hide = this::hidePill;
    private void hidePill() { if (pill != null) pill.setVisibility(View.GONE); }

    private static String clock(long ms) {
        long t = Math.max(0, ms) / 1000, hh = t / 3600, mm = (t % 3600) / 60, ss = t % 60;
        return hh > 0 ? String.format(Locale.US, "%d:%02d:%02d", hh, mm, ss) : String.format(Locale.US, "%d:%02d", mm, ss);
    }

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

    // The video surface is attached while Luxe is on screen; the first episode starts once it is.
    @Override protected void onStart() {
        super.onStart();
        if (mp != null && !attached) { mp.attachViews(video, null, true, false); attached = true; applyScale(); }
        if (!started) playAt(0);
    }
    @Override protected void onResume() { super.onResume(); immersive(); }
    @Override protected void onPause() {
        super.onPause();
        if (mp != null) { lastReport = 0; saveSpot(); if (mp.isPlaying()) mp.pause(); }
    }
    @Override protected void onStop() {
        super.onStop();
        if (mp != null && attached) { mp.detachViews(); attached = false; }
    }
    @Override protected void onDestroy() {
        h.removeCallbacksAndMessages(null);
        saveSpot();
        if (mp != null) { mp.setEventListener(null); mp.stop(); mp.release(); mp = null; }
        if (vlc != null) { vlc.release(); vlc = null; }
        closeFile();
        super.onDestroy();
    }
}
