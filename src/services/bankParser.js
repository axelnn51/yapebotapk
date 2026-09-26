// ============================================================
// Bank Notification Parser — YapeBot Mobile (v3.4)
// Soporta: Yape, Plin (Interbank, BBVA, Scotiabank), BCP, BBVA, Interbank, Scotiabank
// Mejoras inspiradas en motor Vuelto: Anti-OTP, Filtro Anti-Spam, Patrones Extendidos
// ============================================================

export const BANK_PACKAGES = {
  YAPE: [
    'com.bcp.innovacxion.yapeapp',
    'com.bcp.innovacxion.yape',
  ],
  BCP: [
    'com.bcp.bank.bcp',
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
    'com.scotiabank.pe.android',
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
 * Filtro Anti-OTP y Anti-Spam inspirado en el clasificador de Vuelto
 * Detecta y descarta códigos dinámicos, OTPs, promociones, préstamos y publicidad de bancos
 * @param {string} text Texto completo de la notificación
 * @returns {boolean} true si es mensaje descartable (OTP, publicidad o alerta del sistema)
 */
export function isNonPaymentMessage(text = '') {
  const t = text.toLowerCase();
  
  // 1. Claves OTP / Códigos de confirmación o validación
  // "Tu clave dinámica es 198246 para confirmar tu transferencia", "código de verificación", etc.
  const isOtp = /(?:clave\s+din[áa]mica|c[óo]digo\s+(?:de\s+)?(?:verificaci[óo]n|confirmaci[óo]n|autorizaci[óo]n|otp)|token\s+digital|no\s+lo?\s+compartas\s+con\s+nadie|v[áa]lido\s+(?:por\s+)?\d+\s*minutos?)/i.test(t);
  if (isOtp) return true;

  // 2. Promociones / Publicidad de bancos y billeteras
  const isPromo = /(?:%?\s*(?:dscto|descuento|dto|off)\b|cyberwow|cyberdays|black\s*friday|pide\s+tu\s+pr[ée]stamo|pr[ée]stamo\s+(?:al\s+toque|personal|preaprobado)|tarjeta\s+de\s+cr[ée]dito|cuotas\s+sin\s+interes(?:es)?|acumula\s+(?:millas|puntos)|sorteo\b|cashback|cup[óo]n)/i.test(t);
  if (isPromo) return true;

  // 3. Avisos del sistema / Seguridad / Bloqueos
  const isSystemAlert = /(?:app\s+bloqueada|sesi[óo]n\s+expirada|bloqueaste\s+tu\s+tarjeta|actualizaste\s+la\s+configuraci[óo]n|cambiaste\s+el\s+l[íi]mite)/i.test(t);
  if (isSystemAlert) return true;

  return false;
}

/**
 * Identifica la entidad financiera basándose en el package o en el contenido del texto
 * @param {string} packageName Nombre del paquete Android (ej: com.bcp.innovacxion.yapeapp)
 * @param {string} text Texto de la notificación
 * @returns {string} Proveedor detectado ('Yape', 'Plin', 'BCP', 'BBVA', 'Interbank', 'Scotiabank', 'Desconocido')
 */
export function detectProvider(packageName = '', text = '') {
  const pkg = (packageName || '').toLowerCase();
  const txt = (text || '').toLowerCase();

  if (
    BANK_PACKAGES.YAPE.some(p => pkg === p) ||
    pkg.includes('yape') ||
    txt.includes('yape') ||
    txt.includes('cód. de seguridad') ||
    txt.includes('cod. de seguridad')
  ) {
    return 'Yape';
  }
  if (txt.includes('plin') || txt.includes('plineado') || txt.includes('plineó')) {
    return 'Plin';
  }
  if (
    BANK_PACKAGES.INTERBANK.some(p => pkg === p) ||
    pkg.includes('interbank') ||
    txt.includes('interbank') ||
    txt.includes('tran s/')
  ) {
    return 'Interbank';
  }
  if (BANK_PACKAGES.BBVA.some(p => pkg === p) || pkg.includes('bbva') || txt.includes('bbva')) {
    return 'BBVA';
  }
  if (BANK_PACKAGES.BCP.some(p => pkg === p) || pkg.includes('bcp') || txt.includes('bcp')) {
    return 'BCP';
  }
  if (BANK_PACKAGES.SCOTIABANK.some(p => pkg === p) || pkg.includes('scotiabank') || txt.includes('scotiabank')) {
    return 'Scotiabank';
  }

  return 'Desconocido';
}

/**
 * Normaliza y convierte un string numérico a Float
 * Soporta "1,250.00", "2.00", "2,00", etc.
 */
export function parseAmount(rawStr) {
  if (!rawStr) return null;
  let val = rawStr.trim();
  if (val.includes(',') && val.includes('.')) {
    val = val.replace(/,/g, '');
  } else if (val.includes(',') && !val.includes('.')) {
    val = val.replace(',', '.');
  }
  const parsed = parseFloat(val);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
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
    ...BANK_PACKAGES.BCP,
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

  // 1. FILTRO ANTI-OTP Y ANTI-SPAM (Vuelto Pattern)
  if (isNonPaymentMessage(fullText)) {
    return {
      isPayment: false,
      reason: 'Mensaje no financiero o OTP detectado',
      provider: detectProvider(packageName, fullText),
      rawText: fullText,
      fullText,
      packageName,
      timestamp,
    };
  }

  const provider = detectProvider(packageName, fullText);

  let amount = null;
  let senderName = null;
  let securityCode = null;

  // 2. Extraer Código de Seguridad (Yape & Bancos)
  // "El cód. de seguridad es: 724" / "código de seguridad: 004" / "cód: 123" / "seguridad es: 869"
  const secCodeMatch = fullText.match(/(?:c[óo]d(?:igo|\.)?(?:\s+de)?(?:\s+seguridad)?(?:\s+es)?|clave)\s*[:.\-]?\s*([A-Z0-9]{3,8})\b/i)
    || fullText.match(/seguridad\s+es:\s*(\d{3,4})/i);
  if (secCodeMatch) {
    securityCode = secCodeMatch[1].trim();
  }

  // 3. Patrones de Alta Precisión por Banco/Billetera (Inspirados en Vuelto)

  // PATRÓN YAPE:
  // "Jennifer Cho* te envió un pago por S/ 2.00"
  // "Confirmación de pago | Victor Mun* te envió un pago por S/ 3.00"
  // "Yape! WALTER SAENZ te envió un pago por S/ 70.00"
  // "Laurita Rob* te envió un pago por S/ 6.60"
  const yapeMatch = fullText.match(/(?:(?:Confirmaci[oó]n\s+de\s+pago|Yape!)\s*\|?\s*)?([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]{2,40}?)\s+te\s+(?:envi[oó]|yape[oó]|transfiri[oó]|ha\s+enviado)\s+(?:un\s+pago\s+por\s+)?S\/\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (yapeMatch) {
    let candidate = yapeMatch[1].replace(/^(?:Confirmaci[oó]n\s+de\s+pago|Yape!)\s*/i, '').trim();
    if (!candidate.toLowerCase().includes('yape') && candidate.length > 1) {
      senderName = candidate;
    }
    amount = parseAmount(yapeMatch[2]);
  }

  // PATRÓN PLIN (A):
  // "Carlos Díaz te ha plineado S/241.50"
  if (!amount || !senderName) {
    const plinMatch1 = fullText.match(/([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]{2,40}?)\s+te\s+ha\s+plineado\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (plinMatch1) {
      senderName = plinMatch1[1].trim();
      amount = parseAmount(plinMatch1[2]);
    }
  }

  // PATRÓN PLIN (B):
  // "Plin! Recibiste S/ 25.00 de Juan Perez"
  if (!amount || !senderName) {
    const plinMatch2 = fullText.match(/(?:Plin!\s*)?(?:has\s+recibido|recibiste)\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)\s+de\s+([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]{2,40})/i);
    if (plinMatch2) {
      amount = parseAmount(plinMatch2[1]);
      senderName = plinMatch2[2].trim();
    }
  }

  // PATRÓN INTERBANK (A - Formato TRAN):
  // "TRAN S/ 2.00 A: Brian Josue (12/09/2026 23:17:47)"
  if (!amount || !senderName) {
    const ibkMatch1 = fullText.match(/TRAN\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)\s*A:\s*(.+?)(?:\s*\(|$)/i);
    if (ibkMatch1) {
      amount = parseAmount(ibkMatch1[1]);
      senderName = ibkMatch1[2].trim();
    }
  }

  // PATRÓN INTERBANK (B - Abono en cuenta):
  // "Abono de S/ 150.00 de Pedro Castro en tu cuenta Simple"
  if (!amount || !senderName) {
    const ibkMatch2 = fullText.match(/Abono\s+de\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)\s+de\s+(.+?)(?:\s+en|\s*$)/i);
    if (ibkMatch2) {
      amount = parseAmount(ibkMatch2[1]);
      senderName = ibkMatch2[2].trim();
    }
  }

  // PATRÓN BCP / BBVA / SCOTIABANK (Transferencias directas):
  // "Transferencia recibida por S/ 35.00 de Maria Elena Gomez"
  if (!amount || !senderName) {
    const bcpMatch = fullText.match(/(?:Transferencia\s+recibida|Has\s+recibido\s+un\s+abono|Abono)\s+(?:por|de)?\s*S\/\.?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:de|por)\s+([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]+?)(?:\.|\s+en|$)/i);
    if (bcpMatch) {
      amount = parseAmount(bcpMatch[1]);
      senderName = bcpMatch[2].trim();
    }
  }

  // Fallback para monto si todavía no se detectó
  if (!amount) {
    const montoMatch = fullText.match(/S\/\.?\s*([\d,]+(?:\.\d{1,2})?)/i)
      || fullText.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:soles|PEN)/i);
    if (montoMatch) {
      amount = parseAmount(montoMatch[1]);
    }
  }

  // Fallback para remitente
  if (!senderName) {
    const plinSenderMatch = fullText.match(/(?:de|desde)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,35})/i);
    if (plinSenderMatch && plinSenderMatch[1]) {
      const candidate = plinSenderMatch[1].trim();
      if (!candidate.toLowerCase().includes('plin') && !candidate.toLowerCase().includes('banco') && !candidate.toLowerCase().includes('interbank')) {
        senderName = candidate;
      }
    }
  }

  if (!senderName && title && !title.toLowerCase().includes('yape') && !title.toLowerCase().includes('plin') && !title.toLowerCase().includes('banco') && !title.toLowerCase().includes('confirmación')) {
    senderName = title;
  }

  // 4. Determinar si es un pago real
  const paymentKeywords = [
    'te envió', 'te envio', 'te yapeó', 'te yapeo', 'recibiste', 'te transfirió',
    'te transfirio', 'abono', 'depósito', 'deposito', 'plineado', 'plineó',
    'te ha plineado', 'has recibido', 'pago recibido', 'recibiste un yape', 'tran s/',
    'transferencia', 'transferencia recibida'
  ];
  const fullLower = fullText.toLowerCase();
  const isSystemNotification = fullLower.includes('pedido #') || fullLower.includes('nuevo pedido') || fullLower.includes('completado') || fullLower.includes('dashboard') || fullLower.includes('tienda');
  const hasPaymentKeyword = paymentKeywords.some(kw => fullLower.includes(kw));
  const isPayment = amount !== null && amount > 0 && hasPaymentKeyword && !isSystemNotification;

  // 5. Generar texto limpio para el backend
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

