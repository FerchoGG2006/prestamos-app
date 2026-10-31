import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { Customer, Loan } from '../../core/domain/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Phone,
  MessageCircle,
  MapPin,
  CreditCard,
  History,
  Trash2,
  ChevronRight,
  ExternalLink,
  Calendar,
  AlertCircle,
  Eye,
  Edit3,
  RefreshCw,
} from 'lucide-react-native';
import { COLORS, FONT_FAMILY } from '../theme/colors';

interface CustomerOptionsModalProps {
  visible: boolean;
  customer: Customer | null;
  activeLoan?: Loan | null;
  isAdmin?: boolean;
  onClose: () => void;
  onViewDetail: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  onNewLoan: (customer: Customer) => void;
  onFixedDateLoan?: (customer: Customer) => void;
  onViewHistory: (customer: Customer) => void;
  onPromiseLoan?: (customer: Customer, loan: Loan) => void;
  onNonPayment?: (customer: Customer, loan: Loan) => void;
  onRenewLoan?: (customer: Customer, loan: Loan) => void;
  onDeleteCustomer?: (customer: Customer, force?: boolean) => void;
}

export const CustomerOptionsModal: React.FC<CustomerOptionsModalProps> = ({
  visible,
  customer,
  activeLoan,
  isAdmin = false,
  onClose,
  onViewDetail,
  onEditCustomer,
  onNewLoan,
  onFixedDateLoan,
  onViewHistory,
  onPromiseLoan,
  onNonPayment,
  onRenewLoan,
  onDeleteCustomer,
}) => {
  const insets = useSafeAreaInsets();
  if (!customer) return null;

  const handleCall = () => {
    if (!customer.phone) {
      Alert.alert('Sin Teléfono', 'Este cliente no tiene un teléfono registrado.');
      return;
    }
    const cleanPhone = customer.phone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Error', 'No fue posible abrir la aplicación de llamadas.');
    });
  };

  const handleWhatsApp = () => {
    const rawWa = customer.whatsappPhone || customer.phone;
    if (!rawWa) {
      Alert.alert('Sin Teléfono', 'Este cliente no tiene un número registrado para WhatsApp.');
      return;
    }
    let digits = rawWa.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `57${digits}`;
    }
    const message = encodeURIComponent(
      `Hola ${customer.fullName}, me comunico de la administración de su crédito. ¿Cómo está?`
    );
    const waUrl = `https://wa.me/${digits}?text=${message}`;
    Linking.openURL(waUrl).catch(() => {
      Alert.alert('Error', 'No fue posible abrir WhatsApp.');
    });
  };

  const handleOpenMaps = () => {
    const address = `${customer.address || ''}, ${customer.neighborhood || ''}, ${customer.city || 'Colombia'}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'No fue posible abrir el mapa.');
    });
  };

  const handleDeletePress = () => {
    const hasActive = !!activeLoan;
    const alertTitle = hasActive
      ? '⚠️ Cliente con Crédito Activo'
      : 'Eliminar Cliente';
    const alertMessage = hasActive
      ? `El cliente ${customer.fullName} tiene un crédito activo (${activeLoan?.loanNumber || 'en curso'}). Si lo elimina, el crédito se archivará como cancelado. ¿Desea continuar de todas formas?`
      : `¿Está seguro de eliminar a ${customer.fullName}? Esta acción lo removerá de la ruta y del directorio.`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${alertTitle}\n\n${alertMessage}`);
      if (confirmed) {
        onClose();
        onDeleteCustomer?.(customer, hasActive);
      }
    } else {
      Alert.alert(
        alertTitle,
        alertMessage,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: hasActive ? 'Eliminar de todas formas' : 'Eliminar',
            style: 'destructive',
            onPress: () => {
              onClose();
              onDeleteCustomer?.(customer, hasActive);
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  const initials = (customer.fullName || 'CL')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 12) }]}>
        <View
          style={[
            styles.modalContainer,
            { paddingBottom: Math.max(insets.bottom, 16), flexShrink: 1 },
          ]}
        >
          {/* Header con tarjeta del cliente */}
          <View style={styles.modalHeader}>
            <View style={styles.headerInfoRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {customer.fullName}
                </Text>
                <Text style={styles.customerSub}>
                  CC: {customer.documentNumber || 'Sin doc'} • Tel: {customer.phone}
                </Text>
                <Text style={styles.customerAddress} numberOfLines={1}>
                  {customer.address} • {customer.neighborhood}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Badge de estado del crédito */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.loanStatusBadge,
                activeLoan
                  ? { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }
                  : { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: activeLoan ? '#2563eb' : '#94a3b8' },
                ]}
              />
              <Text
                style={[
                  styles.loanStatusText,
                  { color: activeLoan ? '#1d4ed8' : '#64748b' },
                ]}
              >
                {activeLoan
                  ? `Crédito Activo: ${activeLoan.loanNumber}`
                  : 'Sin crédito activo en ruta'}
              </Text>
            </View>
          </View>

          {/* Opciones disponibles */}
          <ScrollView
            style={styles.optionsList}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Opción 1: Ver Ficha 360 */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                onViewDetail(customer);
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#f0fdf4' }]}>
                <Eye size={20} color="#16a34a" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Ver Ficha 360 / Detalle</Text>
                <Text style={styles.optionSubtitle}>
                  Plan de cuotas, comprobantes, referencias y datos
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 2: Editar Datos del Cliente */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                onEditCustomer(customer);
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#e0f2fe' }]}>
                <Edit3 size={19} color="#0284c7" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Editar Datos del Cliente</Text>
                <Text style={styles.optionSubtitle}>
                  Actualizar teléfono, dirección, barrio o referencias
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 2: Otorgar Nuevo Crédito */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                onNewLoan(customer);
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#eff6ff' }]}>
                <CreditCard size={20} color="#2563eb" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>+ Otorgar Nuevo Crédito</Text>
                <Text style={styles.optionSubtitle}>
                  Crear nuevo préstamo asignado a este cliente
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción Fecha Fija */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                if (onFixedDateLoan) {
                  onFixedDateLoan(customer);
                } else {
                  onNewLoan(customer);
                }
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#f0fdf4' }]}>
                <Calendar size={20} color="#15803d" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>📅 Fecha Fija (1 Cuota a Plazo)</Text>
                <Text style={styles.optionSubtitle}>
                  Crédito a cancelar en una fecha fija convenida
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 3: Historial Crediticio */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                onViewHistory(customer);
              }}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#f5f3ff' }]}>
                <History size={20} color="#7c3aed" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Historial Crediticio</Text>
                <Text style={styles.optionSubtitle}>
                  Récord de pago, créditos anteriores y liquidaciones
                </Text>
              </View>
              <ChevronRight size={18} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 4: Llamar */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={handleCall}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#ecfdf5' }]}>
                <Phone size={20} color="#059669" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Llamar al Cliente</Text>
                <Text style={styles.optionSubtitle}>{customer.phone || 'Sin número'}</Text>
              </View>
              <ExternalLink size={16} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 5: WhatsApp */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={handleWhatsApp}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#f0fdf4' }]}>
                <MessageCircle size={20} color="#16a34a" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Enviar WhatsApp Directo</Text>
                <Text style={styles.optionSubtitle}>Abrir chat con saludo formal</Text>
              </View>
              <ExternalLink size={16} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 6: Google Maps */}
            <TouchableOpacity
              style={styles.optionItem}
              activeOpacity={0.7}
              onPress={handleOpenMaps}
            >
              <View style={[styles.optionIconBox, { backgroundColor: '#fff7ed' }]}>
                <MapPin size={20} color="#ea580c" />
              </View>
              <View style={styles.optionTextBox}>
                <Text style={styles.optionTitle}>Ver Ubicación en Google Maps</Text>
                <Text style={styles.optionSubtitle}>
                  {customer.address} • {customer.neighborhood}
                </Text>
              </View>
              <ExternalLink size={16} color="#94a3b8" />
            </TouchableOpacity>

            {/* Opción 7: Promesa de Pago (si tiene crédito activo) */}
            {activeLoan && onPromiseLoan && (
              <TouchableOpacity
                style={styles.optionItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  onPromiseLoan(customer, activeLoan);
                }}
              >
                <View style={[styles.optionIconBox, { backgroundColor: '#fffbeb' }]}>
                  <Calendar size={20} color="#d97706" />
                </View>
                <View style={styles.optionTextBox}>
                  <Text style={styles.optionTitle}>Registrar Promesa de Pago</Text>
                  <Text style={styles.optionSubtitle}>
                    Pactar fecha límite de compromiso de pago
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}

            {/* Opción 8: Visita No Pago (si tiene crédito activo) */}
            {activeLoan && onNonPayment && (
              <TouchableOpacity
                style={styles.optionItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  onNonPayment(customer, activeLoan);
                }}
              >
                <View style={[styles.optionIconBox, { backgroundColor: '#fef2f2' }]}>
                  <AlertCircle size={20} color="#dc2626" />
                </View>
                <View style={styles.optionTextBox}>
                  <Text style={styles.optionTitle}>Registrar Visita No Pago</Text>
                  <Text style={styles.optionSubtitle}>
                    Reportar motivo (no estaba, negocio cerrado, etc.)
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}

            {/* Opción: Renovar Crédito (si tiene crédito activo) */}
            {activeLoan && onRenewLoan && (
              <TouchableOpacity
                style={styles.optionItem}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  onRenewLoan(customer, activeLoan);
                }}
              >
                <View style={[styles.optionIconBox, { backgroundColor: '#faf5ff' }]}>
                  <RefreshCw size={20} color="#7e22ce" />
                </View>
                <View style={styles.optionTextBox}>
                  <Text style={styles.optionTitle}>Renovar Crédito</Text>
                  <Text style={styles.optionSubtitle}>
                    Refinanciar o liquidar saldo para crédito nuevo
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </TouchableOpacity>
            )}

            {/* Opción: Eliminar Cliente (DANGER) - EXCLUSIVO PARA ADMINISTRADOR */}
            {onDeleteCustomer && (
              <>
                <View style={styles.dangerDivider} />
                <TouchableOpacity
                  style={[styles.optionItem, styles.dangerOptionItem]}
                  activeOpacity={0.7}
                  onPress={handleDeletePress}
                >
                  <View style={[styles.optionIconBox, { backgroundColor: '#fee2e2' }]}>
                    <Trash2 size={20} color="#dc2626" />
                  </View>
                  <View style={styles.optionTextBox}>
                    <Text style={styles.dangerOptionTitle}>🗑️ Eliminar Cliente</Text>
                    <Text style={styles.dangerOptionSubtitle}>
                      Remover cliente del directorio y la ruta (Requiere permisos de Administrador)
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#ef4444" />
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingTop: 16,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  headerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FONT_FAMILY,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  customerName: {
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  customerSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  customerAddress: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  badgeRow: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  loanStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  loanStatusText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  optionsList: {
    marginTop: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginVertical: 3,
  },
  optionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionTextBox: {
    flex: 1,
  },
  optionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  optionSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  dangerDivider: {
    height: 1,
    backgroundColor: '#fee2e2',
    marginVertical: 8,
  },
  dangerOptionItem: {
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  dangerOptionTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
  dangerOptionSubtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#ef4444',
    marginTop: 2,
  },
});
