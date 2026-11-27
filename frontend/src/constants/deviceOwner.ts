/**
 * The Device Owner / Device Admin component registered by the Expo native
 * module (see EMIDeviceAdminModule.kt: ComponentName(context, EMIDeviceAdminReceiver)).
 *
 * dpm set-device-owner must use this exact package + class. The application
 * id comes from app.config.js (com.paylock.client).
 */
export const CLIENT_PACKAGE = 'com.paylock.client';
export const ADMIN_PACKAGE = 'com.paylock.admin';
export const DEVICE_OWNER_RECEIVER = 'expo.modules.emideviceadmin.EMIDeviceAdminReceiver';
export const DEVICE_OWNER_COMPONENT = `${CLIENT_PACKAGE}/${DEVICE_OWNER_RECEIVER}`;
export const DEVICE_OWNER_DPM_COMMAND = `adb shell dpm set-device-owner ${DEVICE_OWNER_COMPONENT}`;
