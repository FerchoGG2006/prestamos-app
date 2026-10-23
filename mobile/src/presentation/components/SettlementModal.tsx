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
  Download,
  FileText,
  Check,
  MessageCircle,
  Copy,
  Wifi,
  FileSpreadsheet,
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
  const [deductPayroll, setDeductPayroll] = useState(false);
  const [payrollAmountStr, setPayrollAmountStr] = useState('');
  const [payrollReason, setPayrollReason] = useState('Consumo personal: gaseosa / almuerzo / agua');
  const [settledRecord, setSettledRecord] = useState<DailySettlement | null>(null);
  const [copied, setCopied] = useState(false);
  const [targetPhone, setTargetPhone] = useState('');
  const [officeServerUrl, setOfficeServerUrl] = useState('http://192.168.1.10:8765');
  const [wifiStatusText, setWifiStatusText] = useState('');
  const [wifiConnected, setWifiConnected] = useState<boolean | null>(null);
  const [isWifiBusy, setIsWifiBusy] = useState(false);

  const collectedCash = metrics.collectedCashToday;
  const expensesToday = metrics.expensesToday || 0;
  const disbursedToday = metrics.disbursedToday || 0;
  const recaudoRetiradoToday = metrics.recaudoRetiradoToday || 0;
  const netCashExpected = Math.max(
    0,
    collectedCash - expensesToday - disbursedToday - recaudoRetiradoToday
  );
  const collectedDigital = metrics.collectedDigitalToday;
  const totalCollected = metrics.collectedToday;

  const cashHandedOver = parseInt(cashHandedOverStr.replace(/\D/g, ''), 10) || 0;
  const cashDifference = netCashExpected - cashHandedOver;

  useEffect(() => {
    if (visible) {
      setCashHandedOverStr(netCashExpected.toString());
      setJustification('');
      setShowImportPanel(false);
      setImportJsonText('');
      setDeductPayroll(false);
      setPayrollAmountStr('');
      setSettledRecord(null);
      setCopied(false);
      const conf = localStore.getOfficeConfig();
      setTargetPhone(conf.supportPhone || '');
      setOfficeServerUrl(conf.officeServerUrl || 'http://192.168.1.10:8765');
      setWifiStatusText('');
      setWifiConnected(null);
    }
  }, [visible, netCashExpected]);

  if (!session) return null;

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
  const programadoRatio = Math.min(
    100,
    Math.round((metrics.expectedDailyGoal / maxBarValue) * 100)
  );

  const handleCloseSettlement = async () => {
    if (cashDifference !== 0 && !justification.trim() && !deductPayroll) {
      Alert.alert(
        'Justificación Requerida',
        'Existe una diferencia en el arqueo de efectivo. Es obligatorio ingresar una observación o activar el descuento de nómina.'
      );
      return;
    }

    const payrollNum = deductPayroll
      ? parseInt(payrollAmountStr.replace(/\D/g, ''), 10) || Math.max(0, cashDifference)
      : undefined;

    setIsSubmitting(true);
    try {
      const settlement = await localStore.closeDailySettlement({
        cashHandedOver,
        differenceJustification: justification.trim() || undefined,
        payrollDeductionAmount: payrollNum,
        payrollDeductionReason: deductPayroll ? payrollReason : undefined,
      });

      // Métrica cerrada y sellada con éxito.
      // Guardamos el registro sellado para pasar de inmediato a la pantalla de envío oficial a la oficina.
      setSettledRecord(settlement);
      onSuccess();
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
      setImportJsonText(jsonString);
      setShowImportPanel(true);
      await Share.share({
        title: `paquete-ruta-${syncPkg.routeId}-${todayStr}.json`,
        message: jsonString,
      });
    } catch {
      Alert.alert(
        'Paquete JSON Generado',
        `Contiene ${syncPkg.payments.length} cobros listos para importar en cartera.db. El JSON completo está disponible en el cuadro de texto inferior para copiar.`
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

  const handleFilePick = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = async (e: any) => {
        const file = e.target?.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const content = evt.target?.result as string;
            if (content) {
              try {
                const res = await localStore.importMobileSyncPackage(content);
                Alert.alert(
                  '¡Ruta Importada Exitosamente!',
                  `Archivo: ${file.name}\nClientes cargados: ${res.importedCustomers}\nPréstamos cargados: ${res.importedLoans}`
                );
                setShowImportPanel(false);
                setImportJsonText('');
                onSuccess();
              } catch (err: any) {
                Alert.alert('Error al importar archivo', err.message || 'JSON inválido');
              }
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    } else {
      setShowImportPanel(true);
    }
  };

  const handleResetDemoData = async () => {
    await localStore.resetToDemoSeed();
    onSuccess();
    Alert.alert(
      'Escenario Demo Cargado',
      'Se cargaron con éxito los 40 clientes de la ruta y el Administrativo de $20.000.000 COP ($17.000.000 en Cartera + $3.000.000 en Base).'
    );
  };

  const handleTestWifiConnection = async () => {
    setIsWifiBusy(true);
    try {
      const res = await localStore.testOfficeConnection(officeServerUrl);
      setWifiConnected(res.ok);
      setWifiStatusText(res.statusText);
      if (res.ok) {
        await localStore.updateOfficeConfig({ officeServerUrl: officeServerUrl.trim() });
      }
    } finally {
      setIsWifiBusy(false);
    }
  };

  const handlePushWifiToOffice = async () => {
    setIsWifiBusy(true);
    try {
      const res = await localStore.pushSyncToOfficeServer(officeServerUrl, todayStr);
      setWifiConnected(true);
      setWifiStatusText(res.message);
      Alert.alert('📤 Sincronización Exitosa con PC', res.message);
    } catch (err: any) {
      setWifiConnected(false);
      setWifiStatusText(err?.message || 'Error al enviar datos al PC');
      Alert.alert('Error de Red Local Wi-Fi', err?.message || 'No se pudo conectar al PC de Oficina.');
    } finally {
      setIsWifiBusy(false);
    }
  };

  const handlePullWifiFromOffice = async () => {
    setIsWifiBusy(true);
    try {
      const res = await localStore.pullRouteFromOfficeServer(officeServerUrl, session?.routeId);
      setWifiConnected(true);
      setWifiStatusText(
        `Cartera actualizada desde PC (${res.importedCustomers} clientes, ${res.importedLoans} créditos).`
      );
      onSuccess();
      Alert.alert(
        '📥 Cartera Descargada del PC',
        `Se sincronizaron ${res.importedCustomers} clientes y ${res.importedLoans} créditos desde el PC de Oficina.`
      );
    } catch (err: any) {
      setWifiConnected(false);
      setWifiStatusText(err?.message || 'Error al descargar cartera del PC');
      Alert.alert('Error de Red Local Wi-Fi', err?.message || 'No se pudo descargar desde el PC de Oficina.');
    } finally {
      setIsWifiBusy(false);
    }
  };

  const handleExportAccountingCSV = async () => {
    const csvContent = localStore.generateAccountingReportCSV(todayStr);
    const filename = `reporte-contable-cartera-${todayStr}.csv`;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert(
          '📊 Reporte Contable Excel (.csv) Descargado',
          `Archivo ${filename} generado con Resumen de Rentabilidad, Cartera Activa, Mora, Historial de Abonos y Libro de Caja.`
        );
        return;
      } catch {
        // Fallback a Share
      }
    }

    try {
      await Share.share({
        title: filename,
        message: csvContent,
      });
    } catch {
      Alert.alert('📊 Reporte Contable Generado', 'El reporte CSV fue generado correctamente.');
    }
  };

  const generateOfficialReportText = (st?: DailySettlement | null): string => {
    const officeConfig = localStore.getOfficeConfig();
    const companyName = officeConfig.companyName || 'Cartera & Préstamos';
    const collectorName = st?.collectorId || session?.collectorId || 'Cobrador de Ruta';
    const routeId = st?.routeId || session?.routeId || 'Ruta Principal';
    const reportDate = st?.date || session?.date || todayStr;
    const isSealed = Boolean(st);

    const actualCol = st ? st.actualCollection : metrics.collectedToday;
    const cashCol = st ? st.collectedCash : metrics.collectedCashToday;
    const digCol = st ? st.collectedTransfers : metrics.collectedDigitalToday;
    const salidas = st ? st.salidasCount : metrics.salidasCount;
    const netDisbursed = st ? st.actualCashDisbursedTotal : metrics.disbursedToday;
    const exp = expensesToday;
    const handedOver = st ? st.cashHandedOver : cashHandedOver;
    const diff = st ? st.cashDifference : cashDifference;
    const diffJust = st?.differenceJustification || justification.trim();

    const lines = [
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🏢 *${companyName.toUpperCase()}*`,
      `📊 *CUADRE OFICIAL DE JORNADA ${isSealed ? 'CERRADA' : 'EN PROCESO'}*`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `${isSealed ? '🔒 *ESTADO: SELLADO Y LIQUIDADO*' : '⚠️ *ESTADO: PREVIO AL CIERRE*'}`,
      st ? `🔖 *Folio Liquidación:* #${st.id.toUpperCase()}` : '',
      `📅 *Fecha:* ${reportDate}`,
      `👤 *Cobrador:* ${collectorName} • *Ruta:* ${routeId}`,
      st
        ? `⏰ *Hora Cierre:* ${new Date(st.settledAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`
        : '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '📥 *1. COBRADO HOY (RECAUDO)*',
      `• *Total Cobrado:* ${formatCOP(actualCol)}`,
      `  - Efectivo en caja: ${formatCOP(cashCol)}`,
      `  - Digital / Nequi: ${formatCOP(digCol)}`,
      `• *Clientes Visitados:* ${metrics.visitedCustomersCount} de ${metrics.expectedCustomersCount} (${metrics.progressPercentage}%)`,
      '',
      '📤 *2. SALIDAS Y COLOCACIÓN*',
      `• *Operaciones:* ${salidas} crédito(s)`,
      `• *Desembolso Neto Entregado:* ${formatCOP(netDisbursed)}`,
      '',
      `⛽ *3. GASTOS DE RUTA DEDUCIDOS:* ${formatCOP(exp)}`,
      '',
      '💵 *4. ARQUEO Y RENDICIÓN DE EFECTIVO*',
      `• Efectivo Neto Esperado: ${formatCOP(netCashExpected)}`,
      `• Efectivo Entregado a Oficina: ${formatCOP(handedOver)}`,
      `• Diferencia Arqueo: ${diff === 0 ? '✓ Exacto ($0)' : formatCOP(diff)}`,
    ];

    if (diffJust) {
      lines.push(`• Observación / Nómina: ${diffJust}`);
    }

    lines.push(
      '',
      `📈 *5. ADMINISTRATIVO TOTAL:* ${formatCOP(metrics.totalAdministrativeCapital)}`,
      `• Cartera en Calle: ${formatCOP(metrics.activeCapitalInStreet)}`,
      `• Base en Caja: ${formatCOP(metrics.cashAvailableInHand)}`,
      '',
      '⚠️ *6. ESTADO DE MORA*',
      `• Clientes en mora: ${metrics.overdueCustomersCount}`,
      `• Saldo vencido acumulado: ${formatCOP(metrics.overdueTotalAmount)}`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      `🔐 *Sello SHA:* ${verificationHash}`,
      `_Enviado desde App Móvil de Cobro_`
    );

    return lines.filter((l) => l !== '').join('\n');
  };

  const handleCopyReport = async (st?: DailySettlement | null) => {
    const text = generateOfficialReportText(st);
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
      Alert.alert(
        '¡Reporte Copiado!',
        'El comprobante oficial del cuadre fue copiado al portapapeles listo para compartir.'
      );
    } catch {
      Alert.alert('Reporte Oficial', text);
    }
  };

  const handleSendWhatsAppReport = (st?: DailySettlement | null) => {
    const text = generateOfficialReportText(st);
    let phone = (targetPhone || localStore.getOfficeConfig().supportPhone || '').replace(/\D/g, '');
    if (phone.length === 10) phone = `57${phone}`;

    if (!phone) {
      Share.share({
        title: `Cuadre ${st?.date || todayStr}`,
        message: text,
      }).catch(() => {
        Alert.alert('Cuadre Oficial Generado', text);
      });
      return;
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    Linking.openURL(waUrl).catch(() => {
      Share.share({
        title: `Cuadre ${st?.date || todayStr}`,
        message: text,
      }).catch(() => {
        Alert.alert('Cuadre Oficial Generado', text);
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

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                {settledRecord ? 'Liquidación Oficial de Jornada' : 'Caja del Administrador'}
              </Text>
              <Text style={styles.subtitle}>
                {settledRecord
                  ? `Jornada ${settledRecord.date} • Folio #${settledRecord.id.toUpperCase()}`
                  : `Capital General • Ruta ${session.routeId} • Cartera.db`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {settledRecord ? (
              <View style={styles.postCloseContainer}>
                {/* 1. Header con sello de éxito e inmutabilidad */}
                <View style={styles.postCloseSuccessCard}>
                  <View style={styles.postCloseBadgeIcon}>
                    <CheckCircle size={36} color="#16A34A" />
                  </View>
                  <Text style={styles.postCloseTitle}>¡Cuadre Cerrado y Sellado!</Text>
                  <Text style={styles.postCloseSubtitle}>
                    La métrica de la jornada {settledRecord.date} ha sido congelada y registrada de forma inmutable. La ruta se renovó automáticamente para el siguiente día.
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

                {/* 2. Comprobante Oficial Sellado */}
                <View style={styles.sealedReceiptCard}>
                  <Text style={styles.receiptHeaderCompany}>
                    {localStore.getOfficeConfig().companyName || 'CARTERA & PRÉSTAMOS'}
                  </Text>
                  <Text style={styles.receiptSubHeader}>
                    COMPROBANTE OFICIAL DE CIERRE Y LIQUIDACIÓN
                  </Text>
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
                    <Text style={styles.receiptLabel}>Total Cobrado Hoy:</Text>
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
                    <Text style={styles.verificationHashText}>Sello SHA: {verificationHash}</Text>
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
                  onPress={() => handleSendWhatsAppReport(settledRecord)}
                  activeOpacity={0.85}
                >
                  <MessageCircle size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.sendWhatsAppMainBtnText}>
                    📲 Enviar Cuadre a la Oficina (WhatsApp)
                  </Text>
                </TouchableOpacity>

                {/* 5. Acciones Secundarias: Copiar Texto & Descargar .json */}
                <View style={styles.postCloseSecondaryRow}>
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
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
                        styles.secondaryActionText,
                        copied && { color: '#16a34a', fontWeight: 'bold' },
                      ]}
                    >
                      {copied ? '¡Copiado!' : 'Copiar Reporte'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={handleExportSyncPackage}
                    activeOpacity={0.7}
                  >
                    <Download size={14} color={COLORS.primary} style={{ marginRight: 5 }} />
                    <Text style={styles.secondaryActionText}>Descargar .json</Text>
                  </TouchableOpacity>
                </View>

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
              <View>
            {/* 1. CUADRÍCULA BENTO: COBRO EFECTIVO, GASTOS RUTA Y NETO A RENDIR */}
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
                <Text style={styles.splitSub}>
                  Cobrado hoy en calle
                </Text>
              </View>

              <View
                style={[
                  styles.splitCard,
                  { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
                ]}
              >
                <Text style={[styles.splitLabel, { color: '#c2410c' }]}>
                  🛠️ (-) GASTOS RUTA
                </Text>
                <Text
                  style={[styles.splitValue, { color: '#ea580c' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCOP(expensesToday)}
                </Text>
                <Text style={[styles.splitSub, { color: '#9a3412' }]}>
                  Pinchazo, datos, gasolina
                </Text>
              </View>
            </View>

            {(disbursedToday > 0 || recaudoRetiradoToday > 0) && (
              <View style={styles.splitRow}>
                {disbursedToday > 0 && (
                  <View
                    style={[
                      styles.splitCard,
                      { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
                    ]}
                  >
                    <Text style={[styles.splitLabel, { color: '#7e22ce' }]}>
                      📤 (-) DESEMBOLSOS RUTA
                    </Text>
                    <Text
                      style={[styles.splitValue, { color: '#7e22ce' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCOP(disbursedToday)}
                    </Text>
                    <Text style={[styles.splitSub, { color: '#6b21a8' }]}>
                      Préstamos y renovaciones hoy
                    </Text>
                  </View>
                )}
                {recaudoRetiradoToday > 0 && (
                  <View
                    style={[
                      styles.splitCard,
                      { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
                    ]}
                  >
                    <Text style={[styles.splitLabel, { color: '#1d4ed8' }]}>
                      🏦 (-) AVANCES OFICINA
                    </Text>
                    <Text
                      style={[styles.splitValue, { color: '#1d4ed8' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {formatCOP(recaudoRetiradoToday)}
                    </Text>
                    <Text style={[styles.splitSub, { color: '#1e40af' }]}>
                      Entregado antes del cierre
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View
              style={[
                styles.splitCard,
                { marginTop: 8, backgroundColor: COLORS.primaryLight, borderColor: COLORS.primaryBorder },
              ]}
            >
              <Text style={[styles.splitLabel, { color: COLORS.primary }]}>
                💰 (=) EFECTIVO NETO A RENDIR (CAJA OFICINA)
              </Text>
              <Text
                style={[styles.splitValue, { color: COLORS.primary, fontSize: 22 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCOP(netCashExpected)}
              </Text>
              <Text style={[styles.splitSub, { color: COLORS.textSecondary }]}>
                Monto que el cobrador debe entregar físicamente a la oficina
              </Text>
            </View>

            {/* 2. STATISTICS CHART: RECAUDO (#10b981) VS DESEMBOLSOS (#2563eb) */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeaderRow}>
                <BarChart3 size={16} color={COLORS.primary} />
                <Text style={styles.cardHeaderTitle}>
                  Flujo del Día: Cobrado Hoy vs. Desembolsos
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
                    <Text style={styles.barLabel}>Cobrado Hoy (Cuotas)</Text>
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
                    <Text style={styles.barLabel}>Salidas / Salientes (Paridos & Renovados)</Text>
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

              {/* Barra 3: Programado a Cobrar Hoy (Oculto a petición del usuario) */}
              {/* 
              <View style={styles.barGroup}>
                <View style={styles.barLabelRow}>
                  <View style={styles.legendRow}>
                    <View
                      style={[
                        styles.legendDot,
                        { backgroundColor: COLORS.textMuted },
                      ]}
                    />
                    <Text style={styles.barLabel}>Programado a Cobrar Hoy</Text>
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
                        width: `${Math.max(6, programadoRatio)}%`,
                        backgroundColor: COLORS.textMuted,
                      },
                    ]}
                  />
                </View>
              </View>
              */}
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

              {cashDifference > 0 && (
                <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fffbeb', borderRadius: 8, borderWidth: 1, borderColor: '#fde68a' }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                    onPress={() => setDeductPayroll(!deductPayroll)}
                  >
                    <View style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: deductPayroll ? COLORS.primary : COLORS.textMuted,
                      backgroundColor: deductPayroll ? COLORS.primary : '#ffffff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}>
                      {deductPayroll && <Check size={14} color="#ffffff" />}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#92400e', flex: 1 }}>
                      Descontar de Nómina al Cobrador (Consumo personal: gaseosa, almuerzo, agua)
                    </Text>
                  </TouchableOpacity>

                  {deductPayroll && (
                    <View style={{ marginTop: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309', marginBottom: 4 }}>
                        VALOR A DEDUCIR DE NÓMINA ($ COP):
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#ffffff', height: 42, marginBottom: 8 }]}
                        keyboardType="numeric"
                        value={payrollAmountStr || String(cashDifference)}
                        onChangeText={setPayrollAmountStr}
                        placeholder={String(cashDifference)}
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#b45309', marginBottom: 4 }}>
                        CONCEPTO DE CONSUMO PERSONAL:
                      </Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: '#ffffff', height: 42 }]}
                        value={payrollReason}
                        onChangeText={setPayrollReason}
                        placeholder="Ej: Gaseosa, almuerzo, bolsa de agua..."
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: '#b45309', fontStyle: 'italic', marginTop: 8 }}>
                    Nota operativa: Los gastos de ruta (combustible, imprevistos) se descuentan del efectivo de ruta. Los consumos personales se registran como deducción de nómina.
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

            {/* 4. TICKET DE CIERRE DIARIO Y PUENTE OFFLINE-FIRST */}
            <View style={styles.syncTicketCard}>
              <View style={styles.syncHeaderRow}>
                <FileText size={16} color={COLORS.primary} />
                <Text style={styles.syncTicketTitle}>
                  TICKET DE CIERRE DIARIO Y ARQUEO
                </Text>
              </View>
              <Text style={styles.syncTicketSubtitle}>
                Ruta: {session.routeId} • Jornada: {todayStr} • {session.status}
              </Text>

              <View style={styles.dashedDivider} />

              {/* Desglose Térmico de Operaciones de Calle */}
              <View style={styles.ticketLineRow}>
                <Text style={styles.ticketLabel}>Cobro Pleno ({payments.length} cuotas cobradas):</Text>
                <Text style={[styles.ticketValue, { color: COLORS.success }]}>
                  +{formatCOP(totalCollected)}
                </Text>
              </View>
              <View style={styles.ticketLineRow}>
                <Text style={styles.ticketLabelSub}>• Efectivo cobrado en mano:</Text>
                <Text style={styles.ticketValue}>{formatCOP(collectedCash)}</Text>
              </View>
              <View style={styles.ticketLineRow}>
                <Text style={styles.ticketLabelSub}>• Digital (Nequi / Bancos):</Text>
                <Text style={styles.ticketValue}>{formatCOP(collectedDigital)}</Text>
              </View>

              <View style={styles.dashedDivider} />

              <View style={styles.ticketLineRow}>
                <Text style={styles.ticketLabel}>
                  Salidas / Salientes ({metrics.salidasCount} préstamos paridos/renovados):
                </Text>
                <Text style={[styles.ticketValue, { color: COLORS.primary }]}>
                  {formatCOP(metrics.salidasCapitalPlaced)}
                </Text>
              </View>
              {metrics.salidasRefinancedBalance > 0 && (
                <View style={styles.ticketLineRow}>
                  <Text style={styles.ticketLabelSub}>
                    • Saldo refinanciado / saliente (no va al pleno):
                  </Text>
                  <Text style={[styles.ticketValue, { color: '#B45309', fontWeight: '800' }]}>
                    {formatCOP(metrics.salidasRefinancedBalance)}
                  </Text>
                </View>
              )}
              <View style={styles.ticketLineRow}>
                <Text style={styles.ticketLabelSub}>• Desembolso neto entregado en mano:</Text>
                <Text style={[styles.ticketValue, { color: COLORS.primary }]}>
                  -{formatCOP(disbursedToday)}
                </Text>
              </View>

              <View style={styles.dashedDivider} />

              <View style={styles.ticketLineRow}>
                <Text style={[styles.ticketLabel, { fontWeight: '800', color: COLORS.textPrimary }]}>
                  Diferencia Arqueo Físico:
                </Text>
                <Text
                  style={[
                    styles.ticketValue,
                    {
                      color: cashDifference === 0 ? COLORS.success : COLORS.danger,
                      fontWeight: '900',
                    },
                  ]}
                >
                  {cashDifference === 0 ? '✓ Cuadre Exacto ($0)' : formatCOP(cashDifference)}
                </Text>
              </View>

              <View style={styles.verificationHashBox}>
                <ShieldCheck size={13} color={COLORS.success} style={{ marginRight: 6 }} />
                <Text style={styles.verificationHashText}>
                  Sello Digital de Seguridad Auditado
                </Text>
              </View>

              <View style={styles.dashedDivider} />



              {/* ÍTEM 4: EXPORTACIÓN DE REPORTE CONTABLE ESTRUCTURADO EN EXCEL (.CSV) */}
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#f0fdf4',
                  borderWidth: 1,
                  borderColor: '#86efac',
                  borderRadius: 10,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  marginBottom: 10,
                }}
                onPress={handleExportAccountingCSV}
              >
                <FileSpreadsheet size={15} color="#15803d" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803d' }}>
                  📊 Exportar Reporte Contable Excel (.csv)
                </Text>
              </TouchableOpacity>


            </View>
          </View>
        )}
        </ScrollView>

          {/* Footer: solo visible en Fase 1 (Antes del cierre) */}
          {!settledRecord && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.confirmBtn, isSubmitting && styles.confirmBtnDisabled]}
                onPress={handleCloseSettlement}
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
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
  },
  syncTicketSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  ticketLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  ticketLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  ticketLabelSub: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    paddingLeft: 8,
  },
  ticketValue: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  verificationHashBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  verificationHashText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
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
    gap: 6,
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
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncExportBtnText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  syncFilePickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLavender,
    borderWidth: 1,
    borderColor: COLORS.purpleBorder,
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncFilePickBtnText: {
    color: COLORS.purple,
    fontSize: 11,
    fontWeight: '800',
  },
  syncImportToggleBtn: {
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    paddingVertical: 9,
    borderRadius: 10,
  },
  syncImportToggleText: {
    color: COLORS.textSecondary,
    fontSize: 11,
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
    fontSize: 19,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: -0.3,
    marginBottom: 4,
    textAlign: 'center',
  },
  postCloseSubtitle: {
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
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  receiptSubHeader: {
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
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  receiptLabelSub: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  receiptValue: {
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  receiptValueSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  receiptValueBold: {
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
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  receiptJustificationText: {
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: '600',
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
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  phoneInput: {
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
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  postCloseSecondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 40,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
