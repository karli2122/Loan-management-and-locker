const { Platform, NativeModules } = require('react-native');

let native = {};

if (Platform.OS === 'android') {
  try {
    // Prefer the Expo modules API if available
    const { requireNativeModule } = require('expo-modules-core');
    native = requireNativeModule('EMIDeviceAdmin');
  } catch (error) {
    // Fall back to plain NativeModules when the module isn't linked or during web builds
    native = NativeModules.EMIDeviceAdmin || NativeModules.DevicePolicyModule || {};
  }
}

module.exports = native;
module.exports.default = native;
