package com.eamilock;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.util.concurrent.atomic.AtomicReference;

public class DeviceAdminModule extends ReactContextBaseJavaModule {
    private static final String TAG = "DeviceAdminModule";
    private static final String PREFS_NAME = "EMILockPrefs";
    private static final String KEY_ALLOW_UNINSTALL = "allow_uninstall";
    private static final String KEY_IS_REGISTERED = "is_registered";
    private static final String KEY_ADMIN_ACTIVE = "admin_active";
    private static final int REQUEST_CODE_ENABLE_ADMIN = 1001;

    private final AtomicReference<Promise> adminRequestPromise = new AtomicReference<>(null);

    private final ActivityEventListener activityEventListener = new BaseActivityEventListener() {
        @Override
        public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
            if (requestCode == REQUEST_CODE_ENABLE_ADMIN) {
                Log.d(TAG, "onActivityResult: requestCode=" + requestCode + ", resultCode=" + resultCode);
                Promise promise = adminRequestPromise.getAndSet(null);
                if (promise != null) {
                    // Check if admin is now active
                    boolean isActive = isAdminActiveSync();
                    Log.d(TAG, "Admin active after result: " + isActive);
                    if (isActive) {
                        promise.resolve("granted");
                    } else {
                        promise.resolve("denied");
                    }
                }
            }
        }
    };

    public DeviceAdminModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(activityEventListener);
    }

    @Override
    public String getName() {
        return "DeviceAdmin";
    }

    private Context getContext() {
        return getReactApplicationContext();
    }
    
    private ComponentName getAdminComponent() {
        return new ComponentName(getContext(), EmiDeviceAdminReceiver.class);
    }

    private SharedPreferences getPrefs() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    /**
     * Synchronous check for admin status (internal use)
     */
    private boolean isAdminActiveSync() {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getContext()
                    .getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = getAdminComponent();
            return dpm.isAdminActive(adminComponent);
        } catch (Exception e) {
            Log.e(TAG, "isAdminActiveSync error", e);
            return false;
        }
    }

    @ReactMethod
    public void setRegistered(boolean isRegistered, Promise promise) {
        try {
            getPrefs().edit()
                    .putBoolean(KEY_IS_REGISTERED, isRegistered)
                    .apply();
            promise.resolve("success");
        } catch (Exception e) {
            Log.e(TAG, "setRegistered failed", e);
            promise.reject("ERROR", "Failed to set registration status", e);
        }
    }

    @ReactMethod
    public void isRegistered(Promise promise) {
        try {
            boolean registered = getPrefs().getBoolean(KEY_IS_REGISTERED, false);
            promise.resolve(registered);
        } catch (Exception e) {
            Log.e(TAG, "isRegistered failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void isDeviceAdminActive(Promise promise) {
        try {
            boolean isActive = isAdminActiveSync();
            Log.d(TAG, "isDeviceAdminActive: " + isActive);
            promise.resolve(isActive);
        } catch (Exception e) {
            Log.e(TAG, "isDeviceAdminActive failed", e);
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void requestDeviceAdmin(Promise promise) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getContext()
                    .getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName adminComponent = getAdminComponent();
            
            Log.d(TAG, "requestDeviceAdmin: component=" + adminComponent.flattenToString());

            // Already active
            if (dpm.isAdminActive(adminComponent)) {
                Log.d(TAG, "Device admin already active");
                promise.resolve("already_active");
                return;
            }

            Activity currentActivity = getCurrentActivity();
            if (currentActivity == null) {
                Log.e(TAG, "No current activity available - cannot request device admin properly");
                promise.reject("NO_ACTIVITY", "No activity available to request device admin permission");
                return;
            }

            // Store promise to resolve in onActivityResult
            if (!adminRequestPromise.compareAndSet(null, promise)) {
                Log.w(TAG, "Device admin request already in progress");
                promise.reject("IN_PROGRESS", "Device admin request already in progress");
                return;
            }

            Intent intent = new Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN);
            intent.putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent);
            intent.putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Enable device admin to protect your device and ensure loan security. " +
                    "This prevents unauthorized app removal.");

            Log.d(TAG, "Starting admin request with activity");
            currentActivity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN);
        } catch (SecurityException e) {
            Log.e(TAG, "requestDeviceAdmin security error", e);
            adminRequestPromise.set(null);
            promise.reject("SECURITY_ERROR", "Security error requesting device admin", e);
        } catch (Exception e) {
            Log.e(TAG, "requestDeviceAdmin failed", e);
            adminRequestPromise.set(null);
            promise.reject("ERROR", "Failed to request device admin", e);
        }
    }

    @ReactMethod
    public void lockDevice(Promise promise) {
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getContext()
                    .getSystemService(Context.DEVICE_POLICY_SERVICE);

            if (isAdminActiveSync()) {
                dpm.lockNow();
                promise.resolve("locked");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            Log.e(TAG, "lockDevice failed", e);
            promise.reject("ERROR", "Failed to lock device", e);
        }
    }

    @ReactMethod
    public void startTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(getContext(), TamperDetectionService.class);
            getContext().startService(serviceIntent);
            promise.resolve("started");
        } catch (Exception e) {
            Log.e(TAG, "startTamperDetection failed", e);
            promise.reject("ERROR", "Failed to start tamper detection", e);
        }
    }

    @ReactMethod
    public void stopTamperDetection(Promise promise) {
        try {
            Intent serviceIntent = new Intent(getContext(), TamperDetectionService.class);
            getContext().stopService(serviceIntent);
            promise.resolve("stopped");
        } catch (Exception e) {
            Log.e(TAG, "stopTamperDetection failed", e);
            promise.reject("ERROR", "Failed to stop tamper detection", e);
        }
    }

    @ReactMethod
    public void preventUninstall(boolean prevent, Promise promise) {
        try {
            if (isAdminActiveSync()) {
                getPrefs().edit()
                        .putBoolean(KEY_ALLOW_UNINSTALL, !prevent)
                        .apply();
                Log.d(TAG, "preventUninstall: " + prevent);
                promise.resolve(prevent ? "uninstall_blocked" : "uninstall_allowed");
            } else {
                promise.resolve("not_admin");
            }
        } catch (Exception e) {
            Log.e(TAG, "preventUninstall failed", e);
            promise.reject("ERROR", "Failed to prevent uninstall", e);
        }
    }

    @ReactMethod
    public void allowUninstall(Promise promise) {
        try {
            getPrefs().edit()
                    .putBoolean(KEY_ALLOW_UNINSTALL, true)
                    .apply();
            Log.d(TAG, "Uninstall allowed");
            promise.resolve("uninstall_allowed");
        } catch (Exception e) {
            Log.e(TAG, "allowUninstall failed", e);
            promise.reject("ERROR", "Failed to allow uninstall", e);
        }
    }

    @ReactMethod
    public void isUninstallAllowed(Promise promise) {
        try {
            boolean allowed = getPrefs().getBoolean(KEY_ALLOW_UNINSTALL, false);
            promise.resolve(allowed);
        } catch (Exception e) {
            Log.e(TAG, "isUninstallAllowed failed", e);
            promise.resolve(false);
        }
    }
}
