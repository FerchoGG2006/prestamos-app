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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { LoanFrequency } from '../../core/domain/types';
import { calculateLoanSummary, calculatePaperworkFee } from '../../core/domain/calculator';
import { formatCOP, addDays as addDaysToDate } from '../../core/config/business-rules';
import { UserPlus, X, Zap, Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ClientMediaAttachment, ClientMediaValue } from './ClientMediaAttachment';

interface NewCustomerModalProps {
  visible: boolean;
  todayStr: string;
  defaultRouteId?: string;
  isCollector?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  visible,
  todayStr,
  defaultRouteId,
  isCollector = false,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();
  // Datos del Cliente
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [referencePhone, setReferencePhone] = useState('');
  const availableRoutes = localStore.getRoutes();
  const initialRoute =
    defaultRouteId && defaultRouteId !== 'ALL'
      ? defaultRouteId
      : availableRoutes[0]?.id || 'route-norte';
  const [selectedRouteId, setSelectedRouteId] = useState(initialRoute);
  const [routeOrderStr, setRouteOrderStr] = useState('');

  useEffect(() => {
    if (visible) {
      const targetRoute =
        defaultRouteId && defaultRouteId !== 'ALL'
          ? defaultRouteId
          : localStore.getRoutes()[0]?.id || 'route-norte';
      setSelectedRouteId(targetRoute);
      if (isCollector) {
        const fixedRate = Math.round((localStore.getOfficeConfig().defaultInterestRate || 0.2) * 100);
        setInterestPercentStr(String(fixedRate));
      }
    }
  }, [visible, defaultRouteId, isCollector]);

