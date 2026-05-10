# Guía de Entorno de Desarrollo para Yape Bot (Fast Refresh)

Dado que la aplicación utiliza módulos nativos personalizados (`react-native-android-notification-listener`) para leer las notificaciones en segundo plano, **no es posible usar la app normal de "Expo Go"** para programar. 

Estar compilando un APK de producción (`eas build -p android --profile preview`) para cada pequeño cambio no es viable. Aquí tienes las instrucciones paso a paso para cuando tengas tiempo de configurar un entorno profesional.

---

## Opción 1: Expo Dev Client (Recomendado)
*Esta opción es la más sencilla porque no requiere instalar Android Studio en tu PC. Todo se compila en la nube 1 sola vez.*

### Pasos a seguir:
1. **Instalar la librería:**
   Abre la terminal en la carpeta `yape-app` y ejecuta:
   ```bash
   npx expo install expo-dev-client
   ```

2. **Compilar el APK de Desarrollo:**
   Envía el proyecto a los servidores de Expo usando el perfil de desarrollo:
   ```bash
   npx eas-cli build -p android --profile development
   ```

3. **Instalar en tu móvil:**
   Cuando termine (unos 10 mins), descarga ese APK especial y entrégalo en tu POCO M5s. **Esta será la última vez que instales un APK manualmente.**

4. **Programar en Tiempo Real:**
   * En tu PC, corre el servidor local:
     ```bash
     npx expo start
     ```
   * Asegúrate de que tu celular y tu PC estén en la misma red Wi-Fi.
   * Abre la app "Yape Dashboard" que acabas de instalar en tu celular. Debería detectar el servidor de tu PC automáticamente.
   * **Listo:** Cualquier cambio en el código (colores, textos, lógica) aparecerá en la pantalla del celular en menos de 1 segundo al presionar "Guardar".

---

## Opción 2: Android Studio + USB (100% Local y Offline)
*Esta opción usa tu propia computadora para compilar el código. Es más pesada, pero no dependes de las colas de espera de los servidores de Expo.*

### Pasos a seguir:
1. **Instalar Android Studio:**
   Descarga e instala [Android Studio](https://developer.android.com/studio). Durante la instalación, asegúrate de marcar "Android SDK" y "Android SDK Platform-Tools".

2. **Variables de Entorno (Windows):**
   * Configura la variable `ANDROID_HOME` apuntando a `C:\Users\tu_usuario\AppData\Local\Android\Sdk`.
   * Añade `platform-tools` a tu variable de sistema `PATH`.

3. **Preparar tu POCO M5s:**
   * Ve a Ajustes > Sobre el teléfono > Toca 7 veces "Versión de MIUI" para ser desarrollador.
   * Ve a Ajustes Adicionales > Opciones de desarrollador.
   * Activa **Depuración USB** e **Instalar vía USB**.
   * Conecta tu celular a la PC con cable original. Acepta el cartel de "Confiar en esta computadora".

4. **Compilar Localmente:**
   En tu terminal (`yape-app`), ejecuta:
   ```bash
   npx expo run:android
   ```
   *La primera vez tardará varios minutos porque descargará Gradle y compilará todo el código nativo desde cero.*

5. **Programar en Tiempo Real:**
   Una vez que termine, la app se abrirá mágicamente en tu teléfono. A partir de aquí, funciona igual: cualquier cambio en el código se reflejará al instante gracias al Fast Refresh.
