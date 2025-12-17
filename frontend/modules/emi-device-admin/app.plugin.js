const withDeviceAdmin = require('../../plugins/withDeviceAdmin');

module.exports = function withEmiDeviceAdmin(config) {
  return withDeviceAdmin(config);
};
