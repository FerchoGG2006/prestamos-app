import React, { useState, useEffect, useMemo } from 'react';
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
import { Customer, Loan, LoanFrequency } from '../../core/domain/types';
import { ClientMediaAttachment, ClientMediaValue } from './ClientMediaAttachment';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { formatCOP, addDays as addDaysToDate } from '../../core/config/business-rules';
import {
  calculateLoanSummary,
  calculatePaperworkFee,
  generateAnchoredMigrationSchedule,
  getUpcomingWeekdayDate,
} from '../../core/domain/calculator';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { supabaseSyncService } from '../../infrastructure/sync/supabase-client';
import {
  OfficialReceiptModal,
  ConfirmationStepItem,
} from './OfficialReceiptModal';
import {
  OfficialReceiptData,
  buildLoanOfficialReceipt,
} from '../../core/utils/whatsapp-receipt';
import {
  FilePlus2,
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Users,
  UserPlus,
  Wallet,
  ClipboardList,
  Search,
  Check,
} from 'lucide-react-native';

interface NewLoanModalProps {
  visible: boolean;
  customers: Customer[];
  loans: Loan[];
  todayStr: string;
  defaultRouteId?: string;
  baseAvailable?: number;
  preselectedCustomerId?: string;
  initialFrequency?: LoanFrequency;
  initialFixedDueDate?: string;
  initialCustomerMode?: 'EXISTING' | 'NEW';
  isCollector?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewLoanModal: React.FC<NewLoanModalProps> = ({
  visible,
  customers,
  loans,
  todayStr,
  defaultRouteId,
  baseAvailable,
  preselectedCustomerId,
  initialFrequency,
  initialFixedDueDate,
  initialCustomerMode,
  isCollector = false,
  onClose,
  onSuccess,
}) => {
  const insets = useSafeAreaInsets();

  // Modo de selección de titular: existente vs cliente nuevo
  const [customerMode, setCustomerMode] = useState<'EXISTING' | 'NEW'>('EXISTING');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(preselectedCustomerId || '');
  const [customerSearch, setCustomerSearch] = useState<string>('');

  // Campos para registro de Nuevo Cliente dentro del mismo flujo
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [routeOrderStr, setRouteOrderStr] = useState('');
  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);

  const availableRoutes = localStore.getRoutes();
  const initialRoute =
    defaultRouteId && defaultRouteId !== 'ALL'
      ? defaultRouteId
      : availableRoutes[0]?.id || '';
  const [selectedRouteId, setSelectedRouteId] = useState(initialRoute);

