package com.chocle254.fedha;

import android.app.Notification;
import android.app.NotificationChannel;
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
    private static final Kind NESTLINK = new Kind("luxe_nestlink_v1", "NestLink withdrawals", new long[]{150, 90, 70, 90, 70, 380, 200, 380}, "sound_success", 0xFF22C55E, "💸", "NESTLINK · WITHDRAWAL");
    private static final Kind NESTLINK_FAIL = new Kind("luxe_nestlink_fail_v1", "NestLink problems", new long[]{150, 380, 180, 380}, "sound_alert", 0xFFEF4444, "⛔", "NESTLINK · WITHDRAWAL FAILED");
    private static final Kind UPESIPAY = new Kind("luxe_upesipay_v1", "UpesiPay low balance", new long[]{150, 260, 140, 260, 140, 260}, "sound_alert", 0xFFF59E0B, "⚠️", "UPESIPAY · LOW BALANCE");
    private static final Kind TRADE = new Kind("luxe_trade_v1", "Trades placed", new long[]{150, 180, 120, 180}, "sound_entry", 0xFF3B82F6, "🚀", "TRADE PLACED");
    private static final Kind TP = new Kind("luxe_tp_v1", "Take-profit hit", new long[]{150, 60, 60, 60, 60, 60}, "sound_success", 0xFF10B981, "🎯", "TAKE PROFIT");
    private static final Kind SL = new Kind("luxe_sl_v1", "Stop-loss hit", new long[]{150, 380, 180, 380}, "sound_alert", 0xFFEF4444, "🛑", "STOP LOSS");
    private static final Kind PLANNER = new Kind("luxe_planner_v1", "Planner reminders", new long[]{150, 100}, "sound_planner", 0xFF8B5CF6, "🗓️", "PLANNER");
    private static final Kind OTHER = new Kind("luxe_jarvis_v1", "Jarvis and other", new long[]{150, 100}, "sound_jarvis", 0xFF64748B, "🔔", "JARVIS");

    // Every earlier channel (sounds and buzzes are fixed per channel, so changes get new ids).
    private static final String OLD_PREFIX = "fedha_";

    // Titles and tags come from the site (lib/trading.js, lib/broker.js, lib/nestlink-*.js, lib/upesipay-alert.js, the planner).
    static Kind kindOf(String tag, String title) {
        String g = tag == null ? "" : tag;
        String t = title == null ? "" : title;
        if (g.contains("upesipay") || t.startsWith("UpesiPay")) return UPESIPAY;
        if (t.startsWith("Withdrawal failed") || g.contains("nestlink-missing") || (g.contains("nestlink") && t.startsWith("Wallet"))) return NESTLINK_FAIL;
        if (g.contains("nestlink") || t.startsWith("Funds withdrawn")) return NESTLINK;
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
        for (Kind k : new Kind[]{NESTLINK, NESTLINK_FAIL, UPESIPAY, TRADE, TP, SL, PLANNER, OTHER}) {
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
        Kind kind = kindOf(platformTag, title == null ? null : title.toString());

        // Styled layouts inside Android's own frame (app name, time and actions stay system-drawn):
        // accent stripe and badge in the kind's colour, a small label, bold title, the message below.
        Bitmap icon = badge(kind);
        String t = title == null ? "" : stripLeadingEmoji(title.toString());
        String body = text == null ? "" : text.toString();
        String label = kind == OTHER && !(title != null && title.toString().startsWith("🤖")) ? "LUXE" : kind.label;

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
        if (kind == NESTLINK || kind == NESTLINK_FAIL || kind == UPESIPAY) b.setCategory(Notification.CATEGORY_STATUS);

        try {
            nm.notify(platformTag, platformId, b.build());
        } catch (RuntimeException e) {
            // Anything odd in the restyle: fall back to Chrome's original notification on our channel.
            nm.notify(platformTag, platformId, Notification.Builder.recoverBuilder(this, notification).setChannelId(kind.id).build());
        }
        return true;
    }
}