  // Datos del Préstamo Inmediato o Migración de Cartulina Física
  const [withLoan, setWithLoan] = useState(true);
  const [isCardMigration, setIsCardMigration] = useState(false);
  const [paidInstallmentNums, setPaidInstallmentNums] = useState<number[]>([]);
  const [quickPaidCountStr, setQuickPaidCountStr] = useState('');
  const [principalStr, setPrincipalStr] = useState('300000');
  const [frequency, setFrequency] = useState<LoanFrequency>('DAILY');
  const [fixedDueDateStr, setFixedDueDateStr] = useState(() => addDaysToDate(todayStr, 7));
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [interestPercentStr, setInterestPercentStr] = useState(() =>
    String(Math.round((localStore.getOfficeConfig().defaultInterestRate || 0.2) * 100))
  );
  // Ley 1581 de 2012 (SIC): Casillas premarcadas no constituyen autorización válida; debe iniciar en false
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);
  const [mediaAttachment, setMediaAttachment] = useState<ClientMediaValue | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isFixedDate = frequency === 'FIXED_DATE';
  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const installmentCount = isFixedDate ? 1 : (parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 30);
  const interestRate = (parseFloat(interestPercentStr) || 20) / 100;

  const togglePaidInstallment = (num: number) => {
    setPaidInstallmentNums((prev) =>
      prev.includes(num) ? prev.filter((n) => n !== num) : [...prev, num].sort((a, b) => a - b)
    );
  };

  const applyQuickPaidCount = (rawCount: string) => {
    setQuickPaidCountStr(rawCount);
    const n = parseInt(rawCount.replace(/\D/g, ''), 10) || 0;
    const clamped = Math.max(0, Math.min(installmentCount, n));
    const arr: number[] = [];
    for (let i = 1; i <= clamped; i++) {
      arr.push(i);
    }
    setPaidInstallmentNums(arr);
  };

  const officeConfig = localStore.getOfficeConfig();
  const isPaperworkEnabled = officeConfig.paperworkFeeEnabled ?? true;
  const paperworkRate = officeConfig.paperworkRate || 5000;
  const isMigration = isCardMigration;

  const summary =
    principal > 0 && installmentCount > 0
      ? calculateLoanSummary(principal, interestRate, installmentCount)
      : null;
  const paperwork =
    principal > 0 && isPaperworkEnabled && !isMigration
      ? calculatePaperworkFee(principal, {
          rate: paperworkRate,
          base: 100000,
          calculationMode: 'PROPORTIONAL',
        })
      : 0;
  const netCashToDeliver = isMigration ? 0 : Math.max(0, principal - paperwork);

  const quickPrincipals = [150000, 200000, 300000, 500000];

  const frequencies: Array<{ key: LoanFrequency; label: string; defaultCount: number }> = [
    { key: 'DAILY', label: '☀️ Diario', defaultCount: 30 },
    { key: 'WEEKLY', label: '📆 Semanal', defaultCount: 4 },
    { key: 'BIWEEKLY', label: '🗓️ Quincenal', defaultCount: 2 },
    { key: 'MONTHLY', label: '🏛️ Mensual', defaultCount: 1 },
    { key: 'FIXED_DATE', label: '📅 Fecha Fija', defaultCount: 1 },
  ];

  const handleSelectFrequency = (freq: LoanFrequency, defaultCount: number) => {
    setFrequency(freq);
    setInstallmentCountStr(String(defaultCount));
    if (freq === 'FIXED_DATE' && !fixedDueDateStr) {
      setFixedDueDateStr(addDaysToDate(todayStr, 7));
    }
  };

  const resetForm = () => {
    setFullName('');
    setDocumentNumber('');
    setPhone('');
    setWhatsappPhone('');
    setAddress('');
    setNeighborhood('');
    setBusinessName('');
    setReferenceName('');
    setReferencePhone('');
    setPrincipalStr('300000');
    setFrequency('DAILY');
    setFixedDueDateStr(addDaysToDate(todayStr, 7));
    setInstallmentCountStr('30');
    setWithLoan(true);
    setIsCardMigration(false);
    setPaidInstallmentNums([]);
    setQuickPaidCountStr('');
    setDataConsentAccepted(false);
    setMediaAttachment(null);
  };

  const handleSaveCustomerAndLoan = async () => {
    if (!fullName.trim() || !documentNumber.trim()) {
      Alert.alert('Campos requeridos', 'Ingrese el nombre completo y número de cédula del cliente.');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Teléfono requerido', 'Ingrese el número telefónico para llamadas.');
      return;
    }

    if (!whatsappPhone.trim()) {
      Alert.alert('WhatsApp requerido', 'Ingrese el número de WhatsApp (puede ser el mismo de llamadas).');
      return;
    }

    if (!dataConsentAccepted) {
      Alert.alert(
        'Autorización de Datos Requerida (Ley 1581)',
        'Debe marcar expresamente que el titular autorizó el tratamiento de sus datos personales para originar y gestionar su obligación crediticia.'
      );
      return;
    }

    if (withLoan && principal <= 0) {
      Alert.alert('Capital requerido', 'Ingrese un monto de capital válido para desembolsar.');
      return;
    }

    if (withLoan && isFixedDate && !fixedDueDateStr.trim()) {
      Alert.alert('Fecha fija requerida', 'Por favor selecciona la fecha pactada para el cobro del crédito con fecha fija.');
      return;
    }

    setIsSubmitting(true);
    try {
      const parsedOrder = parseInt(routeOrderStr.replace(/\D/g, ''), 10);
      // 1. Crear el cliente
      const newCustomer = await localStore.createCustomer({
        fullName,
        documentNumber,
        phone,
        whatsappPhone,
        address,
        neighborhood,
        businessName,
        referenceName,
        referencePhone,
        routeId: selectedRouteId,
        orderIndex: !isNaN(parsedOrder) && parsedOrder > 0 ? parsedOrder : undefined,
        todayStr,
      });

      // 2. Si tiene préstamo inmediato o cartulina física a digital, originarlo en la misma operación
      if (withLoan && principal > 0) {
        const loanRes = await localStore.createLoan({
          customerId: newCustomer.id,
          principal,
          interestRate,
          installmentCount,
          frequency,
          routeId: selectedRouteId,
          collectorId: newCustomer.assignedCollectorId,
          todayStr,
          isCardMigration,
          paidInstallmentNumbers: isCardMigration ? paidInstallmentNums : undefined,
          fixedDueDate: isFixedDate ? fixedDueDateStr : undefined,
        });

        if (isCardMigration) {
          const paidTotal = loanRes.loan.installmentAmount * paidInstallmentNums.length;
          const pendingTotal = Math.max(0, loanRes.loan.totalAgreed - paidTotal);
          Alert.alert(
            '¡Cliente y Cartulina Digitalizados!',
            `Se registró a ${fullName} y se pasó su cartulina al crédito digital ${loanRes.loan.loanNumber}.\n\n` +
            `• Pagado en cartulina: ${paidInstallmentNums.length}/${installmentCount} cuotas (${formatCOP(paidTotal)})\n` +
            `• Saldo pendiente digital: ${formatCOP(pendingTotal)}\n` +
            `• Impacto en caja hoy: $0 (Caja protegida)`
          );
        } else {
          Alert.alert(
            '¡Cliente y Crédito Registrados!',
            `Se registró a ${fullName} y se generó el crédito ${loanRes.loan.loanNumber}.\n\n` +
            `• Modalidad: ${frequency}\n` +
            `• Capital: ${formatCOP(principal)}\n` +
            `• Cartulina / Papelería: ${isPaperworkEnabled && !isMigration ? formatCOP(paperwork) : '$0 (Desactivada)'}\n` +
            `• Efectivo neto entregado: ${formatCOP(netCashToDeliver)}\n` +
            `• Cuota: ${formatCOP(loanRes.loan.installmentAmount)}`
          );
        }
      } else {
        Alert.alert('Cliente Creado', `${fullName} fue agregado con éxito.`);
      }

      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Error al registrar', err.message || 'No se pudo completar el registro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.overlay, { paddingTop: Math.max(insets.top, 12) }]}
      >
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
        >
          <View style={styles.sheetHandle} />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Nuevo Cliente</Text>
              <Text style={styles.subtitle}>
                Ficha personal con desembolso de préstamo inmediato
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* SECCIÓN 1: DATOS PERSONALES */}
            <Text style={styles.sectionHeader}>1. DATOS PERSONALES Y CONTACTO</Text>

            <View style={styles.filledInputBlock}>
              <Text style={styles.floatingLabel}>NOMBRE COMPLETO DEL TITULAR *</Text>
              <TextInput
                style={styles.filledTextInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ej. Roberto Mendoza"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.filledInputBlock}>
              <Text style={styles.floatingLabel}>CÉDULA / NIT (SOLO NÚMEROS) *</Text>
              <TextInput
                style={styles.filledTextInput}
                keyboardType="numeric"
                value={documentNumber}
                onChangeText={(text) => setDocumentNumber(text.replace(/\D/g, ''))}
                placeholder="Ej. 1045678901"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            <View style={styles.row2}>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>TELÉFONO LLAMADAS *</Text>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(val) => {
                    setPhone(val);
                    if (!whatsappPhone) {
                      setWhatsappPhone(val);
                    }
                  }}
                  placeholder="Ej. 3001234567"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.floatingLabel}>TEL. WHATSAPP *</Text>
                  {phone.trim().length > 0 && whatsappPhone !== phone && (
                    <TouchableOpacity
                      onPress={() => setWhatsappPhone(phone)}
                      style={{ paddingHorizontal: 6, paddingVertical: 1, backgroundColor: '#E0F2FE', borderRadius: 4 }}
                    >
                      <Text style={{ fontSize: 9, color: '#0284C7', fontWeight: 'bold' }}>= Mismo</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="phone-pad"
                  value={whatsappPhone}
                  onChangeText={setWhatsappPhone}
                  placeholder="Ej. 3001234567"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>BARRIO / ZONA</Text>
                <TextInput
                  style={styles.filledTextInput}
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="Ej. Boston"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>NEGOCIO / LOCAL</Text>
                <TextInput
                  style={styles.filledTextInput}
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="Ej. Tienda La 54"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.filledInputBlock}>
              <Text style={styles.floatingLabel}>DIRECCIÓN DE COBRO</Text>
              <TextInput
                style={styles.filledTextInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Ej. Calle 54 # 43 - 10"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>

            {/* ÍTEM 3: ASIGNACIÓN DE RUTA Y ORDEN EN LA RUTA */}
            <View style={{ marginBottom: 10 }}>
              {!isCollector && (
                <>
                  <Text style={[styles.floatingLabel, { marginBottom: 6 }]}>
                    RUTA ASIGNADA Y POSICIÓN DE VISITA
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {availableRoutes.map((rt) => {
                      const isSel = selectedRouteId === rt.id;
                      return (
                        <TouchableOpacity
                          key={rt.id}
                          style={[
                            styles.quickPill,
                            isSel && styles.quickPillActive,
                            { paddingHorizontal: 12, paddingVertical: 7 },
                          ]}
                          onPress={() => setSelectedRouteId(rt.id)}
                        >
                          <Text
                            style={[
                              styles.quickPillText,
                              isSel && styles.quickPillTextActive,
                            ]}
                          >
                            🗺️ {rt.name} ({rt.code})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}
              <View style={styles.filledInputBlock}>
                <Text style={styles.floatingLabel}>
                  ORDEN EN LA RUTA (# DE PARADA OPCIONAL)
                </Text>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="numeric"
                  value={routeOrderStr}
                  onChangeText={(t) => setRouteOrderStr(t.replace(/\D/g, ''))}
                  placeholder="Automático al final de la ruta"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>REFERENCIA FAMILIAR</Text>
                <TextInput
                  style={styles.filledTextInput}
                  value={referenceName}
                  onChangeText={setReferenceName}
                  placeholder="Nombre familiar"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>TEL. REFERENCIA</Text>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="phone-pad"
                  value={referencePhone}
                  onChangeText={setReferencePhone}
                  placeholder="310..."
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </View>

            {/* REGISTRO FOTOGRÁFICO O VIDEO DEL CLIENTE */}
            <ClientMediaAttachment
              value={mediaAttachment}
              onChange={setMediaAttachment}
              title="FOTO O VIDEO DEL CLIENTE"
            />

            {/* SECCIÓN 2: TOGGLE DE PRÉSTAMO INMEDIATO */}
            <TouchableOpacity
              style={[styles.loanToggleCard, withLoan && styles.loanToggleCardActive]}
              activeOpacity={0.8}
              onPress={() => setWithLoan(!withLoan)}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Zap size={15} color={withLoan ? COLORS.primary : COLORS.textMuted} />
                  <Text style={[styles.loanToggleTitle, withLoan && { color: COLORS.primary }]}>
                    Desembolsar Préstamo Inmediato
                  </Text>
                </View>
                <Text style={styles.loanToggleSubtitle}>
                  Crea el cliente y entrega el crédito en un solo paso sin doble trabajo
                </Text>
              </View>

              <View style={[styles.togglePill, withLoan && styles.togglePillActive]}>
                <Text style={[styles.togglePillText, withLoan && styles.togglePillTextActive]}>
                  {withLoan ? 'SÍ' : 'NO'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* FORMULARIO DE ORIGINACIÓN DEL PRÉSTAMO O MIGRACIÓN DE CARTULINA FÍSICA */}
            {withLoan && (
              <View style={styles.loanSection}>
                <Text style={styles.sectionHeader}>2. MODALIDAD DE INGRESO DEL CRÉDITO</Text>

                {/* Selector: Nuevo Préstamo vs Pasar Cartulina Física a Digital */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: !isCardMigration ? '#0D9488' : '#E2E8F0',
                      backgroundColor: !isCardMigration ? '#E6F7F5' : '#F8FAFC',
                      alignItems: 'center',
                    }}
                    onPress={() => setIsCardMigration(false)}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '800',
                        color: !isCardMigration ? '#0F766E' : '#64748B',
                      }}
                    >
                      💵 Préstamo Nuevo
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1.2,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: isCardMigration ? '#0D9488' : '#E2E8F0',
                      backgroundColor: isCardMigration ? '#E6F7F5' : '#F8FAFC',
                      alignItems: 'center',
                    }}
                    onPress={() => setIsCardMigration(true)}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '800',
                        color: isCardMigration ? '#0F766E' : '#64748B',
                      }}
                    >
                      📋 Cartulina Física a Digital
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Capital y Botones Rápidos */}
                <View style={styles.filledInputBlock}>
                  <Text style={styles.floatingLabel}>CAPITAL A DESEMBOLSAR ($) *</Text>
                  <TextInput
                    style={[styles.filledTextInput, { fontSize: 18, fontWeight: '800' }]}
                    keyboardType="numeric"
                    value={principal > 0 ? formatCOP(principal) : ''}
                    onChangeText={(t) => setPrincipalStr(t.replace(/\D/g, ''))}
                    placeholder="$ 0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.quickPillsRow}>
                  {quickPrincipals.map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.quickPill,
                        principal === val && styles.quickPillActive,
                      ]}
                      onPress={() => setPrincipalStr(String(val))}
                    >
                      <Text
                        style={[
                          styles.quickPillText,
                          principal === val && styles.quickPillTextActive,
                        ]}
                      >
                        {formatCOP(val)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Modalidad / Frecuencia de Pago */}
                <Text style={[styles.floatingLabel, { marginTop: 10, marginBottom: 6 }]}>
                  MODALIDAD DE PAGO
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 12 }}
                  contentContainerStyle={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
                >
                  {frequencies.map((f) => {
                    const isSelected = frequency === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[
                          styles.freqBtn,
                          isSelected && styles.freqBtnActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                      >
                        <Text
                          style={[
                            styles.freqBtnText,
                            isSelected && styles.freqBtnTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Plazo o Fecha Fija y Tasa */}
                {isFixedDate ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[styles.floatingLabel, { marginBottom: 6 }]}>
                      FECHA FIJA DE PAGO ACORDADA
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.fixedDateSingleLineRow}
                    >
                      <View style={styles.fixedDateBadgeBox}>
                        <Calendar size={13} color="#2563EB" style={{ marginRight: 4 }} />
                        <TextInput
                          style={styles.fixedDateInlineInput}
                          value={fixedDueDateStr}
                          onChangeText={setFixedDueDateStr}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={COLORS.textMuted}
                        />
                      </View>

                      <TouchableOpacity
                        style={styles.btnOpenCalendarPill}
                        activeOpacity={0.8}
                        onPress={() => setCalendarModalVisible(true)}
                      >
                        <Text style={styles.btnOpenCalendarPillText}>🗓️ Calendario</Text>
                      </TouchableOpacity>

                      {[7, 15, 30].map((days) => (
                        <TouchableOpacity
                          key={days}
                          style={[
                            styles.quickDaysPillInline,
                            fixedDueDateStr === addDaysToDate(todayStr, days) && styles.quickDaysPillInlineActive,
                          ]}
                          onPress={() => setFixedDueDateStr(addDaysToDate(todayStr, days))}
                        >
                          <Text
                            style={[
                              styles.quickDaysPillInlineText,
                              fixedDueDateStr === addDaysToDate(todayStr, days) && { color: '#FFFFFF', fontWeight: '800' },
                            ]}
                          >
                            +{days}d
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    <View style={[styles.filledInputBlock, { marginTop: 6 }]}>
                      <Text style={styles.floatingLabel}>INTERÉS PACTADO (%)</Text>
                      <TextInput
                        style={[
                          styles.filledTextInput,
                          isCollector && {
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            fontWeight: '700',
                          },
                        ]}
                        keyboardType="numeric"
                        value={interestPercentStr}
                        editable={!isCollector}
                        onChangeText={setInterestPercentStr}
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.row2}>
                    <View style={[styles.filledInputBlock, { flex: 1 }]}>
                      <Text style={styles.floatingLabel}>
                        NÚMERO DE CUOTAS {frequency === 'DAILY' ? '(REC. 30 DÍAS)' : ''}
                      </Text>
                      <TextInput
                        style={styles.filledTextInput}
                        keyboardType="numeric"
                        value={installmentCountStr}
                        onChangeText={(t) => setInstallmentCountStr(t.replace(/\D/g, ''))}
                      />
                    </View>
                    <View style={[styles.filledInputBlock, { flex: 1 }]}>
                      <Text style={styles.floatingLabel}>INTERÉS PACTADO (%)</Text>
                      <TextInput
                        style={[
                          styles.filledTextInput,
                          isCollector && {
                            backgroundColor: '#F1F5F9',
                            color: '#475569',
                            fontWeight: '700',
                          },
                        ]}
                        keyboardType="numeric"
                        value={interestPercentStr}
                        editable={!isCollector}
                        onChangeText={setInterestPercentStr}
                      />
                    </View>
                  </View>
                )}

                {/* Cartulina Física Interactiva cuando se pasa de papel a digital */}
                {isCardMigration && summary && (
                  <View
                    style={{
                      backgroundColor: '#F8FAFC',
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: '#99F6E4',
                      marginBottom: 12,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E' }}>
                        📋 Marca las cuotas ya pagadas en la cartulina
                      </Text>
                      <View
                        style={{
                          backgroundColor: '#DCFCE7',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#166534' }}>
                          🛡️ Caja hoy: $0
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#475569' }}>
                        Cuotas ya pagadas:
                      </Text>
                      <TextInput
                        style={{
                          width: 64,
                          height: 34,
                          backgroundColor: '#FFFFFF',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: '#CBD5E1',
                          textAlign: 'center',
                          fontSize: 13,
                          fontWeight: '800',
                          color: '#0F172A',
                        }}
                        keyboardType="numeric"
                        value={quickPaidCountStr}
                        onChangeText={applyQuickPaidCount}
                        placeholder="Ej. 10"
                        placeholderTextColor="#94A3B8"
                      />
                      <TouchableOpacity
                        onPress={() => applyQuickPaidCount('0')}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 8,
                          backgroundColor: '#E2E8F0',
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#334155' }}>
                          Limpiar
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {Array.from({ length: installmentCount }, (_, i) => i + 1).map((num) => {
                        const isPaid = paidInstallmentNums.includes(num);
                        return (
                          <TouchableOpacity
                            key={num}
                            onPress={() => togglePaidInstallment(num)}
                            style={{
                              minWidth: 40,
                              height: 30,
                              borderRadius: 7,
                              borderWidth: 1,
                              borderColor: isPaid ? '#10B981' : '#CBD5E1',
                              backgroundColor: isPaid ? '#DCFCE7' : '#FFFFFF',
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 6,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '800',
                                color: isPaid ? '#065F46' : '#64748B',
                              }}
                            >
                              {num}
                              {isPaid ? ' ✓' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View
                      style={{
                        backgroundColor: '#ECFDF5',
                        borderRadius: 10,
                        padding: 9,
                        borderWidth: 1,
                        borderColor: '#A7F3D0',
                      }}
                    >
                      <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46' }}>
                        Pagado en cartulina: {formatCOP(summary.installmentAmount * paidInstallmentNums.length)} ({paidInstallmentNums.length}/{installmentCount})
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E', marginTop: 2 }}>
                        Saldo pendiente digital:{' '}
                        {formatCOP(Math.max(0, summary.totalAgreed - summary.installmentAmount * paidInstallmentNums.length))}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Resumen Financiero en Vivo */}
                {summary && (
                  <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Capital Solicitado:</Text>
                      <Text style={styles.summaryValue}>{formatCOP(principal)}</Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        {isMigration
                          ? 'Impacto Caja Hoy:'
                          : isPaperworkEnabled
                          ? `Cartulina / Papelería (${formatCOP(paperworkRate)} / $100k):`
                          : 'Cartulina / Papelería:'}
                      </Text>
                      <Text
                        style={[
                          styles.summaryValueMuted,
                          (!isPaperworkEnabled || isMigration) && { color: COLORS.textMuted },
                        ]}
                      >
                        {isMigration
                          ? '$ 0 (Cartulina física migrada)'
                          : isPaperworkEnabled && paperwork > 0
                          ? `- ${formatCOP(paperwork)}`
                          : '$ 0 (Desactivada por administración)'}
                      </Text>
                    </View>

                    <View style={styles.summaryDivider} />

                    <View style={styles.summaryRowHighlight}>
                      <Text style={styles.summaryLabelHighlight}>
                        💵 EFECTIVO NETO A ENTREGAR:
                      </Text>
                      <Text style={styles.summaryValueHighlight}>
                        {formatCOP(netCashToDeliver)}
                      </Text>
                    </View>

                    <View style={styles.summaryDivider} />

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Total a Cobrar:</Text>
                      <Text style={styles.summaryValueDark}>
                        {formatCOP(summary.totalAgreed)}
                      </Text>
                    </View>

                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        Valor Cuota ({installmentCount} cuotas {frequency.toLowerCase()}s):
                      </Text>
                      <Text style={styles.summaryValueGreen}>
                        {formatCOP(summary.installmentAmount)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Autorización Expresa de Tratamiento de Datos Personales (Ley 1581 de 2012 - SIC) */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setDataConsentAccepted(!dataConsentAccepted)}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                backgroundColor: dataConsentAccepted ? '#ECFDF5' : '#F8FAFC',
                borderWidth: 1.5,
                borderColor: dataConsentAccepted ? '#10B981' : '#CBD5E1',
                borderRadius: 12,
                padding: 12,
                marginTop: 6,
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: dataConsentAccepted ? '#059669' : '#64748B',
                  backgroundColor: dataConsentAccepted ? '#059669' : '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                {dataConsentAccepted && (
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>✓</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0F172A' }}>
                  Autorización de Tratamiento de Datos Personales (Ley 1581 de 2012) *
                </Text>
                <Text style={{ fontSize: 10.5, color: '#475569', marginTop: 2, lineHeight: 14 }}>
                  Certifico que el titular otorgó autorización previa, expresa e informada a la oficina acreedora ({localStore.getOfficeConfig().companyName || 'Oficina'}) para recolectar y tratar sus datos de identificación, ubicación y contacto con la finalidad exclusiva de originar, administrar y cobrar sus obligaciones crediticias.
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>

          {/* Botón Principal */}
          <TouchableOpacity
            style={[styles.saveBtn, isSubmitting && { opacity: 0.5 }]}
            onPress={handleSaveCustomerAndLoan}
            disabled={isSubmitting}
          >
            <UserPlus size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.saveBtnText}>
              {isSubmitting
                ? 'Procesando...'
                : withLoan
                ? isCardMigration
                  ? 'Pasar Cartulina Física a Digital'
                  : 'Registrar Cliente y Desembolsar'
                : 'Guardar Solo Cliente'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Modal de Calendario Interactivo para Fecha Fija */}
      <Modal
        visible={calendarModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={styles.calendarModalBackdrop}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarModalHeader}>
              <View>
                <Text style={styles.calendarModalTitle}>📅 Fecha Fija de Pago</Text>
                <Text style={styles.calendarModalSubtitle}>Selecciona el día acordado para el cobro</Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={styles.calendarCloseBtn}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Selector de Mes */}
            <View style={styles.calendarMonthRow}>
              <TouchableOpacity
                onPress={() => {
                  if (calendarMonth === 0) {
                    setCalendarMonth(11);
                    setCalendarYear(calendarYear - 1);
                  } else {
                    setCalendarMonth(calendarMonth - 1);
                  }
                }}
                style={styles.monthNavBtn}
              >
                <ChevronLeft size={18} color="#1E293B" />
              </TouchableOpacity>

              <Text style={styles.monthNameText}>
                {[
                  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
                ][calendarMonth]}{' '}{calendarYear}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  if (calendarMonth === 11) {
                    setCalendarMonth(0);
                    setCalendarYear(calendarYear + 1);
                  } else {
                    setCalendarMonth(calendarMonth + 1);
                  }
                }}
                style={styles.monthNavBtn}
              >
                <ChevronRight size={18} color="#1E293B" />
              </TouchableOpacity>
            </View>

            {/* Cabecera de Días de Semana */}
            <View style={styles.calendarWeekdaysRow}>
              {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'].map((d, idx) => (
                <Text key={idx} style={styles.calendarWeekdayText}>{d}</Text>
              ))}
            </View>

            {/* Cuadrícula de Días */}
            <View style={styles.calendarDaysGrid}>
              {(() => {
                const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
                const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                const cells = [];
                for (let i = 0; i < firstDayIndex; i++) {
                  cells.push(<View key={`empty-${i}`} style={styles.calendarDayCellEmpty} />);
                }
                for (let day = 1; day <= daysInMonth; day++) {
                  const mStr = String(calendarMonth + 1).padStart(2, '0');
                  const dStr = String(day).padStart(2, '0');
                  const cellDate = `${calendarYear}-${mStr}-${dStr}`;
                  const isSelected = fixedDueDateStr === cellDate;
                  const isToday = todayStr === cellDate;
                  cells.push(
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={[
                        styles.calendarDayCell,
                        isSelected && styles.calendarDayCellSelected,
                        isToday && !isSelected && styles.calendarDayCellToday,
                      ]}
                      onPress={() => {
                        setFixedDueDateStr(cellDate);
                      }}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          isSelected && styles.calendarDayTextSelected,
                          isToday && !isSelected && styles.calendarDayTextToday,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return cells;
              })()}
            </View>

            {/* Atajos Rápidos */}
            <View style={styles.calendarQuickRow}>
              {[
                { label: '+7 días', days: 7 },
                { label: '+15 días', days: 15 },
                { label: '+20 días', days: 20 },
                { label: '+30 días', days: 30 },
              ].map((item) => (
                <TouchableOpacity
                  key={item.days}
                  style={[
                    styles.calendarQuickPill,
                    fixedDueDateStr === addDaysToDate(todayStr, item.days) && styles.calendarQuickPillActive,
                  ]}
                  onPress={() => {
                    const target = addDaysToDate(todayStr, item.days);
                    setFixedDueDateStr(target);
                    const [y, m] = target.split('-');
                    setCalendarYear(parseInt(y, 10));
                    setCalendarMonth(parseInt(m, 10) - 1);
                  }}
                >
                  <Text
                    style={[
                      styles.calendarQuickPillText,
                      fixedDueDateStr === addDaysToDate(todayStr, item.days) && styles.calendarQuickPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fecha seleccionada en una sola línea y botón aceptar */}
            <View style={styles.calendarFooterRow}>
              <Text style={styles.calendarFooterPreview}>
                Fecha fija: <Text style={{ fontWeight: '800', color: COLORS.primary }}>{fixedDueDateStr}</Text>
              </Text>
              <TouchableOpacity
                style={styles.calendarConfirmBtn}
                onPress={() => setCalendarModalVisible(false)}
              >
                <Text style={styles.calendarConfirmBtnText}>Aceptar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
    flexShrink: 1,
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
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 8,
  },
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  filledInputBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    marginBottom: 10,
  },
  floatingLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.4,
  },
  filledTextInput: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 2,
  },
  // TOGGLE CARD
  loanToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginTop: 6,
    marginBottom: 12,
  },
  loanToggleCardActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryBorder,
  },
  loanToggleTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  loanToggleSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  togglePillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  togglePillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  togglePillTextActive: {
    color: '#FFFFFF',
  },
  // LOAN SECTION
  loanSection: {
    marginTop: 2,
  },
  quickPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  quickPill: {
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  quickPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  quickPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  freqRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  freqBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  freqBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  freqBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  freqBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // SUMMARY CARD
  summaryCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginTop: 8,
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryRowHighlight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  summaryLabelHighlight: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  summaryValue: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  summaryValueMuted: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '700',
  },
  summaryValueHighlight: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    color: COLORS.success,
    fontWeight: '900',
  },
  summaryValueDark: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  summaryValueGreen: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '800',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  // FECHA FIJA Y CALENDARIO INTERACTIVO
  fixedDateSingleLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
    marginBottom: 4,
  },
  fixedDateBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fixedDateInlineInput: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    paddingVertical: 0,
    minWidth: 84,
  },
  btnOpenCalendarPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  btnOpenCalendarPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  quickDaysPillInline: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickDaysPillInlineActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickDaysPillInlineText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarModalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarModalSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  calendarCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 10,
  },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNameText: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarWeekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  calendarWeekdayText: {
    width: 38,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  calendarDayCellEmpty: {
    width: `${100 / 7}%`,
    height: 36,
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  calendarDayCellSelected: {
    backgroundColor: '#2563EB',
  },
  calendarDayCellToday: {
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  calendarDayText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarDayTextToday: {
    color: '#2563EB',
    fontWeight: '800',
  },
  calendarQuickRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  calendarQuickPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarQuickPillActive: {
    backgroundColor: '#0F172A',
  },
  calendarQuickPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  calendarQuickPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarFooterPreview: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#475569',
  },
  calendarConfirmBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  calendarConfirmBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
