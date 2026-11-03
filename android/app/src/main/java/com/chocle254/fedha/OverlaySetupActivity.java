package com.chocle254.fedha;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

// Luxe → Home → "Turn on Luxe's own pop-ups" opens luxe://overlay. Takes you to Android's "Display over other apps"
// switch for Luxe (or says it is already on), then closes itself.
public class OverlaySetupActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            Toast.makeText(this, "Luxe's own pop-ups need Android 8 or newer.", Toast.LENGTH_LONG).show();
        } else if (Settings.canDrawOverlays(this)) {
            Toast.makeText(this, "Luxe's own pop-ups are already on.", Toast.LENGTH_SHORT).show();
        } else {
            try {
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                Toast.makeText(this, "Turn on \"Allow display over other apps\" for Luxe.", Toast.LENGTH_LONG).show();
            } catch (RuntimeException e) {
                Toast.makeText(this, "Open Settings → Apps → Luxe → Display over other apps.", Toast.LENGTH_LONG).show();
            }
        }
        finish();
    }
}
