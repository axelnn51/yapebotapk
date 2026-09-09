// ============================================================
// Event Logger — YapeBot Mobile
// Historial de eventos locales para monitoreo y diagnóstico en vivo
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@yape_local_events';
const MAX_EVENTS = 100;

export const EVENT_TYPES = {
  NOTIFICATION_RAW: 'NOTIF_RAW',
  PAYMENT_DETECTED: 'PAYMENT_DETECTED',
  PAYMENT_IGNORED: 'PAYMENT_IGNORED',
  BACKEND_SENDING: 'BACKEND_SENDING',
  BACKEND_SUCCESS: 'BACKEND_SUCCESS',
  BACKEND_ERROR: 'BACKEND_ERROR',
  QUEUE_ENQUEUED: 'QUEUE_ENQUEUED',
  QUEUE_RETRY: 'QUEUE_RETRY',
  PUSH_RECEIVED: 'PUSH_RECEIVED',
  SYSTEM_STATUS: 'SYSTEM_STATUS',
};

/**
 * Agrega un evento a la lista local persistente
 * @param {string} source Origen del evento ('YAPE', 'PLIN', 'BBVA', 'BACKEND', 'APK', 'FCM', 'QUEUE')
 * @param {string} title Título breve (ej: 'Notificación recibida', 'S/ 35 detectado', 'HTTP 200')
 * @param {string} details Descripción detallada o metadata opcional
 * @param {string} type Tipo de evento (ver EVENT_TYPES)
 */
export async function logEvent(source, title, details = '', type = EVENT_TYPES.NOTIFICATION_RAW) {
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-PE', { hour12: false });
    
    const event = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: now.toISOString(),
      timeFormatted: timeStr,
      source: (source || 'SISTEMA').toUpperCase(),
      title,
      details: typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      type,
    };

    const existingJson = await AsyncStorage.getItem(STORAGE_KEY);
    let events = existingJson ? JSON.parse(existingJson) : [];
    if (!Array.isArray(events)) events = [];

    // Insertar al inicio (el más reciente primero)
    events.unshift(event);

    // Limitar tamaño
    if (events.length > MAX_EVENTS) {
      events = events.slice(0, MAX_EVENTS);
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    return event;
  } catch (err) {
    console.warn('[EventLogger] Error al guardar evento:', err.message);
    return null;
  }
}

/**
 * Obtiene los eventos registrados
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getEvents(limit = 50) {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    const events = JSON.parse(json);
    return Array.isArray(events) ? events.slice(0, limit) : [];
  } catch (err) {
    return [];
  }
}

/**
 * Limpia el historial de eventos
 */
export async function clearEvents() {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) { /* ignore */ }
}
