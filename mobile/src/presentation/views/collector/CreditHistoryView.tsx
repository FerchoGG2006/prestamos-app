import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { Customer, Loan, Installment, Payment } from '../../../core/domain/types';
import {
  calculateCustomerCreditHistory,
  CreditHistoryReport,
  LoanHistoryRecord,
} from '../../../core/domain/credit-history';
import { formatCOP } from '../../../core/config/business-rules';
import { COLORS } from '../../theme/colors';
import {
  Search,
  UserCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Calendar,
  DollarSign,
  Clock,
  Phone,
  MessageCircle,
  FileText,
  ChevronRight,
  X,
  CreditCard,
  PlusCircle,
} from 'lucide-react-native';

interface CreditHistoryViewProps {
  customers: Customer[];
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  todayStr: string;
  initialDocumentNumber?: string;
  onOpenNewLoan?: (customer: Customer) => void;
  onOpenPayment?: (customer: Customer, loan: Loan) => void;
}

export const CreditHistoryView: React.FC<CreditHistoryViewProps> = ({
  customers,
  loans,
  installments,
  payments,
  todayStr,
  initialDocumentNumber = '',
  onOpenNewLoan,
  onOpenPayment,
}) => {
  const [searchQuery, setSearchQuery] = useState(initialDocumentNumber);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(() => {
    if (initialDocumentNumber) {
      const match = customers.find(
        (c) =>
          c.documentNumber.trim().toLowerCase() ===
          initialDocumentNumber.trim().toLowerCase()
      );
      return match ? match.id : null;
    }
    return null;
  });

  const [modalLoanItem, setModalLoanItem] = useState<LoanHistoryRecord | null>(null);

  // Clientes filtrados para sugerencias en tiempo real (ESTRICTAMENTE POR CÉDULA NUMÉRICA)
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim();
    return customers.filter((c) => c.documentNumber.includes(q));
  }, [customers, searchQuery]);

  // Cliente seleccionado
  const selectedCustomer = useMemo(() => {
    if (selectedCustomerId) {
      return customers.find((c) => c.id === selectedCustomerId) || null;
    }
    return null;
  }, [customers, selectedCustomerId]);

  // Reporte financiero fáctico
  const historyReport: CreditHistoryReport | null = useMemo(() => {
    if (!selectedCustomer) return null;
    return calculateCustomerCreditHistory(
      selectedCustomer,
      loans,
      installments,
      payments,
      todayStr
    );
  }, [selectedCustomer, loans, installments, payments, todayStr]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomerId(customer.id);
    setSearchQuery(customer.documentNumber);
  };

  const handleClear = () => {
    setSearchQuery('');
    setSelectedCustomerId(null);
  };

  const handleCall = (phoneNumber: string) => {
    Linking.openURL(`tel:${phoneNumber}`).catch(() => {});
  };

  const handleWhatsApp = (customer: Customer) => {
    const clean = customer.phone.replace(/\D/g, '');
    const phone = clean.startsWith('57') ? clean : `57${clean}`;
    const msg = `Hola ${customer.fullName}, te contactamos de Cartera Móvil sobre el estado de tu cuenta.`;
    Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`).catch(() => {
      Alert.alert('WhatsApp', msg);
    });
  };

  const getInitials = (name: string) => {
    if (!name) return 'CL';
    const p = name.trim().split(/\s+/);
    if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
    return (p[0][0] + p[1][0]).toUpperCase();
  };

  const getFrequencyLabel = (freq?: string) => {
    switch (freq) {
      case 'WEEKLY':
        return 'Semanal';
      case 'BIWEEKLY':
        return 'Quincenal';
      case 'MONTHLY':
        return 'Mensual';
      case 'FIXED_DATE':
        return 'Fecha Fija';
      case 'DAILY':
      default:
        return 'Diario';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Encabezado */}
      <View style={styles.headerBox}>
        <Text style={styles.screenTitle}>Historial Crediticio</Text>
        <Text style={styles.screenSubtitle}>
          Verifica por cédula el récord de pagos y préstamos anteriores
        </Text>
      </View>

      {/* Buscador de Cédula */}
      <View style={styles.searchCard}>
        <Text style={styles.searchPrompt}>Cédula del Cliente (solo números):</Text>
        <View style={styles.searchInputRow}>
          <Search size={18} color={COLORS.textSecondary} style={{ marginLeft: 12 }} />
          <TextInput
            style={styles.textInput}
            placeholder="Ej: 1045892301"
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={(text) => {
              const digitsOnly = text.replace(/\D/g, '');
              setSearchQuery(digitsOnly);
              if (selectedCustomerId && digitsOnly !== selectedCustomer?.documentNumber) {
                setSelectedCustomerId(null);
              }
            }}
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
              <X size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Sugerencias Rápidas Desplegables */}
        {!selectedCustomer && filteredSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            <Text style={styles.suggestionsTitle}>Coincidencias encontradas:</Text>
            {filteredSuggestions.slice(0, 4).map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.suggestionItem}
                onPress={() => handleSelectCustomer(c)}
              >
                <View style={styles.suggestionAvatar}>
                  <Text style={styles.suggestionAvatarText}>{getInitials(c.fullName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.suggestionName}>{c.fullName}</Text>
                  <Text style={styles.suggestionDoc}>
                    C.C. {c.documentNumber} • {c.neighborhood || c.city}
                  </Text>
                </View>
                <ChevronRight size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Chips de Selección Rápida */}
        {!selectedCustomer && filteredSuggestions.length === 0 && (
          <View style={styles.chipsSection}>
            <Text style={styles.chipsSectionTitle}>Clientes en ruta para verificar:</Text>
            <View style={styles.chipsRow}>
              {customers.slice(0, 4).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.chipButton}
                  onPress={() => handleSelectCustomer(c)}
                >
                  <Text style={styles.chipText}>
                    {c.fullName.split(' ')[0]} ({c.documentNumber.slice(-4)})
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Estado Vacío (Sin cliente seleccionado) */}
      {!selectedCustomer && (
        <View style={styles.emptyStateCard}>
          <View style={styles.emptyIconCircle}>
            <FileText size={32} color="#2563EB" />
          </View>
          <Text style={styles.emptyStateTitle}>Consulta y Calificación de Pagos</Text>
          <Text style={styles.emptyStateDesc}>
            Ingresa la cédula de la persona para comprobar de forma inmediata si ha
            cumplido puntualmente, sus préstamos anteriores y su nivel de riesgo.
          </Text>
        </View>
      )}

      {/* Reporte Completo del Cliente */}
      {selectedCustomer && historyReport && (
        <View style={styles.reportContainer}>
          {/* Ficha del Cliente */}
          <View style={styles.customerProfileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitials}>
                  {getInitials(selectedCustomer.fullName)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{selectedCustomer.fullName}</Text>
                <Text style={styles.customerDoc}>
                  C.C. {selectedCustomer.documentNumber} • {selectedCustomer.neighborhood || selectedCustomer.city}
                </Text>
              </View>

              <View style={styles.quickContactRow}>
                <TouchableOpacity
                  style={styles.contactBtn}
                  onPress={() => handleCall(selectedCustomer.phone)}
                >
                  <Phone size={15} color="#2563EB" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.contactBtn, { backgroundColor: '#ECFDF5' }]}
                  onPress={() => handleWhatsApp(selectedCustomer)}
                >
                  <MessageCircle size={15} color="#059669" />
                </TouchableOpacity>
              </View>
            </View>

            {/* SELLO DE CALIFICACIÓN: ¿PAGÓ BIEN O MAL? */}
            <View
              style={[
                styles.verdictBanner,
                {
                  backgroundColor: historyReport.rating.bgColor,
                  borderColor: historyReport.rating.borderColor,
                },
              ]}
            >
              <View style={styles.verdictTitleRow}>
                {historyReport.rating.type === 'BUEN_PAGADOR' ? (
                  <UserCheck size={18} color={historyReport.rating.textColor} />
                ) : historyReport.rating.type === 'REGULAR' ? (
                  <AlertTriangle size={18} color={historyReport.rating.textColor} />
                ) : historyReport.rating.type === 'EN_MORA' ? (
                  <AlertOctagon size={18} color={historyReport.rating.textColor} />
                ) : (
                  <Info size={18} color={historyReport.rating.textColor} />
                )}
                <Text
                  style={[
                    styles.verdictLabel,
                    { color: historyReport.rating.textColor },
                  ]}
                >
                  {historyReport.rating.label}
                </Text>
              </View>
              <Text
                style={[
                  styles.verdictExplanation,
                  { color: historyReport.rating.textColor },
                ]}
              >
                {historyReport.rating.explanation}
              </Text>
            </View>
          </View>

          {/* Micro-KPIs Bento Grid */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>PRÉSTAMOS</Text>
              <Text style={styles.kpiValue}>{historyReport.totalLoansCount}</Text>
              <Text style={styles.kpiSub}>
                {historyReport.completedLoansCount} pagados • {historyReport.activeLoansCount} activo
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>TOTAL PRESTADO</Text>
              <Text style={[styles.kpiValue, { color: '#0F172A' }]}>
                {formatCOP(historyReport.totalBorrowed)}
              </Text>
              <Text style={styles.kpiSub}>
                Pactado: {formatCOP(historyReport.totalAgreed)}
              </Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>TOTAL PAGADO</Text>
              <Text style={[styles.kpiValue, { color: '#059669' }]}>
                {formatCOP(historyReport.totalPaid)}
              </Text>
              <Text style={styles.kpiSub}>Recuperado real</Text>
            </View>

            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>SALDO ACTIVO</Text>
              <Text
                style={[
                  styles.kpiValue,
                  {
                    color:
                      historyReport.currentRemainingBalance > 0
                        ? '#DC2626'
                        : '#059669',
                  },
                ]}
              >
                {formatCOP(historyReport.currentRemainingBalance)}
              </Text>
              <Text style={styles.kpiSub}>
                {historyReport.maxOverdueDaysRecorded > 0
                  ? `Mora máx: ${historyReport.maxOverdueDaysRecorded}d`
                  : 'Sin atrasos'}
              </Text>
            </View>
          </View>

          {/* Acciones Rápidas */}
          <View style={styles.actionsRow}>
            {onOpenNewLoan && (
              <TouchableOpacity
                style={styles.actionBtnPrimary}
                onPress={() => onOpenNewLoan(selectedCustomer)}
              >
                <PlusCircle size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnPrimaryText}>Nuevo Crédito</Text>
              </TouchableOpacity>
            )}

            {historyReport.activeLoansCount > 0 && onOpenPayment && (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => {
                  const active = loans.find(
                    (l) => l.customerId === selectedCustomer.id && l.status === 'ACTIVE'
                  );
                  if (active) onOpenPayment(selectedCustomer, active);
                }}
              >
                <CreditCard size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnSecondaryText}>Abonar Saldo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Historial Detallado de Préstamos */}
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>
              Récord de Préstamos ({historyReport.loans.length})
            </Text>

            {historyReport.loans.length === 0 ? (
              <View style={styles.noLoansBox}>
                <Text style={styles.noLoansText}>
                  El cliente aún no tiene contratos de préstamo registrados.
                </Text>
              </View>
            ) : (
              historyReport.loans.map((item) => (
                <View key={item.loan.id} style={styles.loanCard}>
                  <View style={styles.loanHeaderRow}>
                    <View style={styles.loanIdBadge}>
                      <Text style={styles.loanIdText}>
                        {item.loan.loanNumber || `#${item.loan.id.substring(0, 6)}`}
                      </Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.loanDateText}>
                        Inicio: {item.loan.startDate} • Modalidad: {getFrequencyLabel(item.loan.frequency)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.loanStatusBadge,
                        item.loan.status === 'PAID'
                          ? styles.statusPaid
                          : item.loan.status === 'ACTIVE'
                          ? styles.statusActive
                          : styles.statusOther,
                      ]}
                    >
                      <Text
                        style={[
                          styles.loanStatusText,
                          item.loan.status === 'PAID'
                            ? { color: '#047857' }
                            : item.loan.status === 'ACTIVE'
                            ? { color: '#1D4ED8' }
                            : { color: '#64748B' },
                        ]}
                      >
                        {item.loan.status === 'PAID'
                          ? 'PAGADO'
                          : item.loan.status === 'ACTIVE'
                          ? 'ACTIVO'
                          : item.loan.status}
                      </Text>
                    </View>
                  </View>

                  {/* Diagnóstico Fáctico de Pago del Préstamo */}
                  <View
                    style={[
                      styles.loanVerdictRow,
                      { backgroundColor: item.behaviorColor + '15' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.loanVerdictText,
                        { color: item.behaviorColor },
                      ]}
                    >
                      {item.behaviorVerdict}
                    </Text>
                  </View>

                  {/* Números del Préstamo */}
                  <View style={styles.loanStatsGrid}>
                    <View style={styles.loanStatCol}>
                      <Text style={styles.loanStatLabel}>PRESTADO</Text>
                      <Text style={styles.loanStatValue}>
                        {formatCOP(item.loan.principal)}
                      </Text>
                    </View>
                    <View style={styles.loanStatCol}>
                      <Text style={styles.loanStatLabel}>TOTAL C/INT</Text>
                      <Text style={styles.loanStatValue}>
                        {formatCOP(item.totalAgreed)}
                      </Text>
                    </View>
                    <View style={styles.loanStatCol}>
                      <Text style={styles.loanStatLabel}>PAGADO</Text>
                      <Text style={[styles.loanStatValue, { color: '#059669' }]}>
                        {formatCOP(item.totalPaid)}
                      </Text>
                    </View>
                    <View style={styles.loanStatCol}>
                      <Text style={styles.loanStatLabel}>SALDO</Text>
                      <Text
                        style={[
                          styles.loanStatValue,
                          {
                            color:
                              item.remainingBalance > 0 ? '#DC2626' : '#059669',
                          },
                        ]}
                      >
                        {formatCOP(item.remainingBalance)}
                      </Text>
                    </View>
                  </View>

                  {/* Botón Ver Cuotas */}
                  <TouchableOpacity
                    style={styles.viewInstallmentsBtn}
                    onPress={() => setModalLoanItem(item)}
                  >
                    <Calendar size={14} color="#2563EB" style={{ marginRight: 6 }} />
                    <Text style={styles.viewInstallmentsBtnText}>
                      Ver Plan de Cuotas ({item.paidInstallments}/{item.totalInstallments} pagadas)
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </View>
      )}

      {/* Modal Desglose de Cuotas */}
      <Modal
        visible={modalLoanItem !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalLoanItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Plan de Pagos — {modalLoanItem?.loan.loanNumber || `#${modalLoanItem?.loan.id.substring(0, 6)}`}
                </Text>
                <Text style={styles.modalSub}>
                  Prestado: {formatCOP(modalLoanItem?.loan.principal || 0)} • Total: {formatCOP(modalLoanItem?.totalAgreed || 0)} • {getFrequencyLabel(modalLoanItem?.loan.frequency)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalLoanItem(null)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }}>
              {modalLoanItem?.installments.map((inst) => {
                const isPaid = inst.pendingAmount <= 0;
                return (
                  <View key={inst.id} style={styles.modalInstRow}>
                    <View style={styles.instNumCol}>
                      <Text style={styles.instNumText}>#{inst.installmentNumber}</Text>
                      <Text style={styles.instDueDate}>{inst.dueDate}</Text>
                    </View>
                    <View style={styles.instAmountsCol}>
                      <Text style={styles.instExpected}>
                        Cuota: {formatCOP(inst.expectedAmount)}
                      </Text>
                      <Text style={styles.instPaid}>
                        Abonado: {formatCOP(inst.paidAmount)}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.instStatusPill,
                        isPaid ? styles.instPaidPill : styles.instPendingPill,
                      ]}
                    >
                      <Text
                        style={[
                          styles.instStatusPillText,
                          isPaid ? { color: '#047857' } : { color: '#DC2626' },
                        ]}
                      >
                        {isPaid ? 'PAGADA' : 'PENDIENTE'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalCloseFooterBtn}
              onPress={() => setModalLoanItem(null)}
            >
              <Text style={styles.modalCloseFooterBtnText}>Cerrar Detalle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 110,
  },
  headerBox: {
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 14,
  },
  searchPrompt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
    paddingHorizontal: 10,
  },
  clearBtn: {
    padding: 10,
  },
  suggestionsContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  suggestionAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  suggestionAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730A3',
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  suggestionDoc: {
    fontSize: 11,
    color: '#64748B',
  },
  chipsSection: {
    marginTop: 10,
  },
  chipsSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipButton: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptyStateDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  reportContainer: {
    gap: 12,
  },
  customerProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  customerName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerDoc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  quickContactRow: {
    flexDirection: 'row',
    gap: 6,
  },
  contactBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verdictBanner: {
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 10,
  },
  verdictTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  verdictLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  verdictExplanation: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2563EB',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnSecondaryText: {
    color: '#059669',
    fontWeight: '700',
    fontSize: 13,
  },
  historySection: {
    marginTop: 4,
  },
  historySectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  noLoansBox: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  noLoansText: {
    fontSize: 12,
    color: '#64748B',
  },
  loanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  loanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  loanIdBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  loanIdText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  loanDateText: {
    fontSize: 11,
    color: '#64748B',
  },
  loanStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusPaid: {
    backgroundColor: '#ECFDF5',
  },
  statusActive: {
    backgroundColor: '#EFF6FF',
  },
  statusOther: {
    backgroundColor: '#F1F5F9',
  },
  loanStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  loanVerdictRow: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  loanVerdictText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  loanStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  loanStatCol: {
    alignItems: 'center',
  },
  loanStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  loanStatValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  viewInstallmentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  viewInstallmentsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalInstRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  instNumCol: {
    width: 80,
  },
  instNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  instDueDate: {
    fontSize: 10,
    color: '#64748B',
  },
  instAmountsCol: {
    flex: 1,
    paddingHorizontal: 8,
  },
  instExpected: {
    fontSize: 11,
    color: '#475569',
  },
  instPaid: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '600',
  },
  instStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  instPaidPill: {
    backgroundColor: '#ECFDF5',
  },
  instPendingPill: {
    backgroundColor: '#FEF2F2',
  },
  instStatusPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  modalCloseFooterBtn: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseFooterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});
