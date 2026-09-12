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
  const pkg = (packageName || '').toLowerCase().trim();
  const txt = (text || '').toLowerCase();

  // 1. RECHAZAR CATEGÓRICAMENTE NUESTRA PROPIA APP (ANTI-BUCLE INFINITO)
  if (
    pkg === 'com.yape.dashboard' ||
    pkg.includes('yape.dashboard') ||
    pkg.includes('com.yape') ||
    pkg.includes('host.exp.exponent')
  ) {
    return false;
  }

  // 2. RECHAZAR APPS DE MENSAJERÍA O COMUNICACIÓN
  const ignoredPackages = [
    'org.telegram.messenger',
    'org.thunderdog.challegram',
    'com.whatsapp',
    'com.whatsapp.w4b',
    'com.google.android.gm',
    'com.google.android.apps.messaging',
  ];
  if (ignoredPackages.some(p => pkg.startsWith(p))) {
    return false;
  }

  // 3. RECHAZAR CUALQUIER NOTIFICACIÓN QUE CONTENGA TEXTO DEL SISTEMA YAPEBOT O TIENDA
  if (
    txt.includes('pedido #') ||
    txt.includes('nuevo pedido') ||
    txt.includes('revisión manual') ||
    txt.includes('verificado') ||
    txt.includes('yape dashboard') ||
    txt.includes('directo') ||
    txt.includes('woocommerce')
  ) {
    return false;
  }

  // 4. SOLO ACEPTAR PAQUETES BANCARIOS OFICIALES
  const allKnownPackages = [
    ...BANK_PACKAGES.YAPE,
    ...BANK_PACKAGES.INTERBANK,
    ...BANK_PACKAGES.BBVA,
    ...BANK_PACKAGES.SCOTIABANK,
  ];

  return allKnownPackages.includes(pkg);
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
  // S/ 35, S/ 35.00, S/35, S/. 35.00, S/ 1,250.00, 30 soles, 30.00 soles
  let amount = null;
  const montoMatch = fullText.match(/S\/\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || fullText.match(/(?:te\s+ha\s+plineado|pline[oó])\s*S\/\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || fullText.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:soles|PEN)/i)
    || fullText.match(/S\/\.?\s*(\d+)/i);

  if (montoMatch) {
    // Normalizar comas de miles y puntos decimales
    let rawVal = montoMatch[1].trim();
    if (rawVal.includes(',') && rawVal.includes('.')) {
      rawVal = rawVal.replace(/,/g, ''); // 1,250.00 -> 1250.00
    } else if (rawVal.includes(',') && !rawVal.includes('.')) {
      // 35,50 -> 35.50
      rawVal = rawVal.replace(',', '.');
    }
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // 2. Extraer Código de Seguridad si existe (opcional)
  // "El cód. de seguridad es: 945" / "código de seguridad: 004" / "cód: 123" / "seguridad es: 869"
  let securityCode = null;
  const codigoMatch = fullText.match(/(?:c[óo]d(?:igo)?|clave|n[º°]?\s*seg)[\s.:]*(?:de\s+)?(?:seguridad|verificaci[oó]n)?[\s.:]*(?:es)?[\s.:]*(\d{3,4})/i)
    || fullText.match(/seguridad\s+es:\s*(\d{3,4})/i);
  if (codigoMatch) {
    securityCode = codigoMatch[1].trim();
  }

  // 3. Extraer Nombre del Remitente
  // Ejemplos Yape y Plin:
  // "Luis Llo* te envió un pago por S/ 35"
  // "Yape! WALTER SAENZ te envió un pago por S/ 70.00"
  // "Yape! VARGAS PALOMINO SHARON SALOME te envió un pago por S/ 30.00"
  // "Juan Perez te ha plineado S/ 25.00"
  // "Has recibido un pago de Juan Perez por S/ 20.00"
  // "Plin! Recibiste S/ 25.00 de Juan Perez"
  let senderName = null;

  // Patrón A: "[Nombre] te envió / te yapeó / te transfirió"
  const yapeSenderMatch = fullText.match(/(?:Yape!\s*)?([A-ZÁÉÍÓÚÑa-záéíóúñ*0-9\s.]{2,40}?)\s+te\s+(?:envi[oó]|yape[oó]|transfiri[oó]|ha\s+enviado)/i);
  if (yapeSenderMatch && yapeSenderMatch[1]) {
    const candidate = yapeSenderMatch[1].trim().replace(/^Yape!\s*/i, '').trim();
    if (candidate.length > 1 && !candidate.toLowerCase().includes('yape')) {
      senderName = candidate;
    }
  }

  // Patrón B: "[Nombre] te ha plineado"
  if (!senderName) {
    const plineadoMatch = fullText.match(/([A-ZÁÉÍÓÚÑa-záéíóúñ*0-9\s.]{2,40}?)\s+te\s+ha\s+plineado/i);
    if (plineadoMatch && plineadoMatch[1]) {
      const candidate = plineadoMatch[1].trim();
      if (!candidate.toLowerCase().includes('plin') && !candidate.toLowerCase().includes('banco')) {
        senderName = candidate;
      }
    }
  }

  // Patrón C: "has recibido un pago de [Nombre] por" o "recibiste de [Nombre]"
  if (!senderName) {
    const recibidoMatch = fullText.match(/(?:has recibido un pago de|recibiste de|pago de)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ*0-9\s.]{2,40}?)\s+(?:por|de|el)/i);
    if (recibidoMatch && recibidoMatch[1]) {
      const candidate = recibidoMatch[1].trim();
      if (!candidate.toLowerCase().includes('yape') && !candidate.toLowerCase().includes('plin')) {
        senderName = candidate;
      }
    }
  }

  // Patrón D: "de [Nombre]" o "desde [Nombre]" (Plin / Interbank)
  if (!senderName) {
    const plinSenderMatch = fullText.match(/(?:de|desde)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,35})/i);
    if (plinSenderMatch && plinSenderMatch[1]) {
      const candidate = plinSenderMatch[1].trim();
      if (!candidate.toLowerCase().includes('plin') && !candidate.toLowerCase().includes('banco') && !candidate.toLowerCase().includes('interbank')) {
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
    'te envió', 'te envio', 'te yapeó', 'te yapeo', 'recibiste', 'te transfirió',
    'te transfirio', 'abono', 'depósito', 'deposito', 'plineado', 'plineó',
    'te ha plineado', 'has recibido', 'pago recibido', 'recibiste un yape'
  ];
  const isSystemNotification = fullLower.includes('pedido #') || fullLower.includes('nuevo pedido') || fullLower.includes('completado') || fullLower.includes('dashboard') || fullLower.includes('tienda');
  const hasPaymentKeyword = paymentKeywords.some(kw => fullLower.includes(kw));
  const isPayment = amount !== null && amount > 0 && hasPaymentKeyword && !isSystemNotification;


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
