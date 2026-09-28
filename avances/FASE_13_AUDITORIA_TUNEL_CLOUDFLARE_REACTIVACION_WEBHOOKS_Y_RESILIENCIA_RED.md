# Fase 13: Auditoría Forense de Túnel Cloudflare (Error 1033), Reactivación de Webhooks WooCommerce y Blindaje de Resiliencia de Red

**Fecha:** 28 de Septiembre de 2026  
**Versión de App Móvil:** 3.4.0 (Build 10)  
**Binario Actual en Dispositivo:** `YapeBot-v3.4.0.apk`  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git (Commit `49e771e`)  
**Repositorio Backend:** https://github.com/axelnn51/yape-bot.git (Commit `16a174f`)  
**Ecosistema:** WooCommerce (`https://cdkeysperu.com`) + Cloudflare Zero Trust Tunnel + Portainer / Docker (`cdkeys`)

---

## 1. Resumen Ejecutivo de la Sesión

En esta sesión se auditó una falla intermitente en la visualización de pedidos en la APK móvil al operar bajo datos móviles compartidos (hotspot), así como la aparente ausencia de notificaciones tras realizar una compra de prueba en la tienda web (*Office 365 Pro Plus* por S/ 45).

La investigación forense en vivo reveló:
1. **La causa raíz del error de visualización:** Una desconexión del túnel de Cloudflare (**HTTP 530 / Error 1033**) ocasionada por el estado del servidor local/Portainer (`cdkeys`), agravada por la latencia en red móvil que superaba el timeout de 15 segundos y borraba la pantalla en la app.
2. **La causa raíz de la falta de notificación:** La compra `#14121` se realizó con cupón (`officetech`, total S/ 0.00, sin movimiento bancario en la app de Yape), mientras que los **Webhooks de WooCommerce estaban suspendidos en estado `disabled`** tras acumular 5 fallos consecutivos de entrega cuando el servidor estuvo apagado días atrás.
3. **Acciones inmediatas ejecutadas:** Reactivación exitosa de los webhooks vía API REST de WooCommerce, blindaje en el cliente móvil contra micro-cortes y timeout extendido a 25s, con sincronización total a GitHub.

---

## 2. Diagnóstico Forense Detallado

### 2.1. Intermitencia en Pedidos y Error 1033 (Cloudflare Tunnel)
* **Diagnóstico de Red:**
  * El dominio de producción `https://yape.cdkeysperu.com` se enruta mediante un contenedor `cloudflared` ejecutado en el servidor Linux local (`192.168.18.187` / `cdkeys`).
  * Cuando el host físico entra en reposo, se apaga o el router reinicia la concesión DHCP, Cloudflare interrumpe el enlace perimetral y responde con:
    $$\text{HTTP 530} \longrightarrow \textbf{Error 1033: Cloudflare Tunnel error}$$
  * En la app móvil, el método `apiRequest` recibía la página HTML de error de Cloudflare en lugar del JSON esperado, arrojando en pantalla:
    `Error del servidor (530): error code: 1033` o fragmentos de código HTML.
* **Impacto de Datos Compartidos (Hotspot):**
  * La consulta `GET /api/orders/all` requiere que el backend consulte en tiempo real la API de WooCommerce para verificar productos y cupones.
  * En enlaces con mayor jitter/latencia (datos móviles compartidos), el tiempo de respuesta sumado superaba el límite previo de 15 segundos (`AbortError`).
  * En `PendingOrdersScreen.js`, el temporizador de sondeo de fondo (cada 15s) borraba la lista completa ya visible si detectaba un micro-corte, bloqueando la interfaz con el cartel de error a pantalla completa.
* **Por qué volvió a funcionar temporalmente:**
  * Se confirmó en telemetría que a las 5:35 p.m. el servidor local estuvo activo con un *uptime* de ~24 minutos. Al reanudar el túnel, la app descargó los pedidos normalmente.

---

### 2.2. Auditoría de la Compra de Office 365 (Pedido #14121)
Se inspeccionó la transacción directamente en la base de datos de WooCommerce:
* **ID:** `#14121`
* **Fecha:** `28/09/2026, 1:06 p.m.`
* **Cliente:** Axel Gómez (`axelnn51@gmail.com`)
* **Producto:** *Cuenta Office Pro Plus 365 - 5 Dispositivos* (Precio catálogo: S/ 45.00)
* **Cupón utilizado:** `officetech` (Descuento 100%)
* **Total facturado:** **S/ 0.00** (`payment_method: "N/A"`, `status: "completed"`)

