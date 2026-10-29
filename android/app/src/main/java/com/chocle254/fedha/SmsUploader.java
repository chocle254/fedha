package com.chocle254.fedha;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.telephony.SubscriptionManager;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

// Sends M-Pesa and Ziidi texts to Luxe (fedha.vercel.app/api/sms/ingest) with this phone's device token.
// Only messages whose sender is M-Pesa or Ziidi are ever sent; everything else never leaves the phone.
final class SmsUploader {
    static final String PREFS = "luxe_sms";
    static final String TOKEN = "token";
    private static final String URL_INGEST = "https://fedha.vercel.app/api/sms/ingest";

    private SmsUploader() {}

    static String token(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(TOKEN, null);
    }

    static void saveToken(Context c, String token) {
        SharedPreferences.Editor e = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putString(TOKEN, token).apply();
    }

    // Same rule as isMoneySender in fedha/lib/sms-parser.js.
    static boolean isMoneySender(String sender, String body) {
        String s = sender == null ? "" : sender.toUpperCase(Locale.ROOT);
        String b = body == null ? "" : body.toUpperCase(Locale.ROOT);
        return s.contains("MPESA") || s.contains("M-PESA") || s.contains("ZIIDI") || (s.contains("SAFARICOM") && b.contains("ZIIDI"));
    }

    // SIM slot (1 or 2) for a subscription id, or 0 when it can't be told.
    static int slotOf(Context c, int subId) {
        if (subId < 0) return 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                int idx = SubscriptionManager.getSlotIndex(subId);
                return idx >= 0 ? idx + 1 : 0;
            }
        } catch (RuntimeException ignored) { }
        return 0;
    }

    static JSONObject message(String sender, String body, int slot, long at) {
        JSONObject o = new JSONObject();
        try {
            o.put("sender", sender);
            o.put("body", body);
            if (slot > 0) o.put("slot", slot);
            o.put("at", at);
        } catch (Exception ignored) { }
        return o;
    }

    // Blocking: call from a background thread. Returns true when Luxe accepted the batch.
    static boolean post(Context c, JSONArray messages) {
        String token = token(c);
        if (token == null || messages.length() == 0) return false;
        HttpURLConnection conn = null;
        try {
            JSONObject payload = new JSONObject();
            payload.put("messages", messages);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            conn = (HttpURLConnection) new URL(URL_INGEST).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("x-device-token", token);
            try (OutputStream out = conn.getOutputStream()) { out.write(bytes); }
            return conn.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
