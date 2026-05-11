import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { getConfig, saveConfig, api } from '../services/api';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

let RNAndroidNotificationListener = null;
try {
  RNAndroidNotificationListener = require('react-native-android-notification-listener').default;
} catch (e) {
  console.log('Notification listener not available');
}

// ============================================================
// Notification Simulator Component
// ============================================================
function NotificationSimulator({ visible, data, onDismiss }) {
  const slideAnim = useRef(new Animated.Value(-120)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();

      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        dismissNotification();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const dismissNotification = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -120, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        notifStyles.container,
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={dismissNotification} style={notifStyles.card}>
        <View style={notifStyles.header}>
          <View style={notifStyles.appIcon}>
            <Text style={{ fontSize: 16 }}>💜</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={notifStyles.headerRow}>
              <Text style={notifStyles.appName}>{data?.appName || 'Yape Bot'}</Text>
              <Text style={notifStyles.time}>{data?.time || 'ahora'}</Text>
            </View>
            <Text style={notifStyles.title} numberOfLines={1}>{data?.title || 'Nuevo Pedido'}</Text>
            <Text style={notifStyles.body} numberOfLines={2}>{data?.body || 'Tienes un nuevo pedido por procesar'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const notifStyles = StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 50 : 12,
  },
  card: {
    backgroundColor: '#1c1c2e', borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  appIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#7c3aed20',
    justifyContent: 'center', alignItems: 'center',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  time: { color: '#64748b', fontSize: 11 },
  title: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', marginTop: 1 },
  body: { color: '#94a3b8', fontSize: 13, marginTop: 2, lineHeight: 18 },
});

// ============================================================
// Settings Screen
// ============================================================
export default function SettingsScreen({ navigation }) {
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [webhookText, setWebhookText] = useState('Yape! pepito te envio S/ 15.00.');
  const [ocrAmount, setOcrAmount] = useState('');
  const [ocrResult, setOcrResult] = useState(null);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);
  // v3: Notification simulator
  const [showNotif, setShowNotif] = useState(false);
  const [notifData, setNotifData] = useState(null);
  const [simOrderId, setSimOrderId] = useState('12345');
  const [simAmount, setSimAmount] = useState('45.00');

  useEffect(() => { 
    loadConfig(); 
    checkPermission();
    const interval = setInterval(checkPermission, 3000);
    return () => clearInterval(interval);
  }, []);

  const checkPermission = async () => {
    try {
      if (!RNAndroidNotificationListener) return;
      const status = await RNAndroidNotificationListener.getPermissionStatus();
      setHasPermission(status !== 'denied');
    } catch(e) {}
  };

  const requestPermission = () => {
    if (RNAndroidNotificationListener) {
      RNAndroidNotificationListener.requestPermission();
    }
  };

  const loadConfig = async () => {
    const cfg = await getConfig();
    if (cfg.url) setServerUrl(cfg.url);
    if (cfg.key) setApiKey(cfg.key);
  };

  const handleSave = async () => {
    if (!serverUrl.trim()) return Alert.alert('Error', 'Ingresa la URL del servidor');
    if (!apiKey.trim()) return Alert.alert('Error', 'Ingresa la API Key');
    setSaving(true);
    try {
      await saveConfig(serverUrl.trim(), apiKey.trim());
      try {
        await api.registerPushToken();
        Alert.alert('✅', 'Configuración guardada y Push Token registrado');
      } catch (e) {
        Alert.alert('⚠️ Configuración Guardada', `Pero ocurrió un error con las notificaciones: ${e.message}`);
      }
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!serverUrl.trim()) return Alert.alert('Error', 'Ingresa la URL primero');
    setTesting(true); setTestResult(null);
    try {
      await saveConfig(serverUrl.trim(), apiKey.trim());
      const result = await api.testConnection();
      if (result.ok) {
        api.registerPushToken().catch(e => console.warn(e));
      }
      setTestResult(result);
    } catch (e) { setTestResult({ ok: false, error: e.message }); }
    finally { setTesting(false); }
  };

  const handleTestWebhook = async () => {
    if (!webhookText.trim()) return Alert.alert('Error', 'Ingresa un texto para la notificación');
    setTestingWebhook(true);
    try {
      const result = await api.testWebhook(webhookText);
      Alert.alert('✅ Notificación Simulada', JSON.stringify(result, null, 2));
    } catch (e) { Alert.alert('❌ Error', e.message); }
    finally { setTestingWebhook(false); }
  };

  const handleTestOCR = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setTestingOcr(true);
        setOcrResult(null);
        try {
          const apiResult = await api.testOCR(result.assets[0].uri, ocrAmount || '0');
          setOcrResult(apiResult);
        } catch (e) {
          Alert.alert('❌ Error OCR', e.message);
        } finally {
          setTestingOcr(false);
        }
      }
    } catch (e) {
      Alert.alert('Error de Galería', e.message || 'No se pudo abrir la galería');
    }
  };

  const [testingRealPush, setTestingRealPush] = useState(false);
  const handleTestRealPush = async () => {
    setTestingRealPush(true);
    try {
      const result = await api.testPushNotification();
      Alert.alert('✅ Notificación Enviada', `Se envió a ${result.sent_to} dispositivo(s).`);
    } catch (e) {
      Alert.alert('❌ Error Push', e.message);
    } finally {
      setTestingRealPush(false);
    }
  };

  const simulateNotification = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    setNotifData({
      appName: 'CDKeys Perú',
      title: `🛒 Nuevo Pedido #${simOrderId}`,
      body: `💰 S/ ${simAmount} — Pago detectado. Procesando verificación automática...`,
      time: timeStr,
    });
    setShowNotif(true);
  };

  return (
    <KeyboardAvoidingView style={s.c} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Notification Simulator Overlay */}
      <NotificationSimulator
        visible={showNotif}
        data={notifData}
        onDismiss={() => setShowNotif(false)}
      />

      <ScrollView contentContainerStyle={s.cc}>
        <View style={s.header}>
          <Ionicons name="settings" size={32} color={Colors.primaryLight} />
          <Text style={s.title}>Configuración</Text>
          <Text style={s.sub}>Conecta tu app al servidor Yape Bot v3</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>URL del Servidor</Text>
          <TextInput style={s.input} value={serverUrl} onChangeText={setServerUrl}
            placeholder="https://tu-servidor.com:3001" placeholderTextColor={Colors.textMuted}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Text style={s.hint}>Ej: https://yape.tu-dominio.com o http://IP:3001</Text>

          <Text style={[s.label, {marginTop: Spacing.lg}]}>API Key</Text>
          <TextInput style={s.input} value={apiKey} onChangeText={setApiKey}
            placeholder="Tu APP_API_KEY del .env" placeholderTextColor={Colors.textMuted}
            autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <Text style={s.hint}>Definida en APP_API_KEY de tu archivo .env</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Lector de Notificaciones (Fondo)</Text>
          <View style={s.statusRow}>
            <View style={[s.indicator, { backgroundColor: hasPermission ? Colors.success : Colors.danger }]} />
            <Text style={s.statusText}>
              {hasPermission ? 'Servicio Activo y Escuchando' : 'Permiso Denegado'}
            </Text>
          </View>
          {!hasPermission && (
            <TouchableOpacity style={s.permissionBtn} onPress={requestPermission}>
              <Text style={s.permissionTxt}>Conceder Permiso Android</Text>
            </TouchableOpacity>
          )}
          <Text style={s.hint}>⚠️ Recuerda quitar la optimización de batería de Android para que la app no se cierre.</Text>
        </View>

        <View style={s.btnRow}>
          <TouchableOpacity style={s.testBtn} onPress={handleTest} disabled={testing}>
            {testing ? <ActivityIndicator size="small" color={Colors.secondary} />
              : <><Ionicons name="pulse" size={18} color={Colors.secondary} /><Text style={s.testTxt}>Probar</Text></>}
          </TouchableOpacity>
          <TouchableOpacity style={{flex:2}} onPress={handleSave} disabled={saving}>
            <LinearGradient colors={Colors.gradientPrimary} style={s.saveBtn}>
              {saving ? <ActivityIndicator size="small" color="#fff" />
                : <><Ionicons name="save" size={18} color="#fff" /><Text style={s.saveTxt}>Guardar</Text></>}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {testResult && (
          <View style={[s.resultBox, {backgroundColor: testResult.ok ? Colors.successBg : Colors.dangerBg, borderColor: testResult.ok ? Colors.success+'30' : Colors.danger+'30'}]}>
            <Ionicons name={testResult.ok ? 'checkmark-circle' : 'close-circle'} size={24} color={testResult.ok ? Colors.success : Colors.danger} />
            <View style={{flex:1}}>
              <Text style={[s.resultTitle, {color: testResult.ok ? Colors.success : Colors.danger}]}>
                {testResult.ok ? 'Conexión exitosa' : 'Error de conexión'}
              </Text>
              {testResult.ok && testResult.data && (
                <Text style={s.resultSub}>v{testResult.data.version} • Uptime: {Math.floor(testResult.data.uptime/3600)}h</Text>
              )}
              {!testResult.ok && testResult.error && (
                <Text style={s.resultSub}>{testResult.error}</Text>
              )}
            </View>
          </View>
        )}

        {/* --- SECCIÓN SIMULADOR DE NOTIFICACIONES --- */}
        <View style={s.card}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:Spacing.sm}}>
            <Ionicons name="phone-portrait" size={20} color="#a78bfa" />
            <Text style={s.label}>Simulador de Notificaciones</Text>
          </View>
          <Text style={s.hint}>Vista previa de cómo se verá una notificación de pedido nuevo en tu dispositivo.</Text>

          <View style={{flexDirection:'row', gap:Spacing.sm, marginTop:Spacing.md}}>
            <View style={{flex:1}}>
              <Text style={[s.hint, {marginTop:0, marginBottom:4}]}>Nro. Pedido</Text>
              <TextInput style={s.input} value={simOrderId} onChangeText={setSimOrderId}
                placeholder="12345" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
            </View>
            <View style={{flex:1}}>
              <Text style={[s.hint, {marginTop:0, marginBottom:4}]}>Monto (S/)</Text>
              <TextInput style={s.input} value={simAmount} onChangeText={setSimAmount}
                placeholder="45.00" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" />
            </View>
          </View>
          
          <TouchableOpacity
            style={[s.testBtn, {backgroundColor: '#a78bfa'+'20', borderColor: '#a78bfa'+'50', marginTop:Spacing.md}]}
            onPress={simulateNotification}
          >
            <Ionicons name="notifications" size={18} color="#a78bfa" />
            <Text style={[s.testTxt, {color: '#a78bfa'}]}>Simular Notificación</Text>
          </TouchableOpacity>
        </View>

        {/* --- SECCIÓN TESTING WEBHOOK --- */}
        <View style={s.card}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:Spacing.sm}}>
            <Ionicons name="notifications" size={20} color={Colors.warning} />
            <Text style={s.label}>Simular Notificación (Webhook)</Text>
          </View>
          <TextInput style={[s.input, {marginBottom:Spacing.md}]} value={webhookText} onChangeText={setWebhookText}
            placeholder="Texto de la notificación" placeholderTextColor={Colors.textMuted} />
          
          <TouchableOpacity style={[s.testBtn, {backgroundColor: Colors.warning+'20', borderColor: Colors.warning+'50'}]} onPress={handleTestWebhook} disabled={testingWebhook}>
            {testingWebhook ? <ActivityIndicator size="small" color={Colors.warning} />
              : <><Ionicons name="send" size={18} color={Colors.warning} /><Text style={[s.testTxt, {color: Colors.warning}]}>Lanzar Notificación de Prueba</Text></>}
          </TouchableOpacity>
        </View>

        {/* --- SECCIÓN TESTING PUSH REAL --- */}
        <View style={s.card}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:Spacing.sm}}>
            <Ionicons name="flash" size={20} color="#3b82f6" />
            <Text style={s.label}>Notificación Push Real</Text>
          </View>
          <Text style={s.hint}>Envía una notificación push real desde el servidor a este dispositivo.</Text>
          <TouchableOpacity style={[s.testBtn, {backgroundColor: '#3b82f620', borderColor: '#3b82f650', marginTop:Spacing.md}]} onPress={handleTestRealPush} disabled={testingRealPush}>
            {testingRealPush ? <ActivityIndicator size="small" color="#3b82f6" />
              : <><Ionicons name="paper-plane" size={18} color="#3b82f6" /><Text style={[s.testTxt, {color: '#3b82f6'}]}>Probar Push Notification</Text></>}
          </TouchableOpacity>
        </View>

        {/* --- SECCIÓN TESTING OCR --- */}
        <View style={s.card}>
          <View style={{flexDirection:'row', alignItems:'center', gap:8, marginBottom:Spacing.sm}}>
            <Ionicons name="scan-circle" size={20} color={Colors.primary} />
            <Text style={s.label}>Herramienta OCR (Pruebas)</Text>
          </View>
          <Text style={s.hint}>Ayuda al motor OCR subiendo capturas complejas. Puedes indicar el monto esperado o dejarlo en blanco.</Text>
          
          <TextInput style={[s.input, {marginTop:Spacing.md, marginBottom:Spacing.md}]} value={ocrAmount} onChangeText={setOcrAmount}
            placeholder="Monto esperado (Ej. 15.50) [Opcional]" placeholderTextColor={Colors.textMuted} keyboardType="numeric" />
          
          <TouchableOpacity style={[s.testBtn, {backgroundColor: Colors.primary+'20', borderColor: Colors.primary+'50'}]} onPress={handleTestOCR} disabled={testingOcr}>
            {testingOcr ? <ActivityIndicator size="small" color={Colors.primary} />
              : <><Ionicons name="cloud-upload" size={18} color={Colors.primary} /><Text style={[s.testTxt, {color: Colors.primary}]}>Subir Captura y Analizar</Text></>}
          </TouchableOpacity>

          {ocrResult && (
            <View style={{marginTop:Spacing.md, backgroundColor:Colors.bg, padding:Spacing.md, borderRadius:BorderRadius.md, borderWidth:1, borderColor:Colors.border}}>
              <Text style={{color:Colors.text, fontSize:FontSize.sm, fontFamily:Platform.OS==='ios'?'Courier':'monospace'}}>
                {JSON.stringify(ocrResult, null, 2)}
              </Text>
            </View>
          )}
        </View>

        {/* --- SECCIÓN LOGS --- */}
        <TouchableOpacity style={s.card} onPress={() => navigation.navigate('Logs')}>
          <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <Ionicons name="terminal" size={20} color={Colors.success} />
              <Text style={s.label}>Ver Logs del Sistema</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textSecondary} />
          </View>
          <Text style={[s.hint, {marginTop:4}]}>Historial de eventos, errores y acciones del bot para debugging.</Text>
        </TouchableOpacity>

        <View style={s.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.info} />
          <Text style={s.infoText}>
            La API Key se configura en el archivo .env del servidor como APP_API_KEY. La app se conecta a los endpoints /api/* de tu servidor Yape Bot.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  c: {flex:1, backgroundColor:Colors.bg},
  cc: {padding:Spacing.md, paddingBottom:Spacing.xxl},
  header: {alignItems:'center', marginVertical:Spacing.lg, gap:Spacing.xs},
  title: {color:Colors.text, fontSize:FontSize.xl, fontWeight:'800'},
  sub: {color:Colors.textSecondary, fontSize:FontSize.sm},

  card: {backgroundColor:Colors.bgCard, borderRadius:BorderRadius.lg, padding:Spacing.md, marginBottom:Spacing.md, borderWidth:1, borderColor:Colors.border},
  label: {color:Colors.text, fontSize:FontSize.md, fontWeight:'600', marginBottom:Spacing.sm},
  input: {backgroundColor:Colors.bgInput, borderRadius:BorderRadius.md, padding:Spacing.md, color:Colors.text, fontSize:FontSize.md, borderWidth:1, borderColor:Colors.border},
  hint: {color:Colors.textMuted, fontSize:FontSize.xs, marginTop:Spacing.xs},

  statusRow: {flexDirection:'row', alignItems:'center', marginBottom:Spacing.sm},
  indicator: {width:12, height:12, borderRadius:6, marginRight:Spacing.sm},
  statusText: {color:Colors.text, fontSize:FontSize.md},
  permissionBtn: {backgroundColor:Colors.secondary+'20', borderWidth:1, borderColor:Colors.secondary+'50', padding:Spacing.sm, borderRadius:BorderRadius.md, alignItems:'center', marginVertical:Spacing.sm},
  permissionTxt: {color:Colors.secondary, fontWeight:'600'},

  btnRow: {flexDirection:'row', gap:Spacing.md, marginBottom:Spacing.md},
  testBtn: {flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:Spacing.xs, paddingVertical:Spacing.md, borderRadius:BorderRadius.md, borderWidth:1, borderColor:Colors.secondary+'40', backgroundColor:Colors.secondary+'10'},
  testTxt: {color:Colors.secondary, fontWeight:'600'},
  saveBtn: {flexDirection:'row', alignItems:'center', justifyContent:'center', gap:Spacing.xs, paddingVertical:Spacing.md, borderRadius:BorderRadius.md},
  saveTxt: {color:'#fff', fontWeight:'700', fontSize:FontSize.md},

  resultBox: {flexDirection:'row', alignItems:'center', gap:Spacing.md, padding:Spacing.md, borderRadius:BorderRadius.lg, borderWidth:1, marginBottom:Spacing.md},
  resultTitle: {fontWeight:'700', fontSize:FontSize.md},
  resultSub: {color:Colors.textSecondary, fontSize:FontSize.sm, marginTop:2},

  infoCard: {flexDirection:'row', alignItems:'flex-start', gap:Spacing.sm, backgroundColor:Colors.infoBg, padding:Spacing.md, borderRadius:BorderRadius.lg},
  infoText: {color:Colors.textSecondary, fontSize:FontSize.sm, flex:1, lineHeight:20},
});
