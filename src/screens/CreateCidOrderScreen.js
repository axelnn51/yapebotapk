// ============================================================
// CreateCidOrderScreen — YapeBot Mobile
// Generador oficial de Pedidos CDK con créditos para getcid.cdkeysperu.com
// Diseñado para ventas por WhatsApp, MercadoLibre y canales externos
// ============================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  Linking,
  FlatList,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api } from '../services/api';

let Clipboard = null;
try {
  Clipboard = require('expo-clipboard');
} catch (e) {
  // Graceful fallback if module isn't loaded natively
}

const QUICK_CREDITS = [1, 2, 3, 5, 10];

export default function CreateCidOrderScreen({ route, navigation }) {
  const [credits, setCredits] = useState(1);
  const [customOrderId, setCustomOrderId] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [wooOrders, setWooOrders] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  // Generador de número aleatorio CDK-XXXXX
  const generateRandomOrderId = useCallback(() => {
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    return `CDK-${randomNum}`;
  }, []);

  // Al abrir la pantalla, sugerir un número de pedido nuevo
  useEffect(() => {
    if (!route?.params?.orderId) {
      setCustomOrderId(generateRandomOrderId());
    }
  }, [generateRandomOrderId, route?.params?.orderId]);

  // Si proviene de navegación externa (ej: OrderDetailScreen con pedido #14748)
  useEffect(() => {
    if (route?.params?.orderId) {
      const incomingId = String(route.params.orderId).trim().replace(/^#+/, '');
      setCustomOrderId(incomingId);
      if (route.params.email) {
        setCustomerEmail(route.params.email);
      }
      if (route.params.suggestedCredits) {
        setCredits(Math.max(1, parseInt(route.params.suggestedCredits, 10) || 1));
      }
    }
  }, [route?.params?.orderId, route?.params?.email, route?.params?.suggestedCredits]);

  // Cargar pedidos recientes de WooCommerce para autocompletado rápido
  const loadWooOrders = useCallback(async () => {
    try {
      const res = await api.getPendingOrders();
      if (res?.ok && Array.isArray(res.data)) {
        setWooOrders(res.data.slice(0, 8));
      }
    } catch (e) {
      // Ignorar fallo silenciosamente
    }
  }, []);

  // Cargar historial de pedidos CDK
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.getCidOrders(25);
      if (res?.ok && Array.isArray(res.data)) {
        setRecentOrders(res.data);
      }
    } catch (e) {
      console.warn('Error cargando historial CID:', e.message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
      loadWooOrders();
    }, [loadHistory, loadWooOrders])
  );

  // Generar texto para el cliente
  const buildClientText = (orderId, numCredits) => {
    const cleanId = String(orderId || '').replace(/^#+/, '');
    return (
      `Hola! Puedes activar tu software en nuestro portal oficial:\n` +
      `🌐 https://getcid.cdkeysperu.com/\n` +
      `Ingresa tu N° de pedido: #${cleanId}\n` +
      `Cuentas con ${numCredits} activación(es) disponible(s).`
    );
  };

  // Crear pedido
  const handleCreateOrder = async () => {
    const targetOrderId = (customOrderId || generateRandomOrderId()).trim().toUpperCase();
    const targetCredits = Math.max(1, parseInt(credits, 10) || 1);

    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    try {
      const res = await api.createCidOrder({
        credits: targetCredits,
        customOrderId: targetOrderId,
        email: customerEmail.trim() || 'manual@cdkeysperu.com',
      });

      if (res?.ok && res.data) {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {}

        const orderData = res.data;
        setCreatedOrder({
          orderId: orderData.orderId,
          credits: orderData.credits,
          clientText: orderData.clientText || buildClientText(orderData.orderId, orderData.credits),
          createdAt: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }),
        });

        // Actualizar formulario con nuevo sugerido
        setCustomOrderId(generateRandomOrderId());
        setCustomerEmail('');
        loadHistory();
      } else {
        throw new Error(res?.error || 'No se pudo crear el pedido en el servidor');
      }
    } catch (err) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch (e) {}
      Alert.alert('Error al generar pedido', err.message || 'Verifica la conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  // Copiar al portapapeles
  const handleCopyText = async (text, id = 'new') => {
    try {
      if (Clipboard && Clipboard.setStringAsync) {
        await Clipboard.setStringAsync(text);
      } else {
        await Share.share({ message: text });
      }
      setCopiedId(id);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e) {
      Alert.alert('Copiado', 'Texto copiado.');
    }
  };

  // Compartir por WhatsApp
  const handleShareWhatsApp = async (text) => {
    try {
      const url = `whatsapp://send?text=${encodeURIComponent(text)}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        await Share.share({ message: text });
      }
    } catch (e) {
      await Share.share({ message: text });
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      <LinearGradient
        colors={['#7c3aed', '#4f46e5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBanner}
      >
        <View style={styles.heroHeader}>
          <View style={styles.heroIconCircle}>
            <Ionicons name="key" size={24} color="#facc15" />
          </View>
          <View style={styles.heroTitleCol}>
            <Text style={styles.heroTitle}>Generador de Pedidos CID</Text>
            <Text style={styles.heroSubtitle}>Activaciones automáticas para clientes</Text>
          </View>
        </View>
        <View style={styles.portalBadge}>
          <Ionicons name="globe-outline" size={14} color="#e0e7ff" />
          <Text style={styles.portalBadgeText}>getcid.cdkeysperu.com</Text>
        </View>
      </LinearGradient>

      {/* Tarjeta de Éxito cuando se genera un pedido */}
      {createdOrder && (
        <View style={styles.successCard}>
          <View style={styles.successHeader}>
            <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
            <Text style={styles.successTitle}>¡PEDIDO GENERADO CON ÉXITO!</Text>
          </View>

          <View style={styles.orderSummaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>📦 N° de Pedido:</Text>
              <Text style={styles.summaryValueHighlight}>{createdOrder.orderId}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>💰 Créditos CID:</Text>
              <Text style={styles.summaryValue}>{createdOrder.credits} activación(es)</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>🌐 Portal Web:</Text>
              <Text style={styles.summaryValueLink}>getcid.cdkeysperu.com</Text>
            </View>
          </View>

          <Text style={styles.copyBoxTitle}>📋 Texto listo para enviar a tu cliente:</Text>
          <TouchableOpacity
            style={styles.copyBox}
            activeOpacity={0.8}
            onPress={() => handleCopyText(createdOrder.clientText, 'new')}
          >
            <Text style={styles.copyBoxContent}>{createdOrder.clientText}</Text>
            <View style={styles.copyBoxHint}>
              <Ionicons
                name={copiedId === 'new' ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copiedId === 'new' ? Colors.success : Colors.textMuted}
              />
              <Text style={[styles.copyBoxHintText, copiedId === 'new' && { color: Colors.success }]}>
                {copiedId === 'new' ? '¡Copiado!' : 'Toca para copiar'}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnCopy]}
              onPress={() => handleCopyText(createdOrder.clientText, 'new')}
            >
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>
                {copiedId === 'new' ? '¡Copiado!' : 'Copiar Texto'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.btnWhatsApp]}
              onPress={() => handleShareWhatsApp(createdOrder.clientText)}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>

          {/* Botón Solicitado: 🧾 Pedido N.° #[Número] */}
          <View style={styles.orderNumberRow}>
            <TouchableOpacity
              style={[
                styles.orderNumberBtn,
                copiedId === 'orderNumber' && styles.orderNumberBtnCopied,
              ]}
              activeOpacity={0.8}
              onPress={() => {
                const cleanId = String(createdOrder.orderId).replace(/^#+/, '');
                handleCopyText(`🧾 Pedido N.° #${cleanId}`, 'orderNumber');
              }}
            >
              <View style={styles.orderNumberLeft}>
                <Ionicons
                  name={copiedId === 'orderNumber' ? 'checkmark-circle' : 'receipt'}
                  size={18}
                  color={copiedId === 'orderNumber' ? Colors.success : '#facc15'}
                />
                <Text style={styles.orderNumberText} numberOfLines={1}>
                  {copiedId === 'orderNumber'
                    ? '¡Copiado al Portapapeles!'
                    : `🧾 Pedido N.° #${String(createdOrder.orderId).replace(/^#+/, '')}`}
                </Text>
              </View>

              <View
                style={[
                  styles.orderNumberCopyTag,
                  copiedId === 'orderNumber' && styles.orderNumberCopyTagActive,
                ]}
              >
                <Ionicons
                  name={copiedId === 'orderNumber' ? 'checkmark' : 'copy-outline'}
                  size={13}
                  color={copiedId === 'orderNumber' ? '#ffffff' : '#cbd5e1'}
                />
                <Text
                  style={[
                    styles.orderNumberCopyTagText,
                    copiedId === 'orderNumber' && { color: '#ffffff' },
                  ]}
                >
                  {copiedId === 'orderNumber' ? 'Copiado' : 'Copiar'}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.orderNumberWaBtn}
              activeOpacity={0.8}
              onPress={() => {
                const cleanId = String(createdOrder.orderId).replace(/^#+/, '');
                handleShareWhatsApp(`🧾 Pedido N.° #${cleanId}`);
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Formulario de Creación */}
      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>1. Cantidad de Créditos / Activaciones</Text>
        <View style={styles.creditsRow}>
          {QUICK_CREDITS.map(num => (
            <TouchableOpacity
              key={num}
              style={[styles.creditChip, credits === num && styles.creditChipActive]}
              onPress={() => {
                try { Haptics.selectionAsync(); } catch (e) {}
                setCredits(num);
              }}
            >
              <Text style={[styles.creditChipText, credits === num && styles.creditChipTextActive]}>
                {num} {num === 1 ? 'crédito' : 'créditos'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stepper manual */}
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch (e) {}
              setCredits(prev => Math.max(1, prev - 1));
            }}
          >
            <Ionicons name="remove" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.stepperDisplay}>
            <Text style={styles.stepperValue}>{credits}</Text>
            <Text style={styles.stepperLabel}>activaciones CID</Text>
          </View>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch (e) {}
              setCredits(prev => prev + 1);
            }}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>2. Número de Pedido</Text>

        {/* Chips de Selección Rápida desde Pedidos WooCommerce */}
        {wooOrders && wooOrders.length > 0 && (
          <View style={styles.wooSelectorContainer}>
            <Text style={styles.wooSelectorLabel}>⚡ Seleccionar pedido reciente de tienda:</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wooSelectorList}
            >
              {wooOrders.map(wo => {
                const woId = String(wo.id).replace(/^#+/, '');
                const isSelected = customOrderId === woId || customOrderId === `#${woId}`;
                return (
                  <TouchableOpacity
                    key={wo.id}
                    style={[styles.wooChip, isSelected && styles.wooChipActive]}
                    onPress={() => {
                      try { Haptics.selectionAsync(); } catch (e) {}
                      setCustomOrderId(woId);
                      if (wo.customer?.email) setCustomerEmail(wo.customer.email);
                      if (wo.items?.length) {
                        const sum = wo.items.reduce((acc, it) => acc + (parseInt(it.qty, 10) || 1), 0);
                        if (sum > 0) setCredits(sum);
                      }
                    }}
                  >
                    <Ionicons
                      name="receipt-outline"
                      size={13}
                      color={isSelected ? '#ffffff' : '#facc15'}
                    />
                    <Text style={[styles.wooChipText, isSelected && styles.wooChipTextActive]}>
                      #{wo.id}
                    </Text>
                    {wo.customer?.first_name ? (
                      <Text
                        style={[styles.wooChipName, isSelected && { color: '#e0e7ff' }]}
                        numberOfLines={1}
                      >
                        {wo.customer.first_name}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.orderIdRow}>
          <View style={styles.orderIdInputBox}>
            <Ionicons name="pricetag-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.orderIdInput}
              value={customOrderId}
              onChangeText={setCustomOrderId}
              placeholder="CDK-12345"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />
          </View>
          <TouchableOpacity
            style={styles.regenerateBtn}
            onPress={() => {
              try { Haptics.selectionAsync(); } catch (e) {}
              setCustomOrderId(generateRandomOrderId());
            }}
          >
            <Ionicons name="shuffle" size={18} color="#fff" />
            <Text style={styles.regenerateBtnText}>Aleatorio</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.fieldHint}>
          💡 El prefijo CDK asegura compatibilidad 100% con getcid.cdkeysperu.com sin colisionar con WooCommerce.
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>3. Email o Nota de Cliente (Opcional)</Text>
        <View style={styles.orderIdInputBox}>
          <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.orderIdInput}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            placeholder="ej: cliente@email.com o WhatsApp 987..."
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Botón Principal */}
        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          activeOpacity={0.8}
          onPress={handleCreateOrder}
          disabled={loading}
        >
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitGradient}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>
                  Generar Pedido ({credits} {credits === 1 ? 'Crédito' : 'Créditos'})
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Historial de Pedidos Recientes */}
      <View style={styles.historySection}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>📋 Pedidos CDK Recientes</Text>
          <TouchableOpacity onPress={loadHistory} disabled={loadingHistory}>
            {loadingHistory ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="refresh" size={18} color={Colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.emptyHistory}>
            <Ionicons name="receipt-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyHistoryText}>Aún no hay pedidos CDK registrados.</Text>
          </View>
        ) : (
          recentOrders.map(item => {
            const clientMsg = buildClientText(item.order_id, item.credits);
            const isAvailable = (item.remaining_credits ?? item.credits) > 0;

            return (
              <View key={item.order_id} style={styles.historyItemCard}>
                <View style={styles.historyItemLeft}>
                  <View style={styles.orderIdBadge}>
                    <Text style={styles.orderIdBadgeText}>#{item.order_id}</Text>
                  </View>
                  <View style={styles.historyItemMeta}>
                    <View style={styles.creditsStatusRow}>
                      <View style={[styles.statusDot, { backgroundColor: isAvailable ? Colors.success : Colors.error }]} />
                      <Text style={[styles.creditsStatusText, { color: isAvailable ? Colors.success : Colors.error }]}>
                        {isAvailable
                          ? `${item.remaining_credits ?? item.credits}/${item.credits} disp.`
                          : `0/${item.credits} agotado`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        const cleanId = String(item.order_id).replace(/^#+/, '');
                        handleCopyText(`🧾 Pedido N.° #${cleanId}`, `hist_order_${item.order_id}`);
                      }}
                      style={styles.historyOrderIdTag}
                    >
                      <Ionicons
                        name={copiedId === `hist_order_${item.order_id}` ? 'checkmark' : 'receipt-outline'}
                        size={12}
                        color={copiedId === `hist_order_${item.order_id}` ? Colors.success : '#facc15'}
                      />
                      <Text
                        style={[
                          styles.historyOrderIdTagText,
                          copiedId === `hist_order_${item.order_id}` && { color: Colors.success },
                        ]}
                      >
                        {copiedId === `hist_order_${item.order_id}`
                          ? '¡Copiado!'
                          : `🧾 Pedido N.° #${String(item.order_id).replace(/^#+/, '')}`}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.historyDateText}>
                      {item.created_at ? item.created_at.replace('T', ' ').substring(0, 16) : 'Reciente'}
                    </Text>
                  </View>
                </View>

                <View style={styles.historyItemActions}>
                  <TouchableOpacity
                    style={styles.historyCopyBtn}
                    onPress={() => handleCopyText(clientMsg, item.order_id)}
                  >
                    <Ionicons
                      name={copiedId === item.order_id ? 'checkmark' : 'copy-outline'}
                      size={16}
                      color={copiedId === item.order_id ? Colors.success : Colors.primary}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.historyWaBtn}
                    onPress={() => handleShareWhatsApp(clientMsg)}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#10b981" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl * 2,
  },
  heroBanner: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroTitleCol: {
    flex: 1,
  },
  heroTitle: {
    color: '#fff',
    fontSize: FontSize.lg,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  portalBadgeText: {
    color: '#e0e7ff',
    fontSize: 11,
    fontWeight: '600',
  },

  // Tarjeta de Éxito
  successCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
    borderWidth: 1.5,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  successTitle: {
    color: Colors.success,
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  orderSummaryBox: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  summaryValue: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  summaryValueHighlight: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  summaryValueLink: {
    color: Colors.info,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  copyBoxTitle: {
    color: Colors.text,
    fontSize: FontSize.xs,
    fontWeight: '700',
    marginBottom: 4,
  },
  copyBox: {
    backgroundColor: '#050510',
    borderRadius: BorderRadius.md,
    borderColor: Colors.border,
    borderWidth: 1,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  copyBoxContent: {
    color: '#cbd5e1',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  copyBoxHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  copyBoxHintText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    gap: 6,
  },
  btnCopy: {
    backgroundColor: Colors.primary,
  },
  btnWhatsApp: {
    backgroundColor: '#10b981',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: '700',
  },

  // Formulario
  formCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderColor: Colors.border,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  creditsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.sm,
  },
  creditChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  creditChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  creditChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  creditChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BorderRadius.md,
    padding: Spacing.xs,
    gap: Spacing.md,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperDisplay: {
    alignItems: 'center',
    minWidth: 110,
  },
  stepperValue: {
    color: '#fff',
    fontSize: FontSize.xl,
    fontWeight: '800',
  },
  stepperLabel: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  orderIdRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: 4,
  },
  orderIdInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  orderIdInput: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  regenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderColor: Colors.primary,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    gap: 4,
  },
  regenerateBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  fieldHint: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  submitBtn: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    marginTop: Spacing.lg,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: FontSize.md,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Historial
  historySection: {
    marginTop: Spacing.sm,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  historyTitle: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    gap: 8,
  },
  emptyHistoryText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  historyItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orderIdBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  orderIdBadgeText: {
    color: Colors.primary,
    fontWeight: '800',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  historyItemMeta: {
    gap: 2,
  },
  creditsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  creditsStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyDateText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyCopyBtn: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    padding: 8,
    borderRadius: BorderRadius.sm,
  },
  historyWaBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    padding: 8,
    borderRadius: BorderRadius.sm,
  },

  // Botón Prominente "🧾 Pedido N.° #14748"
  orderNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  orderNumberBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#181836',
    borderColor: '#7c3aed',
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  orderNumberBtnCopied: {
    borderColor: Colors.success,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  orderNumberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  orderNumberText: {
    color: '#ffffff',
    fontSize: FontSize.sm,
    fontWeight: '800',
    flexShrink: 1,
  },
  orderNumberCopyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  orderNumberCopyTagActive: {
    backgroundColor: Colors.success,
  },
  orderNumberCopyTagText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
  },
  orderNumberWaBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Selector de pedidos recientes WooCommerce
  wooSelectorContainer: {
    marginBottom: Spacing.sm,
  },
  wooSelectorLabel: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  wooSelectorList: {
    gap: 8,
    paddingBottom: 2,
  },
  wooChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wooChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primaryLight,
  },
  wooChipText: {
    color: '#facc15',
    fontSize: 12,
    fontWeight: '700',
  },
  wooChipTextActive: {
    color: '#ffffff',
  },
  wooChipName: {
    color: Colors.textMuted,
    fontSize: 11,
    maxWidth: 80,
  },

  // Tag en items de historial
  historyOrderIdTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
    borderColor: 'rgba(250, 204, 21, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  historyOrderIdTagText: {
    color: '#facc15',
    fontSize: 10,
    fontWeight: '700',
  },
});
