package com.chocle254.fedha;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import org.json.JSONArray;

import java.util.LinkedHashMap;
import java.util.Map;

// Every incoming SMS passes through here. Only M-Pesa and Ziidi texts are forwarded to Luxe, with the SIM slot
// they arrived on (M-Pesa texts for each account arrive on that account's SIM). Nothing happens until the phone
// is linked from Luxe → Wallets (PairActivity stores the token).
public class SmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (SmsUploader.token(context) == null) return;
        SmsMessage[] parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (parts == null || parts.length == 0) return;

        // A long text arrives in parts: join them per sender.
        Map<String, StringBuilder> bodies = new LinkedHashMap<>();
        long at = System.currentTimeMillis();
        for (SmsMessage p : parts) {
            if (p == null) continue;
            String from = p.getDisplayOriginatingAddress();
            bodies.computeIfAbsent(from == null ? "" : from, k -> new StringBuilder()).append(p.getMessageBody());
            if (p.getTimestampMillis() > 0) at = p.getTimestampMillis();
        }

        Bundle extras = intent.getExtras();
        int subId = extras == null ? -1 : extras.getInt("android.telephony.extra.SUBSCRIPTION_INDEX", extras.getInt("subscription", -1));
        int slot = SmsUploader.slotOf(context, subId);

        JSONArray batch = new JSONArray();
        for (Map.Entry<String, StringBuilder> e : bodies.entrySet()) {
            String body = e.getValue().toString();
            if (SmsUploader.isMoneySender(e.getKey(), body)) batch.put(SmsUploader.message(e.getKey(), body, slot, at));
        }
        if (batch.length() == 0) return;

        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            try { SmsUploader.post(app, batch); } finally { pending.finish(); }
        }).start();
    }
}
