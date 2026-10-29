package com.chocle254.fedha;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentUris;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.widget.Toast;

// Chill Room → ▶ Play opens luxe://play?id=<MediaStore id>: hands the file to your video player (VLC, MX Player,
// the gallery player …) and closes. Luxe never copies or uploads the video.
public class PlayActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri data = getIntent() == null ? null : getIntent().getData();
        String id = data == null ? null : data.getQueryParameter("id");
        try {
            Uri video = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(video, "video/*").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(Intent.createChooser(view, "Watch with"));
        } catch (NumberFormatException | NullPointerException e) {
            Toast.makeText(this, "That file is not on this phone any more. Scan again in the Chill Room.", Toast.LENGTH_LONG).show();
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Install a video player (VLC or MX Player) to watch.", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
