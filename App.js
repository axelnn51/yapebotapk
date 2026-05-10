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
import * as Notifications from 'expo-notifications';

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

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="SettingsMain" component={SettingsScreen} options={{ title: 'Configuración' }} />
      <Stack.Screen name="Logs" component={LogsScreen} options={{ title: '📋 Logs del Sistema' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  React.useEffect(() => {
    // Registrar Push Token al iniciar
    api.registerPushToken().catch(console.warn);

    // Escuchar cuando el usuario toca la notificación
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.orderId && navigationRef.current) {
        navigationRef.current.navigate('Pedidos', {
          screen: 'OrderDetail',
          params: { orderId: data.orderId }
        });
      }
    });

    return () => subscription.remove();
  }, []);

  return (
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
  );
}
