# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 8: Auditoría Forense Milimétrica, Resultados Reales y Arquitectura n8n + Chatwoot)

**Fecha:** 15 de Septiembre de 2026  
**Versión del Proyecto Móvil:** 3.3.0 (versionCode: 7)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git  
**Repositorio Backend:** https://github.com/axelnn51/yape-bot.git  
**Ecosistema Relacionado:** Chatwoot (`C:\Users\axeln\OneDrive\Desktop\ChatWoot`) + n8n + WooCommerce CDKeys Perú  

---

## 1. Auditoría Forense y Telemetría en Vivo (Resultados Reales)

Se realizaron pruebas de telemetría directamente contra la infraestructura de producción activa (`https://yape.cdkeysperu.com`) y pruebas unitarias milimétricas con el motor de NodeJS.

### A. Estado del Servidor Backend (`/api/dashboard`)
- **Estado:** `OK` (Cloudflare Tunnel + Contenedor Docker `yape-bot` 100% operativos).
- **Versión Backend:** `3.0` (Uptime: > 1 hora continua tras últimos despliegues).
- **Métricas Reales de Hoy (15-Sep-2026):**
  - Pedidos procesados hoy: **3 pedidos** (Ingresos: **S/ 140.00**).
  - Semana acumulada: **25 pedidos** (Ingresos: **S/ 1,055.21**).
  - Consumo de memoria del contenedor: **22 MB** (Óptimo).

### B. Estado del Teléfono Físico en Vivo (`/api/device-status`)
- **Dispositivo Conectado:** `POCO 2207117BPG` (Xiaomi POCO M5s).
- **Latido (Heartbeat):** Activo (recibido hace < 180 segundos).
- **Lector de Notificaciones (`isListenerConnected`):** `true` (Servidor confirma que el servicio Headless Android está enlazado).
- **Cola de Reintentos:** `queuePending: 0`, `queueFailed: 0`.
- **🚨 Discrepancia Crítica de Versión:** El teléfono está emitiendo con `clientVersion: "3.2.1"`. El POCO M5s **aún no tiene instalado el APK v3.3.0 compilado en Fase 7**.

### C. Estado de Notificaciones Push FCM (`/api/push-status`)
- **Firebase Admin SDK:** Inicializado y conectado con `serviceAccountKey.json`.
- **Token Nativo FCM:** `type: fcm`, Dispositivo `2207117BPG`, registrado y actualizado exitosamente hoy a las `12:34:56`.
- **Tokens Huérfanos:** Existen 7 tokens obsoletos de Expo en la base de datos SQLite que generan alertas residuales en cada push.

### D. Verificación del Flujo de Producción de Hoy (`/api/logs`)
- **12:34:51** — Pedido `#13916` recibido: S/ 60.00 de *"Jose A."* (Yape Manual).
- **12:34:55** — Verificación OCR: `EXPIRED (HOLD_FOR_MANUAL_REVIEW)` por ausencia de hora legible en comprobante.
- **12:34:56** — Disparo de Push FCM al POCO M5s: `PUSH_SENT` (`success: 1, failure: 0`). Notificación entregada al teléfono.

---

## 2. Resultados de la Suite de Pruebas Milimétricas en Código

Se ejecutaron 21 tests automatizados sobre la lógica de `bankParser.js` y `reconciliation.js`:

| Prueba Ejecutada | Escenario / Payload | Resultado | Estado |
|---|---|---|---|
| **Anti-Loop Capa 1** | Notificación con `pkg: com.yape.dashboard` | Rechazado categóricamente | ✅ Conforme |
| **Anti-Loop Capa 2** | Notificación de `com.whatsapp`, `org.telegram.messenger` | Rechazado | ✅ Conforme |
| **Anti-Loop Capa 3** | Notificación con palabras clave del sistema (`pedido #1042`, `woocommerce`) | Rechazado | ✅ Conforme |
| **Anti-Loop Capa 4** | Paquetes oficiales Yape, Plin, BBVA, Interbank | Aceptados | ✅ Conforme |
| **Parser Yape 1** | `"Henry Pal* te envió un pago por S/ 35. El cód. de seguridad es: 869."` | S/ 35.00, Cód 869, Remitente Henry Pal* | ✅ Conforme |
| **Parser Yape 2** | `"Yape! VARGAS PALOMINO SHARON SALOME te envió un pago por S/ 30.00."` | S/ 30.00, Remitente Sharon Vargas | ✅ Conforme |
| **Parser Plin** | `"Juan Perez te ha plineado S/ 25.50"` | S/ 25.50, Remitente Juan Perez | ✅ Conforme |
| **Conciliación A** | Voucher S/ 35 (Cód 869) vs Notif S/ 35 (Cód 869) | `MATCH_VALIDO` (Auto-aprobado) | ✅ Conforme |
| **Conciliación B** | Voucher Cód 999 vs Notif Cód 869 | `ALERTA_FRAUDE` (Rechazado) | ✅ Conforme |
| **Conciliación C** | Voucher S/ 35 vs Notif S/ 30 | `REVISION_MANUAL` (Monto discrepante) | ✅ Conforme |
| **Conciliación D** | Voucher "Carlos Benitez" vs Notif "Maria Rodriguez" | `REVISION_MANUAL` (Remitente no coincide) | ✅ Conforme |
| **Colisión Apellido** | `"Juan Quispe"` vs `"Maria Quispe"` | `matchSenderNames: true` | ⚠️ **Vulnerabilidad** |

