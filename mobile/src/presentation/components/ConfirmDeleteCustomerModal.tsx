import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2, AlertTriangle, X, ShieldAlert } from 'lucide-react-native';
import { Customer, Loan } from '../../core/domain/types';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { formatCOP } from '../../core/config/business-rules';
import { localStore } from '../../infrastructure/storage/local-store';

export interface ConfirmDeleteCustomerModalProps {
  visible: boolean;
  customer: Customer | null;
  activeLoan?: Loan | null;
  isDeleting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const ConfirmDeleteCustomerModal: React.FC<ConfirmDeleteCustomerModalProps> = ({
  visible,
  customer,
  activeLoan,
  isDeleting = false,
  onClose,
  onConfirm,
}) => {
  const insets = useSafeAreaInsets();

  if (!customer) return null;

  const hasActive = Boolean(activeLoan);
  const pendingBalance = activeLoan
    ? localStore.getInstallmentsByLoanId(activeLoan.id).reduce((s, i) => s + i.pendingAmount, 0) || (activeLoan.totalAgreed || 0)
    : 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent={false}
      onRequestClose={isDeleting ? undefined : onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              paddingBottom: Math.max(insets.bottom, 20),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.warningIconCircle}>
              <Trash2 size={24} color="#DC2626" />
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isDeleting}
              style={styles.closeBtn}
              activeOpacity={0.7}
            >
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Título y Subtítulo */}
          <Text style={styles.modalTitle}>¿Eliminar Cliente?</Text>
          <Text style={styles.modalSubtitle}>
            Esta acción removerá a este cliente permanentemente del directorio y del recorrido de cobro.
          </Text>

          {/* Tarjeta Resumen del Cliente */}
          <View style={styles.customerCard}>
            <Text style={styles.customerName} numberOfLines={1}>
              {customer.fullName}
            </Text>
            <Text style={styles.customerMeta}>
              CC: {customer.documentNumber || 'Sin cédula'} • Tel: {customer.phone || 'Sin teléfono'}
            </Text>
            {customer.address ? (
              <Text style={styles.customerAddress} numberOfLines={1}>
                {customer.address} {customer.neighborhood ? `• ${customer.neighborhood}` : ''}
              </Text>
            ) : null}

            {/* Alerta de crédito activo si aplica */}
            {hasActive && (
              <View style={styles.activeLoanWarningBox}>
                <View style={styles.activeLoanBadgeHeader}>
                  <ShieldAlert size={15} color="#B91C1C" style={{ marginRight: 6 }} />
                  <Text style={styles.activeLoanBadgeTitle}>
                    Crédito Activo en Curso ({activeLoan?.loanNumber || 'Actual'})
                  </Text>
                </View>
                <Text style={styles.activeLoanWarningText}>
                  Saldo pendiente: <Text style={{ fontWeight: '800' }}>{formatCOP(pendingBalance)}</Text>.
                  Al eliminar el cliente, el crédito se archivará como cancelado y la cartera en calle se reducirá automáticamente.
                </Text>
              </View>
            )}
          </View>

          {/* Aviso de Auditoría */}
          <View style={styles.auditNotice}>
            <AlertTriangle size={14} color="#64748B" style={{ marginRight: 6 }} />
            <Text style={styles.auditNoticeText}>
              Operación autorizada y registrada en la bitácora de auditoría.
            </Text>
          </View>

          {/* Botones de Acción */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isDeleting}
              activeOpacity={0.75}
            >
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.deleteBtn, isDeleting && { opacity: 0.7 }]}
              onPress={onConfirm}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.deleteBtnText}>Eliminando...</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Trash2 size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.deleteBtnText}>Sí, Eliminar</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 22,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  warningIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  modalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  customerCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  customerName: {
    fontFamily: FONT_FAMILY,
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  customerMeta: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  customerAddress: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  activeLoanWarningBox: {
    marginTop: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  activeLoanBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeLoanBadgeTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
  },
  activeLoanWarningText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#991B1B',
    lineHeight: 16,
  },
  auditNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  auditNoticeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cancelBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  deleteBtn: {
    flex: 1.2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
