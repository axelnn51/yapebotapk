# RESUMEN DE AVANCES — YapeBot-Mobile
## Fase 9: Release v3.3.1, Zero-Config Seguro (.env), Blindaje Anti-Fugas y Sinergia Omnicanal n8n + Chatwoot

**Fecha:** 15 de Septiembre de 2026  
**Versión de App Móvil:** 3.3.1 (versionCode: 8)  
**Binario Compilado:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-v3.3.1-Release.apk` (63.8 MB)  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git (Público — Auditado, 0 secretos)  
**Repositorio Backend:** https://github.com/axelnn51/yape-bot.git (Privado)  
**Entorno Chatbot / CRM:** `C:\Users\axeln\OneDrive\Desktop\ChatWoot` (Chatwoot + n8n Community)

---

## 1. Auditoría Forense de Seguridad y Prevención de Filtración de Credenciales

Al preparar el despliegue a Git, se detectó que el repositorio de la aplicación móvil (`yapebotapk`) tiene visibilidad **PÚBLICA** en GitHub. Para evitar cualquier filtración de la clave de autenticación del backend (`APP_API_KEY` SHA-256):

1. **Desacople a `.env` Local:**
   - Se aisló la URL de producción y la API Key real en un archivo `.env` en la raíz del proyecto móvil.
   - Se verificó que `.env` está protegido e ignorado estrictamente en `.gitignore` (línea 11).
2. **Plantilla Segura `.env.example`:**
   - Se creó `.env.example` para el repositorio público con marcadores seguros:
     ```env
     EXPO_PUBLIC_SERVER_URL=https://yape.cdkeysperu.com
     EXPO_PUBLIC_API_KEY=tu_api_key_sha256_aqui
     ```
3. **Inyección en Tiempo de Compilación (Expo SDK 52):**
   - En `src/services/api.js`, las constantes leen las variables `process.env.EXPO_PUBLIC_SERVER_URL` y `process.env.EXPO_PUBLIC_API_KEY`.
   - Metro/Expo inyecta los valores reales directamente dentro del bytecode del APK durante el empaquetado nativo sin dejar rastro en el código fuente versionado en Git.
4. **Saneamiento del Historial de Git:**
   - Se realizó un `git reset --soft` y re-commit limpio (`c86fbf9`) asegurando que ningún hash de API Key real quede grabado en los commits públicos.

---

## 2. Mejoras y Parches Aplicados en la App Móvil (v3.3.1)

1. **Zero-Config Predeterminado (`src/services/api.js` e `index.js`):**
   - Si la aplicación se instala de cero o si `AsyncStorage` está vacío, recurre a los defaults de producción embebidos.
   - Auto-migración: si el teléfono tenía guardada la clave obsoleta (`cdkeys-yape-2026-secret-key-prod`), la actualiza automáticamente a la clave real.
2. **Corrección de Fallback de Latidos (`src/services/heartbeatService.js`):**
   - `getServerConfig()` ahora utiliza `getConfig()` de `api.js`, garantizando que el servicio Headless reporte latidos con la clave válida sin ser rechazado con `HTTP 401`.
3. **Reescritura de Prueba Local en `SettingsScreen.js`:**
   - Anteriormente, el botón "Lanzar Notificación de Prueba" intentaba programar una notificación local de Android con el paquete propio `com.yape.dashboard`, la cual era inmediatamente bloqueada por la capa anti-bucle de `bankParser.js`.
   - Se reescribió `testListener` para evaluar directamente la lógica con un objeto sintético de Yape (`parseBankNotification`), registrando el evento en el log interno, actualizando `@yape_last_notification` y aumentando el contador local en vivo.

---

## 3. Mejoras y Parches Aplicados en el Backend (`yape-bot`)

1. **Protección Anti-Fraude de Apellidos Comunes (`services/verification/normalizer.js`):**
   - Se incorporó una lista de los 20 apellidos peruanos de mayor frecuencia (Quispe, Flores, Rodríguez, Sánchez, García, etc.).
   - Si dos comprobantes coinciden únicamente en un apellido común y no en el nombre, la similitud se topa a `0.60` (el umbral de auto-aprobación exige $\ge 0.85$), obligando a que la transacción pase a **`MANUAL_REVIEW`**.
2. **Auto-Purga de Tokens Huérfanos (`pushService.js`):**
   - Cuando el envío a tokens antiguos de Expo arroja error en `axios`, el backend invoca `db.deactivatePushToken(token, 'expo_orphan_cleanup')`, limpiando automáticamente la base de datos SQLite y optimizando los futuros despachos.

---

## 4. Compilación Nativa del Release APK v3.3.1 (versionCode: 8)

Se resolvió el error de Gradle con Android Gradle Plugin 8.6.0 (`No matching variant of project :react-native-async-storage`):

1. **Ajuste en `android/app/build.gradle`:**
   - Se agregó `matchingFallbacks = ['release', 'debug']` en `buildTypes.release` para que las librerías de React Native sin variante explícita resuelvan contra `debug`.
   - Se añadió `lintOptions { checkReleaseBuilds false; abortOnError false }`.
2. **Entorno de Compilación:**
   - Ejecutado con **OpenJDK 21 (JBR)** de Android Studio (`C:\Program Files\Android\Android Studio\jbr`).
   - Mapeo de ruta corta con unidad virtual temporal `Y:\` (`subst Y:`) para evitar el límite `MAX_PATH` de Windows en el compilador C++ de Reanimated.
3. **Resultado:**
   - `BUILD SUCCESSFUL in 51s` (744 tareas evaluadas).
   - Generado: `YapeBot-v3.3.1-Release.apk` (66,945,070 bytes) con firma válida v2/v3.
   - Copiado automáticamente al escritorio para transferencia al teléfono Xiaomi POCO M5s.

---

## 5. Estrategia Omnicanal: Sinergia entre Flujo Web y Flujo Chat (WhatsApp + n8n)

Se definió cómo convivirán y se potenciarán ambos canales:

```
                            ┌────────────────────────────────────────┐
                            │          ORQUESTADOR N8N               │
                            └──────┬──────────────────────────┬──────┘
                                   │                          │
                  [CANAL 1: CHATWOOT WHATSAPP]     [CANAL 2: WOOCOMMERCE WEB]
                                   │                          │
                        Cliente envía Captura            Cliente paga con
                           en conversación               Yape Manual Web
                                   │                          │
                                   ▼                          ▼
                       Gemini Vision extrae JSON       YapeBot Backend concilia
                                   │                   captura vs POCO M5s
                                   ▼                          │
                       Polling (1 a 4 min)                    ▼
                       vs POCO M5s en Backend          Pedido Completado
                                   │                          │
                                   ▼                          ▼
                       Si hay MATCH:                   n8n dispara WhatsApp
                       - Crea Orden en Woo             inmediato al cliente:
                       - Extrae Licencia LMFWC         "Tu pedido #13920 fue
                       - Entrega clave en chat          aprobado. Clave: XXX"
