package com.chocle254.fedha;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

// Opens Luxe (the Trusted Web Activity) and plays the "Welcome to Luxe" ident as it starts.
// Browsers block sound before the first tap, so the ident is played here, natively.
// Quiet when the phone is on silent or vibrate.
public class LuxeLauncherActivity extends LauncherActivity {
    private static MediaPlayer player;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        if (savedInstanceState == null) playWelcome(getApplicationContext());
        LibraryScanJob.schedule(getApplicationContext()); // Chill Room: hourly background scan for new downloads
        super.onCreate(savedInstanceState);
    }

    private static void playWelcome(Context ctx) {
        try {
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (am == null || am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return;
            if (player != null) { player.release(); player = null; }
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mp.setDataSource(ctx, android.net.Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/luxe_welcome"));
            mp.setOnPreparedListener(MediaPlayer::start);
            mp.setOnCompletionListener(p -> { p.release(); if (player == p) player = null; });
            mp.prepareAsync();
            player = mp;
        } catch (Exception ignored) {
            // The ident is a nicety; never block opening the app.
        }
    }
}
