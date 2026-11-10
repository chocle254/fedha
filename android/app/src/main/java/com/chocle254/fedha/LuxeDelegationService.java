package com.chocle254.fedha;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.os.SystemClock;
import android.text.format.DateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import android.widget.RemoteViews;

import com.google.androidbrowserhelper.trusted.DelegationService;

// Chrome hands every Luxe web notification to this app to show. We sort each one into its own Android
// channel (own buzz + own sound), and restyle it: accent colour, a coloured badge, and the full message text.
// Chrome ignores a website's vibration pattern and sound, which is why this lives in the app.
public class LuxeDelegationService extends DelegationService {

    private static final class Kind {
        final String id, name, sound, badge, label;
        String bg() { return "bg_" + id.replaceAll("^luxe_|_v\\d+$", "").replace("nestlink_fail", "sl").replace("jarvis", "other"); } // drawable/bg_<kind>.xml
        final long[] pattern;
        final int color;
        Kind(String id, String name, long[] pattern, String sound, int color, String badge, String label) {
            this.id = id; this.name = name; this.pattern = pattern; this.sound = sound; this.color = color; this.badge = badge; this.label = label;
        }
    }

    // Patterns in milliseconds: wait, buzz, pause, buzz, ... The 150 ms wait lets the sound start before the motor. Sounds are res/raw/*.wav (android/tools/make-sounds.mjs),
    // chosen in android/tools/app-sounds.mjs: success (TP, NestLink), alert (SL, UpesiPay, NestLink failed),
    // planner, jarvis (and other), entry (trades).
    // A channel's sound and buzz are fixed once created, so changing either means a new id (and deleting the old).
    private static final Kind NESTLINK = new Kind("luxe_nestlink_v2", "NestLink withdrawals", new long[]{150, 90, 70, 90, 70, 380, 200, 380}, "s2_money", 0xFF22C55E, "💸", "NESTLINK · WITHDRAWAL");
    private static final Kind NESTLINK_FAIL = new Kind("luxe_nestlink_fail_v2", "NestLink problems", new long[]{150, 380, 180, 380}, "s2_alert", 0xFFEF4444, "⛔", "NESTLINK · WITHDRAWAL FAILED");
    private static final Kind UPESIPAY = new Kind("luxe_upesipay_v2", "UpesiPay low balance", new long[]{150, 260, 140, 260, 140, 260}, "s2_alert", 0xFFF59E0B, "⚠️", "UPESIPAY · LOW BALANCE");
    private static final Kind TRADE = new Kind("luxe_trade_v2", "Trades placed", new long[]{150, 180, 120, 180}, "s2_trade", 0xFF3B82F6, "🚀", "TRADE PLACED");
    private static final Kind TP = new Kind("luxe_tp_v2", "Take-profit hit", new long[]{150, 60, 60, 60, 60, 60}, "s2_win", 0xFF10B981, "🎯", "TAKE PROFIT");
    private static final Kind SL = new Kind("luxe_sl_v2", "Stop-loss hit", new long[]{150, 380, 180, 380}, "s2_loss", 0xFFEF4444, "🛑", "STOP LOSS");
    private static final Kind PLANNER = new Kind("luxe_planner_v2", "Planner reminders", new long[]{150, 100}, "s2_planner", 0xFF8B5CF6, "🗓️", "PLANNER");
    private static final Kind MONEY = new Kind("luxe_money_v2", "Money in", new long[]{150, 90, 70, 90, 70, 380, 200, 380}, "s2_money", 0xFF22C55E, "💰", "MONEY IN");
    private static final Kind OTHER = new Kind("luxe_jarvis_v2", "Jarvis and other", new long[]{150, 100}, "s2_luxe", 0xFF64748B, "🔔", "JARVIS");

