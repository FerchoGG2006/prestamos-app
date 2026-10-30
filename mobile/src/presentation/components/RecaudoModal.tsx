import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { localStore } from '../../infrastructure/storage/local-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import {
  Landmark,
  X,
  Check,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertCircle,
  Clock,
  FileText,
  DollarSign,
  TrendingUp,
  User,
} from 'lucide-react-native';

export type RecaudoModalTab =
  | 'RETIRO'
  | 'INYECCION'
  | 'HISTORIAL_RECAUDO'
  | 'HISTORIAL_PAPELERIA';

interface RecaudoModalProps {
  visible: boolean;
  baseDisponible: number;
  todayStr: string;
  routeId?: string;
  authorizedBy?: string;
  initialTab?: RecaudoModalTab;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecaudoModal: React.FC<RecaudoModalProps> = ({
  visible,
  baseDisponible,
  todayStr,
  routeId,
  authorizedBy,
  initialTab = 'RETIRO',
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<RecaudoModalTab>(initialTab);

  // Estado Retiro de Recaudo
  const [amountStr, setAmountStr] = useState('');
  const [destination, setDestination] = useState('RETIRO_OFICINA');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estado Inyección de Capital
  const [injectAmountStr, setInjectAmountStr] = useState('');
  const [injectSource, setInjectSource] = useState('APORTE_DUENO');
  const [injectNotes, setInjectNotes] = useState('');
  const [increaseTargetAdmin, setIncreaseTargetAdmin] = useState(false);

  // Estado Retiro de Papelería
  const [paperworkWithdrawAmountStr, setPaperworkWithdrawAmountStr] = useState('');
  const [showPaperworkWithdrawForm, setShowPaperworkWithdrawForm] = useState(false);

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab || 'RETIRO');
      setAmountStr('');
      setNotes('');
      setInjectAmountStr('');
      setInjectNotes('');
      setShowPaperworkWithdrawForm(false);
    }
  }, [visible, initialTab]);

  const numericAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
  const isOverBase = numericAmount > baseDisponible;
  const remainingBase = Math.max(0, baseDisponible - numericAmount);

  const numericInject = parseInt(injectAmountStr.replace(/\D/g, ''), 10) || 0;
  const resultingBaseAfterInject = baseDisponible + numericInject;

  const quickWithdraws = [
    { label: '$100.000', value: 100000 },
    { label: '$200.000', value: 200000 },
    { label: '$500.000', value: 500000 },
    { label: 'Toda la Base', value: baseDisponible },
  ];

  const quickInjections = [
    { label: '$200.000', value: 200000 },
    { label: '$500.000', value: 500000 },
    { label: '$1.000.000', value: 1000000 },
    { label: '$2.000.000', value: 2000000 },
  ];

  const destinationOptions = [
    { key: 'RETIRO_OFICINA', label: 'Entrega a Oficina Central' },
    { key: 'UTILIDAD_DUENO', label: 'Retiro Utilidad / Dueño' },
    { key: 'CONSIGNACION', label: 'Consignación Bancaria / Nequi' },
    { key: 'FONDEO_OTRA_RUTA', label: 'Traslado a Otra Ruta' },
  ];

  const injectSourceOptions = [
    { key: 'APORTE_DUENO', label: 'Aporte de Capital / Dueño' },
    { key: 'FONDEO_JORNADA', label: 'Fondeo Inicial de Jornada' },
    { key: 'TRASLADO_RUTA', label: 'Traslado desde Otra Ruta' },
    { key: 'DEVOLUCION_EXCEDENTE', label: 'Devolución de Excedentes' },
  ];

  // Historiales en tiempo real
  const recaudoHistory = localStore.getRecaudoHistory(routeId);
  const paperworkHistory = localStore.getPaperworkHistory(routeId);

  const totalPaperworkGenerated = paperworkHistory
    .filter((p) => p.type !== 'RETIRO_PAPELERIA')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPaperworkWithdrawn = paperworkHistory
    .filter((p) => p.type === 'RETIRO_PAPELERIA')
    .reduce((sum, p) => sum + p.amount, 0);

  const paperworkAvailableBalance = Math.max(0, totalPaperworkGenerated - totalPaperworkWithdrawn);

  const formatItemDate = (dateStr: string) => {
    if (!dateStr) return 'Fecha no registrada';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const handleSaveRecaudo = async () => {
    if (numericAmount <= 0) {
      Alert.alert('Monto requerido', 'Ingrese un valor a recaudar mayor a $0 COP.');
      return;
    }

    if (isOverBase) {
      Alert.alert(
        'Base Insuficiente',
        `No puedes retirar más de lo que hay en la base disponible (${formatCOP(baseDisponible)}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedDest = destinationOptions.find((d) => d.key === destination)?.label || destination;
      const fullReason = notes.trim() ? `${selectedDest}: ${notes.trim()}` : selectedDest;

      await localStore.recordRecaudoWithdrawal({
        amount: numericAmount,
        destinationOrReason: fullReason,
        routeId,
        authorizedBy,
        todayStr,
      });

      Alert.alert(
        'Recaudo Registrado',
        `Se retiraron ${formatCOP(numericAmount)} de la base.\n\nNueva Base en Efectivo: ${formatCOP(remainingBase)}.`
      );
      setAmountStr('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error al registrar recaudo', e.message || 'No se pudo registrar el recaudo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCapitalInjection = async () => {
    if (numericInject <= 0) {
      Alert.alert('Monto requerido', 'Ingrese un monto de inyección de capital mayor a $0 COP.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedSrc = injectSourceOptions.find((s) => s.key === injectSource)?.label || injectSource;
      const fullReason = injectNotes.trim() ? `${selectedSrc}: ${injectNotes.trim()}` : selectedSrc;

      await localStore.recordCapitalInjection({
        amount: numericInject,
        sourceOrReason: fullReason,
        routeId,
        authorizedBy,
        todayStr,
        increaseTargetAdmin,
      });

      Alert.alert(
        'Inyección de Capital Exitosa',
        `Se inyectaron ${formatCOP(numericInject)} a la ruta.\n\n` +
          `• Nueva Base en Mano: ${formatCOP(resultingBaseAfterInject)}\n` +
          (increaseTargetAdmin ? '• Se aumentó el cupo administrativo de la ruta.' : '')
      );
      setInjectAmountStr('');
      setInjectNotes('');
      onSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Error al inyectar capital', e.message || 'No se pudo inyectar el capital.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePaperworkWithdrawal = async () => {
    const pAmount = parseInt(paperworkWithdrawAmountStr.replace(/\D/g, ''), 10) || 0;
    if (pAmount <= 0) {
      Alert.alert('Monto requerido', 'Ingrese un valor de retiro de papelería mayor a $0 COP.');
      return;
    }

    if (pAmount > paperworkAvailableBalance) {
      Alert.alert(
        'Saldo de Papelería Insuficiente',
        `El saldo acumulado de papelería disponible es ${formatCOP(paperworkAvailableBalance)}.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.recordPaperworkWithdrawal({
        amount: pAmount,
        destinationOrReason: 'Retiro de utilidad por papelería a oficina central',
        routeId,
        authorizedBy,
        todayStr,
      });

      Alert.alert(
        'Retiro de Papelería Registrado',
        `Se retiraron ${formatCOP(pAmount)} correspondientes al recaudo de papelería.`
      );
      setPaperworkWithdrawAmountStr('');
      setShowPaperworkWithdrawForm(false);
      onSuccess();
    } catch (e: any) {
      Alert.alert('Error al retirar papelería', e.message || 'No se pudo registrar el retiro de papelería.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.modalOverlay,
          {
            paddingTop: Math.max(insets.top, 16),
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={[styles.modalCard, { flexShrink: 1 }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.iconCircle}>
                <Landmark size={20} color={COLORS.primary} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Caja & Tesorería de Ruta</Text>
                <Text style={styles.modalSubtitle}>Recaudo, inyecciones de capital y papelería</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Menú de pestañas en una sola línea, sin emojis */}
          <View style={styles.tabBarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBarScroll}
            >
              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'RETIRO' && styles.tabItemActive]}
                onPress={() => setActiveTab('RETIRO')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'RETIRO' && styles.tabItemTextActive]}
                  numberOfLines={1}
                >
                  Retiro
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'INYECCION' && styles.tabItemActive]}
                onPress={() => setActiveTab('INYECCION')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'INYECCION' && styles.tabItemTextActive]}
                  numberOfLines={1}
                >
                  Inyección
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'HISTORIAL_RECAUDO' && styles.tabItemActive]}
                onPress={() => setActiveTab('HISTORIAL_RECAUDO')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'HISTORIAL_RECAUDO' && styles.tabItemTextActive]}
                  numberOfLines={1}
                >
                  Historial Recaudos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabItem, activeTab === 'HISTORIAL_PAPELERIA' && styles.tabItemActive]}
                onPress={() => setActiveTab('HISTORIAL_PAPELERIA')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.tabItemText, activeTab === 'HISTORIAL_PAPELERIA' && styles.tabItemTextActive]}
                  numberOfLines={1}
                >
                  Historial Papelería
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* PESTAÑA 1: RETIRO DE RECAUDO */}
            {activeTab === 'RETIRO' && (
              <View>
                <View style={styles.baseCard}>
                  <View style={styles.baseCardHeader}>
                    <Text style={styles.baseCardLabel}>BASE DISPONIBLE EN CAJA</Text>
                    <View style={styles.baseBadge}>
                      <Text style={styles.baseBadgeText}>Efectivo Líquido</Text>
                    </View>
                  </View>
                  <Text style={styles.baseCardAmount}>{formatCOP(baseDisponible)}</Text>
                  <Text style={styles.baseCardHelp}>
                    Efectivo en mano disponible para entrega a oficina o préstamos.
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>VALOR A RETIRAR</Text>
                  <View style={[styles.amountInputWrap, isOverBase && styles.amountInputError]}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      value={amountStr ? parseInt(amountStr.replace(/\D/g, ''), 10).toLocaleString('es-CO') : ''}
                      onChangeText={(val) => setAmountStr(val.replace(/\D/g, ''))}
                    />
                  </View>

                  <View style={styles.quickGrid}>
                    {quickWithdraws.map((q, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.quickBtn, numericAmount === q.value && styles.quickBtnActive]}
                        onPress={() => setAmountStr(String(q.value))}
                      >
                        <Text style={[styles.quickBtnText, numericAmount === q.value && styles.quickBtnTextActive]}>
                          {q.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {numericAmount > 0 && (
                    <View style={[styles.livePreviewCard, isOverBase && styles.livePreviewError]}>
                      {isOverBase ? (
                        <View style={styles.errorRow}>
                          <AlertCircle size={16} color="#dc2626" style={{ marginRight: 6 }} />
                          <Text style={styles.errorText}>
                            Supera la base disponible ({formatCOP(baseDisponible)}).
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.successRow}>
                          <ArrowDownCircle size={16} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={styles.successText}>
                            La base quedará en: <Text style={{ fontWeight: '800' }}>{formatCOP(remainingBase)}</Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>DESTINO DEL RECAUDO</Text>
                  <View style={styles.destList}>
                    {destinationOptions.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.destItem, destination === item.key && styles.destItemActive]}
                        onPress={() => setDestination(item.key)}
                      >
                        <Text style={[styles.destItemText, destination === item.key && styles.destItemTextActive]}>
                          {item.label}
                        </Text>
                        {destination === item.key && <Check size={16} color={COLORS.primary} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>OBSERVACIÓN O COMPROBANTE</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Detalles del retiro o referencia"
                    placeholderTextColor="#94a3b8"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (isSubmitting || isOverBase || numericAmount <= 0) && styles.submitBtnDisabled]}
                  onPress={handleSaveRecaudo}
                  disabled={isSubmitting || isOverBase || numericAmount <= 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {isSubmitting ? 'Registrando...' : 'Confirmar Retiro a Oficina'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* PESTAÑA 2: INYECCIÓN DE CAPITAL */}
            {activeTab === 'INYECCION' && (
              <View>
                <View style={[styles.baseCard, { borderColor: '#BFDBFE' }]}>
                  <View style={styles.baseCardHeader}>
                    <Text style={[styles.baseCardLabel, { color: COLORS.brandBlue }]}>ESTADO FINANCIERO DE LA RUTA</Text>
                    <View style={[styles.baseBadge, { backgroundColor: '#EFF6FF' }]}>
                      <Text style={[styles.baseBadgeText, { color: COLORS.brandBlue }]}>Inyección de Capital</Text>
                    </View>
                  </View>
                  <Text style={styles.baseCardAmount}>{formatCOP(baseDisponible)}</Text>
                  <Text style={styles.baseCardHelp}>
                    Ingresa dinero fresco a la ruta para fondear préstamos y solventar la operación.
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>MONTO A INYECTAR</Text>
                  <View style={styles.amountInputWrap}>
                    <Text style={styles.currencyPrefix}>$</Text>
                    <TextInput
                      style={styles.amountInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      value={injectAmountStr ? parseInt(injectAmountStr.replace(/\D/g, ''), 10).toLocaleString('es-CO') : ''}
                      onChangeText={(val) => setInjectAmountStr(val.replace(/\D/g, ''))}
                    />
                  </View>

                  <View style={styles.quickGrid}>
                    {quickInjections.map((q, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.quickBtn, numericInject === q.value && styles.quickBtnActive]}
                        onPress={() => setInjectAmountStr(String(q.value))}
                      >
                        <Text style={[styles.quickBtnText, numericInject === q.value && styles.quickBtnTextActive]}>
                          {q.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {numericInject > 0 && (
                    <View style={styles.livePreviewCard}>
                      <View style={styles.successRow}>
                        <ArrowUpCircle size={16} color="#059669" style={{ marginRight: 6 }} />
                        <Text style={styles.successText}>
                          La base aumentará a: <Text style={{ fontWeight: '800' }}>{formatCOP(resultingBaseAfterInject)}</Text>
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>ORIGEN / CONCEPTO DEL CAPITAL</Text>
                  <View style={styles.destList}>
                    {injectSourceOptions.map((item) => (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.destItem, injectSource === item.key && styles.destItemActive]}
                        onPress={() => setInjectSource(item.key)}
                      >
                        <Text style={[styles.destItemText, injectSource === item.key && styles.destItemTextActive]}>
                          {item.label}
                        </Text>
                        {injectSource === item.key && <Check size={16} color={COLORS.primary} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.switchLabel}>Aumentar Cupo Administrativo</Text>
                    <Text style={styles.switchHelp}>
                      Suma este capital al techo patrimonial permanente asignado a la ruta.
                    </Text>
                  </View>
                  <Switch
                    value={increaseTargetAdmin}
                    onValueChange={setIncreaseTargetAdmin}
                    trackColor={{ false: COLORS.bgTertiary, true: COLORS.brandBlue }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>OBSERVACIÓN O MOTIVO</Text>
                  <TextInput
                    style={styles.notesInput}
                    placeholder="Detalles de la inyección o recibo"
                    placeholderTextColor="#94a3b8"
                    value={injectNotes}
                    onChangeText={setInjectNotes}
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (isSubmitting || numericInject <= 0) && styles.submitBtnDisabled]}
                  onPress={handleSaveCapitalInjection}
                  disabled={isSubmitting || numericInject <= 0}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {isSubmitting ? 'Inyectando...' : 'Confirmar Inyección de Capital'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* PESTAÑA 3: HISTORIAL DE RECAUDOS (Todo lo que se saca con fecha) */}
            {activeTab === 'HISTORIAL_RECAUDO' && (
              <View>
                <View style={styles.historySummaryCard}>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>TOTAL MOVIMIENTOS</Text>
                    <Text style={styles.historySummaryValue}>{recaudoHistory.length} registros</Text>
                  </View>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>BASE ACTUAL</Text>
                    <Text style={[styles.historySummaryValue, { color: COLORS.primary }]}>
                      {formatCOP(baseDisponible)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.listSectionTitle}>HISTORIAL CON FECHA Y HORA</Text>

                {recaudoHistory.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Clock size={28} color={COLORS.textSecondary} />
                    <Text style={styles.emptyTitle}>Sin movimientos registrados</Text>
                    <Text style={styles.emptySub}>
                      Los retiros de recaudo e inyecciones de capital aparecerán aquí detallados.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.historyList}>
                    {recaudoHistory.map((item) => {
                      const isInjection = item.category === 'CAPITAL_INJECTION';
                      const isPaperwork = item.category === 'RETIRO_PAPELERIA';
                      return (
                        <View key={item.id} style={styles.historyCard}>
                          <View style={styles.historyCardHeader}>
                            <View style={styles.historyTypeRow}>
                              <View
                                style={[
                                  styles.historyIconCircle,
                                  isInjection
                                    ? styles.iconInjection
                                    : isPaperwork
                                    ? styles.iconPaperwork
                                    : styles.iconWithdraw,
                                ]}
                              >
                                {isInjection ? (
                                  <ArrowUpCircle size={16} color={COLORS.success} />
                                ) : (
                                  <ArrowDownCircle size={16} color={COLORS.danger} />
                                )}
                              </View>
                              <View>
                                <Text style={styles.historyTypeText}>
                                  {isInjection
                                    ? 'Inyección de Capital'
                                    : isPaperwork
                                    ? 'Retiro de Papelería'
                                    : 'Retiro de Recaudo'}
                                </Text>
                                <Text style={styles.historyDateText}>{formatItemDate(item.createdAt)}</Text>
                              </View>
                            </View>
                            <Text
                              style={[
                                styles.historyAmountText,
                                isInjection ? styles.amountPositive : styles.amountNegative,
                              ]}
                            >
                              {isInjection ? `+${formatCOP(item.amount)}` : `-${formatCOP(item.amount)}`}
                            </Text>
                          </View>

                          <Text style={styles.historyDescText}>{item.description}</Text>

                          <View style={styles.historyFooter}>
                            <View style={styles.historyMetaItem}>
                              <User size={12} color={COLORS.textSecondary} />
                              <Text style={styles.historyMetaText}>{item.collectorId || 'Administración'}</Text>
                            </View>
                            <Text style={styles.historyMetaText}>Ruta: {item.routeId}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* PESTAÑA 4: HISTORIAL DE PAPELERÍA (Con fecha) */}
            {activeTab === 'HISTORIAL_PAPELERIA' && (
              <View>
                <View style={[styles.historySummaryCard, { borderColor: '#E9D5FF' }]}>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>TOTAL COBRADO PAPELERÍA</Text>
                    <Text style={[styles.historySummaryValue, { color: '#7C3AED' }]}>
                      {formatCOP(totalPaperworkGenerated)}
                    </Text>
                  </View>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>RETIRADO A OFICINA</Text>
                    <Text style={[styles.historySummaryValue, { color: COLORS.danger }]}>
                      {formatCOP(totalPaperworkWithdrawn)}
                    </Text>
                  </View>
                </View>

                {/* Saldo disponible de papelería y botón para retirar */}
                <View style={styles.paperworkBalanceCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.paperworkBalanceLabel}>Saldo acumulado de papelería</Text>
                    <Text style={styles.paperworkBalanceAmount}>{formatCOP(paperworkAvailableBalance)}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.paperworkWithdrawBtn}
                    onPress={() => setShowPaperworkWithdrawForm(!showPaperworkWithdrawForm)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.paperworkWithdrawBtnText}>
                      {showPaperworkWithdrawForm ? 'Cancelar' : 'Retirar Papelería'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showPaperworkWithdrawForm && (
                  <View style={styles.paperworkWithdrawFormBox}>
                    <Text style={styles.inputLabel}>VALOR A RETIRAR DE PAPELERÍA</Text>
                    <View style={styles.amountInputWrap}>
                      <Text style={styles.currencyPrefix}>$</Text>
                      <TextInput
                        style={styles.amountInput}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#94a3b8"
                        value={paperworkWithdrawAmountStr ? parseInt(paperworkWithdrawAmountStr.replace(/\D/g, ''), 10).toLocaleString('es-CO') : ''}
                        onChangeText={(val) => setPaperworkWithdrawAmountStr(val.replace(/\D/g, ''))}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.submitBtn}
                      onPress={handleSavePaperworkWithdrawal}
                      disabled={isSubmitting}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.submitBtnText}>Confirmar Retiro de Papelería</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.listSectionTitle}>HISTORIAL DETALLADO CON FECHA</Text>

                {paperworkHistory.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <FileText size={28} color={COLORS.textSecondary} />
                    <Text style={styles.emptyTitle}>Sin registros de papelería</Text>
                    <Text style={styles.emptySub}>
                      La papelería deducida en créditos o renovaciones aparecerá aquí con su respectiva fecha.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.historyList}>
                    {paperworkHistory.map((item) => {
                      const isWithdraw = item.type === 'RETIRO_PAPELERIA';
                      return (
                        <View key={item.id} style={styles.historyCard}>
                          <View style={styles.historyCardHeader}>
                            <View style={styles.historyTypeRow}>
                              <View
                                style={[
                                  styles.historyIconCircle,
                                  isWithdraw ? styles.iconWithdraw : styles.iconPaperwork,
                                ]}
                              >
                                {isWithdraw ? (
                                  <ArrowDownCircle size={16} color={COLORS.danger} />
                                ) : (
                                  <FileText size={16} color="#7C3AED" />
                                )}
                              </View>
                              <View>
                                <Text style={styles.historyTypeText}>
                                  {isWithdraw
                                    ? 'Retiro a Oficina'
                                    : item.type === 'RENOVACION'
                                    ? 'Papelería en Renovación'
                                    : 'Papelería Crédito Nuevo'}
                                </Text>
                                <Text style={styles.historyDateText}>{formatItemDate(item.date)}</Text>
                              </View>
                            </View>
                            <Text
                              style={[
                                styles.historyAmountText,
                                isWithdraw ? styles.amountNegative : { color: '#7C3AED' },
                              ]}
                            >
                              {isWithdraw ? `-${formatCOP(item.amount)}` : `+${formatCOP(item.amount)}`}
                            </Text>
                          </View>

                          {!isWithdraw && item.customerName && (
                            <View style={styles.paperworkCustomerRow}>
                              <Text style={styles.paperworkCustomerText}>
                                {item.customerName} • {item.loanNumber || ''}
                              </Text>
                            </View>
                          )}

                          {item.notes && <Text style={styles.historyDescText}>{item.notes}</Text>}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgTertiary,
    marginTop: 8,
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
  },
  tabItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: COLORS.primary,
  },
  tabItemText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  tabItemTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  body: {
    paddingTop: 12,
  },
  baseCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 14,
  },
  baseCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  baseCardLabel: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  baseBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  baseBadgeText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.success,
  },
  baseCardAmount: {
    fontSize: 22,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginVertical: 4,
  },
  baseCardHelp: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 12,
    height: 46,
  },
  amountInputError: {
    borderColor: COLORS.danger,
  },
  currencyPrefix: {
    fontSize: 18,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
    padding: 0,
  },
  quickGrid: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 7,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  quickBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  quickBtnText: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  quickBtnTextActive: {
    color: '#FFFFFF',
  },
  livePreviewCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
  },
  livePreviewError: {
    backgroundColor: '#FEF2F2',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.danger,
    flex: 1,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.success,
  },
  destList: {
    gap: 6,
  },
  destItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  destItemActive: {
    backgroundColor: '#EFF6FF',
    borderColor: COLORS.primary,
  },
  destItemText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  destItemTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  switchLabel: {
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  switchHelp: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    padding: 10,
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    minHeight: 52,
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
  },
  historySummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 12,
  },
  historySummaryCol: {
    flex: 1,
  },
  historySummaryLabel: {
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  historySummaryValue: {
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  paperworkBalanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    marginBottom: 12,
  },
  paperworkBalanceLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    color: '#6B21A8',
  },
  paperworkBalanceAmount: {
    fontSize: 18,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: '#7C3AED',
  },
  paperworkWithdrawBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  paperworkWithdrawBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
  },
  paperworkWithdrawFormBox: {
    backgroundColor: '#FAF5FF',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  listSectionTitle: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    gap: 6,
    marginVertical: 10,
  },
  emptyTitle: {
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  historyList: {
    gap: 8,
    paddingBottom: 20,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    padding: 12,
    gap: 6,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  historyTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWithdraw: {
    backgroundColor: '#FEF2F2',
  },
  iconInjection: {
    backgroundColor: '#F0FDF4',
  },
  iconPaperwork: {
    backgroundColor: '#FAF5FF',
  },
  historyTypeText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  historyDateText: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
  },
  historyAmountText: {
    fontSize: 13.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
  },
  amountNegative: {
    color: COLORS.danger,
  },
  amountPositive: {
    color: COLORS.success,
  },
  historyDescText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: '#334155',
    lineHeight: 16,
  },
  paperworkCustomerRow: {
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  paperworkCustomerText: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  historyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.bgTertiary,
  },
  historyMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyMetaText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
  },
});
