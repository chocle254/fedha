package com.chocle254.fedha;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Telephony;
import android.widget.Toast;

import org.json.JSONArray;

// Opened by Luxe → Wallets → "Link this phone" (luxe://pair?token=...). Saves the device token, asks for SMS
// permission, then sends the last 30 days of M-Pesa and Ziidi texts so Luxe can catch up. Closes itself.
public class PairActivity extends Activity {
    private static final int REQ = 41;
    private static final long DAYS_BACK = 30;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent() == null ? null : getIntent().getData();
        String token = uri == null ? null : uri.getQueryParameter("token");
        if (token == null || token.isEmpty()) { finish(); return; }
        SmsUploader.saveToken(this, token);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !granted()) {
            requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS}, REQ);
        } else {
            backfillAndClose();
        }
    }

    private boolean granted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || (checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ) return;
        if (granted()) backfillAndClose();
        else {
            Toast.makeText(this, "Luxe needs SMS access to read M-Pesa and Ziidi messages. Allow it in Settings → Apps → Luxe → Permissions.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void backfillAndClose() {
        Toast.makeText(this, "Phone linked. Reading M-Pesa and Ziidi messages…", Toast.LENGTH_SHORT).show();
        final android.content.Context app = getApplicationContext();
        new Thread(() -> {
            int sent = backfill(app);
            runOnUiThread(() -> Toast.makeText(app, sent >= 0 ? "Luxe caught up on " + sent + " M-Pesa / Ziidi messages." : "Linked. Luxe will read new M-Pesa messages as they arrive.", Toast.LENGTH_LONG).show());
        }).start();
        finish();
    }

    // Reads the inbox for the last DAYS_BACK days, M-Pesa / Ziidi senders only, and posts them in batches.
    private static int backfill(android.content.Context c) {
        long since = System.currentTimeMillis() - DAYS_BACK * 24L * 3600_000L;
        String[] cols = {Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, "sub_id"};
        JSONArray batch = new JSONArray();
        int total = 0;
        Cursor cur = null;
        try {
            try {
                cur = c.getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI, cols, Telephony.Sms.DATE + " > ?", new String[]{String.valueOf(since)}, Telephony.Sms.DATE + " ASC");
            } catch (RuntimeException noSubId) {
                // Some phones have no sub_id column: read without the SIM.
                cur = c.getContentResolver().query(Telephony.Sms.Inbox.CONTENT_URI, new String[]{Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE}, Telephony.Sms.DATE + " > ?", new String[]{String.valueOf(since)}, Telephony.Sms.DATE + " ASC");
            }
            if (cur == null) return -1;
            int subCol = cur.getColumnIndex("sub_id");
            while (cur.moveToNext()) {
                String from = cur.getString(0);
                String body = cur.getString(1);
                if (!SmsUploader.isMoneySender(from, body)) continue;
                int slot = subCol >= 0 ? SmsUploader.slotOf(c, cur.getInt(subCol)) : 0;
                batch.put(SmsUploader.message(from, body, slot, cur.getLong(2)));
                if (batch.length() >= 100) { if (SmsUploader.post(c, batch)) total += batch.length(); batch = new JSONArray(); }
            }
            if (batch.length() > 0 && SmsUploader.post(c, batch)) total += batch.length();
            return total;
        } catch (RuntimeException e) {
            return -1;
        } finally {
            if (cur != null) cur.close();
        }
    }
}