**¿Por qué no llegó notificación?**
1. **Factor Bancario:** Al ser costo cero vía cupón, la aplicación Yape nunca procesó una transferencia ni generó notificación en la bandeja del sistema Android. El módulo nativo `NotificationListenerService` no tenía ningún evento bancario que capturar.
2. **Factor WooCommerce (Crítico):**
   * Al consultar `/wp-json/wc/v3/webhooks`, se descubrió que ambos webhooks estaban desactivados:
     * `Webhook 1 (order.created)`: `status: disabled` (desde el 24-Sep-2026 11:15 AM).
     * `Webhook 2 (order.updated)`: `status: disabled`.
   * **Mecanismo de suspensión:** WooCommerce desactiva de forma automática cualquier webhook si el servidor de destino devuelve 5 errores consecutivos (ej. timeout o error 530 cuando la máquina local estuvo desconectada).
   * Al estar desactivados, WooCommerce **nunca notificó al backend** al crearse el pedido `#14121`, impidiendo que el backend despachara la notificación Push FCM a la app.

---

## 3. Soluciones y Mejoras Implementadas

### 3.1. Reactivación de Webhooks en WooCommerce
Mediante la API REST autenticada con credenciales maestras, se restauró el estado de ambos webhooks:
* `PUT /wp-json/wc/v3/webhooks/1` $\longrightarrow$ `status: active`
* `PUT /wp-json/wc/v3/webhooks/2` $\longrightarrow$ `status: active`
* Ambos webhooks quedaron verificados y listos para despachar eventos a `https://yape.cdkeysperu.com/wc-webhook`.

### 3.2. Blindaje de Red en el Cliente Móvil (`YapeBot-Mobile`)
1. **Mapeo Inteligente de Errores Cloudflare ([`src/services/api.js`](file:///c:/Users/axeln/OneDrive/Desktop/YapeBot-Mobile/src/services/api.js)):**
   * Se interceptaron los códigos HTTP 530, 520 y cadenas de error `1033` / `Tunnel error`.
   * La app ahora muestra un diagnóstico claro y amigable al usuario:
     > *"Túnel Cloudflare desconectado (Error 1033/530). Verifica que el servidor o Portainer local esté encendido."*
2. **Ampliación de Timeout:**
   * Se incrementó el umbral de desconexión de **15 segundos a 25 segundos**, tolerando latencias altas en conexiones por hotspot móvil.
3. **Resiliencia en Pantalla ([`src/screens/PendingOrdersScreen.js`](file:///c:/Users/axeln/OneDrive/Desktop/YapeBot-Mobile/src/screens/PendingOrdersScreen.js)):**
   * Se modificó `fetchOrders`: si ya existen pedidos cargados en pantalla y ocurre un fallo de red durante el sondeo en segundo plano, **los pedidos previos se conservan visibles**, evitando pantallas de error abruptas.

---

## 4. Estado de los Repositorios Git

* **`yapebotapk` (Frontend Móvil):**
  * Commits subidos a `main`:
    * `108c3df`: feat(payments): Vuelto-inspired payment capture engine, Anti-OTP filter, and new Yapes received tab (v3.4.0)
    * `6832cce`: fix(audit): sync native build.gradle to v3.4.0, add sendIncomingNotification endpoint and harden PaymentsScreen
    * `23b207b`: docs(avances): add Phase 12 system audit, CMake fix, and APK v3.4.0 release report
    * `49e771e`: fix(network): map Cloudflare Error 1033/530, extend timeout to 25s, and protect order list during background sync errors
  * **Estado:** 100% sincronizado con `origin/main` en GitHub.
* **`yape-bot` (Backend Docker/Portainer):**
  * Rama `main` limpia y al día con GitHub (Commit `16a174f`).

---

## 5. Hoja de Ruta para la Próxima Sesión

Cuando retomes las actividades:

1. **En la máquina del servidor local:**
   * Confirmar la IP local asignada por el router (ej. `192.168.18.187` u otra IP asignada por DHCP).
2. **En Portainer:**
   * Acceder a Portainer vía navegador (`https://<IP-SERVIDOR>:9443`).
   * Ir al stack de **`YapeBot`** y pulsar **"Pull and redeploy"** para actualizar el contenedor con los parches más recientes.
   * Asegurarse de que ambos contenedores (**`yape-bot`** y **`yape-tunnel`**) figuren en estado verde (**`running`**).
3. **En la App Móvil:**
   * Puedes continuar usando normalmente la APK **`YapeBot-v3.4.0.apk`** que tienes instalada en el POCO M5s; no requiere reinstalación urgente.
4. **Verificación final:**
   * Hacer un cambio de estado o compra de prueba en la web para certificar el ciclo completo:
     $$\text{WooCommerce} \xrightarrow{\text{Webhook}} \text{Backend} \xrightarrow{\text{FCM Push}} \text{Móvil}$$
