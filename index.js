import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { AppRegistry } from 'react-native';

let RNAndroidNotificationListenerHeadlessJsName;
try {
    const mod = require('react-native-android-notification-listener');
    RNAndroidNotificationListenerHeadlessJsName = mod.RNAndroidNotificationListenerHeadlessJsName;
} catch (e) {
    // Module not available in dev builds
}

// ============================================================
// Headless JS Task — Captura notificaciones de Yape/Plin/BBVA
// en segundo plano y las envía al backend via /api/incoming-notification
// Captura SILENCIOSA: no genera notificaciones en la app, solo guarda
// y envía al servidor (que reenvía a Telegram).
// ============================================================
const headlessNotificationListener = async ({ notification }) => {
    if (!notification) return;

    try {
        const notif = JSON.parse(notification);
        const { app, title, text, time } = notif;

        // Guardar heartbeat — indica que el listener está vivo
        // (Esto se registra para TODA notificación)
        try {
            await AsyncStorage.setItem('@yape_listener_heartbeat', JSON.stringify({
                time: new Date().toISOString(),
                app: app || 'unknown',
                alive: true,
            }));
        } catch (e) { /* ignore storage errors */ }

        // Solo procesar apps de pago
        const validApps = [
            'com.bcp.innovacxion.yapeapp', // Yape (nombre real del APK)
            'com.bcp.innovacxion.yape',    // Yape (variante antigua)
            'com.bbva.nxt_peru',           // BBVA
            'pe.interbank.banca',          // Interbank/Plin
        ];

        // También aceptar cualquier app que contenga "yape" en el nombre
        const isValidApp = validApps.includes(app) || 
            (app && app.toLowerCase().includes('yape'));

        // 🔍 DIAGNÓSTICO: Guardar info de CUALQUIER notificación de app de pago
        // (incluso si después se filtra por texto)
        if (isValidApp) {
            try {
                await AsyncStorage.setItem('@yape_debug_last_raw', JSON.stringify({
                    time: new Date().toISOString(),
                    app,
                    title: (title || '').substring(0, 100),
                    text: (text || '').substring(0, 200),
                    passed_filter: 'pending',
                }));
            } catch (e) { /* ignore */ }
        }

        if (!isValidApp) return;

        // Filtro: solo notificaciones que parezcan pagos
        // Más permisivo: cualquier mención de dinero, pago, envío, o confirmación
        const textLower = (text || '').toLowerCase();
        const titleLower = (title || '').toLowerCase();
        const combined = `${titleLower} ${textLower}`;

        const isPayment = combined.includes('s/') || 
            combined.includes('soles') || 
            combined.includes('envi') ||      // envió, envio, enviaste (sin depender de acentos)
            combined.includes('recib') ||     // recibiste, recibido
            combined.includes('pago') ||      // pago, pagó
            combined.includes('transferencia') ||
            combined.includes('depósito') ||
            combined.includes('deposito') ||
            combined.includes('yape') ||      // ¡Yapeaste! / Te yapearon
            combined.includes('plin') ||      // plineaste
            /\d+[.,]\d{2}/.test(combined);    // cualquier número con decimales (ej: 35.00)

        if (!isPayment) {
            // Guardar que fue filtrado para diagnóstico
            try {
                await AsyncStorage.setItem('@yape_debug_last_raw', JSON.stringify({
                    time: new Date().toISOString(),
                    app,
                    title: (title || '').substring(0, 100),
                    text: (text || '').substring(0, 200),
                    passed_filter: false,
                    reason: 'No payment keywords found',
                }));
            } catch (e) { /* ignore */ }
            return;
        }

        // ⚠️ CRÍTICO: Usar las MISMAS keys que api.js
        const url = await AsyncStorage.getItem('@yape_server_url');
        const key = await AsyncStorage.getItem('@yape_api_key');

        if (!url || !key) {
            console.log('[YapeBot Listener] ⚠️ No hay configuración guardada');
            await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
                time: new Date().toISOString(),
                text: text?.substring(0, 80) || '',
                app: app,
                status: 'error',
                error: 'No hay configuración (URL/API Key)',
            }));
            return;
        }

        const cleanUrl = url.replace(/\/+$/, '');

        // Enviar al endpoint autenticado /api/incoming-notification
        // El backend se encarga de: guardar, cruzar con WooCommerce, y enviar a Telegram
        const response = await fetch(`${cleanUrl}/api/incoming-notification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': key,
            },
            body: JSON.stringify({
                sender: title || 'Yape/Plin',
                text: text || '',
            }),
        });

        const result = await response.json();
        console.log(`[YapeBot Listener] ✅ Enviado: S/ ${result?.result?.amount || '?'} | OK: ${result?.ok}`);

        // Guardar en AsyncStorage para la UI (silencioso, sin notificación)
        await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
            time: new Date().toISOString(),
            text: text?.substring(0, 80) || '',
            app: app,
            amount: result?.result?.amount || null,
            status: result?.ok ? 'sent' : 'failed',
            response: result?.ok ? 'OK' : (result?.reason || 'Error'),
        }));

        // Incrementar contador de lecturas
        try {
            const countStr = await AsyncStorage.getItem('@yape_notification_count');
            const count = parseInt(countStr || '0', 10) + 1;
            await AsyncStorage.setItem('@yape_notification_count', String(count));
        } catch (e) { /* ignore */ }

    } catch (e) {
        console.log(`[YapeBot Listener] ❌ Error: ${e.message}`);
        try {
            await AsyncStorage.setItem('@yape_last_notification', JSON.stringify({
                time: new Date().toISOString(),
                status: 'error',
                error: e.message,
            }));
        } catch (storageErr) { /* ignore */ }
    }
};

// Registrar tarea Headless JS
if (RNAndroidNotificationListenerHeadlessJsName) {
    AppRegistry.registerHeadlessTask(
        RNAndroidNotificationListenerHeadlessJsName,
        () => headlessNotificationListener
    );
}

// Registrar App principal
registerRootComponent(App);