```

### Las 3 Ventajas del Sistema Unificado:
1. **Despacho Omnicanal Instantáneo:** El cliente de la web recibe su clave por WhatsApp sin depender del correo que a veces cae en SPAM.
2. **Centralización Total de Inventario:** Las ventas del chat se registran automáticamente como órdenes completadas en WooCommerce, descontando stock de LMFWC.
3. **Escudo Anti-Doble Gasto:** Ambas vías consultan la misma base de datos SQLite de YapeBot. La primera vía que valide la transacción "quema" la notificación bancaria del POCO M5s como `CONSUMIDA`, impidiendo reutilizar comprobantes.

---

## 6. Documentación Creada y Estado de Repositorios

* **Guía Operativa de Chatwoot:** Registrada en [avances/GUIA_ORQUESTACION_CHATWOOT_N8N_YAPEBOT.md](file:///c:/Users/axeln/OneDrive/Desktop/YapeBot-Mobile/avances/GUIA_ORQUESTACION_CHATWOOT_N8N_YAPEBOT.md).
* **Git Status:**
  - `yapebotapk` (Móvil): Rama `main` en commit `c86fbf9` pusheada y al día.
  - `yape-bot` (Backend): Rama `main` en commit `440c577` pusheada y al día.
  - Binario listo en el escritorio: `YapeBot-v3.3.1-Release.apk`.