    // Holiday looks and sounds (android/tools/holiday-sounds.mjs, drawable/bg_h_*.xml). On the day, everyday
    // notifications (planner, money in, Jarvis and other) wear the holiday: its own channel, sound, colour, badge
    // and background. Trading and withdrawal alerts keep their usual sounds so they are never missed.
    private static final Kind H_HALLOWEEN = new Kind("luxe_h_halloween_v1", "Halloween", new long[]{150, 420, 160, 120, 90, 120}, "sound_h_halloween", 0xFF8B5CF6, "🦇", "HALLOWEEN");
    private static final Kind H_CHRISTMAS = new Kind("luxe_h_christmas_v1", "Christmas", new long[]{150, 70, 60, 70, 60, 70, 160, 70, 60, 70, 60, 70}, "sound_h_christmas", 0xFFEF4444, "🎄", "CHRISTMAS");
    private static final Kind H_BIRTHDAY = new Kind("luxe_h_birthday_v1", "Your birthday", new long[]{150, 90, 80, 90, 80, 220, 120, 260}, "sound_h_birthday", 0xFFEC4899, "🎂", "BIRTHDAY");
    private static final Kind H_VICE = new Kind("luxe_h_vice_v1", "Vice Nights (GTA VI countdown)", new long[]{150, 80, 70, 80, 70, 80, 70, 240}, "sound_h_vice", 0xFFFF2E88, "🌴", "VICE NIGHTS");
    private static final Kind H_NEWYEAR = new Kind("luxe_h_newyear_v1", "New Year", new long[]{150, 60, 50, 60, 50, 420}, "sound_h_newyear", 0xFFFBBF24, "🎆", "NEW YEAR");

    // Same dates as the site's lib/holidays.js (birthday: 5 December).
    static Kind holidayToday() {
        Calendar c = Calendar.getInstance();
        int m = c.get(Calendar.MONTH) + 1, d = c.get(Calendar.DAY_OF_MONTH);
        if (m == 12 && d == 5) return H_BIRTHDAY;
        if ((m == 12 && d == 31) || (m == 1 && d <= 2)) return H_NEWYEAR;
        if (m == 12 && d >= 20 && d <= 26) return H_CHRISTMAS;
        if (m == 10 && (d == 30 || d == 31)) return H_HALLOWEEN;
        // Vice Nights: until GTA VI's announced release day (19 Nov 2026), gone the day after. Same as lib/holidays.js.
        if (c.get(Calendar.YEAR) == 2026 && ((m == 10 && d == 31) || (m == 11 && d <= 19))) return H_VICE;
        return null;
    }

    // The pinned planner card: silent (no sound, no buzz) because the block's own reminder already alerts.
    // v2: the live card is now THE planner notification (sound + buzz once per new block); v1 was silent.
    private static final String LIVE_CHANNEL = "luxe_planner_live_v3"; // v3: the new planner sound
    private static final String LIVE_PREFS = "luxe_live";
    private static final String LIVE_TAG = "luxe_planner_live";
    // Sent by supabase/functions/send-reminders at each block start: planner_live~<startMs>~<endMs>~<n>~<total>.
    private static final Pattern LIVE = Pattern.compile("planner_live~(\\d+)~(\\d+)~(\\d+)~(\\d+)");

    // When Luxe draws its own pop-up (LuxeOverlay), the shade copy goes here: quiet, so the phone's pop-up doesn't
    // appear on top of Luxe's. Luxe plays the sound and buzz itself.
    private static final String SHADE_CHANNEL = "luxe_shade_v1";

    // Every earlier channel (sounds and buzzes are fixed per channel, so changes get new ids).
    private static final String OLD_PREFIX = "fedha_";
    // v2 (Nov 2026): the new sound family (res/raw/s2_*.wav, the same files as the site's public/sounds/x-*.wav,
    // made by fedha/scripts/make-sounds.py). The v1 channels held the old sounds, so they are removed.
    private static final String[] OLD_IDS = {"luxe_nestlink_v1", "luxe_nestlink_fail_v1", "luxe_upesipay_v1", "luxe_trade_v1", "luxe_tp_v1", "luxe_sl_v1", "luxe_planner_v1", "luxe_money_v1", "luxe_jarvis_v1", "luxe_planner_live_v1", "luxe_planner_live_v2"};

