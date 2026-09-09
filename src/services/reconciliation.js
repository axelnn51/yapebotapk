// ============================================================
// Reconciliation Engine — YapeBot Mobile & Backend
// Cruza Fuente A (Comprobante OCR) con Fuente B (Notificación Bancaria)
// Evita fraudes y liberaciones indebidas por coincidencias parciales
// ============================================================

/**
 * Normaliza nombres para comparación tolerante a asteriscos y abreviaturas
 * Ej: "Henry Pal*" -> ["henry", "pal"]
 */
export function normalizeNameParts(name = '') {
  return (name || '')
    .toLowerCase()
    .replace(/[*.]/g, '')
    .split(/\s+/)
    .filter(p => p.length >= 3);
}

/**
 * Verifica si los nombres coinciden razonablemente
 */
export function matchSenderNames(nameA = '', nameB = '') {
  if (!nameA || !nameB) return false;
  const cleanA = (nameA || '').toLowerCase().replace(/[*.]/g, '').trim();
  const cleanB = (nameB || '').toLowerCase().replace(/[*.]/g, '').trim();

  if (cleanA === cleanB) return true;

  const partsA = normalizeNameParts(nameA);
  const partsB = normalizeNameParts(nameB);

  // Si al menos una parte significativa coincide (ej: "henry" en ambos o "axel" en ambos)
  for (const pA of partsA) {
    if (partsB.some(pB => pB.includes(pA) || pA.includes(pB))) {
      return true;
    }
  }

  return false;
}

/**
 * Reconcilia los datos del Comprobante OCR con la Notificación Bancaria Real
 * @param {Object} voucherData Datos extraídos del comprobante mediante OCR
 *   - monto: number
 *   - remitente: string
 *   - codigo: string (código de seguridad de 3-4 dígitos si existe)
 *   - operacion: string (número de operación)
 * @param {Object} notificationData Datos capturados desde NotificationListenerService
 *   - amount: number
 *   - senderName: string
 *   - securityCode: string
 *   - provider: string
 * @param {Object} orderData Datos del pedido en la tienda (opcional)
 *   - total: number
 * @returns {Object} Resultado de la validación
 */
export function reconcilePayment(voucherData = {}, notificationData = {}, orderData = null) {
  const reasons = [];
  let isFraudRisk = false;

  const vAmount = voucherData.monto !== undefined && voucherData.monto !== null ? parseFloat(voucherData.monto) : null;
  const nAmount = notificationData.amount !== undefined && notificationData.amount !== null ? parseFloat(notificationData.amount) : null;
  const oAmount = orderData && orderData.total ? parseFloat(orderData.total) : null;

  // 1. Verificación de Montos
  const amountMatches = vAmount !== null && nAmount !== null && Math.abs(vAmount - nAmount) < 0.05;
  if (!amountMatches) {
    reasons.push(`Discrepancia de monto: Comprobante S/ ${vAmount ?? '?'} vs Notificación S/ ${nAmount ?? '?'}`);
  }

  if (oAmount !== null && nAmount !== null && Math.abs(nAmount - oAmount) > 1.0) {
    reasons.push(`Discrepancia con pedido: Pedido S/ ${oAmount} vs Notificación S/ ${nAmount}`);
  }

  // 2. Verificación de Código de Seguridad (cuando existe en ambas fuentes)
  const vCode = voucherData.codigo ? String(voucherData.codigo).trim() : null;
  const nCode = notificationData.securityCode ? String(notificationData.securityCode).trim() : null;

  let codeMatches = null;
  if (vCode && nCode) {
    codeMatches = vCode === nCode;
    if (!codeMatches) {
      isFraudRisk = true;
      reasons.push(`Código de seguridad no coincide: Comprobante [${vCode}] vs Notificación [${nCode}]`);
    }
  }

  // 3. Verificación de Nombre del Remitente
  const vSender = voucherData.remitente || '';
  const nSender = notificationData.senderName || '';
  const senderMatches = matchSenderNames(vSender, nSender);

  if (vSender && nSender && !senderMatches) {
    reasons.push(`Remitente no coincide: Comprobante "${vSender}" vs Notificación "${nSender}"`);
  }

  // 4. Conclusión de la Conciliación
  // Para ser MATCH_VALIDO:
  // - Monto debe coincidir obligatoriamente
  // - Si ambos tienen código de seguridad, debe coincidir (no puede haber discrepancia)
  // - El remitente debe coincidir razonablemente si está disponible
  const isValid = amountMatches && (codeMatches !== false) && (vSender && nSender ? senderMatches : true);

  let status = 'REVISION_MANUAL';
  if (isValid) {
    status = 'MATCH_VALIDO';
  } else if (isFraudRisk) {
    status = 'ALERTA_FRAUDE';
  }

  return {
    valid: isValid,
    status,
    amountMatches,
    codeMatches,
    senderMatches,
    reasons,
    summary: isValid
      ? `✅ Pago verificado: S/ ${nAmount} | Remitente: ${nSender}${nCode ? ' | Cód: ' + nCode : ''}`
      : `⚠️ ${status}: ${reasons.join(' • ')}`,
  };
}
