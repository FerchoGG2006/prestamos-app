import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Customer, Loan } from '../../core/domain/types';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import {
  ListOrdered,
  X,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  MapPin,
  Sparkles,
} from 'lucide-react-native';

interface RouteOrganizerModalProps {
  visible: boolean;
  customers: Customer[];
  loans: Loan[];
  onClose: () => void;
  onSuccess: () => void;
}

export const RouteOrganizerModal: React.FC<RouteOrganizerModalProps> = ({
  visible,
  customers,
  loans,
  onClose,
  onSuccess,
}) => {
  const [orderedCustomers, setOrderedCustomers] = useState<Customer[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      // Ordena los clientes inicialmente según su orderIndex o posición
      const sorted = [...customers].sort((a, b) => {
        const orderA = a.orderIndex ?? 9999;
        const orderB = b.orderIndex ?? 9999;
        return orderA - orderB;
      });
      setOrderedCustomers(sorted);
    }
  }, [visible, customers]);

  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...orderedCustomers];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setOrderedCustomers(updated);
  };

  const moveDown = (index: number) => {
    if (index === orderedCustomers.length - 1) return;
    const updated = [...orderedCustomers];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setOrderedCustomers(updated);
  };

  const sortByNeighborhood = () => {
    const sorted = [...orderedCustomers].sort((a, b) =>
      a.neighborhood.localeCompare(b.neighborhood)
    );
    setOrderedCustomers(sorted);
  };

  const sortAlphabetical = () => {
    const sorted = [...orderedCustomers].sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
    setOrderedCustomers(sorted);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const orderedIds = orderedCustomers.map((c) => c.id);
      await localStore.updateCustomerOrder(orderedIds);
      Alert.alert(
        '¡Ruta Reorganizada!',
        'El orden secuencial de cobro ha quedado guardado exitosamente para la jornada.'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el orden de la ruta');
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle Superior */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <ListOrdered size={18} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Organización de la Ruta</Text>
                <Text style={styles.subtitle}>
                  Define el orden de recorrido de los clientes ({orderedCustomers.length} en ruta)
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Atajos Rápidos de Ordenación */}
          <View style={styles.quickSortRow}>
            <Text style={styles.quickSortLabel}>Ordenar rápido por:</Text>
            <TouchableOpacity style={styles.sortPillBtn} onPress={sortByNeighborhood}>
              <MapPin size={12} color={COLORS.primary} />
              <Text style={styles.sortPillText}>Barrio / Sector</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sortPillBtn} onPress={sortAlphabetical}>
              <Sparkles size={12} color={COLORS.primary} />
              <Text style={styles.sortPillText}>Nombre A-Z</Text>
            </TouchableOpacity>
          </View>

          {/* Lista de Clientes con Controles de Subir / Bajar */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {orderedCustomers.map((customer, index) => {
              const activeLoan = loans.find(
                (l) => l.customerId === customer.id && l.status === 'ACTIVE'
              );

              return (
                <View key={customer.id} style={styles.itemRow}>
                  {/* Número de orden en la ruta */}
                  <View style={styles.orderBadge}>
                    <Text style={styles.orderBadgeText}>#{index + 1}</Text>
                  </View>

                  {/* Datos del Cliente */}
                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameLine}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {customer.fullName}
                      </Text>
                      {activeLoan && (
                        <Text style={styles.itemLoanTag}>#{activeLoan.loanNumber}</Text>
                      )}
                    </View>
                    <Text style={styles.itemAddress} numberOfLines={1}>
                      📍 {customer.neighborhood} • {customer.address}
                    </Text>
                  </View>

                  {/* Flechas de mover posición */}
                  <View style={styles.arrowsCol}>
                    <TouchableOpacity
                      style={[styles.arrowBtn, index === 0 && styles.arrowBtnDisabled]}
                      onPress={() => moveUp(index)}
                      disabled={index === 0}
                    >
                      <ArrowUp
                        size={14}
                        color={index === 0 ? COLORS.textMuted : COLORS.textPrimary}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.arrowBtn,
                        index === orderedCustomers.length - 1 && styles.arrowBtnDisabled,
                      ]}
                      onPress={() => moveDown(index)}
                      disabled={index === orderedCustomers.length - 1}
                    >
                      <ArrowDown
                        size={14}
                        color={
                          index === orderedCustomers.length - 1
                            ? COLORS.textMuted
                            : COLORS.textPrimary
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Botón Guardar Orden */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <CheckCircle size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Guardando...' : 'Guardar Secuencia de Ruta'}
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
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bgPrimary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
    gap: 8,
  },
  quickSortLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  sortPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
  },
  sortPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  orderBadge: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
  },
  orderBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary,
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  itemLoanTag: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textMuted,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  itemAddress: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  arrowsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  arrowBtnDisabled: {
    opacity: 0.3,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.microBorder,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dockBg,
    paddingVertical: 12,
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
