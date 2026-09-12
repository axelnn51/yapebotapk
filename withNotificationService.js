const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotificationService(config) {
  return withAndroidManifest(config, async (config) => {
    let androidManifest = config.modResults.manifest;

    const app = androidManifest.application[0];

    if (!app.service) {
      app.service = [];
    }
    if (!app.receiver) {
      app.receiver = [];
    }

    // 1. NotificationListenerService (paquete CORRECTO: com.lesimoes)
    const correctServiceName = 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListener';
    const hasService = app.service.some(
      (s) => s.$['android:name'] === correctServiceName
    );

    if (!hasService) {
      // Eliminar cualquier servicio con el nombre INCORRECTO que pudiera existir
      app.service = app.service.filter(
        (s) => s.$['android:name'] !== 'com.reactnativeandroidnotificationlistener.RNAndroidNotificationListener'
      );

      app.service.push({
        $: {
          'android:name': correctServiceName,
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

    // 2. HeadlessJsTaskService — CRÍTICO: ejecuta el código JS al recibir notificación
    const headlessServiceName = 'com.lesimoes.androidnotificationlistener.RNAndroidNotificationListenerHeadlessJsTaskService';
    const hasHeadless = app.service.some(
      (s) => s.$['android:name'] === headlessServiceName
    );
    if (!hasHeadless) {
      app.service.push({
        $: {
          'android:name': headlessServiceName,
          'android:exported': 'false',
        }
      });
    }

    // 3. BootUpReceiver — reinicia el listener después de reinicio del celular
    const bootReceiverName = 'com.lesimoes.androidnotificationlistener.BootUpReceiver';
    const hasBootReceiver = app.receiver.some(
      (r) => r.$['android:name'] === bootReceiverName
    );
    if (!hasBootReceiver) {
      // Eliminar cualquier receiver con nombre incorrecto (BootReceiver sin "Up")
      app.receiver = app.receiver.filter(
        (r) => r.$['android:name'] !== 'com.lesimoes.androidnotificationlistener.BootReceiver'
      );

      app.receiver.push({
        $: {
          'android:name': bootReceiverName,
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:permission': 'android.permission.RECEIVE_BOOT_COMPLETED',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }
            ],
            category: [
              { $: { 'android:name': 'android.intent.category.DEFAULT' } }
            ]
          }
        ]
      });
    }

    // 4. Firebase default notification channel ID meta-data (CRÍTICO para Android 13+)
    if (!app['meta-data']) {
      app['meta-data'] = [];
    }
    const hasDefaultChannel = app['meta-data'].some(
      (m) => m.$['android:name'] === 'com.google.firebase.messaging.default_notification_channel_id'
    );
    if (!hasDefaultChannel) {
      app['meta-data'].push({
        $: {
          'android:name': 'com.google.firebase.messaging.default_notification_channel_id',
          'android:value': 'default',
        }
      });
    }

    return config;
  });
};
