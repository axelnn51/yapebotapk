# Guía Maestra: Orquestación desde Chatwoot hacia n8n y YapeBot-Mobile

Esta guía detalla cómo orquestar la atención de clientes, recepción de comprobantes de Yape y su posterior automatización con n8n y el lector móvil de YapeBot.

---

## 1. Configuración del Webhook en Chatwoot

Para que Chatwoot le envíe los mensajes y capturas a n8n:

1. Ingresa a tu panel de Chatwoot: `https://chat.cdkeysperu.com`.
2. Ve a **Ajustes (Settings)** > **Integraciones (Integrations)** > **Webhooks**.
3. Haz clic en **Añadir nuevo webhook (Add new webhook)**.
4. Completa los campos:
   * **URL del Webhook:**
     * Si usas la red interna de Docker: `http://chatwoot_n8n:5678/webhook/chatwoot-whatsapp`
     * O si usas el subdominio público: `https://n8n.cdkeysperu.com/webhook/chatwoot-whatsapp`
   * **Eventos a suscribir (Events):**
     * Selecciona obligatoriamente: `message_created`.
     * Opcional: `conversation_updated`.
5. Haz clic en **Crear**.

---

## 2. Estructura del Mensaje que Envía Chatwoot

Cuando un cliente escribe por WhatsApp (+51 907 463 313) o envía una imagen de su comprobante, Chatwoot envía un JSON con esta estructura:

```json
{
  "event": "message_created",
  "id": 1042,
  "content": "Ya te yapeé los S/ 35",
  "message_type": "incoming",
  "created_at": 1726431200,
  "conversation": {
    "id": 84,
    "status": "open"
  },
  "sender": {
    "id": 25,
    "name": "Sharon Vargas",
    "phone_number": "+51987654321"
  },
  "attachments": [
    {
      "id": 12,
      "message_id": 1042,
      "file_type": "image",
      "data_url": "https://chat.cdkeysperu.com/rails/active_storage/blobs/.../comprobante.jpg"
    }
  ]
}
```

> **Dato Clave:** Si `attachments` tiene al menos 1 elemento y `file_type === "image"`, significa que **el cliente acaba de mandar una captura o foto de su comprobante bancario**.

---

## 3. Flujo Operativo en Chatwoot (Antes o Mientras se Activa n8n)

Para gestionar las conversaciones con orden profesional:

### A. Etiquetas recomendadas para crear en Chatwoot (Ajustes > Etiquetas):
1. `pago_en_proceso`: El cliente dice que va a yapear.
2. `comprobante_recibido`: El cliente subió su captura.
3. `pago_verificado_exito`: Pago confirmado (sea por n8n o manual).
4. `revision_manual_requerida`: Discrepancia de monto o retraso bancario.

### B. Respuestas Rápidas recomendadas (Ajustes > Respuestas Rápidas):
* **Atajo:** `/yape`  
  **Mensaje:** *"Puedes transferir por Yape o Plin al número **907 463 313** a nombre de **Axel G.** Envíame la captura de pantalla por aquí para validar y entregarte tu clave al instante."*
* **Atajo:** `/espera`  
  **Mensaje:** *"¡Comprobante recibido! 🔎 Nuestro sistema está validando el abono con el banco. Esto toma de 1 a 3 minutos por seguridad. En breve te enviamos tu licencia por este mismo chat."*

---

## 4. Cómo n8n Toma el Control y Valida con YapeBot

Cuando decidas encender el flujo en n8n:

1. **Filtro del Mensaje:**
   * Si `attachments` está vacío: La IA de Gemini Flash responde dudas y cotiza.
   * Si `attachments` contiene imagen: Activa la **Ruta de Verificación Bancaria**.

2. **Extracción con Gemini Flash (Multimodal):**
   * Pasa `data_url` a Gemini con el prompt de lectura de comprobantes.
   * Obtiene:
     ```json
     {
       "monto": 35.00,
       "codigo": "869",
       "operacion": "17289052",
       "remitente": "Sharon Vargas"
     }
     ```

3. **Verificación contra el POCO M5s (YapeBot Backend):**
   * n8n consulta: `GET https://yape.cdkeysperu.com/api/notifications`.
   * Compara si en los últimos 15 minutos entró una notificación bancaria con:
     * Monto exacto: `35.00`
     * Código de seguridad: `869`
   * Si aún no llega al celular, n8n espera 30 segundos (nodo `Wait`) y reintenta hasta 6-8 veces (ventana de 3 a 4 minutos).

4. **Despacho Automático:**
   * Al confirmar el match, n8n consulta a WooCommerce o a la base de stock.
   * Envía un mensaje `POST` a `/api/v1/accounts/1/conversations/{id}/messages` de Chatwoot con la licencia formateada.
   * Marca la conversación como resuelta.
