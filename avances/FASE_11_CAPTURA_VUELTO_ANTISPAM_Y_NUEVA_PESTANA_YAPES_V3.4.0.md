# Fase 11: Auditoría de Vuelto, Motor Anti-OTP/Anti-Spam y Nueva Pestaña de Yapes (v3.4.0)

## 1. Análisis Forense de la App "Vuelto" (`com.finanzas.finanzas`)

A partir de la extracción y análisis de la APK/XAPK de la app Vuelto (`https://vuelto.briandev.uk/`), se identificaron los siguientes componentes clave en su arquitectura:

### 1.1. Arquitectura de Captura
* **Tecnología Base:** Flutter / Dart con canal nativo de Android `com.finanzas.finanzas/notification_listener`.
* **Motor Dual de Detección:**
  1. **Modo Gratis ("Solo por formato"):** Basado en plantillas regex de alta velocidad y cero latencia (`bank_notification_template_parser.dart`).
  2. **Modo IA ("Con IA - todos los bancos"):** Posee un clasificador local de n-gramas (`bank_notif_classifier.json` v31, 8,348 características y umbral 0.6) que discrimina notificaciones promocionales de transacciones reales, con respaldo en la nube (Gemini / OpenAI) cuando el formato varía.
* **Paquetes Bancarios Monitoreados Oficiales:**
  - Yape: `com.bcp.innovacxion.yapeapp`
  - BCP Banca Móvil: `com.bcp.bank.bcp`
  - Interbank: `pe.com.interbank.mobilebanking`, `pe.interbank.banca`
  - BBVA: `com.bbva.nxt_peru`
  - Scotiabank: `com.scotiabank.pe.android`, `com.scotiabank.peru`

### 1.2. Patrones Extraídos y Adaptados
* **Yape:** `(?:(?:Confirmaci[oó]n\s+de\s+pago|Yape!)\s*\|?\s*)?([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]+?)\s+te\s+(?:envi[oó]|yape[oó]|transfiri[oó]|ha\s+enviado)\s+(?:un\s+pago\s+por\s+)?S\/\.?\s*([\d,]+(?:\.\d{1,2})?)`
* **Plin:** `([A-ZÁÉÍÓÚÑa-zñ*0-9\s.]+?)\s+te\s+ha\s+plineado\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)`
* **Interbank (TRAN):** `TRAN\s+S\/\.?\s*([\d,]+(?:\.\d{1,2})?)\s*A:\s*(.+?)(?:\s*\(|$)`
* **Código de Seguridad:** `(?:c[óo]d(?:igo|\.)?(?:\s+de)?(?:\s+seguridad)?(?:\s+es)?|clave)\s*[:.\-]?\s*([A-Z0-9]{3,8})\b`

---

## 2. Mejoras Implementadas en YapeBot Mobile (v3.4.0)

### 2.1. Refuerzo de `bankParser.js`
1. **Filtro Anti-OTP & Anti-Spam:** Descarta de forma preventiva mensajes con claves dinámicas (`Tu clave dinámica es...`), códigos de verificación, tokens digitales y ofertas publicitarias bancarias (Cyberwow, préstamos preaprobados, descuentos) que causaban falsos positivos cuando mencionaban importes.
2. **Soporte Extendido de Paquetes:** Inclusión de `com.bcp.bank.bcp` y `com.scotiabank.pe.android`.
3. **Regex de Precisión Perú:** Cobertura de las variantes comunes de Yape, Plin (Interbank/BBVA), transferencias BCP y formato `TRAN S/` de Interbank.

### 2.2. Nuevo Servicio de Persistencia: `paymentHistory.js`
* Guarda de inmediato en almacenamiento local de Android (`@yape_payments_history`) todo pago parseado en segundo plano por el Headless JS.
* Capacidad de almacenar hasta 300 movimientos con su texto original (raw), estado de sincronización (`sent`, `queued`, `duplicate`, `error`), remitente, código de seguridad y fecha/hora exacta.
* Cálculo en tiempo real de KPIs: Total acumulado hoy (+S/), número de yapes y desglose por entidad (Yape vs Plin vs Otros).

### 2.3. Integración en `index.js`
* El listener de notificaciones en segundo plano registra el pago en `paymentHistory` inmediatamente al ser detectado.
* Actualiza atómicamente el estado del pago cuando `notificationQueue` completa el envío exitoso (HTTP 200) o lo encola por falta de conexión.

### 2.4. Nueva Pestaña "Yapes" (`PaymentsScreen.js`)
* **KPIs Superiores:** Tarjeta de ingresos de hoy con balance en verde neón (+S/) y contador de transacciones.
* **Barra de Búsqueda:** Búsqueda en tiempo real por remitente, importe o código de seguridad.
* **Filtros Rápidos:** Chips interactivos para filtrar por banco (`Todos`, `🟣 Yape`, `🟢 Plin`, `🔵 Interbank`, `🟠 BCP`, `🔷 BBVA`).
* **Lista de Pagos:** Tarjetas con diseño oscuro, insignia del banco, badge de código de seguridad (`🔑 724`) y estado de sincronización con el servidor.
* **Modal de Detalle Completo:**
  - Muestra monto, fecha/hora exacta de Lima y nombre del cliente.
  - Exhibe el texto original completo de la notificación de Android (auditoría forense).
  - Botón para compartir o enviar comprobante por WhatsApp/redes.
  - Botón de reintento para reenviar pagos pendientes al webhook del bot.

### 2.5. Actualización de Navegación (`App.js`)
* La barra de navegación inferior ahora cuenta con:
  1. `Dashboard` (Resumen general y métricas)
  2. `Pedidos` (Órdenes e-commerce / CDKeys)
  3. `Yapes` (Cobros y notificaciones recibidas en vivo)
  4. `Reportes` (Estadísticas y reportes financieros)
  5. `Config` (Ajustes, Diagnósticos y Logs)
