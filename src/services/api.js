// ============================================================
// API Client — Comunicación con el backend Yape Bot v3
// Incluye ciclo de vida robusto de FCM Push, diagnósticos y caché
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { logEvent, EVENT_TYPES } from './eventLogger';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const STORAGE_KEYS = {
  SERVER_URL: '@yape_server_url',
  API_KEY: '@yape_api_key',
};

export const PUSH_STORAGE_KEYS = {
  FCM_TOKEN: '@yape_fcm_token',
  PENDING_TOKEN: '@yape_pending_fcm_token',
  TOKEN_TYPE: '@yape_push_token_type',
  PUSH_STATUS: '@yape_push_status',
  REGISTERED_AT: '@yape_push_registered_at',
  LAST_ATTEMPT_AT: '@yape_push_last_attempt_at',
  LAST_ERROR: '@yape_push_last_error',
};

let cachedUrl = null;
let cachedKey = null;

export async function getConfig() {
  if (cachedUrl && cachedKey) return { url: cachedUrl, key: cachedKey };
  let url = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
  const key = await AsyncStorage.getItem(STORAGE_KEYS.API_KEY);
  
  if (url && !url.startsWith('http')) {
    url = `http://${url}`;
  }
  
  cachedUrl = url;
  cachedKey = key;
  return { url, key };
}

export async function saveConfig(url, key) {
  // Normalizar URL: quitar trailing slash y asegurar http://
  let cleanUrl = url?.trim().replace(/\/+$/, '') || '';
  if (cleanUrl && !cleanUrl.startsWith('http')) {
    cleanUrl = `http://${cleanUrl}`;
  }
  const cleanKey = key?.trim() || '';
  
  await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, cleanUrl);
  await AsyncStorage.setItem(STORAGE_KEYS.API_KEY, cleanKey);
  cachedUrl = cleanUrl;
  cachedKey = cleanKey;

  // Auto-sincronizar token FCM si había uno pendiente o generado
  try {
    const pendingToken = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.PENDING_TOKEN) 
      || await AsyncStorage.getItem(PUSH_STORAGE_KEYS.FCM_TOKEN);
    if (pendingToken && cleanUrl && cleanKey) {
      console.log('saveConfig: Token FCM detectado, auto-sincronizando con backend...');
      await registerPushToken();
    }
  } catch (e) {
    console.warn('Error auto-sincronizando token en saveConfig:', e.message);
  }
}

export async function isConfigured() {
  const { url, key } = await getConfig();
  return !!(url && key);
}

// ============================================================
// Cache en memoria con TTL para requests GET
// ============================================================
const apiCache = new Map();
const CACHE_TTL = {
  '/dashboard': 20000,        // 20s — datos cambian poco
  '/orders/pending': 10000,   // 10s — pedidos se actualizan
  '/orders/all': 10000,       // 10s
  '/reports/weekly': 60000,   // 60s — reportes cambian poco
  '/reports/daily': 30000,    // 30s
  '/notifications': 15000,    // 15s
  '/push-status': 5000,       // 5s
};

function getCachedResponse(endpoint) {
  const cached = apiCache.get(endpoint);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > (CACHE_TTL[endpoint] || 15000)) {
    apiCache.delete(endpoint);
    return null;
  }
  return cached.data;
}

function setCachedResponse(endpoint, data) {
  if (CACHE_TTL[endpoint]) {
    apiCache.set(endpoint, { data, timestamp: Date.now() });
  }
}

// Invalidar caché cuando hacemos POST (mutaciones)
function invalidateCache() {
  apiCache.clear();
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const { url, key } = await getConfig();
  if (!url || !key) throw new Error('Servidor no configurado. Ve a Configuración.');

  // Usar caché solo para GET
  if (method === 'GET') {
    const cached = getCachedResponse(endpoint);
    if (cached) return cached;
  } else {
    // POST/PUT/DELETE invalidan caché
    invalidateCache();
  }

  const doFetch = async () => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key,
      },
    };

    if (body) options.body = JSON.stringify(body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    options.signal = controller.signal;

    try {
      const response = await fetch(`${url}/api${endpoint}`, options);
      clearTimeout(timeout);

      if (response.status === 401) {
        throw new Error('API Key inválida. Verifica en Configuración.');
      }

      const data = await response.json();
      if (!data.ok && data.error) throw new Error(data.error);

      // Guardar en caché si es GET
      if (method === 'GET') setCachedResponse(endpoint, data);

      return data;
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('Timeout: el servidor no respondió en 15s.');
      }
      throw error;
    }
  };

  // Reintento automático (1 vez) para errores de red
  try {
    return await doFetch();
  } catch (firstError) {
    // No reintentar errores de auth o validación
    if (firstError.message.includes('API Key') || firstError.message.includes('configurado')) {
      throw firstError;
    }
    // Esperar 1s y reintentar
    await new Promise(r => setTimeout(r, 1000));
    try {
      return await doFetch();
    } catch (retryError) {
      throw firstError; // Lanzar el error original
    }
  }
}

