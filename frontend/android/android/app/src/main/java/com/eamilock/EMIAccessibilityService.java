package com.eamilock;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.WindowManager;
import android.widget.Toast;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Accessibility Service that monitors for tamper attempts.
 * Detects when the user navigates to Settings > Apps or attempts to uninstall/disable the app.
 * Shows warning dialog when user tries to access Accessibility settings.
 * Reports events via broadcast to the React Native layer.
 */
public class EMIAccessibilityService extends AccessibilityService {
    private static final String TAG = "EMIAccessibility";
    private static final String PREFS_NAME = "EMILockPrefs";

    // Package names and class names associated with app management screens
    private static final Set<String> DANGEROUS_PACKAGES = new HashSet<>(Arrays.asList(
            "com.android.settings",
            "com.samsung.android.settings",
            "com.miui.securitycenter",
            "com.coloros.safecenter",
            "com.oneplus.security"
    ));

    // Specific class names within Settings that indicate App Info / Uninstall screens
    private static final Set<String> DANGEROUS_CLASSES = new HashSet<>(Arrays.asList(
            "com.android.settings.applications.InstalledAppDetailsTop",
            "com.android.settings.applications.InstalledAppDetails",
            "com.android.settings.applications.ManageApplications",
            "com.android.settings.applications.AppInfoBase",
            "com.android.settings.applications.appinfo.AppInfoDashboardFragment"
    ));
    
    // Classes that indicate Accessibility settings screen
    private static final Set<String> ACCESSIBILITY_SETTINGS_CLASSES = new HashSet<>(Arrays.asList(
            "com.android.settings.accessibility.AccessibilitySettings",
            "com.android.settings.accessibility.AccessibilitySettingsForSetupWizard",
            "com.android.settings.accessibility.InstalledAccessibilityServiceFragment",
            "com.android.settings.accessibility.ToggleAccessibilityServiceFragment",
            "com.android.settings.accessibility.ToggleAccessibilityServicePreferenceFragment"
    ));
    
    // Classes that indicate Device Admin settings screen  
    private static final Set<String> DEVICE_ADMIN_SETTINGS_CLASSES = new HashSet<>(Arrays.asList(
            "com.android.settings.DeviceAdminSettings",
            "com.android.settings.applications.DeviceAdminAdd",
            "com.android.settings.enterprise.DeviceAdminListFragment",
            "com.android.settings.security.DeviceAdminListPreferenceController"
    ));
    
    private boolean warningShown = false;
    private long lastWarningTime = 0;
    private static final long WARNING_COOLDOWN_MS = 5000; // 5 seconds cooldown

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;

        int eventType = event.getEventType();
        if (eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return;
        }

        CharSequence packageNameCS = event.getPackageName();
        CharSequence classNameCS = event.getClassName();
        if (packageNameCS == null) return;

        String packageName = packageNameCS.toString();
        String className = classNameCS != null ? classNameCS.toString() : "";

        // Check if user opened a dangerous settings screen
        if (DANGEROUS_PACKAGES.contains(packageName)) {
            boolean isAppInfoScreen = DANGEROUS_CLASSES.contains(className);
            boolean isAccessibilityScreen = ACCESSIBILITY_SETTINGS_CLASSES.contains(className);
            boolean isDeviceAdminScreen = DEVICE_ADMIN_SETTINGS_CLASSES.contains(className);

            // Also check window text for keywords like "Uninstall", "Force stop", app name
            CharSequence contentDesc = event.getContentDescription();
            String textContent = contentDesc != null ? contentDesc.toString().toLowerCase() : "";
            boolean hasUninstallKeyword = textContent.contains("uninstall")
                    || textContent.contains("desinstalli")   // Estonian
                    || textContent.contains("force stop")
                    || textContent.contains("app info");
            boolean hasAccessibilityKeyword = textContent.contains("accessibility")
                    || textContent.contains("juurdepääsetavus") // Estonian
                    || textContent.contains("hõlbustus"); // Estonian alternative
            boolean hasDeviceAdminKeyword = textContent.contains("device admin")
                    || textContent.contains("seadme administraator") // Estonian
                    || textContent.contains("device administrator");
            
            // Show warning when user navigates to Accessibility settings
            if (isAccessibilityScreen || hasAccessibilityKeyword) {
                long now = System.currentTimeMillis();
                if (now - lastWarningTime > WARNING_COOLDOWN_MS) {
                    lastWarningTime = now;
                    Log.w(TAG, "User accessed Accessibility settings. Showing warning.");
                    showPermissionWarningToast();
                    reportTamperAttempt("accessibility_settings");
                }
            }
            
            // Show warning when user navigates to Device Admin settings
            if (isDeviceAdminScreen || hasDeviceAdminKeyword) {
                long now = System.currentTimeMillis();
                if (now - lastWarningTime > WARNING_COOLDOWN_MS) {
                    lastWarningTime = now;
                    Log.w(TAG, "User accessed Device Admin settings. Showing warning.");
                    showPermissionWarningToast();
                    reportTamperAttempt("device_admin_settings");
                }
            }

            if (isAppInfoScreen || hasUninstallKeyword) {
                Log.w(TAG, "TAMPER ATTEMPT: User accessed app management. pkg=" + packageName + " cls=" + className);
                reportTamperAttempt("settings_app_info");

                // Go back to our app to block the action
                performGlobalAction(GLOBAL_ACTION_BACK);
                openOurApp();
            } else if (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                // User opened Settings (not necessarily the dangerous screen yet)
                Log.d(TAG, "Settings opened: " + packageName + " / " + className);
            }
        }
    }
    
    /**
     * Shows a warning toast/notification when user tries to access permission settings.
     * Toast is used as it works without SYSTEM_ALERT_WINDOW permission.
     */
    private void showPermissionWarningToast() {
        new Handler(Looper.getMainLooper()).post(() -> {
            try {
                Toast.makeText(
                    this,
                    "⚠️ WARNING: Disabling this permission will erase ALL your data on this device!",
                    Toast.LENGTH_LONG
                ).show();
                
                // Show a second toast with more info after a delay
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    Toast.makeText(
                        this,
                        "Press BACK now to keep your data safe.",
                        Toast.LENGTH_LONG
                    ).show();
                }, 3500);
            } catch (Exception e) {
                Log.e(TAG, "Error showing toast", e);
            }
        });
    }

    private void reportTamperAttempt(String type) {
        // Store the tamper attempt
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        long count = prefs.getLong("tamper_attempt_count", 0);
        prefs.edit()
                .putLong("tamper_attempt_count", count + 1)
                .putLong("last_tamper_timestamp", System.currentTimeMillis())
                .putString("last_tamper_type", type)
                .apply();

        // Broadcast to React Native
        Intent intent = new Intent("com.eamilock.TAMPER_EVENT");
        intent.putExtra("eventType", "SETTINGS_TAMPER");
        intent.putExtra("tamperType", type);
        intent.putExtra("timestamp", System.currentTimeMillis());
        sendBroadcast(intent);
    }

    private void openOurApp() {
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            startActivity(launchIntent);
        }
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "Accessibility Service interrupted");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        Log.d(TAG, "Accessibility Service connected");

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 200;
        info.flags = AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
                | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
        setServiceInfo(info);
    }
}
