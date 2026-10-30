package com.chocle254.fedha;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;
import java.util.regex.Pattern;

// Chill Room → "Scan my downloads" opens luxe://library. Reads the phone's video list (MediaStore) and sends Luxe
// only the files that look like a series episode or a movie, from Download / Telegram / Movies. Personal videos
// (Vault, WhatsApp, Instagram, Camera, screen recordings) are skipped here, so their names never leave the phone.
// Only names, sizes and lengths are sent, never the videos. Closes itself.
public class LibraryActivity extends Activity {
    private static final int REQ = 42;
    private static final String URL_LIBRARY = "https://fedha.vercel.app/api/chill/library";

    private static final Pattern EPISODE = Pattern.compile("(?i)\\bS\\d{1,2}\\s?E\\d{1,3}\\b|\\b\\d{1,2}x\\d{2}\\b");
    private static final Pattern MOVIE_TAGS = Pattern.compile("(?i)\\b(19[3-9]\\d|20[0-4]\\d)\\b.*\\b(480p|576p|720p|1080p|2160p|4k|bluray|brrip|bdrip|web-?dl|webrip|hdrip|dvdrip|hdtv|x264|x265|hevc|h264|aac)\\b|\\b(480p|720p|1080p|2160p|brrip|bluray|web-?dl|webrip|hdrip|x264|x265|hevc)\\b");
    private static final Pattern PRIVATE = Pattern.compile("(?i)/(vault|whatsapp|instagram|dcim|camera|screenrecord(er|ings)?|snapchat|tiktok|recordings?)(/|$)|^(vid|img|lv|wa)[-_]\\d|^screen");
    private static final long BIG = 250L * 1024 * 1024; // a 250 MB+ video in a download folder is almost always a film

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (SmsUploader.token(this) == null) {
            Toast.makeText(this, "Link this phone first: Luxe → Wallets → Link this phone.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        String perm = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_VIDEO : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{perm}, REQ);
        } else {
            scanAndClose();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) scanAndClose();
        else {
            Toast.makeText(this, "Luxe needs access to videos to list your movies and series.", Toast.LENGTH_LONG).show();
            finish();
        }
    }

    private void scanAndClose() {
        Toast.makeText(this, "Scanning your downloads for movies and series…", Toast.LENGTH_SHORT).show();
        final Context app = getApplicationContext();
        new Thread(() -> {
            int n = scan(app, false);
            LibraryScanJob.schedule(app);
            runOnUiThread(() -> Toast.makeText(app, n >= 0 ? "Chill Room: found " + n + " movies and episodes. Pull to refresh." : "Could not send the list to Luxe. Try again.", Toast.LENGTH_LONG).show());
        }).start();
        finish();
    }

    static boolean looksLikeTitle(String name, String folder, long size) {
        String path = ("/" + folder + "/").toLowerCase(Locale.ROOT);
        if (PRIVATE.matcher(path).find() || PRIVATE.matcher(name).find()) return false;
        boolean inPlace = path.contains("/download") || path.contains("/telegram") || path.contains("/movies") || path.contains("/video");
        if (!inPlace) return false;
        return EPISODE.matcher(name).find() || MOVIE_TAGS.matcher(name).find() || size >= BIG;
    }

    // onlyIfChanged: the hourly background scan (LibraryScanJob) skips sending when the list is the same as last time.
    // Returns the number of files sent, -2 when nothing changed, -1 on failure.
    static int scan(Context c, boolean onlyIfChanged) {
        Uri uri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        boolean q = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
        String[] cols = q
                ? new String[]{MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.SIZE, MediaStore.Video.Media.DURATION, MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.RELATIVE_PATH}
                : new String[]{MediaStore.Video.Media._ID, MediaStore.Video.Media.DISPLAY_NAME, MediaStore.Video.Media.SIZE, MediaStore.Video.Media.DURATION, MediaStore.Video.Media.DATE_ADDED, MediaStore.Video.Media.DATA};
        JSONArray files = new JSONArray();
        try (Cursor cur = c.getContentResolver().query(uri, cols, null, null, MediaStore.Video.Media.DATE_ADDED + " DESC")) {
            if (cur == null) return -1;
            while (cur.moveToNext()) {
                String name = cur.getString(1);
                long size = cur.getLong(2);
                String where = cur.getString(5);
                if (name == null || where == null) continue;
                String folder = q ? where : where.substring(0, Math.max(0, where.lastIndexOf('/')));
                if (!looksLikeTitle(name, folder, size)) continue;
                JSONObject f = new JSONObject();
                f.put("id", cur.getLong(0));
                f.put("name", name);
                f.put("size", size);
                f.put("duration", cur.getLong(3));
                f.put("added", cur.getLong(4) * 1000L);
                f.put("folder", folder.replaceAll("/+$", ""));
                files.put(f);
            }
            String sig = Integer.toHexString(files.toString().hashCode());
            android.content.SharedPreferences prefs = c.getSharedPreferences("luxe_library", Context.MODE_PRIVATE);
            if (onlyIfChanged && sig.equals(prefs.getString("sig", null))) return -2;
            JSONObject payload = new JSONObject();
            payload.put("files", files);
            boolean ok = SmsUploader.postJson(c, URL_LIBRARY, payload);
            if (ok) prefs.edit().putString("sig", sig).apply();
            return ok ? files.length() : -1;
        } catch (Exception e) {
            return -1;
        }
    }
}