// ============================================================
// GESTIÓN DE NOTIFICACIONES PUSH (FCM NATIVO)
// ============================================================

/**
 * Crea o verifica el canal de notificaciones Android con alta prioridad y sonido
 */
export async function setupNotificationChannel() {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Pedidos YapeBot',
        description: 'Notificaciones de ventas, pedidos y alertas de CDKeys/YapeBot',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8a2be2',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
      return true;
    } catch (e) {
      console.warn('Error configurando canal Android:', e.message);
      return false;
    }
  }
  return true;
}

/**
 * Ciclo de vida completo para registro y sincronización de Push Token
 */
export async function registerPushToken() {
  const now = new Date().toISOString();
  await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ATTEMPT_AT, now);

  if (!Device.isDevice) {
    await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'emulator_unsupported');
    return { ok: false, status: 'emulator_unsupported', error: 'Dispositivo emulador no soporta FCM' };
  }

  try {
    // 1. Asegurar canal Android incondicionalmente
    await setupNotificationChannel();

    // 2. Comprobar permisos POST_NOTIFICATIONS
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'permission_denied');
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ERROR, 'Permiso de notificaciones denegado en Android');
      await logEvent('FCM', 'Permiso de notificación denegado', '', EVENT_TYPES.BACKEND_ERROR);
      return { ok: false, status: 'permission_denied', error: 'Permisos de notificación denegados' };
    }

    // 3. Obtener Device Push Token (FCM Nativo)
    let fcmToken = null;
    try {
      const deviceToken = await Notifications.getDevicePushTokenAsync();
      fcmToken = deviceToken?.data;
      if (!fcmToken || typeof fcmToken !== 'string') {
        throw new Error('El sistema devolvió un token FCM vacío');
      }
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.FCM_TOKEN, fcmToken);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.TOKEN_TYPE, 'fcm');
    } catch (fcmErr) {
      console.warn('Error obteniendo token FCM nativo:', fcmErr.message);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'firebase_error');
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ERROR, `FCM no disponible: ${fcmErr.message}`);
      await logEvent('FCM', 'FCM nativo no disponible', fcmErr.message, EVENT_TYPES.BACKEND_ERROR);
      return { ok: false, status: 'firebase_error', error: fcmErr.message };
    }

    // 4. Comprobar si servidor está configurado
    const configured = await isConfigured();
    if (!configured) {
      // Guardar token como pendiente para no perderlo
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PENDING_TOKEN, fcmToken);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'pending_config');
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ERROR, 'Servidor no configurado en Configuración.');
      console.log('Push: FCM generado pero pendiente de vincular al servidor.');
      await logEvent('FCM', 'FCM generado localmente (pendiente de config)', `${fcmToken.substring(0, 16)}...`, EVENT_TYPES.SYSTEM_STATUS);
      return { ok: true, status: 'pending_config', token: fcmToken };
    }

    // 5. Enviar token al backend
    try {
      const deviceId = Device.modelName || `${Device.brand || 'android'}_${Device.osBuildId || 'device'}`;
      await apiRequest('/push-token', 'POST', {
        token: fcmToken,
        type: 'fcm',
        device_id: deviceId
      });

      // Confirmado con éxito en backend
      await AsyncStorage.removeItem(PUSH_STORAGE_KEYS.PENDING_TOKEN);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'registered');
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.REGISTERED_AT, new Date().toISOString());
      await AsyncStorage.removeItem(PUSH_STORAGE_KEYS.LAST_ERROR);

      console.log('Push: FCM token registrado exitosamente en el servidor.');
      await logEvent('FCM', 'Token FCM registrado con servidor', `${fcmToken.substring(0, 16)}...`, EVENT_TYPES.BACKEND_SUCCESS);
      return { ok: true, status: 'registered', token: fcmToken };

    } catch (syncErr) {
      console.warn('Push: error enviando token a backend:', syncErr.message);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PENDING_TOKEN, fcmToken);
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.PUSH_STATUS, 'sync_error');
      await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ERROR, syncErr.message);
      await logEvent('FCM', 'Fallo al sincronizar token con servidor', syncErr.message, EVENT_TYPES.BACKEND_ERROR);
      return { ok: false, status: 'sync_error', token: fcmToken, error: syncErr.message };
    }

  } catch (e) {
    console.warn('Push: error general en registerPushToken:', e.message);
    await AsyncStorage.setItem(PUSH_STORAGE_KEYS.LAST_ERROR, e.message);
    return { ok: false, status: 'error', error: e.message };
  }
}

