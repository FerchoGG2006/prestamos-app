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
} from 'react-native';
import {
  CollectionSession,
  Payment,
  DailyRouteMetrics,
} from '../../core/domain/types';
import { formatCOP } from '../../core/config/business-rules';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import {
  Landmark,
  X,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Share2,
  Upload,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react-native';

interface SettlementModalProps {
  visible: boolean;
  session: CollectionSession | null;
  payments: Payment[];
  metrics: DailyRouteMetrics;
  todayStr: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const SettlementModal: React.FC<SettlementModalProps> = ({
  visible,
  session,
  payments,
  metrics,
  todayStr,
  onClose,
  onSuccess,
}) => {
  const [cashHandedOverStr, setCashHandedOverStr] = useState('0');
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');

  useEffect(() => {
    if (visible) {
      setCashHandedOverStr(metrics.collectedCashToday.toString());
      setJustification('');
      setShowImportPanel(false);
      setImportJsonText('');
    }
  }, [visible, metrics.collectedCashToday]);

  if (!session) return null;

  const collectedCash = metrics.collectedCashToday;
  const collectedDigital = metrics.collectedDigitalToday;
  const totalCollected = metrics.collectedToday;
  const disbursedToday = metrics.disbursedToday;

  const cashHandedOver = parseInt(cashHandedOverStr.replace(/\D/g, ''), 10) || 0;
  const cashDifference = collectedCash - cashHandedOver;

  // Firma de verificación determinista del paquete de ruta
  const verificationHash = `SYNC-${todayStr.replace(/-/g, '')}-${payments.length}P-${Math.round(
    totalCollected / 1000
  )}K`;

  const maxBarValue = Math.max(
    totalCollected,
    disbursedToday,
    metrics.expectedDailyGoal,
    1
  );
  const recaudoRatio = Math.min(100, Math.round((totalCollected / maxBarValue) * 100));
  const desembolsosRatio = Math.min(
    100,
    Math.round((disbursedToday / maxBarValue) * 100)
  );
  const metaRatio = Math.min(
    100,
    Math.round((metrics.expectedDailyGoal / maxBarValue) * 100)
  );

  const handleCloseSettlement = async () => {
    if (cashDifference !== 0 && !justification.trim()) {
      Alert.alert(
        'Justificación Requerida',
        'Existe una diferencia en el arqueo de efectivo. Es obligatorio ingresar una observación.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.closeDailySettlement({
        cashHandedOver,
        differenceJustification: justification.trim() || undefined,
      });

      Alert.alert(
        '¡Jornada Liquidada!',
        'El cuadre diario ha quedado registrado de forma inmutable en almacenamiento local.'
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cerrar la liquidación');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportSyncPackage = async () => {
    const syncPkg = localStore.exportMobileSyncPackage(todayStr);
    const jsonString = JSON.stringify(syncPkg, null, 2);

    // En Web descarga directamente el archivo .json para cartera.db
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `paquete-ruta-${syncPkg.routeId}-${todayStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert(
          'Paquete Descargado',
          `Se descargó paquete-ruta-${syncPkg.routeId}-${todayStr}.json (${syncPkg.payments.length} cobros) listo para cartera.db.`
        );
        return;
      } catch {
        // Fallback a Share
      }
    }

    try {
      await Share.share({
        title: `Paquete Ruta ${syncPkg.routeId} (${todayStr})`,
        message: jsonString,
      });
    } catch {
      Alert.alert(
        'Paquete JSON Generado',
        `Contiene ${syncPkg.payments.length} cobros con idempotencyKey listos para importar en cartera.db.`
      );
    }
  };

  const handleImportPackage = async () => {
    if (!importJsonText.trim()) {
      Alert.alert('JSON vacío', 'Pegue el contenido del paquete JSON de ruta.');
      return;
    }
    try {
      const res = await localStore.importMobileSyncPackage(importJsonText);
      Alert.alert(
        'Ruta Importada',
        `Se cargaron ${res.importedCustomers} clientes y ${res.importedLoans} préstamos en el teléfono.`
      );
      setShowImportPanel(false);
      setImportJsonText('');
      onSuccess();
    } catch (err: any) {
      Alert.alert('Error al importar', err.message || 'Formato JSON inválido');
    }
  };

  const handleResetDemoData = async () => {
    await localStore.resetToDemoSeed();
    onSuccess();
    Alert.alert(
      'Datos Demo Restaurados',
      'Se reiniciaron los clientes, préstamos y saldos semilla de demostración.'
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Mi Caja y Sincronización</Text>
              <Text style={styles.subtitle}>
                Jornada {session.date} • {session.routeId} ({session.status})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* 1. CUADRÍCULA BENTO: EFECTIVO EN MANO VS DIGITAL */}
            <View style={styles.splitRow}>
              <View style={styles.splitCard}>
                <Text style={styles.splitLabel}>💵 EFECTIVO EN MANO</Text>
                <Text
                  style={[styles.splitValue, { color: COLORS.success }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCOP(collectedCash)}
                </Text>
                <Text style={styles.splitSub}>
                  Caja total: {formatCOP(metrics.cashAvailableInHand)}
                </Text>
              </View>

              <View
                style={[
                  styles.splitCard,
                  { backgroundColor: COLORS.surfaceLavender, borderColor: COLORS.purpleBorder },
                ]}
              >
                <Text style={[styles.splitLabel, { color: COLORS.purple }]}>
                  📲 DIGITAL (NEQUI / TRANSF.)
                </Text>
                <Text
                  style={[styles.splitValue, { color: '#2E1065' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCOP(collectedDigital)}
                </Text>
                <Text style={[styles.splitSub, { color: COLORS.purple }]}>
                  Directo en cuenta bancaria
                </Text>
              </View>
            </View>

            {/* 2. STATISTICS CHART: RECAUDO (#10b981) VS DESEMBOLSOS (#2563eb) */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeaderRow}>
                <BarChart3 size={16} color={COLORS.primary} />
                <Text style={styles.cardHeaderTitle}>
                  Flujo del Día: Recaudo vs. Desembolsos
                </Text>
              </View>

              {/* Barra 1: Recaudo */}
              <View style={styles.barGroup}>
                <View style={styles.barLabelRow}>
                  <View style={styles.legendRow}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: COLORS.successBright },
                      ]}
                    />
                    <Text style={styles.barLabel}>Recaudo Total Hoy</Text>
                  </View>
                  <Text style={[styles.barAmount, { color: COLORS.success }]}>
                    {formatCOP(totalCollected)}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(6, recaudoRatio)}%`,
                        backgroundColor: COLORS.successBright,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Barra 2: Desembolsos */}
              <View style={styles.barGroup}>
                <View style={styles.barLabelRow}>
                  <View style={styles.legendRow}>
                    <View
                      style={[styles.legendDot, { backgroundColor: COLORS.primary }]}
                    />
                    <Text style={styles.barLabel}>Desembolsos / Renovaciones</Text>
                  </View>
                  <Text style={[styles.barAmount, { color: COLORS.primary }]}>
                    {formatCOP(disbursedToday)}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(6, desembolsosRatio)}%`,
                        backgroundColor: COLORS.primary,
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Barra 3: Meta Diaria */}
              <View style={styles.barGroup}>
                <View style={styles.barLabelRow}>
                  <View style={styles.legendRow}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: COLORS.textMuted },
                      ]}
                    />
                    <Text style={styles.barLabel}>Meta Diaria Esperada</Text>
                  </View>
                  <Text style={styles.barAmount}>
                    {formatCOP(metrics.expectedDailyGoal)}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.max(6, metaRatio)}%`,
                        backgroundColor: COLORS.textMuted,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* 3. ARQUEO FÍSICO DE EFECTIVO CON FILLED INPUTS */}
            <View style={styles.reconciliationCard}>
              <Text style={styles.cardHeaderTitle}>Arqueo Físico de Efectivo</Text>

              <View style={styles.filledAmountBlock}>
                <Text style={styles.floatingInternalLabel}>
                  EFECTIVO FÍSICO ENTREGADO AL CERRAR RUTA ($ COP)
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={cashHandedOverStr}
                  onChangeText={setCashHandedOverStr}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>

              {cashDifference === 0 ? (
                <View style={styles.balancedBadge}>
                  <CheckCircle
                    size={16}
                    color={COLORS.success}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.balancedText}>
                    ✓ Caja cuadrada perfectamente ($0 diferencia)
                  </Text>
                </View>
              ) : (
                <View style={styles.unbalancedBadge}>
                  <AlertTriangle
                    size={16}
                    color={COLORS.danger}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.unbalancedText}>
                    {cashDifference > 0
                      ? `Faltante en efectivo: ${formatCOP(cashDifference)}`
                      : `Sobrante en efectivo: ${formatCOP(Math.abs(cashDifference))}`}
                  </Text>
                </View>
              )}

              {cashDifference !== 0 && (
                <View style={[styles.filledAmountBlock, { marginTop: 10, marginBottom: 0 }]}>
                  <Text style={styles.floatingInternalLabel}>
                    JUSTIFICACIÓN OBLIGATORIA DEL DESCUADRE *
                  </Text>
                  <TextInput
                    style={styles.justificationInput}
                    value={justification}
                    onChangeText={setJustification}
                    placeholder="Explique el motivo de la diferencia en caja..."
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                  />
                </View>
              )}
            </View>

            {/* 4. TICKET DE SINCRONIZACIÓN OFFLINE-FIRST CON CARTERA.DB (Mejora #5) */}
            <View style={styles.syncTicketCard}>
              <View style={styles.syncHeaderRow}>
                <ShieldCheck size={16} color={COLORS.success} />
                <Text style={styles.syncTicketTitle}>
                  PUENTE OFFLINE-FIRST (mobile/ ↔ cartera.db)
                </Text>
              </View>
              <Text style={styles.syncHashText}>
                Hash de Integridad: {verificationHash}
              </Text>

              <View style={styles.dashedDivider} />

              <View style={styles.syncButtonsRow}>
                <TouchableOpacity
                  style={styles.syncExportBtn}
                  onPress={handleExportSyncPackage}
                >
                  <Share2 size={15} color={COLORS.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.syncExportBtnText}>Exportar JSON</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.syncImportToggleBtn}
                  onPress={() => setShowImportPanel(!showImportPanel)}
                >
                  <Upload size={15} color={COLORS.purple} style={{ marginRight: 6 }} />
                  <Text style={styles.syncImportToggleText}>Importar Ruta</Text>
                </TouchableOpacity>
              </View>

              {showImportPanel && (
                <View style={styles.importBox}>
                  <Text style={styles.floatingInternalLabel}>
                    PEGAR PAQUETE JSON DE CARTERA.DB
                  </Text>
                  <TextInput
                    style={styles.importJsonInput}
                    value={importJsonText}
                    onChangeText={setImportJsonText}
                    placeholder='{"newCustomers": [...], "newLoans": [...]}'
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.applyImportBtn}
                    onPress={handleImportPackage}
                  >
                    <Text style={styles.applyImportBtnText}>
                      Cargar Paquete en Teléfono
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.resetDemoBtn}
                onPress={handleResetDemoData}
              >
                <RotateCcw size={13} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
                <Text style={styles.resetDemoBtnText}>
                  Restaurar Datos Demo Semilla
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
              onPress={handleCloseSettlement}
              disabled={isSubmitting}
            >
              <Landmark size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                {isSubmitting ? 'Cerrando Jornada...' : 'Cerrar Jornada y Liquidar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginBottom: 12,
  },
  splitRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  splitCard: {
    flex: 1,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 20,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    overflow: 'hidden',
  },
  splitLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  splitValue: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 4,
  },
  splitSub: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  cardHeaderTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  barGroup: {
    marginBottom: 10,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  barAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  barTrack: {
    height: 9,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 9999,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 9999,
  },
  reconciliationCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 12,
  },
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginTop: 8,
  },
  floatingInternalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  input: {
    height: 36,
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    paddingVertical: 0,
  },
  justificationInput: {
    height: 52,
    textAlignVertical: 'top',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    paddingVertical: 2,
  },
  balancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    marginTop: 10,
  },
  balancedText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: '800',
  },
  unbalancedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    marginTop: 10,
  },
  unbalancedText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  syncTicketCard: {
    backgroundColor: COLORS.receiptPaper,
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginBottom: 8,
  },
  syncHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  syncTicketTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  syncHashText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 3,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 10,
  },
  syncButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  syncExportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.infoLight,
    borderWidth: 1,
    borderColor: COLORS.infoBorder,
    paddingVertical: 10,
    borderRadius: 12,
  },
  syncExportBtnText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  syncImportToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLavender,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    paddingVertical: 10,
    borderRadius: 12,
  },
  syncImportToggleText: {
    color: COLORS.purple,
    fontSize: 12,
    fontWeight: '800',
  },
  importBox: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 8,
  },
  importJsonInput: {
    height: 60,
    fontSize: 11,
    color: COLORS.textPrimary,
    marginTop: 4,
    marginBottom: 8,
  },
  applyImportBtn: {
    backgroundColor: COLORS.purple,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyImportBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  resetDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  resetDemoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
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
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
