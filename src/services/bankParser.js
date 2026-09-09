// ============================================================
// Bank Notification Parser — YapeBot Mobile
// Soporta: Yape, Plin (Interbank, BBVA, Scotiabank), BBVA, Interbank
// ============================================================

export const BANK_PACKAGES = {
  YAPE: [
    'com.bcp.innovacxion.yapeapp',
    'com.bcp.innovacxion.yape',
  ],
  INTERBANK: [
    'pe.com.interbank.mobilebanking',
    'pe.interbank.banca',
  ],
  BBVA: [
    'com.bbva.nxt_peru',
  ],
  SCOTIABANK: [
    'com.scotiabank.peru',
  ],
};

/**
 * Normaliza y combina todos los campos de texto disponibles de la notificación de Android
 * @param {Object} notif Objeto raw recibido desde RNAndroidNotificationListener
 * @returns {string} Texto combinado completo
 */
export function extractFullText(notif) {
  if (!notif) return '';
  const parts = [
    notif.title || '',
    notif.titleBig || '',
    notif.text || '',
    notif.bigText || '',
    notif.subText || '',
    notif.summaryText || '',
    notif.extraInfoText || '',
  ];

  // Si existen groupedMessages
  if (Array.isArray(notif.groupedMessages)) {
    notif.groupedMessages.forEach(m => {
      if (typeof m === 'string') parts.push(m);
      else if (m && m.text) parts.push(m.text);
    });
  }

  // Unir y limpiar espacios duplicados manteniendo coherencia
  const combined = parts
    .map(p => (typeof p === 'string' ? p.trim() : ''))
    .filter(p => p.length > 0)
    .join(' | ');

  return combined;
}

/**
 * Identifica la entidad financiera basándose en el package o en el contenido del texto
 * @param {string} packageName Nombre del paquete Android (ej: com.bcp.innovacxion.yapeapp)
 * @param {string} text Texto de la notificación
 * @returns {string} Proveedor detectado ('Yape', 'Plin', 'BBVA', 'Interbank', 'Otro')
 */
export function detectProvider(packageName = '', text = '') {
  const pkg = (packageName || '').toLowerCase();
  const txt = (text || '').toLowerCase();

  if (BANK_PACKAGES.YAPE.some(p => pkg === p) || pkg.includes('yape') || txt.includes('yape')) {
    return 'Yape';
  }
  if (txt.includes('plin')) {
    return 'Plin';
  }
  if (BANK_PACKAGES.BBVA.some(p => pkg === p) || pkg.includes('bbva') || txt.includes('bbva')) {
    return 'BBVA';
  }
  if (BANK_PACKAGES.INTERBANK.some(p => pkg === p) || pkg.includes('interbank') || txt.includes('interbank')) {
    return 'Interbank';
  }
  if (BANK_PACKAGES.SCOTIABANK.some(p => pkg === p) || pkg.includes('scotiabank') || txt.includes('scotiabank')) {
    return 'Scotiabank';
  }

  return 'Desconocido';
}

/**
 * Verifica si el paquete de la app pertenece a una aplicación bancaria monitoreada
 * @param {string} packageName
 * @param {string} text
 * @returns {boolean}
 */
export function isMonitoredApp(packageName = '', text = '') {
  const pkg = (packageName || '').toLowerCase();
  const txt = (text || '').toLowerCase();

  const allKnownPackages = [
    ...BANK_PACKAGES.YAPE,
    ...BANK_PACKAGES.INTERBANK,
    ...BANK_PACKAGES.BBVA,
    ...BANK_PACKAGES.SCOTIABANK,
  ];

  if (allKnownPackages.includes(pkg)) return true;

  // Permisivo: si el package o el texto menciona yape, plin, bbva o interbank
  if (pkg.includes('yape') || pkg.includes('plin') || pkg.includes('bbva') || pkg.includes('interbank')) {
    return true;
  }
  if (txt.includes('yape') || txt.includes('plin')) {
    return true;
  }

  return false;
}

/**
 * Parsea el texto completo para determinar si es un pago y extraer sus componentes
 * @param {Object} rawNotification Objeto entregado por el listener de Android
 * @returns {Object} Datos analizados
 */
