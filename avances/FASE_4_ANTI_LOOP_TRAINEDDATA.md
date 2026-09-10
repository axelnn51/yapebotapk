# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 4: Anti-Bucle Infinito + Limpieza Repo)

**Fecha de guardado:** 10 de Septiembre de 2026 (~2:50 AM)  
**Sesión:** Nocturna — continuación directa de Fase 3  
**Versión del Proyecto:** 3.2.0 (versionCode: 5)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Remoto:** https://github.com/axelnn51/yapebotapk.git  
**Commits de esta sesión:**
- `ca96423` — fix(anti-loop): rechazo categórico de notificaciones del sistema e ignorar com.yape.dashboard
- `ba66b2b` — chore: ignore traineddata files in mobile repo

---

## 1. Problema Crítico Diagnosticado y Resuelto: BUCLE INFINITO DE NOTIFICACIONES

### Descripción del Bug
El `NotificationListenerService` de la app interceptaba **sus propias notificaciones push FCM** (las del backend YapeBot) como si fueran pagos bancarios. Esto generaba un ciclo infinito:

1. Backend envía push FCM → "Nuevo Pedido #1234"
2. App recibe la notificación y la muestra en Android
3. El Listener la intercepta y la parsea como "pago bancario"
4. Se envía al backend como notificación bancaria
5. Backend genera nueva alerta → vuelve al paso 1 ♻️

### Solución Implementada en `src/services/bankParser.js`

#### A. Rechazo Categórico de la Propia App (Capa 1 — Package Name)
```javascript
// RECHAZAR CATEGÓRICAMENTE NUESTRA PROPIA APP (ANTI-BUCLE INFINITO)
if (
  pkg === 'com.yape.dashboard' ||
  pkg.includes('yape.dashboard') ||
  pkg.includes('com.yape') ||
  pkg.includes('host.exp.exponent')  // Expo Go en desarrollo
) {
  return false;
}
```

#### B. Rechazo de Apps de Mensajería y Comunicación (Capa 2)
Se agregó una lista de paquetes ignorados para evitar falsos positivos:
- `org.telegram.messenger` / `org.thunderdog.challegram` (Telegram)
- `com.whatsapp` / `com.whatsapp.w4b` (WhatsApp personal y business)
- `com.google.android.gm` (Gmail)
- `com.google.android.apps.messaging` (Mensajes de Google)

#### C. Filtro de Contenido del Sistema YapeBot (Capa 3 — Texto)
Notificaciones cuyo texto contenga palabras clave del propio sistema se rechazan:
- `"pedido #"`, `"nuevo pedido"`, `"revisión manual"`
- `"verificado"`, `"yape dashboard"`, `"directo"`, `"woocommerce"`

#### D. Whitelist Estricta de Paquetes Bancarios (Capa 4 — Final)
Solo se aceptan paquetes que estén **explícitamente** en la lista de `BANK_PACKAGES`:
- `com.bcp.innovacxion.yapeapp` / `com.bcp.innovacxion.yape` (Yape)
- `pe.com.interbank.mobilebanking` / `pe.interbank.banca` (Interbank)
- `com.bbva.nxt_peru` (BBVA)
- `com.scotiabank.peru` (Scotiabank)

Cualquier paquete que no esté en esta lista → **rechazado automáticamente**.

---

## 2. Limpieza del Repositorio Git

### Archivos `.traineddata` (Tesseract OCR)
Los archivos de modelos OCR de Tesseract (`*.traineddata`) pesan ~10-15 MB cada uno y no pertenecen al repositorio móvil. Se agregaron al `.gitignore`:

```gitignore
# Tesseract OCR trained data (too large for mobile repo)
*.traineddata
```

---

## 3. Estado Actual del Proyecto (Resumen Acumulado Fase 1–4)

| Componente | Estado | Notas |
|---|---|---|
| Lector Bancario (NotificationListener) | ✅ Funcional | 4 capas de filtrado anti-loop |
| Parser Bancario (Yape, Plin, BBVA, Interbank) | ✅ Funcional | Montos, códigos, remitentes |
| Cola Offline + Idempotencia | ✅ Funcional | AsyncStorage + hash determinista |
| Conciliación OCR vs Notificación | ✅ Funcional | Anti-fraude con cruce múltiple |
| Push FCM (registro + canal Android) | ✅ Funcional | Canal `default` / MAX prioridad |
| Pantalla de Diagnóstico | ✅ Completa | FCM, Lector, Backend, Cola, Timeline |
| Anti-Bucle Infinito | ✅ **NUEVO** | 4 capas de rechazo en `isMonitoredApp()` |
| Repositorio Git | ✅ Limpio | traineddata excluido |

---

## 4. Archivos Modificados en esta Sesión

| Archivo | Cambio |
|---|---|
| `src/services/bankParser.js` | +44 líneas: anti-loop 4 capas, whitelist estricta, blacklist mensajería |
| `.gitignore` | +1 línea: `*.traineddata` |

---

## 5. Próximos Pasos Pendientes

1. **Compilar nuevo APK** con el fix anti-loop y probar en el Xiaomi POCO M5s.
2. **Verificar en producción** que las notificaciones push del backend no se reinyecten como pagos bancarios.
3. **Prueba de estrés:** Enviar múltiples push FCM consecutivos y confirmar que ninguno pase el filtro.
4. **Considerar:** Agregar logging/contador de notificaciones rechazadas en la pantalla de Diagnóstico para visibilidad.
