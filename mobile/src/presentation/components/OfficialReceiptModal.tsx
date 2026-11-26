import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  X,
  MessageCircle,
  Download,
  ShieldCheck,
  WifiOff,
  AlertCircle,
} from 'lucide-react-native';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import {
  OfficialReceiptData,
  buildReceiptDetailRows,
  formatCOPPlain,
  formatOfficialReceiptWhatsAppMessage,
  getReceiptTitle,
  openWhatsAppReceipt,
} from '../../core/utils/whatsapp-receipt';
import { downloadOrShareReceiptPdf } from '../../core/utils/receipt-pdf';
import { TactilePressable } from './MotionPrimitives';

const KREDIA_LOGO = require('../../../assets/kredia.png');

export interface ConfirmationStepItem {
  label: string;
  state: 'done' | 'active' | 'pending';
}

interface OfficialReceiptModalProps {
  visible: boolean;
  receipt: OfficialReceiptData | null;
  isProcessing?: boolean;
  processingTitle?: string;
  processingAmount?: number;
  processingSubtitle?: string;
  processingSteps?: ConfirmationStepItem[];
  onClose: () => void;
  closeLabel?: string;
}

/**
 * Comprobante oficial estilo fintech (Bemovil/Nequi) con:
 * - Fase 1 (opcional): Confirmación paso a paso con barra de progreso y checks en vivo
 * - Fase 2: Tarjeta oficial (Oficina arriba + Logo Kredia en footer), 1 toque a WhatsApp exacto y Descargar/Compartir PDF
 */
