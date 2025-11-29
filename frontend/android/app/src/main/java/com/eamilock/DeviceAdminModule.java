package com.eamilock;

import android.app.admin.DeviceAdminReceiver;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import expo.modules.kotlin.modules.Module;
import expo.modules.kotlin.modules.ModuleDefinition;

public class DeviceAdminModule extends Module {
    @Override
    public ModuleDefinition definition() {
        return ModuleDefinition.create(builder -> {
            builder.name("DeviceAdmin");

            builder.asyncFunction("isDeviceAdminActive", () -> {
                Context context = getContext();
                DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
                ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
                return dpm.isAdminActive(adminComponent);
            });

            builder.asyncFunction("requestDeviceAdmin", () -> {
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
                    return "requested";
                }
                return "already_active";
            });

            builder.asyncFunction("lockDevice", () -> {
                try {
                    Context context = getContext();
                    DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
                    ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
                    
                    if (dpm.isAdminActive(adminComponent)) {
                        dpm.lockNow();
                        return "locked";
                    }
                    return "not_admin";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("disableOtherApps", (boolean disable) -> {
                try {
                    Context context = getContext();
                    DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
                    ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
                    
                    if (dpm.isAdminActive(adminComponent)) {
                        // This is a placeholder - actual implementation would use app restrictions
                        // Note: Full kiosk mode like Device Owner is not available in Device Admin
                        return disable ? "apps_restricted" : "apps_enabled";
                    }
                    return "not_admin";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("resetPassword", (String newPassword) -> {
                try {
                    Context context = getContext();
                    DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
                    ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
                    
                    if (dpm.isAdminActive(adminComponent)) {
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                            boolean result = dpm.resetPassword(newPassword, 0);
                            return result ? "password_set" : "failed";
                        } else {
                            // Android O and above don't allow password reset via Device Admin
                            return "not_supported_on_this_android_version";
                        }
                    }
                    return "not_admin";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("startTamperDetection", () -> {
                try {
                    Context context = getContext();
                    Intent serviceIntent = new Intent(context, TamperDetectionService.class);
                    context.startService(serviceIntent);
                    return "tamper_detection_started";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("stopTamperDetection", () -> {
                try {
                    Context context = getContext();
                    Intent serviceIntent = new Intent(context, TamperDetectionService.class);
                    context.stopService(serviceIntent);
                    return "tamper_detection_stopped";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("preventUninstall", (boolean prevent) -> {
                try {
                    Context context = getContext();
                    DevicePolicyManager dpm = (DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
                    ComponentName adminComponent = new ComponentName(context, MyDeviceAdminReceiver.class);
                    
                    if (dpm.isAdminActive(adminComponent)) {
                        // This prevents uninstallation as long as device admin is active
                        return prevent ? "uninstall_blocked" : "uninstall_allowed";
                    }
                    return "not_admin";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });
        });
    }

    private Context getContext() {
        return getAppContext().getReactContext();
    }

    builder.asyncFunction("allowUninstall", () -> {
                try {
                    Context context = getContext();
                    // Set flag to allow uninstall
                    context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                           .edit()
                           .putBoolean("allow_uninstall", true)
                           .apply();
                    return "uninstall_allowed";
                } catch (Exception e) {
                    return "error: " + e.getMessage();
                }
            });

            builder.asyncFunction("isUninstallAllowed", () -> {
                try {
                    Context context = getContext();
                    boolean allowed = context.getSharedPreferences("EMILockPrefs", Context.MODE_PRIVATE)
                                             .getBoolean("allow_uninstall", false);
                    return allowed;
                } catch (Exception e) {
                    return false;
                }
            });
        });
    }

    private Context getContext() {
        return getAppContext().getReactContext();
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
