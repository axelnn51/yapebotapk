// ============================================================
// PaymentsScreen — YapeBot Mobile (v3.5)
// Pantalla dedicada de Yapes y Pagos Recibidos en tiempo real
// Filtros por Día (Hoy, Ayer, Específico, Histórico) + Banco + Búsqueda
// ============================================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  ActivityIndicator,
  Share,
  Alert,
  Dimensions,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api } from '../services/api';
import {
  getLocalPayments,
  getPaymentsStats,
  updateLocalPaymentStatus,
} from '../services/paymentHistory';

const { width } = Dimensions.get('window');

const PROVIDER_THEMES = {
  Yape: {
    name: 'Yape',
    color: '#8a2be2',
    bg: 'rgba(138, 43, 226, 0.15)',
    icon: 'flash',
    tag: '🟣 Yape',
  },
  Plin: {
    name: 'Plin',
    color: '#00d084',
    bg: 'rgba(0, 208, 132, 0.15)',
    icon: 'paper-plane',
    tag: '🟢 Plin',
  },
  Interbank: {
    name: 'Interbank',
    color: '#0066cc',
    bg: 'rgba(0, 102, 204, 0.15)',
    icon: 'business',
    tag: '🔵 Interbank',
  },
  BCP: {
    name: 'BCP',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.15)',
    icon: 'card',
    tag: '🟠 BCP',
  },
  BBVA: {
    name: 'BBVA',
    color: '#004481',
    bg: 'rgba(0, 68, 129, 0.2)',
    icon: 'wallet',
    tag: '🔷 BBVA',
  },
  Scotiabank: {
    name: 'Scotiabank',
    color: '#ec111a',
    bg: 'rgba(236, 17, 26, 0.15)',
    icon: 'shield',
    tag: '🔴 Scotia',
  },
  Otro: {
    name: 'Bancario',
    color: '#64748b',
    bg: 'rgba(100, 116, 139, 0.15)',
    icon: 'cash',
    tag: '🏦 Banco',
  },
};

