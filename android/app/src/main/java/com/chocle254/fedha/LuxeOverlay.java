package com.chocle254.fedha;

import android.animation.ObjectAnimator;
import android.annotation.SuppressLint;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.ImageView;
import android.widget.TextView;

// Luxe's own pop-up banner, drawn over whatever app is open (needs "Display over other apps"). No system
// styling at all: a rounded card in the kind's (or holiday's) colours, a glowing badge, a small label, the title
// and message, and a bar that runs down until it slides away. Swipe it up to dismiss, tap it to open Luxe.
// It plays the kind's sound and buzz itself (respecting silent, vibrate and Do Not Disturb), because the copy in
// the notification shade goes to a quiet channel so the phone's own pop-up doesn't appear on top.
public final class LuxeOverlay {
    private static View current;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private LuxeOverlay() { }

    public static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Settings.canDrawOverlays(c);
    }

    public static void show(Context ctx, int color, String label, String title, String body, Bitmap badge,
                            Uri sound, long[] pattern, PendingIntent open, long millis) {
        final Context app = ctx.getApplicationContext();
        MAIN.post(() -> {
            try { draw(app, color, label, title, body, badge, open, millis); } catch (RuntimeException ignored) { }
            alert(app, sound, pattern);
        });
    }

    @SuppressLint({"InflateParams", "ClickableViewAccessibility"})
    private static void draw(Context app, int color, String label, String title, String body, Bitmap badge, PendingIntent open, long millis) {
        WindowManager wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;
        if (current != null) { try { wm.removeView(current); } catch (RuntimeException ignored) { } current = null; }

        View root = LayoutInflater.from(app).inflate(R.layout.overlay_banner, null);
        View card = root.findViewById(R.id.card);
        float dp = app.getResources().getDisplayMetrics().density;

        // The card: deep tinted glass in the kind's colour, a fine coloured edge.
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{mix(color, 0xFF0B0C12, 0.30f), 0xF20B0C12, 0xF5070709});
        bg.setCornerRadius(22 * dp);
        bg.setStroke(Math.max(1, Math.round(dp)), Color.argb(150, Color.red(color), Color.green(color), Color.blue(color)));
        card.setBackground(bg);
        card.setClipToOutline(true);

        ((ImageView) root.findViewById(R.id.badge)).setImageBitmap(badge);
        TextView l = root.findViewById(R.id.label);
        l.setText(label);
        l.setTextColor(lighten(color));
        ((TextView) root.findViewById(R.id.title)).setText(title);
        TextView b = root.findViewById(R.id.body);
        b.setText(body);
        b.setVisibility(body == null || body.isEmpty() ? View.GONE : View.VISIBLE);

        View timer = root.findViewById(R.id.timer);
        GradientDrawable bar = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{color, lighten(color)});
        timer.setBackground(bar);
        timer.setPivotX(0);

        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP;
        lp.y = statusBar(app);
        wm.addView(root, lp);
        current = root;

        // Slide in with a little overshoot, then the timer bar runs down.
        card.setTranslationY(-220 * dp);
        card.setAlpha(0f);
        card.animate().translationY(0).alpha(1f).setDuration(420).setInterpolator(new OvershootInterpolator(1.1f)).start();
        ObjectAnimator run = ObjectAnimator.ofFloat(timer, "scaleX", 1f, 0f);
        run.setDuration(millis);
        run.setInterpolator(new LinearInterpolator());
        run.start();

        final View me = root;
        final Runnable hide = () -> dismiss(wm, me, card);
        MAIN.postDelayed(hide, millis);

        final float[] startY = {0};
        final boolean[] moved = {false};
        root.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: startY[0] = e.getRawY(); moved[0] = false; run.pause(); return true;
                case MotionEvent.ACTION_MOVE: {
                    float dy = Math.min(0, e.getRawY() - startY[0]);
                    if (Math.abs(dy) > 8 * dp) moved[0] = true;
                    card.setTranslationY(dy);
                    return true;
                }
                case MotionEvent.ACTION_UP:
                    if (card.getTranslationY() < -40 * dp) { MAIN.removeCallbacks(hide); dismiss(wm, me, card); }
                    else if (!moved[0]) { MAIN.removeCallbacks(hide); try { if (open != null) open.send(); } catch (PendingIntent.CanceledException ignored) { } dismiss(wm, me, card); }
                    else { card.animate().translationY(0).setDuration(200).start(); run.resume(); }
                    return true;
                case MotionEvent.ACTION_OUTSIDE: return false;
                default: return false;
            }
        });
    }

    private static void dismiss(WindowManager wm, View root, View card) {
        float dp = root.getResources().getDisplayMetrics().density;
        card.animate().translationY(-220 * dp).alpha(0f).setDuration(260).setInterpolator(new AccelerateInterpolator()).withEndAction(() -> {
            try { wm.removeView(root); } catch (RuntimeException ignored) { }
            if (current == root) current = null;
        }).start();
    }

    // The kind's sound and buzz, unless the phone is on silent / vibrate or Do Not Disturb is on.
    private static void alert(Context app, Uri sound, long[] pattern) {
        AudioManager am = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean dnd = nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL;
        int mode = am == null ? AudioManager.RINGER_MODE_NORMAL : am.getRingerMode();
        if (dnd) return;
        if (mode != AudioManager.RINGER_MODE_SILENT && pattern != null) {
            Vibrator vib = (Vibrator) app.getSystemService(Context.VIBRATOR_SERVICE);
            try { if (vib != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vib.vibrate(VibrationEffect.createWaveform(pattern, -1)); } catch (RuntimeException ignored) { }
        }
        if (mode == AudioManager.RINGER_MODE_NORMAL && sound != null) {
            try {
                MediaPlayer mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                mp.setDataSource(app, sound);
                mp.setOnCompletionListener(MediaPlayer::release);
                mp.setOnErrorListener((p, w, x) -> { p.release(); return true; });
                mp.setOnPreparedListener(MediaPlayer::start);
                mp.prepareAsync();
            } catch (Exception ignored) { }
        }
    }

    private static int statusBar(Context c) {
        int id = c.getResources().getIdentifier("status_bar_height", "dimen", "android");
        return id > 0 ? c.getResources().getDimensionPixelSize(id) : 0;
    }
    private static int mix(int a, int b, float t) {
        return Color.argb(255, (int) (Color.red(a) * t + Color.red(b) * (1 - t)), (int) (Color.green(a) * t + Color.green(b) * (1 - t)), (int) (Color.blue(a) * t + Color.blue(b) * (1 - t)));
    }
    private static int lighten(int c) {
        return Color.argb(255, Math.min(255, Color.red(c) + 70), Math.min(255, Color.green(c) + 70), Math.min(255, Color.blue(c) + 70));
    }
}