/**
 * Consulta el estado consolidado de Push para Diagnóstico
 */
export async function getPushDiagnosticStatus() {
  const fcmToken = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.FCM_TOKEN);
  const pendingToken = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.PENDING_TOKEN);
  const tokenType = (await AsyncStorage.getItem(PUSH_STORAGE_KEYS.TOKEN_TYPE)) || 'fcm';
  const status = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.PUSH_STATUS);
  const registeredAt = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.REGISTERED_AT);
  const lastAttemptAt = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.LAST_ATTEMPT_AT);
  const lastError = await AsyncStorage.getItem(PUSH_STORAGE_KEYS.LAST_ERROR);
  const lastPushReceived = await AsyncStorage.getItem('@yape_last_push_received');

  let permissions = null;
  let channel = null;

  try {
    permissions = await Notifications.getPermissionsAsync();
  } catch (e) {}

  try {
    if (Platform.OS === 'android') {
      channel = await Notifications.getNotificationChannelAsync('default');
    }
  } catch (e) {}

  // Determinar código y badge visual (Fases 3 y 4)
  let badge = { code: 'red', text: 'No Registrado', detail: 'Pulsa el botón para registrar token.' };

  if (permissions && permissions.status !== 'granted') {
    badge = { code: 'orange', text: 'Permiso Denegado', detail: 'Concede permisos de notificación en Ajustes de Android.' };
  } else if (Platform.OS === 'android' && channel && channel.importance === Notifications.AndroidImportance.NONE) {
    badge = { code: 'orange', text: 'Canal Silenciado', detail: 'El canal "Pedidos YapeBot" está bloqueado en Android.' };
  } else if (status === 'registered' && fcmToken) {
    badge = { code: 'green', text: 'Activo (FCM)', detail: 'Token registrado y sincronizado con el servidor.' };
  } else if (status === 'pending_config') {
    badge = { code: 'yellow', text: 'Servidor no configurado', detail: 'Token FCM generado. Ingresa la URL y API Key en Configuración.' };
  } else if (status === 'sync_error' || pendingToken) {
    badge = { code: 'yellow', text: 'Pendiente de sincronizar', detail: lastError || 'Fallo de red al contactar servidor.' };
  } else if (status === 'firebase_error') {
    badge = { code: 'red', text: 'FCM No Disponible', detail: lastError || 'Google Play Services o Firebase fallaron.' };
  } else if (status === 'permission_denied') {
    badge = { code: 'orange', text: 'Permiso Denegado', detail: lastError || 'Permiso denegado por el usuario.' };
  }

  const maskedToken = fcmToken && fcmToken.length > 16 
    ? `${fcmToken.substring(0, 8)}...${fcmToken.substring(fcmToken.length - 6)}` 
    : (fcmToken || null);

  return {
    badge,
    fcmToken,
    maskedToken,
    pendingToken,
    tokenType,
    status,
    registeredAt,
    lastAttemptAt,
    lastError,
    lastPushReceived,
    permissions,
    channel,
  };
}

// ============================================================
// Endpoints API YapeBot
// ============================================================

