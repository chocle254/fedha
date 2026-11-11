package com.chocle254.fedha;

import android.Manifest;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

// Opened once from the call-refund dashboard in Termux ("Link fedha app" → luxe://callrefund?token=…&sim=2).
// Saves the token and which SIM to watch, asks for call and notification permissions, then closes.
public class CallRefundActivity extends Activity {
    private static final int REQ = 42;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent() == null ? null : getIntent().getData();
        String token = uri == null ? null : uri.getQueryParameter("token");
        if (token == null || token.isEmpty()) { finish(); return; }
        SharedPreferences.Editor e = getSharedPreferences(CallReceiver.PREFS, MODE_PRIVATE).edit().putString("token", token);
        try { e.putInt("sim", Integer.parseInt(uri.getQueryParameter("sim"))); } catch (Exception ignored) { }
        try { e.putInt("port", Integer.parseInt(uri.getQueryParameter("port"))); } catch (Exception ignored) { }
        e.apply();

        List<String> need = missing();
        if (need.isEmpty()) done();
        else requestPermissions(need.toArray(new String[0]), REQ);
    }

    private List<String> missing() {
        List<String> need = new ArrayList<>();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return need;
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.READ_PHONE_STATE);
        if (checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) need.add(Manifest.permission.READ_CALL_LOG);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) need.add("android.permission.POST_NOTIFICATIONS");
        return need;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ) return;
        if (missing().isEmpty()) done();
        else {
            Toast.makeText(this, "Call refunds need Phone, Call logs and Notifications. Allow them in Settings → Apps → Luxe → Permissions.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void done() {
        int sim = getSharedPreferences(CallReceiver.PREFS, MODE_PRIVATE).getInt("sim", 2);
        Toast.makeText(this, "Linked. After each SIM " + sim + " call you'll get a refund check notification.", Toast.LENGTH_LONG).show();
        finish();
    }
}
