import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Check, AlertCircle, Download, ShieldCheck, RefreshCw } from 'lucide-react-native';
import { FONT_FAMILY } from '../../theme/colors';
import {
  OfficialReceiptData,
  buildReceiptDetailRows,
  formatCOPPlain,
  getReceiptTitle,
} from '../../../core/utils/whatsapp-receipt';
import { downloadOrShareReceiptPdf } from '../../../core/utils/receipt-pdf';
import { supabaseSyncService } from '../../../infrastructure/sync/supabase-client';

const KREDIA_LOGO = require('../../../../assets/kredia.png');

interface PublicReceiptViewProps {
  receiptCode: string;
}

/**
 * Vista pública de verificación oficial de comprobante Kredia (https://cartera-movil.expo.app/?r=KRD-...).
 * No requiere inicio de sesión, solo consulta el comprobante exacto desde Supabase y permite descargar el PDF oficial.
 */
export const PublicReceiptView: React.FC<PublicReceiptViewProps> = ({ receiptCode }) => {
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<OfficialReceiptData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<string>('');

  const loadReceipt = async () => {
    setLoading(true);
    setErrorMsg('');
    const res = await supabaseSyncService.getPublicOfficialReceipt(receiptCode);
    if (res.ok && res.receipt) {
      setReceipt(res.receipt);
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.title = `${getReceiptTitle(res.receipt.receiptType)} · ${res.receipt.companyName} | Kredia`;
      }
    } else {
      setReceipt(null);
      setErrorMsg(res.error || 'No se encontró un comprobante oficial con este código.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadReceipt();
  }, [receiptCode]);

  const handleDownloadPdf = async () => {
    if (!receipt || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    setPdfFeedback('');
    try {
      const res = await downloadOrShareReceiptPdf(receipt);
      if (res.ok) {
        setPdfFeedback(`Ticket PDF Comprobante-${receipt.receiptCode}.pdf descargado.`);
      } else {
        setPdfFeedback(res.error || 'No se pudo generar el archivo PDF.');
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.page}>
        <View style={styles.cardShell}>
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color="#0F766E" />
            <Text style={styles.loadingTitle}>Verificando comprobante oficial...</Text>
            <Text style={styles.loadingSub}>{receiptCode}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!receipt) {
    return (
      <View style={styles.page}>
        <View style={styles.cardShell}>
          <View style={styles.centerBox}>
            <View style={[styles.statusCircle, styles.statusCircleVoid]}>
              <AlertCircle size={28} color="#DC2626" />
            </View>
            <Text style={styles.errorTitle}>Comprobante no disponible</Text>
            <Text style={styles.errorSub}>{errorMsg}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadReceipt}>
              <RefreshCw size={15} color="#FFFFFF" />
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </TouchableOpacity>
            <View style={styles.footerOnly}>
              <Image source={KREDIA_LOGO} style={styles.krediaLogo} resizeMode="contain" />
            </View>
          </View>
        </View>
      </View>
    );
  }

  const isVoid = receipt.status !== 'APPROVED';
  const rows = buildReceiptDetailRows(receipt);
  const statusLabel =
    receipt.status === 'REVERSED'
      ? 'Anulado'
      : receipt.status === 'CANCELLED'
      ? 'Cancelado'
      : 'Aprobado';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.cardShell}>
        <Text style={styles.topTitle}>{getReceiptTitle(receipt.receiptType)}</Text>

        {/* Hero Fintech (Estilo Bemovil/Nequi) */}
        <View style={styles.heroBlock}>
          <View style={[styles.statusCircle, isVoid && styles.statusCircleVoid]}>
            {isVoid ? (
              <AlertCircle size={28} color="#DC2626" strokeWidth={2.4} />
            ) : (
              <Check size={28} color="#059669" strokeWidth={2.8} />
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

        {/* Tarjeta de Detalle con Oficina arriba y Logo Kredia en el footer (Opción 2A) */}
        <View style={styles.ticketCard}>
          <View style={styles.officeHeader}>
            <Text style={styles.officeName}>{(receipt.companyName || 'Kredia').toUpperCase()}</Text>
            {!!receipt.routeName && <Text style={styles.officeRoute}>{receipt.routeName}</Text>}
          </View>

          <View style={styles.dashedDivider} />

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

          <View style={styles.krediaFooter}>
            <Text style={styles.krediaCaption}>Comprobante oficial verificado por</Text>
            <Image source={KREDIA_LOGO} style={styles.krediaLogo} resizeMode="contain" />
            <View style={styles.verifiedBadge}>
              <ShieldCheck size={13} color="#047857" />
              <Text style={styles.verifiedBadgeText}>Documento inalterable verificado en servidor</Text>
            </View>
            {!!receipt.payload?.footerMessage && (
              <Text style={styles.customFooterText}>{receipt.payload.footerMessage}</Text>
            )}
          </View>
        </View>

        {!!pdfFeedback && (
          <View style={styles.feedbackBox}>
            <Text style={styles.feedbackText}>{pdfFeedback}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.pdfPrimaryBtn, isDownloadingPdf && { opacity: 0.7 }]}
          onPress={handleDownloadPdf}
          disabled={isDownloadingPdf}
          activeOpacity={0.85}
        >
          {isDownloadingPdf ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Download size={18} color="#FFFFFF" />
          )}
          <Text style={styles.pdfPrimaryBtnText}>
            {isDownloadingPdf ? 'Generando ticket PDF...' : 'Descargar PDF'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  pageContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  cardShell: {
    width: '100%',
    maxWidth: 430,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  topTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: 18,
  },
  statusCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statusCircleVoid: {
    backgroundColor: '#FEF2F2',
  },
  heroAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -1,
  },
  statusMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  statusPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 11,
    paddingVertical: 4,
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
    marginTop: 7,
    textAlign: 'center',
  },
  ticketCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  officeHeader: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  officeName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15.5,
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
    gap: 11,
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
    fontSize: 13.5,
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
    paddingTop: 6,
  },
  krediaCaption: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  krediaLogo: {
    width: 104,
    height: 26,
    marginBottom: 10,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  verifiedBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  customFooterText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  feedbackBox: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
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
  pdfPrimaryBtn: {
    marginTop: 16,
    backgroundColor: '#0F172A',
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  pdfPrimaryBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  centerBox: {
    alignItems: 'center',
    paddingVertical: 28,
    gap: 10,
  },
  loadingTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
  },
  loadingSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  errorTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  errorSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 6,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F766E',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerOnly: {
    marginTop: 20,
    opacity: 0.75,
  },
});
