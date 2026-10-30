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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getLocalTodayStr } from '../../core/domain/calculator';
import { COLORS } from '../theme/colors';
import {
  localStore,
  DEFAULT_OFFICE_CONFIG,
} from '../../infrastructure/storage/local-store';
import { formatCOP } from '../../core/config/business-rules';
import { checkAllUpdates, CURRENT_APP_VERSION } from '../utils/appUpdates';
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
  Briefcase,
  TrendingUp,
  Wallet,
  Landmark,
  Layers,
  Calculator,
  RefreshCw,
  Wifi,
  Smartphone,
} from 'lucide-react-native';

interface OfficeConfigModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTab?: 'EMPRESA' | 'CAPITAL' | 'CREDITO' | 'PERMISOS' | 'RUTAS' | 'BACKUP';
}

export const OfficeConfigModal: React.FC<OfficeConfigModalProps> = ({
  visible,
  onClose,
  onSuccess,
  initialTab,
}) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'EMPRESA' | 'CAPITAL' | 'CREDITO' | 'PERMISOS' | 'RUTAS' | 'BACKUP'>('EMPRESA');
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

  // 4. Gestión de Rutas y Credenciales (Audio 1: solo visible para el Administrador)
  const [routesList, setRoutesList] = useState<Route[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [showNewRouteForm, setShowNewRouteForm] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newCollectorName, setNewCollectorName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTargetAdminStr, setNewTargetAdminStr] = useState('20000000');
  const [newInitialCashBaseStr, setNewInitialCashBaseStr] = useState('0');
  const [newExpectedCustomersStr, setNewExpectedCustomersStr] = useState('40');

  // Estado dedicado de Administrativo y Base por Ruta (Pestaña 2: CAPITAL)
  const [routeCapitals, setRouteCapitals] = useState<
    Record<string, { targetAdminStr: string; cashBaseStr: string }>
  >({});

  // Credenciales de Administrador editables
  const [adminNameEdit, setAdminNameEdit] = useState('Administración General');
  const [adminUserEdit, setAdminUserEdit] = useState('admin');
  const [adminPassEdit, setAdminPassEdit] = useState('');
  const [showAdminPassEdit, setShowAdminPassEdit] = useState(false);

  // Edición de una ruta existente
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editRouteName, setEditRouteName] = useState('');
  const [editCollectorName, setEditCollectorName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editTargetAdminStr, setEditTargetAdminStr] = useState('20000000');
  const [editInitialCashBaseStr, setEditInitialCashBaseStr] = useState('0');
  const [editExpectedCustomersStr, setEditExpectedCustomersStr] = useState('40');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
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

      const loadedRoutes = [...localStore.getRoutes()];
      const loadedUsers = [...localStore.getUsers()];
      setRoutesList(loadedRoutes);
      setUsersList(loadedUsers);

      const caps: Record<string, { targetAdminStr: string; cashBaseStr: string }> = {};
      loadedRoutes.forEach((r) => {
        caps[r.id] = {
          targetAdminStr: (r.targetAdministrative ?? 20000000).toString(),
          cashBaseStr: (r.initialCashBase ?? 0).toString(),
        };
      });
      setRouteCapitals(caps);

      const adm = loadedUsers.find((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
      if (adm) {
        setAdminNameEdit(adm.name || 'Administración General');
        setAdminUserEdit(adm.username || 'admin');
        setAdminPassEdit(adm.password || '');
      }
      setEditingRouteId(null);
    }
  }, [visible, initialTab]);

  const handleAdjustTargetAdmin = (routeId: string, deltaOrSet: number, isDelta: boolean) => {
    setRouteCapitals((prev) => {
      const cur = prev[routeId] || { targetAdminStr: '20000000', cashBaseStr: '0' };
      const currentVal = parseInt(cur.targetAdminStr.replace(/\D/g, ''), 10) || 0;
      const nextVal = isDelta ? Math.max(0, currentVal + deltaOrSet) : Math.max(0, deltaOrSet);
      return {
        ...prev,
        [routeId]: {
          ...cur,
          targetAdminStr: nextVal.toString(),
        },
      };
    });
  };

  const handleAdjustCashBase = (routeId: string, deltaOrSet: number, isDelta: boolean) => {
    setRouteCapitals((prev) => {
      const cur = prev[routeId] || { targetAdminStr: '20000000', cashBaseStr: '0' };
      const currentVal = parseInt(cur.cashBaseStr.replace(/\D/g, ''), 10) || 0;
      const nextVal = isDelta ? Math.max(0, currentVal + deltaOrSet) : Math.max(0, deltaOrSet);
      return {
        ...prev,
        [routeId]: {
          ...cur,
          cashBaseStr: nextVal.toString(),
        },
      };
    });
  };

  const handleSaveRouteCapital = async (routeId: string) => {
    const cur = routeCapitals[routeId];
    if (!cur) return;
    const targetAdmin = parseInt(cur.targetAdminStr.replace(/\D/g, ''), 10) || 0;
    const initialCashBase = parseInt(cur.cashBaseStr.replace(/\D/g, ''), 10) || 0;

    try {
      await localStore.updateRouteCapital({
        routeId,
        targetAdministrative: targetAdmin,
        initialCashBase,
      });
      const updatedRoutes = [...localStore.getRoutes()];
      setRoutesList(updatedRoutes);
      const targetRoute = updatedRoutes.find((r) => r.id === routeId);
      const routeLoans = localStore
        .getLoans()
        .filter((l) => l.routeId === routeId && l.status === 'ACTIVE');
      const carteraCalle = routeLoans.reduce((sum, l) => sum + (l.principal || 0), 0);
      const baseDisp = Math.max(0, targetAdmin - carteraCalle);

      Alert.alert(
        '¡Capital y Base Guardados!',
        `Ruta: ${targetRoute?.name || routeId}\n\n• Administrativo: ${formatCOP(targetAdmin)}\n• Base de Efectivo: ${formatCOP(initialCashBase)}\n• Cartera en Calle: ${formatCOP(carteraCalle)}\n• Base Calculada Disponible: ${formatCOP(baseDisp)}`
      );
      onSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo guardar el capital.');
    }
  };

  const handleSaveAdminCredentials = async () => {
    try {
      await localStore.updateAdminCredentials({
        name: adminNameEdit,
        username: adminUserEdit,
        password: adminPassEdit,
      });
      setUsersList([...localStore.getUsers()]);
      Alert.alert(
        'Credenciales de Administrador Actualizadas',
        `Usuario Admin: ${adminUserEdit.trim().toLowerCase()}\nContraseña: ${adminPassEdit.trim()}`
      );
      onSuccess();
    } catch (err: any) {
      Alert.alert('Aviso', err.message || 'No se pudieron actualizar las credenciales.');
    }
  };

  const handleStartEditRoute = (route: Route, collector?: User) => {
    setEditingRouteId(route.id);
    setEditRouteName(route.name);
    setEditCollectorName(collector?.name || route.collectorName || '');
    setEditUsername(collector?.username || '');
    setEditPassword(collector?.password || '');
    setEditTargetAdminStr(String(route.targetAdministrative || 20000000));
    setEditInitialCashBaseStr(String(route.initialCashBase || 0));
    setEditExpectedCustomersStr(String(route.expectedCustomersCount || 40));
  };

  const handleSaveEditedRoute = async () => {
    if (!editingRouteId) return;
    try {
      const parsedAdmin = parseInt(editTargetAdminStr.replace(/\D/g, ''), 10) || 0;
      const parsedCashBase = parseInt(editInitialCashBaseStr.replace(/\D/g, ''), 10) || 0;
      const parsedCustomers = parseInt(editExpectedCustomersStr.replace(/\D/g, ''), 10) || 0;
      await localStore.updateRouteWithCredentials({
        routeId: editingRouteId,
        routeName: editRouteName,
        collectorName: editCollectorName,
        username: editUsername,
        password: editPassword,
        targetAdministrative: parsedAdmin,
        initialCashBase: parsedCashBase,
        expectedCustomersCount: parsedCustomers,
      });
      setRoutesList([...localStore.getRoutes()]);
      setUsersList([...localStore.getUsers()]);
      setEditingRouteId(null);
      Alert.alert('Ruta Actualizada', 'Se guardaron los cambios de la ruta, administrativo, base y credenciales.');
      onSuccess();
    } catch (err: any) {
      Alert.alert('Aviso', err.message || 'No se pudo actualizar la ruta.');
    }
  };

  const handleDeleteRouteItem = (route: Route) => {
    if (routesList.length <= 1) {
      if (Platform.OS === 'web') {
        window.alert('Aviso: La oficina debe conservar al menos 1 ruta activa.');
      } else {
        Alert.alert('Aviso', 'La oficina debe conservar al menos 1 ruta activa.');
      }
      return;
    }
    const executeDelete = async () => {
      try {
        await localStore.deleteRoute(route.id);
        setRoutesList([...localStore.getRoutes()]);
        setUsersList([...localStore.getUsers()]);
        onSuccess();
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(err.message || 'No se pudo eliminar la ruta.');
        } else {
          Alert.alert('Error', err.message || 'No se pudo eliminar la ruta.');
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm(`¿Desea eliminar la ruta "${route.name}" y su credencial de cobrador?`);
      if (ok) executeDelete();
    } else {
      Alert.alert(
        '¿Eliminar Ruta?',
        `¿Desea eliminar "${route.name}" y su credencial de cobrador?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  const togglePasswordVisibility = (userId: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleCreateRouteWithCredentials = async () => {
    if (!newRouteName.trim() || !newUsername.trim() || !newPassword.trim()) {
      Alert.alert('Campos Incompletos', 'Por favor ingresa el nombre de la ruta, usuario y contraseña.');
      return;
    }
    if (newPassword.trim().length < 6 || newPassword.trim() === '123' || newPassword.trim() === '123456') {
      Alert.alert('Contraseña insegura', 'Por seguridad, la contraseña de la ruta debe tener al menos 6 caracteres y no ser una clave por defecto.');
      return;
    }

    try {
      const routeId = `route-${Date.now()}`;
      const collectorId = `usr-col-${Date.now()}`;
      const colDisplayName = newCollectorName.trim() || newRouteName.trim();
      const parsedNewAdmin = parseInt(newTargetAdminStr.replace(/\D/g, ''), 10) || 20000000;
      const parsedNewCashBase = parseInt(newInitialCashBaseStr.replace(/\D/g, ''), 10) || 0;
      const parsedNewCustomers = parseInt(newExpectedCustomersStr.replace(/\D/g, ''), 10) || 40;

      const newCollector: User = {
        id: collectorId,
        name: colDisplayName,
        username: newUsername.trim().toLowerCase(),
        password: newPassword.trim(),
        email: `${newUsername.trim().toLowerCase()}@cartera.com`,
        role: 'COBRADOR',
        routeId,
        assignedRouteIds: [routeId],
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const newRoute: Route = {
        id: routeId,
        name: newRouteName.trim(),
        code: `R-${routesList.length + 1}`,
        collectorId: collectorId,
        collectorName: colDisplayName,
        isActive: true,
        description: `Ruta asignada a ${colDisplayName}`,
        targetAdministrative: parsedNewAdmin,
        expectedCustomersCount: parsedNewCustomers,
        initialCashBase: parsedNewCashBase,
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
      setNewTargetAdminStr('20000000');
      setNewInitialCashBaseStr('0');
      setNewExpectedCustomersStr('40');

      Alert.alert(
        '¡Ruta Creada Exitosamente!',
        `Se habilitó "${newRoute.name}".\n\nAdministrativo: ${formatCOP(parsedNewAdmin)}\nBase de Efectivo: ${formatCOP(parsedNewCashBase)}\nCredenciales de Acceso:\nUsuario: ${newCollector.username}\nContraseña: ${newCollector.password}`
      );
    } catch (err: any) {
      Alert.alert('Error al crear ruta', err.message || 'No se pudo guardar la ruta.');
    }
  };

  const handleResetDefaults = () => {
    const applyDefaults = () => {
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
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('¿Desea restaurar la configuración estándar para oficinas de crédito?');
      if (ok) applyDefaults();
    } else {
      Alert.alert(
        'Restablecer Valores Recomendados',
        '¿Desea restaurar la configuración estándar para oficinas de crédito?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Restablecer', style: 'destructive', onPress: applyDefaults },
        ]
      );
    }
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
        routeInitialCashBase: 0,
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
            { paddingBottom: Math.max(insets.bottom, 12) + 8, flexShrink: 1 },
          ]}
        >
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

          {/* Barra de 6 Tabs Operativas */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBarScroll}
            contentContainerStyle={styles.tabBar}
          >
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'EMPRESA' && styles.tabBtnActive]}
              onPress={() => setActiveTab('EMPRESA')}
            >
              <Text style={[styles.tabText, activeTab === 'EMPRESA' && styles.tabTextActive]}>
                1. Sede
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'CAPITAL' && styles.tabBtnActive]}
              onPress={() => setActiveTab('CAPITAL')}
            >
              <Text style={[styles.tabText, activeTab === 'CAPITAL' && styles.tabTextActive]}>
                💼 2. Administrativo & Base
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'CREDITO' && styles.tabBtnActive]}
              onPress={() => setActiveTab('CREDITO')}
            >
              <Text style={[styles.tabText, activeTab === 'CREDITO' && styles.tabTextActive]}>
                3. Crédito & Cobro
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'PERMISOS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('PERMISOS')}
            >
              <Text style={[styles.tabText, activeTab === 'PERMISOS' && styles.tabTextActive]}>
                4. Permisos Ruta
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'RUTAS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('RUTAS')}
            >
              <Text style={[styles.tabText, activeTab === 'RUTAS' && styles.tabTextActive]}>
                5. Credenciales
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'BACKUP' && styles.tabBtnActive]}
              onPress={() => setActiveTab('BACKUP')}
            >
              <Text style={[styles.tabText, activeTab === 'BACKUP' && styles.tabTextActive]}>
                6. Respaldo
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
                  <Text style={styles.inputLabel}>URL Servidor LAN / Sede Principal</Text>
                  <TextInput
                    style={styles.textInput}
                    value={officeServerUrl}
                    onChangeText={setOfficeServerUrl}
                    placeholder="http://192.168.1.10:8765"
                    placeholderTextColor={COLORS.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.inputHelp}>
                    Dirección IP del computador de escritorio para sincronización Wi-Fi y actualización de instaladores APK.
                  </Text>
                </View>

                {/* Sección de Actualizaciones del Sistema */}
                <View
                  style={{
                    marginTop: 12,
                    padding: 14,
                    backgroundColor: '#F8FAFC',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.navy }}>
                      Actualizaciones del Sistema
                    </Text>
                    <View
                      style={{
                        backgroundColor: '#EEF2FF',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary }}>
                        v{CURRENT_APP_VERSION}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 10, lineHeight: 16 }}>
                    Consulta parches OTA silenciosos en la nube y nuevas versiones de instalador APK en la oficina.
                  </Text>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLORS.primary,
                      paddingVertical: 10,
                      borderRadius: 10,
                      gap: 6,
                    }}
                    onPress={() => checkAllUpdates({ silent: false, serverUrl: officeServerUrl })}
                    activeOpacity={0.8}
                  >
                    <RefreshCw size={15} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                      Comprobar Actualizaciones Ahora
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* PESTAÑA 2: ADMINISTRATIVO, CARTERA & BASE (REGLA FUNDAMENTAL) */}
            {activeTab === 'CAPITAL' && (() => {
              const todayStr = getLocalTodayStr();
              const globalMetrics = localStore.getDailyRouteMetrics(todayStr);
              const allLoans = localStore.getLoans().filter((l) => l.status === 'ACTIVE');
              const globalTargetAdmin = routesList.reduce((sum, r) => {
                const curCap = routeCapitals[r.id];
                const val = curCap
                  ? (parseInt(curCap.targetAdminStr.replace(/\D/g, ''), 10) || 0)
                  : (r.targetAdministrative || 20000000);
                return sum + val;
              }, 0);
              const displayGlobalAdmin = globalTargetAdmin > 0 ? globalTargetAdmin : globalMetrics.totalAdministrativeCapital;
              const displayGlobalCartera = globalMetrics.activeCapitalInStreet;
              const displayGlobalBase = globalMetrics.cashAvailableInHand;

              return (
                <View style={styles.sectionContainer}>
                  {/* Banner Explicativo de la Fórmula Maestra */}
                  <View style={styles.capFormulaCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <Text style={styles.capFormulaBadge}>💡 REGLA DE ORO FINANCIERA (MODELO B: EFECTIVO EN BOLSILLO)</Text>
                    </View>
                    <Text style={styles.capFormulaTitle}>
                      Administrativo = Cartera en Calle + Base en Mano
                    </Text>
                    <Text style={styles.capFormulaDescription}>
                      • <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Administrativo:</Text> Es el patrimonio total o cupo de trabajo de la ruta.{'\n'}
                      • <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Cartera en Calle:</Text> Saldo total pendiente de cobro en poder de los clientes en créditos activos.{'\n'}
                      • <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>Base en Mano:</Text> Efectivo físico real que el cobrador lleva en el bolsillo. Disminuye con cada desembolso en efectivo y aumenta con cada cobro recibido.
                    </Text>
                  </View>

                  {/* Resumen Global Consolidado */}
                  <View style={styles.capGlobalCard}>
                    <Text style={styles.capGlobalTitle}>📊 CONSOLIDADO GENERAL (TODAS LAS RUTAS)</Text>
                    <View style={styles.capGlobalGrid}>
                      <View style={styles.capGlobalCol}>
                        <Text style={styles.capGlobalLabel}>📈 ADMINISTRATIVO</Text>
                        <Text style={styles.capGlobalValue} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCOP(displayGlobalAdmin)}
                        </Text>
                        <Text style={styles.capGlobalHint}>Cupo global red</Text>
                      </View>
                      <Text style={styles.capGlobalOperator}>=</Text>
                      <View style={styles.capGlobalCol}>
                        <Text style={[styles.capGlobalLabel, { color: '#0F766E' }]}>👥 CARTERA CALLE</Text>
                        <Text style={[styles.capGlobalValue, { color: '#0F766E' }]} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCOP(displayGlobalCartera)}
                        </Text>
                        <Text style={styles.capGlobalHint}>{allLoans.length} créditos activos</Text>
                      </View>
                      <Text style={styles.capGlobalOperator}>+</Text>
                      <View style={styles.capGlobalCol}>
                        <Text style={[styles.capGlobalLabel, { color: '#0284C7' }]}>💵 BASE EN MANO</Text>
                        <Text style={[styles.capGlobalValue, { color: '#0284C7' }]} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCOP(displayGlobalBase)}
                        </Text>
                        <Text style={styles.capGlobalHint}>Efectivo en bolsillo</Text>
                      </View>
                    </View>
                  </View>

                  {/* Listado y Edición de cada Ruta */}
                  <Text style={styles.sectionHeaderTitle}>
                    CONFIGURACIÓN DE ADMINISTRATIVO Y BASE POR RUTA ({routesList.length})
                  </Text>
                  <Text style={styles.sectionHeaderSub}>
                    Ajusta el cupo total (Administrativo) y la base de efectivo para cada cobrador y presiona Guardar. Los cambios impactarán de inmediato en los paneles operativos.
                  </Text>

                  {routesList.map((route) => {
                    const collector = usersList.find((u) => u.id === route.collectorId);
                    const routeLoans = localStore
                      .getLoans()
                      .filter((l) => l.routeId === route.id && l.status === 'ACTIVE');
                    const rtMetrics = localStore.getDailyRouteMetrics(todayStr, route.id);
                    const capData = routeCapitals[route.id] || {
                      targetAdminStr: (route.targetAdministrative || 20000000).toString(),
                      cashBaseStr: (route.initialCashBase || 0).toString(),
                    };
                    const curTargetAdmin = parseInt(capData.targetAdminStr.replace(/\D/g, ''), 10) || 0;
                    const curInitialBase = parseInt(capData.cashBaseStr.replace(/\D/g, ''), 10) || 0;
                    const displayAdmin = curTargetAdmin > 0 ? curTargetAdmin : rtMetrics.totalAdministrativeCapital;
                    const displayCartera = rtMetrics.activeCapitalInStreet;
                    const displayBase = rtMetrics.cashAvailableInHand;

                    return (
                      <View key={route.id} style={styles.routeCapConfigCard}>
                        <View style={styles.routeCapCardHeader}>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.routeCapName}>{route.name}</Text>
                              <View style={styles.routeCapPill}>
                                <Text style={styles.routeCapPillText}>{route.code}</Text>
                              </View>
                            </View>
                            <Text style={styles.routeCapCollector}>
                              Cobrador: <Text style={{ fontWeight: '700', color: COLORS.textPrimary }}>{collector?.name || route.collectorName || 'Sin asignar'}</Text>
                            </Text>
                          </View>
                        </View>

                        {/* Triada en vivo de esta ruta */}
                        <View style={styles.routeCapTriadRow}>
                          <View style={styles.routeCapTriadCol}>
                            <Text style={styles.routeCapTriadColLabel}>ADMINISTRATIVO</Text>
                            <Text style={styles.routeCapTriadColVal}>{formatCOP(displayAdmin)}</Text>
                          </View>
                          <Text style={styles.routeCapTriadOp}>=</Text>
                          <View style={styles.routeCapTriadCol}>
                            <Text style={[styles.routeCapTriadColLabel, { color: '#0F766E' }]}>CARTERA EN CALLE</Text>
                            <Text style={[styles.routeCapTriadColVal, { color: '#0F766E' }]}>{formatCOP(displayCartera)}</Text>
                            <Text style={styles.routeCapTriadColSub}>{routeLoans.length} créditos</Text>
                          </View>
                          <Text style={styles.routeCapTriadOp}>+</Text>
                          <View style={styles.routeCapTriadCol}>
                            <Text style={[styles.routeCapTriadColLabel, { color: '#0284C7' }]}>BASE EN MANO</Text>
                            <Text style={[styles.routeCapTriadColVal, { color: '#0284C7' }]}>
                              {formatCOP(displayBase)}
                            </Text>
                            <Text style={styles.routeCapTriadColSub}>En bolsillo</Text>
                          </View>
                        </View>

                        {/* Input 1: Administrativo Asignado */}
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>📈 Administrativo Asignado a esta Ruta ($ COP)</Text>
                          <TextInput
                            style={styles.textInput}
                            value={capData.targetAdminStr}
                            onChangeText={(text) => {
                              const clean = text.replace(/\D/g, '');
                              setRouteCapitals((prev) => ({
                                ...prev,
                                [route.id]: {
                                  ...(prev[route.id] || { cashBaseStr: '0' }),
                                  targetAdminStr: clean,
                                },
                              }));
                            }}
                            keyboardType="numeric"
                            placeholder="20000000"
                            placeholderTextColor={COLORS.textMuted}
                          />
                          {/* Presets rápidos para Administrativo */}
                          <View style={styles.presetsRow}>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 1000000, true)}>
                              <Text style={styles.presetPillText}>+$1M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 5000000, true)}>
                              <Text style={styles.presetPillText}>+$5M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 10000000, false)}>
                              <Text style={styles.presetPillText}>$10M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 20000000, false)}>
                              <Text style={styles.presetPillText}>$20M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 30000000, false)}>
                              <Text style={styles.presetPillText}>$30M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustTargetAdmin(route.id, 50000000, false)}>
                              <Text style={styles.presetPillText}>$50M</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Input 2: Base de Efectivo en Mano / Inicial */}
                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>💵 Base de Efectivo Asignada / Inicial ($ COP)</Text>
                          <TextInput
                            style={styles.textInput}
                            value={capData.cashBaseStr}
                            onChangeText={(text) => {
                              const clean = text.replace(/\D/g, '');
                              setRouteCapitals((prev) => ({
                                ...prev,
                                [route.id]: {
                                  ...(prev[route.id] || { targetAdminStr: '20000000' }),
                                  cashBaseStr: clean,
                                },
                              }));
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={COLORS.textMuted}
                          />
                          {/* Presets rápidos para Base */}
                          <View style={styles.presetsRow}>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 500000, true)}>
                              <Text style={styles.presetPillText}>+$500k</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 1000000, true)}>
                              <Text style={styles.presetPillText}>+$1M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 1000000, false)}>
                              <Text style={styles.presetPillText}>$1M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 2000000, false)}>
                              <Text style={styles.presetPillText}>$2M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 3000000, false)}>
                              <Text style={styles.presetPillText}>$3M</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.presetPill} onPress={() => handleAdjustCashBase(route.id, 5000000, false)}>
                              <Text style={styles.presetPillText}>$5M</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Botón Guardar Capital de esta Ruta */}
                        <TouchableOpacity
                          style={styles.routeCapSaveBtn}
                          activeOpacity={0.8}
                          onPress={() => handleSaveRouteCapital(route.id)}
                        >
                          <CheckCircle size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.routeCapSaveBtnText}>
                            💾 Guardar Administrativo y Base de esta Ruta
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* PESTAÑA 3: POLÍTICAS DE CRÉDITO Y COBRO (AUDIO 2) */}
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
                    <Text style={styles.inputLabel}>Tasa Sugerida por Operación (%)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={defaultInterestRateStr}
                      onChangeText={setDefaultInterestRateStr}
                      keyboardType="numeric"
                      placeholder="20"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.inputHelp}>Editable en cada préstamo; no altera créditos antiguos</Text>
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

                <View
                  style={{
                    backgroundColor: '#FFFBEB',
                    borderWidth: 1,
                    borderColor: '#FDE68A',
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#92400E' }}>
                    ⚖️ Aviso de Parametrización Legal (Colombia)
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#78350F', marginTop: 2, lineHeight: 14 }}>
                    La oficina operadora es responsable de parametrizar tasas remuneratorias, moratorias y cargos conforme a la modalidad legal aplicable y la certificación vigente de la Superintendencia Financiera de Colombia. Los cambios en esta plantilla aplican únicamente a operaciones nuevas y nunca recalculan contratos ya originados.
                  </Text>
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
              </View>
            )}

            {/* PESTAÑA 4: GESTIÓN DE RUTAS Y CREDENCIALES */}
            {activeTab === 'RUTAS' && (
              <View style={styles.sectionContainer}>
                {/* 4.A: Credenciales del Administrador de la Oficina */}
                <View style={styles.newRouteCard}>
                  <Text style={styles.newRouteCardTitle}>
                    Administrador de la Oficina
                  </Text>

                  <View style={styles.inputRow}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.inputLabel}>Usuario Admin</Text>
                      <TextInput
                        style={styles.textInput}
                        value={adminUserEdit}
                        onChangeText={setAdminUserEdit}
                        placeholder="admin"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>Clave Admin</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TextInput
                          style={[styles.textInput, { flex: 1 }]}
                          value={adminPassEdit}
                          onChangeText={setAdminPassEdit}
                          placeholder="Clave"
                          placeholderTextColor={COLORS.textMuted}
                          secureTextEntry={!showAdminPassEdit}
                          autoCapitalize="none"
                        />
                        <TouchableOpacity
                          onPress={() => setShowAdminPassEdit(!showAdminPassEdit)}
                          style={{ paddingHorizontal: 8 }}
                        >
                          {showAdminPassEdit ? (
                            <EyeOff size={15} color={COLORS.textSecondary} />
                          ) : (
                            <Eye size={15} color={COLORS.textSecondary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.createRouteSubmitBtn}
                    onPress={handleSaveAdminCredentials}
                  >
                    <CheckCircle size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.createRouteSubmitText}>
                      Guardar Credencial Admin
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.routesHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionHeaderTitle}>
                      Rutas Activas ({routesList.length})
                    </Text>
                    <Text style={styles.sectionHeaderSub}>
                      Cada cobrador entra con su usuario y el sistema identifica su ruta.
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

                {/* Formulario Ligero para Crear Nueva Ruta con Credenciales */}
                {showNewRouteForm && (
                  <View style={styles.newRouteCard}>
                    <Text style={styles.newRouteCardTitle}>Nueva Ruta de Cobro</Text>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Nombre de la Ruta</Text>
                      <TextInput
                        style={styles.textInput}
                        value={newRouteName}
                        onChangeText={setNewRouteName}
                        placeholder="Ej. Ruta 4 - Occidente"
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>

                    <View style={styles.inputRow}>
                      <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                        <Text style={styles.inputLabel}>Usuario</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newUsername}
                          onChangeText={setNewUsername}
                          placeholder="Ej. ruta4"
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Clave</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newPassword}
                          onChangeText={setNewPassword}
                          placeholder="Mínimo 6 caracteres"
                          placeholderTextColor={COLORS.textMuted}
                          autoCapitalize="none"
                        />
                      </View>
                    </View>

                    <View style={styles.inputRow}>
                      <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                        <Text style={styles.inputLabel}>Administrativo de la Ruta ($ COP)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newTargetAdminStr}
                          onChangeText={(t) => setNewTargetAdminStr(t.replace(/\D/g, ''))}
                          placeholder="20000000"
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Base Efectivo Inicial ($ COP)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={newInitialCashBaseStr}
                          onChangeText={(t) => setNewInitialCashBaseStr(t.replace(/\D/g, ''))}
                          placeholder="0"
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                    <Text style={{ fontSize: 10.5, color: '#0F766E', marginBottom: 8, fontStyle: 'italic' }}>
                      💡 La base disponible se calcula automáticamente: Administrativo - Cartera en calle de los clientes que vayas ingresando uno a uno.
                    </Text>

                    <TouchableOpacity
                      style={styles.createRouteSubmitBtn}
                      onPress={handleCreateRouteWithCredentials}
                    >
                      <CheckCircle size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.createRouteSubmitText}>Crear Ruta</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Listado Compacto de Rutas y Credenciales Activas */}
                {routesList.map((route, idx) => {
                  const assignedCollector = usersList.find((u) => u.id === route.collectorId);
                  const username = assignedCollector?.username || `ruta${idx + 1}`;
                  const password = assignedCollector?.password || '';
                  const isPasswordRevealed = !!revealedPasswords[route.id];
                  const isEditingThis = editingRouteId === route.id;

                  return (
                    <View key={route.id} style={styles.routeItemCard}>
                      <View style={styles.routeItemTop}>
                        <View style={styles.routeBadge}>
                          <Text style={styles.routeBadgeText}>R{idx + 1}</Text>
                        </View>
                        <Text style={styles.routeItemTitle}>{route.name}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            isEditingThis
                              ? setEditingRouteId(null)
                              : handleStartEditRoute(route, assignedCollector)
                          }
                          style={{
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 8,
                            backgroundColor: '#E6F7F5',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D9488' }}>
                            {isEditingThis ? 'Cancelar' : 'Editar'}
                          </Text>
                        </TouchableOpacity>
                        {routesList.length > 1 && (
                          <TouchableOpacity
                            onPress={() => handleDeleteRouteItem(route)}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                              borderRadius: 8,
                              backgroundColor: '#FEF2F2',
                            }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                              Eliminar
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {isEditingThis ? (
                        <View style={{ gap: 8, marginTop: 4 }}>
                          <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Nombre de la Ruta</Text>
                            <TextInput
                              style={styles.textInput}
                              value={editRouteName}
                              onChangeText={(v) => {
                                setEditRouteName(v);
                                setEditCollectorName(v);
                              }}
                            />
                          </View>
                          <View style={styles.inputRow}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                              <Text style={styles.inputLabel}>Usuario</Text>
                              <TextInput
                                style={styles.textInput}
                                value={editUsername}
                                onChangeText={setEditUsername}
                                autoCapitalize="none"
                              />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                              <Text style={styles.inputLabel}>Clave</Text>
                              <TextInput
                                style={styles.textInput}
                                value={editPassword}
                                onChangeText={setEditPassword}
                                autoCapitalize="none"
                              />
                            </View>
                          </View>
                          <View style={styles.inputRow}>
                            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                              <Text style={styles.inputLabel}>Administrativo de la Ruta ($ COP)</Text>
                              <TextInput
                                style={styles.textInput}
                                value={editTargetAdminStr}
                                onChangeText={(t) => setEditTargetAdminStr(t.replace(/\D/g, ''))}
                                keyboardType="numeric"
                              />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                              <Text style={styles.inputLabel}>Base Efectivo Inicial ($ COP)</Text>
                              <TextInput
                                style={styles.textInput}
                                value={editInitialCashBaseStr}
                                onChangeText={(t) => setEditInitialCashBaseStr(t.replace(/\D/g, ''))}
                                keyboardType="numeric"
                              />
                            </View>
                          </View>
                          <TouchableOpacity
                            style={styles.createRouteSubmitBtn}
                            onPress={handleSaveEditedRoute}
                          >
                            <CheckCircle size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                            <Text style={styles.createRouteSubmitText}>
                              Guardar Cambios
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View>
                          <View style={styles.credentialsBox}>
                            <View style={styles.credentialRow}>
                              <Text style={styles.credLabel}>USUARIO</Text>
                              <Text style={styles.credValue}>{username}</Text>
                              <Text style={[styles.credLabel, { width: 52, marginLeft: 10 }]}>
                                CLAVE
                              </Text>
                              <Text style={styles.credValue}>
                                {isPasswordRevealed ? password : '••••••'}
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

                          {/* Balance Financiero de la Ruta: Administrativo vs Cartera en Calle vs Base */}
                          {(() => {
                            const routeLoans = localStore
                              .getLoans()
                              .filter((l) => l.routeId === route.id && l.status === 'ACTIVE');
                            const carteraCalle = routeLoans.reduce((sum, l) => sum + (l.principal || 0), 0);
                            const targetAdmin = route.targetAdministrative || 20000000;
                            const baseDisponible = Math.max(0, targetAdmin - carteraCalle);

                            return (
                              <View
                                style={{
                                  marginTop: 8,
                                  padding: 10,
                                  backgroundColor: '#F8FAFC',
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: '#E2E8F0',
                                  gap: 4,
                                }}
                              >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                                    📈 Administrativo Asignado:
                                  </Text>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textPrimary }}>
                                    {formatCOP(targetAdmin)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                                    👥 Cartera en Calle ({routeLoans.length} créditos):
                                  </Text>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F766E' }}>
                                    {formatCOP(carteraCalle)}
                                  </Text>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                                    💵 Base Disponible para Prestar:
                                  </Text>
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284C7' }}>
                                    {formatCOP(baseDisponible)}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2, fontStyle: 'italic' }}>
                                  💡 Al ingresar los clientes uno a uno, el sistema calcula la Base automáticamente: Administrativo - Cartera en Calle.
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                      )}
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

                <View style={styles.backupDivider} />

                {/* Zona de Limpieza para Inicio de Cartera Real */}
                <Text style={styles.restoreSectionTitle}>Inicio Limpio de Cartera</Text>
                <Text style={styles.restoreSectionSub}>
                  Limpia todos los clientes, préstamos y movimientos para dejar la cartera 100% en blanco, lista para registrar los clientes reales uno a uno:
                </Text>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#FEF2F2',
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    marginBottom: 12,
                  }}
                  activeOpacity={0.8}
                  onPress={async () => {
                    const executeClear = async () => {
                      await localStore.clearPortfolioToEmpty();
                      onSuccess();
                      onClose();
                      if (Platform.OS === 'web') {
                        window.alert('La cartera ha sido reiniciada en blanco ($0). Ya puedes comenzar a registrar tus clientes uno a uno.');
                      } else {
                        Alert.alert(
                          'Cartera Limpia',
                          'La cartera ha sido reiniciada en blanco ($0). Ya puedes comenzar a registrar tus clientes uno a uno.'
                        );
                      }
                    };

                    if (Platform.OS === 'web') {
                      const ok = window.confirm('¿Iniciar Cartera Limpia?\n\nEsta acción eliminará todos los clientes y créditos actuales para dejar la cartera en blanco ($0), lista para ingresar tus clientes reales.');
                      if (ok) executeClear();
                    } else {
                      Alert.alert(
                        '¿Iniciar Cartera Limpia?',
                        'Esta acción eliminará todos los clientes y créditos actuales para dejar la cartera en blanco ($0), lista para ingresar tus clientes reales.',
                        [
                          { text: 'Cancelar', style: 'cancel' },
                          { text: 'Sí, Iniciar Limpia', style: 'destructive', onPress: executeClear },
                        ]
                      );
                    }
                  }}
                >
                  <RotateCcw size={14} color="#DC2626" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#DC2626' }}>
                    🧹 Iniciar Cartera Limpia ($0)
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
    minWidth: 0,
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
    minWidth: 0,
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
    backgroundColor: '#0D9488',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    gap: 8,
    marginBottom: 8,
  },
  newRouteCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  createRouteSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    borderRadius: 10,
    paddingVertical: 9,
    marginTop: 2,
  },
  createRouteSubmitText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  routeItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginBottom: 4,
  },
  routeItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeBadge: {
    backgroundColor: '#E6F7F5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  routeBadgeText: {
    color: '#0D9488',
    fontSize: 10,
    fontWeight: '800',
  },
  routeItemTitle: {
    fontSize: 13,
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
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  credLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    width: 58,
  },
  credValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F766E',
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
    backgroundColor: '#0D9488',
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
  tabBarScroll: {
    maxHeight: 46,
    backgroundColor: COLORS.bgSecondary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.microBorder,
  },
  capFormulaCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
  },
  capFormulaBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 0.5,
  },
  capFormulaTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  capFormulaDescription: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
  },
  capGlobalCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  capGlobalTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  capGlobalGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  capGlobalCol: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  capGlobalLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 4,
  },
  capGlobalValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  capGlobalHint: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },
  capGlobalOperator: {
    fontSize: 16,
    fontWeight: '900',
    color: '#94A3B8',
    paddingHorizontal: 4,
  },
  routeCapConfigCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  routeCapCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeCapName: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  routeCapPill: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  routeCapPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  routeCapCollector: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  routeCapTriadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  routeCapTriadCol: {
    flex: 1,
    alignItems: 'center',
  },
  routeCapTriadColLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    marginBottom: 2,
  },
  routeCapTriadColVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  routeCapTriadColSub: {
    fontSize: 8.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  routeCapTriadOp: {
    fontSize: 14,
    fontWeight: '900',
    color: '#94A3B8',
    paddingHorizontal: 3,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  presetPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  routeCapSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D9488',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  routeCapSaveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
