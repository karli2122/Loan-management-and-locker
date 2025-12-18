package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class DeviceAdminModule extends ReactContextBaseJavaModule {
    private static final String TAG = "DeviceAdminModule";
    private static final String PREFS_NAME = "EMILockPrefs";
    private static final String KEY_ALLOW_UNINSTALL = "allow_uninstall";
    private static final String KEY_IS_REGISTERED = "is_registered";

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "DeviceAdmin";
    }

    private Context getContext() {
        return getReactApplicationContext();
    }

    @ReactMethod
    public void setRegistered(boolean isRegistered, Promise promise) {
        try {
            Context context = getContext();
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_IS_REGISTERED, isRegistered)
                    .apply();
            promise.resolve("success");
        } catch (Exception e) {
            Log.e(TAG, "setRegistered failed", e);
            promise.resolve("error");
        }
    }

    @ReactMethod
    public void isRegistered(Promise promise) {
        try {
            Context context = getContext();
            promise.resolve(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(KEY_IS_REGISTERED, false));
        } catch (Exception e) {
            Log.e(TAG, "isRegistered failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
            promise.resolve(dpm.isAdminActive(adminComponent));
        } catch (Exception e) {
            Log.e(TAG, "isDeviceAdminActive failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (!dpm.isAdminActive(adminComponent)) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "Enable device admin to protect your device and EMI payment.");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                promise.resolve("requested");
                return;
            }
            promise.resolve("already_active");
        } catch (SecurityException e) {
            Log.e(TAG, "requestDeviceAdmin security failure", e);
            promise.resolve("security_error");
        } catch (Exception e) {
            Log.e(TAG, "requestDeviceAdmin failed", e);
            promise.resolve("error_request_admin");
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow();
                promise.resolve("locked");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void disableOtherApps(boolean disable, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(disable ? "apps_restricted" : "apps_enabled");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void resetPassword(String newPassword, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    boolean result = dpm.resetPassword(newPassword, 0);
                    promise.resolve(result ? "password_set" : "failed");
                } else {
                    promise.resolve("not_supported_on_this_android_version");
                }
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void startTamperDetection(Promise promise) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, TamperDetectionService.class);
            context.startService(serviceIntent);
            promise.resolve("tamper_detection_started");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void stopTamperDetection(Promise promise) {
        try {
            Context context = getContext();
            Intent serviceIntent = new Intent(context, TamperDetectionService.class);
            context.stopService(serviceIntent);
            promise.resolve("tamper_detection_stopped");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void preventUninstall(boolean prevent, Promise promise) {
        try {
            Context context = getContext();
            DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);

            if (dpm.isAdminActive(adminComponent)) {
                promise.resolve(prevent ? "uninstall_blocked" : "uninstall_allowed");
                return;
            }
            promise.resolve("not_admin");
        } catch (Exception e) {
            promise.resolve("error: " + e.getMessage());
        }
    }

    @ReactMethod
    public void allowUninstall(Promise promise) {
        try {
            Context context = getContext();
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(KEY_ALLOW_UNINSTALL, true)
                    .apply();
            promise.resolve("uninstall_allowed");
        } catch (Exception e) {
            Log.e(TAG, "allowUninstall failed", e);
            promise.resolve("error_allow_uninstall");
        }
    }

    @ReactMethod
    public void isUninstallAllowed(Promise promise) {
        try {
            Context context = getContext();
            promise.resolve(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(KEY_ALLOW_UNINSTALL, false));
        } catch (Exception e) {
            Log.e(TAG, "isUninstallAllowed failed", e);
            promise.resolve(false);
        }
    }

    public static class MyDeviceAdminReceiver extends DeviceAdminReceiver {
        @Override
        public void onEnabled(Context context, Intent intent) {
            super.onEnabled(context, intent);
            context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false)
                    .apply();
        }

        @Override
        public CharSequence onDisableRequested(Context context, Intent intent) {
            boolean allowed = context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .getBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false);

            if (allowed) {
                return "Device admin will be disabled.";
            } else {
                return "❌ CANNOT DISABLE\n\n" +
                        "This device is protected by EMI payment system.\n\n" +
                        "To uninstall this app, contact your administrator.\n\n" +
                        "Administrator must remove this device from the admin panel first.";
            }
        }

        @Override
        public void onDisabled(Context context, Intent intent) {
            super.onDisabled(context, intent);
            context.getSharedPreferences(DeviceAdminModule.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putBoolean(DeviceAdminModule.KEY_ALLOW_UNINSTALL, false)
                    .apply();
        }
    }
}
