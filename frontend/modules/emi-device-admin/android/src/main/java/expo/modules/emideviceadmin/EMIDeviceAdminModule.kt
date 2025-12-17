package expo.modules.emideviceadmin

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class EMIDeviceAdminModule : Module() {
    companion object {
        private const val TAG = "EMIDeviceAdminModule"
        private const val REQUEST_CODE_ENABLE_ADMIN = 1001
    }

    private val context: Context
        get() = appContext.reactContext ?: throw Exception("React context is null")

    private val activity: Activity?
        get() = appContext.currentActivity

    private val dpm: DevicePolicyManager
        get() = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private val adminComponent: ComponentName
        get() = ComponentName(context, EMIDeviceAdminReceiver::class.java)

    override fun definition() = ModuleDefinition {
        Name("EMIDeviceAdmin")

        AsyncFunction("isAdminActive") {
            try {
                val isActive = dpm.isAdminActive(adminComponent)
                Log.d(TAG, "isAdminActive: $isActive")
                isActive
            } catch (e: Exception) {
                Log.e(TAG, "isAdminActive error: ${e.message}")
                false
            }
        }

        AsyncFunction("requestAdmin") { promise: Promise ->
            try {
                val currentActivity = activity
                if (currentActivity == null) {
                    Log.e(TAG, "requestAdmin: No activity")
                    promise.resolve("no_activity")
                    return@AsyncFunction
                }

                if (dpm.isAdminActive(adminComponent)) {
                    Log.d(TAG, "requestAdmin: Already active")
                    promise.resolve("already_active")
                    return@AsyncFunction
                }

                Log.d(TAG, "requestAdmin: Starting admin request")
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "EMI Lock requires Device Admin permissions to:\n" +
                        "• Lock your device when payment is overdue\n" +
                        "• Prevent unauthorized app removal\n" +
                        "• Protect your device investment")
                }
                currentActivity.startActivityForResult(intent, REQUEST_CODE_ENABLE_ADMIN)
                promise.resolve("requested")
            } catch (e: Exception) {
                Log.e(TAG, "requestAdmin error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        AsyncFunction("lockDevice") { promise: Promise ->
            try {
                if (!dpm.isAdminActive(adminComponent)) {
                    Log.e(TAG, "lockDevice: Admin not active")
                    promise.resolve("not_admin")
                    return@AsyncFunction
                }
                Log.d(TAG, "lockDevice: Locking now")
                dpm.lockNow()
                promise.resolve("locked")
            } catch (e: Exception) {
                Log.e(TAG, "lockDevice error: ${e.message}")
                promise.resolve("error: ${e.message}")
            }
        }

        AsyncFunction("isDeviceOwner") {
            try {
                val isOwner = dpm.isDeviceOwnerApp(context.packageName)
                Log.d(TAG, "isDeviceOwner: $isOwner")
                isOwner
            } catch (e: Exception) {
                Log.e(TAG, "isDeviceOwner error: ${e.message}")
                false
            }
        }
    }
}
