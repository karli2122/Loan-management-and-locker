package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.Toast;

public class EmiDeviceAdminReceiver extends DeviceAdminReceiver {
    private static final String TAG = "EmiDeviceAdminReceiver";
    private static final String PREFS_NAME = "EMILockPrefs";
    private static final String KEY_ALLOW_UNINSTALL = "allow_uninstall";
    private static final String KEY_ADMIN_ACTIVE = "admin_active";

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.d(TAG, "Device Admin ENABLED");
        
        // Store admin active state
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ADMIN_ACTIVE, true)
                .putBoolean(KEY_ALLOW_UNINSTALL, false)
                .apply();
        
        Toast.makeText(context, "Device protection enabled", Toast.LENGTH_SHORT).show();
    }

    @Override
    public CharSequence onDisableRequested(Context context, Intent intent) {
        Log.d(TAG, "Device Admin DISABLE REQUESTED");
        
        boolean allowed = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_ALLOW_UNINSTALL, false);

        if (allowed) {
            return "Device admin will be disabled. You can now uninstall the app.";
        } else {
            return "⚠️ DEVICE PROTECTED ⚠️\n\n" +
                    "This device is protected by EMI Lock system.\n\n" +
                    "You cannot disable device admin while you have pending payments.\n\n" +
                    "Please contact your administrator to remove protection.";
        }
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Log.d(TAG, "Device Admin DISABLED");
        
        // Update admin state
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ADMIN_ACTIVE, false)
                .apply();
    }

    @Override
    public void onPasswordChanged(Context context, Intent intent) {
        super.onPasswordChanged(context, intent);
        Log.d(TAG, "Password changed");
    }

    @Override
    public void onPasswordFailed(Context context, Intent intent) {
        super.onPasswordFailed(context, intent);
        Log.d(TAG, "Password failed");
    }
}