    // Titles and tags come from the site (lib/trading.js, lib/broker.js, lib/nestlink-*.js, lib/upesipay-alert.js, the planner).
    static Kind kindOf(String tag, String title) {
        String g = tag == null ? "" : tag;
        String t = title == null ? "" : title;
        if (g.contains("upesipay") || t.startsWith("UpesiPay")) return UPESIPAY;
        if (t.startsWith("Withdrawal failed") || g.contains("nestlink-missing") || (g.contains("nestlink") && t.startsWith("Wallet"))) return NESTLINK_FAIL;
        if (g.contains("nestlink") || t.startsWith("Funds withdrawn")) return NESTLINK;
        // Money in: earnings milestones (earn-*) and customer payments (startup-pay-*) get the success sound.
        if (g.contains("earn-") || g.contains("startup-pay")) return MONEY;
        // M-Pesa messages recorded by Luxe: money in gets the success sound, the rest the quiet one.
        if (g.contains("sms-in-")) return MONEY;
        if (g.contains("sms-ask-") || g.contains("sms-")) return OTHER;
        if (g.contains("block_") || g.contains("meal_") || g.contains("missed_blocks") || g.contains("break")
                || g.contains("planner_active")) return PLANNER;
        if (t.startsWith("🛑")) return SL;
        if (t.startsWith("🎯") || t.startsWith("✅")) return TP;
        if (t.startsWith("🚀") || t.startsWith("📥") || t.startsWith("⏳") || t.startsWith("💰") || t.startsWith("🧪") || t.startsWith("📰")) return TRADE;
        if (t.startsWith("🤖") || t.startsWith("⌛") || t.startsWith("✖")) return OTHER;
        return PLANNER;
    }

    private void ensureChannels(NotificationManager nm) {
        for (NotificationChannel old : nm.getNotificationChannels()) {
            if (old.getId().startsWith(OLD_PREFIX)) nm.deleteNotificationChannel(old.getId());
        }
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        for (Kind k : new Kind[]{NESTLINK, NESTLINK_FAIL, UPESIPAY, TRADE, TP, SL, PLANNER, MONEY, OTHER, H_HALLOWEEN, H_CHRISTMAS, H_BIRTHDAY, H_NEWYEAR, H_VICE}) {
            if (nm.getNotificationChannel(k.id) != null) continue;
            NotificationChannel ch = new NotificationChannel(k.id, k.name, NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setVibrationPattern(k.pattern);
            ch.enableLights(true);
            ch.setLightColor(k.color);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            // By name, not resource number, so a rebuilt APK with new sound files keeps pointing at the right one.
            if (k.sound != null) ch.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/" + k.sound), audio);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(SHADE_CHANNEL) == null) {
            NotificationChannel shade = new NotificationChannel(SHADE_CHANNEL, "Luxe (shown as Luxe's own pop-up)", NotificationManager.IMPORTANCE_LOW);
            shade.setSound(null, null);
            shade.enableVibration(false);
            shade.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(shade);
        }
        for (String gone : OLD_IDS) if (nm.getNotificationChannel(gone) != null) nm.deleteNotificationChannel(gone);
        if (nm.getNotificationChannel(LIVE_CHANNEL) == null) {
            NotificationChannel live = new NotificationChannel(LIVE_CHANNEL, "Planner (live card)", NotificationManager.IMPORTANCE_HIGH);
            AudioAttributes a = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            live.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/" + PLANNER.sound), a);
            live.enableVibration(true);
            live.setVibrationPattern(PLANNER.pattern);
            live.setShowBadge(false);
            live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(live);
        }
    }

    // One ongoing card in the drawer for the block running now: a countdown that Android ticks by itself, the day's
    // progress as a bar, and the next block. Every new block replaces it (same tag and id), so it never stacks up.
    private boolean showLive(NotificationManager nm, Matcher m, Notification original, CharSequence title, CharSequence text) {
        long end = Long.parseLong(m.group(2));
        int n = Integer.parseInt(m.group(3));
        int total = Integer.parseInt(m.group(4));
        long now = System.currentTimeMillis();
        String t = title == null ? "Planner" : title.toString();

        // Labelled countdown ("14:30 left · ends 10:45 PM") instead of a bare timer that reads like a clock time.
        RemoteViews v = new RemoteViews(getPackageName(), R.layout.notif_live);
        v.setTextViewText(R.id.title, t);
        v.setTextViewText(R.id.next, text == null ? "" : text);
        v.setProgressBar(R.id.progress, Math.max(total, 1), Math.min(n, total), false);
        if (end > now) {
            v.setChronometer(R.id.timer, SystemClock.elapsedRealtime() + (end - now), "⏱ %s left", true);
            v.setChronometerCountDown(R.id.timer, true);
            v.setTextViewText(R.id.ends, "· ends " + DateFormat.getTimeFormat(this).format(new Date(end)));
        } else {
            v.setViewVisibility(R.id.timer, android.view.View.GONE);
            v.setTextViewText(R.id.ends, "Last block today");
        }

        Notification.Builder b = new Notification.Builder(this, LIVE_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setLargeIcon(badge(PLANNER))
                .setColor(PLANNER.color)
                .setContentTitle(t)
                .setContentText(text == null ? "" : text)
                .setSubText("Block " + n + " of " + total)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setCustomContentView(v)
                .setCustomBigContentView(v)
                .setCustomHeadsUpContentView(v)
                .setOngoing(true)
                .setOnlyAlertOnce(false) // one sound at each new block (each block is one post)
                .setShowWhen(false)
                .setCategory(Notification.CATEGORY_REMINDER)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setContentIntent(original.contentIntent)
                .setDeleteIntent(original.deleteIntent)
                .setTimeoutAfter(end > now ? end - now + 60_000 : 3 * 60 * 60_000L);
        nm.notify(LIVE_TAG, 1, b.build());
        getSharedPreferences(LIVE_PREFS, MODE_PRIVATE).edit().putLong("at", now).apply();
        // A block reminder that got here first (e.g. from the open app) is now a duplicate: clear it.
        try {
            for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                if (isBlockStart(sbn.getTag())) nm.cancel(sbn.getTag(), sbn.getId());
            }
        } catch (RuntimeException ignored) { }
        return true;
    }

    // A block-start reminder ("block_<id>", from the server or the open app) that the live card already covers.
    // Warnings (5 minutes before, wind down, leave for school) still show on their own.
    private static boolean isBlockStart(String tag) {
        String g = tag == null ? "" : tag;
        return g.contains("block_") && !g.contains("block_5min") && !g.contains("sleep_warn") && !g.contains("block_walk") && !g.contains("planner_live");
    }

    private boolean coveredByLive(String tag) {
        if (!isBlockStart(tag)) return false;
        long at = getSharedPreferences(LIVE_PREFS, MODE_PRIVATE).getLong("at", 0);
        return System.currentTimeMillis() - at < 3 * 60_000L;
    }


    // The phone is on and unlocked (someone is looking at it), so a pop-up over the open app makes sense.
    private boolean inUse() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        return pm != null && pm.isInteractive() && (km == null || !km.isKeyguardLocked());
    }

