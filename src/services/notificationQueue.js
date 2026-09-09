// ============================================================
// Notification Queue & Idempotency Manager — YapeBot Mobile
// Garantiza que ningún pago se pierda y ninguno se duplique
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logEvent, EVENT_TYPES } from './eventLogger';

const QUEUE_STORAGE_KEY = '@yape_offline_queue';
const PROCESSED_IDS_KEY = '@yape_processed_ids';
const MAX_PROCESSED_HISTORY = 500;
const MAX_RETRIES = 10;

/**
 * Genera un ID idempotente y determinista para una notificación bancaria
 * Basado en: paquete, timestamp aproximado (ventana de 60s), monto y texto
 */
export function generateNotificationId(parsed) {
  const timeWindow = Math.floor((parsed.timestamp || Date.now()) / 60000); // agrupar en ventana de 1 min
  const cleanRaw = (parsed.rawText || '').replace(/\s+/g, '').toLowerCase().substring(0, 40);
  const provider = parsed.provider || 'BANK';
  const amountStr = parsed.amount !== null ? String(parsed.amount) : '0';
  
  return `${provider}_${amountStr}_${timeWindow}_${cleanRaw}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Verifica si una notificación ya fue procesada anteriormente
 */
export async function isDuplicate(notificationId) {
  try {
    const json = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
    const processedIds = json ? JSON.parse(json) : [];
    return processedIds.includes(notificationId);
  } catch (e) {
    return false;
  }
}

/**
 * Marca un ID de notificación como procesado para idempotencia
 */
export async function markAsProcessed(notificationId) {
  try {
    const json = await AsyncStorage.getItem(PROCESSED_IDS_KEY);
    let processedIds = json ? JSON.parse(json) : [];
    if (!Array.isArray(processedIds)) processedIds = [];

    if (!processedIds.includes(notificationId)) {
      processedIds.unshift(notificationId);
      if (processedIds.length > MAX_PROCESSED_HISTORY) {
        processedIds = processedIds.slice(0, MAX_PROCESSED_HISTORY);
      }
      await AsyncStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(processedIds));
    }
  } catch (e) { /* ignore */ }
}

/**
 * Obtiene los elementos de la cola actual
 */
export async function getQueue() {
  try {
    const json = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    return [];
  }
}

/**
 * Guarda los elementos en la cola persistente
 */
async function saveQueue(queue) {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (e) { /* ignore */ }
}

/**
 * Encola una notificación bancaria y dispara el intento de envío
 * @param {Object} parsedNotification Resultado de parseBankNotification
 * @param {Function} sendFunction Función async (parsed) => result
 * @returns {Promise<{ ok: boolean, status: string, id: string }>}
 */
export async function enqueueAndSend(parsedNotification, sendFunction) {
  const id = generateNotificationId(parsedNotification);

  // 1. Verificar idempotencia
  const duplicate = await isDuplicate(id);
  if (duplicate) {
    await logEvent(
      parsedNotification.provider,
      'Notificación duplicada ignorada',
      `ID: ${id} ya fue procesada`,
      EVENT_TYPES.PAYMENT_IGNORED
    );
    return { ok: true, status: 'duplicate_ignored', id };
  }

  // Registrar ID para evitar re-entrancia
  await markAsProcessed(id);

  // 2. Crear elemento de cola
  const queueItem = {
    id,
    parsed: parsedNotification,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    status: 'pending',
    lastError: null,
  };

  let queue = await getQueue();
  queue.push(queueItem);
  await saveQueue(queue);

  await logEvent(
    parsedNotification.provider,
    `Encolado para envío: S/ ${parsedNotification.amount || '?'}`,
    `ID: ${id} | Cola: ${queue.length}`,
    EVENT_TYPES.QUEUE_ENQUEUED
  );

  // 3. Intentar envío inmediato si se proveyó la función
  if (typeof sendFunction === 'function') {
    return await processItem(id, sendFunction);
  }

  return { ok: true, status: 'enqueued', id };
}

/**
 * Procesa un elemento específico de la cola
 */
async function processItem(itemId, sendFunction) {
  let queue = await getQueue();
  const itemIndex = queue.findIndex(q => q.id === itemId);
  if (itemIndex === -1) return { ok: false, status: 'not_found' };

  const item = queue[itemIndex];
  item.lastAttemptAt = new Date().toISOString();
  item.retryCount += 1;

  try {
    await logEvent(
      item.parsed.provider,
      `Enviando al backend (intento #${item.retryCount})`,
      `Monto: S/ ${item.parsed.amount || '?'}`,
      EVENT_TYPES.BACKEND_SENDING
    );

    const result = await sendFunction(item.parsed);

    // Éxito: eliminar de la cola de pendientes
    queue = queue.filter(q => q.id !== itemId);
    await saveQueue(queue);

    await logEvent(
      'BACKEND',
      `✅ Envío exitoso (HTTP 200)`,
      `S/ ${item.parsed.amount} | Respuesta: ${JSON.stringify(result?.result || result?.message || 'OK')}`,
      EVENT_TYPES.BACKEND_SUCCESS
    );

    return { ok: true, status: 'sent', result };
  } catch (error) {
    item.lastError = error.message;
    item.status = item.retryCount >= MAX_RETRIES ? 'failed' : 'pending';
    queue[itemIndex] = item;
    await saveQueue(queue);

    await logEvent(
      'BACKEND',
      `❌ Error en envío: ${error.message}`,
      `Se mantendrá en cola (reintentos: ${item.retryCount}/${MAX_RETRIES})`,
      EVENT_TYPES.BACKEND_ERROR
    );

    return { ok: false, status: item.status, error: error.message };
  }
}

/**
 * Procesa todos los elementos pendientes en la cola
 * @param {Function} sendFunction Función async (parsed) => result
 * @returns {Promise<{ processed: number, remaining: number }>}
 */
export async function flushQueue(sendFunction) {
  if (typeof sendFunction !== 'function') return { processed: 0, remaining: 0 };

  const queue = await getQueue();
  const pendingItems = queue.filter(q => q.status === 'pending');
  let processed = 0;

  for (const item of pendingItems) {
    const res = await processItem(item.id, sendFunction);
    if (res.ok) {
      processed += 1;
    }
  }

  const updatedQueue = await getQueue();
  return { processed, remaining: updatedQueue.length };
}

/**
 * Limpia la cola por completo (solo para mantenimiento)
 */
export async function clearQueue() {
  await AsyncStorage.removeItem(QUEUE_STORAGE_KEY);
}
