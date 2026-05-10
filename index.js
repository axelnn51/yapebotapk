import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNAndroidNotificationListener from 'react-native-android-notification-listener';
import axios from 'axios';
import App from './App';

import { AppRegistry } from 'react-native';
import { RNAndroidNotificationListenerHeadlessJsName } from 'react-native-android-notification-listener';

// Registrar el Listener nativo para ejecutarse en segundo plano
const headlessNotificationListener = async ({ notification }) => {
    if (!notification) return;

    try {
        const notif = JSON.parse(notification);
        const { app, title, text } = notif;
        
        // Filtrar apps de pago
        const validApps = ['com.bcp.innovacxion.yape', 'com.bbva.nxt_peru', 'pe.interbank.banca'];
        if (!validApps.includes(app)) {
            return;
        }

        // Obtener configuración guardada desde SettingsScreen
        const configStr = await AsyncStorage.getItem('yape_bot_config');
        if (!configStr) {
            console.log('No hay configuración de servidor guardada.');
            return;
        }

        const config = JSON.parse(configStr);
        const { url, key } = config;

        if (!url || !key) {
            console.log('Falta URL o Key en la configuración.');
            return;
        }

        const webhookUrl = `${url.replace(/\/$/, '')}/yape-webhook`;

        // Payload compatible con el backend
        const payload = {
            sender: title || 'Yape/Plin',
            text: text || '',
            secret: key
        };

        await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        
        console.log(`✅ Notificación enviada exitosamente a ${webhookUrl}`);

    } catch (e) {
        console.log('❌ Error al procesar notificación:', e.message);
    }
};

// Registrar correctamente la tarea Headless JS
AppRegistry.registerHeadlessTask(
    RNAndroidNotificationListenerHeadlessJsName,
    () => headlessNotificationListener
);


// Registrar App principal (SIEMPRE debe ejecutarse)
registerRootComponent(App);
