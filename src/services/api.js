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

async function apiRequest(endpoint, method = 'GET', body = null) {
  const { url, key } = await getConfig();
  if (!url || !key) throw new Error('Servidor no configurado. Ve a Configuración.');

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
    return data;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Timeout: el servidor no respondió en 15s.');
    }
    throw error;
  }
}

// ============================================================
// Endpoints
// ============================================================

export const api = {
  // Push Notifications
  registerPushToken: async () => {
    if (!Device.isDevice) return;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8a2be2',
      });
    }

    try {
      const projectId = '44fc55a5-cf96-4905-9e8e-c030d393ac41'; // From app.json
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await apiRequest('/push-token', 'POST', { token });
      return token;
    } catch (e) {
      console.warn('Error registerPushToken:', e);
    }
  },
  testPushNotification: () => apiRequest('/test-push', 'POST'),

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
