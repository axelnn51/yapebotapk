# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 2)

**Fecha de guardado:** 09 de Septiembre de 2026  
**Versión del Proyecto:** 3.2.0 (versionCode: 5)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Remoto:** https://github.com/axelnn51/yapebotapk.git  

---

## 1. Estado del Proyecto y Componentes Implementados

### A. Lector Bancario Real (NotificationListenerService + Headless JS)
- **Extracción Completa:** Soporte para todos los campos de notificación de Android (`title`, `titleBig`, `text`, `bigText`, `subText`, `summaryText`, `packageName`, `timestamp`).
- **Compatibilidad Android 12-14 (BigTextStyle):** Solucionado el problema donde `text` llega vacío y el cuerpo del pago viaja en `bigText`.
- **Parser Bancario Modular (`src/services/bankParser.js`):**
  - Soporta el título real de Yape: `"Confirmación de Pago"`.
  - Soporta nombres parcialmente ocultos con asteriscos (ej. `"Henry Pal*"`, `"Axel Gom*"`).
  - Soporta montos enteros y con decimales (ej. `S/ 35`, `S/ 30.00`).
  - Extrae códigos de seguridad presentes (ej. `"869"`, `"058"`) y soporta su ausencia.
  - Filtra promociones y créditos (ej. `"Pide tu crédito Yape"`).
  - Soporta Plin, BBVA, Interbank y Scotiabank.
- **Resiliencia Xiaomi POCO M5s:**
  - Patch nativo Java (`RNAndroidNotificationListenerModule.java`) con métodos `rebindListener()` e `isServiceConnected()`.

### B. Cola Offline Persistente e Idempotencia (`src/services/notificationQueue.js`)
- Persistencia en `AsyncStorage`.
- Deduplicación mediante hash determinista (`provider_amount_window_hash`) para evitar pagos duplicados si Android emite eventos múltiples.
- Mecanismo de reintentos automáticos (`flushQueue()`) ante microcortes de conexión.

### C. Motor de Conciliación y Validación Cruzada (`src/services/reconciliation.js`)
- **Separación Estricta:**
  - **Fuente A:** Comprobante del cliente (OCR).
  - **Fuente B:** Notificación bancaria en vivo (NotificationListenerService).
- **Lógica Anti-Fraude:**
  - No aprueba automáticamente solo por monto coincidente.
  - Cruza monto, similitud de remitente, código de seguridad (si existe) y ventana temporal.
- **Pruebas Validadas con Capturas Reales (`PRUEBAS/`):**
  - **Prueba Negativa (Anti-Fraude):** Comprobante S/ 30 (`yaaaap.jpg`) vs Notificación S/ 35 (`f71dca92...jpg`) $\rightarrow$ Marcado como **`ALERTA_FRAUDE / REVISIÓN MANUAL`**.
  - **Prueba Positiva:** Notificación y comprobante coincidentes (S/ 35, Henry Pal*, código 869) $\rightarrow$ Marcado como **`MATCH_VÁLIDO`** (Auto-aprobado).

### D. Notificaciones Push FCM y Pantalla de Diagnóstico
- Canal de alta prioridad configurado en backend y APK (`channelId: 'default'`).
- Auditoría en vivo en `DiagnosticScreen.js`:
  - Estado del Lector (Conectado / Desconectado con botón de rebind).
  - Timestamps de última notificación por banco (Yape, Plin, BBVA).
  - Último paquete, título, texto, monto, código y remitente.
  - Estado de backend (HTTP 200) y estadísticas de cola (Pendientes / Fallidos).
  - Estado de FCM y último push recibido.
  - Timeline cronológico de los últimos 100 eventos (`src/services/eventLogger.js`).

---

## 2. Compilación Local de APK Generada

- **Ruta en PC:** `C:\Users\axeln\Desktop\YapeBot-Mobile-FINAL.apk`
- **Ruta de Respaldo:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile-FINAL.apk`
- **Tamaño:** 59,327,422 bytes (~56.58 MB)
- **Firma:** `APK Signature Scheme v2: true` (Verificada con `apksigner`)
- **Package:** `com.yape.dashboard`
- **Version:** `3.2.0` (versionCode: `5`)
- **Target SDK:** Android 14 (API 34) / Min SDK: Android 7.0 (API 24)

---

## 3. Protocolo de Pruebas para Mañana (Checklist de Verificación)

1. **Instalación:**
   - Instalar `C:\Users\axeln\Desktop\YapeBot-Mobile-FINAL.apk` en el Xiaomi POCO M5s.
2. **Permisos en Xiaomi (MIUI/HyperOS):**
   - *Ajustes* -> *Aplicaciones* -> *Yape Dashboard* -> (3 puntos) -> **Permitir ajustes restringidos**.
   - Conceder permiso en **Acceso a notificaciones**.
   - Activar **Inicio automático**.
   - Cambiar ahorro de batería a **Sin restricciones**.
   - Bloquear la app con **Candado 🔒** en la pantalla de aplicaciones recientes.
3. **Configuración en la App:**
   - Pestaña **⚙️ Configuración**: Ingresar URL del servidor y API Key.
   - Pulsar **"Guardar Configuración"** y luego **"Probar Conexión"** (esperar HTTP 200).
4. **Pantalla de Diagnóstico:**
   - Confirmar que **Lector Bancario** esté en `🟢 Conectado` y **Push FCM** en `🟢 Activo`.
5. **Prueba en Vivo:**
   - Realizar un Yapeo real de prueba (ej. S/ 1.00) con el teléfono bloqueado o minimizado.
   - Verificar que aparezca en el timeline de la pantalla de Diagnóstico y se envíe al backend.
