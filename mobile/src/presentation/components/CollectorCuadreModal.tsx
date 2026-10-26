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
  Share,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import {
  CollectionSession,
  Payment,
  DailyRouteMetrics,
  DailySettlement,
} from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import {
  X,
  CheckCircle,
  ShieldCheck,
  Check,
  MessageCircle,
  Copy,
  Landmark,
  Fuel,
  TrendingDown,
  Lock,
} from 'lucide-react-native';

interface CollectorCuadreModalProps {
  visible: boolean;
  session: CollectionSession | null;
  payments: Payment[];
  metrics: DailyRouteMetrics;
  todayStr: string;
  routeId?: string;
  collectorId?: string;
  onClose: () => void;
  onSuccess: () => void;
  onOpenRecaudo?: () => void;
}

export const CollectorCuadreModal: React.FC<CollectorCuadreModalProps> = ({
  visible,
  session,
  payments,
  metrics,
  todayStr,
  routeId,
  collectorId,
  onClose,
  onSuccess,
  onOpenRecaudo,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settledRecord, setSettledRecord] = useState<DailySettlement | null>(null);
  const [copied, setCopied] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');

  const collectedCash = metrics.collectedCashToday;
  const collectedDigital = metrics.collectedDigitalToday;
  const totalCollected = metrics.collectedToday;
  const expensesToday = metrics.expensesToday || 0;
  const disbursedToday = metrics.disbursedToday || 0;
  const recaudoRetiradoToday = metrics.recaudoRetiradoToday || 0;

  // REGLA FUNDAMENTAL DE NEGOCIO:
  // El arqueo físico de efectivo es INCAMBIABLE y AUTOMÁTICO.
  // El cobrador no puede alterar ni corregir este valor.
  // Todo cuadra matemáticamente con los movimientos reales de la jornada:
  // (+) Cobrado en Efectivo Hoy
  // (-) Gastos Operativos de Ruta
  // (-) Salidas / Préstamos Desembolsados en Efectivo en Calle
  // (-) Avances / Retiros entregados a Oficina
  // (=) Efectivo Físico Obligatorio a Rendir a la Oficina
  const netCashExpected = Math.max(
    0,
    collectedCash - expensesToday - disbursedToday - recaudoRetiradoToday
  );
  const cashHandedOver = netCashExpected;
  const cashDifference = 0;

  useEffect(() => {
    if (visible) {
      setSettledRecord(null);
      setCopied(false);
      const conf = localStore.getOfficeConfig();
      setTargetPhone(conf.supportPhone || '');
    }
  }, [visible]);

  if (!session) return null;

  const verificationHash = `CUADRE-${todayStr.replace(/-/g, '')}-${payments.length}P-${Math.round(
    totalCollected / 1000
  )}K`;

  const handleCloseCuadre = async () => {
    setIsSubmitting(true);
    try {
      const settlement = await localStore.closeDailySettlement({
        cashHandedOver,
        differenceJustification: undefined,
        routeId,
        collectorId,
      });

      // Métrica cerrada y sellada con éxito.
      // Se muestra inmediatamente el comprobante oficial con el botón para enviarlo a la oficina.
      setSettledRecord(settlement);
      onSuccess();
    } catch (error: any) {
      Alert.alert('Error al cerrar cuadre', error.message || 'No se pudo registrar la liquidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateReportText = (st?: DailySettlement | null): string => {
    const officeConfig = localStore.getOfficeConfig();
    const companyName = officeConfig.companyName || 'Cartera & Préstamos';
    const collectorName = st?.collectorId || session?.collectorId || 'Cobrador de Ruta';
    const routeId = st?.routeId || session?.routeId || 'Ruta Principal';
    const reportDate = st?.date || session?.date || todayStr;
    const isSealed = Boolean(st);

    const actualCol = st ? st.actualCollection : totalCollected;
    const cashCol = st ? st.collectedCash : collectedCash;
    const digCol = st ? st.collectedTransfers : collectedDigital;
    const salidas = st ? st.salidasCount : metrics.salidasCount;
    const netDisbursed = st ? st.actualCashDisbursedTotal : disbursedToday;
    const handedOver = st ? st.cashHandedOver : cashHandedOver;
    const diff = st ? st.cashDifference : cashDifference;
    const diffJust = st?.differenceJustification;

    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🏢 *${companyName.toUpperCase()}*`,
      `📊 *CUADRE OFICIAL DE RUTA*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `${isSealed ? '🔒 *ESTADO: CUADRE CERRADO Y SELLADO*' : '⚠️ *ESTADO: BORRADOR EN RUTA*'}`,
      st ? `🔖 *Folio Liquidación:* #${st.id.toUpperCase()}` : '',
      `📅 *Fecha de Cobro:* ${reportDate}`,
      `👤 *Cobrador:* ${collectorName} • *Ruta:* ${routeId}`,
      st
        ? `⏰ *Hora de Cierre:* ${new Date(st.settledAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`
        : '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '📥 *1. COBRADO HOY*',
      `• *Total Cobrado:* ${formatCOP(actualCol)}`,
      `  - Efectivo en mano: ${formatCOP(cashCol)}`,
      `  - Digital (Nequi / Bancos): ${formatCOP(digCol)}`,
      `• *Clientes Visitados:* ${metrics.visitedCustomersCount} de ${metrics.expectedCustomersCount} (${metrics.progressPercentage}%)`,
      '',
      '📤 *2. SALIDAS / PRÉSTAMOS ENTREGADOS*',
      `• *Operaciones:* ${salidas} crédito(s)`,
      `• *Desembolso Neto en Calle:* ${formatCOP(netDisbursed)}`,
      '',
      `⛽ *3. GASTOS DE RUTA DEDUCIDOS:* ${formatCOP(expensesToday)}`,
      recaudoRetiradoToday > 0
        ? `🏦 *AVANCES ENTREGADOS A OFICINA:* ${formatCOP(recaudoRetiradoToday)}`
        : '',
      '',
      '💵 *4. RENDICIÓN DE EFECTIVO A OFICINA*',
      `• Efectivo Neto Esperado: ${formatCOP(netCashExpected)}`,
      `• Efectivo Entregado Físicamente: ${formatCOP(handedOver)}`,
      `• Diferencia Arqueo: ${diff === 0 ? '✓ Exacto ($0)' : formatCOP(diff)}`,
    ];

    if (diffJust) {
      lines.push(`• Observación / Nómina: ${diffJust}`);
    }

    lines.push(
      '',
      '⚠️ *5. ESTADO DE MORA*',
      `• Clientes en mora: ${metrics.overdueCustomersCount}`,
      `• Saldo vencido acumulado: ${formatCOP(metrics.overdueTotalAmount)}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🔐 *Sello de Verificación:* ${verificationHash}`,
      `_Enviado desde App del Cobrador_`
    );

    return lines.filter((l) => l !== '').join('\n');
  };

  const handleCopyReport = async (st?: DailySettlement | null) => {
    const text = generateReportText(st);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Share.share({
          title: `Cuadre ${st?.date || todayStr}`,
          message: text,
        });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      Alert.alert('¡Copiado!', 'El reporte de cuadre fue copiado al portapapeles.');
    } catch {
      Alert.alert('Reporte de Cuadre', text);
    }
  };

  const handleSendWhatsApp = (st?: DailySettlement | null) => {
    const text = generateReportText(st);
    let phone = (targetPhone || localStore.getOfficeConfig().supportPhone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = `57${phone}`;

    if (!phone) {
      Share.share({
        title: `Cuadre ${st?.date || todayStr}`,
        message: text,
      }).catch(() => {
        Alert.alert('Cuadre Oficial', text);
      });
      return;
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(waUrl).catch(() => {
      Share.share({
        title: `Cuadre ${st?.date || todayStr}`,
        message: text,
      }).catch(() => {
        Alert.alert('Cuadre Oficial', text);
      });
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          <View style={styles.sheetHandle} />

          {/* Header del Cobrador */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {settledRecord ? 'Comprobante de Cuadre' : 'Mi Cuadre del Día'}
              </Text>
              <Text style={styles.subtitle}>
                {settledRecord
                  ? `Jornada ${settledRecord.date} • Folio #${settledRecord.id.toUpperCase()}`
                  : `Ruta ${session.routeId} • Cobro ${session.date}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {settledRecord ? (
              /* FASE 2: POST-CIERRE (Comprobante Sellado y Envío Oficial a Oficina) */
              <View style={styles.postCloseContainer}>
                {/* 1. Sello de Éxito */}
                <View style={styles.postCloseSuccessCard}>
                  <View style={styles.postCloseBadgeIcon}>
                    <CheckCircle size={36} color="#16A34A" />
                  </View>
                  <Text style={styles.postCloseTitle}>¡Cuadre Cerrado y Sellado!</Text>
                  <Text style={styles.postCloseSubtitle}>
                    Tu métrica del día {settledRecord.date} fue congelada y registrada con éxito. La ruta se renovó para la siguiente jornada.
                  </Text>
                  <View style={styles.folioBadgeRow}>
                    <View style={styles.folioBadge}>
                      <Text style={styles.folioBadgeText}>FOLIO: #{settledRecord.id.toUpperCase()}</Text>
                    </View>
                    <View style={styles.sealedStatusBadge}>
                      <ShieldCheck size={12} color="#15803D" style={{ marginRight: 4 }} />
                      <Text style={styles.sealedStatusText}>LIQUIDADO</Text>
                    </View>
                  </View>
                </View>

                {/* 2. Comprobante Oficial */}
                <View style={styles.sealedReceiptCard}>
                  <Text style={styles.receiptHeaderCompany}>
                    {localStore.getOfficeConfig().companyName || 'CARTERA & PRÉSTAMOS'}
                  </Text>
                  <Text style={styles.receiptSubHeader}>COMPROBANTE OFICIAL DE CUADRE DE RUTA</Text>
                  <View style={styles.receiptDashedDivider} />

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Fecha Liquidada:</Text>
                    <Text style={styles.receiptValueBold}>{settledRecord.date}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Cobrador / Ruta:</Text>
                    <Text style={styles.receiptValue}>
                      {settledRecord.collectorId} • {settledRecord.routeId}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Hora de Cierre:</Text>
                    <Text style={styles.receiptValue}>
                      {new Date(settledRecord.settledAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </Text>
                  </View>

                  <View style={styles.receiptDashedDivider} />

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Total Cobrado (Pleno):</Text>
                    <Text style={[styles.receiptValueBold, { color: COLORS.success, fontSize: 15 }]}>
                      {formatCOP(settledRecord.actualCollection)}
                    </Text>
                  </View>
                  <View style={[styles.receiptRow, { paddingLeft: 8 }]}>
                    <Text style={styles.receiptLabelSub}>• Efectivo:</Text>
                    <Text style={styles.receiptValueSub}>{formatCOP(settledRecord.collectedCash)}</Text>
                  </View>
                  <View style={[styles.receiptRow, { paddingLeft: 8 }]}>
                    <Text style={styles.receiptLabelSub}>• Digital (Nequi/Transf):</Text>
                    <Text style={styles.receiptValueSub}>{formatCOP(settledRecord.collectedTransfers)}</Text>
                  </View>

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>(-) Gastos Ruta Deducidos:</Text>
                    <Text style={[styles.receiptValueBold, { color: '#ea580c' }]}>
                      {formatCOP(expensesToday)}
                    </Text>
                  </View>

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>(=) Efectivo Entregado a Oficina:</Text>
                    <Text style={[styles.receiptValueBold, { color: COLORS.primary, fontSize: 15 }]}>
                      {formatCOP(settledRecord.cashHandedOver)}
                    </Text>
                  </View>

                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Diferencia Arqueo:</Text>
                    <Text
                      style={[
                        styles.receiptValueBold,
                        {
                          color: settledRecord.cashDifference === 0 ? COLORS.success : COLORS.danger,
                        },
                      ]}
                    >
                      {settledRecord.cashDifference === 0
                        ? '✓ Exacto ($0)'
                        : formatCOP(settledRecord.cashDifference)}
                    </Text>
                  </View>

                  {settledRecord.differenceJustification ? (
                    <View style={styles.receiptJustificationBox}>
                      <Text style={styles.receiptJustificationLabel}>OBSERVACIÓN / NÓMINA:</Text>
                      <Text style={styles.receiptJustificationText}>
                        {settledRecord.differenceJustification}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.receiptDashedDivider} />
                  <View style={styles.verificationHashBox}>
                    <ShieldCheck size={12} color={COLORS.success} style={{ marginRight: 5 }} />
                    <Text style={styles.verificationHashText}>Sello: {verificationHash}</Text>
                  </View>
                </View>

                {/* 3. Teléfono de Destino para WhatsApp */}
                <View style={styles.phoneInputCard}>
                  <View style={styles.phoneHeaderRow}>
                    <MessageCircle size={14} color="#16a34a" />
                    <Text style={styles.phoneLabel}>TELÉFONO WHATSAPP DE LA OFICINA / PATRÓN</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={targetPhone}
                    onChangeText={setTargetPhone}
                    placeholder="Ej: 3001234567 o 573001234567"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>

                {/* 4. BOTÓN PRINCIPAL DESTACADO: ENVIAR A LA OFICINA */}
                <TouchableOpacity
                  style={styles.sendWhatsAppMainBtn}
                  onPress={() => handleSendWhatsApp(settledRecord)}
                  activeOpacity={0.85}
                >
                  <MessageCircle size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sendWhatsAppMainBtnText}>
                    📲 Enviar Cuadre a la Oficina (WhatsApp)
                  </Text>
                </TouchableOpacity>

                {/* 5. Acción Secundaria: Copiar */}
                <TouchableOpacity
                  style={styles.secondaryCopyBtn}
                  onPress={() => handleCopyReport(settledRecord)}
                  activeOpacity={0.7}
                >
                  {copied ? (
                    <Check size={14} color="#16a34a" style={{ marginRight: 5 }} />
                  ) : (
                    <Copy size={14} color={COLORS.textSecondary} style={{ marginRight: 5 }} />
                  )}
                  <Text
                    style={[
                      styles.secondaryCopyText,
                      copied && { color: '#16a34a', fontWeight: 'bold' },
                    ]}
                  >
                    {copied ? '¡Copiado!' : 'Copiar Texto para WhatsApp'}
                  </Text>
                </TouchableOpacity>

                {/* 6. Botón de Salida: Pasar a la Nueva Ruta */}
                <TouchableOpacity
                  style={styles.finishAndContinueBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Check size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.finishAndContinueBtnText}>
                    ✓ Finalizar e Ir a la Nueva Jornada
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* FASE 1: PRE-CIERRE (Arqueo y Cierre Operativo del Cobrador) */
              <View>
                {/* 1. Tarjetas Bento de Rendición de Ruta */}
                <View style={styles.splitRow}>
                  <View style={styles.splitCard}>
                    <Text style={styles.splitLabel}>💵 COBRADO EFECTIVO</Text>
                    <Text
                      style={[styles.splitValue, { color: COLORS.success }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCOP(collectedCash)}
                    </Text>
                    <Text style={styles.splitSub}>Cobrado hoy en mano</Text>
                  </View>

                  <View
                    style={[
                      styles.splitCard,
                      { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
                    ]}
                  >
                    <Text style={[styles.splitLabel, { color: '#c2410c' }]}>
                      ⛽ (-) GASTOS RUTA
                    </Text>
                    <Text
                      style={[styles.splitValue, { color: '#ea580c' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCOP(expensesToday)}
                    </Text>
                    <Text style={[styles.splitSub, { color: '#9a3412' }]}>
                      Gasolina, pinchazo, datos
                    </Text>
                  </View>
                </View>

                {/* Cobrado Digital Info */}
                {collectedDigital > 0 && (
                  <View style={styles.digitalCard}>
                    <Text style={styles.digitalLabel}>📲 COBRADO DIGITAL (NEQUI / BANCOS)</Text>
                    <Text style={styles.digitalValue}>{formatCOP(collectedDigital)}</Text>
                    <Text style={styles.digitalSub}>Ya ingresó a la cuenta, no se rinde en efectivo físico</Text>
                  </View>
                )}

                {/* Salidas de Efectivo en Ruta */}
                {disbursedToday > 0 && (
                  <View style={styles.disbursedCard}>
                    <Text style={styles.disbursedLabel}>📤 (-) SALIDAS ENTREGADAS EN PRÉSTAMOS</Text>
                    <Text style={styles.disbursedValue}>{formatCOP(disbursedToday)}</Text>
                    <Text style={styles.disbursedSub}>Dinero prestado en efectivo a clientes hoy</Text>
                  </View>
                )}

                {/* Avances / Retiros entregados a Oficina */}
                {recaudoRetiradoToday > 0 && (
                  <View style={styles.disbursedCard}>
                    <Text style={styles.disbursedLabel}>🏦 (-) AVANCES ENTREGADOS A OFICINA</Text>
                    <Text style={styles.disbursedValue}>{formatCOP(recaudoRetiradoToday)}</Text>
                    <Text style={styles.disbursedSub}>Efectivo ya adelantado o retirado a oficina hoy</Text>
                  </View>
                )}

                {onOpenRecaudo && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#eff6ff',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      borderRadius: 14,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      marginBottom: 10,
                    }}
                    onPress={() => {
                      onClose();
                      onOpenRecaudo();
                    }}
                  >
                    <Landmark size={15} color="#1d4ed8" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#1d4ed8' }}>
                      🏦 Registrar Avance / Retiro a Oficina
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Total Neto a Rendir Físicamente */}
                <View style={styles.netCard}>
                  <Text style={styles.netLabel}>
                    💰 (=) EFECTIVO NETO A ENTREGAR A OFICINA
                  </Text>
                  <Text
                    style={styles.netValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCOP(netCashExpected)}
                  </Text>
                  <Text style={styles.netSub}>
                    Monto que debes entregar físicamente al patrón o cajero
                  </Text>
                </View>

                {/* 2. Arqueo Físico de Efectivo Inmutable (Fórmula Matemática Cerrada) */}
                <View style={styles.immutableFormulaCard}>
                  <View style={styles.formulaHeaderRow}>
                    <Lock size={15} color={COLORS.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.formulaHeaderTitle}>
                      ARQUEO FÍSICO DE EFECTIVO (FÓRMULA AUTOMÁTICA)
                    </Text>
                  </View>
                  <Text style={styles.formulaHeaderSub}>
                    Fórmula matemática incambiable. El cobrador no puede modificar este cálculo; todo cuadra estrictamente con lo cobrado, gastos y salidas registradas.
                  </Text>

                  <View style={styles.formulaBreakdown}>
                    <View style={styles.formulaRow}>
                      <View style={styles.formulaConceptRow}>
                        <CheckCircle size={14} color={COLORS.success} style={{ marginRight: 6 }} />
                        <Text style={styles.formulaConceptText}>Cobrado en Efectivo Hoy</Text>
                      </View>
                      <Text style={[styles.formulaAmountText, { color: COLORS.success }]}>
                        +{formatCOP(collectedCash)}
                      </Text>
                    </View>

                    <View style={styles.formulaRow}>
                      <View style={styles.formulaConceptRow}>
                        <Fuel size={14} color="#ea580c" style={{ marginRight: 6 }} />
                        <Text style={styles.formulaConceptText}>(-) Gastos de Ruta Registrados</Text>
                      </View>
                      <Text style={[styles.formulaAmountText, { color: '#ea580c' }]}>
                        -{formatCOP(expensesToday)}
                      </Text>
                    </View>

                    {disbursedToday > 0 && (
                      <View style={styles.formulaRow}>
                        <View style={styles.formulaConceptRow}>
                          <TrendingDown size={14} color="#86198f" style={{ marginRight: 6 }} />
                          <Text style={styles.formulaConceptText}>(-) Salidas / Desembolsos en Efectivo</Text>
                        </View>
                        <Text style={[styles.formulaAmountText, { color: '#86198f' }]}>
                          -{formatCOP(disbursedToday)}
                        </Text>
                      </View>
                    )}

                    {recaudoRetiradoToday > 0 && (
                      <View style={styles.formulaRow}>
                        <View style={styles.formulaConceptRow}>
                          <Landmark size={14} color="#1d4ed8" style={{ marginRight: 6 }} />
                          <Text style={styles.formulaConceptText}>(-) Avances Entregados a Oficina</Text>
                        </View>
                        <Text style={[styles.formulaAmountText, { color: '#1d4ed8' }]}>
                          -{formatCOP(recaudoRetiradoToday)}
                        </Text>
                      </View>
                    )}

                    <View style={styles.formulaDivider} />

                    <View style={styles.formulaTotalRow}>
                      <View>
                        <Text style={styles.formulaTotalLabel}>EFECTIVO FÍSICO A ENTREGAR</Text>
                        <Text style={styles.formulaTotalSub}>Monto exacto a rendir en oficina</Text>
                      </View>
                      <Text style={styles.formulaTotalValue}>
                        {formatCOP(cashHandedOver)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.exactFormulaBadge}>
                    <CheckCircle size={15} color={COLORS.success} style={{ marginRight: 6 }} />
                    <Text style={styles.exactFormulaText}>
                      ✓ Cuadre Automático Exacto ($0 Descuadre)
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer del Cobrador: Cerrar Cuadre */}
          {!settledRecord && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
                onPress={handleCloseCuadre}
                disabled={isSubmitting}
              >
                <Landmark size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.confirmBtnText}>
                  {isSubmitting ? 'Cerrando y Sellando Métrica...' : 'Cerrar Cuadre y Sellar Jornada'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderColor: COLORS.microBorder,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 9999,
    backgroundColor: COLORS.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: COLORS.microBorder,
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingTop: 12,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  splitCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  splitLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  splitValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  splitSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  digitalCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 8,
  },
  digitalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: '#1D4ED8',
  },
  digitalValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: '#1E40AF',
    marginTop: 2,
  },
  digitalSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: '#3B82F6',
    marginTop: 2,
  },
  disbursedCard: {
    backgroundColor: '#FDF4FF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F0ABFC',
    marginBottom: 8,
  },
  disbursedLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '900',
    color: '#A21CAF',
  },
  disbursedValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '900',
    color: '#86198F',
    marginTop: 2,
  },
  disbursedSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: '#C026D3',
    marginTop: 2,
  },
  netCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    marginBottom: 12,
  },
  netLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 4,
  },
  netValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.primary,
  },
  netSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  immutableFormulaCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primaryBorder,
    marginBottom: 14,
  },
  formulaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  formulaHeaderTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  formulaHeaderSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
    marginBottom: 12,
  },
  formulaBreakdown: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  formulaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  formulaConceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formulaConceptText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  formulaAmountText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '900',
  },
  formulaDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  formulaTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  formulaTotalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.3,
  },
  formulaTotalSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  formulaTotalValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
  },
  exactFormulaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 12,
  },
  exactFormulaText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '800',
  },
  postCloseContainer: {
    paddingVertical: 10,
    paddingBottom: 24,
  },
  postCloseSuccessCard: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    marginBottom: 14,
  },
  postCloseBadgeIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  postCloseTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: -0.3,
    marginBottom: 4,
    textAlign: 'center',
  },
  postCloseSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  folioBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  folioBadge: {
    backgroundColor: '#15803D',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  folioBadgeText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sealedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sealedStatusText: {
    fontFamily: FONT_FAMILY,
    color: '#15803D',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sealedReceiptCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 14,
  },
  receiptHeaderCompany: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  receiptSubHeader: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  receiptDashedDivider: {
    height: 1,
    borderWidth: 0.8,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  receiptLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  receiptLabelSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  receiptValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  receiptValueSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  receiptValueBold: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '900',
  },
  receiptJustificationBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },
  receiptJustificationLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  receiptJustificationText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  verificationHashBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  verificationHashText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  phoneInputCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 12,
  },
  phoneHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  phoneLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  phoneInput: {
    fontFamily: FONT_FAMILY,
    height: 42,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  sendWhatsAppMainBtn: {
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  sendWhatsAppMainBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  secondaryCopyBtn: {
    flexDirection: 'row',
    height: 44,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  secondaryCopyText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  finishAndContinueBtn: {
    backgroundColor: COLORS.dockBg,
    flexDirection: 'row',
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishAndContinueBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    paddingTop: 6,
  },
  confirmBtn: {
    backgroundColor: COLORS.dockBg,
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
