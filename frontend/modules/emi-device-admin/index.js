const { NativeModules } = require('react-native');

const native = NativeModules.EMIDeviceAdmin || NativeModules.DevicePolicyModule || {};

module.exports = native;
module.exports.default = native;