export const api = {
  // Push Notifications
  registerPushToken,
  setupNotificationChannel,
  getPushDiagnosticStatus,
  getPushStatus: () => apiRequest('/push-status'),
  testPushNotification: () => apiRequest('/test-push', 'POST'),

  // Control nativo de NotificationListener (para Xiaomi POCO M5s)
  rebindListener: async () => {
    try {
      const { NativeModules } = require('react-native');
      const mod = NativeModules.RNAndroidNotificationListener;
      if (mod && typeof mod.rebindListener === 'function') {
        return await mod.rebindListener();
      }
      return false;
    } catch (e) {
      console.warn('Error en rebindListener:', e.message);
      return false;
    }
  },

  isListenerConnected: async () => {
    try {
      const { NativeModules } = require('react-native');
      const mod = NativeModules.RNAndroidNotificationListener;
      if (mod && typeof mod.isServiceConnected === 'function') {
        return await mod.isServiceConnected();
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  getPermissionStatus: async () => {
    try {
      const { NativeModules } = require('react-native');
      const mod = NativeModules.RNAndroidNotificationListener;
      if (mod && typeof mod.getPermissionStatus === 'function') {
        const status = await mod.getPermissionStatus();
        return status !== 'denied';
      }
      return false;
    } catch (e) {
      return false;
    }
  },

  requestListenerPermission: () => {
    try {
      const { NativeModules } = require('react-native');
      const mod = NativeModules.RNAndroidNotificationListener;
      if (mod && typeof mod.requestPermission === 'function') {
        mod.requestPermission();
      }
    } catch (e) {}
  },

  // Dashboard
  getDashboard: () => apiRequest('/dashboard'),

  // Pedidos
  getPendingOrders: () => apiRequest('/orders/pending'),
  getAllOrders: (status) => apiRequest(`/orders/all${status && status !== 'all' ? `?status=${status}` : ''}`),
  getOrderDetails: (id) => apiRequest(`/orders/${id}`),
  approveOrder: (id) => apiRequest(`/orders/${id}/approve`, 'POST'),
  cancelOrder: (id) => apiRequest(`/orders/${id}/cancel`, 'POST'),
  setOrderStatus: (id, status) => apiRequest(`/orders/${id}/status`, 'POST', { status }),

  // v3: Price Override (OfficeTech)
  overridePrice: (id, price, note = '') => apiRequest(`/orders/${id}/override-price`, 'POST', { price, note }),

  // Reportes
  getDailyReport: (date) => apiRequest(`/reports/daily${date ? `?date=${date}` : ''}`),
  getWeeklyReport: () => apiRequest('/reports/weekly'),
  getMonthlyReport: () => apiRequest('/reports/monthly'),

  // Notificaciones
  getNotifications: (limit = 20) => apiRequest(`/notifications?limit=${limit}`),

  // v3: Logs del sistema
  getLogs: (limit = 50, level = null, category = null) => {
    let qs = `?limit=${limit}`;
    if (level) qs += `&level=${level}`;
    if (category) qs += `&category=${category}`;
    return apiRequest(`/logs${qs}`);
  },
  clearLogs: (olderThanDays = 0) => apiRequest('/logs/clear', 'POST', { older_than_days: olderThanDays }),

  // Health
  testConnection: async () => {
    const { url, key } = await getConfig();
    if (!url || !key) return { ok: false, error: 'No configurado' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      const data = await res.json();
      return { ok: data.status === 'ok', data };
    } catch (e) {
      clearTimeout(timeout);
      return { ok: false, error: e.name === 'AbortError' || e.message.includes('timeout') || e.message.includes('AbortSignal') ? 'Timeout: Servidor no responde' : e.message };
    }
  },

  // Tests Internos — usa el endpoint protegido /api/test-webhook
  testWebhook: async (text) => {
    return apiRequest('/test-webhook', 'POST', { sender: 'Yape', text });
  },

  testOCR: async (imageUri, amount = '0') => {
    const { url, key } = await getConfig();
    if (!url || !key) throw new Error('Servidor no configurado.');
    
    let safeUri = imageUri;
    if (Platform.OS === 'android' && !safeUri.startsWith('file://') && !safeUri.startsWith('content://') && !safeUri.startsWith('http')) {
      safeUri = 'file://' + safeUri;
    }

    const formData = new FormData();
    formData.append('amount', amount);
    formData.append('image', {
      uri: safeUri,
      name: 'test_ocr.jpg',
      type: 'image/jpeg',
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${url}/api/test-ocr`, {
        method: 'POST',
        headers: {
          'X-API-Key': key,
        },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response.json();
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') throw new Error('Timeout: OCR tardó más de 30s.');
      throw e;
    }
  },
};
