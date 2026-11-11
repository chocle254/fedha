package com.chocle254.fedha;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telephony.TelephonyManager;

// Call refunds: when an incoming call on the chosen SIM (default SIM 2) ends, show a notification.
// Tapping it opens the refund page served by the call-refund app in Termux (http://127.0.0.1:8787),
// which shows what that caller paid and asks before refunding. Nothing happens until the phone is
// linked with luxe://callrefund?token=… (CallRefundActivity).
public class CallReceiver extends BroadcastReceiver {
    static final String PREFS = "call_refund";
    private static final String CHANNEL = "callrefund"; // must not start with "fedha_" (old channels get deleted)

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String token = p.getString("token", null);
        if (token == null) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        // Android sends each change twice; only one copy carries the number (needs Call logs permission).
        String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            SharedPreferences.Editor e = p.edit().putBoolean("ringing", true);
            if (number != null && !number.isEmpty()) e.putString("number", number).putInt("slot", slotOf(context, intent.getExtras()));
            e.apply();
        } else if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            boolean wasIncoming = p.getBoolean("ringing", false);
            String saved = p.getString("number", null);
            int slot = p.getInt("slot", 0);
            p.edit().remove("ringing").remove("number").remove("slot").apply();
            if (!wasIncoming || saved == null) return;          // outgoing call, or number unknown
            int wanted = p.getInt("sim", 2);
            if (slot != 0 && slot != wanted) return;            // a call on the other SIM
            notifyCall(context, p, token, saved, slot);
        }
    }

    // 1 or 2, or 0 if this phone doesn't say which SIM rang.
    private static int slotOf(Context c, Bundle extras) {
        if (extras == null) return 0;
        int subId = extras.getInt("android.telephony.extra.SUBSCRIPTION_INDEX", extras.getInt("subscription", -1));
        int slot = SmsUploader.slotOf(c, subId);
        if (slot == 0 && extras.containsKey("slot")) slot = extras.getInt("slot", -1) + 1;
        return Math.max(slot, 0);
    }

    private static void notifyCall(Context c, SharedPreferences p, String token, String number, int slot) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Call refunds", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("After a call on your refund SIM: tap to see if the caller is owed a refund.");
            nm.createNotificationChannel(ch);
        }
        String url = "http://127.0.0.1:" + p.getInt("port", 8787) + "/call?token=" + Uri.encode(token) + "&phone=" + Uri.encode(number);
        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, number.hashCode(), open, flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle((slot == 0 ? "Call" : "SIM " + slot + " call") + " from " + number)
                .setContentText("Tap to check if they're owed a refund")
                .setContentIntent(pi)
                .setAutoCancel(true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) b.setPriority(Notification.PRIORITY_HIGH);
        try { nm.notify(number.hashCode(), b.build()); } catch (SecurityException ignored) { } // notifications turned off
    }
}
