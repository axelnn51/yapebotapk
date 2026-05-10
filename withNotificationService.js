const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationService(config) {
  return withAndroidManifest(config, async (config) => {
    let androidManifest = config.modResults.manifest;

    const app = androidManifest.application[0];

    if (!app.service) {
      app.service = [];
    }

    const hasService = app.service.some(
      (s) => s.$['android:name'] === 'com.reactnativeandroidnotificationlistener.RNAndroidNotificationListener'
    );

    if (!hasService) {
      app.service.push({
        $: {
          'android:name': 'com.reactnativeandroidnotificationlistener.RNAndroidNotificationListener',
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'true'
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.service.notification.NotificationListenerService' } }
            ]
          }
        ]
      });
    }

    return config;
  });
};
