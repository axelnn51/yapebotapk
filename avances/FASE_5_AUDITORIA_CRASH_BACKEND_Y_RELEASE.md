# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 5: Auditoría General, Reparación Crash Backend y Build v3.2.1)

**Fecha de guardado:** 11 de Septiembre de 2026 (~01:15 AM)  
**Sesión:** Nocturna — Resolución de Error de Conexión y Auditoría Integral  
**Versión del Proyecto:** 3.2.1 (versionCode: 6)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git  
**Repositorio Backend:** https://github.com/axelnn51/yape-bot.git  

---

## 1. Auditoría del Error Reportado

El usuario reportó un fallo al ingresar a la app con el mensaje:
> 🔴 **Error de conexión:** `JSON Parse error: Unexpected character: e`  
> Y en el debug del lector aparecía una notificación de `com.entel.movil` con `Filtro: ✅ Pasó`.

### Causa Raíz Diagnosticada

#### A. Caída del Contenedor Docker Backend (`yape-bot`)
1. El contenedor Docker en el servidor remoto (`192.168.18.187`) se encontraba en un bucle infinito de reinicios (`Restarting (1)`).
2. **Origen del Bug:** En el commit `5c6a504` del backend se creó la suite de verificación OCR modular (`services/verification/parser.js`), la cual fue requerida en `ocr.js`.
3. Sin embargo, el `Dockerfile` del backend solo contenía:
   ```dockerfile
   COPY *.js ./
   ```
   Por lo tanto, la carpeta `services/` **nunca fue copiada dentro de la imagen Docker**.
4. Al iniciar Node.js, `ocr.js` arrojaba:
   ```
   Error: Cannot find module './services/verification/parser'
   ```
5. Al estar el contenedor muerto, el túnel de Cloudflare (`yape-tunnel`) no encontraba servicio en el puerto `3001` y devolvía el código de error HTTP 521 de Cloudflare: `"error code: 521 (Web server is down)"`.
6. En la app móvil, `api.testConnection()` y `apiRequest()` recibían esa respuesta en texto plano y llamaban a `res.json()`. Al intentar parsear la primera letra `"e"` de `"error code: 521"`, React Native arrojaba:
   ```
   JSON Parse error: Unexpected character: e
   ```

#### B. Falso Positivo Visual de la Notificación de Entel
1. En `index.js`, el objeto `@yape_debug_last_raw` se guardaba en `AsyncStorage` **antes** del filtro `isMonitoredApp()`, sin la propiedad `passed_filter`.
2. En `SettingsScreen.js`, la condición evaluaba `debugRaw.passed_filter === false ? '❌ FILTRADO' : ... : '✅ Pasó'`. Como era `undefined`, caía por defecto en `✅ Pasó`.
3. En la lógica real, la notificación de Entel **SÍ fue rechazada** en la línea 105 (`isMonitoredApp()`), razón por la cual no incrementó las lecturas ni se envió al servidor.
4. Adicionalmente, el APK instalado en el teléfono seguía siendo el de la Fase 3 (9 de septiembre), dado que la Fase 4 (anti-loop) aún no había sido compilada a un APK instalable.

---

## 2. Soluciones Aplicadas y Verificadas

### A. Reparación y Levantamiento del Backend Docker
1. Se modificó el `Dockerfile` del backend agregando:
   ```dockerfile
   COPY *.js ./
   COPY services/ ./services/
   ```
2. Se reconstruyó la imagen `yape-bot-yape-auto` incorporando todos los módulos de `services/verification/`.
3. Se recreó el contenedor `yape-bot` en el servidor con los puertos y volúmenes vinculados.
4. **Verificación en Servidor:**
   - Contenedor en estado `Up (healthy)`.
   - Firebase Admin inicializado correctamente con `serviceAccountKey.json`.
   - Tesseract OCR inicializado en modo SPARSE_TEXT.
   - Endpoint local `http://192.168.18.187:3001/health` $\rightarrow$ `status: "ok", version: "2.2"`.
   - Endpoint Cloudflare `https://yape.cdkeysperu.com/health` $\rightarrow$ `status: "ok", version: "2.2"`.
5. Se comiteó y envió el fix al repositorio `yape-bot` en GitHub (`commit 3dc0def`) y se sincronizó el clon del servidor.

### B. Blindaje de la App Móvil contra Errores no-JSON
En `src/services/api.js` (`testConnection` y `apiRequest`) y `DiagnosticScreen.js`:
- Se reemplazó el `response.json()` directo por lectura de texto con parseo seguro en `try/catch`.
- Se añadieron mensajes específicos para errores de infraestructura:
  - `HTTP 521` $\rightarrow$ `"Servidor caído (Cloudflare 521). Revisa el contenedor Docker."`
  - `HTTP 502` $\rightarrow$ `"Bad Gateway (502). El backend no responde."`
  - `HTTP 504` $\rightarrow$ `"Gateway Timeout (504)."`
  - `HTTP 404` $\rightarrow$ `"Ruta no encontrada (404)."`
- Si el servidor devuelve texto o HTML, la app ya no crasheará con `"JSON Parse error"` sino que mostrará un mensaje claro y descriptivo.

### C. Corrección del Debug de Notificaciones
1. En `index.js`, se actualizó `rawRecord.passed_filter`:
   - `passed_filter: false, reason: 'App no bancaria'` si no supera `isMonitoredApp()`.
   - `passed_filter: false, reason: 'No es pago'` si `!parsed.isPayment`.
   - `passed_filter: true, reason: 'Pago S/ ...'` si supera todas las validaciones.
2. En `SettingsScreen.js`, se corrigió la condición para mostrar explícitamente `❌ FILTRADO (App no bancaria)` o `✅ Pasó (Pago válido)`.

### D. Nueva Versión y Compilación del APK
- Versión actualizada a **3.2.1** (versionCode **6**).
- Compilación de Release ejecutada con Gradle 8.10.2 + OpenJDK 21 (Android Studio JBR).
- Incorpora todas las defensas anti-bucle de Fase 4 + blindaje de conexión y fixes de Fase 5.

---

## 3. Archivos Modificados

| Archivo | Cambio |
|---|---|
| `src/services/api.js` | Blindaje en `testConnection` y `apiRequest` contra respuestas no-JSON y mapeo de errores HTTP |
| `index.js` | Registro explícito de `passed_filter` y `reason` en debug raw; parseo seguro en `sendToBackend` |
| `src/screens/SettingsScreen.js` | Visualización corregida del estado del filtro de notificaciones |
| `src/screens/DiagnosticScreen.js` | Parseo protegido en reintento de cola offline |
| `app.json` | Versión `3.2.1`, versionCode `6` |
| `android/app/build.gradle` | Versión `3.2.1`, versionCode `6` |
| `../YapeBot/Dockerfile` | Añadido `COPY services/ ./services/` (Backend en GitHub `origin/main`) |

---

## 4. Binarios de Release APK Generados

- **Archivo Principal en Escritorio:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile-v3.2.1.apk`
- **Archivo Actualizado:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile-ULTIMA.apk`
- **Tamaño:** 59,334,254 bytes (~56.59 MB)
- **Firma:** `APK Signature Scheme v2: true` (Verificada con `apksigner`)
- **Package:** `com.yape.dashboard`
- **Versión:** `3.2.1` (versionCode: `6`)
- **Compilación:** `BUILD SUCCESSFUL in 2m 14s` (1179 tareas de Gradle)