export function parseBankNotification(rawNotification) {
  const packageName = rawNotification.app || rawNotification.packageName || '';
  const fullText = extractFullText(rawNotification);
  const title = (rawNotification.title || '').trim();
  const timestamp = rawNotification.time ? parseInt(rawNotification.time, 10) : Date.now();

  const provider = detectProvider(packageName, fullText);

  // 1. Extraer Monto
  // S/ 35, S/ 35.00, S/35, S/. 35.00, 30 soles, 30.00 soles
  let amount = null;
  const montoMatch = fullText.match(/S\/\.?\s*(\d+(?:[\.,]\d{1,2})?)/i)
    || fullText.match(/(\d+(?:[\.,]\d{1,2})?)\s*(?:soles|PEN)/i);

  if (montoMatch) {
    const rawVal = montoMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // 2. Extraer Código de Seguridad si existe (opcional)
  // "El cód. de seguridad es: 945" / "código de seguridad: 004" / "cód: 123"
  let securityCode = null;
  const codigoMatch = fullText.match(/(?:c[óo]d(?:igo)?|clave|n[º°]?\s*seg)[\s.:]*(?:de\s+)?(?:seguridad|verificaci[oó]n)?[\s.:]*(?:es)?[\s.:]*(\d{3,4})/i);
  if (codigoMatch) {
    securityCode = codigoMatch[1].trim();
  }

  // 3. Extraer Nombre del Remitente
  // Ejemplos Yape:
  // "Luis Llo* te envió un pago por S/ 35"
  // "Yape! WALTER SAENZ te envió un pago por S/ 70.00"
  // "Yape! VARGAS PALOMINO SHARON SALOME te envió un pago por S/ 30.00"
  // "Dany Rav* te envió un pago por S/ 30"
  // "Plin! Recibiste S/ 25.00 de Juan Perez"
  let senderName = null;

  // Regex para Yape: busca lo que está antes de "te envió", "te yapeó", "te envio"
  const yapeSenderMatch = fullText.match(/(?:Yape!\s*)?([A-ZÁÉÍÓÚÑa-záéíóúñ*0-9\s.]{2,40}?)\s+te\s+(?:envi[oó]|yape[oó]|transfiri[oó])/i);
  if (yapeSenderMatch && yapeSenderMatch[1]) {
    const candidate = yapeSenderMatch[1].trim().replace(/^Yape!\s*/i, '').trim();
    if (candidate.length > 1 && !candidate.toLowerCase().includes('yape')) {
      senderName = candidate;
    }
  }

  // Si no hizo match y es Plin: "de [Nombre]"
  if (!senderName) {
    const plinSenderMatch = fullText.match(/(?:de|desde)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,35})/i);
    if (plinSenderMatch && plinSenderMatch[1]) {
      const candidate = plinSenderMatch[1].trim();
      if (!candidate.toLowerCase().includes('plin') && !candidate.toLowerCase().includes('banco')) {
        senderName = candidate;
      }
    }
  }

  // Si el título parece ser el remitente (cuando no dice Yape!)
  if (!senderName && title && !title.toLowerCase().includes('yape') && !title.toLowerCase().includes('plin') && !title.toLowerCase().includes('banco')) {
    senderName = title;
  }

  // 4. Determinar si es un pago real
  // Debe tener un monto y al menos una palabra clave de recepción/pago
  const fullLower = fullText.toLowerCase();
  const paymentKeywords = [
    'envi', 'recib', 'pago', 'yape', 'plin', 'transferencia', 'deposito', 'depósito', 'abono'
  ];
  const hasPaymentKeyword = paymentKeywords.some(kw => fullLower.includes(kw));
  const isPayment = amount !== null && amount > 0 && hasPaymentKeyword;

  // 5. Generar texto limpio para el backend
  // Si rawNotification tiene bigText o text, preferir el más largo
  const primaryCandidates = [rawNotification.bigText, rawNotification.text, fullText];
  const longestPrimary = primaryCandidates.reduce((a, b) => ((b && b.length > (a ? a.length : 0)) ? b : a), '');
  const cleanMessage = (longestPrimary || fullText).replace(/\s+/g, ' ').trim();

  return {
    isPayment,
    provider,
    amount,
    senderName: senderName || 'Cliente',
    securityCode,
    rawText: cleanMessage,
    fullText,
    title,
    packageName,
    timestamp,
  };
}
