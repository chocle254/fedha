package com.chocle254.fedha;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

import com.google.androidbrowserhelper.trusted.DelegationService;

// Chrome hands every Fedha web notification to this app to show. We sort each one into its own
// Android channel so each kind buzzes differently. (Chrome ignores a website's vibration pattern.)
public class FedhaDelegationService extends DelegationService {

    // Patterns in milliseconds: wait, buzz, pause, buzz, ...
    // Most important: money left NestLink. Longest, most distinct pattern.
    private static final Kind NESTLINK = new Kind("fedha_nestlink_v2", "NestLink withdrawals", new long[]{0, 100, 80, 100, 80, 700, 300, 700});
    // Important: UpesiPay service wallet below KES 8.
    private static final Kind UPESIPAY = new Kind("fedha_upesipay_v1", "UpesiPay low balance", new long[]{0, 400, 150, 400, 150, 400});
    private static final Kind TRADE = new Kind("fedha_trade_v1", "Trades entered", new long[]{0, 250, 150, 250});
    private static final Kind TP = new Kind("fedha_tp_v1", "Take-profit hit", new long[]{0, 70, 60, 70, 60, 70});
    private static final Kind SL = new Kind("fedha_sl_v1", "Stop-loss hit", new long[]{0, 600, 200, 600});
    private static final Kind PLANNER = new Kind("fedha_planner_v1", "Planner reminders", new long[]{0, 120});
    private static final Kind OTHER = new Kind("fedha_other_v1", "Other", new long[]{0, 200, 100, 200});

    private static final class Kind {
        final String id;
        final String name;
        final long[] pattern;
        Kind(String id, String name, long[] pattern) { this.id = id; this.name = name; this.pattern = pattern; }
    }

    // Titles and tags come from the site (lib/trading.js, lib/broker.js, lib/nestlink-*.js, the planner).
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

    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId, Notification notification, String channelName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
        }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;

        CharSequence title = notification.extras != null ? notification.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        Kind kind = kindOf(platformTag, title == null ? null : title.toString());

        nm.deleteNotificationChannel("fedha_nestlink_v1"); // replaced by v2 (a channel's buzz can't change once made)

        NotificationChannel channel = new NotificationChannel(kind.id, kind.name, NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setVibrationPattern(kind.pattern);
        nm.createNotificationChannel(channel); // no-op if it already exists (you can then tweak it in Android settings)

        Notification out = Notification.Builder.recoverBuilder(this, notification).setChannelId(kind.id).build();
        nm.notify(platformTag, platformId, out);
        return true;
    }
}
