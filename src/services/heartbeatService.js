// ============================================================
// Heartbeat Service — YapeBot Mobile
// Inspirado en JoseGordilloMendoza/LectorNotificacionesYape
// Mantiene al backend informado del estado del teléfono y del listener.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { getQueueStats } from './notificationQueue';

const { RNAndroidNotificationListener } = NativeModules;

let heartbeatInterval = null;
let lastHeartbeatStatus = {
  lastSuccess: null,
  lastAttempt: null,
  status: 'INACTIVO',
  error: null,
};

/**
 * Obtiene la configuración del servidor guardada en AsyncStorage
 */
async function getServerConfig() {
  try {
    const [savedUrl, savedKey] = await Promise.all([
      AsyncStorage.getItem('@yape_server_url'),
      AsyncStorage.getItem('@yape_api_key'),
    ]);
    return {
      serverUrl: savedUrl || 'https://yape.cdkeysperu.com',
      apiKey: savedKey || 'cdkeys-yape-2026-secret-key-prod',
    };
  } catch {
    return {
      serverUrl: 'https://yape.cdkeysperu.com',
      apiKey: 'cdkeys-yape-2026-secret-key-prod',
    };
  }
}

/**
 * Envía un latido único al backend
 */
export async function sendHeartbeat() {
  lastHeartbeatStatus.lastAttempt = Date.now();

  try {
    const { serverUrl, apiKey } = await getServerConfig();

    // 1. Verificar estado del listener de notificaciones
    let isConnected = false;
    try {
      if (RNAndroidNotificationListener && typeof RNAndroidNotificationListener.isServiceConnected === 'function') {
        isConnected = await RNAndroidNotificationListener.isServiceConnected();
      }
    } catch (e) {
      console.warn('[Heartbeat] Error consultando isServiceConnected:', e.message);
    }

    // 2. Obtener estadísticas de cola
    let queueStats = { pending: 0, failed: 0 };
    try {
      queueStats = await getQueueStats();
    } catch {}

    const payload = {
      device: Platform.constants ? `${Platform.constants.Brand || 'Android'} ${Platform.constants.Model || ''}`.trim() : 'POCO M5s',
      platform: Platform.OS,
      osVersion: Platform.Version,
      isListenerConnected: isConnected,
      queuePending: queueStats.pending,
      queueFailed: queueStats.failed,
      timestamp: Date.now(),
      clientVersion: '3.2.1',
    };

    const targetUrl = `${serverUrl.replace(/\/+$/, '')}/api/heartbeat`;
    
    // Timeout controlado de 8 segundos
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'User-Agent': 'YapeBot-Mobile/3.2.1',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      lastHeartbeatStatus.lastSuccess = Date.now();
      lastHeartbeatStatus.status = 'ACTIVO (OK)';
      lastHeartbeatStatus.error = null;
      return { success: true, timestamp: lastHeartbeatStatus.lastSuccess };
    } else {
      lastHeartbeatStatus.status = `FALLÓ (HTTP ${response.status})`;
      lastHeartbeatStatus.error = `HTTP ${response.status}`;
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    const msg = error.name === 'AbortError' ? 'Timeout (8s)' : error.message;
    lastHeartbeatStatus.status = 'ERROR';
    lastHeartbeatStatus.error = msg;
    return { success: false, error: msg };
  }
}

/**
 * Inicia el loop periódico de heartbeat (por defecto cada 2 minutos = 120,000 ms)
 */
export function startHeartbeat(intervalMs = 120000) {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  // Enviar el primero de inmediato
  sendHeartbeat();
  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, intervalMs);
}

/**
 * Detiene el loop periódico
 */
export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  lastHeartbeatStatus.status = 'DETENIDO';
}

/**
 * Retorna el último estado de latido
 */
export function getHeartbeatStatus() {
  return { ...lastHeartbeatStatus };
}