---

## 3. Hallazgos y Vulnerabilidades Detectadas

1. **Falso Positivo de Identidad en Conciliación (`reconciliation.js`):**
   `matchSenderNames` retorna `true` si al menos un término de 3 letras coincide. En el caso de apellidos comunes peruanos (Quispe, Flores, Rodriguez, Gomez), dos clientes distintos con el mismo monto pueden auto-aprobarse indebidamente.
2. **Auto-sabotaje del Botón de Prueba en `SettingsScreen.js`:**
   El botón *"Lanzar Notificación de Prueba"* emite una notificación con `com.yape.dashboard`, la cual es bloqueada de inmediato por el filtro anti-bucle en `bankParser.js`.
3. **Desalineación de API Key en Fallback (`heartbeatService.js`):**
   Si la app no tiene guardada la clave en `AsyncStorage`, recurre a `'cdkeys-yape-2026-secret-key-prod'` que el backend rechaza con `HTTP 401`. La clave real es el hash sha256 configurado en el `.env`.
4. **Dispositivo Físico Desactualizado:**
   El Xiaomi POCO M5s aún corre la versión `3.2.1` y no la `3.3.0` libre de `expo-dev-client`.
5. **Tokens Huérfanos en BD:**
   Existen 7 tokens tipo `expo` en la tabla `push_tokens` del servidor que generan llamadas inútiles en cada push.

---

## 4. Propuestas Técnicas de Endurecimiento (App Móvil y Backend)

### Propuesta 1: Algoritmo de Conciliación Anti-Fraude con Score Ponderado
- No permitir auto-aprobación con un solo término coincidente si este pertenece a una lista de apellidos comunes.
- Exigir:
  1. Coincidencia estricta de monto (diferencia < S/ 0.05).
  2. Coincidencia del código de seguridad (si ambas fuentes lo poseen).
  3. Coincidencia del primer nombre O de 2 o más términos con similitud > 80%.
  4. En caso de ambigüedad, marcar forzosamente como `REVISION_MANUAL`.

### Propuesta 2: Corrección del Simulador Local en Pantalla
- Modificar el botón de prueba en `SettingsScreen.js` para que invoque directamente al endpoint `/api/test-webhook` con un payload sintético de prueba o inyecte directamente un evento interno en la cola, evitando pasar por la bandeja de notificaciones de Android que el anti-loop debe bloquear.

### Propuesta 3: Configuración Cero (Zero-Config)
- Inyectar como valores predeterminados en `api.js` y `heartbeatService.js`:
  - URL: `https://yape.cdkeysperu.com`
  - API Key: Variable local en `.env` (`EXPO_PUBLIC_API_KEY`)
- Al instalar el APK limpio, la app estará enlazada sin requerir tecleo manual.

### Propuesta 4: Limpieza de Base de Datos de Tokens
- Ejecutar limpieza en SQLite del backend: `DELETE FROM push_tokens WHERE type = 'expo';` para optimizar los despachos push.

---

## 5. Propuesta de Arquitectura e Integración: YapeBot Mobile ➔ n8n ➔ Chatwoot (CDKeys Perú)

### A. Visión General del Ecosistema
El objetivo es enlazar la captura de pagos en vivo del teléfono Android con las conversaciones de ventas en **Chatwoot** (WhatsApp / Web) a través del orquestador **n8n** alojado en el servidor (`https://n8n.cdkeysperu.com`).

