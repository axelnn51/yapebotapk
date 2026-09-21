# RESUMEN DE AVANCES — YapeBot-Mobile & YapeBot Backend
## Fase 10: Descongelamiento Cloudflare, Notificaciones Web/Culqi, Blindaje de Pedidos Cancelados y Release APK v3.3.2

**Fecha:** 21 de Septiembre de 2026  
**Versión de App Móvil:** 3.3.2 (versionCode: 9)  
**Binario Compilado:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-v3.3.2-Release.apk` (63.8 MB / 66,945,270 bytes)  
**Acceso Directo Principal:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile.apk`  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git (Público — Commit `0567489`)  
**Repositorio Backend:** https://github.com/axelnn51/yape-bot.git (Privado — Commit `16a174f`)  

---

## 1. Auditoría Forense y Problemas Críticos Resueltos

### A. Pedidos Congelados en el #14066 (hace 2 días)
1. **Caché Persistente en Cloudflare Edge:**
   - La petición `GET /api/orders/all` estaba cacheada en la red perimetral de Cloudflare con un `age: 135238` segundos (~37.5 horas) y `cf-cache-status: HIT`.
   - La app realizaba peticiones sin parámetro anti-caché y el backend no enviaba cabeceras restrictivas.
2. **Discrepancia de API Key en Móvil:**
   - El archivo `.env` del proyecto móvil tenía una API Key antigua (`f6b1aca6...`), mientras que el servidor y ChatWoot utilizan `e4c7c8c525d153f31915ada356c759bc9f3a1cd724070b90f5b8afba7f426004`. Al eludir la caché de Cloudflare, el servidor respondía `HTTP 401`.
3. **Solución Implementada:**
   - Se actualizó `.env` con la clave real del backend.
   - En `src/services/api.js`, se añadió auto-migración transparente desde `AsyncStorage`.
   - Se implementó la inyección forzada del timestamp `_t=${Date.now()}` y cabeceras `Cache-Control: no-cache, no-store, must-revalidate` en todas las consultas GET de la app.
   - En el backend (`index.js`), se agregaron cabeceras `Cache-Control: no-store, no-cache` a todas las rutas de `/api/*`.
   - En `PendingOrdersScreen.js`, el gesto de *pull-to-refresh* vacía la caché local en memoria para forzar lectura inmediata.

---

### B. Notificaciones Push no llegaban para pedidos web (Culqi, tarjetas, etc.)
1. **Error Lógico Fatal en `/wc-webhook`:**
   - El webhook guardaba el pedido en la base de datos (`saveExternalOrder`) **antes** de evaluar el método de pago.
   - Cuando llegaba al bloque `if (!isYape)`, la condición `extOrder.status === orderStatus` siempre era verdadera, abortando con `status_unchanged` y omitiendo el envío de Push para el 100% de los pedidos de Culqi y pasarelas web. Solo los pedidos manuales (Yape) funcionaban por saltarse ese bloque.
2. **Webhook `order.updated` Suspendido en WooCommerce:**
   - En `https://cdkeysperu.com`, el webhook ID 2 (`order.updated`) estaba en estado `disabled`.
3. **Solución Implementada:**
   - Se corrigió el orden de guardado en `index.js`, permitiendo que todo pedido nuevo web o cambio de estado emita su respectivo Push a Android y mensaje a Telegram.
   - Se reactivó vía API el Webhook ID 2 de WooCommerce a estado **`active`**.

---

### C. Pedido Cancelado volvía a Notificar como "Pendiente / Revisión Manual"
1. **Ejecución Asíncrona Ciega en `processOrderWithImage`:**
   - Al entrar un pedido con comprobante, el backend inicia OCR en segundo plano (8 a 15s). Si el usuario cancelaba el pedido en la APK durante ese tiempo, el OCR al finalizar no verificaba si el pedido había sido cancelado, agregaba la nota `⚠️ Revisión Manual Requerida` y enviaba una segunda notificación Push.
2. **Solución Implementada (Commit `16a174f`):**
   - **Interceptor de Estados Terminales:** Si `/wc-webhook` recibe `cancelled`, `trash`, `refunded` o `failed`, marca el pedido como procesado, emite una sola notificación de cancelación y **aborta el flujo inmediatamente**.
   - **Cancelación Silenciosa en OCR:** `processOrderWithImage` verifica el estado en la base de datos y en WooCommerce antes de emitir cualquier Push o nota; si fue cancelado, aborta en silencio.
   - **Abort en `waitForNotification`:** Si el pedido se cancela, se cancela la espera de 3 minutos.
   - **Sincronización en `POST /orders/:id/status`:** Al marcar como cancelado en la app móvil, el backend lo marca de inmediato en `processed_orders`.

---

## 2. Compilación Nativa del Release APK v3.3.2 (versionCode: 9)

- **Entorno:** OpenJDK 21 (JBR) de Android Studio, mapeo virtual `Y:\` (`subst`) para mitigar `MAX_PATH` en C++ de Reanimated.
- **Resultado:** `BUILD SUCCESSFUL in 1m 18s` (744 tareas evaluadas).
- **Archivos generados en el escritorio:**
  - `C:\Users\axeln\OneDrive\Desktop\YapeBot-v3.3.2-Release.apk` (66,945,270 bytes)
  - `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile.apk` (acceso directo actualizado)
- **Instalación:** Como tiene `versionCode 9`, se instala directamente encima de la versión actual sin borrar la app, conservando los permisos de Xiaomi MIUI/HyperOS intactos.

---

## 3. Estado de los Repositorios Git

* **`yapebotapk` (Frontend Móvil):**
  - Commit `3c38074`: bump version to 3.3.2 (versionCode 9).
  - Commit `0567489`: bump versionCode en build.gradle nativo.
  - Rama `main` limpia y pusheada a GitHub.
* **`yape-bot` (Backend Portainer):**
  - Commit `d1ba715`: fix de webhook prematuro y cabeceras anti-caché.
  - Commit `16a174f`: blindaje de estados cancelados/terminales y abort de OCR.
  - Rama `main` limpia y pusheada a GitHub.

---

## 4. Próximos Pasos para la Siguiente Sesión

1. **En el teléfono:** Instalar el archivo `YapeBot-v3.3.2-Release.apk` sobre la instalación existente.
2. **En Portainer:** Pulsar **"Pull and redeploy"** en el stack de `YapeBot` (`https://192.168.18.187:9443`) para aplicar los cambios del backend.
3. **Prueba final:** Realizar una compra de prueba en la web (o cambio de estado) para certificar el ciclo completo en producción.
