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
import { formatCOP } from '../../core/config/business-rules';
import { UserPlus, X, Zap } from 'lucide-react-native';

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
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [interestPercentStr, setInterestPercentStr] = useState(() =>
    String(Math.round((localStore.getOfficeConfig().defaultInterestRate || 0.2) * 100))
  );
  // Ley 1581 de 2012 (SIC): Casillas premarcadas no constituyen autorización válida; debe iniciar en false
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const installmentCount = parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 30;
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

  const summary =
    principal > 0 && installmentCount > 0
      ? calculateLoanSummary(principal, interestRate, installmentCount)
      : null;
  const paperwork = principal > 0 ? calculatePaperworkFee(principal) : 0;
  const netCashToDeliver = Math.max(0, principal - paperwork);

  const quickPrincipals = [150000, 200000, 300000, 500000];

  const frequencies: Array<{ key: LoanFrequency; label: string; defaultCount: number }> = [
    { key: 'DAILY', label: 'Diario', defaultCount: 30 },
    { key: 'WEEKLY', label: 'Semanal', defaultCount: 4 },
    { key: 'BIWEEKLY', label: 'Quincenal', defaultCount: 2 },
    { key: 'MONTHLY', label: 'Mensual', defaultCount: 1 },
  ];

  const handleSelectFrequency = (freq: LoanFrequency, defaultCount: number) => {
    setFrequency(freq);
    setInstallmentCountStr(String(defaultCount));
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
    setInstallmentCountStr('30');
    setWithLoan(true);
    setIsCardMigration(false);
    setPaidInstallmentNums([]);
    setQuickPaidCountStr('');
    setDataConsentAccepted(false);
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
            `• Cartulina / Papelería: ${formatCOP(paperwork)}\n` +
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
                <View style={styles.freqRow}>
                  {frequencies.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[
                        styles.freqBtn,
                        frequency === f.key && styles.freqBtnActive,
                      ]}
                      onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                    >
                      <Text
                        style={[
                          styles.freqBtnText,
                          frequency === f.key && styles.freqBtnTextActive,
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Plazo y Tasa */}
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
                        Cartulina / Papelería (aprox. $1.000):
                      </Text>
                      <Text style={styles.summaryValueMuted}>- {formatCOP(paperwork)}</Text>
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
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  quickPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  quickPillTextActive: {
    color: '#FFFFFF',
  },
  freqRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  freqBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  freqBtnActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  freqBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  freqBtnTextActive: {
    color: '#1D4ED8',
    fontWeight: '900',
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
    backgroundColor: COLORS.dockBg,
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
});
