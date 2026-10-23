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
  Platform,
  KeyboardAvoidingView,
  Share,
} from 'react-native';
import { OfficeCompanyConfig, Route, User } from '../../core/domain/types';
import { getLocalTodayStr } from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import {
  localStore,
  DEFAULT_OFFICE_CONFIG,
} from '../../infrastructure/storage/local-store';
import {
  Building2,
  X,
  CheckCircle,
  RotateCcw,
  Eye,
  EyeOff,
  Plus,
  FileText,
  Download,
  Upload,
  HardDrive,
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
  const [activeTab, setActiveTab] = useState<'EMPRESA' | 'CREDITO' | 'PERMISOS' | 'RUTAS' | 'BACKUP'>('EMPRESA');
  const [restoreJsonInput, setRestoreJsonInput] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // 1. Datos Empresa
  const [companyName, setCompanyName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [receiptFooterMessage, setReceiptFooterMessage] = useState('');
  const [officeServerUrl, setOfficeServerUrl] = useState('http://192.168.1.10:8765');

  // 2. Políticas de Crédito (Audio 2: opción de cobrar o no papelería)
  const [paperworkFeeEnabled, setPaperworkFeeEnabled] = useState(true);
  const [paperworkRateStr, setPaperworkRateStr] = useState('5000');
  const [defaultInterestRateStr, setDefaultInterestRateStr] = useState('20');
  const [defaultInstallmentsCountStr, setDefaultInstallmentsCountStr] = useState('30');
  const [excludeSundays, setExcludeSundays] = useState(true);
  const [graceDaysStr, setGraceDaysStr] = useState('0');

  // 3. Permisos de Ruta ("Qué cosas sí, qué cosas no")
  const [allowRouteNewLoans, setAllowRouteNewLoans] = useState(true);
  const [allowCollectorExpenses, setAllowCollectorExpenses] = useState(true);
  const [allowRouteReorder, setAllowRouteReorder] = useState(false);
  const [allowPartialPayments, setAllowPartialPayments] = useState(true);
  const [maxNewLoanLimitStr, setMaxNewLoanLimitStr] = useState('500000');
  const [routeInitialCashBaseStr, setRouteInitialCashBaseStr] = useState('200000');

  // 4. Gestión de Rutas y Credenciales (Audio 1: solo visible para el Administrador)
  const [routesList, setRoutesList] = useState<Route[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [showNewRouteForm, setShowNewRouteForm] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newCollectorName, setNewCollectorName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

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
      setOfficeServerUrl(cfg.officeServerUrl || 'http://192.168.1.10:8765');

      setPaperworkFeeEnabled(cfg.paperworkFeeEnabled ?? true);
      setPaperworkRateStr((cfg.paperworkRate || 5000).toString());
      setDefaultInterestRateStr(Math.round((cfg.defaultInterestRate || 0.2) * 100).toString());
      setDefaultInstallmentsCountStr((cfg.defaultInstallmentsCount || 30).toString());
      setExcludeSundays(cfg.excludeSundays ?? true);
      setGraceDaysStr((cfg.graceDays || 0).toString());

      setAllowRouteNewLoans(cfg.allowRouteNewLoans ?? true);
      setAllowCollectorExpenses(cfg.allowCollectorExpenses ?? true);
      setAllowRouteReorder(cfg.allowRouteReorder ?? false);
      setAllowPartialPayments(cfg.allowPartialPayments ?? true);
      setMaxNewLoanLimitStr((cfg.maxNewLoanLimit || 500000).toString());
      setRouteInitialCashBaseStr((cfg.routeInitialCashBase || 200000).toString());

      setRoutesList([...localStore.getRoutes()]);
      setUsersList([...localStore.getUsers()]);
    }
  }, [visible]);

  const togglePasswordVisibility = (userId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleCreateRouteWithCredentials = async () => {
    if (!newRouteName.trim() || !newCollectorName.trim() || !newUsername.trim() || !newPassword.trim()) {
      Alert.alert('Campos Incompletos', 'Por favor diligencie todos los campos para crear la nueva ruta.');
      return;
    }

    try {
      const routeId = `route-${Date.now()}`;
      const collectorId = `usr-col-${Date.now()}`;

      const newCollector: User = {
        id: collectorId,
        name: newCollectorName.trim(),
        username: newUsername.trim().toLowerCase(),
        password: newPassword.trim(),
        email: `${newUsername.trim().toLowerCase()}@cartera.com`,
        role: 'COBRADOR',
        assignedRouteIds: [routeId],
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const newRoute: Route = {
        id: routeId,
        name: newRouteName.trim(),
        code: `R-${routesList.length + 1}`,
        collectorId: collectorId,
        isActive: true,
        description: `Ruta asignada a ${newCollectorName}`,
        createdAt: new Date().toISOString(),
      };

      const updatedUsers = [...usersList, newCollector];
      const updatedRoutes = [...routesList, newRoute];

      await localStore.saveUsersAndRoutes(updatedUsers, updatedRoutes);

      setUsersList(updatedUsers);
      setRoutesList(updatedRoutes);
      setShowNewRouteForm(false);
      setNewRouteName('');
      setNewCollectorName('');
      setNewUsername('');
      setNewPassword('');

      Alert.alert(
        '¡Ruta Creada Exitosamente!',
        `Se habilitó "${newRoute.name}".\n\nCredenciales de Acceso:\nUsuario: ${newCollector.username}\nContraseña: ${newCollector.password}`
      );
    } catch (err: any) {
      Alert.alert('Error al crear ruta', err.message || 'No se pudo guardar la ruta.');
    }
  };

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
            setPaperworkFeeEnabled(true);
            setPaperworkRateStr('5000');
            setDefaultInterestRateStr('20');
            setDefaultInstallmentsCountStr('30');
            setExcludeSundays(true);
            setGraceDaysStr('0');
            setAllowRouteNewLoans(true);
            setAllowCollectorExpenses(true);
            setAllowRouteReorder(false);
            setAllowPartialPayments(true);
            setMaxNewLoanLimitStr('500000');
            setRouteInitialCashBaseStr('200000');
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
        paperworkFeeEnabled,
        defaultInterestRate: (parseFloat(defaultInterestRateStr) || 20) / 100,
        defaultInstallmentsCount: parseInt(defaultInstallmentsCountStr, 10) || 30,
        defaultFrequency: 'DAILY',
        excludeSundays,
        paperworkRate: parseInt(paperworkRateStr.replace(/\D/g, ''), 10) || 5000,
        graceDays: parseInt(graceDaysStr, 10) || 0,
        allowRouteNewLoans,
        allowCollectorExpenses,
        allowRouteReorder,
        allowPartialPayments,
        maxNewLoanLimit: parseInt(maxNewLoanLimitStr.replace(/\D/g, ''), 10) || 500000,
        routeInitialCashBase: parseInt(routeInitialCashBaseStr.replace(/\D/g, ''), 10) || 200000,
        officeServerUrl: officeServerUrl.trim() || 'http://192.168.1.10:8765',
      };

      await localStore.updateOfficeConfig(updatedConfig);
      Alert.alert(
        '¡Configuración Operativa Guardada!',
        `Los parámetros de "${updatedConfig.companyName}" han sido actualizados exitosamente.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const json = localStore.exportFullBackupJSON();
      const dateStr = getLocalTodayStr();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cartera_respaldo_${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        window.alert('Copia de seguridad descargada exitosamente en formato JSON.');
      } else {
        setRestoreJsonInput(json);
        await Share.share({
          title: `cartera_respaldo_${dateStr}.json`,
          message: json,
        });
      }
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message || 'Error al exportar');
      else Alert.alert('Error', err.message || 'Error al exportar');
    }
  };

  const handleRestoreBackup = async () => {
    if (!restoreJsonInput.trim()) {
      if (Platform.OS === 'web') window.alert('Pegue el texto JSON del respaldo.');
      else Alert.alert('Campo Vacío', 'Pegue el texto JSON del respaldo.');
      return;
    }

    const confirmMsg =
      '¿Está seguro de restaurar esta copia de seguridad? Se reemplazarán los datos actuales de la ruta por los datos del archivo.';
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMsg);
      if (!confirmed) return;
    }

    try {
      setIsRestoring(true);
      const res = await localStore.restoreFullBackupJSON(restoreJsonInput.trim());
      if (Platform.OS === 'web') {
        window.alert(`Respaldo restaurado con éxito (${res.customersCount} clientes, ${res.loansCount} créditos).`);
      } else {
        Alert.alert('Éxito', `Respaldo restaurado con éxito (${res.customersCount} clientes, ${res.loansCount} créditos).`);
      }
      setRestoreJsonInput('');
      onSuccess();
      onClose();
    } catch (err: any) {
      if (Platform.OS === 'web') window.alert(err.message || 'Error al restaurar');
      else Alert.alert('Error al restaurar', err.message || 'Error al restaurar');
    } finally {
      setIsRestoring(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconCircle}>
                <Building2 size={20} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Panel Operativo de la Oficina</Text>
                <Text style={styles.subtitle}>
                  Configuración del negocio, políticas y credenciales de ruta
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Barra de 4 Tabs Operativas */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'EMPRESA' && styles.tabBtnActive]}
              onPress={() => setActiveTab('EMPRESA')}
            >
              <Text style={[styles.tabText, activeTab === 'EMPRESA' && styles.tabTextActive]}>
                1. Sede
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'CREDITO' && styles.tabBtnActive]}
              onPress={() => setActiveTab('CREDITO')}
            >
              <Text style={[styles.tabText, activeTab === 'CREDITO' && styles.tabTextActive]}>
                2. Crédito & Cobro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'PERMISOS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('PERMISOS')}
            >
              <Text style={[styles.tabText, activeTab === 'PERMISOS' && styles.tabTextActive]}>
                3. Permisos Ruta
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'RUTAS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('RUTAS')}
            >
              <Text style={[styles.tabText, activeTab === 'RUTAS' && styles.tabTextActive]}>
                4. Credenciales
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'BACKUP' && styles.tabBtnActive]}
              onPress={() => setActiveTab('BACKUP')}
            >
              <Text style={[styles.tabText, activeTab === 'BACKUP' && styles.tabTextActive]}>
                5. Respaldo
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

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    📡 URL Servidor PC Oficina (Sincronización Wi-Fi Local)
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={officeServerUrl}
                    onChangeText={setOfficeServerUrl}
                    placeholder="http://192.168.1.10:8765"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                  />
                  <Text style={styles.inputHelp}>
                    Dirección IP del PC de Oficina en la red Wi-Fi local (puerto 8765 por defecto).
                  </Text>
                </View>
              </View>
            )}

            {/* PESTAÑA 2: POLÍTICAS DE CRÉDITO Y COBRO (AUDIO 2) */}
            {activeTab === 'CREDITO' && (
              <View style={styles.sectionContainer}>
                {/* Switch de Papelería / Cartulina */}
                <View style={styles.highlightSwitchCard}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <FileText size={16} color={paperworkFeeEnabled ? COLORS.primary : COLORS.textMuted} />
                      <Text style={styles.switchTitle}>¿Cobrar Papelería / Cartulina?</Text>
                    </View>
                    <Text style={styles.switchSub}>
                      {paperworkFeeEnabled
                        ? 'Activo: Se descuenta la tarifa configurada al momento del desembolso.'
                        : 'Desactivado: La oficina entrega el 100% del capital sin descontar papelería.'}
                    </Text>
                  </View>
                  <Switch
                    value={paperworkFeeEnabled}
                    onValueChange={setPaperworkFeeEnabled}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {paperworkFeeEnabled && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Tarifa de Papelería por cada $100.000 ($)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={paperworkRateStr}
                      onChangeText={setPaperworkRateStr}
                      keyboardType="numeric"
                      placeholder="5000"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.inputHelp}>
                      Ejemplo: $5.000 por cada $100.000 prestados (en un préstamo de $300.000 descuenta $15.000).
                    </Text>
                  </View>
                )}

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
                    <Text style={styles.inputHelp}>Estándar: 20% inicial</Text>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Plazo Sugerido (días)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={defaultInstallmentsCountStr}
                      onChangeText={setDefaultInstallmentsCountStr}
                      keyboardType="numeric"
                      placeholder="30"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.inputHelp}>Estándar: 24 - 30 cuotas</Text>
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Días de Gracia para Mora</Text>
                  <TextInput
                    style={styles.textInput}
                    value={graceDaysStr}
                    onChangeText={setGraceDaysStr}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.inputHelp}>
                    Días de tolerancia antes de marcar la cuota como vencida (por defecto 0).
                  </Text>
                </View>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Excluir Domingos del Calendario</Text>
                    <Text style={styles.switchSub}>
                      No genera cuotas ni exige cobro los domingos.
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

            {/* PESTAÑA 3: PERMISOS DE LAS RUTAS ("QUÉ COSAS SÍ, QUÉ COSAS NO") */}
            {activeTab === 'PERMISOS' && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionHeaderTitle}>Controles y Restricciones Operativas</Text>
                <Text style={styles.sectionHeaderSub}>
                  Define las facultades de los cobradores cuando están en la calle.
                </Text>

                {/* 1. Desembolsar Préstamos en Calle */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Permitir Desembolsar Nuevos Créditos</Text>
                    <Text style={styles.switchSub}>
                      Habilita al cobrador crear y entregar nuevos préstamos desde el móvil.
                    </Text>
                  </View>
                  <Switch
                    value={allowRouteNewLoans}
                    onValueChange={setAllowRouteNewLoans}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* 2. Registrar Gastos de Ruta */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Permitir Registrar Gastos de Ruta</Text>
                    <Text style={styles.switchSub}>
                      Habilita registrar combustible, viáticos o imprevistos de la moto.
                    </Text>
                  </View>
                  <Switch
                    value={allowCollectorExpenses}
                    onValueChange={setAllowCollectorExpenses}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* 3. Reorganizar Orden de Visitas */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Permitir Alterar Orden de Ruta</Text>
                    <Text style={styles.switchSub}>
                      Permite al cobrador cambiar la secuencia de visita de los clientes.
                    </Text>
                  </View>
                  <Switch
                    value={allowRouteReorder}
                    onValueChange={setAllowRouteReorder}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* 4. Abonos Parciales */}
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.switchTitle}>Permitir Abonos Parciales</Text>
                    <Text style={styles.switchSub}>
                      Permite recibir montos menores al valor completo de la cuota pactada.
                    </Text>
                  </View>
                  <Switch
                    value={allowPartialPayments}
                    onValueChange={setAllowPartialPayments}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Límites Monetarios */}
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
                    Tope que un cobrador puede desembolsar sin autorización previa de gerencia.
                  </Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Base de Efectivo Sugerida en Ruta ($)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={routeInitialCashBaseStr}
                    onChangeText={setRouteInitialCashBaseStr}
                    keyboardType="numeric"
                    placeholder="200000"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <Text style={styles.inputHelp}>
                    Monto asignado al cobrador en la mañana para vueltos y préstamos.
                  </Text>
                </View>
              </View>
            )}

            {/* PESTAÑA 4: GESTIÓN DE RUTAS Y CREDENCIALES (AUDIO 1) */}
            {activeTab === 'RUTAS' && (
              <View style={styles.sectionContainer}>
                <View style={styles.routesHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionHeaderTitle}>Rutas y Credenciales Asignadas</Text>
                    <Text style={styles.sectionHeaderSub}>
                      Solo visible para administración. Entrega estas credenciales al cobrador correspondiente.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.newRouteBtn}
                    onPress={() => setShowNewRouteForm(!showNewRouteForm)}
                  >
                    <Plus size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.newRouteBtnText}>
                      {showNewRouteForm ? 'Cerrar' : '+ Nueva Ruta'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Formulario para Crear Nueva Ruta con Credenciales */}
                {showNewRouteForm && (
                  <View style={styles.newRouteCard}>
                    <Text style={styles.newRouteCardTitle}>Habilitar Nueva Ruta de Cobro</Text>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Nombre de la Ruta *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={newRouteName}
                        onChangeText={setNewRouteName}
                        placeholder="Ej. Ruta 3 - Sur"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Nombre del Cobrador Asignado *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={newCollectorName}
                        onChangeText={setNewCollectorName}
                        placeholder="Ej. Andrés Martínez"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>

                    <View style={styles.inputRow}>
                      <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                        <Text style={styles.inputLabel}>Usuario de Acceso *</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newUsername}
                          onChangeText={setNewUsername}
                          placeholder="Ej. ruta3"
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Contraseña de Ruta *</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="Ej. ruta3-excelencia"
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.createRouteSubmitBtn}
                      onPress={handleCreateRouteWithCredentials}
                    >
                      <CheckCircle size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.createRouteSubmitText}>Crear Ruta y Credenciales</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Listado de Rutas y Credenciales Activas */}
                {routesList.map((route, idx) => {
                  const assignedCollector = usersList.find((u) => u.id === route.collectorId);
                  const username = assignedCollector?.username || `ruta${idx + 1}`;
                  const password = assignedCollector?.password || `${username}-excelencia`;
                  const isPasswordRevealed = !!revealedPasswords[route.id];

                  return (
                    <View key={route.id} style={styles.routeItemCard}>
                      <View style={styles.routeItemTop}>
                        <View style={styles.routeBadge}>
                          <Text style={styles.routeBadgeText}>RUTA {idx + 1}</Text>
                        </View>
                        <Text style={styles.routeItemTitle}>{route.name}</Text>
                        <View style={styles.activeDot} />
                        <Text style={styles.activeStatusText}>Activa</Text>
                      </View>

                      <Text style={styles.routeCollectorName}>
                        👤 Cobrador: <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{assignedCollector ? assignedCollector.name : 'Sin asignar'}</Text>
                      </Text>

                      <View style={styles.credentialsBox}>
                        <View style={styles.credentialRow}>
                          <Text style={styles.credLabel}>USUARIO:</Text>
                          <Text style={styles.credValue}>{username}</Text>
                        </View>

                        <View style={styles.credentialRow}>
                          <Text style={styles.credLabel}>CONTRASEÑA:</Text>
                          <Text style={styles.credValue}>
                            {isPasswordRevealed ? password : '••••••••••••'}
                          </Text>
                          <TouchableOpacity
                            onPress={() => togglePasswordVisibility(route.id)}
                            style={styles.eyeBtnSmall}
                          >
                            {isPasswordRevealed ? (
                              <EyeOff size={14} color={COLORS.textSecondary} />
                            ) : (
                              <Eye size={14} color={COLORS.textSecondary} />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.routeItemFooterHint}>
                        El cobrador debe ingresar este usuario y clave en su teléfono móvil.
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* PESTAÑA 5: COPIA DE SEGURIDAD Y RESPALDO OFFLINE */}
            {activeTab === 'BACKUP' && (
              <View style={styles.sectionContainer}>
                <View style={styles.backupHeaderCard}>
                  <HardDrive size={24} color="#2563eb" style={{ marginBottom: 6 }} />
                  <Text style={styles.backupHeaderTitle}>
                    Copia de Seguridad y Migración Offline
                  </Text>
                  <Text style={styles.backupHeaderSub}>
                    Permite exportar todos los clientes, créditos, cuotas, cobros y auditoría a un archivo JSON o restaurar un respaldo previo sin conexión a internet.
                  </Text>
                </View>

                {/* Resumen de registros */}
                <View style={styles.backupStatsGrid}>
                  <View style={styles.backupStatBox}>
                    <Text style={styles.backupStatNumber}>{localStore.getCustomers().length}</Text>
                    <Text style={styles.backupStatLabel}>Clientes</Text>
                  </View>
                  <View style={styles.backupStatBox}>
                    <Text style={styles.backupStatNumber}>{localStore.getLoans().length}</Text>
                    <Text style={styles.backupStatLabel}>Créditos</Text>
                  </View>
                  <View style={styles.backupStatBox}>
                    <Text style={styles.backupStatNumber}>{localStore.getPayments().length}</Text>
                    <Text style={styles.backupStatLabel}>Abonos</Text>
                  </View>
                  <View style={styles.backupStatBox}>
                    <Text style={styles.backupStatNumber}>{localStore.getAuditLogs().length}</Text>
                    <Text style={styles.backupStatLabel}>Auditorías</Text>
                  </View>
                </View>

                {/* Botón Exportar */}
                <TouchableOpacity
                  style={styles.exportBackupBtn}
                  activeOpacity={0.8}
                  onPress={handleExportBackup}
                >
                  <Download size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.exportBackupBtnText}>
                    Descargar Copia de Seguridad (JSON)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.exportBackupBtn,
                    { backgroundColor: '#15803d', marginTop: 10 },
                  ]}
                  activeOpacity={0.8}
                  onPress={async () => {
                    const dateStr = getLocalTodayStr();
                    const csv = localStore.generateAccountingReportCSV(dateStr);
                    const filename = `reporte_contable_cartera_${dateStr}.csv`;
                    if (Platform.OS === 'web' && typeof document !== 'undefined') {
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      window.alert('Reporte Contable Excel (.csv) descargado exitosamente.');
                    } else {
                      await Share.share({ title: filename, message: csv });
                    }
                  }}
                >
                  <FileText size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.exportBackupBtnText}>
                    📊 Exportar Reporte Contable Excel (.csv)
                  </Text>
                </TouchableOpacity>

                <View style={styles.backupDivider} />

                {/* Sección Restaurar */}
                <Text style={styles.restoreSectionTitle}>Restaurar Copia de Seguridad</Text>
                <Text style={styles.restoreSectionSub}>
                  Pegue el contenido JSON del archivo de respaldo a continuación para reestablecer la cartera:
                </Text>

                <TextInput
                  style={styles.restoreTextInput}
                  value={restoreJsonInput}
                  onChangeText={setRestoreJsonInput}
                  placeholder='{"version": "1.0", "customers": [...], ...}'
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={4}
                />

                <TouchableOpacity
                  style={[styles.restoreBtn, isRestoring && { opacity: 0.6 }]}
                  activeOpacity={0.8}
                  onPress={handleRestoreBackup}
                  disabled={isRestoring}
                >
                  <Upload size={16} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.restoreBtnText}>
                    {isRestoring ? 'Restaurando...' : 'Restaurar Copia de Seguridad'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Footer de Acciones */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.resetBtn} onPress={handleResetDefaults}>
              <RotateCcw size={14} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.resetBtnText}>Valores Estándar</Text>
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
      </KeyboardAvoidingView>
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
    maxHeight: '92%',
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
    fontSize: 11,
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
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionHeaderSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 4,
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
  highlightSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    marginTop: 2,
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
  routesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  newRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  newRouteBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  newRouteCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.primaryBorder,
    gap: 10,
    marginBottom: 8,
  },
  newRouteCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  createRouteSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  createRouteSubmitText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  routeItemCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    gap: 8,
    marginBottom: 4,
  },
  routeItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  routeBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  routeItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.success,
  },
  activeStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.success,
  },
  routeCollectorName: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
  },
  credentialsBox: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
  },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textMuted,
    width: 90,
  },
  credValue: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
    fontFamily: 'monospace',
    flex: 1,
  },
  eyeBtnSmall: {
    padding: 4,
  },
  routeItemFooterHint: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontStyle: 'italic',
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
  backupHeaderCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  backupHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1d4ed8',
    marginBottom: 4,
    textAlign: 'center',
  },
  backupHeaderSub: {
    fontSize: 12,
    color: '#3b82f6',
    textAlign: 'center',
    lineHeight: 17,
  },
  backupStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  backupStatBox: {
    flex: 1,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backupStatNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  backupStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  exportBackupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  exportBackupBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  backupDivider: {
    height: 1,
    backgroundColor: COLORS.microBorder,
    marginBottom: 16,
  },
  restoreSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  restoreSectionSub: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  restoreTextInput: {
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.microBorder,
    borderRadius: 12,
    padding: 10,
    fontSize: 11,
    color: COLORS.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  restoreBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