  const [withLoan, setWithLoan] = useState<boolean>(true);
  const [isCardMigration, setIsCardMigration] = useState<boolean>(false);
  const [paidInstallmentNums, setPaidInstallmentNums] = useState<number[]>([]);
  const [quickPaidCountStr, setQuickPaidCountStr] = useState<string>('');
  const [principalStr, setPrincipalStr] = useState('200000');
  const [frequency, setFrequency] = useState<LoanFrequency>(initialFrequency || 'DAILY');
  const [installmentCountStr, setInstallmentCountStr] = useState('30');
  const [fixedDueDateStr, setFixedDueDateStr] = useState<string>(
    () => initialFixedDueDate || addDaysToDate(todayStr, 7)
  );
  const [migrationNextDueDateStr, setMigrationNextDueDateStr] = useState<string>(
    () => todayStr
  );
  const [calendarTarget, setCalendarTarget] = useState<'FIXED_DATE' | 'MIGRATION_PAYDAY'>('FIXED_DATE');
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [calendarYear, setCalendarYear] = useState<number>(() => {
    try {
      return parseInt(todayStr.split('-')[0], 10) || new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  });
  const [calendarMonth, setCalendarMonth] = useState<number>(() => {
    try {
      return parseInt(todayStr.split('-')[1], 10) - 1 || new Date().getMonth();
    } catch {
      return new Date().getMonth();
    }
  });
  const officeConfig = localStore.getOfficeConfig();
  const [interestPercentStr, setInterestPercentStr] = useState<string>(() =>
    String(Math.round((localStore.getOfficeConfig().defaultInterestRate || 0.2) * 100))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [mediaAttachment, setMediaAttachment] = useState<ClientMediaValue | null>(null);
  const [loanOfficialReceipt, setLoanOfficialReceipt] = useState<OfficialReceiptData | null>(null);
  const [showLoanReceiptFlow, setShowLoanReceiptFlow] = useState(false);
  const [loanProcessingSteps, setLoanProcessingSteps] = useState<ConfirmationStepItem[]>([]);
  const [loanProcessingCustomerName, setLoanProcessingCustomerName] = useState('');

  useEffect(() => {
    if (visible) {
      setFormError('');
      setShowLoanReceiptFlow(false);
      setLoanOfficialReceipt(null);
      setLoanProcessingSteps([]);
      const targetRoute =
        defaultRouteId && defaultRouteId !== 'ALL'
          ? defaultRouteId
          : localStore.getRoutes()[0]?.id || '';
      setSelectedRouteId(targetRoute);

      setWithLoan(true);
      const lastLoanWasTaco = Boolean(
        loans[0]?.notes?.startsWith('Migrado de cartulina')
      );
      if (isCollector) {
        // El cobrador nunca puede activar el modo de migración de cartulina física
        setIsCardMigration(false);
        if (preselectedCustomerId) {
          setCustomerMode('EXISTING');
          setSelectedCustomerId(preselectedCustomerId);
        } else if (customers.length === 0) {
          setCustomerMode('NEW');
        } else if (initialCustomerMode) {
          setCustomerMode(initialCustomerMode);
        } else {
          setCustomerMode('EXISTING');
        }
      } else if (preselectedCustomerId) {
        setCustomerMode('EXISTING');
        setSelectedCustomerId(preselectedCustomerId);
        setIsCardMigration(false);
      } else if (customers.length === 0 || loans.length === 0 || lastLoanWasTaco) {
        setCustomerMode('NEW');
        setIsCardMigration(true);
      } else if (initialCustomerMode) {
        setCustomerMode(initialCustomerMode);
      } else {
        setCustomerMode('EXISTING');
      }

      if (initialFrequency) {
        setFrequency(initialFrequency);
      }
      if (initialFixedDueDate) {
        setFixedDueDateStr(initialFixedDueDate);
      }
      setMigrationNextDueDateStr(todayStr);
      const cfgRate = localStore.getOfficeConfig().defaultInterestRate || 0.2;
      setInterestPercentStr(String(Math.round(cfgRate * 100)));
    }
  }, [visible, preselectedCustomerId, initialFrequency, initialFixedDueDate, defaultRouteId, isCollector, todayStr]);

  const resetNewCustomerFields = () => {
    setFullName('');
    setDocumentNumber('');
    setPhone('');
    setWhatsappPhone('');
    setAddress('');
    setNeighborhood('');
    setBusinessName('');
    setRouteOrderStr('');
    setDataConsentAccepted(false);
    setMediaAttachment(null);
    setFormError('');
  };

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

  const principal = parseInt(principalStr.replace(/\D/g, ''), 10) || 0;
  const isFixedDate = frequency === 'FIXED_DATE';
  const parsedInstallmentCount = parseInt(installmentCountStr.replace(/\D/g, ''), 10) || 0;
  const installmentCount = isFixedDate ? 1 : parsedInstallmentCount;

  const getFirstDueDate = (): string => {
    if (isFixedDate) return fixedDueDateStr;
    if (frequency === 'DAILY') return addDaysToDate(todayStr, 1);
    if (frequency === 'WEEKLY') return addDaysToDate(todayStr, 7);
    if (frequency === 'BIWEEKLY') return addDaysToDate(todayStr, 15);
    if (frequency === 'MONTHLY') return addDaysToDate(todayStr, 30);
    return addDaysToDate(todayStr, 1);
  };
  const firstDueDateStr = getFirstDueDate();

  const effectiveInterestRate = Math.max(0, (parseFloat(interestPercentStr.replace(',', '.')) || 0) / 100);
  const summary =
    principal > 0 && installmentCount > 0
      ? calculateLoanSummary(principal, effectiveInterestRate, installmentCount)
      : null;
  const isPaperworkEnabled = officeConfig.paperworkFeeEnabled ?? true;
  const isMigration = isCollector ? false : isCardMigration;

  const formatShortDateEs = (isoDate: string): string => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
    const d = new Date(isoDate + 'T00:00:00');
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const formatTinyDayMonth = (isoDate: string): string => {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '';
    const [, m, day] = isoDate.split('-');
    return `${day}/${m}`;
  };

  const migrationTomorrowStr = useMemo(() => {
    const tmr = addDaysToDate(todayStr, 1);
    if (frequency === 'DAILY' && (officeConfig.excludeSundays ?? true)) {
      const d = new Date(tmr + 'T00:00:00');
      if (d.getDay() === 0) return addDaysToDate(todayStr, 2);
    }
    return tmr;
  }, [todayStr, frequency, officeConfig.excludeSundays]);

  const migrationPreview = useMemo(() => {
    if (!isMigration || isFixedDate || !summary || !/^\d{4}-\d{2}-\d{2}$/.test(migrationNextDueDateStr)) {
      return null;
    }
    return generateAnchoredMigrationSchedule({
      loanId: 'preview',
      summary,
      frequency,
      nextDueDateStr: migrationNextDueDateStr,
      paidInstallmentNumbers: paidInstallmentNums,
      config: {
        defaultInterestRate: summary.interestRate,
        defaultInstallmentsCount: summary.installmentCount,
        defaultFrequency: frequency,
        excludeSundays: officeConfig.excludeSundays ?? true,
        interestType: 'FLAT_INITIAL_CAPITAL',
      },
    });
  }, [isMigration, isFixedDate, summary, frequency, migrationNextDueDateStr, paidInstallmentNums, officeConfig.excludeSundays]);

  const openCalendarFor = (target: 'FIXED_DATE' | 'MIGRATION_PAYDAY') => {
    const baseDate = target === 'MIGRATION_PAYDAY' ? migrationNextDueDateStr : fixedDueDateStr;
    if (/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) {
      const [y, m] = baseDate.split('-');
      setCalendarYear(parseInt(y, 10));
      setCalendarMonth(parseInt(m, 10) - 1);
    }
    setCalendarTarget(target);
    setCalendarModalVisible(true);
  };

  const activeCalendarDate =
    calendarTarget === 'MIGRATION_PAYDAY' ? migrationNextDueDateStr : fixedDueDateStr;
  const setActiveCalendarDate = (dateStr: string) => {
    if (calendarTarget === 'MIGRATION_PAYDAY') {
      setMigrationNextDueDateStr(dateStr);
    } else {
      setFixedDueDateStr(dateStr);
    }
  };
  const paperwork =
    principal > 0 && isPaperworkEnabled
      ? calculatePaperworkFee(principal, {
        rate: officeConfig.paperworkRate || 5000,
        base: 100000,
        calculationMode: 'PROPORTIONAL',
      })
      : 0;
  const netCashToDeliver = isMigration ? 0 : Math.max(0, principal - paperwork);

  const quickPrincipals = [100000, 150000, 200000, 300000, 500000];

  const frequencies: Array<{
    key: LoanFrequency;
    label: string;
    shortLabel: string;
    unitLabel: string;
    questionLabel: string;
    defaultCount: number;
    options: number[];
  }> = [
    { key: 'DAILY', label: 'Diario', shortLabel: 'Diario', unitLabel: 'días', questionLabel: '¿A cuántos días hábiles? (Recomendado: 30 días)', defaultCount: 30, options: [20, 24, 30, 36, 40] },
    { key: 'WEEKLY', label: 'Semanal', shortLabel: 'Semanal', unitLabel: 'semanas', questionLabel: '¿A cuántas semanas?', defaultCount: 4, options: [4, 6, 8, 10, 12] },
    { key: 'BIWEEKLY', label: 'Quincenal', shortLabel: 'Quincenal', unitLabel: 'quincenas', questionLabel: '¿A cuántas quincenas?', defaultCount: 2, options: [2, 4, 6, 8] },
    { key: 'MONTHLY', label: 'Mensual', shortLabel: 'Mensual', unitLabel: 'meses', questionLabel: '¿A cuántos meses?', defaultCount: 1, options: [1, 2, 3, 6] },
    { key: 'FIXED_DATE', label: 'Fecha Fija', shortLabel: 'Fecha Fija', unitLabel: 'pago único', questionLabel: 'Fecha de Pago Único Acordada', defaultCount: 1, options: [] },
  ];

  const currentFreqConfig = frequencies.find((f) => f.key === frequency) || frequencies[0];

  const handleSelectFrequency = (freq: LoanFrequency, defaultCount: number) => {
    setFrequency(freq);
    setInstallmentCountStr(String(defaultCount));
    if (freq === 'FIXED_DATE' && !fixedDueDateStr) {
      setFixedDueDateStr(addDaysToDate(todayStr, 7));
    }
  };

  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 180);

  const filteredCustomers = useMemo(() => {
    const q = debouncedCustomerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => {
      return (
        c.fullName?.toLowerCase().includes(q) ||
        c.documentNumber?.toLowerCase().includes(q) ||
        c.neighborhood?.toLowerCase().includes(q)
      );
    });
  }, [customers, debouncedCustomerSearch]);

