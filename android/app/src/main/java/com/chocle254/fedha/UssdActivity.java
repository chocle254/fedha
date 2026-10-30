package com.chocle254.fedha;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.telecom.PhoneAccountHandle;
import android.telecom.TelecomManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import android.widget.Toast;

import java.util.List;

// Luxe → Wallets → "📞 *456#" opens luxe://ussd?code=*456#&sim=2. Dials the USSD code straight on that SIM, so the
// phone's own M-Pesa menu opens (you pick options and type your PIN there; Luxe never sees it). If call access is
// refused, the dialer opens with the code typed in and you press call yourself. Closes itself.
public class UssdActivity extends Activity {
    private static final int REQ = 42;
    private String code;
    private int sim;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent() == null ? null : getIntent().getData();
        code = uri == null ? null : uri.getQueryParameter("code");
        try { sim = Integer.parseInt(uri == null ? "0" : String.valueOf(uri.getQueryParameter("sim"))); } catch (NumberFormatException e) { sim = 0; }
        // Only USSD codes like *456# or *334*1#: digits, * and #.
        if (code == null || !code.matches("\\*[0-9*#]{1,30}#")) { finish(); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !granted()) {
            requestPermissions(new String[]{Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE}, REQ);
        } else {
            dial();
        }
    }

    private boolean granted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || (checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode != REQ) return;
        if (granted()) dial();
        else {
            Toast.makeText(this, "No call access: press call yourself and pick SIM " + (sim > 0 ? sim : "") + ".", Toast.LENGTH_LONG).show();
            openDialer();
        }
    }

    private Uri telUri() { return Uri.parse("tel:" + Uri.encode(code)); }

    private void openDialer() {
        try { startActivity(new Intent(Intent.ACTION_DIAL, telUri())); } catch (RuntimeException ignored) { }
        finish();
    }

    private void dial() {
        Intent call = new Intent(Intent.ACTION_CALL, telUri());
        call.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (sim > 0) {
            PhoneAccountHandle h = accountFor(this, sim);
            if (h != null) call.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, h);
            // Older dual-SIM phones read one of these instead (slot is 0-based).
            int slot = sim - 1;
            for (String k : new String[]{"com.android.phone.extra.slot", "slot", "simslot", "sim_slot", "subscription", "Subscription", "simSlot", "slot_id", "simId", "simnum", "slotId", "slotIdx"}) {
                call.putExtra(k, slot);
            }
        }
        try {
            startActivity(call);
        } catch (RuntimeException e) {
            openDialer();
            return;
        }
        finish();
    }

    // The phone account (calling SIM) in a 1-based slot, or null if it can't be told apart.
    private static PhoneAccountHandle accountFor(Context c, int slot) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
            TelecomManager tm = (TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
            List<PhoneAccountHandle> handles = tm.getCallCapablePhoneAccounts();
            if (handles == null || handles.isEmpty()) return null;
            int subId = -1;
            String iccid = null;
            SubscriptionManager sm = (SubscriptionManager) c.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            SubscriptionInfo info = sm == null ? null : sm.getActiveSubscriptionInfoForSimSlotIndex(slot - 1);
            if (info != null) { subId = info.getSubscriptionId(); iccid = info.getIccId(); }
            if (subId >= 0) {
                TelephonyManager tel = (TelephonyManager) c.getSystemService(Context.TELEPHONY_SERVICE);
                for (PhoneAccountHandle h : handles) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && tel != null) {
                        try { if (tel.getSubscriptionId(h) == subId) return h; } catch (RuntimeException ignored) { }
                    }
                    String id = h.getId();
                    if (id == null) continue;
                    if (id.equals(String.valueOf(subId))) return h;
                    if (iccid != null && !iccid.isEmpty() && (id.startsWith(iccid) || iccid.startsWith(id))) return h;
                }
            }
            // Fallback: phones usually list SIM accounts in slot order.
            return handles.size() >= slot ? handles.get(slot - 1) : null;
        } catch (SecurityException | NullPointerException e) {
            return null;
        }
    }
}
