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

import com.google.androidbrowserhelper.trusted.DelegationService;

// Chrome hands every Fedha web notification to this app to show. We sort each one into its own Android
// channel (own buzz + own sound), and restyle it: accent colour, a coloured badge, and the full message text.
// Chrome ignores a website's vibration pattern and sound, which is why this lives in the app.
public class FedhaDelegationService extends DelegationService {

    private static final class Kind {
        final String id, name, sound, badge;
        final long[] pattern;
        final int color;
        Kind(String id, String name, long[] pattern, String sound, int color, String badge) {
            this.id = id; this.name = name; this.pattern = pattern; this.sound = sound; this.color = color; this.badge = badge;
        }
    }

    // Patterns in milliseconds: wait, buzz, pause, buzz, ... The 150 ms wait lets the sound start before the motor. Sounds are res/raw/*.wav (android/tools/make-sounds.mjs),
    // shared by kind of news: success (TP, NestLink), alert (SL, UpesiPay), gentle (planner, Jarvis), entry (trades).
    // A channel's sound and buzz are fixed once created, so changing either means a new id (and deleting the old).
    private static final Kind NESTLINK = new Kind("fedha_nestlink_v5", "NestLink withdrawals", new long[]{150, 90, 70, 90, 70, 380, 200, 380}, "sound_success", 0xFF22C55E, "💸");
    private static final Kind UPESIPAY = new Kind("fedha_upesipay_v4", "UpesiPay low balance", new long[]{150, 260, 140, 260, 140, 260}, "sound_alert", 0xFFF59E0B, "⚠️");
    private static final Kind TRADE = new Kind("fedha_trade_v4", "Trades entered", new long[]{150, 180, 120, 180}, "sound_entry", 0xFF3B82F6, "🚀");
    private static final Kind TP = new Kind("fedha_tp_v4", "Take-profit hit", new long[]{150, 60, 60, 60, 60, 60}, "sound_success", 0xFF10B981, "🎯");
    private static final Kind SL = new Kind("fedha_sl_v4", "Stop-loss hit", new long[]{150, 380, 180, 380}, "sound_alert", 0xFFEF4444, "🛑");
    private static final Kind PLANNER = new Kind("fedha_planner_v4", "Planner reminders", new long[]{150, 100}, "sound_gentle", 0xFF8B5CF6, "🗓️");
    private static final Kind OTHER = new Kind("fedha_other_v4", "Jarvis and other", new long[]{150, 100}, "sound_gentle", 0xFF64748B, "🔔");

    private static final String[] OLD_CHANNELS = {
        "fedha_nestlink_v1", "fedha_nestlink_v2", "fedha_upesipay_v1", "fedha_trade_v1", "fedha_tp_v1",
        "fedha_sl_v1", "fedha_planner_v1", "fedha_other_v1", "fedha_nestlink_v3", "fedha_upesipay_v2",
        "fedha_trade_v2", "fedha_tp_v2", "fedha_sl_v2", "fedha_planner_v2", "fedha_other_v2",
        "fedha_nestlink_v4", "fedha_upesipay_v3", "fedha_trade_v3", "fedha_tp_v3", "fedha_sl_v3", "fedha_planner_v3", "fedha_other_v3"
    };

    // Titles and tags come from the site (lib/trading.js, lib/broker.js, lib/nestlink-*.js, lib/upesipay-alert.js, the planner).
    static Kind kindOf(String tag, String title) {
        String g = tag == null ? "" : tag;
        String t = title == null ? "" : title;
        if (g.contains("upesipay") || t.startsWith("UpesiPay")) return UPESIPAY;
        if (g.contains("nestlink") || t.startsWith("Funds withdrawn") || t.startsWith("Withdrawal failed")) return NESTLINK;
        if (g.contains("block_") || g.contains("meal_") || g.contains("missed_blocks")) return PLANNER;
        if (t.startsWith("🛑")) return SL;
        if (t.startsWith("🎯") || t.startsWith("✅")) return TP;
        if (t.startsWith("🚀") || t.startsWith("📥") || t.startsWith("⏳") || t.startsWith("💰") || t.startsWith("🧪")) return TRADE;
        if (t.startsWith("🤖") || t.startsWith("⌛") || t.startsWith("✖")) return OTHER;
        return PLANNER;
    }

    private void ensureChannels(NotificationManager nm) {
        for (String old : OLD_CHANNELS) nm.deleteNotificationChannel(old);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        for (Kind k : new Kind[]{NESTLINK, UPESIPAY, TRADE, TP, SL, PLANNER, OTHER}) {
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

        Notification.Builder b = Notification.Builder.recoverBuilder(this, notification)
                .setChannelId(kind.id)
                .setColor(kind.color)
                .setLargeIcon(badge(kind))
                .setShowWhen(true);
        if (text != null) b.setStyle(new Notification.BigTextStyle().bigText(text).setBigContentTitle(title));
        if (kind == NESTLINK || kind == UPESIPAY) b.setCategory(Notification.CATEGORY_STATUS);

        try {
            nm.notify(platformTag, platformId, b.build());
        } catch (RuntimeException e) {
            // Anything odd in the restyle: fall back to Chrome's original notification on our channel.
            nm.notify(platformTag, platformId, Notification.Builder.recoverBuilder(this, notification).setChannelId(kind.id).build());
        }
        return true;
    }
}
