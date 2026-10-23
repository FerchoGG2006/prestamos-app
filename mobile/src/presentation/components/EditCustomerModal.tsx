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
  Platform,
} from 'react-native';
import { Customer } from '../../core/domain/types';
import { localStore } from '../../infrastructure/storage/local-store';
import { UserCheck, X, Save, Phone, MapPin, Briefcase, Users } from 'lucide-react-native';

interface EditCustomerModalProps {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSuccess: (updatedCustomer: Customer) => void;
}

export const EditCustomerModal: React.FC<EditCustomerModalProps> = ({
  visible,
  customer,
  onClose,
  onSuccess,
}) => {
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [occupation, setOccupation] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [referencePhone, setReferencePhone] = useState('');
  const [referenceRelationship, setReferenceRelationship] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('route-norte');
  const [orderIndexStr, setOrderIndexStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableRoutes = localStore.getRoutes();

  useEffect(() => {
    if (customer && visible) {
      setFullName(customer.fullName || '');
      setDocumentNumber(customer.documentNumber || '');
      setPhone(customer.phone || '');
      setWhatsappPhone(customer.whatsappPhone || customer.phone || '');
      setAddress(customer.address || '');
      setNeighborhood(customer.neighborhood || '');
      setCity(customer.city || 'Barranquilla');
      setBusinessName(customer.businessName || '');
      setOccupation(customer.occupation || '');
      setSelectedRouteId(customer.routeId || 'route-norte');
      setOrderIndexStr(customer.orderIndex ? String(customer.orderIndex) : '');
      const firstRef = customer.references?.[0];
      setReferenceName(firstRef?.fullName || '');
      setReferencePhone(firstRef?.phone || '');
      setReferenceRelationship(firstRef?.relationship || 'Familiar');
    }
  }, [customer, visible]);

  if (!customer) return null;

  const handleSave = async () => {
    if (!fullName.trim()) {
      if (Platform.OS === 'web') window.alert('El nombre es requerido.');
      else Alert.alert('Campo Requerido', 'El nombre completo es requerido.');
      return;
    }

    if (!phone.trim()) {
      if (Platform.OS === 'web') window.alert('El teléfono para llamadas es requerido.');
      else Alert.alert('Campo Requerido', 'El teléfono para llamadas es requerido.');
      return;
    }

    if (!whatsappPhone.trim()) {
      if (Platform.OS === 'web') window.alert('El teléfono de WhatsApp es requerido.');
      else Alert.alert('Campo Requerido', 'El teléfono de WhatsApp es requerido.');
      return;
    }

    try {
      setIsSubmitting(true);
      const references = referenceName.trim()
        ? [
            {
              id: customer.references?.[0]?.id || `ref-${Date.now()}`,
              fullName: referenceName.trim(),
              phone: referencePhone.trim(),
              relationship: referenceRelationship.trim() || 'Familiar',
            },
          ]
        : customer.references || [];

      const parsedOrder = parseInt(orderIndexStr.replace(/\D/g, ''), 10);
      const targetRoute = availableRoutes.find((r) => r.id === selectedRouteId);
      const updated = await localStore.updateCustomer(customer.id, {
        fullName: fullName.trim(),
        documentNumber: documentNumber.trim(),
        phone: phone.trim(),
        whatsappPhone: whatsappPhone.trim(),
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        businessName: businessName.trim() || undefined,
        occupation: occupation.trim() || undefined,
        routeId: selectedRouteId,
        assignedCollectorId: targetRoute?.collectorId || customer.assignedCollectorId,
        orderIndex: !isNaN(parsedOrder) && parsedOrder > 0 ? parsedOrder : customer.orderIndex,
        references,
      });

      if (Platform.OS === 'web') {
        window.alert('Datos del cliente actualizados exitosamente.');
      } else {
        Alert.alert('Éxito', 'Datos del cliente actualizados exitosamente.');
      }

      onSuccess(updated);
      onClose();
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message || 'Error al actualizar el cliente');
      } else {
        Alert.alert('Error', err.message || 'Error al actualizar el cliente');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.iconBox}>
                <UserCheck size={20} color="#2563eb" />
              </View>
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.title}>Editar Datos del Cliente</Text>
                <Text style={styles.subtitle}>Actualizar información de contacto y ruta</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Nombre Completo */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nombre Completo *</Text>
              <TextInput
                style={styles.textInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ej. Carlos Martínez Mendoza"
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Cédula */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Cédula / Documento</Text>
              <TextInput
                style={styles.textInput}
                value={documentNumber}
                onChangeText={setDocumentNumber}
                placeholder="Ej. 1045678901"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
              />
            </View>

            {/* Teléfonos (Llamadas y WhatsApp) */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Teléfono Llamadas *</Text>
                <View style={styles.inputWithIcon}>
                  <Phone size={14} color="#64748b" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.textInputBare, { flex: 1 }]}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="3001234567"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.fieldLabel}>WhatsApp *</Text>
                  {phone.trim().length > 0 && whatsappPhone !== phone && (
                    <TouchableOpacity
                      onPress={() => setWhatsappPhone(phone)}
                      style={{ paddingHorizontal: 5, paddingVertical: 1, backgroundColor: '#E0F2FE', borderRadius: 4 }}
                    >
                      <Text style={{ fontSize: 9, color: '#0284C7', fontWeight: 'bold' }}>= Mismo</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.inputWithIcon}>
                  <Phone size={14} color="#059669" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.textInputBare, { flex: 1 }]}
                    value={whatsappPhone}
                    onChangeText={setWhatsappPhone}
                    placeholder="3001234567"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </View>

            {/* Dirección y Barrio */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1.2, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Dirección de Cobro</Text>
                <View style={styles.inputWithIcon}>
                  <MapPin size={14} color="#64748b" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.textInputBare, { flex: 1 }]}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Calle 45 # 23-10"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, { flex: 0.9, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Barrio</Text>
                <TextInput
                  style={styles.textInput}
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="El Prado"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Negocio y Ocupación */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Nombre del Negocio</Text>
                <View style={styles.inputWithIcon}>
                  <Briefcase size={14} color="#64748b" style={{ marginRight: 6 }} />
                  <TextInput
                    style={[styles.textInputBare, { flex: 1 }]}
                    value={businessName}
                    onChangeText={setBusinessName}
                    placeholder="Tienda La Esquina"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Ocupación / Oficio</Text>
                <TextInput
                  style={styles.textInput}
                  value={occupation}
                  onChangeText={setOccupation}
                  placeholder="Comerciante"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            {/* Ciudad y Orden en Ruta */}
            <View style={styles.rowTwoCols}>
              <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.fieldLabel}>Ciudad</Text>
                <TextInput
                  style={styles.textInput}
                  value={city}
                  onChangeText={setCity}
                  placeholder="Barranquilla"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.fieldLabel}>Posición / Orden en Ruta (#)</Text>
                <TextInput
                  style={styles.textInput}
                  value={orderIndexStr}
                  onChangeText={(t) => setOrderIndexStr(t.replace(/\D/g, ''))}
                  placeholder="Ej. 1"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Ruta Asignada */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Ruta Asignada</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {availableRoutes.map((rt) => {
                  const isSel = selectedRouteId === rt.id;
                  return (
                    <TouchableOpacity
                      key={rt.id}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: isSel ? '#2563eb' : '#cbd5e1',
                        backgroundColor: isSel ? '#eff6ff' : '#f8fafc',
                      }}
                      onPress={() => setSelectedRouteId(rt.id)}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isSel ? '#1d4ed8' : '#475569',
                        }}
                      >
                        🗺️ {rt.name} ({rt.code})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Referencia Personal / Familiar */}
            <View style={styles.referenceSection}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Users size={14} color="#475569" style={{ marginRight: 6 }} />
                <Text style={styles.sectionTitle}>Referencia Personal / Familiar</Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Nombre de la Referencia</Text>
                <TextInput
                  style={styles.textInput}
                  value={referenceName}
                  onChangeText={setReferenceName}
                  placeholder="Familiar o conocido"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <View style={styles.rowTwoCols}>
                <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.fieldLabel}>Parentesco</Text>
                  <TextInput
                    style={styles.textInput}
                    value={referenceRelationship}
                    onChangeText={setReferenceRelationship}
                    placeholder="Hermano, Cónyuge..."
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={styles.fieldLabel}>Teléfono Referencia</Text>
                  <TextInput
                    style={styles.textInput}
                    value={referencePhone}
                    onChangeText={setReferencePhone}
                    placeholder="3009876543"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer con botón de guardar */}
          <View style={styles.footerRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isSubmitting && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              <Save size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>
                {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
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
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    maxHeight: '88%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 25,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formScroll: {
    marginTop: 14,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    fontSize: 13,
    color: '#0f172a',
  },
  rowTwoCols: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  textInputBare: {
    paddingVertical: Platform.OS === 'ios' ? 10 : 7,
    fontSize: 13,
    color: '#0f172a',
  },
  referenceSection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginTop: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
});