  const handleCreateLoan = async (keepOpenForNextTaco: boolean = false) => {
    setFormError('');
    if (withLoan && principal <= 0) {
      const msg = 'Ingrese un monto de capital mayor a $0.';
      setFormError(msg);
      Alert.alert('Capital inválido', msg);
      return;
    }
    if (withLoan && !isFixedDate && installmentCount <= 0) {
      const msg = `Ingrese una cantidad de ${currentFreqConfig.unitLabel} mayor a 0.`;
      setFormError(msg);
      Alert.alert('Plazo inválido', msg);
      return;
    }
    if (withLoan && isFixedDate && !fixedDueDateStr) {
      const msg = 'Seleccione o ingrese la fecha fija de vencimiento.';
      setFormError(msg);
      Alert.alert('Fecha inválida', msg);
      return;
    }
    if (
      withLoan &&
      !isCollector &&
      isCardMigration &&
      !isFixedDate &&
      !/^\d{4}-\d{2}-\d{2}$/.test(migrationNextDueDateStr.trim())
    ) {
      const msg = 'Seleccione un Día de pago válido (YYYY-MM-DD).';
      setFormError(msg);
      Alert.alert('Día de pago inválido', msg);
      return;
    }

    let targetCustomerId = selectedCustomerId;
    let targetRouteId: string | undefined;
    let targetCollectorId: string | undefined;

    if (customerMode === 'NEW') {
      if (!fullName.trim() || !documentNumber.trim()) {
        const msg = 'Ingrese el nombre completo y el número de cédula del nuevo cliente.';
        setFormError(msg);
        Alert.alert('Campos requeridos', msg);
        return;
      }
      const effectivePhone = phone.trim() || whatsappPhone.trim();
      if (!effectivePhone) {
        const msg = 'Ingrese el número telefónico del nuevo cliente.';
        setFormError(msg);
        Alert.alert('Teléfono requerido', msg);
        return;
      }
      if (!dataConsentAccepted) {
        const msg = 'Marque la casilla de autorización de tratamiento de datos personales (Ley 1581) para continuar.';
        setFormError(msg);
        Alert.alert('Autorización requerida (Ley 1581)', msg);
        return;
      }
    } else {
      if (!targetCustomerId) {
        const msg = 'Seleccione un titular de la lista o cambie a la pestaña "Nuevo Cliente".';
        setFormError(msg);
        Alert.alert('Seleccione un cliente', msg);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (customerMode === 'NEW') {
        const parsedOrder = parseInt(routeOrderStr.replace(/\D/g, ''), 10);
        const createdCustomer = await localStore.createCustomer({
          fullName: fullName.trim(),
          documentNumber: documentNumber.trim(),
          phone: (phone.trim() || whatsappPhone.trim()),
          whatsappPhone: (whatsappPhone.trim() || phone.trim()),
          address: address.trim() || 'Por actualizar',
          neighborhood: neighborhood.trim() || 'General',
          businessName: businessName.trim(),
          referenceName: '',
          referencePhone: '',
          routeId: selectedRouteId,
          orderIndex: !isNaN(parsedOrder) && parsedOrder > 0 ? parsedOrder : undefined,
          todayStr,
        });
        targetCustomerId = createdCustomer.id;
        targetRouteId = selectedRouteId;
        targetCollectorId = createdCustomer.assignedCollectorId;
      }

      if (!withLoan) {
        Alert.alert(
          'Cliente Registrado',
          `${fullName.trim()} fue registrado exitosamente en el directorio de la ruta.`
        );
      } else {
        const effectiveMigration = isCollector ? false : isCardMigration;
        const resolvedCustomerBefore =
          customers.find((c) => c.id === targetCustomerId) ||
          localStore.getCustomers().find((c) => c.id === targetCustomerId);

        if (!effectiveMigration) {
          setLoanProcessingCustomerName(resolvedCustomerBefore?.fullName || fullName.trim() || 'Cliente');
          setShowLoanReceiptFlow(true);
          setLoanOfficialReceipt(null);
          setLoanProcessingSteps([
            { label: 'Validando titular y monto', state: 'done' },
            { label: 'Registrando préstamo y plan de cuotas', state: 'active' },
            { label: 'Publicando comprobante oficial', state: 'pending' },
            { label: 'Comprobante listo', state: 'pending' },
          ]);
        }

        const res = await localStore.createLoan({
          customerId: targetCustomerId,
          principal,
          interestRate: effectiveInterestRate,
          installmentCount,
          frequency,
          routeId: targetRouteId,
          collectorId: targetCollectorId,
          fixedDueDate: isFixedDate ? fixedDueDateStr : undefined,
          nextDueDate: effectiveMigration && !isFixedDate ? migrationNextDueDateStr.trim() : undefined,
          todayStr,
          isCardMigration: effectiveMigration,
          paidInstallmentNumbers: effectiveMigration ? paidInstallmentNums : undefined,
        });

        if (effectiveMigration) {
          const paidTotal = res.loan.installmentAmount * paidInstallmentNums.length;
          const pendingTotal = Math.max(0, res.loan.totalAgreed - paidTotal);
          Alert.alert(
            'Cartulina del Taco Pasada a Digital',
            `Crédito ${res.loan.loanNumber} digitalizado con éxito.\n\n` +
            `• Aporte al Administrativo: ${formatCOP(res.loan.totalAgreed)}\n` +
            `• Cobrado en el taco (entra a Base): ${paidInstallmentNums.length} de ${installmentCount} (${formatCOP(paidTotal)})\n` +
            `• Saldo pendiente (entra a Cartera en Calle): ${formatCOP(pendingTotal)}\n` +
            `• Cartulina / Papelería registrada: ${isPaperworkEnabled ? formatCOP(paperwork) : '$0 (Desactivada)'}`
          );
        } else {
          setLoanProcessingSteps([
            { label: 'Validando titular y monto', state: 'done' },
            { label: 'Registrando préstamo y plan de cuotas', state: 'done' },
            { label: 'Publicando comprobante oficial', state: 'active' },
            { label: 'Comprobante listo', state: 'pending' },
          ]);

          const finalCustomer =
            localStore.getCustomers().find((c) => c.id === targetCustomerId) ||
            resolvedCustomerBefore || {
              id: targetCustomerId,
              fullName: fullName.trim() || 'Cliente',
              documentNumber: documentNumber.trim(),
              phone: phone.trim() || whatsappPhone.trim(),
              whatsappPhone: whatsappPhone.trim() || phone.trim(),
              address: address.trim(),
              neighborhood: neighborhood.trim(),
              city: '',
              references: [],
              occupation: '',
              status: 'ACTIVE' as const,
              routeId: res.loan.routeId,
              assignedCollectorId: res.loan.collectorId,
              createdAt: todayStr,
              updatedAt: todayStr,
            };

          const draftReceipt = buildLoanOfficialReceipt({
            companyName: officeConfig.companyName || 'Mi Oficina',
            routeName: localStore.getRouteDisplayName(res.loan.routeId),
            collectorName: localStore.getCollectorDisplayName(res.loan.collectorId),
            footerMessage: officeConfig.receiptFooterMessage,
            customer: finalCustomer,
            loan: res.loan,
            paperworkFee: isPaperworkEnabled ? paperwork : 0,
            firstDueDate: firstDueDateStr,
          });
          const published = await supabaseSyncService.issueOfficialReceipt(draftReceipt);
          setLoanProcessingSteps([
            { label: 'Validando titular y monto', state: 'done' },
            { label: 'Registrando préstamo y plan de cuotas', state: 'done' },
            { label: 'Publicando comprobante oficial', state: 'done' },
            { label: 'Comprobante listo', state: 'done' },
          ]);
          await new Promise((r) => setTimeout(r, 120));
          resetNewCustomerFields();
          setPaidInstallmentNums([]);
          setQuickPaidCountStr('');
          setMigrationNextDueDateStr(todayStr);
          setLoanOfficialReceipt(published.receipt);
          onSuccess();
          return;
        }
      }
      resetNewCustomerFields();
      setPaidInstallmentNums([]);
      setQuickPaidCountStr('');
      setMigrationNextDueDateStr(todayStr);
      onSuccess();
      if (keepOpenForNextTaco && !isCollector) {
        setCustomerMode('NEW');
        setIsCardMigration(true);
      } else {
        onClose();
      }
    } catch (err: any) {
      setShowLoanReceiptFlow(false);
      const errMsg = err.message || 'Error al crear préstamo';
      setFormError(errMsg);
      Alert.alert('No se pudo crear', errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showLoanReceiptFlow) {
    return (
      <OfficialReceiptModal
        visible={visible}
        receipt={loanOfficialReceipt}
        isProcessing={isSubmitting || !loanOfficialReceipt}
        processingTitle="Confirmando préstamo"
        processingAmount={principal}
        processingSubtitle={loanProcessingCustomerName}
        processingSteps={loanProcessingSteps}
        closeLabel="Finalizar"
        onClose={() => {
          setShowLoanReceiptFlow(false);
          setLoanOfficialReceipt(null);
          onClose();
        }}
      />
    );
  }

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
            <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <Text style={styles.title}>Originación de Crédito</Text>
              <Text style={styles.subtitle}>
                Tasa pactada ({interestPercentStr || '0'}%) sobre capital • {isPaperworkEnabled ? `Papelería $${(officeConfig.paperworkRate || 5000).toLocaleString('es-CO')} / $100k` : 'Sin cobro de papelería'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { flexShrink: 0 }]}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Selector de Modo: Nuevo Desembolso vs Pasar Cartulina Física a Digital vs Solo Cliente */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              <TouchableOpacity
                style={[
                  {
                    flex: 1,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 5,
                    paddingVertical: 10,
                    paddingHorizontal: 8,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: withLoan && !isCardMigration ? '#0D9488' : '#E2E8F0',
                    backgroundColor: withLoan && !isCardMigration ? '#E6F7F5' : '#F8FAFC',
                    alignItems: 'center',
                  },
                ]}
                onPress={() => {
                  setWithLoan(true);
                  setIsCardMigration(false);
                }}
              >
                <Wallet size={13} color={withLoan && !isCardMigration ? '#0F766E' : '#64748B'} />
                <Text
                  style={{
                    fontFamily: FONT_FAMILY,
                    fontSize: 11.5,
                    fontWeight: '800',
                    color: withLoan && !isCardMigration ? '#0F766E' : '#64748B',
                  }}
                >
                  Nuevo Préstamo
                </Text>
              </TouchableOpacity>

              {!isCollector && (
                <TouchableOpacity
                  style={[
                    {
                      flex: 1.25,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 5,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: withLoan && isCardMigration ? '#0D9488' : '#E2E8F0',
                      backgroundColor: withLoan && isCardMigration ? '#E6F7F5' : '#F8FAFC',
                      alignItems: 'center',
                    },
                  ]}
                  onPress={() => {
                    setWithLoan(true);
                    setIsCardMigration(true);
                    setCustomerMode('NEW');
                  }}
                >
                  <ClipboardList size={13} color={withLoan && isCardMigration ? '#0F766E' : '#64748B'} />
                  <Text
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: 11.5,
                      fontWeight: '800',
                      color: withLoan && isCardMigration ? '#0F766E' : '#64748B',
                    }}
                  >
                    Cartulina a Digital
                  </Text>
                </TouchableOpacity>
              )}

