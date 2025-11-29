const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withDeviceAdmin(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Add Device Admin Receiver
    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }

    const application = androidManifest.application[0];

    if (!application.receiver) {
      application.receiver = [];
    }

    // Check if receiver already exists
    const receiverExists = application.receiver.some(
      receiver => receiver.$?.['android:name'] === 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver'
    );

    if (!receiverExists) {
      application.receiver.push({
        $: {
          'android:name': 'com.eamilock.DeviceAdminModule$MyDeviceAdminReceiver',
          'android:label': '@string/app_name',
          'android:description': '@string/app_name',
          'android:permission': 'android.permission.BIND_DEVICE_ADMIN',
          'android:exported': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.app.device_admin',
              'android:resource': '@xml/device_admin',
            },
          },
        ],
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.app.action.DEVICE_ADMIN_ENABLED',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
};
