// ============================================================
// Order Detail Screen — Detalle completo de un pedido
// v3: Badge OfficeTech + Editor de precio local
// ============================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, Dimensions, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api } from '../services/api';

const { width } = Dimensions.get('window');

const STATUS_MAP = {
  'completed': { label: 'Completado', color: Colors.success, icon: 'checkmark-circle' },
  'processing': { label: 'Procesando', color: Colors.info, icon: 'sync-circle' },
  'on-hold': { label: 'En espera', color: Colors.warning, icon: 'time' },
  'pending': { label: 'Pendiente', color: Colors.warning, icon: 'hourglass' },
  'cancelled': { label: 'Cancelado', color: Colors.danger, icon: 'close-circle' },
  'refunded': { label: 'Reembolsado', color: Colors.textSecondary, icon: 'return-down-back' },
  'failed': { label: 'Fallido', color: Colors.danger, icon: 'alert-circle' },
};

export default function OrderDetailScreen({ route, navigation }) {
  const { orderId } = route.params;
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  // v3: Price override modal
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);

  useEffect(() => {
    fetchOrder();
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      const result = await api.getOrderDetails(orderId);
      setOrder(result.data);
    } catch (e) {
      Alert.alert('Error', e.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (newStatus) => {
    const statusInfo = STATUS_MAP[newStatus] || { label: newStatus };
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      `Cambiar Estado`,
      `¿Cambiar pedido #${orderId} a "${statusInfo.label}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar', onPress: async () => {
            setProcessing(true);
            try {
              await api.setOrderStatus(orderId, newStatus);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('✅ Éxito', `El pedido ahora está ${statusInfo.label}`);
              fetchOrder();
            } catch (e) {
              Alert.alert('Error', e.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleSavePrice = async () => {
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) {
      return Alert.alert('Error', 'Ingresa un precio válido');
    }
    setSavingPrice(true);
    try {
      await api.overridePrice(orderId, price, 'Precio editado desde APK');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPriceModal(false);
      setPriceInput('');
      fetchOrder(); // Recargar para mostrar el precio actualizado
      Alert.alert('✅', `Precio editado a S/ ${price.toFixed(2)} (solo local)`);
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingPrice(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!order) return null;

  const status = STATUS_MAP[order.status] || { label: order.status, color: Colors.textSecondary, icon: 'help-circle' };
  const customerName = `${order.customer.first_name} ${order.customer.last_name}`.trim();
  const hasOverride = order.override_price !== null && order.override_price !== undefined;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: status.color + '15', borderColor: status.color + '30' }]}>
        <Ionicons name={status.icon} size={24} color={status.color} />
        <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
        {order.is_officetech && (
          <View style={styles.officetechBadge}>
            <Ionicons name="pricetag" size={14} color="#f97316" />
            <Text style={styles.officetechText}>OfficeTech</Text>
          </View>
        )}
      </View>

      {/* Amount */}
      <View style={styles.amountSection}>
        <Text style={styles.amountLabel}>Total del pedido</Text>
        {hasOverride ? (
          <>
            <Text style={styles.amountStrikethrough}>S/ {order.total}</Text>
            <Text style={styles.amountOverride}>S/ {order.override_price.toFixed(2)}</Text>
            <Text style={styles.overrideHint}>💡 Precio editado (solo local)</Text>
          </>
        ) : (
          <Text style={styles.amountValue}>S/ {order.total}</Text>
        )}
        <Text style={styles.amountSub}>{order.payment_method}</Text>
      </View>

      {/* OfficeTech: Edit Price Button */}
      {order.is_officetech && (
        <TouchableOpacity
          style={styles.editPriceBtn}
          onPress={() => {
            setPriceInput(hasOverride ? order.override_price.toString() : '');
            setShowPriceModal(true);
          }}
        >
          <LinearGradient colors={['#f97316', '#ea580c']} style={styles.editPriceGradient}>
            <Ionicons name="create" size={18} color="#fff" />
            <Text style={styles.editPriceText}>
              {hasOverride ? 'Cambiar Precio Real' : 'Asignar Precio Real'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Coupons */}
      {order.coupon_codes && order.coupon_codes.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🏷️ Cupones</Text>
          {order.coupon_codes.map((code, i) => (
            <View key={i} style={styles.couponRow}>
              <Ionicons name="pricetag" size={14} color={Colors.warning} />
              <Text style={styles.couponText}>{code}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Info Cards */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Cliente</Text>
        <InfoRow icon="person" value={customerName} />
        {order.customer.email ? <InfoRow icon="mail" value={order.customer.email} /> : null}
        {order.customer.phone ? <InfoRow icon="call" value={order.customer.phone} /> : null}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Productos</Text>
        {order.items && order.items.map((item, i) => (
          <View key={i} style={styles.productRow}>
            <Ionicons name="cube" size={16} color={Colors.primaryLight} />
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productMeta}>
                Cant: {item.qty} • Stock: {item.stock}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Licenses */}
      {order.licenses && order.licenses.length > 0 && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>🔑 Licencias</Text>
          {order.licenses.map((lic, i) => (
            <View key={i} style={styles.licenseRow}>
              <Ionicons name="key" size={16} color={Colors.success} />
              <Text style={styles.licenseText}>
                {lic.product ? `${lic.product}: ` : ''}•••••{lic.lastFive}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Payment Screenshot */}
      {order.image_url && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>📸 Comprobante de Pago</Text>
          <Image
            source={{ uri: order.image_url }}
            style={styles.screenshot}
            resizeMode="contain"
          />
        </View>
      )}

      {/* Dates */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Fechas</Text>
        <InfoRow icon="calendar" value={`Creado: ${order.date_created || 'N/A'}`} />
        <InfoRow icon="create" value={`Modificado: ${order.date_modified || 'N/A'}`} />
      </View>

      {/* Action Buttons */}
      {!processing && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Cambiar Estado</Text>
          <View style={styles.statusGrid}>
            {Object.keys(STATUS_MAP).map((statusKey) => {
              // No mostrar el estado actual en las opciones
              if (statusKey === order.status) return null;
              const sInfo = STATUS_MAP[statusKey];
              return (
                <TouchableOpacity
                  key={statusKey}
                  style={[styles.statusOptionBtn, { backgroundColor: sInfo.color + '15', borderColor: sInfo.color + '40' }]}
                  onPress={() => handleStatusChange(statusKey)}
                >
                  <Ionicons name={sInfo.icon} size={18} color={sInfo.color} />
                  <Text style={[styles.statusOptionText, { color: sInfo.color }]}>{sInfo.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {processing && (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      )}

      {/* Price Edit Modal */}
      <Modal visible={showPriceModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>💰 Precio Real del Pedido</Text>
            <Text style={styles.modalSub}>
              Este pedido usa cupón OfficeTech (S/ 0.00 en WooCommerce).{'\n'}
              Ingresa el monto real que recibiste por otro medio.
            </Text>
            <Text style={styles.modalLabel}>Precio real (S/)</Text>
            <TextInput
              style={styles.modalInput}
              value={priceInput}
              onChangeText={setPriceInput}
              placeholder="Ej: 45.00"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              autoFocus
            />
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowPriceModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSavePrice}
                disabled={savingPrice}
              >
                {savingPrice ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ icon, value }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={Colors.textSecondary} />
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  center: { flex: 1, backgroundColor: Colors.bg, justifyContent: 'center', alignItems: 'center' },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, marginBottom: Spacing.lg,
  },
  statusLabel: { fontSize: FontSize.lg, fontWeight: '700' },

  officetechBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#f97316' + '20', paddingHorizontal: Spacing.sm,
    paddingVertical: 3, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: '#f97316' + '40',
    marginLeft: 'auto',
  },
  officetechText: { color: '#f97316', fontSize: FontSize.xs, fontWeight: '700' },

  amountSection: { alignItems: 'center', marginBottom: Spacing.lg },
  amountLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  amountValue: { color: Colors.text, fontSize: FontSize.hero, fontWeight: '800', marginTop: Spacing.xs },
  amountStrikethrough: {
    color: Colors.textMuted, fontSize: FontSize.xl, fontWeight: '600',
    textDecorationLine: 'line-through', marginTop: Spacing.xs,
  },
  amountOverride: { color: Colors.success, fontSize: FontSize.hero, fontWeight: '800', marginTop: 2 },
  overrideHint: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 4 },
  amountSub: { color: Colors.primaryLight, fontSize: FontSize.md, marginTop: Spacing.xs },

  editPriceBtn: { marginBottom: Spacing.lg },
  editPriceGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  editPriceText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },

  infoCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  infoTitle: {
    color: Colors.text, fontSize: FontSize.md, fontWeight: '700',
    marginBottom: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  infoValue: { color: Colors.textSecondary, fontSize: FontSize.md, flex: 1 },

  couponRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  couponText: { color: Colors.warning, fontSize: FontSize.md, fontWeight: '600' },

  productRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  productName: { color: Colors.text, fontSize: FontSize.md, fontWeight: '500' },
  productMeta: { color: Colors.textMuted, fontSize: FontSize.sm },

  licenseRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  licenseText: { color: Colors.success, fontSize: FontSize.md, fontFamily: 'monospace' },

  screenshot: {
    width: '100%', height: width * 0.8,
    borderRadius: BorderRadius.md, backgroundColor: Colors.bgCardLight,
  },

  statusGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
  },
  statusOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1,
    width: '48%', // 2 columnas
  },
  statusOptionText: { fontSize: FontSize.sm, fontWeight: '700' },

  // Modal styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.bgCard, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, width: '100%', maxWidth: 400,
    borderWidth: 1, borderColor: Colors.border,
  },
  modalTitle: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.sm },
  modalSub: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.lg, lineHeight: 20 },
  modalLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  modalInput: {
    backgroundColor: Colors.bgInput, borderRadius: BorderRadius.md,
    padding: Spacing.md, color: Colors.text, fontSize: FontSize.xl,
    fontWeight: '700', textAlign: 'center',
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  modalBtnRow: { flexDirection: 'row', gap: Spacing.md },
  modalCancelBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  modalCancelText: { color: Colors.textSecondary, fontWeight: '600' },
  modalSaveBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: '#f97316', alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: FontSize.md },
});