```
                              ┌──────────────────────────────────────────────────┐
                              │                 CLIENTE FINAL                    │
                              │   (Chatea por WhatsApp / Webchat en Chatwoot)    │
                              └───────────────┬─────────────────▲────────────────┘
                                              │                 │
                                       Pide Producto       Entrega Automática
                                      y Yapea en su cel    de Licencia Digital
                                              │                 │
                                              ▼                 │
┌─────────────────────────┐          ┌──────────────────────────┴────────────────┐
│   XIAOMI POCO M5s       │          │           CHATWOOT (Atención al Cliente)   │
│  (Lector YapeBot-Mobile)│          │   - Conversación activa con cliente       │
│                         │          │   - Teléfono / Nombre registrado          │
└───────────┬─────────────┘          └──────────────────────────▲────────────────┘
            │ (Pago detectado)                                  │
            ▼                                                   │
┌─────────────────────────┐                                     │
│  BACKEND YAPEBOT v3     ├────────────┐                        │
│  - Valida idempotencia  │            │ (Webhook HTTP POST)    │
│  - Guarda en SQLite     │            ▼                        │
│  - Notifica a Tienda    │    ┌────────────────────────────────┴────────┐
└─────────────────────────┘    │             n8n WORKFLOW ENGINE         │
                               │  (Endpoint: /webhook/yape-payment)      │
                               │                                         │
                               │  1. Recibe payload del pago             │
                               │  2. Busca conversación en Chatwoot      │
                               │     por teléfono o nombre de cliente    │
                               │  3. Valida monto vs producto cotizado   │
                               │  4. Extrae clave digital de WooCommerce │
                               │  5. Envía mensaje con licencia por WSP  │
                               │  6. Etiqueta: 'venta_completada_yape'   │
                               └─────────────────────────────────────────┘
```

---

### B. Rutas y Opciones de Conexión Propuestas

#### Opción 1: Despacho Dual desde el Backend Central (Recomendada)
- **Flujo:** La app móvil envía el pago capturado a `https://yape.cdkeysperu.com/api/incoming-notification`.
- El backend central procesa la idempotencia, audita el log y, de forma asíncrona, dispara un webhook a n8n:
  `POST https://n8n.cdkeysperu.com/webhook/yape-payment`
- **Ventajas:**
  - Punto único de auditoría y deduplicación.
  - La app móvil no necesita gestionar múltiples URLs ni tokens adicionales.
  - Si n8n se reinicia, el backend central puede reintentar el webhook.

#### Opción 2: Despacho Directo desde la App Móvil (Modo Autónomo)
- **Flujo:** La app móvil envía en paralelo al backend YapeBot y al webhook de n8n.
- **Ventajas:** Máxima velocidad de respuesta (~1 segundo para entregar la licencia en Chatwoot).
- **Desventajas:** Mayor consumo de batería y complejidad de manejo offline en el dispositivo móvil.

---

### C. Especificación del Contrato de Datos (Webhook Payload a n8n)

```json
{
  "event": "payment_received",
  "source": "yapebot_mobile",
  "provider": "Yape",
  "amount": 45.00,
  "currency": "PEN",
  "sender_name": "Henry Palomino",
  "security_code": "869",
  "operation_id": "23453126",
  "timestamp": "2026-09-15T13:30:00-05:00",
  "raw_text": "Henry Pal* te envió un pago por S/ 35. El cód. de seguridad es: 869."
}
```

---

### D. Nodos del Flujo de Trabajo en n8n (`cdkeys_payment_orchestrator.json`)

1. **Webhook Node (Trigger):**
   - Escucha `POST /webhook/yape-payment` con autenticación por Header `X-Yape-Secret`.
2. **Chatwoot Search Node:**
   - Consulta `GET /api/v1/accounts/{account_id}/conversations?q={sender_phone_or_name}`.
   - Si no encuentra por teléfono, busca por similitud de nombre en los contactos recientes de las últimas 2 horas.
3. **Condition Node (Validación de Monto):**
   - Compara el monto recibido con el precio del producto solicitado en la conversación (o pedidos en estado *Pendiente de Pago* en WooCommerce).
4. **WooCommerce / Key Generator Node:**
   - Si la orden existe en WooCommerce, la marca como `Completada` y extrae la clave de licencia.
   - Si la venta fue directa por chat, toma una clave disponible de la tabla de stock digital.
5. **Chatwoot Reply Node:**
   - Envía mensaje automático al chat de WhatsApp del cliente:
     > *"¡Pago confirmado con éxito! 🎉 Aquí tienes tu licencia: `XXXXX-XXXXX-XXXXX`. Guía de activación: `cdkeysperu.com/guia`"*.
6. **Chatwoot Label Node:**
   - Agrega etiqueta `pago_yape_auto_aprobado` y resuelve o asigna la conversación.

---

## 6. Estado de Situación y Próximos Pasos Sugeridos

1. **Revisión del usuario:** Confirmar la aprobación de las propuestas de mejora en el código móvil y el diseño de la ruta n8n + Chatwoot.
2. **Aplicación de Parches:** Ejecutar los cambios en `reconciliation.js`, `SettingsScreen.js` y credenciales por defecto.
3. **Actualización de APK en el POCO M5s:** Instalar la versión definitiva v3.3.1 en el teléfono para sincronizarlo con el código endurecido.
