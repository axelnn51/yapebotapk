// ============================================================
// Orders Screen — Todos los pedidos con filtros y cambio de estado
// ============================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api, isConfigured } from '../services/api';

const STATUS_MAP = {
  'all':        { label: 'Todos',       color: Colors.primary,  icon: 'list' },
  'pending':    { label: 'Pendiente',   color: '#f59e0b',       icon: 'time-outline' },
  'on-hold':    { label: 'En espera',   color: '#f97316',       icon: 'pause-circle-outline' },
  'processing': { label: 'Procesando',  color: '#3b82f6',       icon: 'sync-outline' },
  'completed':  { label: 'Completado',  color: '#22c55e',       icon: 'checkmark-circle-outline' },
  'cancelled':  { label: 'Cancelado',   color: '#ef4444',       icon: 'close-circle-outline' },
  'refunded':   { label: 'Reembolsado', color: '#a855f7',       icon: 'return-down-back-outline' },
  'failed':     { label: 'Fallido',     color: '#64748b',       icon: 'alert-circle-outline' },
};

const FILTERS = ['all', 'pending', 'on-hold', 'processing', 'completed', 'cancelled'];

export default function PendingOrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchOrders = useCallback(async (isBackground = false) => {
    try {
      const configured = await isConfigured();
      if (!configured) {
        setError('Configura el servidor primero');
        if (!isBackground) setLoading(false);
        return;
      }
      setError(null);
      const result = await api.getAllOrders(filter);
      setOrders(result.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      // Si ya hay pedidos, no mostramos el loading a pantalla completa
      fetchOrders(orders.length > 0);
      const interval = setInterval(() => {
        fetchOrders(true);
      }, 15000);
      return () => clearInterval(interval);
    }, [fetchOrders, orders.length])
  );

  const handleStatusChange = (order, newStatus) => {
    const statusInfo = STATUS_MAP[newStatus] || { label: newStatus };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      `Cambiar Estado`,
      `¿Cambiar pedido #${order.id} a "${statusInfo.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setProcessingId(order.id);
            try {
              await api.setOrderStatus(order.id, newStatus);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('✅', `Pedido #${order.id} → ${statusInfo.label}`);
              fetchOrders();
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setProcessingId(null);
            }
          },
        },
      ]
    );
  };

  const getAvailableActions = (currentStatus) => {
    // Acciones disponibles según el estado actual
    switch (currentStatus) {
      case 'pending':
      case 'on-hold':
        return ['processing', 'completed', 'cancelled'];
      case 'processing':
        return ['completed', 'on-hold', 'cancelled'];
      case 'completed':
        return ['processing', 'refunded'];
      case 'cancelled':
        return ['pending', 'processing'];
      case 'failed':
        return ['pending', 'processing'];
      case 'refunded':
        return ['processing'];
      default:
        return ['completed', 'cancelled'];
    }
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr);
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day}/${month} ${hours}:${mins}`;
    } catch { return dateStr; }
  };

  const renderOrder = ({ item }) => {
    const isProcessing = processingId === item.id;
    const statusInfo = STATUS_MAP[item.status] || { label: item.status, color: '#64748b', icon: 'help-circle-outline' };
    const customerName = `${item.customer.first_name} ${item.customer.last_name ? item.customer.last_name.charAt(0) + '.' : ''}`.trim();
    
    // Alerta visual para pedidos que necesitan atención
    const needsAttention = item.status === 'pending' || item.status === 'on-hold';

    return (
      <TouchableOpacity
        style={[styles.orderCard, needsAttention && { borderColor: statusInfo.color + '80', borderWidth: 1.5 }]}
        onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
        disabled={isProcessing}
      >
        {/* Header */}
        <View style={styles.orderHeader}>
          <View style={styles.orderIdRow}>
            <View>
              <Text style={styles.orderId}>#{item.id}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 }}>{formatDate(item.date_created)}</Text>
            </View>
            {needsAttention && (
               <Ionicons name="warning" size={16} color={statusInfo.color} style={{ marginLeft: -2 }} />
            )}
            <View style={[styles.statusPill, { backgroundColor: statusInfo.color + '20' }]}>
              <Ionicons name={statusInfo.icon} size={12} color={statusInfo.color} />
              <Text style={[styles.statusPillText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
            </View>
            {item.is_officetech && (
              <View style={[styles.statusPill, { backgroundColor: '#f97316' + '20' }]}>
                <Ionicons name="pricetag" size={10} color="#f97316" />
                <Text style={[styles.statusPillText, { color: '#f97316' }]}>OfficeTech</Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {item.override_price ? (
              <>
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, textDecorationLine: 'line-through' }}>S/ {item.total}</Text>
                <Text style={[styles.orderAmount, { color: Colors.success }]}>S/ {item.override_price.toFixed(2)}</Text>
              </>
            ) : (
              <Text style={styles.orderAmount}>S/ {item.total}</Text>
            )}
          </View>
        </View>

        {/* Customer & Product */}
        <View style={styles.orderBody}>
          <View style={styles.infoRow}>
            <Ionicons name="person" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{customerName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="card" size={14} color={Colors.textSecondary} />
            <Text style={styles.infoText}>{item.payment_method}</Text>
          </View>
          {item.products && (
            <View style={styles.infoRow}>
              <Ionicons name="cube" size={14} color={Colors.textSecondary} />
              <Text style={styles.infoText} numberOfLines={2}>
                {item.products.replace(/📦/g, '').trim()}
              </Text>
            </View>
          )}
        </View>

        {/* Eliminados los Action Buttons directos para evitar toques accidentales */}
        {isProcessing && (
          <ActivityIndicator style={{ marginTop: Spacing.md }} color={Colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: Spacing.md }}>Cargando pedidos...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="cloud-offline" size={64} color={Colors.danger} />
        <Text style={{ color: Colors.danger, fontSize: FontSize.lg, fontWeight: '700', marginTop: Spacing.md }}>Error</Text>
        <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm }}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetchOrders(); }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {FILTERS.map((f) => {
            const info = STATUS_MAP[f];
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, filter === f && { backgroundColor: info.color, borderColor: info.color }]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                  {info.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderOrder}
        contentContainerStyle={[styles.list, orders.length === 0 && styles.emptyList]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchOrders(); }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={Colors.bgCard}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={60} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Sin resultados</Text>
            <Text style={styles.emptyText}>No hay pedidos para este filtro</Text>
          </View>
        }
        ListHeaderComponent={
          orders.length > 0 ? (
            <Text style={styles.headerCount}>{orders.length} pedido{orders.length !== 1 ? 's' : ''}</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  list: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  emptyList: { flex: 1, justifyContent: 'center' },
  retryBtn: { marginTop: Spacing.lg, backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md },

  headerCount: {
    color: Colors.textSecondary, fontSize: FontSize.sm,
    marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  orderCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  orderHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: Spacing.sm,
  },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orderId: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusPillText: { fontSize: FontSize.xs, fontWeight: '600' },
  orderAmount: { color: Colors.primaryLight, fontSize: FontSize.xl, fontWeight: '800' },

  orderBody: { gap: Spacing.xs + 2 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  infoText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },

  actionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.md, borderWidth: 1,
  },
  actionBtnText: { fontSize: 11, fontWeight: '700' },

  emptyContainer: { alignItems: 'center', gap: Spacing.md },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.md },

  filtersContainer: {
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filtersRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  filterPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#fff',
  },
});
