# RESUMEN DE AVANCES — YapeBot-Mobile (Fase 7: Auditoría Forense Crash-Loop y Release v3.3.0)

**Fecha:** 12 de Septiembre de 2026  
**Versión del Proyecto:** 3.3.0 (versionCode: 7)  
**Dispositivo Objetivo:** Xiaomi POCO M5s (Android 14 / MIUI / HyperOS)  
**Repositorio Móvil:** https://github.com/axelnn51/yapebotapk.git  

---

## 1. Diagnóstico Forense del Crash al Abrir la App

El usuario reportó:
> *"La instalé normal pero al abrir la app se cierra y se abre en pantalla negra, ni carga, se cierra y se abre..."*

Se realizó una inspección a bajo nivel del binario instalado (`YapeBot-Mobile.apk` de 69.6 MB, compilado a las 4:06 AM) utilizando `aapt`, `dexdump`, Python y `apksigner`. Se descubrieron **4 fallos críticos concurrentes**:

1. **APK Corrupto / Desincronizado:** El APK en el escritorio tenía `versionCode: 1` y `versionName: 1.0.0`. Su bundle JavaScript carecía por completo del código de las Fases 4, 5 y 6 (`bankParser`, `DiagnosticScreen`, `heartbeatService`, `getQueueStats`).
2. **Inyección de `expo-dev-client` / `DevLauncherController`:** La dependencia `expo-dev-client` estaba incluida en la compilación nativa. Al arrancar la app en un teléfono sin un servidor Metro corriendo en `localhost:8081`, `DevLauncherController` interceptaba la Activity principal, lanzaba un fallo fatal de conexión o `NullPointerException` y colapsaba antes de montar cualquier componente visual. El sistema operativo Android intentaba reiniciar la Activity $\rightarrow$ **bucle continuo de apertura y cierre en pantalla negra**.
3. **Clases Nativas de Notificaciones Eliminadas por ProGuard/R8:** En `gradle.properties` estaba activo `android.enableProguardInReleaseBuilds=true` y `shrinkResources=true` sin reglas para Expo. La inspección del archivo `classes2.dex` demostró que `Lexpo/modules/notifications/*` y `Lexpo/modules/device/*` tenían **0 clases**. Al evaluar `import * as Notifications from 'expo-notifications'`, Hermes lanzaba un error nativo fatal irrecuperable.
4. **Punto de Entrada Erróneo:** En `MainApplication.kt`, `getJSMainModuleName()` retornaba `".expo/.virtual-metro-entry"` en lugar de `"index"`.

---

## 2. Soluciones Aplicadas

1. **Eliminación Total de `expo-dev-client`:**
   - Desinstalado con `npm uninstall expo-dev-client expo-dev-launcher expo-dev-menu`.
   - Se removieron 9 paquetes no deseados del árbol de dependencias.
2. **Desactivación de ProGuard / R8 Destructivo y Reglas de Seguridad:**
   - `android.enableProguardInReleaseBuilds=false` y `android.enableShrinkResourcesInReleaseBuilds=false` en `android/gradle.properties`.
   - Reglas exhaustivas de preservación añadidas a `android/app/proguard-rules.pro` para Expo Modules, React Native, Firebase y Async Storage.
3. **Corrección de `MainApplication.kt` y `AndroidManifest.xml`:**
   - `getJSMainModuleName()` ajustado a `"index"`.
   - `RNAndroidNotificationListenerHeadlessJsTaskService` marcado explícitamente con `android:exported="false"`.
4. **Blindaje Defensivo en Inicialización JavaScript:**
   - En `src/services/api.js`: `Notifications.setNotificationHandler(...)` encapsulado en `try...catch`.
   - En `App.js`: Todos los listeners de notificaciones push FCM (`addPushTokenListener`, `addNotificationReceivedListener`, `addNotificationResponseReceivedListener`) encapsulados en bloques `try...catch` individuales con validación defensiva en la función de limpieza (`?.remove()`).
5. **Compilación Limpia mediante Unidad Virtual de Ruta Corta:**
   - Se mapeó temporalmente la unidad virtual `Y:\` (`subst Y:`) para eliminar cualquier restricción de longitud de ruta de Windows (`MAX_PATH`) con el C++ de `react-native-reanimated`.
   - Se ejecutó `gradlew clean` y `gradlew assembleRelease` con Java 17/21 JBR de Android Studio.

---

## 3. Auditoría del Binario Resultante (v3.3.0 Release)

| Parámetro | Resultado Auditado | Estado |
|---|---|---|
| **Package Name** | `com.yape.dashboard` | ✅ Correcto |
| **versionCode** | `7` | ✅ Actualizado |
| **versionName** | `3.3.0` | ✅ Actualizado |
| **Tamaño APK** | 66,944,166 bytes (~63.8 MB) | ✅ Óptimo |
| **Firma Digital** | APK Signature Scheme v2 | ✅ Válida |
| **Clases Expo Notifications** | 267 clases activas | ✅ Restaurado (era 0) |
| **Clases Expo Device** | 15 clases activas | ✅ Restaurado (era 0) |
| **DevLauncher / DevClient** | 0 clases | ✅ Limpio (eliminado) |
| **Listener Nativo** | `RNAndroidNotificationListener` y `BootUpReceiver` | ✅ Verificados |
| **Bundle JS Embebido** | `bankParser`, `DiagnosticScreen`, `heartbeatService`, `getQueueStats`, `openAutoStartSettings` | ✅ Todos presentes |

---

## 4. Archivos Disponibles para Instalación

- **Acceso Directo Principal:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile.apk`
- **Copia Versionada:** `C:\Users\axeln\OneDrive\Desktop\YapeBot-Mobile-v3.3.0.apk`
