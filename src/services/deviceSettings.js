// ============================================================
// Device Settings & Battery Optimization Helper — YapeBot Mobile
// Inspirado en JoseGordilloMendoza/LectorNotificacionesYape (BatteryOptimizationHelper.kt)
// ============================================================

import { Linking, Platform, NativeModules } from 'react-native';

const { RNAndroidNotificationListener } = NativeModules;

/**
 * Abre la pantalla de Inicio Automático (AutoStart) de Xiaomi / MIUI / HyperOS
 * Si no es Xiaomi o falla el intent específico, redirige a los ajustes de la aplicación.
 */
export async function openAutoStartSettings() {
  if (Platform.OS !== 'android') return false;

  try {
    // 1. Intentar a través del módulo nativo si está disponible
    if (RNAndroidNotificationListener && typeof RNAndroidNotificationListener.openAutoStartSettings === 'function') {
      return await RNAndroidNotificationListener.openAutoStartSettings();
    }

    // 2. Intentar vía Linking con intent de MIUI
    await Linking.sendIntent('android.intent.action.VIEW', [
      { key: 'component', value: 'com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity' }
    ]);
    return true;
  } catch (error) {
    console.warn('[DeviceSettings] Error al abrir AutoStart MIUI, intentando fallback:', error.message);
    try {
      await Linking.openSettings();
      return true;
    } catch (e) {
      console.error('[DeviceSettings] Fallback falló:', e);
      return false;
    }
  }
}

/**
 * Abre la pantalla de Optimización de Batería (Doze mode) para solicitar "Sin Restricciones"
 */
export async function openBatteryOptimizationSettings() {
  if (Platform.OS !== 'android') return false;

  try {
    if (RNAndroidNotificationListener && typeof RNAndroidNotificationListener.openBatteryOptimizationSettings === 'function') {
      return await RNAndroidNotificationListener.openBatteryOptimizationSettings();
    }

    // Android estándar ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
    await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    return true;
  } catch (error) {
    console.warn('[DeviceSettings] Error al abrir ajustes de batería:', error.message);
    try {
      await Linking.openSettings();
      return true;
    } catch (e) {
      return false;
    }
  }
}

/**
 * Abre los detalles y permisos de la aplicación en los ajustes del sistema
 */
export async function openAppDetailsSettings() {
  try {
    if (RNAndroidNotificationListener && typeof RNAndroidNotificationListener.openAppDetailsSettings === 'function') {
      return await RNAndroidNotificationListener.openAppDetailsSettings();
    }
    await Linking.openSettings();
    return true;
  } catch (e) {
    console.error('[DeviceSettings] Error abriendo ajustes de app:', e);
    return false;
  }
}
