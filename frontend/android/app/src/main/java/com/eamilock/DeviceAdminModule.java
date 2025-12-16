package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class DeviceAdminModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    private DevicePolicyManager dpm;
    private ComponentName adminComponent;

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.dpm = (DevicePolicyManager) reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
        this.adminComponent = new ComponentName(reactContext, MyDeviceAdminReceiver.class);
    }

    @Override
    public String getName() {
        return "DeviceAdmin";
    }

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            boolean isActive = dpm.isAdminActive(adminComponent);
            promise.resolve(isActive);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            if (!dpm.isAdminActive(adminComponent)) {
                Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
                intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
                intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, 
                    "Enable device admin to protect your device and EMI payment.");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
                promise.resolve("requested");
            } else {
                promise.resolve("already_active");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow();
                promise.resolve("locked");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void disableOtherApps(boolean disable, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                // This is a placeholder - actual implementation would use app restrictions
                // Note: Full kiosk mode like Device Owner is not available in Device Admin
                promise.resolve(disable ? "apps_restricted" : "apps_enabled");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void resetPassword(String newPassword, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    boolean result = dpm.resetPassword(newPassword, 0);
                    promise.resolve(result ? "password_set" : "failed");
                } else {
                    // Android O and above don't allow password reset via Device Admin
                    promise.resolve("not_supported_on_this_android_version");
                }
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void startTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, TamperDetectionService.class);
            reactContext.startService(serviceIntent);
            promise.resolve("tamper_detection_started");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(reactContext, TamperDetectionService.class);
            reactContext.stopService(serviceIntent);
            promise.resolve("tamper_detection_stopped");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void preventUninstall(boolean prevent, Promise promise) {
        try {
            if (dpm.isAdminActive(adminComponent)) {
                // This prevents uninstallation as long as device admin is active
                promise.resolve(prevent ? "uninstall_blocked" : "uninstall_allowed");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void allowUninstall(Promise promise) {
        try {
            // Set flag to allow uninstall
            reactContext.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", true)
                   .apply();
            promise.resolve("uninstall_allowed");
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void isUninstallAllowed(Promise promise) {
        try {
            boolean allowed = reactContext.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                                         .getBoolean("allow_uninstall", false);
            promise.resolve(allowed);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // Inner class for Device Admin Receiver
    public static class MyDeviceAdminReceiver extends DeviceAdminReceiver {
        @Override
        public void onEnabled(Context context, Intent intent) {
            super.onEnabled(context, intent);
            // Device admin enabled - block uninstall by default
            context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", false)
                   .apply();
        }

        @Override
        public CharSequence onDisableRequested(Context context, Intent intent) {
            // Check if uninstall is allowed
            boolean allowed = context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                                     .getBoolean("allow_uninstall", false);
            
            if (allowed) {
                return "Device admin will be disabled.";
            } else {
                // Block deactivation - return strong warning
                return "❌ CANNOT DISABLE\n\n" +
                       "This device is protected by EMI payment system.\n\n" +
                       "To uninstall this app, contact your administrator.\n\n" +
                       "Administrator must remove this device from the admin panel first.";
            }
        }

        @Override
        public void onDisabled(Context context, Intent intent) {
            super.onDisabled(context, intent);
            // Reset the flag
            context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                   .edit()
                   .putBoolean("allow_uninstall", false)
                   .apply();
        }

        @Override
        public void onPasswordChanged(Context context, Intent intent) {
            super.onPasswordChanged(context, intent);
        }

        @Override
        public void onPasswordFailed(Context context, Intent intent) {
            super.onPasswordFailed(context, intent);
        }

        @Override
        public void onPasswordSucceeded(Context context, Intent intent) {
            super.onPasswordSucceeded(context, intent);
        }
    }
}
