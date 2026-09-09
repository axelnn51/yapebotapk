// ============================================================
// API Client — Comunicación con el backend Yape Bot v3
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

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
// Endpoints
// ============================================================

export const api = {
  // Push Notifications
  registerPushToken: async () => {
    if (!Device.isDevice) return null;
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.warn('Push: permisos denegados');
        return null;
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Pedidos YapeBot',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#8a2be2',
          sound: 'default',
        });
      }

      // FCM Device Token PRIMERO (funciona con builds locales)
      try {
        const deviceToken = await Notifications.getDevicePushTokenAsync();
        const fcmToken = deviceToken.data;
        await apiRequest('/push-token', 'POST', { token: fcmToken, type: 'fcm' });
        await AsyncStorage.setItem('@yape_fcm_token', fcmToken);
        await AsyncStorage.setItem('@yape_push_token_type', 'fcm');
        console.log('Push: FCM device token registrado:', fcmToken.substring(0, 20) + '...');
        return fcmToken;
      } catch (fcmErr) {
        console.warn('FCM token no disponible, intentando Expo...', fcmErr.message);
      }

      // Fallback: Expo Push Token (solo funciona con EAS builds)
      try {
        const projectId = '44fc55a5-cf96-4905-9e8e-c030d393ac41';
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        await apiRequest('/push-token', 'POST', { token, type: 'expo' });
        await AsyncStorage.setItem('@yape_fcm_token', token);
        await AsyncStorage.setItem('@yape_push_token_type', 'expo');
        console.log('Push: Expo token registrado');
        return token;
      } catch (expoErr) {
        console.warn('Expo Push Token tampoco disponible:', expoErr.message);
        return null;
      }
    } catch (e) {
      console.warn('Push token error general:', e.message);
      return null;
    }
  },
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
