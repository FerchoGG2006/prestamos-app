import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { COLORS } from '../theme/colors';
import { localStore } from '../../infrastructure/storage/local-store';
import { UserPlus, X } from 'lucide-react-native';

interface NewCustomerModalProps {
  visible: boolean;
  todayStr: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  visible,
  todayStr,
  onClose,
  onSuccess,
}) => {
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [referenceName, setReferenceName] = useState('');
  const [referencePhone, setReferencePhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setFullName('');
    setDocumentNumber('');
    setPhone('');
    setAddress('');
    setNeighborhood('');
    setBusinessName('');
    setReferenceName('');
    setReferencePhone('');
  };

  const handleSaveCustomer = async () => {
    if (!fullName.trim() || !documentNumber.trim()) {
      Alert.alert('Campos requeridos', 'Ingrese el nombre completo y número de cédula.');
      return;
    }

    setIsSubmitting(true);
    try {
      await localStore.createCustomer({
        fullName,
        documentNumber,
        phone,
        address,
        neighborhood,
        businessName,
        referenceName,
        referencePhone,
        todayStr,
      });

      Alert.alert('Cliente Creado', `${fullName} fue agregado a la ruta.`);
      resetForm();
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo registrar el cliente');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Datos del Cliente</Text>
              <Text style={styles.subtitle}>
                Filled Inputs con Floating Labels • Offline-First
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Patrón #5 de Gemini Share: Filled Inputs con etiqueta flotante interna + micro-borde 1px */}
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

            <View style={styles.row2}>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>CÉDULA / NIT *</Text>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="numeric"
                  value={documentNumber}
                  onChangeText={setDocumentNumber}
                  placeholder="1045..."
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
              <View style={[styles.filledInputBlock, { flex: 1 }]}>
                <Text style={styles.floatingLabel}>CELULAR / WHATSAPP *</Text>
                <TextInput
                  style={styles.filledTextInput}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="300..."
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
              <Text style={styles.floatingLabel}>DIRECCIÓN DE COBRO DIARIO</Text>
              <TextInput
                style={styles.filledTextInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Ej. Calle 54 # 43 - 10"
                placeholderTextColor={COLORS.textMuted}
              />
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
          </ScrollView>

          <TouchableOpacity
            style={[styles.saveBtn, isSubmitting && { opacity: 0.5 }]}
            onPress={handleSaveCustomer}
            disabled={isSubmitting}
          >
            <UserPlus size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.saveBtnText}>
              {isSubmitting ? 'Guardando...' : 'Guardar Cliente en Ruta'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
    paddingBottom: 24,
    maxHeight: '90%',
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
  row2: {
    flexDirection: 'row',
    gap: 10,
  },
  // FILLED INPUTS CON FLOATING LABELS INTERNOS (Patrón #5 + Mejora IA #3)
  filledInputBlock: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
  },
  floatingLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  filledTextInput: {
    height: 28,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  saveBtn: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.dockBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
