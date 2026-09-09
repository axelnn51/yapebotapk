import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { AppRegistry } from 'react-native';
import { parseBankNotification, extractFullText, isMonitoredApp } from './src/services/bankParser';
import { logEvent, EVENT_TYPES } from './src/services/eventLogger';
import { enqueueAndSend, flushQueue } from './src/services/notificationQueue';

// ============================================================
// Función de envío directo al backend autenticado
// ============================================================
const sendToBackend = async (parsed) => {
  const url = await AsyncStorage.getItem('@yape_server_url');
  const key = await AsyncStorage.getItem('@yape_api_key');

  if (!url || !key) {
    throw new Error('Servidor o API Key no configurados en Configuración.');
  }

  const cleanUrl = url.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${cleanUrl}/api/incoming-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
      body: JSON.stringify({
        sender: parsed.senderName || parsed.title || parsed.provider || 'Yape/Plin',
        text: parsed.rawText,
        amount: parsed.amount,
        securityCode: parsed.securityCode,
        provider: parsed.provider,
        packageName: parsed.packageName,
        timestamp: parsed.timestamp,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

// ============================================================
// Headless JS Task — Captura notificaciones de Yape/Plin/BBVA
// en segundo plano, encola con reintentos y envía al backend
// ============================================================
const headlessNotificationListener = async ({ notification }) => {
  if (!notification) return;

  try {
    const notif = JSON.parse(notification);
    const app = notif.app || 'unknown';

    // 1. Guardar Heartbeat (indica que el listener nativo y Headless están vivos)
    try {
      await AsyncStorage.setItem('@yape_listener_heartbeat', JSON.stringify({
        time: new Date().toISOString(),
        app,
        alive: true,
      }));
    } catch (e) { /* ignore */ }

    // 2. Extraer todo el texto disponible (text, bigText, title, etc.)
    const fullText = extractFullText(notif);

    // 3. Registrar RAW de diagnóstico para TODA notificación de app monitoreada
    const rawRecord = {
      time: new Date().toISOString(),
      app,
      title: (notif.title || '').substring(0, 120),
      text: (notif.text || '').substring(0, 200),
      bigText: (notif.bigText || '').substring(0, 200),
      fullText: fullText.substring(0, 300),
    };

    // Guardar último raw para diagnóstico inmediato
    try {
      await AsyncStorage.setItem('@yape_debug_last_raw', JSON.stringify(rawRecord));
    } catch (e) { /* ignore */ }

    // Loguear evento RAW
    await logEvent(
      app.includes('.') ? app.split('.').pop() : app,
      'Notificación recibida en Android',
      `${notif.title ? notif.title + ': ' : ''}${fullText.substring(0, 80)}`,
      EVENT_TYPES.NOTIFICATION_RAW
    );

    // 4. Verificar si es una app bancaria monitoreada
    if (!isMonitoredApp(app, fullText)) {
      await logEvent(
        'FILTRO',
        'App no monitoreada (ignorada)',
        `Package: ${app}`,
        EVENT_TYPES.PAYMENT_IGNORED
      );
      return;
    }

    // 5. Parsear notificación bancaria
    const parsed = parseBankNotification(notif);

    // Guardar timestamp de última actividad bancaria por proveedor
    const providerKey = (parsed.provider || 'unknown').toLowerCase();
    await AsyncStorage.setItem(`@yape_last_${providerKey}`, new Date().toISOString());
    await AsyncStorage.setItem('@yape_last_bank_any', new Date().toISOString());

    // 6. Verificar si es un pago real
    if (!parsed.isPayment) {
      await logEvent(
        parsed.provider,
        'Notificación no corresponde a pago',
        parsed.rawText.substring(0, 70),
        EVENT_TYPES.PAYMENT_IGNORED
      );

      await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
        time: new Date().toISOString(),
        text: parsed.rawText.substring(0, 80),
        app,
        provider: parsed.provider,
        status: 'ignored',
        reason: 'No es pago',
      }));
      return;
    }

    // 7. Es un pago bancario válido -> Encolar e intentar envío
    await logEvent(
      parsed.provider,
      `💰 Pago detectado S/ ${parsed.amount}`,
      `De: ${parsed.senderName}${parsed.securityCode ? ' | Cód: ' + parsed.securityCode : ''}`,
      EVENT_TYPES.PAYMENT_DETECTED
    );

    const queueResult = await enqueueAndSend(parsed, sendToBackend);

    // Actualizar estado para la UI
    if (queueResult.ok && queueResult.status === 'sent') {
      await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
        time: new Date().toISOString(),
        text: parsed.rawText.substring(0, 80),
        app,
        provider: parsed.provider,
        amount: parsed.amount,
        sender: parsed.senderName,
        securityCode: parsed.securityCode,
        status: 'sent',
        response: 'HTTP 200 (OK)',
      }));

      // Incrementar contador de lecturas exitosas
      try {
        const countStr = await AsyncStorage.getItem('@yape_notification_count');
        const count = parseInt(countStr || '0', 10) + 1;
        await AsyncStorage.setItem('@yape_notification_count', String(count));
      } catch (e) { /* ignore */ }

      // Intentar vaciar el resto de la cola en segundo plano si había pendientes
      flushQueue(sendToBackend).catch(() => {});
    } else {
      await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
        time: new Date().toISOString(),
        text: parsed.rawText.substring(0, 80),
        app,
        provider: parsed.provider,
        amount: parsed.amount,
        sender: parsed.senderName,
        securityCode: parsed.securityCode,
        status: queueResult.status === 'duplicate_ignored' ? 'duplicate' : 'queued',
        error: queueResult.error || null,
        response: queueResult.error || 'Encolado',
      }));
    }

  } catch (e) {
    console.warn(`[YapeBot Listener] Error general: ${e.message}`);
    await logEvent('LISTENER', `Error en listener: ${e.message}`, '', EVENT_TYPES.BACKEND_ERROR);
    try {
      await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
        time: new Date().toISOString(),
        status: 'error',
        error: e.message,
      }));
    } catch (storageErr) { /* ignore */ }
  }
};

// ============================================================
// Registrar tarea Headless JS de forma directa y garantizada
// ============================================================
const HEADLESS_TASK_NAME = 'RNAndroidNotificationListenerHeadlessJs';
AppRegistry.registerHeadlessTask(
  HEADLESS_TASK_NAME,
  () => headlessNotificationListener
);

// Registrar App principal
registerRootComponent(App);
