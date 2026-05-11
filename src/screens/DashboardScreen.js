// ============================================================
// Dashboard Screen — KPIs principales y estado del servidor
// v3: Datos reales de ayer y semana (no demo)
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api, isConfigured } from '../services/api';

const { width } = Dimensions.get('window');

export default function DashboardScreen({ navigation }) {
  const [data, setData] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (isBackground = false) => {
    try {
      const configured = await isConfigured();
      if (!configured) {
        setError('Configura el servidor primero');
        if (!isBackground) setLoading(false);
        return;
      }
      setError(null);
      const result = await api.getDashboard();
      setData(result.data);
      try {
        const notifs = await api.getNotifications(5);
        if (notifs.ok) setNotifications(notifs.data);
      } catch (err) { /* ignore */ }
    } catch (e) {
      setError(e.message);
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData(data !== null);
    }, [fetchData, data])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Conectando al servidor...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="cloud-offline" size={64} color={Colors.danger} />
        <Text style={styles.errorTitle}>Error de conexión</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => { setLoading(true); fetchData(); }}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Real data from API
  const yesterdayAmount = data?.yesterday?.total_amount || 0;
  const yesterdayOrders = data?.yesterday?.order_count || 0;
  const weekAmount = data?.week?.total_amount || 0;
  const weekOrders = data?.week?.total_orders || 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} progressBackgroundColor={Colors.bgCard} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Yape Bot</Text>
          <Text style={styles.subtitle}>Panel de Control v{data?.version || '3.0'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: Colors.successBg }]}>
          <View style={[styles.statusDot, { backgroundColor: Colors.success }]} />
          <Text style={[styles.statusText, { color: Colors.success }]}>Online</Text>
        </View>
      </View>

      {/* Revenue Card */}
      <LinearGradient colors={Colors.gradientPrimary} style={styles.heroCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={styles.heroTop}>
          <Text style={{ fontSize: 24 }}>💰</Text>
          <Text style={styles.heroLabel}>Ventas de Hoy</Text>
        </View>
        <Text style={styles.heroAmount}>S/ {(data?.revenue_today || 0).toFixed(2)}</Text>
        <View style={styles.heroBottom}>
          <Text style={styles.heroSub}>{data?.orders_today || 0} pedidos procesados hoy</Text>
        </View>
        
        {/* Real Data - Historical */}
        <View style={styles.heroHistory}>
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Ayer</Text>
            <Text style={styles.historyValue}>S/ {yesterdayAmount.toFixed(0)}</Text>
            <Text style={styles.historySubValue}>{yesterdayOrders} pedido{yesterdayOrders !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.historyDivider} />
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Semana</Text>
            <Text style={styles.historyValue}>S/ {weekAmount.toFixed(0)}</Text>
            <Text style={styles.historySubValue}>{weekOrders} pedido{weekOrders !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.historyDivider} />
          <View style={styles.historyItem}>
            <Text style={styles.historyLabel}>Promedio/día</Text>
            <Text style={styles.historyValue}>S/ {weekOrders > 0 ? (weekAmount / 7).toFixed(0) : '0'}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="⏳"
          label="Pendientes"
          value={data?.pending_orders || 0}
          color={Colors.warning}
          bgColor={Colors.warningBg}
          onPress={() => navigation.navigate('Pedidos')}
        />
        <StatCard
          icon="🔔"
          label="Notificaciones"
          value={data?.pending_notifs || 0}
          color={Colors.info}
          bgColor={Colors.infoBg}
        />
        <StatCard
          icon="⏱️"
          label="Uptime"
          value={data?.uptime || '-'}
          color={Colors.secondary}
          bgColor="rgba(6, 182, 212, 0.15)"
          isText
        />
        <StatCard
          icon="💾"
          label="Memoria"
          value={`${data?.memory_mb || 0} MB`}
          color={Colors.primaryLight}
          bgColor="rgba(124, 58, 237, 0.15)"
          isText
        />
      </View>

      {/* Timestamp */}
      <Text style={styles.timestamp}>
        Última actualización: {data?.timestamp || '-'}
      </Text>

      <Text style={styles.sectionTitle}>Acciones rápidas</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Pedidos')}>
          <LinearGradient colors={['rgba(245,158,11,0.2)', 'rgba(245,158,11,0.05)']} style={styles.actionGradient}>
            <Ionicons name="list" size={28} color={Colors.warning} />
            <Text style={styles.actionLabel}>Ver Pedidos</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Reportes')}>
          <LinearGradient colors={['rgba(59,130,246,0.2)', 'rgba(59,130,246,0.05)']} style={styles.actionGradient}>
            <Ionicons name="bar-chart" size={28} color={Colors.info} />
            <Text style={styles.actionLabel}>Reportes</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Yape Reads (Notifications) */}
      <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Últimas Lecturas Yape</Text>
      <View style={styles.readsContainer}>
        {notifications.length === 0 ? (
          <Text style={styles.emptyReads}>No hay lecturas recientes</Text>
        ) : (
          notifications.map((notif, index) => (
            <View key={notif.id || index} style={styles.readCard}>
              <View style={styles.readIcon}>
                <Ionicons name="notifications" size={18} color={Colors.primaryLight} />
              </View>
              <View style={styles.readContent}>
                <Text style={styles.readSender}>{notif.sender || 'Yape'}</Text>
                <Text style={styles.readDate}>
                  {notif.created_at ? new Date(notif.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Reciente'}
                </Text>
              </View>
              <Text style={styles.readAmount}>
                S/ {notif.amount ? notif.amount.toFixed(2) : '0.00'}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatCard({ icon, label, value, color, bgColor, onPress, isText }) {
  const content = (
    <View style={[styles.statCard, { borderColor: color + '20' }]}>
      <View style={[styles.statIcon, { backgroundColor: bgColor }]}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>
      <Text style={[styles.statValue, isText && styles.statValueSmall]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity style={styles.statWrapper} onPress={onPress}>{content}</TouchableOpacity>;
  }
  return <View style={styles.statWrapper}>{content}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  centerContainer: {
    flex: 1, backgroundColor: Colors.bg,
    justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  loadingText: { color: Colors.textSecondary, marginTop: Spacing.md, fontSize: FontSize.md },
  errorTitle: { color: Colors.danger, fontSize: FontSize.xl, fontWeight: '700', marginTop: Spacing.md },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.md, textAlign: 'center', marginTop: Spacing.sm },
  retryButton: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  retryText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.lg, marginTop: Spacing.sm,
  },
  greeting: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  statusText: { fontSize: FontSize.sm, fontWeight: '600' },

  heroCard: {
    borderRadius: BorderRadius.xl, padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: FontSize.md, fontWeight: '500' },
  heroAmount: { color: '#fff', fontSize: FontSize.hero, fontWeight: '800', marginTop: Spacing.sm },
  heroBottom: { marginTop: Spacing.sm },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: FontSize.sm },

  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: Spacing.md, marginBottom: Spacing.md,
  },
  statWrapper: { width: (width - Spacing.md * 3) / 2 },
  statCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1,
  },
  statIcon: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.sm,
  },
  statValue: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '800' },
  statValueSmall: { fontSize: FontSize.lg },
  statLabel: { color: Colors.textSecondary, fontSize: FontSize.xs, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  timestamp: {
    color: Colors.textMuted, fontSize: FontSize.xs,
    textAlign: 'center', marginBottom: Spacing.lg,
  },

  sectionTitle: {
    color: Colors.text, fontSize: FontSize.lg, fontWeight: '700',
    marginBottom: Spacing.md,
  },
  actionsRow: { flexDirection: 'row', gap: Spacing.md },
  actionCard: { flex: 1 },
  actionGradient: {
    borderRadius: BorderRadius.lg, padding: Spacing.lg,
    alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionLabel: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  heroHistory: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  historyItem: {
    flex: 1,
    alignItems: 'center',
  },
  historyLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
  },
  historyValue: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '700',
    marginTop: 2,
  },
  historySubValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    marginTop: 1,
  },
  historyDivider: {
    width: 1,
    height: 35,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  readsContainer: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyReads: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  readCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '50',
  },
  readIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  readContent: {
    flex: 1,
  },
  readSender: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  readDate: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  readAmount: {
    color: Colors.success,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
