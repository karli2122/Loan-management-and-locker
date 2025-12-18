const { Platform, NativeModules } = require('react-native');

let native = {};

if (Platform.OS === 'android') {
  // Use DeviceAdmin which is the name exported by DeviceAdminModule.java
  native = NativeModules.DeviceAdmin || NativeModules.EMIDeviceAdmin || NativeModules.DevicePolicyModule || {};
}

module.exports = native;
module.exports.default = native;
