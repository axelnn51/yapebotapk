// ============================================================
// Payment History Service — YapeBot Mobile (v3.4)
// Almacenamiento local persistente e instantáneo de pagos capturados
// Permite visualización offline, conciliación y auditoría forense
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const PAYMENTS_STORAGE_KEY = '@yape_payments_history';
const MAX_HISTORY_ITEMS = 300;

/**
 * Genera un ID idempotente y determinista para una notificación bancaria
 */
export function generateNotificationId(parsed) {
  const timeWindow = Math.floor((parsed.timestamp || Date.now()) / 60000); // ventana de 1 min
  const cleanRaw = (parsed.rawText || parsed.fullText || '').replace(/\s+/g, '').toLowerCase().substring(0, 40);
  const provider = parsed.provider || 'BANK';
  const amountStr = parsed.amount !== null && parsed.amount !== undefined ? String(parsed.amount) : '0';
  
  return `${provider}_${amountStr}_${timeWindow}_${cleanRaw}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Guarda o actualiza un pago recibido en el historial local persistente
 * @param {Object} parsed Pago parseado por bankParser
 * @param {string} status 'sent' | 'queued' | 'duplicate' | 'error' | 'pending'
 * @param {Object|string} response Respuesta o detalle del servidor
 * @returns {Promise<Object>} Registro del pago guardado
 */
export async function saveLocalPayment(parsed, status = 'pending', response = null) {
  if (!parsed || !parsed.amount) return null;

  try {
    const id = parsed.id || generateNotificationId(parsed);
    const existingList = await getLocalPayments();

    const timestamp = parsed.timestamp || Date.now();
    const dateObj = new Date(timestamp);

    const newRecord = {
      id,
      amount: parsed.amount,
      sender: parsed.senderName || parsed.title || 'Cliente',
      provider: parsed.provider || 'Yape',
      securityCode: parsed.securityCode || null,
      rawText: parsed.rawText || parsed.fullText || '',
      packageName: parsed.packageName || '',
      timestamp,
      dateFormatted: dateObj.toISOString(),
      status, // 'sent' | 'queued' | 'duplicate' | 'error' | 'pending'
      response: typeof response === 'string' ? response : (response ? JSON.stringify(response) : null),
      updatedAt: new Date().toISOString(),
    };

    // Si ya existe el id, actualizarlo
    const existingIndex = existingList.findIndex(p => p.id === id);
    let updatedList;

    if (existingIndex >= 0) {
      updatedList = [...existingList];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        ...newRecord,
        // Mantener status si el nuevo es menos prioritario
        status: status !== 'pending' ? status : updatedList[existingIndex].status,
      };
    } else {
      updatedList = [newRecord, ...existingList];
      if (updatedList.length > MAX_HISTORY_ITEMS) {
        updatedList = updatedList.slice(0, MAX_HISTORY_ITEMS);
      }
    }

    await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(updatedList));
    return newRecord;
  } catch (e) {
    console.warn('[paymentHistory] Error al guardar pago:', e.message);
    return null;
  }
}

/**
 * Actualiza el estado de un pago específico en el historial
 * @param {string} id ID determinista del pago
 * @param {string} status 'sent' | 'queued' | 'duplicate' | 'error'
 * @param {string|Object} response Detalle o error
 */
export async function updateLocalPaymentStatus(id, status, response = null) {
  if (!id) return;
  try {
    const existingList = await getLocalPayments();
    const index = existingList.findIndex(p => p.id === id);
    if (index >= 0) {
      existingList[index].status = status;
      if (response) {
        existingList[index].response = typeof response === 'string' ? response : JSON.stringify(response);
      }
      existingList[index].updatedAt = new Date().toISOString();
      await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(existingList));
    }
  } catch (e) {
    console.warn('[paymentHistory] Error actualizando estado:', e.message);
  }
}

/**
 * Obtiene la lista completa de pagos almacenados localmente
 * @returns {Promise<Array>} Lista de pagos ordenados del más reciente al más antiguo
 */
export async function getLocalPayments() {
  try {
    const json = await AsyncStorage.getItem(PAYMENTS_STORAGE_KEY);
    if (!json) return [];
    const list = JSON.parse(json);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[paymentHistory] Error obteniendo pagos:', e.message);
    return [];
  }
}

/**
 * Calcula estadísticas y balance resumido de los pagos recibidos
 * @returns {Promise<Object>} Resumen financiero del día
 */
export async function getPaymentsStats() {
  try {
    const list = await getLocalPayments();

    const now = new Date();
    const todayYear = now.getFullYear();
    const todayMonth = now.getMonth();
    const todayDate = now.getDate();

    let totalToday = 0;
    let countToday = 0;
    let totalMonth = 0;
    let countMonth = 0;

    const byProviderToday = {
      Yape: { amount: 0, count: 0 },
      Plin: { amount: 0, count: 0 },
      Interbank: { amount: 0, count: 0 },
      BCP: { amount: 0, count: 0 },
      BBVA: { amount: 0, count: 0 },
      Otros: { amount: 0, count: 0 },
    };

    list.forEach(p => {
      const pDate = new Date(p.timestamp || p.dateFormatted || Date.now());
      const isToday = pDate.getFullYear() === todayYear && pDate.getMonth() === todayMonth && pDate.getDate() === todayDate;
      const isThisMonth = pDate.getFullYear() === todayYear && pDate.getMonth() === todayMonth;

      const amt = typeof p.amount === 'number' ? p.amount : (parseFloat(p.amount) || 0);

      if (isToday) {
        totalToday += amt;
        countToday++;

        const prov = p.provider || 'Yape';
        if (byProviderToday[prov]) {
          byProviderToday[prov].amount += amt;
          byProviderToday[prov].count++;
        } else {
          byProviderToday.Otros.amount += amt;
          byProviderToday.Otros.count++;
        }
      }

      if (isThisMonth) {
        totalMonth += amt;
        countMonth++;
      }
    });

    return {
      totalToday,
      countToday,
      totalMonth,
      countMonth,
      byProviderToday,
      totalStored: list.length,
    };
  } catch (e) {
    console.warn('[paymentHistory] Error calculando estadísticas:', e.message);
    return {
      totalToday: 0,
      countToday: 0,
      totalMonth: 0,
      countMonth: 0,
      byProviderToday: {},
      totalStored: 0,
    };
  }
}

/**
 * Limpia el historial de pagos almacenado localmente
 */
export async function clearLocalPayments() {
  try {
    await AsyncStorage.removeItem(PAYMENTS_STORAGE_KEY);
    return true;
  } catch (e) {
    return false;
  }
}
