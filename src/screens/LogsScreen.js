// ============================================================
// Logs Screen — Historial de eventos del sistema
// v3: Vista de logs con filtros por nivel y categoría
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
import { api } from '../services/api';

const LEVEL_MAP = {
  'info':  { color: Colors.success, icon: 'information-circle', label: 'Info' },
  'warn':  { color: Colors.warning, icon: 'warning', label: 'Warn' },
  'error': { color: Colors.danger, icon: 'alert-circle', label: 'Error' },
  'debug': { color: Colors.textMuted, icon: 'code-slash', label: 'Debug' },
};

const CATEGORY_MAP = {
  'all':          { label: 'Todos', icon: 'list' },
  'system':       { label: 'Sistema', icon: 'server' },
  'ocr':          { label: 'OCR', icon: 'scan' },
  'webhook':      { label: 'Webhook', icon: 'globe' },
  'woocommerce':  { label: 'WooCommerce', icon: 'cart' },
  'api':          { label: 'API', icon: 'code' },
  'notification': { label: 'Notificaciones', icon: 'notifications' },
};

const LEVEL_FILTERS = ['all', 'info', 'warn', 'error'];
const CATEGORY_FILTERS = Object.keys(CATEGORY_MAP);

export default function LogsScreen() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [levelFilter, setLevelFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const fetchLogs = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);
      const result = await api.getLogs(
        100,
        levelFilter === 'all' ? null : levelFilter,
        categoryFilter === 'all' ? null : categoryFilter
      );
      setLogs(result.data || []);
    } catch (e) {
      if (!isBackground) Alert.alert('Error', e.message);
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  }, [levelFilter, categoryFilter]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs(logs.length > 0);
    }, [fetchLogs])
  );

  const handleClearLogs = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      '🗑️ Limpiar Logs',
      '¿Estás seguro? Esto eliminará TODOS los logs del sistema.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar Todo', style: 'destructive',
          onPress: async () => {
            try {
              await api.clearLogs(0);
              setLogs([]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('✅', 'Logs limpiados');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    try {
      const d = new Date(dateStr + 'Z'); // SQLite dates are UTC
      const now = new Date();
      const diff = now - d;
      
      if (diff < 60000) return 'hace un momento';
      if (diff < 3600000) return `hace ${Math.floor(diff / 60000)}m`;
      if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)}h`;
      
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const hours = d.getHours().toString().padStart(2, '0');
      const mins = d.getMinutes().toString().padStart(2, '0');
      return `${day}/${month} ${hours}:${mins}`;
    } catch { return dateStr || 'N/A'; }
  };

  const renderLog = ({ item }) => {
    const level = LEVEL_MAP[item.level] || LEVEL_MAP.info;
    const catInfo = CATEGORY_MAP[item.category] || { label: item.category, icon: 'ellipse' };

    return (
      <View style={[styles.logCard, { borderLeftColor: level.color, borderLeftWidth: 3 }]}>
        <View style={styles.logHeader}>
          <View style={styles.logLevelRow}>
            <Ionicons name={level.icon} size={14} color={level.color} />
            <Text style={[styles.logLevel, { color: level.color }]}>{level.label.toUpperCase()}</Text>
          </View>
          <View style={styles.logCatRow}>
            <Ionicons name={catInfo.icon} size={12} color={Colors.textMuted} />
            <Text style={styles.logCat}>{catInfo.label}</Text>
          </View>
          <Text style={styles.logTime}>{formatDate(item.created_at)}</Text>
        </View>
        <Text style={styles.logMessage}>{item.message}</Text>
        {item.metadata && (
          <Text style={styles.logMeta} numberOfLines={2}>
            {typeof item.metadata === 'string' ? item.metadata : JSON.stringify(item.metadata)}
          </Text>
        )}
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={{ color: Colors.textSecondary, marginTop: Spacing.md }}>Cargando logs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Level Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {LEVEL_FILTERS.map((f) => {
            const isActive = levelFilter === f;
            const color = f === 'all' ? Colors.primary : (LEVEL_MAP[f]?.color || Colors.primary);
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive && { backgroundColor: color, borderColor: color }]}
                onPress={() => setLevelFilter(f)}
              >
                <Text style={[styles.filterText, isActive && { color: '#fff' }]}>
                  {f === 'all' ? 'Todos' : LEVEL_MAP[f]?.label || f}
                </Text>
              </TouchableOpacity>
            );
          })}
          <View style={styles.filterDivider} />
          {CATEGORY_FILTERS.filter(f => f !== 'all').map((f) => {
            const isActive = categoryFilter === f;
            const catInfo = CATEGORY_MAP[f];
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, isActive && { backgroundColor: Colors.info, borderColor: Colors.info }]}
                onPress={() => setCategoryFilter(isActive ? 'all' : f)}
              >
                <Ionicons name={catInfo.icon} size={12} color={isActive ? '#fff' : Colors.textSecondary} />
                <Text style={[styles.filterText, isActive && { color: '#fff' }]}>
                  {catInfo.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderLog}
        contentContainerStyle={[styles.list, logs.length === 0 && styles.emptyList]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchLogs(); }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
            progressBackgroundColor={Colors.bgCard}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={60} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>Sin logs</Text>
            <Text style={styles.emptyText}>No hay eventos registrados con estos filtros</Text>
          </View>
        }
        ListHeaderComponent={
          logs.length > 0 ? (
            <View style={styles.headerRow}>
              <Text style={styles.headerCount}>{logs.length} log{logs.length !== 1 ? 's' : ''}</Text>
              <TouchableOpacity onPress={handleClearLogs}>
                <Text style={styles.clearBtn}>🗑️ Limpiar</Text>
              </TouchableOpacity>
            </View>
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

  filtersContainer: {
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  filtersRow: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: 5,
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
  filterDivider: {
    width: 1, height: 20,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.xs,
  },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerCount: {
    color: Colors.textSecondary, fontSize: FontSize.sm,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  clearBtn: {
    color: Colors.danger, fontSize: FontSize.sm, fontWeight: '600',
  },

  logCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  logHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  logLevelRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logLevel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  logCatRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logCat: { color: Colors.textMuted, fontSize: 10, fontWeight: '600' },
  logTime: { color: Colors.textMuted, fontSize: 10, marginLeft: 'auto' },
  logMessage: { color: Colors.text, fontSize: FontSize.sm, lineHeight: 20 },
  logMeta: { color: Colors.textMuted, fontSize: 11, fontFamily: 'monospace', marginTop: 4 },

  emptyContainer: { alignItems: 'center', gap: Spacing.md },
  emptyTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '700' },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.md },
});