export const OfficialReceiptModal: React.FC<OfficialReceiptModalProps> = ({
  visible,
  receipt,
  isProcessing = false,
  processingTitle = 'Confirmando operación',
  processingAmount = 0,
  processingSubtitle = '',
  processingSteps,
  onClose,
  closeLabel = 'Listo',
}) => {
  const insets = useSafeAreaInsets();
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string>('');

  useEffect(() => {
    if (visible) {
      setActionFeedback('');
      setIsPdfBusy(false);
    }
  }, [visible, receipt?.receiptCode]);

  if (!visible) return null;

  const steps: ConfirmationStepItem[] = processingSteps || [
    { label: 'Validando sesión y datos', state: 'done' },
    { label: 'Registrando operación y saldo real', state: 'done' },
    { label: 'Generando comprobante oficial', state: 'active' },
    { label: 'Listo para entregar', state: 'pending' },
  ];

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const activeCount = steps.some((s) => s.state === 'active') ? 0.5 : 0;
  const progressPct = Math.min(100, Math.round(((doneCount + activeCount) / Math.max(1, steps.length)) * 100));

  const handleSendWhatsApp = async () => {
    if (!receipt) return;
    const msg = formatOfficialReceiptWhatsAppMessage(receipt);
    await openWhatsAppReceipt(receipt.customerPhone || '', msg);
    setActionFeedback(
      receipt.isCloudVerified
        ? 'Chat del cliente abierto con el enlace oficial inalterable.'
        : 'Chat abierto en modo respaldo local (sin conexión a nube).'
    );
  };

  const handleDownloadPdf = async () => {
    if (!receipt || isPdfBusy) return;
    setIsPdfBusy(true);
    setActionFeedback('');
    try {
      const res = await downloadOrShareReceiptPdf(receipt);
      if (res.ok) {
        setActionFeedback(
          res.mode === 'download'
            ? `PDF Comprobante-${receipt.receiptCode}.pdf descargado.`
            : 'Ticket PDF listo para abrir o compartir.'
        );
      } else {
        const errText = res.error || 'No se pudo generar el PDF.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(errText);
        } else {
          Alert.alert('PDF no disponible', errText);
        }
      }
    } finally {
      setIsPdfBusy(false);
    }
  };

  const isVoid = receipt ? receipt.status !== 'APPROVED' : false;
  const rows = receipt ? buildReceiptDetailRows(receipt) : [];
  const statusLabel =
    receipt?.status === 'REVERSED'
      ? 'Anulado'
      : receipt?.status === 'CANCELLED'
      ? 'Cancelado'
      : 'Aprobado';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={false}
      onRequestClose={isProcessing ? undefined : onClose}
    >
      <View style={[styles.overlay, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
          <View style={styles.handle} />

          {isProcessing || !receipt ? (
            /* FASE 1: CONFIRMACIÓN PASO A PASO (ESTILO BEMOVIL) */
            <View style={styles.stepperWrap}>
              <View style={styles.topRow}>
                <Text style={styles.headerTitle}>{processingTitle}</Text>
              </View>

              <View style={styles.processingSummaryRow}>
                <View style={styles.brandIconCircle}>
                  <ShieldCheck size={22} color="#0F766E" />
                </View>
                <View style={{ flex: 1 }}>
                  {!!processingSubtitle && (
                    <Text style={styles.processingSubtitle}>{processingSubtitle}</Text>
                  )}
                  <Text style={styles.processingAmount}>{formatCOPPlain(processingAmount)}</Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>

              <View style={styles.stepsList}>
                {steps.map((step, idx) => (
                  <View key={`${step.label}-${idx}`} style={styles.stepRow}>
                    {step.state === 'done' ? (
                      <View style={styles.stepCheckDone}>
                        <Check size={12} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : step.state === 'active' ? (
                      <View style={styles.stepSpinnerWrap}>
                        <ActivityIndicator size="small" color="#0F766E" />
                      </View>
                    ) : (
                      <View style={styles.stepDotPending} />
                    )}
                    <Text
                      style={[
                        styles.stepLabel,
                        step.state === 'active' && styles.stepLabelActive,
                        step.state === 'pending' && styles.stepLabelPending,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            /* FASE 2: COMPROBANTE OFICIAL FINTECH */
            <>
              <View style={styles.topRow}>
                <Text style={styles.headerTitle}>{getReceiptTitle(receipt.receiptType)}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <X size={18} color="#475569" />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                {/* Check + Monto + Pill Aprobado + Timestamp */}
                <View style={styles.heroBlock}>
                  <View style={[styles.statusCircle, isVoid && styles.statusCircleVoid]}>
                    {isVoid ? (
                      <AlertCircle size={26} color="#DC2626" strokeWidth={2.4} />
                    ) : (
                      <Check size={26} color="#059669" strokeWidth={2.8} />
                    )}
                  </View>

                  <Text style={styles.heroAmount}>{formatCOPPlain(receipt.amount)}</Text>

                  <View style={styles.statusMetaRow}>
                    <View style={[styles.statusPill, isVoid && styles.statusPillVoid]}>
                      <Text style={[styles.statusPillText, isVoid && styles.statusPillTextVoid]}>
                        {statusLabel}
                      </Text>
                    </View>
                    <Text style={styles.timestampText}>{receipt.issuedAtDisplay}</Text>
                  </View>

                  {!!receipt.payload?.subtitle && (
                    <Text style={styles.heroSubtitle}>{receipt.payload.subtitle}</Text>
                  )}
                </View>

                {/* Tarjeta interna estilo comprobante */}
                <View style={styles.ticketCard}>
                  {/* Header: Nombre de la Oficina (Opción 2A) */}
                  <View style={styles.officeHeader}>
                    <Text style={styles.officeName}>
                      {(receipt.companyName || 'Kredia').toUpperCase()}
                    </Text>
                    {!!receipt.routeName && (
                      <Text style={styles.officeRoute}>{receipt.routeName}</Text>
                    )}
                  </View>

                  <View style={styles.dashedDivider} />

                  {/* Tabla limpia de 2 columnas */}
                  <View style={styles.rowsContainer}>
                    {rows.map((row, idx) => (
                      <View key={`${row.label}-${idx}`} style={styles.detailRow}>
                        <Text style={styles.detailLabel}>{row.label}</Text>
                        <Text
                          style={[
                            styles.detailValue,
                            row.highlight && styles.detailValueHighlight,
                            row.danger && styles.detailValueDanger,
                          ]}
                        >
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.dashedDivider} />

                  {/* Footer con logo oficial de Kredia (Opción 2A) */}
                  <View style={styles.krediaFooter}>
                    <Text style={styles.krediaCaption}>Comprobante oficial verificado por</Text>
                    <Image
                      source={KREDIA_LOGO}
                      style={styles.krediaLogo}
                      resizeMode="contain"
                    />
                    <View
                      style={[
                        styles.cloudBadge,
                        !receipt.isCloudVerified && styles.cloudBadgeOffline,
                      ]}
                    >
                      {receipt.isCloudVerified ? (
                        <ShieldCheck size={12} color="#047857" />
                      ) : (
                        <WifiOff size={12} color="#B45309" />
                      )}
                      <Text
                        style={[
                          styles.cloudBadgeText,
                          !receipt.isCloudVerified && styles.cloudBadgeTextOffline,
                        ]}
                      >
                        {receipt.isCloudVerified
                          ? 'Enlace inalterable activo en la nube'
                          : 'Guardado sin señal · Puedes compartir el PDF local'}
                      </Text>
                    </View>
                    {!!receipt.payload?.footerMessage && (
                      <Text style={styles.customFooterText}>{receipt.payload.footerMessage}</Text>
                    )}
                  </View>
                </View>

                {!!actionFeedback && (
                  <View style={styles.feedbackPill}>
                    <Text style={styles.feedbackText}>{actionFeedback}</Text>
                  </View>
                )}
              </ScrollView>

              {/* Acciones */}
              <View style={styles.actionsContainer}>
                <TactilePressable style={styles.whatsappBtn} onPress={handleSendWhatsApp}>
                  <MessageCircle size={18} color="#FFFFFF" />
                  <Text style={styles.whatsappBtnText}>Enviar por WhatsApp</Text>
                </TactilePressable>

                <View style={styles.secondaryRow}>
                  <TactilePressable
                    style={[styles.pdfBtn, isPdfBusy && { opacity: 0.65 }]}
                    onPress={handleDownloadPdf}
                    disabled={isPdfBusy}
                  >
                    {isPdfBusy ? (
                      <ActivityIndicator size="small" color="#0F172A" />
                    ) : (
                      <Download size={16} color="#0F172A" />
                    )}
                    <Text style={styles.pdfBtnText}>
                      {isPdfBusy ? 'Generando...' : 'Descargar PDF'}
                    </Text>
                  </TactilePressable>

                  <TactilePressable style={styles.doneBtn} onPress={onClose}>
                    <Text style={styles.doneBtnText}>{closeLabel}</Text>
                  </TactilePressable>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '94%',
    flexShrink: 1,
  },
  handle: {
    width: 44,
    height: 4.5,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stepper Phase 1
  stepperWrap: {
    paddingBottom: 16,
  },
  processingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  brandIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E6F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  processingAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.6,
  },
  progressTrack: {
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#0F766E',
    borderRadius: 999,
  },
  stepsList: {
    gap: 12,
    paddingHorizontal: 2,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepCheckDone: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSpinnerWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotPending: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  stepLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
  },
  stepLabelActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  stepLabelPending: {
    color: '#94A3B8',
  },

  // Receipt Phase 2
  heroBlock: {
    alignItems: 'center',
    marginBottom: 16,
  },
  statusCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statusCircleVoid: {
    backgroundColor: '#FEF2F2',
  },
  heroAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 32,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.9,
  },
  statusMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  statusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 999,
  },
  statusPillVoid: {
    backgroundColor: '#FEE2E2',
  },
  statusPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  statusPillTextVoid: {
    color: '#DC2626',
  },
  timestampText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  heroSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#475569',
    marginTop: 6,
    textAlign: 'center',
  },

  ticketCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  officeHeader: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  officeName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  officeRoute: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    marginVertical: 10,
  },
  rowsContainer: {
    gap: 10,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    flexShrink: 0,
  },
  detailValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    flex: 1,
  },
  detailValueHighlight: {
    color: '#047857',
    fontWeight: '900',
  },
  detailValueDanger: {
    color: '#DC2626',
    fontWeight: '800',
  },

  krediaFooter: {
    alignItems: 'center',
    paddingTop: 4,
  },
  krediaCaption: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  krediaLogo: {
    width: 96,
    height: 24,
    marginBottom: 8,
  },
  cloudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  cloudBadgeOffline: {
    backgroundColor: '#FFFBEB',
  },
  cloudBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  cloudBadgeTextOffline: {
    color: '#B45309',
  },
  customFooterText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 6,
    textAlign: 'center',
  },

  feedbackPill: {
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  feedbackText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    textAlign: 'center',
  },

  actionsContainer: {
    paddingTop: 10,
    gap: 8,
  },
  whatsappBtn: {
    backgroundColor: '#16A34A',
    height: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whatsappBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pdfBtn: {
    flex: 1.3,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  pdfBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  doneBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
