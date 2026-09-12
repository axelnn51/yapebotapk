import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import DashboardScreen from './src/screens/DashboardScreen';
import PendingOrdersScreen from './src/screens/PendingOrdersScreen';
import OrderDetailScreen from './src/screens/OrderDetailScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LogsScreen from './src/screens/LogsScreen';
import { api } from './src/services/api';
import { startHeartbeat, stopHeartbeat } from './src/services/heartbeatService';
import * as Notifications from 'expo-notifications';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';

// ============================================================
// Error Boundary — Captura crashes de React y muestra pantalla de recuperación
// ============================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={ebStyles.container}>
          <Text style={ebStyles.emoji}>⚠️</Text>
          <Text style={ebStyles.title}>Algo salió mal</Text>
          <Text style={ebStyles.message}>{this.state.error?.message || 'Error desconocido'}</Text>
          <TouchableOpacity
            style={ebStyles.button}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={ebStyles.buttonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
const ebStyles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#0a0a1a', justifyContent:'center', alignItems:'center', padding:32 },
  emoji: { fontSize:64, marginBottom:16 },
  title: { color:'#f1f5f9', fontSize:24, fontWeight:'800', marginBottom:8 },
  message: { color:'#94a3b8', fontSize:14, textAlign:'center', marginBottom:24 },
  button: { backgroundColor:'#7c3aed', paddingHorizontal:32, paddingVertical:14, borderRadius:12 },
  buttonText: { color:'#fff', fontWeight:'700', fontSize:16 },
});

const navigationRef = React.createRef();

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const COLORS = {
  bg: '#0a0a1a',
  card: '#12122a',
  border: '#1e293b',
  primary: '#7c3aed',
  text: '#f1f5f9',
  muted: '#64748b',
};

const screenOptions = {
  headerStyle: { backgroundColor: COLORS.bg },
  headerTintColor: COLORS.text,
  headerShadowVisible: false,
};

const navigationFonts = {
  regular: { fontFamily: '', fontWeight: '400' },
  medium: { fontFamily: '', fontWeight: '500' },
  bold: { fontFamily: '', fontWeight: '700' },
  heavy: { fontFamily: '', fontWeight: '900' },
};

const customTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: COLORS.primary,
    background: COLORS.bg,
    card: COLORS.card,
    text: COLORS.text,
    border: COLORS.border,
    notification: COLORS.primary,
  },
  fonts: navigationFonts,
};

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PendingList" component={PendingOrdersScreen} options={{ title: 'Pedidos' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={({ route }) => ({ title: `Pedido #${route.params.orderId}` })} />
    </Stack.Navigator>
  );
}

import DiagnosticScreen from './src/screens/DiagnosticScreen';
import { logEvent, EVENT_TYPES } from './src/services/eventLogger';
import AsyncStorage from '@react-native-async-storage/async-storage';

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Configuración' }} />
      <Stack.Screen name="Diagnostic" component={DiagnosticScreen} options={{ title: '🩺 Diagnóstico del Sistema' }} />
      <Stack.Screen name="Logs" component={LogsScreen} options={{ title: '📋 Logs del Sistema' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  React.useEffect(() => {
    // 1. Inicializar canal de notificaciones Android incondicionalmente
    api.setupNotificationChannel().catch(console.warn);

    // 2. Registrar Push Token al iniciar
    api.registerPushToken().catch(console.warn);

    // 3. Listener para reintentar sincronización si la app vuelve a primer plano
    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        api.registerPushToken().catch(() => {});
      }
    });

    // 4. Listener si el token FCM es renovado por el sistema
    const tokenSub = Notifications.addPushTokenListener(() => {
      api.registerPushToken().catch(() => {});
    });

    // 5. Escuchar notificaciones Push recibidas (Foreground / Background)
    const receivedSub = Notifications.addNotificationReceivedListener(notification => {
      const content = notification.request.content;
      AsyncStorage.setItem('@yape_last_push_received', new Date().toISOString()).catch(() => {});
      logEvent(
        'FCM',
        content.title || 'Push recibido',
        content.body || '',
        EVENT_TYPES.PUSH_RECEIVED
      ).catch(() => {});
    });

    // 6. Escuchar cuando el usuario toca la notificación
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.orderId && navigationRef.current) {
        navigationRef.current.navigate('Pedidos', {
          screen: 'OrderDetail',
          params: { orderId: data.orderId }
        });
      }
    });

    // 7. Iniciar Heartbeat de monitorización periódica (cada 2 minutos)
    startHeartbeat(120000);

    return () => {
      stopHeartbeat();
      appStateSub.remove();
      tokenSub.remove();
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} theme={customTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          ...screenOptions,
          tabBarStyle: {
            backgroundColor: COLORS.card,
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 65,
            paddingBottom: 10,
            paddingTop: 5,
          },
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: -4 },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = {
              Dashboard: focused ? 'home' : 'home-outline',
              Pedidos: focused ? 'receipt' : 'receipt-outline',
              Reportes: focused ? 'stats-chart' : 'stats-chart-outline',
              Config: focused ? 'cog' : 'cog-outline',
            };
            return <Ionicons name={icons[route.name]} size={24} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Pedidos" component={OrdersStack} options={{ headerShown: false }} />
        <Tab.Screen name="Reportes" component={ReportsScreen} />
        <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
        <Tab.Screen name="Config" component={SettingsStack} options={{ headerShown: false, title: 'Configuración' }} />
      </Tab.Navigator>
    </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