// Formato de fecha YYYY-MM-DD en Zona Horaria Perú (America/Lima)
const getPeruDateString = (timestampOrDate = new Date()) => {
  try {
    const d = new Date(timestampOrDate);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch (e) {
    const d = new Date(timestampOrDate);
    return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
  }
};

const getYesterdayPeruDateString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getPeruDateString(d);
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  const monthName = months[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${monthName} ${y}`;
};

const formatChipLabel = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [_, m, d] = parts;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  const monthName = months[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${monthName}`;
};

export default function PaymentsScreen() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('TODAY'); // 'TODAY', 'YESTERDAY', 'ALL', o 'YYYY-MM-DD'
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  // Formateador de fecha horario Perú para items de lista
  const formatDate = (isoStringOrTimestamp) => {
    if (!isoStringOrTimestamp) return 'Reciente';
    try {
      const d = new Date(isoStringOrTimestamp);
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      return 'Fecha desconocida';
    }
  };

  // Carga y consolidación de pagos locales + remotos con soporte de filtro de fecha
  const loadPaymentsData = useCallback(async (dateFilter = selectedDate, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const todayStr = getPeruDateString();
      const yesterdayStr = getYesterdayPeruDateString();

      let targetDateParam = null;
      if (dateFilter === 'TODAY') {
        targetDateParam = todayStr;
      } else if (dateFilter === 'YESTERDAY') {
        targetDateParam = yesterdayStr;
      } else if (dateFilter !== 'ALL' && dateFilter) {
        targetDateParam = dateFilter;
      }

      // 1. Cargar fechas disponibles en paralelo desde el backend
      api.getNotificationDates().then(res => {
        if (res?.ok && Array.isArray(res.data) && res.data.length > 0) {
          setAvailableDates(res.data);
        }
      }).catch(() => {});

      // 2. Obtener historial local de pagos capturados
      const localList = await getLocalPayments();

      // Filtrar locales por fecha si aplica
      let filteredLocal = localList;
      if (targetDateParam) {
        filteredLocal = localList.filter(item => {
          const itemDate = getPeruDateString(item.timestamp || item.dateFormatted);
          return itemDate === targetDateParam;
        });
      }

      // 3. Obtener notificaciones desde el backend (con filtro de fecha si aplica)
      let remoteList = [];
      try {
        const res = await api.getNotifications(60, targetDateParam);
        if (res?.ok && Array.isArray(res.data)) {
          remoteList = res.data.map(item => ({
            id: `REMOTE_${item.id || item.timestamp}`,
            amount: typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || 0),
            sender: item.sender || 'Cliente',
            provider: item.provider || (item.sender?.toLowerCase().includes('plin') ? 'Plin' : 'Yape'),
            securityCode: item.security_code || null,
            rawText: item.text || item.rawText || '',
            timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
            status: 'sent',
            isRemote: true,
          }));
        }
      } catch (backendErr) {
        // En caso offline o backend ocupado, se continúa con datos locales
      }

      // 4. Fusionar evitando duplicados cercanos
      const mergedMap = new Map();

      // Priorizar datos locales
      filteredLocal.forEach(item => {
        mergedMap.set(item.id, item);
      });

      // Añadir remotos si no coinciden aproximadamente en monto, remitente y tiempo
      remoteList.forEach(r => {
        const isAlreadyPresent = filteredLocal.some(loc => {
          const timeDiff = Math.abs((loc.timestamp || 0) - (r.timestamp || 0));
          return Math.abs((loc.amount || 0) - (r.amount || 0)) < 0.01 &&
            (loc.sender || '').toLowerCase().trim() === (r.sender || '').toLowerCase().trim() &&
            timeDiff < 120000;
        });

        if (!isAlreadyPresent) {
          mergedMap.set(r.id, r);
        }
      });

      const combined = Array.from(mergedMap.values()).sort((a, b) => {
        const timeA = a.timestamp || new Date(a.dateFormatted || 0).getTime();
        const timeB = b.timestamp || new Date(b.dateFormatted || 0).getTime();
        return timeB - timeA;
      });

      setPayments(combined);
    } catch (e) {
      console.warn('[PaymentsScreen] Error cargando pagos:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate]);

  useFocusEffect(
    useCallback(() => {
      loadPaymentsData(selectedDate, payments.length === 0);
    }, [loadPaymentsData, selectedDate, payments.length])
  );

  const onRefresh = () => {
    setRefreshing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}
    loadPaymentsData(selectedDate, false);
  };

  const handleSelectDate = (dateOption) => {
    try {
      Haptics.selectionAsync();
    } catch (e) {}
    setSelectedDate(dateOption);
    loadPaymentsData(dateOption, true);
  };

  // Cálculo dinámico de métricas del período seleccionado
  const { periodTotal, periodCount, periodBreakdown, heroTitle } = useMemo(() => {
    let total = 0;
    let count = 0;
    const breakdown = { Yape: 0, Plin: 0, InterbankBcp: 0, Otros: 0 };

    payments.forEach(item => {
      const amt = typeof item.amount === 'number' ? item.amount : parseFloat(item.amount || 0);
      if (!isNaN(amt)) {
        total += amt;
        count += 1;
        const prov = (item.provider || 'Otro').toLowerCase();
        if (prov.includes('yape')) {
          breakdown.Yape += amt;
        } else if (prov.includes('plin')) {
          breakdown.Plin += amt;
        } else if (prov.includes('interbank') || prov.includes('bcp')) {
          breakdown.InterbankBcp += amt;
        } else {
          breakdown.Otros += amt;
        }
      }
    });

    let title = 'Ingresos Hoy (Capturas)';
    const todayStr = getPeruDateString();
    const yesterdayStr = getYesterdayPeruDateString();

    if (selectedDate === 'TODAY' || selectedDate === todayStr) {
      title = 'Ingresos Hoy (Capturas)';
    } else if (selectedDate === 'YESTERDAY' || selectedDate === yesterdayStr) {
      title = 'Ingresos de Ayer';
    } else if (selectedDate === 'ALL') {
      title = 'Total Recaudado (Histórico)';
    } else {
      title = `Ingresos: ${formatDisplayDate(selectedDate)}`;
    }

    return {
      periodTotal: total,
      periodCount: count,
      periodBreakdown: breakdown,
      heroTitle: title,
    };
  }, [payments, selectedDate]);

  // Filtrado por Proveedor, Estado y Búsqueda sobre los pagos del día seleccionado
  const filteredPayments = useMemo(() => {
    return payments.filter(item => {
      // 1. Filtro por Proveedor
      if (selectedProvider !== 'ALL') {
        const prov = (item.provider || 'Otro').toLowerCase();
        if (selectedProvider.toLowerCase() === 'yape' && !prov.includes('yape')) return false;
        if (selectedProvider.toLowerCase() === 'plin' && !prov.includes('plin')) return false;
        if (selectedProvider.toLowerCase() === 'interbank' && !prov.includes('interbank')) return false;
        if (selectedProvider.toLowerCase() === 'bcp' && !prov.includes('bcp')) return false;
        if (selectedProvider.toLowerCase() === 'bbva' && !prov.includes('bbva')) return false;
      }

      // 2. Filtro por Estado
      if (selectedStatus !== 'ALL') {
        if (selectedStatus === 'SENT' && item.status !== 'sent') return false;
        if (selectedStatus === 'PENDING' && (item.status === 'sent' || item.status === 'duplicate')) return false;
      }

      // 3. Búsqueda por texto (Remitente, Monto o Código de seguridad)
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const senderMatch = (item.sender || '').toLowerCase().includes(query);
        const amountMatch = String(item.amount || '').includes(query);
        const codeMatch = (item.securityCode || '').toLowerCase().includes(query);
        const rawMatch = (item.rawText || '').toLowerCase().includes(query);
        if (!senderMatch && !amountMatch && !codeMatch && !rawMatch) {
          return false;
        }
      }

      return true;
    });
  }, [payments, selectedProvider, selectedStatus, searchQuery]);

  const handleOpenDetail = (item) => {
    try {
      Haptics.selectionAsync();
    } catch (e) {}
    setSelectedPayment(item);
    setModalVisible(true);
  };

  const handleSharePayment = async (payment) => {
    if (!payment) return;
    try {
      const text = `💰 Pago Recibido - ${payment.provider || 'Yape'}\n` +
        `👤 Remitente: ${payment.sender || 'Cliente'}\n` +
        `💵 Monto: S/ ${(payment.amount || 0).toFixed(2)}\n` +
        (payment.securityCode ? `🔑 Cód. Seguridad: ${payment.securityCode}\n` : '') +
        `📅 Fecha: ${formatDate(payment.timestamp)}\n` +
        `📱 Verificado por YapeBot Mobile`;
      await Share.share({ message: text });
    } catch (e) {
      console.warn('Share error:', e.message);
    }
  };

  const handleRetrySend = async (payment) => {
    if (!payment || retryingId) return;
    setRetryingId(payment.id);
    try {
      const res = await api.sendIncomingNotification({
        sender: payment.sender,
        amount: payment.amount,
        securityCode: payment.securityCode,
        provider: payment.provider,
        rawText: payment.rawText,
        packageName: payment.packageName,
        timestamp: payment.timestamp,
      });

      if (res?.ok || res?.result || res?.status === 'ok') {
        await updateLocalPaymentStatus(payment.id, 'sent', 'Reenviado con éxito al backend');
        if (selectedPayment) {
          setSelectedPayment(prev => ({ ...prev, status: 'sent', response: 'Reenviado con éxito al backend' }));
        }
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}
        Alert.alert('Éxito', 'Pago reenviado y procesado correctamente por el servidor.');
        loadPaymentsData(selectedDate);
      } else {
        throw new Error(res?.error || 'El servidor no confirmó el procesamiento');
      }
    } catch (err) {
      Alert.alert('Error al reenviar', err.message || 'No se pudo contactar al servidor.');
    } finally {
      setRetryingId(null);
    }
  };

  // Construcción de la lista de chips de fecha
  const dateFilterChips = useMemo(() => {
    const todayStr = getPeruDateString();
    const yesterdayStr = getYesterdayPeruDateString();

    const chips = [
      { id: 'TODAY', label: '📅 Hoy' },
      { id: 'YESTERDAY', label: '⏪ Ayer' },
      { id: 'ALL', label: '🗓️ Histórico' },
    ];

    // Agregar fechas del backend que no sean hoy ni ayer
    availableDates.forEach(dateStr => {
      if (dateStr !== todayStr && dateStr !== yesterdayStr) {
        chips.push({
          id: dateStr,
          label: formatChipLabel(dateStr),
        });
      }
    });

    return chips;
  }, [availableDates]);

  const renderPaymentItem = ({ item }) => {
    const provTheme = PROVIDER_THEMES[item.provider] || PROVIDER_THEMES.Otro;
    const isSent = item.status === 'sent';
    const isQueued = item.status === 'queued' || item.status === 'pending';
    const isDuplicate = item.status === 'duplicate';

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => handleOpenDetail(item)}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.avatar, { backgroundColor: provTheme.bg, borderColor: provTheme.color }]}>
            <Ionicons name={provTheme.icon} size={20} color={provTheme.color} />
          </View>

          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.senderName} numberOfLines={1}>
                {item.sender || 'Cliente'}
              </Text>
              {item.securityCode && (
                <View style={styles.codeBadge}>
                  <Text style={styles.codeBadgeText}>🔑 {item.securityCode}</Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.timeText}>{formatDate(item.timestamp)}</Text>
              <Text style={styles.bulletDot}>•</Text>
              <View style={[styles.providerTag, { backgroundColor: provTheme.bg }]}>
                <Text style={[styles.providerTagText, { color: provTheme.color }]}>
                  {item.provider || 'Yape'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cardRight}>
          <Text style={styles.amountText}>
            +S/ {typeof item.amount === 'number' ? item.amount.toFixed(2) : parseFloat(item.amount || 0).toFixed(2)}
          </Text>

          <View style={styles.statusRow}>
            {isSent && (
              <View style={[styles.syncBadge, styles.syncSent]}>
                <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                <Text style={styles.syncSentText}>Sync</Text>
              </View>
            )}
            {isQueued && (
              <View style={[styles.syncBadge, styles.syncQueued]}>
                <Ionicons name="time" size={12} color={Colors.warning} />
                <Text style={styles.syncQueuedText}>Cola</Text>
              </View>
            )}
            {isDuplicate && (
              <View style={[styles.syncBadge, styles.syncDuplicate]}>
                <Ionicons name="copy-outline" size={12} color={Colors.textMuted} />
                <Text style={styles.syncDuplicateText}>Dup</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Resumen Dinámico Superior / KPIs del Período Seleccionado */}
      <View style={styles.header}>
        <LinearGradient
          colors={['#10b981', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSubtitle}>{heroTitle}</Text>
              <Text style={styles.heroAmount}>
                +S/ {periodTotal.toFixed(2)}
              </Text>
            </View>
            <View style={styles.heroCountBadge}>
              <Ionicons name="flash" size={16} color="#10b981" />
              <Text style={styles.heroCountText}>{periodCount} pagos</Text>
            </View>
          </View>

          {/* Desglose dinámico por proveedor */}
          <View style={styles.providerBreakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>🟣 Yape</Text>
              <Text style={styles.breakdownValue}>
                S/ {periodBreakdown.Yape.toFixed(0)}
              </Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>🟢 Plin</Text>
              <Text style={styles.breakdownValue}>
                S/ {periodBreakdown.Plin.toFixed(0)}
              </Text>
            </View>
            <View style={styles.breakdownDivider} />
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>🔵 Otros</Text>
              <Text style={styles.breakdownValue}>
                S/ {(periodBreakdown.InterbankBcp + periodBreakdown.Otros).toFixed(0)}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* Selector Horizontal de Fechas */}
      <View style={styles.dateFilterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateFilterList}
          data={dateFilterChips}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedDate === item.id;
            return (
              <TouchableOpacity
                style={[styles.dateChip, isSelected && styles.dateChipActive]}
                onPress={() => handleSelectDate(item.id)}
              >
                <Text style={[styles.dateChipText, isSelected && styles.dateChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Barra de Búsqueda */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por cliente, monto o cód..."
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearch}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Chips de Filtro por Banco */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          data={[
            { id: 'ALL', label: 'Todos' },
            { id: 'Yape', label: '🟣 Yape' },
            { id: 'Plin', label: '🟢 Plin' },
            { id: 'Interbank', label: '🔵 Interbank' },
            { id: 'BCP', label: '🟠 BCP' },
            { id: 'BBVA', label: '🔷 BBVA' },
          ]}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const isSelected = selectedProvider === item.id;
            return (
              <TouchableOpacity
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => {
                  try { Haptics.selectionAsync(); } catch (e) {}
                  setSelectedProvider(item.id);
                }}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Lista de Pagos */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Cargando pagos...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredPayments}
          keyExtractor={item => item.id}
          renderItem={renderPaymentItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
              progressBackgroundColor={Colors.bgCard}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={42} color={Colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No hay pagos registrados</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery || selectedProvider !== 'ALL'
                  ? 'No hay resultados para los filtros seleccionados.'
                  : `No se encontraron notificaciones de pago para el período seleccionado (${selectedDate}).`}
              </Text>
              {(searchQuery || selectedProvider !== 'ALL' || selectedDate !== 'TODAY') && (
                <TouchableOpacity
                  style={styles.resetFiltersBtn}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedProvider('ALL');
                    setSelectedStatus('ALL');
                    handleSelectDate('TODAY');
                  }}
                >
                  <Text style={styles.resetFiltersText}>Ver Pagos de Hoy</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Modal de Detalle Completo de Pago */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedPayment && (
              <>
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleRow}>
                    <Text style={styles.modalTitle}>Detalle del Pago</Text>
                    <View
                      style={[
                        styles.modalProviderBadge,
                        {
                          backgroundColor:
                            PROVIDER_THEMES[selectedPayment.provider]?.bg || 'rgba(124, 58, 237, 0.15)',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalProviderText,
                          {
                            color:
                              PROVIDER_THEMES[selectedPayment.provider]?.color || Colors.primary,
                          },
                        ]}
                      >
                        {selectedPayment.provider || 'Yape'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setModalVisible(false)}
                  >
                    <Ionicons name="close" size={24} color={Colors.text} />
                  </TouchableOpacity>
                </View>

                {/* Monto destacado en modal */}
                <View style={styles.modalHeroAmount}>
                  <Text style={styles.modalAmountLabel}>Monto Abonado</Text>
                  <Text style={styles.modalAmountValue}>
                    S/ {(Number(selectedPayment.amount) || 0).toFixed(2)}
                  </Text>
                </View>

                {/* Campos de información */}
                <View style={styles.detailGrid}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Remitente:</Text>
                    <Text style={styles.detailValue}>{selectedPayment.sender || 'Cliente'}</Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Fecha y Hora:</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedPayment.timestamp)}</Text>
                  </View>

                  {selectedPayment.securityCode && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Cód. Seguridad:</Text>
                      <Text style={[styles.detailValue, { color: Colors.warning, fontWeight: '700' }]}>
                        {selectedPayment.securityCode}
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Estado Servidor:</Text>
                    <View style={styles.statusPill}>
                      <Text
                        style={[
                          styles.statusPillText,
                          {
                            color:
                              selectedPayment.status === 'sent'
                                ? Colors.success
                                : selectedPayment.status === 'queued'
                                ? Colors.warning
                                : Colors.textMuted,
                          },
                        ]}
                      >
                        {selectedPayment.status === 'sent'
                          ? '✅ Sincronizado'
                          : selectedPayment.status === 'queued'
                          ? '⏳ En Cola (Reintentando)'
                          : selectedPayment.status === 'duplicate'
                          ? '📋 Duplicado'
                          : '⚠️ Pendiente'}
                      </Text>
                    </View>
                  </View>

                  {selectedPayment.packageName ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>App de Origen:</Text>
                      <Text style={styles.detailSubValue} numberOfLines={1}>
                        {selectedPayment.packageName}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Texto Original Capturado (Raw Text) */}
                <View style={styles.rawTextContainer}>
                  <Text style={styles.rawTextTitle}>Notificación Original (Android):</Text>
                  <Text style={styles.rawTextContent} numberOfLines={4}>
                    {selectedPayment.rawText || 'Sin texto original'}
                  </Text>
                </View>

                {/* Botones de Acción */}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => handleSharePayment(selectedPayment)}
                  >
                    <Ionicons name="share-social-outline" size={18} color="#fff" />
                    <Text style={styles.shareBtnText}>Compartir</Text>
                  </TouchableOpacity>

                  {selectedPayment.status !== 'sent' && (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => handleRetrySend(selectedPayment)}
                      disabled={retryingId === selectedPayment.id}
                    >
                      {retryingId === selectedPayment.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="refresh-outline" size={18} color="#fff" />
                          <Text style={styles.retryBtnText}>Reenviar al Bot</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  heroBanner: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  heroAmount: {
    color: '#ffffff',
    fontSize: FontSize.xxl,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  heroCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  heroCountText: {
    color: '#059669',
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  providerBreakdown: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: BorderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  breakdownLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600',
  },
  breakdownValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },

  // Selector de Fechas
  dateFilterContainer: {
    marginTop: Spacing.sm,
  },
  dateFilterList: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  dateChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dateChipActive: {
    backgroundColor: '#059669',
    borderColor: '#10b981',
  },
  dateChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  dateChipTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },

  // Barra de búsqueda
  searchSection: {
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
  },
  clearSearch: {
    padding: 4,
  },

  // Filtros de banco
  filterSection: {
    marginVertical: Spacing.xs,
  },
  filterList: {
    paddingHorizontal: Spacing.md,
    gap: 8,
  },
  filterChip: {
    backgroundColor: Colors.bgCard,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },

  // Lista
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: 10,
    borderColor: Colors.border,
    borderWidth: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  senderName: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    flexShrink: 1,
  },
  codeBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeBadgeText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  timeText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  bulletDot: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  providerTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  providerTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardRight: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  amountText: {
    color: '#10b981',
    fontSize: FontSize.lg,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusRow: {
    marginTop: 4,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  syncSent: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  syncSentText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '600',
  },
  syncQueued: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  syncQueuedText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '600',
  },
  syncDuplicate: {
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
  },
  syncDuplicateText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },

  // Estado Vacío y Carga
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  resetFiltersBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.bgCardLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  resetFiltersText: {
    color: Colors.primaryLight,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },

  // Modal de Detalle
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12122a',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  modalProviderBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modalProviderText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalHeroAmount: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  modalAmountLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  modalAmountValue: {
    color: '#10b981',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 2,
  },
  detailGrid: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  detailValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  detailSubValue: {
    color: Colors.textSecondary,
    fontSize: 11,
    maxWidth: '60%',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rawTextContainer: {
    backgroundColor: '#0a0a1a',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rawTextTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  rawTextContent: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  shareBtnText: {
    color: '#ffffff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  retryBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.warning,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  retryBtnText: {
    color: '#ffffff',
    fontSize: FontSize.md,
    fontWeight: '700',
  },
});
