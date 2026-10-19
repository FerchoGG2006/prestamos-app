import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { OfficeCompanyConfig } from '../../core/domain/types';
import { COLORS } from '../theme/colors';
import {
  localStore,
  DEFAULT_OFFICE_CONFIG,
} from '../../infrastructure/storage/local-store';
import { formatCOP } from '../../core/config/business-rules';
import {
  Building2,
  X,
  CheckCircle,
  Percent,
  Calendar,
  Wallet,
  RotateCcw,
  Shield,
} from 'lucide-react-native';

interface OfficeConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const OfficeConfigModal: React.FC<OfficeConfigModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'EMPRESA' | 'CREDITO' | 'COBRADOR'>('EMPRESA');

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState('');

  const [defaultInterestRateStr, setDefaultInterestRateStr] = useState('20');
  const [defaultInstallmentsCountStr, setDefaultInstallmentsCountStr] = useState('30');
  const [excludeSundays, setExcludeSundays] = useState(true);
  const [paperworkRateStr, setPaperworkRateStr] = useState('5000');
  const [graceDaysStr, setGraceDaysStr] = useState('0');

  const [maxNewLoanLimitStr, setMaxNewLoanLimitStr] = useState('500000');
  const [routeInitialCashBaseStr, setRouteInitialCashBaseStr] = useState('200000');
  const [allowCollectorExpenses, setAllowCollectorExpenses] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const cfg = localStore.getOfficeConfig();
      setCompanyName(cfg.companyName || '');
      setTaxId(cfg.taxId || '');
      setCity(cfg.city || '');
      setAddress(cfg.address || '');
      setSupportPhone(cfg.supportPhone || '');
      setReceiptFooterMessage(cfg.receiptFooterMessage || '');

      setDefaultInterestRateStr(Math.round((cfg.defaultInterestRate || 0.2) * 100).toString());
      setDefaultInstallmentsCountStr((cfg.defaultInstallmentsCount || 30).toString());
      setExcludeSundays(cfg.excludeSundays ?? true);
      setPaperworkRateStr((cfg.paperworkRate || 5000).toString());
      setGraceDaysStr((cfg.graceDays || 0).toString());

      setMaxNewLoanLimitStr((cfg.maxNewLoanLimit || 500000).toString());
      setRouteInitialCashBaseStr((cfg.routeInitialCashBase || 200000).toString());
      setAllowCollectorExpenses(cfg.allowCollectorExpenses ?? true);
    }
  }, [visible]);

  const handleResetDefaults = () => {
    Alert.alert(
      'Restablecer Valores Recomendados',
      '¿Desea restaurar la configuración estándar para oficinas de crédito?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restablecer',
          style: 'destructive',
          onPress: () => {
            const def = DEFAULT_OFFICE_CONFIG;
            setCompanyName(def.companyName);
            setTaxId(def.taxId);
            setCity(def.city);
            setAddress(def.address);
            setSupportPhone(def.supportPhone);
            setReceiptFooterMessage(def.receiptFooterMessage);
            setDefaultInterestRateStr('20');
            setDefaultInstallmentsCountStr('30');
            setExcludeSundays(true);
            setPaperworkRateStr('5000');
            setGraceDaysStr('0');
            setMaxNewLoanLimitStr('500000');
            setRouteInitialCashBaseStr('200000');
            setAllowCollectorExpenses(true);
          },
        },
      ]
    );
  };

  const handleSave = async () => {
    if (!companyName.trim()) {
      Alert.alert('Campo Requerido', 'Por favor ingresa el nombre de la empresa u oficina.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedConfig: OfficeCompanyConfig = {
        companyName: companyName.trim(),
        taxId: taxId.trim(),
        city: city.trim(),
        address: address.trim(),
        supportPhone: supportPhone.trim(),
        receiptFooterMessage: receiptFooterMessage.trim(),
        defaultInterestRate: (parseFloat(defaultInterestRateStr) || 20) / 100,
        defaultInstallmentsCount: parseInt(defaultInstallmentsCountStr, 10) || 30,
        defaultFrequency: 'DAILY',
        excludeSundays,
        paperworkRate: parseInt(paperworkRateStr.replace(/\D/g, ''), 10) || 5000,
        graceDays: parseInt(graceDaysStr, 10) || 0,
        maxNewLoanLimit: parseInt(maxNewLoanLimitStr.replace(/\D/g, ''), 10) || 500000,
        routeInitialCashBase: parseInt(routeInitialCashBaseStr.replace(/\D/g, ''), 10) || 200000,
        allowCollectorExpenses,
      };

      await localStore.updateOfficeConfig(updatedConfig);
      Alert.alert(
        '¡Configuración Guardada!',
        `La oficina "${updatedConfig.companyName}" ha quedado configurada exitosamente.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Building2 size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Configuración de la Oficina</Text>
                <Text style={styles.subtitle}>
                  Parámetros comerciales, operativos y de empresa
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tabs internas */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'EMPRESA' && styles.tabBtnActive]}
              onPress={() => setActiveTab('EMPRESA')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'EMPRESA' && styles.tabTextActive,
                ]}
              >
                1. Empresa / Sede
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'CREDITO' && styles.tabBtnActive]}
              onPress={() => setActiveTab('CREDITO')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'CREDITO' && styles.tabTextActive,
                ]}
              >
                2. Crédito & Cobro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'COBRADOR' && styles.tabBtnActive]}
              onPress={() => setActiveTab('COBRADOR')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'COBRADOR' && styles.tabTextActive,
                ]}
              >
                3. Cobradores
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* PESTAÑA 1: DATOS DE EMPRESA */}
            {activeTab === 'EMPRESA' && (
              <View style={styles.sectionContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Razón Social / Nombre Comercial *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={companyName}
                    onChangeText={setCompanyName}
                    placeholder="Ej. Inversiones & Créditos El Dorado"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>NIT / Identificación</Text>
                    <TextInput
                      style={styles.textInput}
                      value={taxId}
                      onChangeText={setTaxId}
                      placeholder="901.458.789-1"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Ciudad Principal</Text>
                    <TextInput
                      style={styles.textInput}
                      value={city}
                      onChangeText={setCity}
                      placeholder="Barranquilla"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Dirección de la Oficina</Text>
                  <TextInput
                    style={styles.textInput}
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Calle 72 # 48-25, Oficina 302"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Teléfono / WhatsApp de Atención</Text>
                  <TextInput
                    style={styles.textInput}
                    value={supportPhone}
                    onChangeText={setSupportPhone}
                    placeholder="+57 300 123 4567"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Mensaje Pie de Comprobante / Recibo</Text>
                  <TextInput
                    style={[styles.textInput, { height: 60, textAlignVertical: 'top' }]}
                    value={receiptFooterMessage}
                    onChangeText={setReceiptFooterMessage}
                    placeholder="Gracias por su puntualidad • Conserve este comprobante"
                    placeholderTextColor={COLORS.textMuted}
                    multiline
                  />
                  <Text style={styles.inputHelp}>
                    Este mensaje se imprime al final de los recibos de WhatsApp y tirillas.
                  </Text>
                </View>
              </View>
            )}

            {/* PESTAÑA 2: POLÍTICAS DE CRÉDITO Y COBRO */}
            {activeTab === 'CREDITO' && (
              <View style={styles.sectionContainer}>
                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>Tasa de Interés (%)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={defaultInterestRateStr}
                      onChangeText={setDefaultInterestRateStr}
                      keyboardType="numeric"
                      placeholder="20"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.inputHelp}>Por defecto: 20% inicial</Text>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Plazo en Cuotas (días)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={defaultInstallmentsCountStr}
                      onChangeText={setDefaultInstallmentsCountStr}
                      keyboardType="numeric"
                      placeholder="30"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.inputHelp}>Por defecto: 30 días</Text>
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>Papelería por cada $100k</Text>
                    <TextInput
                      style={styles.textInput}
                      value={paperworkRateStr}
                      onChangeText={setPaperworkRateStr}
                      keyboardType="numeric"
                      placeholder="5000"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Días de Gracia (Mora)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={graceDaysStr}
                      onChangeText={setGraceDaysStr}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Excluir Domingos del Calendario</Text>
                    <Text style={styles.switchSub}>
                      No genera cuotas ni exige cobro los días domingo.
                    </Text>
                  </View>
                  <Switch
                    value={excludeSundays}
                    onValueChange={setExcludeSundays}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            )}

            {/* PESTAÑA 3: PARÁMETROS OPERATIVOS PARA COBRADORES */}
            {activeTab === 'COBRADOR' && (
              <View style={styles.sectionContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Límite Máximo Préstamo Cliente Nuevo ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={maxNewLoanLimitStr}
                    onChangeText={setMaxNewLoanLimitStr}
                    keyboardType="numeric"
                    placeholder="500000"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.inputHelp}>
                    Monto tope que un cobrador puede desembolsar sin autorización de gerencia.
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Base de Efectivo Inicial en Ruta ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={routeInitialCashBaseStr}
                    onChangeText={setRouteInitialCashBaseStr}
                    keyboardType="numeric"
                    placeholder="200000"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.inputHelp}>
                    Dinero entregado al cobrador al iniciar la mañana para vueltos y desembolsos.
                  </Text>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Permitir Registrar Gastos de Ruta</Text>
                    <Text style={styles.switchSub}>
                      Habilita al cobrador registrar combustible, peajes o viáticos en calle.
                    </Text>
                  </View>
                  <Switch
                    value={allowCollectorExpenses}
                    onValueChange={setAllowCollectorExpenses}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefaults}>
              <RotateCcw size={14} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.resetBtnText}>Valores Recomendados</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, isSaving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              <CheckCircle size={16} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>
                {isSaving ? 'Guardando...' : 'Guardar Configuración'}
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
    maxHeight: '90%',
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
    backgroundColor: COLORS.bgSecondary,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  sectionContainer: {
    gap: 12,
    paddingBottom: 20,
  },
  inputGroup: {
    gap: 4,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  inputHelp: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  textInput: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    marginTop: 4,
  },
  switchTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  switchSub: {
    fontSize: 10.5,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.microBorder,
    gap: 10,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dockBg,
    paddingVertical: 12,
    borderRadius: 14,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
