package com.eamilock;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Accessibility Service that monitors for tamper attempts.
 * Detects when the user navigates to Settings > Apps or attempts to uninstall/disable the app.
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

            // Also check window text for keywords like "Uninstall", "Force stop", app name
            CharSequence contentDesc = event.getContentDescription();
            String textContent = contentDesc != null ? contentDesc.toString().toLowerCase() : "";
            boolean hasUninstallKeyword = textContent.contains("uninstall")
                    || textContent.contains("desinstalli")   // Estonian
                    || textContent.contains("force stop")
                    || textContent.contains("app info");

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