              {customerMode === 'NEW' && !isCardMigration && (
                <TouchableOpacity
                  style={[
                    {
                      flex: 0.85,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 4,
                      paddingVertical: 10,
                      paddingHorizontal: 6,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: !withLoan ? '#0D9488' : '#E2E8F0',
                      backgroundColor: !withLoan ? '#E6F7F5' : '#F8FAFC',
                      alignItems: 'center',
                    },
                  ]}
                  onPress={() => {
                    setWithLoan(false);
                    setIsCardMigration(false);
                  }}
                >
                  <UserPlus size={13} color={!withLoan ? '#0F766E' : '#64748B'} />
                  <Text
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: 11,
                      fontWeight: '800',
                      color: !withLoan ? '#0F766E' : '#64748B',
                    }}
                  >
                    Solo Cliente
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 1. SELECCIONAR O CREAR TITULAR */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.label}>1. Titular del Crédito</Text>
              {!isCardMigration && customers.length > 0 && (
                <View style={styles.modeSwitchContainer}>
                  <TouchableOpacity
                    style={[
                      styles.modeSwitchBtn,
                      customerMode === 'EXISTING' && styles.modeSwitchBtnActive,
                    ]}
                    onPress={() => setCustomerMode('EXISTING')}
                  >
                    <Users size={12} color={customerMode === 'EXISTING' ? '#FFFFFF' : '#475569'} />
                    <Text
                      style={[
                        styles.modeSwitchText,
                        customerMode === 'EXISTING' && styles.modeSwitchTextActive,
                      ]}
                    >
                      Existente ({customers.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeSwitchBtn,
                      customerMode === 'NEW' && styles.modeSwitchBtnActive,
                    ]}
                    onPress={() => setCustomerMode('NEW')}
                  >
                    <UserPlus size={12} color={customerMode === 'NEW' ? '#FFFFFF' : '#475569'} />
                    <Text
                      style={[
                        styles.modeSwitchText,
                        customerMode === 'NEW' && styles.modeSwitchTextActive,
                      ]}
                    >
                      Nuevo Cliente
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {customerMode === 'EXISTING' ? (
              <View style={{ marginBottom: 14 }}>
                {customers.length > 3 && (
                  <View style={styles.searchCustomerBox}>
                    <Search size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.searchCustomerInput}
                      placeholder="Buscar titular por nombre o cédula..."
                      placeholderTextColor="#94A3B8"
                      value={customerSearch}
                      onChangeText={setCustomerSearch}
                    />
                    {customerSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setCustomerSearch('')}>
                        <X size={14} color="#64748B" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ alignItems: 'center', paddingVertical: 2 }}
                >

                  {filteredCustomers.map((c) => {
                    const hasActive = loans.some(
                      (l) => l.customerId === c.id && l.status === 'ACTIVE'
                    );
                    const isSelected = selectedCustomerId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.customerChip,
                          isSelected && styles.customerChipActive,
                          hasActive && { opacity: 0.55 },
                        ]}
                        onPress={() => setSelectedCustomerId(c.id)}
                      >
                        <Text
                          style={[
                            styles.customerChipName,
                            isSelected && { color: COLORS.purple },
                          ]}
                        >
                          {c.fullName}
                        </Text>
                        <Text style={styles.customerChipSub}>
                          {hasActive ? 'Con crédito activo' : 'Disponible'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : (
              <View style={styles.newCustomerCard}>
                {!isCollector && (!defaultRouteId || defaultRouteId === 'ALL') && availableRoutes.length > 1 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.fieldLabel}>Ruta Asignada</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {availableRoutes.map((r) => {
                        const active = selectedRouteId === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[styles.routePill, active && styles.routePillActive]}
                            onPress={() => setSelectedRouteId(r.id)}
                          >
                            <Text style={[styles.routePillText, active && styles.routePillTextActive]}>
                              {r.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                <View style={styles.formRow}>
                  <View style={{ flex: 1.3, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Nombre Completo *</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Ej. Carlos Pérez"
                      placeholderTextColor="#94A3B8"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Cédula / NIT *</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Ej. 1065842100"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={documentNumber}
                      onChangeText={setDocumentNumber}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Teléfono Llamadas *</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Ej. 3001234567"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={phone}
                      onChangeText={(val) => {
                        setPhone(val);
                        if (!whatsappPhone) setWhatsappPhone(val);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>WhatsApp</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Igual al teléfono"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={whatsappPhone}
                      onChangeText={setWhatsappPhone}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={{ flex: 1.2, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Dirección</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Calle / Carrera #..."
                      placeholderTextColor="#94A3B8"
                      value={address}
                      onChangeText={setAddress}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Barrio / Sector</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Ej. Centro"
                      placeholderTextColor="#94A3B8"
                      value={neighborhood}
                      onChangeText={setNeighborhood}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={{ flex: 1.4, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Negocio / Ocupación</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Ej. Tienda, taller..."
                      placeholderTextColor="#94A3B8"
                      value={businessName}
                      onChangeText={setBusinessName}
                    />
                  </View>
                  <View style={{ flex: 0.75, minWidth: 0 }}>
                    <Text style={styles.fieldLabel}>Orden en Ruta</Text>
                    <TextInput
                      style={styles.textField}
                      placeholder="Auto"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numeric"
                      value={routeOrderStr}
                      onChangeText={setRouteOrderStr}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.consentRow}
                  activeOpacity={0.75}
                  onPress={() => setDataConsentAccepted(!dataConsentAccepted)}
                >
                  <View style={[styles.checkboxBox, dataConsentAccepted && styles.checkboxBoxChecked]}>
                    {dataConsentAccepted && <Check size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.consentText}>
                    El titular autoriza el tratamiento de sus datos personales para la gestión crediticia (Ley 1581).
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 2. CAPITAL INICIAL */}
            {withLoan && (
              <>
            <View style={styles.filledAmountBlock}>
              <Text style={styles.floatingInternalLabel}>
                2. CAPITAL INICIAL A DESEMBOLSAR ($ COP)
              </Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                value={principalStr}
                onChangeText={setPrincipalStr}
              />
            </View>

            {baseAvailable !== undefined && (
              <View style={[styles.baseAvailableBox, principal > baseAvailable && styles.baseExceededBox]}>
                <Text style={styles.baseAvailableText}>
                  Base disponible para prestar: <Text style={{ fontWeight: '800' }}>{formatCOP(baseAvailable)}</Text>
                </Text>
                {principal > baseAvailable && (
                  <Text style={styles.baseExceededWarning}>
                    El monto supera la Base disponible en caja ({formatCOP(baseAvailable)})
                  </Text>
                )}
              </View>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
            >
              {quickPrincipals.map((amt) => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.quickAmtPill,
                    principal === amt && styles.quickAmtPillActive,
                  ]}
                  onPress={() => setPrincipalStr(amt.toString())}
                >
                  <Text
                    style={[
                      styles.quickAmtText,
                      principal === amt && { color: COLORS.primary, fontWeight: '800' },
                    ]}
                  >
                    {formatCOP(amt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>3. Modalidad de Pago</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 14 }}
              contentContainerStyle={{ flexDirection: 'row', gap: 6 }}
            >
              {frequencies.map((f) => {
                const isSelected = frequency === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[
                      styles.modalitySingleLineBtn,
                      isSelected && styles.modalitySingleLineBtnActive,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleSelectFrequency(f.key, f.defaultCount)}
                  >
                    <Text
                      style={[
                        styles.modalitySingleLineBtnText,
                        isSelected && styles.modalitySingleLineBtnTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {f.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 4. Selector de Plazo o Fecha Fija adaptativo */}
            {isFixedDate ? (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>
                  4. Fecha fija de pago acordada
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.fixedDateSingleLineRow}
                >
                  <View style={styles.fixedDateBadgeBox}>
                    <Calendar size={13} color={COLORS.primary} style={{ marginRight: 4 }} />
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
                    onPress={() => openCalendarFor('FIXED_DATE')}
                  >
                    <Text style={styles.btnOpenCalendarPillText}>Calendario</Text>
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
                          fixedDueDateStr === addDaysToDate(todayStr, days) && { color: '#ffffff', fontWeight: '800' },
                        ]}
                      >
                        +{days}d
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>
                  4. {currentFreqConfig.questionLabel} ({installmentCount > 0 ? `${installmentCount} ${currentFreqConfig.unitLabel}` : `ingresa ${currentFreqConfig.unitLabel}`})
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: 14 }}
                  contentContainerStyle={styles.installmentsRow}
                >
                  {/* Campo editable libre de primero (Diario / Semanal / Quincenal / Mensual) */}
                  <View
                    style={[
                      styles.customCountPill,
                      installmentCount > 0 &&
                        !currentFreqConfig.options.includes(installmentCount) &&
                        styles.customCountPillActive,
                    ]}
                  >
                    <TextInput
                      style={styles.customCountInput}
                      keyboardType="number-pad"
                      maxLength={3}
                      value={installmentCountStr}
                      onChangeText={(val) =>
                        setInstallmentCountStr(val.replace(/\D/g, '').slice(0, 3))
                      }
                      placeholder="#"
                      placeholderTextColor="#94A3B8"
                      selectTextOnFocus
                    />
                    <Text style={styles.customCountUnit} numberOfLines={1}>
                      {currentFreqConfig.unitLabel}
                    </Text>
                  </View>

                  {currentFreqConfig.options.map((cnt) => (
                    <TouchableOpacity
                      key={cnt}
                      style={[
                        styles.cntPill,
                        installmentCount === cnt && styles.cntPillActive,
                      ]}
                      onPress={() => setInstallmentCountStr(cnt.toString())}
                    >
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.cntPillText,
                          installmentCount === cnt && { color: '#ffffff' },
                        ]}
                      >
                        {cnt} {currentFreqConfig.unitLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* 5. Tasa de Interés Pactada por Contrato */}
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.label}>5. Tasa de Interés Pactada (% sobre operación)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  style={{
                    width: 90,
                    height: 40,
                    backgroundColor: isCollector ? '#F1F5F9' : '#F8FAFC',
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    paddingHorizontal: 12,
                    fontSize: 15,
                    fontWeight: '800',
                    color: isCollector ? '#475569' : COLORS.textPrimary,
                  }}
                  keyboardType="numeric"
                  value={interestPercentStr}
                  editable={!isCollector}
                  onChangeText={setInterestPercentStr}
                />
                <Text style={{ flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 }}>
                  {isCollector
                    ? 'Tasa comercial configurada por la administración de la oficina.'
                    : 'La tasa pactada queda congelada en este contrato y no modifica préstamos anteriores.'}
                </Text>
              </View>
            </View>

            {/* Cartulina Física Interactiva cuando está en modo Migración */}
            {!isCollector && isCardMigration && !isFixedDate && summary && (
              <View
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 14,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#99F6E4',
                  marginBottom: 14,
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0F766E' }}>
                    Selecciona las cuotas ya pagadas en la cartulina física
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
                      Caja hoy: $0
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
                    placeholder="Ej. 12"
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

                {/* Día de pago (ancla las cuotas pagadas hacia atrás y las pendientes hacia adelante) */}
                <View
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A' }}>
                      Día de pago
                    </Text>
                    <TouchableOpacity
                      onPress={() => openCalendarFor('MIGRATION_PAYDAY')}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: '#F0FDFA',
                        borderWidth: 1,
                        borderColor: '#5EEAD4',
                        borderRadius: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                      }}
                    >
                      <Calendar size={12} color="#0F766E" />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#0F766E' }}>
                        {formatShortDateEs(migrationNextDueDateStr)}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {frequency === 'WEEKLY' ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                      {[
                        { label: 'Lun', dow: 1 },
                        { label: 'Mar', dow: 2 },
                        { label: 'Mié', dow: 3 },
                        { label: 'Jue', dow: 4 },
                        { label: 'Vie', dow: 5 },
                        { label: 'Sáb', dow: 6 },
                      ].map((w) => {
                        const targetDate = getUpcomingWeekdayDate(todayStr, w.dow);
                        const selectedDow = /^\d{4}-\d{2}-\d{2}$/.test(migrationNextDueDateStr)
                          ? new Date(migrationNextDueDateStr + 'T00:00:00').getDay()
                          : -1;
                        const active = selectedDow === w.dow;
                        return (
                          <TouchableOpacity
                            key={w.dow}
                            onPress={() => setMigrationNextDueDateStr(targetDate)}
                            style={{
                              flex: 1,
                              minWidth: 42,
                              paddingVertical: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: active ? '#0F766E' : '#CBD5E1',
                              backgroundColor: active ? '#0F766E' : '#F8FAFC',
                              alignItems: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: '800',
                                color: active ? '#FFFFFF' : '#334155',
                              }}
                            >
                              {w.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => setMigrationNextDueDateStr(todayStr)}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: migrationNextDueDateStr === todayStr ? '#0F766E' : '#CBD5E1',
                          backgroundColor: migrationNextDueDateStr === todayStr ? '#0F766E' : '#F8FAFC',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '800',
                            color: migrationNextDueDateStr === todayStr ? '#FFFFFF' : '#334155',
                          }}
                        >
                          Hoy
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setMigrationNextDueDateStr(migrationTomorrowStr)}
                        style={{
                          flex: 1,
                          paddingVertical: 7,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: migrationNextDueDateStr === migrationTomorrowStr ? '#0F766E' : '#CBD5E1',
                          backgroundColor: migrationNextDueDateStr === migrationTomorrowStr ? '#0F766E' : '#F8FAFC',
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '800',
                            color: migrationNextDueDateStr === migrationTomorrowStr ? '#FFFFFF' : '#334155',
                          }}
                        >
                          Mañana
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => openCalendarFor('MIGRATION_PAYDAY')}
                        style={{
                          flex: 1.2,
                          flexDirection: 'row',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: 4,
                          paddingVertical: 7,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor:
                            migrationNextDueDateStr !== todayStr &&
                            migrationNextDueDateStr !== migrationTomorrowStr
                              ? '#0F766E'
                              : '#CBD5E1',
                          backgroundColor:
                            migrationNextDueDateStr !== todayStr &&
                            migrationNextDueDateStr !== migrationTomorrowStr
                              ? '#0F766E'
                              : '#F8FAFC',
                        }}
                      >
                        <Calendar
                          size={12}
                          color={
                            migrationNextDueDateStr !== todayStr &&
                            migrationNextDueDateStr !== migrationTomorrowStr
                              ? '#FFFFFF'
                              : '#334155'
                          }
                        />
                        <Text
                          style={{
                            fontSize: 11.5,
                            fontWeight: '800',
                            color:
                              migrationNextDueDateStr !== todayStr &&
                              migrationNextDueDateStr !== migrationTomorrowStr
                                ? '#FFFFFF'
                                : '#334155',
                          }}
                        >
                          Calendario
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {migrationPreview && (() => {
                    const paidInsts = migrationPreview.installments.filter((i) => i.status === 'PAGADA');
                    const nextPending = migrationPreview.installments.find((i) => i.status !== 'PAGADA');
                    const lastInst = migrationPreview.installments[migrationPreview.installments.length - 1];
                    const nextStatusLabel = !nextPending
                      ? 'Crédito saldado'
                      : nextPending.dueDate < todayStr
                        ? 'En mora'
                        : nextPending.dueDate === todayStr
                          ? 'Cobra hoy'
                          : 'Al día';
                    const nextStatusColor = !nextPending
                      ? '#065F46'
                      : nextPending.dueDate < todayStr
                        ? '#DC2626'
                        : nextPending.dueDate === todayStr
                          ? '#1D4ED8'
                          : '#0F766E';
                    return (
                      <View
                        style={{
                          backgroundColor: '#F8FAFC',
                          borderRadius: 8,
                          padding: 8,
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          gap: 2,
                        }}
                      >
                        {paidInsts.length > 0 && (
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#065F46' }}>
                            ✓ Pagadas ({paidInsts.length}):{' '}
                            {paidInsts.length === 1
                              ? formatShortDateEs(paidInsts[0].dueDate)
                              : `${formatShortDateEs(paidInsts[0].dueDate)} – ${formatShortDateEs(paidInsts[paidInsts.length - 1].dueDate)}`}
                          </Text>
                        )}
                        {nextPending && (
                          <Text style={{ fontSize: 11, fontWeight: '800', color: nextStatusColor }}>
                            • Próxima cuota (#{nextPending.installmentNumber}): {formatShortDateEs(nextPending.dueDate)} — {nextStatusLabel}
                          </Text>
                        )}
                        {lastInst && (
                          <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#64748B' }}>
                            • Última cuota (#{lastInst.installmentNumber}): {formatShortDateEs(lastInst.dueDate)}
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: installmentCount }, (_, i) => i + 1).map((num) => {
                    const isPaid = paidInstallmentNums.includes(num);
                    const previewInst = migrationPreview?.installments[num - 1];
                    return (
                      <TouchableOpacity
                        key={num}
                        onPress={() => togglePaidInstallment(num)}
                        style={{
                          minWidth: 46,
                          height: previewInst ? 38 : 32,
                          borderRadius: 7,
                          borderWidth: 1,
                          borderColor: isPaid ? '#10B981' : '#CBD5E1',
                          backgroundColor: isPaid ? '#DCFCE7' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 5,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '800',
                            color: isPaid ? '#065F46' : '#334155',
                          }}
                        >
                          {num}
                        </Text>
                        {previewInst && (
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: isPaid ? '#047857' : '#64748B',
                            }}
                          >
                            {formatTinyDayMonth(previewInst.dueDate)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View
                  style={{
                    backgroundColor: '#ECFDF5',
                    borderRadius: 10,
                    padding: 10,
                    borderWidth: 1,
                    borderColor: '#A7F3D0',
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#065F46' }}>
                    Pagado en cartulina: {formatCOP(summary.installmentAmount * paidInstallmentNums.length)} ({paidInstallmentNums.length}/{installmentCount})
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E', marginTop: 2 }}>
                    Saldo pendiente por cobrar en digital:{' '}
                    {formatCOP(Math.max(0, summary.totalAgreed - summary.installmentAmount * paidInstallmentNums.length))}
                  </Text>
                </View>
              </View>
            )}

            {/* Calculadora Financiera en Vivo con línea punteada tipo ticket */}
            {summary && (
              <View style={styles.calcCard}>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Capital pactado:</Text>
                  <Text style={styles.calcVal}>{formatCOP(summary.principal)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Interés pactado ({interestPercentStr || '0'}%):</Text>
                  <Text style={styles.calcVal}>+ {formatCOP(summary.interestAmount)}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>Total a cobrar:</Text>
                  <Text style={[styles.calcVal, { color: COLORS.primary }]}>
                    {formatCOP(summary.totalAgreed)}
                  </Text>
                </View>
                <View style={styles.calcRow}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.calcLabel}>
                      {isFixedDate
                        ? 'Modalidad: Pago único'
                        : `Valor Cuota (${installmentCount} cuotas ${currentFreqConfig.unitLabel}):`}
                    </Text>
                    <Text style={styles.calcDateUnderAmount}>
                      {isFixedDate
                        ? `Vence: ${fixedDueDateStr}`
                        : isMigration && migrationPreview
                          ? `Día de pago: ${formatShortDateEs(migrationNextDueDateStr)} • Cobro ${currentFreqConfig.label.toLowerCase()}`
                          : `1ª cuota: ${firstDueDateStr} • Cobro ${currentFreqConfig.label.toLowerCase()}`}
                    </Text>
                  </View>
                  <Text style={[styles.calcVal, { color: COLORS.textPrimary, fontSize: 16 }]}>
                    {formatCOP(summary.installmentAmount)}
                  </Text>
                </View>
                <View style={styles.dashedDivider} />
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>
                    {isPaperworkEnabled
                      ? `Cartulina / Papelería (${formatCOP(officeConfig.paperworkRate || 5000)} / $100k):`
                      : 'Cartulina / Papelería:'}
                  </Text>
                  <Text
                    style={[
                      styles.calcVal,
                      isPaperworkEnabled && paperwork > 0
                        ? isMigration
                          ? { color: '#059669' }
                          : { color: COLORS.danger }
                        : { color: COLORS.textMuted },
                    ]}
                  >
                    {isPaperworkEnabled && paperwork > 0
                      ? isMigration
                        ? `+ ${formatCOP(paperwork)}`
                        : `- ${formatCOP(paperwork)}`
                      : '$ 0 (Desactivada por administración)'}
                  </Text>
                </View>
                {isMigration ? (
                  <>
                    <View style={styles.calcRow}>
                      <Text style={[styles.calcLabel, { fontWeight: '700', color: '#1D4ED8' }]}>
                        Cobrado en el Taco (entra a Base):
                      </Text>
                      <Text style={[styles.calcVal, { color: '#1D4ED8' }]}>
                        + {formatCOP(summary.installmentAmount * paidInstallmentNums.length)}
                      </Text>
                    </View>
                    <View style={styles.calcRow}>
                      <Text style={[styles.calcLabel, { fontWeight: '800', color: COLORS.textPrimary }]}>
                        Saldo Pendiente (entra a Cartera en Calle):
                      </Text>
                      <Text style={[styles.calcVal, { fontSize: 16, color: '#0F766E' }]}>
                        {formatCOP(Math.max(0, summary.totalAgreed - summary.installmentAmount * paidInstallmentNums.length))}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.calcRow}>
                    <Text style={[styles.calcLabel, { fontWeight: '800', color: COLORS.textPrimary }]}>
                      Efectivo Neto a Entregar:
                    </Text>
                    <Text style={[styles.calcVal, { fontSize: 17, color: COLORS.success }]}>
                      {formatCOP(netCashToDeliver)}
                    </Text>
                  </View>
                )}
              </View>
            )}
              </>
            )}
          </ScrollView>

          {formError ? (
            <View
              style={{
                backgroundColor: '#FEF2F2',
                borderWidth: 1,
                borderColor: '#FECACA',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '700' }}>
                {formError}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.confirmBtn, isSubmitting && { opacity: 0.5 }]}
            onPress={() => handleCreateLoan(false)}
            disabled={isSubmitting}
          >
            <FilePlus2 size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.confirmBtnText}>
              {isSubmitting
                ? 'Guardando...'
                : !withLoan
                  ? 'Guardar Solo Cliente'
                  : isCardMigration
                    ? 'Registrar Cliente y Pasar Cartulina'
                    : customerMode === 'NEW'
                      ? 'Registrar Cliente y Desembolsar'
                      : 'Confirmar y Desembolsar'}
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
              <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
                <Text style={styles.calendarModalTitle}>
                  {calendarTarget === 'MIGRATION_PAYDAY' ? 'Día de pago' : 'Fecha Fija de Pago'}
                </Text>
                <Text style={styles.calendarModalSubtitle}>
                  {calendarTarget === 'MIGRATION_PAYDAY'
                    ? 'Elige la fecha de la próxima cuota (puede ser anterior si está en mora)'
                    : 'Selecciona el día acordado para el cobro'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCalendarModalVisible(false)}
                style={[styles.calendarCloseBtn, { flexShrink: 0 }]}
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
                  const isSelected = activeCalendarDate === cellDate;
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
                        setActiveCalendarDate(cellDate);
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
              {(calendarTarget === 'MIGRATION_PAYDAY'
                ? [
                    { label: '-7 días', days: -7 },
                    { label: 'Hoy', days: 0 },
                    { label: 'Mañana', days: 1 },
                    { label: '+7 días', days: 7 },
                  ]
                : [
                    { label: '+7 días', days: 7 },
                    { label: '+15 días', days: 15 },
                    { label: '+20 días', days: 20 },
                    { label: '+30 días', days: 30 },
                  ]
              ).map((item) => {
                const target = addDaysToDate(todayStr, item.days);
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={[
                      styles.calendarQuickPill,
                      activeCalendarDate === target && styles.calendarQuickPillActive,
                    ]}
                    onPress={() => {
                      setActiveCalendarDate(target);
                      const [y, m] = target.split('-');
                      setCalendarYear(parseInt(y, 10));
                      setCalendarMonth(parseInt(m, 10) - 1);
                    }}
                  >
                    <Text
                      style={[
                        styles.calendarQuickPillText,
                        activeCalendarDate === target && styles.calendarQuickPillTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.calendarFooterRow}>
              <Text style={styles.calendarFooterPreview}>
                {calendarTarget === 'MIGRATION_PAYDAY' ? 'Día de pago: ' : 'Fecha fija: '}
                <Text style={{ fontWeight: '800', color: COLORS.primary }}>{activeCalendarDate}</Text>
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
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modeSwitchContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  modeSwitchBtnActive: {
    backgroundColor: '#0F172A',
  },
  modeSwitchText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modeSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  searchCustomerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
  },
  searchCustomerInput: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  newCustomerQuickChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: '#F0FDFA',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    borderStyle: 'dashed',
    marginRight: 8,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  newCustomerQuickChipTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  newCustomerQuickChipSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '600',
  },
  newCustomerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  textField: {
    fontFamily: FONT_FAMILY,
    height: 38,
    width: '100%',
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  routePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginRight: 6,
  },
  routePillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  routePillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  routePillTextActive: {
    color: '#FFFFFF',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  consentText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  label: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  customerChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginRight: 8,
  },
  customerChipActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  customerChipName: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  customerChipSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  filledAmountBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    marginBottom: 10,
  },
  floatingInternalLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  amountInput: {
    fontFamily: FONT_FAMILY,
    height: 38,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  quickAmtPill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginRight: 8,
  },
  quickAmtPillActive: {
    backgroundColor: COLORS.surfaceLavender,
    borderColor: COLORS.purple,
  },
  quickAmtText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  installmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  customCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 11,
    minHeight: 38,
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    gap: 5,
  },
  customCountPillActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#EFF6FF',
  },
  customCountInput: {
    width: 40,
    paddingVertical: 4,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  customCountUnit: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.primary,
  },
  cntPill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 38,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cntPillActive: {
    backgroundColor: COLORS.dockBg,
    borderColor: COLORS.dockBg,
  },
  cntPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  calcCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calcLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  calcVal: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  dashedDivider: {
    height: 1,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderStyle: 'dashed',
    marginVertical: 8,
  },
  confirmBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  baseAvailableBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  baseExceededBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  baseAvailableText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#0369a1',
    fontWeight: '600',
  },
  baseExceededWarning: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#dc2626',
    fontWeight: '700',
    marginTop: 4,
  },
  calcDateUnderAmount: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 2,
  },
  modalitySingleLineBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalitySingleLineBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modalitySingleLineBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  modalitySingleLineBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
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
    fontWeight: '800',
    color: '#0F172A',
    width: 95,
    padding: 0,
  },
  btnOpenCalendarPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOpenCalendarPillText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  quickDaysPillInline: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDaysPillInlineActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  quickDaysPillInlineText: {
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
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
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  calendarModalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  calendarModalSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  calendarCloseBtn: {
    padding: 4,
  },
  calendarMonthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
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
    paddingVertical: 7,
    borderRadius: 8,
  },
  calendarConfirmBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
