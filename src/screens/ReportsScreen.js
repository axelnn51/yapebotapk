import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { api, isConfigured } from '../services/api';

const { width } = Dimensions.get('window');
const BAR_MAX = width - 200;

export default function ReportsScreen() {
  const [weekly, setWeekly] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState('week'); // 'week' or 'month'

  const fetch_ = useCallback(async (isBackground = false) => {
    try {
      if (!(await isConfigured())) { setError('Configura el servidor'); if (!isBackground) setLoading(false); return; }
      setError(null);
      const [w, d, m] = await Promise.all([
        api.getWeeklyReport(),
        api.getDailyReport(),
        api.getMonthlyReport().catch(() => null),
      ]);
      setWeekly(w.data); setToday(d.data);
      if (m && m.data) setMonthly(m.data);
    } catch (e) { setError(e.message); }
    finally { if (!isBackground) setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetch_(weekly !== null); }, [fetch_, weekly]));

  if (loading && !refreshing) return <View style={s.ctr}><ActivityIndicator size="large" color={Colors.primary} /></View>;
  if (error) return (
    <View style={s.ctr}>
      <Ionicons name="cloud-offline" size={64} color={Colors.danger} />
      <Text style={s.errTxt}>{error}</Text>
      <TouchableOpacity style={s.retry} onPress={() => { setLoading(true); fetch_(); }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const activeData = period === 'month' && monthly ? monthly : weekly;
  const days = activeData?.days || [];
  const totals = activeData?.totals || {};
  const mx = Math.max(...days.map(d => d.total_amount), 1);
  const periodLabel = period === 'month' ? '30 días' : '7 días';
  const avgDivisor = period === 'month' ? 30 : 7;

  const fmtDay = (ds) => {
    try {
      const p = ds.split('-');
      const d = new Date(p[0], p[1]-1, p[2]);
      if (period === 'month') {
        return `${p[2]}/${p[1]}`;
      }
      return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];
    } catch { return ds; }
  };

  return (
    <ScrollView style={s.c} contentContainerStyle={s.cc}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch_(); }} tintColor={Colors.primary} colors={[Colors.primary]} progressBackgroundColor={Colors.bgCard} />}>

      {/* Period Toggle */}
      <View style={s.toggleRow}>
        <TouchableOpacity
          style={[s.toggleBtn, period === 'week' && s.toggleActive]}
          onPress={() => setPeriod('week')}
        >
          <Text style={[s.toggleTxt, period === 'week' && s.toggleTxtActive]}>Semanal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.toggleBtn, period === 'month' && s.toggleActive]}
          onPress={() => setPeriod('month')}
        >
          <Text style={[s.toggleTxt, period === 'month' && s.toggleTxtActive]}>Mensual</Text>
        </TouchableOpacity>
      </View>

      <LinearGradient colors={Colors.gradientPrimary} style={s.hero} start={{x:0,y:0}} end={{x:1,y:1}}>
        <Text style={s.heroLbl}>📊 Hoy ({today?.date || '-'})</Text>
        <View style={s.heroRow}>
          <View style={s.heroCol}><Text style={s.heroAmt}>S/ {(today?.total_amount||0).toFixed(2)}</Text><Text style={s.heroSub}>Recaudado</Text></View>
          <View style={s.heroDiv} />
          <View style={s.heroCol}><Text style={s.heroAmt}>{today?.order_count||0}</Text><Text style={s.heroSub}>Pedidos</Text></View>
        </View>
      </LinearGradient>

      <View style={s.totalsRow}>
        {[{i:'cash',l:periodLabel,v:`S/ ${(totals.total_amount||0).toFixed(0)}`,c:Colors.success},
          {i:'cube',l:'Pedidos',v:`${totals.total_orders||0}`,c:Colors.info},
          {i:'trending-up',l:'Promedio',v:`S/ ${days.length?((totals.total_amount||0)/avgDivisor).toFixed(0):'0'}`,c:Colors.primaryLight}
        ].map((t,i)=>(
          <View key={i} style={s.totalBox}>
            <Ionicons name={t.i} size={18} color={t.c} />
            <Text style={s.totalLbl}>{t.l}</Text>
            <Text style={s.totalVal}>{t.v}</Text>
          </View>
        ))}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Últimos {periodLabel}</Text>
        {days.slice().reverse().slice(0, period === 'month' ? 15 : 7).map((d) => {
          const bw = mx > 0 ? (d.total_amount / mx) * BAR_MAX : 0;
          const isT = d.date === today?.date;
          return (
            <View key={d.date} style={s.barRow}>
              <Text style={[s.barDay, isT && {color: Colors.primaryLight}]}>{fmtDay(d.date)}</Text>
              <View style={s.barTrack}>
                <LinearGradient colors={isT ? Colors.gradientPrimary : [Colors.primary+'60', Colors.primary+'30']}
                  start={{x:0,y:0}} end={{x:1,y:0}} style={[s.barFill, {width: Math.max(bw,4)}]} />
              </View>
              <Text style={s.barAmt}>S/ {d.total_amount.toFixed(0)}</Text>
            </View>
          );
        })}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Detalle</Text>
        {days.map(d => (
          <View key={d.date} style={s.detRow}>
            <View><Text style={s.detDate}>{d.date}</Text><Text style={s.detOrd}>{d.order_count} pedido{d.order_count!==1?'s':''}</Text></View>
            <Text style={s.detAmt}>S/ {d.total_amount.toFixed(2)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: {flex:1, backgroundColor:Colors.bg}, cc: {padding:Spacing.md, paddingBottom:Spacing.xxl},
  ctr: {flex:1, backgroundColor:Colors.bg, justifyContent:'center', alignItems:'center', padding:Spacing.xl},
  errTxt: {color:Colors.textSecondary, fontSize:FontSize.md, textAlign:'center', marginTop:Spacing.md},
  retry: {marginTop:Spacing.lg, backgroundColor:Colors.primary, paddingHorizontal:Spacing.xl, paddingVertical:Spacing.md, borderRadius:BorderRadius.md},

  toggleRow: {
    flexDirection:'row', backgroundColor:Colors.bgCard, borderRadius:BorderRadius.md,
    padding:3, marginBottom:Spacing.lg, borderWidth:1, borderColor:Colors.border,
  },
  toggleBtn: {
    flex:1, paddingVertical:Spacing.sm, alignItems:'center', borderRadius:BorderRadius.sm,
  },
  toggleActive: {
    backgroundColor:Colors.primary,
  },
  toggleTxt: { color:Colors.textMuted, fontSize:FontSize.sm, fontWeight:'600' },
  toggleTxtActive: { color:'#fff' },

  hero: {borderRadius:BorderRadius.xl, padding:Spacing.lg, marginBottom:Spacing.lg},
  heroLbl: {color:'rgba(255,255,255,0.8)', fontSize:FontSize.md, fontWeight:'500', marginBottom:Spacing.md},
  heroRow: {flexDirection:'row', alignItems:'center'},
  heroCol: {flex:1, alignItems:'center'},
  heroDiv: {width:1, height:40, backgroundColor:'rgba(255,255,255,0.2)'},
  heroAmt: {color:'#fff', fontSize:FontSize.xxl, fontWeight:'800'},
  heroSub: {color:'rgba(255,255,255,0.7)', fontSize:FontSize.sm, marginTop:2},

  totalsRow: {flexDirection:'row', gap:Spacing.sm, marginBottom:Spacing.lg},
  totalBox: {flex:1, backgroundColor:Colors.bgCard, borderRadius:BorderRadius.lg, padding:Spacing.md, alignItems:'center', gap:Spacing.xs, borderWidth:1, borderColor:Colors.border},
  totalLbl: {color:Colors.textSecondary, fontSize:FontSize.xs},
  totalVal: {color:Colors.text, fontSize:FontSize.lg, fontWeight:'800'},

  card: {backgroundColor:Colors.bgCard, borderRadius:BorderRadius.lg, padding:Spacing.md, marginBottom:Spacing.md, borderWidth:1, borderColor:Colors.border},
  cardTitle: {color:Colors.text, fontSize:FontSize.md, fontWeight:'700', marginBottom:Spacing.md},

  barRow: {flexDirection:'row', alignItems:'center', marginBottom:Spacing.sm+2},
  barDay: {color:Colors.textSecondary, fontSize:FontSize.sm, fontWeight:'600', width:42},
  barTrack: {flex:1, height:20, backgroundColor:Colors.bgCardLight, borderRadius:BorderRadius.sm, overflow:'hidden', marginHorizontal:Spacing.sm},
  barFill: {height:'100%', borderRadius:BorderRadius.sm},
  barAmt: {color:Colors.textSecondary, fontSize:FontSize.sm, fontWeight:'600', width:55, textAlign:'right'},

  detRow: {flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:Spacing.sm, borderBottomWidth:1, borderBottomColor:Colors.border},
  detDate: {color:Colors.text, fontSize:FontSize.md},
  detOrd: {color:Colors.textMuted, fontSize:FontSize.sm},
  detAmt: {color:Colors.primaryLight, fontSize:FontSize.lg, fontWeight:'700'},
});
