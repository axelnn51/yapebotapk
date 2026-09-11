// ============================================================
// Diagnostic Screen — YapeBot Mobile
// Diagnóstico en tiempo real para Lector Bancario, Headless, FCM y Cola
// Optimizado para Xiaomi POCO M5s (MIUI / HyperOS)
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Platform, Clipboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api, getConfig } from '../services/api';
import { getEvents, clearEvents, logEvent, EVENT_TYPES } from '../services/eventLogger';
import { getQueue, flushQueue, clearQueue } from '../services/notificationQueue';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export default function DiagnosticScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados del Lector Bancario
  const [hasPermission, setHasPermission] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  // Timestamps de actividad
  const [lastBankAny, setLastBankAny] = useState(null);
  const [lastYape, setLastYape] = useState(null);
  const [lastPlin, setLastPlin] = useState(null);
  const [lastBbva, setLastBbva] = useState(null);
  const [lastInterbank, setLastInterbank] = useState(null);
  const [heartbeat, setHeartbeat] = useState(null);
  const [lastNotif, setLastNotif] = useState(null);
  const [lastRaw, setLastRaw] = useState(null);
  const [readCount, setReadCount] = useState(0);

  // Backend & Cola
  const [serverOnline, setServerOnline] = useState(false);
  const [serverUrl, setServerUrl] = useState('');
  const [lastServerContact, setLastServerContact] = useState(null);
  const [queueItems, setQueueItems] = useState([]);
  const [flushingQueue, setFlushingQueue] = useState(false);

  // Push FCM
  const [fcmToken, setFcmToken] = useState(null);
  const [fcmTokenType, setFcmTokenType] = useState('fcm');
  const [lastPushReceived, setLastPushReceived] = useState(null);
  const [testingPush, setTestingPush] = useState(false);
  const [pushDiag, setPushDiag] = useState(null);
  const [backendPushStatus, setBackendPushStatus] = useState(null);

  // Eventos en vivo
  const [events, setEvents] = useState([]);

  // Pedidos
  const [orderStats, setOrderStats] = useState({ pending: 0, completed: 0 });

  const loadAllData = useCallback(async () => {
    try {
      // 1. Permisos y estado del listener nativo
      const perm = await api.getPermissionStatus();
      setHasPermission(perm);
      const conn = await api.isListenerConnected();
      setIsConnected(conn);

      // 2. Configuración y Backend
      const cfg = await getConfig();
      setServerUrl(cfg.url || '');
      if (cfg.url) {
        const health = await api.testConnection();
        setServerOnline(health.ok);
        if (health.ok) {
          setLastServerContact(new Date().toISOString());
        }
      }

      // 3. Timestamps de entidades bancarias
      const hbStr = await AsyncStorage.getItem('@yape_listener_heartbeat');
      if (hbStr) setHeartbeat(JSON.parse(hbStr));

      const anyStr = await AsyncStorage.getItem('@yape_last_bank_any');
      if (anyStr) setLastBankAny(anyStr);

      const yapeStr = await AsyncStorage.getItem('@yape_last_yape');
      if (yapeStr) setLastYape(yapeStr);

      const plinStr = await AsyncStorage.getItem('@yape_last_plin');
      if (plinStr) setLastPlin(plinStr);

      const bbvaStr = await AsyncStorage.getItem('@yape_last_bbva');
      if (bbvaStr) setLastBbva(bbvaStr);

      const ibkStr = await AsyncStorage.getItem('@yape_last_interbank');
      if (ibkStr) setLastInterbank(ibkStr);

      const lastNStr = await AsyncStorage.getItem('@yape_last_notification');
      if (lastNStr) setLastNotif(JSON.parse(lastNStr));

      const lastRStr = await AsyncStorage.getItem('@yape_debug_last_raw');
      if (lastRStr) setLastRaw(JSON.parse(lastRStr));

      const countStr = await AsyncStorage.getItem('@yape_notification_count');
      if (countStr) setReadCount(parseInt(countStr, 10));

      // 4. Push FCM & Diagnóstico Consolidado
      const pDiag = await api.getPushDiagnosticStatus();
      setPushDiag(pDiag);
      setFcmToken(pDiag.fcmToken);
      if (pDiag.tokenType) setFcmTokenType(pDiag.tokenType);
      if (pDiag.lastPushReceived) setLastPushReceived(pDiag.lastPushReceived);

      if (cfg.url) {
        try {
          const bStatus = await api.getPushStatus();
          setBackendPushStatus(bStatus);
        } catch (e) {
          setBackendPushStatus({ ok: false, error: e.message });
        }
      }

      // 5. Cola Offline
      const q = await getQueue();
      setQueueItems(q);

      // 6. Eventos
      const evs = await getEvents(40);
      setEvents(evs);

      // 7. Pedidos pendientes (si server está online)
      try {
        const dash = await api.getDashboard();
        if (dash.ok && dash.data) {
          setOrderStats({
            pending: dash.data.pending_orders || 0,
            completed: dash.data.orders_today || 0,
          });
        }
      } catch (e) { /* ignore */ }

    } catch (err) {
      console.warn('Error cargando diagnóstico:', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
    const interval = setInterval(loadAllData, 4000);
    return () => clearInterval(interval);
  }, [loadAllData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // Reconectar listener nativo (Fix Xiaomi)
  const handleRebindListener = async () => {
    setReconnecting(true);
    try {
      const ok = await api.rebindListener();
      await logEvent('SISTEMA', 'Reconexión de listener solicitada', ok ? 'Exitoso' : 'Fallo', EVENT_TYPES.SYSTEM_STATUS);
      Alert.alert('🔄 Listener Reiniciado', 'Se forzó la reconexión con el sistema Android NotificationManager.');
      loadAllData();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setReconnecting(false);
    }
  };

  // Vaciar y procesar cola
  const handleFlushQueue = async () => {
    setFlushingQueue(true);
    try {
      const result = await flushQueue(async (p) => {
        const { url, key } = await getConfig();
        const cleanUrl = url.replace(/\/+$/, '');
        const res = await fetch(`${cleanUrl}/api/incoming-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
          body: JSON.stringify({
            sender: p.senderName || p.title || p.provider,
            text: p.rawText,
            amount: p.amount,
            securityCode: p.securityCode,
            provider: p.provider,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          return { ok: true };
        }
      });
      Alert.alert('✅ Cola Procesada', `${result.processed} elemento(s) enviado(s). Quedan: ${result.remaining}`);
      loadAllData();
    } catch (e) {
      Alert.alert('Error procesando cola', e.message);
    } finally {
      setFlushingQueue(false);
    }
  };

  // Probar Push Real FCM
  const handleTestPushReal = async () => {
    setTestingPush(true);
    try {
      await logEvent('FCM', 'Solicitando push de prueba al backend', '', EVENT_TYPES.BACKEND_SENDING);
      const result = await api.testPushNotification();
      await logEvent('FCM', 'Push de prueba emitido por servidor', `Enviado a ${result.sent_to || 1} token(s)`, EVENT_TYPES.BACKEND_SUCCESS);
      Alert.alert('✅ Push Despachado', `El servidor despachó la notificación FCM a ${result.sent_to || 1} dispositivo(s). Debería sonar y aparecer en la barra de notificaciones.`);
      loadAllData();
    } catch (e) {
      await logEvent('FCM', 'Error en prueba push', e.message, EVENT_TYPES.BACKEND_ERROR);
      Alert.alert('❌ Error al probar Push', e.message);
    } finally {
      setTestingPush(false);
    }
  };

  // Re-registrar token push
  const handleRegisterTokenAgain = async () => {
    try {
      const reg = await api.registerPushToken();
      if (reg && reg.status === 'registered') {
        Alert.alert('✅ Token Registrado', `Token FCM sincronizado exitosamente con el servidor.
(${reg.token.substring(0, 16)}...)`);
      } else if (reg && reg.status === 'pending_config') {
        Alert.alert('🟡 Servidor Requerido', 'Token FCM generado localmente, pero debes ingresar la URL y API Key en la pestaña Configuración.');
      } else if (reg && reg.status === 'permission_denied') {
        Alert.alert('🟠 Permiso Requerido', 'Debes conceder permisos de notificación en los Ajustes de Android.');
      } else if (reg && reg.status === 'sync_error') {
        Alert.alert('🔴 Error de Conexión', `Fallo al sincronizar con el servidor: ${reg.error || 'Error de red'}`);
      } else if (reg && reg.status === 'firebase_error') {
        Alert.alert('🔴 Error FCM', `Google Play Services o Firebase fallaron: ${reg.error}`);
      } else {
        Alert.alert('ℹ️ Estado', reg?.error || 'Token procesado.');
      }
      loadAllData();
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const copyFcmToken = () => {
    if (fcmToken) {
      Clipboard.setString(fcmToken);
      Alert.alert('📋 Copiado', 'Token copiado al portapapeles.');
    }
  };

  const formatTimeOnly = (isoStr) => {
    if (!isoStr) return '--:--:--';
    try {
      return new Date(isoStr).toLocaleTimeString('es-PE', { hour12: false });
    } catch { return '--:--:--'; }
  };

  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={st.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} progressBackgroundColor={Colors.bgCard} />}
    >
      {/* Header */}
      <View style={st.header}>
        <Ionicons name="hardware-chip" size={28} color={Colors.primaryLight} />
        <Text style={st.title}>Diagnóstico del Sistema</Text>
        <Text style={st.sub}>Monitoreo en vivo de captura bancaria y notificaciones</Text>
      </View>

      {/* BLOQUE 1: LECTOR BANCARIO */}
      <View style={st.card}>
        <View style={st.cardHeaderRow}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
            <Ionicons name="ear" size={20} color={hasPermission ? Colors.success : Colors.danger} />
            <Text style={st.cardTitle}>Lector Yape / Plin / Bancos</Text>
          </View>
          <TouchableOpacity
            style={st.miniBtn}
            onPress={handleRebindListener}
            disabled={reconnecting}
          >
            {reconnecting ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="refresh-circle" size={16} color="#fff" />
                <Text style={st.miniBtnText}>Reconectar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Indicadores de Estado */}
        <View style={st.statusGrid}>
          <View style={st.statusItem}>
            <View style={[st.dot, { backgroundColor: hasPermission ? Colors.success : Colors.danger }]} />
            <Text style={st.statusLabel}>Permiso Android:</Text>
            <Text style={[st.statusVal, { color: hasPermission ? Colors.success : Colors.danger }]}>
              {hasPermission ? 'Habilitado' : 'Denegado'}
            </Text>
          </View>
          <View style={st.statusItem}>
            <View style={[st.dot, { backgroundColor: isConnected ? Colors.success : Colors.warning }]} />
            <Text style={st.statusLabel}>Servicio Conectado:</Text>
            <Text style={[st.statusVal, { color: isConnected ? Colors.success : Colors.warning }]}>
              {isConnected ? 'Activo' : 'Desconectado'}
            </Text>
          </View>
        </View>

        {!hasPermission && (
          <TouchableOpacity style={st.actionBtn} onPress={api.requestListenerPermission}>
            <Ionicons name="settings" size={16} color="#fff" />
            <Text style={st.actionBtnText}>Conceder Acceso a Notificaciones</Text>
          </TouchableOpacity>
        )}

        {/* Timestamps por Entidad */}
        <View style={st.timesBox}>
          <Text style={st.boxTitle}>Última Notificación Bancaria:</Text>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Última bancaria:</Text>
            <Text style={[st.timeValue, {fontWeight:'700', color:Colors.primaryLight}]}>{formatTimeOnly(lastBankAny)}</Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Última Yape:</Text>
            <Text style={st.timeValue}>{formatTimeOnly(lastYape)}</Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Última Plin:</Text>
            <Text style={st.timeValue}>{formatTimeOnly(lastPlin)}</Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Última BBVA:</Text>
            <Text style={st.timeValue}>{formatTimeOnly(lastBbva)}</Text>
          </View>
        </View>

        {/* Detalle de Última Notificación Capturada (Campos requeridos) */}
        <View style={[st.debugBox, {marginTop: Spacing.sm}]}>
          <Text style={st.debugTitle}>📋 Último Registro Capturado:</Text>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último package:</Text>
            <Text style={st.detailVal}>{lastRaw?.app || '--'}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último título:</Text>
            <Text style={st.detailVal}>{lastRaw?.title || '--'}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último texto:</Text>
            <Text style={st.detailVal} numberOfLines={2}>{lastRaw?.text || lastRaw?.bigText || lastRaw?.fullText || '--'}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último monto detectado:</Text>
            <Text style={[st.detailVal, {color:Colors.success, fontWeight:'800'}]}>
              {lastNotif?.amount ? `S/ ${parseFloat(lastNotif.amount).toFixed(2)}` : '--'}
            </Text>
          </View>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último código:</Text>
            <Text style={[st.detailVal, {color:Colors.warning, fontWeight:'700'}]}>{lastNotif?.securityCode || '--'}</Text>
          </View>
          <View style={st.detailRow}>
            <Text style={st.detailLabel}>Último remitente:</Text>
            <Text style={st.detailVal}>{lastNotif?.sender || '--'}</Text>
          </View>
        </View>
      </View>

      {/* BLOQUE 2: BACKEND Y COLA OFFLINE */}
      <View style={st.card}>
        <View style={st.cardHeaderRow}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
            <Ionicons name="server" size={20} color={Colors.info} />
            <Text style={st.cardTitle}>Backend & Cola Offline</Text>
          </View>
          {queueItems.length > 0 && (
            <TouchableOpacity style={[st.miniBtn, {backgroundColor:Colors.warning}]} onPress={handleFlushQueue} disabled={flushingQueue}>
              <Text style={st.miniBtnText}>Enviar {queueItems.length} Pend.</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Sección BACKEND */}
        <View style={[st.timesBox, {marginBottom: Spacing.sm}]}>
          <Text style={st.boxTitle}>BACKEND</Text>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Último envío:</Text>
            <Text style={st.timeValue}>{lastNotif?.time ? formatTimeOnly(lastNotif.time) : formatTimeOnly(lastServerContact)}</Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Respuesta:</Text>
            <Text style={[st.timeValue, {color: lastNotif?.response?.includes('200') || serverOnline ? Colors.success : Colors.danger}]}>
              {lastNotif?.response || (serverOnline ? 'HTTP 200 (OK)' : 'Sin respuesta')}
            </Text>
          </View>
        </View>

        {/* Sección COLA */}
        <View style={st.timesBox}>
          <Text style={st.boxTitle}>COLA OFFLINE</Text>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Pendientes:</Text>
            <Text style={[st.timeValue, {color: queueItems.filter(i => i.status === 'pending').length > 0 ? Colors.warning : Colors.success, fontWeight:'700'}]}>
              {queueItems.filter(i => i.status === 'pending').length}
            </Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Fallidos:</Text>
            <Text style={[st.timeValue, {color: queueItems.filter(i => i.status === 'failed').length > 0 ? Colors.danger : Colors.textMuted, fontWeight:'700'}]}>
              {queueItems.filter(i => i.status === 'failed').length}
            </Text>
          </View>
        </View>
      </View>

      {/* BLOQUE 3: NOTIFICACIONES PUSH (FCM NATIVO) */}
      <View style={st.card}>
        <View style={st.cardHeaderRow}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
            <Ionicons name="notifications" size={20} color="#3b82f6" />
            <Text style={st.cardTitle}>PUSH (Notificaciones de Tienda)</Text>
          </View>
          <View style={[st.badge, {
            backgroundColor: pushDiag?.badge?.code === 'green' ? Colors.success 
              : pushDiag?.badge?.code === 'yellow' ? Colors.warning 
              : pushDiag?.badge?.code === 'orange' ? '#f97316' 
              : Colors.danger
          }]}>
            <Text style={st.badgeText}>{pushDiag?.badge?.text || 'Verificando...'}</Text>
          </View>
        </View>

        {/* Estado Detallado */}
        <View style={st.timesBox}>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Permiso Android:</Text>
            <Text style={[st.timeValue, { color: pushDiag?.permissions?.status === 'granted' ? Colors.success : '#f97316' }]}>
              {pushDiag?.permissions?.status === 'granted' ? '🟢 Concedido' : '🟠 Denegado'}
            </Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Canal Android ('default'):</Text>
            <Text style={[st.timeValue, { color: pushDiag?.channel ? (pushDiag.channel.importance === 0 ? '#f97316' : Colors.success) : Colors.success }]}>
              {pushDiag?.channel ? (pushDiag.channel.importance === 0 ? '🟠 Silenciado' : '🟢 Alta Prioridad + Sonido') : '🟢 Creado (default)'}
            </Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Backend Firebase:</Text>
            <Text style={[st.timeValue, { color: backendPushStatus?.firebase_initialized ? Colors.success : (backendPushStatus ? Colors.danger : Colors.textMuted) }]}>
              {backendPushStatus?.firebase_initialized ? `🟢 Listo (${backendPushStatus.firebase_loaded_from || 'FCM'})` : (backendPushStatus ? '🔴 Inactivo' : '⚪ Desconectado')}
            </Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Dispositivos en Servidor:</Text>
            <Text style={[st.timeValue, { color: backendPushStatus?.active_tokens > 0 ? Colors.success : Colors.textSecondary }]}>
              {backendPushStatus?.active_tokens != null ? `${backendPushStatus.active_tokens} activo(s)` : '--'}
            </Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Último Push recibido:</Text>
            <Text style={[st.timeValue, { color: Colors.info }]}>{formatTimeOnly(lastPushReceived)}</Text>
          </View>
          <View style={st.timeRow}>
            <Text style={st.timeLabel}>Último Registro:</Text>
            <Text style={[st.timeValue, { color: Colors.textSecondary }]}>{formatTimeOnly(pushDiag?.registeredAt)}</Text>
          </View>
        </View>

        {/* Banner de error técnico visible si existe */}
        {(pushDiag?.lastError || backendPushStatus?.last_error) && (
          <View style={[st.debugBox, { borderColor: '#ef444460', backgroundColor: '#ef444415', marginTop: Spacing.xs }]}>
            <Text style={[st.debugTitle, { color: '#ef4444' }]}>⚠️ Diagnóstico Técnico:</Text>
            <Text style={[st.debugText, { color: '#f87171' }]}>
              {pushDiag?.lastError || backendPushStatus?.last_error}
            </Text>
          </View>
        )}

        {/* Token FCM Enmascarado */}
        {pushDiag?.fcmToken ? (
          <TouchableOpacity style={st.tokenBox} onPress={copyFcmToken}>
            <Text style={st.tokenText} numberOfLines={1}>
              Token: {pushDiag.maskedToken}
            </Text>
            <Text style={st.tokenHint}>Toca para copiar token completo ({pushDiag.tokenType.toUpperCase()})</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={st.actionBtn} onPress={handleRegisterTokenAgain}>
            <Ionicons name="key" size={16} color="#fff" />
            <Text style={st.actionBtnText}>Obtener y Vincular Token FCM</Text>
          </TouchableOpacity>
        )}

        {/* Botón de re-registro si no está registrado */}
        {pushDiag?.status !== 'registered' && pushDiag?.fcmToken && (
          <TouchableOpacity style={[st.actionBtn, { backgroundColor: Colors.warning, marginTop: Spacing.xs }]} onPress={handleRegisterTokenAgain}>
            <Ionicons name="refresh" size={16} color="#000" />
            <Text style={[st.actionBtnText, { color: '#000' }]}>Sincronizar Token Pendiente con Servidor</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[st.actionBtn, { backgroundColor: '#3b82f6', marginTop: Spacing.sm }]}
          onPress={handleTestPushReal}
          disabled={testingPush}
        >
          {testingPush ? <ActivityIndicator size="small" color="#fff" /> : (
            <>
              <Ionicons name="paper-plane" size={16} color="#fff" />
              <Text style={st.actionBtnText}>Enviar Notificación de Prueba Real (FCM)</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={st.hintText}>Flujo end-to-end: Servidor → FCM Admin SDK → Android → APK (con sonido y alerta)</Text>
      </View>

      {/* BLOQUE 4: REGISTRO DE EVENTOS EN VIVO */}
      <View style={st.card}>
        <View style={st.cardHeaderRow}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
            <Ionicons name="list" size={20} color={Colors.primaryLight} />
            <Text style={st.cardTitle}>Registro de Eventos en Tiempo Real</Text>
          </View>
          <TouchableOpacity onPress={() => clearEvents().then(loadAllData)}>
            <Text style={{color:Colors.textMuted, fontSize:FontSize.xs}}>Limpiar</Text>
          </TouchableOpacity>
        </View>

        {events.length === 0 ? (
          <Text style={st.emptyEvents}>Sin eventos registrados todavía</Text>
        ) : (
          <View style={st.timeline}>
            {events.slice(0, 15).map((ev) => (
              <View key={ev.id} style={st.timelineItem}>
                <Text style={st.timelineTime}>{ev.timeFormatted}</Text>
                <View style={[st.badge, { backgroundColor: getBadgeColor(ev.type) }]}>
                  <Text style={st.badgeText}>{ev.source}</Text>
                </View>
                <View style={{flex:1}}>
                  <Text style={st.timelineTitle}>{ev.title}</Text>
                  {ev.details ? <Text style={st.timelineDetails} numberOfLines={1}>{ev.details}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* BLOQUE 5: GUÍA XIAOMI POCO M5s */}
      <View style={[st.card, { borderColor: '#f59e0b40' }]}>
        <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:Spacing.sm}}>
          <Ionicons name="phone-portrait" size={20} color="#f59e0b" />
          <Text style={[st.cardTitle, { color: '#f59e0b' }]}>Checklist Xiaomi POCO M5s (MIUI/HyperOS)</Text>
        </View>
        <Text style={st.guideStep}>1. <Text style={{fontWeight:'700'}}>Ajustes Restringidos:</Text> Ve a Info de la App → 3 puntos arriba a la derecha → "Permitir ajustes restringidos".</Text>
        <Text style={st.guideStep}>2. <Text style={{fontWeight:'700'}}>Inicio Automático:</Text> Info de la App → "Inicio automático" → ACTIVADO.</Text>
        <Text style={st.guideStep}>3. <Text style={{fontWeight:'700'}}>Ahorro de Batería:</Text> Info de la App → Ahorro de batería → Elegir "Sin restricciones".</Text>
        <Text style={st.guideStep}>4. <Text style={{fontWeight:'700'}}>Acceso a Notificaciones:</Text> Ajustes → Seguridad → Acceso especial → Acceso a notificaciones → Yape Dashboard → ACTIVADO.</Text>
      </View>
    </ScrollView>
  );
}

function getBadgeColor(type) {
  switch (type) {
    case EVENT_TYPES.PAYMENT_DETECTED: return Colors.success;
    case EVENT_TYPES.BACKEND_SUCCESS: return Colors.info;
    case EVENT_TYPES.BACKEND_ERROR: return Colors.danger;
    case EVENT_TYPES.QUEUE_ENQUEUED: return Colors.warning;
    case EVENT_TYPES.PUSH_RECEIVED: return '#3b82f6';
    case EVENT_TYPES.NOTIFICATION_RAW: return '#7c3aed';
    default: return Colors.textMuted;
  }
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  header: { alignItems: 'center', marginVertical: Spacing.md, gap: Spacing.xs },
  title: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '800' },
  sub: { color: Colors.textSecondary, fontSize: FontSize.xs },

  card: { backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 6, width: '48%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: Colors.textSecondary, fontSize: FontSize.xs },
  statusVal: { fontSize: FontSize.xs, fontWeight: '700' },

  timesBox: { backgroundColor: Colors.bg, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.xs, borderWidth: 1, borderColor: Colors.border },
  boxTitle: { color: Colors.textSecondary, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  timeLabel: { color: Colors.textSecondary, fontSize: 12 },
  timeValue: { color: Colors.text, fontSize: 12, fontWeight: '600' },

  debugBox: { backgroundColor: '#181024', borderRadius: BorderRadius.sm, padding: Spacing.sm, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.primary + '30' },
  debugTitle: { color: Colors.primaryLight, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  debugText: { color: Colors.textSecondary, fontSize: 11 },
  debugTime: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },

  actionBtn: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, marginTop: Spacing.xs },
  actionBtnText: { color: '#fff', fontSize: FontSize.xs, fontWeight: '700' },

  miniBtn: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  miniBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  tokenBox: { backgroundColor: Colors.bg, padding: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, marginVertical: Spacing.xs },
  tokenText: { color: Colors.textSecondary, fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  tokenHint: { color: Colors.primaryLight, fontSize: 9, marginTop: 2 },
  hintText: { color: Colors.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  timeline: { marginTop: Spacing.xs },
  timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.border + '40' },
  timelineTime: { color: Colors.textMuted, fontSize: 10, width: 50 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  timelineTitle: { color: Colors.text, fontSize: 11, fontWeight: '600' },
  timelineDetails: { color: Colors.textSecondary, fontSize: 10 },
  emptyEvents: { color: Colors.textMuted, fontSize: FontSize.xs, fontStyle: 'italic', textAlign: 'center', paddingVertical: Spacing.md },

  guideStep: { color: Colors.textSecondary, fontSize: FontSize.xs, lineHeight: 18, marginBottom: 4 },
});
