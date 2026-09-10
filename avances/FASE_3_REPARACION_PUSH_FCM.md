# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 3: Reparación Notificaciones Push FCM)

**Fecha de guardado:** 09 de Septiembre de 2026  
**Versión del Proyecto:** 3.2.0 (versionCode: 5)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Remoto:** https://github.com/axelnn51/yapebotapk.git  

---

## 1. Problema Diagnosticado y Resuelto

En producción se reportó la recepción de 0 notificaciones en el teléfono móvil a pesar de haberse generado múltiples pedidos en WooCommerce (pendientes, completados y cancelados).

### Causas Raíz Eliminadas:
1. **Base de Datos Desconectada:** La tabla `push_tokens` en el SQLite del servidor estaba vacía. Las peticiones push se descartaban en silencio sin emitir alerta.
2. **Falta de Credenciales en Portainer:** El contenedor no contaba con `serviceAccountKey.json` en su volumen, imposibilitando la inicialización del SDK de Firebase Admin.
3. **Ausencia de Canal de Notificación en Backend:** No se inyectaba `channelId: 'default'`, provocando que Android 14 descartara silenciosamente las alertas entrantes.
4. **Registro Frágil de Tokens FCM:** Si el usuario instalaba el APK antes de configurar la IP del backend, el token FCM nativo se descartaba sin reintentos posteriores.

---

## 2. Componentes Implementados y Modificados en el APK Móvil

### A. Canal de Notificaciones Android de Alta Prioridad (`src/services/api.js`)
- Implementada la función `setupNotificationChannel()`:
  - `channelId`: `'default'`
  - `name`: `'Notificaciones de Tienda'`
  - `importance`: `Notifications.AndroidImportance.MAX`
  - Vibración y sonido habilitados por defecto.

### B. Registro Resiliente de Token FCM Nativo (`src/services/api.js`)
- Obtención estricta de token FCM nativo vía `Notifications.getDevicePushTokenAsync()`.
- Si el servidor no responde o aún no está configurado, el token se almacena localmente en `@yape_pending_fcm_token`.
- En `saveConfig()`, cualquier token pendiente se sincroniza inmediatamente con el backend tan pronto como el usuario presiona "Guardar Configuración".
- Nuevo método `getPushDiagnosticStatus()` para interrogar la salud del servicio en el servidor remoto.

### C. Ciclo de Vida y Recuperación Automática (`App.js`)
- Inicialización incondicional del canal y registro push en el arranque (`useEffect`).
- Listener de `AppState`: cada vez que la app pasa a primer plano (`active`), re-verifica y sincroniza el token.
- Listener `Notifications.addPushTokenListener` para capturar cualquier renovación automática por parte de Google Play Services.

### D. Experiencia de Usuario y Pruebas en Vivo (`src/screens/SettingsScreen.js`)
- Alerta detallada en el botón **"Probar Push Real (Firebase)"** con reporte de dispositivos impactados o errores del servidor.
- Mensaje explicativo al guardar credenciales confirmando la vinculación del token con el backend.

### E. Pantalla de Diagnóstico Renovada (`src/screens/DiagnosticScreen.js`)
- Bloque 3 remodelado por completo:
  - Badge dinámico: `VINCULADO AL SERVIDOR`, `TOKEN LOCAL OBTENIDO (PENDIENTE)`, o `SIN TOKEN`.
  - Visualización del canal Android activo (`default / MAX`).
  - Token FCM nativo enmascarado (`xxxxxxx...abcd`) con botón de copiado al portapapeles.
  - Estado remoto en vivo de Firebase Admin (Conectado / Sin inicializar) y conteo de dispositivos registrados.
  - Alertas informativas para Xiaomi HyperOS sobre habilitar Ajustes Restringidos.

---

## 3. Compilación Local de Release APK Generada

- **Archivo Final en Escritorio:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile-FCM-FIX.apk`
- **Archivo en Proyecto:** `android/app/build/outputs/apk/release/app-release.apk`
- **Tamaño:** 59,332,374 bytes (~56.58 MB)
- **Firma:** `APK Signature Scheme v2` (Release Keystore)
- **SDK Objetivo:** Android 14 (API 34/35) / Node 20 / React Native 0.76.9
- **Compilador:** Gradle 8.10.2 con OpenJDK 21 (Android Studio JBR)