    // A round badge in the kind's colour with its emoji, shown as the notification's large icon.
    private Bitmap badge(Kind k) {
        int size = (int) (64 * getResources().getDisplayMetrics().density);
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG);
        bg.setColor(k.color);
        c.drawCircle(size / 2f, size / 2f, size / 2f, bg);
        Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
        ring.setColor(Color.argb(60, 255, 255, 255));
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(size * 0.05f);
        c.drawCircle(size / 2f, size / 2f, size * 0.42f, ring);
        Paint emoji = new Paint(Paint.ANTI_ALIAS_FLAG);
        emoji.setTextSize(size * 0.48f);
        emoji.setTextAlign(Paint.Align.CENTER);
        emoji.setTypeface(Typeface.DEFAULT);
        Paint.FontMetrics fm = emoji.getFontMetrics();
        c.drawText(k.badge, size / 2f, size / 2f - (fm.ascent + fm.descent) / 2f, emoji);
        return bmp;
    }

    private RemoteViews bigView(Kind kind, Bitmap icon, String label, String title, String body, int lines) {
        RemoteViews v = new RemoteViews(getPackageName(), R.layout.notif_big);
        v.setInt(R.id.accent, "setColorFilter", kind.color);
        int bgRes = getResources().getIdentifier(kind.bg(), "drawable", getPackageName());
        if (bgRes != 0) v.setInt(R.id.root, "setBackgroundResource", bgRes);
        v.setImageViewBitmap(R.id.badge, icon);
        v.setTextViewText(R.id.label, label);
        v.setTextColor(R.id.label, kind.color);
        v.setTextViewText(R.id.title, title);
        v.setTextViewText(R.id.body, body);
        v.setInt(R.id.body, "setMaxLines", lines);
        return v;
    }

    // The badge already shows the emoji, so drop it from the start of the title ("🎯 XAUUSD short TP1 hit" -> "XAUUSD short TP1 hit").
    static String stripLeadingEmoji(String s) {
        int i = 0;
        while (i < s.length()) {
            int cp = s.codePointAt(i);
            boolean emoji = Character.getType(cp) == Character.OTHER_SYMBOL || cp == 0xFE0F || cp == 0x200D || Character.isSurrogate(s.charAt(i))
                    || (cp >= 0x1F000 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF);
            if (!emoji && !Character.isWhitespace(cp)) break;
            i += Character.charCount(cp);
        }
        return i < s.length() ? s.substring(i) : s;
    }

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId, Notification notification, String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        ensureChannels(nm);

        CharSequence title = notification.extras != null ? notification.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        CharSequence text = notification.extras != null ? notification.extras.getCharSequence(Notification.EXTRA_TEXT) : null;
        Matcher live = LIVE.matcher(platformTag == null ? "" : platformTag);
        if (live.find()) {
            try { return showLive(nm, live, notification, title, text); }
            catch (RuntimeException e) { /* fall through and show it as a normal planner notification */ }
        }
        Kind kind = kindOf(platformTag, title == null ? null : title.toString());
        if (kind == PLANNER && coveredByLive(platformTag)) return true; // the live card already shows this block

        // Styled layouts inside Android's own frame (app name, time and actions stay system-drawn):
        // accent stripe and badge in the kind's colour, a small label, bold title, the message below.
        Bitmap icon = badge(kind);
        String t = title == null ? "" : stripLeadingEmoji(title.toString());
        String body = text == null ? "" : text.toString();
        String label = kind == OTHER && !(title != null && title.toString().startsWith("🤖")) ? "LUXE" : kind.label;
        Kind base = kind; // the real kind, for its rules below
        Kind holiday = holidayToday();
        if (holiday != null && (kind == PLANNER || kind == MONEY || kind == OTHER)) {
            label = holiday.label + " · " + label;
            kind = holiday;
            icon = badge(kind);
        }

        RemoteViews small = new RemoteViews(getPackageName(), R.layout.notif_small);
        small.setInt(R.id.accent, "setColorFilter", kind.color);
        int bgRes = getResources().getIdentifier(kind.bg(), "drawable", getPackageName());
        if (bgRes != 0) small.setInt(R.id.root, "setBackgroundResource", bgRes);
        small.setImageViewBitmap(R.id.badge, icon);
        small.setTextViewText(R.id.title, t);
        small.setTextViewText(R.id.body, body);

        RemoteViews popup = bigView(kind, icon, label, t, body, 2);
        RemoteViews expanded = bigView(kind, icon, label, t, body, 10);

        Notification.Builder b = Notification.Builder.recoverBuilder(this, notification)
                .setChannelId(kind.id)
                .setColor(kind.color)
                .setLargeIcon(icon)
                .setShowWhen(true)
                .setStyle(new Notification.DecoratedCustomViewStyle())
                .setCustomContentView(small)
                .setCustomHeadsUpContentView(popup)
                .setCustomBigContentView(expanded);
        if (base == NESTLINK || base == NESTLINK_FAIL || base == UPESIPAY || base == MONEY) b.setCategory(Notification.CATEGORY_STATUS);
        // Block reminders clear themselves after 10 minutes: the pinned live card carries the plan from there.
        if (base == PLANNER && platformTag != null && platformTag.contains("block_")) b.setTimeoutAfter(10 * 60_000L);

        // Luxe's own pop-up when the phone is in use and "Display over other apps" is on; the system's otherwise
        // (locked screen, or permission off). "~quiet" pushes arrive while Luxe is open and already showed its banner.
        boolean quiet = platformTag != null && platformTag.contains("~quiet");
        boolean overlay = !quiet && LuxeOverlay.allowed(this) && inUse();
        String channel = overlay || quiet ? SHADE_CHANNEL : kind.id;
        b.setChannelId(channel);

        try {
            nm.notify(platformTag, platformId, b.build());
        } catch (RuntimeException e) {
            // Anything odd in the restyle: fall back to Chrome's original notification on our channel.
            nm.notify(platformTag, platformId, Notification.Builder.recoverBuilder(this, notification).setChannelId(channel).build());
        }
        if (overlay) {
            Uri sound = kind.sound == null ? null : Uri.parse("android.resource://" + getPackageName() + "/raw/" + kind.sound);
            LuxeOverlay.show(this, kind.color, label, t, body, icon, sound, kind.pattern, notification.contentIntent, base == PLANNER ? 6000 : 6500);
        }
        return true;
    }
}
