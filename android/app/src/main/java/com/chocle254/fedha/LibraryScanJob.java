package com.chocle254.fedha;

import android.Manifest;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

// Chill Room: scans the phone for new movies and series every hour in the background, even when Luxe is closed,
// so new downloads show up without tapping ⟳. Sends the list only when it changed since the last scan.
// Scheduled when the app opens and after a scan; Android keeps it across restarts (setPersisted).
public class LibraryScanJob extends JobService {
    private static final int JOB_ID = 4201;
    private static final long HOUR = 60L * 60 * 1000;

    public static void schedule(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            for (JobInfo j : js.getAllPendingJobs()) if (j.getId() == JOB_ID) return; // already scheduled
            JobInfo.Builder b = new JobInfo.Builder(JOB_ID, new ComponentName(c, LibraryScanJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPersisted(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setPeriodic(HOUR, 15L * 60 * 1000);
            else b.setPeriodic(HOUR);
            js.schedule(b.build());
        } catch (Exception ignored) {
            // Background scans are a convenience; ⟳ in the Chill Room still works.
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        Context app = getApplicationContext();
        String perm = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.READ_MEDIA_VIDEO : Manifest.permission.READ_EXTERNAL_STORAGE;
        if (SmsUploader.token(app) == null
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && app.checkSelfPermission(perm) != PackageManager.PERMISSION_GRANTED)) {
            return false; // not linked / no access yet: nothing to do until the first manual scan
        }
        new Thread(() -> {
            LibraryActivity.scan(app, true);
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
