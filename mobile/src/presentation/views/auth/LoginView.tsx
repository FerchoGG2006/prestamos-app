import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  Share,
} from 'react-native';
import { User, Route } from '../../../core/domain/types';
import {
  ShieldCheck,
  Lock,
  User as UserIcon,
  ChevronRight,
  ChevronLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  Building2,
  Bike,
  Sparkles,
  Trash2,
  Settings,
  Plus,
  Minus,
  MapPin,
  KeyRound,
  Share2,
  X,
} from 'lucide-react-native';
import { localStore } from '../../../infrastructure/storage/local-store';

interface LoginViewProps {
  users: User[];
  routes?: Route[];
  onLoginSuccess: (user: User, remember: boolean) => void;
  onDataReset?: () => void;
}

interface EditableRouteDraft {
  id?: string;
  name: string;
  collectorName: string;
  username: string;
  password: string;
  description: string;
  initialCashBaseStr: string;
  showPassword?: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  users,
  routes = [],
  onLoginSuccess,
  onDataReset,
}) => {
  const officeConfig = localStore.getOfficeConfig();
  const isSetupCompleted = !!officeConfig.isSetupCompleted;

  const [selectedRole, setSelectedRole] = useState<'COBRADOR' | 'ADMIN'>('COBRADOR');
  const [selectedRouteChipId, setSelectedRouteChipId] = useState<string>(
    routes[0]?.id || 'route-norte'
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Estado del Asistente de Configuración de Oficina, Admin y Rutas
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [authGatePassed, setAuthGatePassed] = useState(false);
  const [currentAdminPassCheck, setCurrentAdminPassCheck] = useState('');
  const [authGateError, setAuthGateError] = useState('');

  // Paso 1: Oficina y Credenciales de Administrador
  const [wizCompanyName, setWizCompanyName] = useState(officeConfig.companyName || '');
  const [wizCity, setWizCity] = useState(officeConfig.city || 'Barranquilla');
  const [wizPhone, setWizPhone] = useState(officeConfig.supportPhone || '');
  const [wizAdminName, setWizAdminName] = useState('Administración General');
  const [wizAdminUsername, setWizAdminUsername] = useState('admin');
  const [wizAdminPassword, setWizAdminPassword] = useState('');
  const [wizShowAdminPass, setWizShowAdminPass] = useState(false);

  // Paso 2: Cantidad de Rutas y Reglas de la Oficina
  const [wizRoutesCount, setWizRoutesCount] = useState<number>(Math.max(1, routes.length || 1));
  const [wizInterestRateStr, setWizInterestRateStr] = useState(
    String(Math.round((officeConfig.defaultInterestRate || 0.2) * 100))
  );
  const [wizPaperworkEnabled, setWizPaperworkEnabled] = useState(
    officeConfig.paperworkFeeEnabled ?? true
  );
  const [wizPaperworkRateStr, setWizPaperworkRateStr] = useState(
    String(officeConfig.paperworkRate || 5000)
  );
  const [wizExcludeSundays, setWizExcludeSundays] = useState(
    officeConfig.excludeSundays ?? true
  );
  const [wizAllowNewLoans, setWizAllowNewLoans] = useState(
    officeConfig.allowRouteNewLoans ?? true
  );
  const [wizAllowExpenses, setWizAllowExpenses] = useState(
    officeConfig.allowCollectorExpenses ?? true
  );
  const [wizCleanCustomers, setWizCleanCustomers] = useState(false);

  // Paso 3: Configuración individual de cada ruta
  const [wizRoutesDraft, setWizRoutesDraft] = useState<EditableRouteDraft[]>([]);
  const [wizError, setWizError] = useState('');
  const [createdSummaryUser, setCreatedSummaryUser] = useState<User | null>(null);

  // Sincronizar sugerencia inicial de usuario según rol/ruta seleccionada
  useEffect(() => {
    if (selectedRole === 'COBRADOR') {
      const targetRoute = routes.find((r) => r.id === selectedRouteChipId) || routes[0];
      const assignedCollector = targetRoute
        ? users.find((u) => u.id === targetRoute.collectorId || u.routeId === targetRoute.id)
        : users.find((u) => u.role === 'COBRADOR');
      setUsername(assignedCollector?.username || 'cobrador');
      setPassword(isSetupCompleted ? '' : '123');
    } else {
      const adminUser = users.find((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
      setUsername(adminUser?.username || 'admin');
      setPassword(isSetupCompleted ? '' : '123');
    }
  }, [selectedRole, selectedRouteChipId, users.length, routes.length, isSetupCompleted]);

  const handleRoleTabChange = (role: 'COBRADOR' | 'ADMIN') => {
    setSelectedRole(role);
    setErrorMessage('');
  };

  const handleSelectRouteChip = (route: Route) => {
    setSelectedRouteChipId(route.id);
    setErrorMessage('');
    const assignedUser = users.find(
      (u) => u.id === route.collectorId || u.routeId === route.id
    );
    if (assignedUser?.username) {
      setUsername(assignedUser.username);
    }
  };

  const handleLogin = () => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setErrorMessage('Ingrese el usuario asignado.');
      return;
    }
    if (!cleanPass) {
      setErrorMessage('Ingrese la contraseña de acceso.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    setTimeout(() => {
      setIsLoading(false);

      const allUsers = localStore.getUsers();
      let matchedUser = allUsers.find((u) => {
        const uName = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const uId = (u.id || '').toLowerCase();
        return uName === cleanUser || uEmail === cleanUser || uId === cleanUser;
      });

      if (!matchedUser && !isSetupCompleted) {
        if (cleanUser === 'cobrador') {
          matchedUser = allUsers.find((u) => u.role === 'COBRADOR');
        } else if (cleanUser === 'admin' || cleanUser === 'supervisor') {
          matchedUser = allUsers.find((u) => u.role === 'ADMIN' || u.role === 'SUPERVISOR');
        }
      }

      if (!matchedUser) {
        setErrorMessage(
          'Usuario no encontrado. Verifique el usuario asignado o configure las credenciales de la oficina.'
        );
        return;
      }

      // Validar que el rol coincida con la pestaña o ajustar según el usuario real
      const expectedPass = matchedUser.password || '123';
      const isValidPass = cleanPass === expectedPass;

      if (!isValidPass) {
        setErrorMessage('Contraseña incorrecta. Verifique sus credenciales de acceso.');
        return;
      }

      onLoginSuccess(matchedUser, rememberSession);
    }, 200);
  };

  // Inicializar borrador de rutas al abrir el asistente
  const openOfficeSetupWizard = () => {
    const cfg = localStore.getOfficeConfig();
    const currentUsers = localStore.getUsers();
    const currentRoutes = localStore.getRoutes();
    const existingAdmin = currentUsers.find((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');

    setWizCompanyName(cfg.companyName || 'Mi Oficina de Inversiones');
    setWizCity(cfg.city || 'Barranquilla');
    setWizPhone(cfg.supportPhone || '');
    setWizAdminName(existingAdmin?.name || 'Administrador General');
    setWizAdminUsername(existingAdmin?.username || 'admin');
    setWizAdminPassword(existingAdmin?.password && cfg.isSetupCompleted ? existingAdmin.password : '');
    setWizShowAdminPass(false);

    const initialCount = Math.max(1, currentRoutes.length || 1);
    setWizRoutesCount(initialCount);
    setWizInterestRateStr(String(Math.round((cfg.defaultInterestRate || 0.2) * 100)));
    setWizPaperworkEnabled(cfg.paperworkFeeEnabled ?? true);
    setWizPaperworkRateStr(String(cfg.paperworkRate || 5000));
    setWizExcludeSundays(cfg.excludeSundays ?? true);
    setWizAllowNewLoans(cfg.allowRouteNewLoans ?? true);
    setWizAllowExpenses(cfg.allowCollectorExpenses ?? true);
    setWizCleanCustomers(false);

    const drafts: EditableRouteDraft[] = [];
    for (let i = 0; i < initialCount; i++) {
      const existingRoute = currentRoutes[i];
      const existingCol = existingRoute
        ? currentUsers.find(
            (u) => u.id === existingRoute.collectorId || u.routeId === existingRoute.id
          )
        : undefined;
      drafts.push({
        id: existingRoute?.id,
        name: existingRoute?.name || `Ruta ${i + 1}`,
        collectorName: existingCol?.name || existingRoute?.collectorName || `Cobrador Ruta ${i + 1}`,
        username: existingCol?.username || `ruta${i + 1}`,
        password:
          existingCol?.password && cfg.isSetupCompleted
            ? existingCol.password
            : `ruta${i + 1}2026`,
        description: existingRoute?.description || `Sector Ruta ${i + 1}`,
        initialCashBaseStr: String(
          existingRoute?.initialCashBase ?? cfg.routeInitialCashBase ?? 200000
        ),
        showPassword: false,
      });
    }
    setWizRoutesDraft(drafts);
    setWizError('');
    setAuthGateError('');
    setCurrentAdminPassCheck('');
    // Si la oficina ya fue configurada previamente con contraseña personalizada, pedir clave actual del admin
    setAuthGatePassed(!cfg.isSetupCompleted);
    setWizardStep(1);
    setWizardVisible(true);
  };

  const adjustWizardRoutesCount = (newCount: number) => {
    const clamped = Math.max(1, Math.min(20, newCount));
    setWizRoutesCount(clamped);
    setWizRoutesDraft((prev) => {
      const next = [...prev];
      while (next.length < clamped) {
        const idx = next.length + 1;
        next.push({
          name: `Ruta ${idx}`,
          collectorName: `Cobrador Ruta ${idx}`,
          username: `ruta${idx}`,
          password: `ruta${idx}2026`,
          description: `Sector Ruta ${idx}`,
          initialCashBaseStr: '200000',
          showPassword: false,
        });
      }
      return next.slice(0, clamped);
    });
  };

  const updateRouteDraftField = (
    index: number,
    field: keyof EditableRouteDraft,
    value: string | boolean
  ) => {
    setWizRoutesDraft((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
    setWizError('');
  };

  const handleNextStepFrom1 = () => {
    if (!wizCompanyName.trim()) {
      setWizError('Ingrese el nombre de la oficina o empresa.');
      return;
    }
    if (!wizAdminUsername.trim()) {
      setWizError('Cree un nombre de usuario para el Administrador.');
      return;
    }
    if (!wizAdminPassword.trim() || wizAdminPassword.trim().length < 3) {
      setWizError('Cree una contraseña para el Administrador (mínimo 3 caracteres).');
      return;
    }
    setWizError('');
    setWizardStep(2);
  };

  const handleNextStepFrom2 = () => {
    if (wizRoutesCount < 1) {
      setWizError('La oficina debe tener al menos 1 ruta.');
      return;
    }
    setWizError('');
    setWizardStep(3);
  };

  const handleFinishWizardSetup = async () => {
    try {
      setWizError('');
      const result = await localStore.setupOfficeAndRoutes({
        companyName: wizCompanyName.trim(),
        city: wizCity.trim(),
        supportPhone: wizPhone.trim(),
        adminName: wizAdminName.trim() || 'Administrador de Oficina',
        adminUsername: wizAdminUsername.trim().toLowerCase(),
        adminPassword: wizAdminPassword.trim(),
        defaultInterestRatePercent: parseFloat(wizInterestRateStr) || 20,
        paperworkFeeEnabled: wizPaperworkEnabled,
        paperworkRate: parseInt(wizPaperworkRateStr.replace(/\D/g, ''), 10) || 5000,
        excludeSundays: wizExcludeSundays,
        allowRouteNewLoans: wizAllowNewLoans,
        allowCollectorExpenses: wizAllowExpenses,
        allowPartialPayments: true,
        cleanCustomersData: wizCleanCustomers,
        routesConfig: wizRoutesDraft.map((d) => ({
          id: d.id,
          name: d.name.trim(),
          collectorName: d.collectorName.trim(),
          username: d.username.trim().toLowerCase(),
          password: d.password.trim(),
          description: d.description.trim(),
          initialCashBase: parseInt(d.initialCashBaseStr.replace(/\D/g, ''), 10) || 0,
        })),
      });

      setCreatedSummaryUser(result.adminUser);
      if (onDataReset) onDataReset();
      setWizardStep(4);
    } catch (err: any) {
      setWizError(err?.message || 'Error al guardar la configuración de la oficina.');
    }
  };

  const handleShareCredentialsSummary = async () => {
    const lines: string[] = [
      `🏢 *CREDENCIALES DE OFICINA - ${wizCompanyName.toUpperCase()}*`,
      '',
      `👑 *ADMINISTRADOR DE OFICINA*`,
      `• Usuario: ${wizAdminUsername.trim().toLowerCase()}`,
      `• Contraseña: ${wizAdminPassword.trim()}`,
      '',
      `🛵 *RUTAS CONFIGURADAS (${wizRoutesDraft.length}):*`,
    ];
    wizRoutesDraft.forEach((r, idx) => {
      lines.push(
        `\n📍 *Ruta ${idx + 1}: ${r.name}* (${r.collectorName})\n   • Usuario: ${r.username
          .trim()
          .toLowerCase()}\n   • Contraseña: ${r.password.trim()}\n   • Base Inicial: $${(
          parseInt(r.initialCashBaseStr.replace(/\D/g, ''), 10) || 0
        ).toLocaleString('es-CO')}`
      );
    });
    const text = lines.join('\n');
    try {
      await Share.share({ title: 'Credenciales de Oficina y Rutas', message: text });
    } catch {
      // Ignorar si cancela
    }
  };

  const handleCleanSlate = () => {
    Alert.alert(
      '¿Iniciar Operación Limpia?',
      'Se borrarán todos los clientes y préstamos de prueba. La aplicación quedará en blanco conservando sus rutas y credenciales.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Iniciar en Blanco',
          style: 'destructive',
          onPress: async () => {
            await localStore.resetToCleanProduction();
            if (onDataReset) onDataReset();
            Alert.alert(
              'Operación Limpia',
              'Se han eliminado los datos demo. El sistema está 100% limpio para su uso.'
            );
          },
        },
      ]
    );
  };

  const handleLoadDemo = async () => {
    await localStore.resetToDemoSeed();
    if (onDataReset) onDataReset();
    Alert.alert(
      'Datos Demo Cargados',
      'Se han cargado clientes de prueba para demostración.'
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Header Corporativo */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <ShieldCheck size={34} color="#38BDF8" />
          </View>
          <Text style={styles.companyName}>
            {(officeConfig.companyName || 'SISTEMA DE CARTERA & COBROS').toUpperCase()}
          </Text>
          <Text style={styles.appTitle}>Acceso a la Oficina y Rutas</Text>
          <Text style={styles.appSubtitle}>
            Ingresa con tus credenciales de Administrador o de Ruta de Cobro
          </Text>
        </View>

        {/* Banner Destacado: Configurar Oficina, Credenciales de Admin y Rutas */}
        <TouchableOpacity
          style={styles.setupWizardBanner}
          activeOpacity={0.85}
          onPress={openOfficeSetupWizard}
        >
          <View style={styles.setupWizardIconCircle}>
            <Settings size={20} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.setupWizardBannerTitle}>
              {isSetupCompleted
                ? 'Configurar Oficina, Admin y Rutas'
                : '¡Nuevo! Crear Credenciales de Oficina y Rutas'}
            </Text>
            <Text style={styles.setupWizardBannerSub}>
              Crea tu usuario Administrador, elige cuántas rutas tendrá la oficina y configúralas a tu gusto
            </Text>
          </View>
          <ChevronRight size={18} color="#38BDF8" />
        </TouchableOpacity>

        {/* 2. Selector de Perfil / Rol (Cobrador vs Admin) */}
        <View style={styles.roleSelectorBox}>
          <Text style={styles.selectorLabel}>¿CON QUÉ PERFIL VAS A INGRESAR?</Text>
          <View style={styles.roleTabsRow}>
            <TouchableOpacity
              style={[
                styles.roleTabBtn,
                selectedRole === 'COBRADOR' && styles.roleTabBtnActive,
              ]}
              activeOpacity={0.8}
              onPress={() => handleRoleTabChange('COBRADOR')}
            >
              <View
                style={[
                  styles.roleIconWrap,
                  selectedRole === 'COBRADOR' && styles.roleIconWrapActive,
                ]}
              >
                <Bike size={20} color={selectedRole === 'COBRADOR' ? '#FFFFFF' : '#38BDF8'} />
              </View>
              <Text
                style={[
                  styles.roleTabTitle,
                  selectedRole === 'COBRADOR' && styles.roleTabTitleActive,
                ]}
              >
                RUTA / COBRADOR
              </Text>
              <Text style={styles.roleTabSub}>
                {routes.length} {routes.length === 1 ? 'ruta activa' : 'rutas activas'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleTabBtn,
                selectedRole === 'ADMIN' && styles.roleTabBtnActive,
              ]}
              activeOpacity={0.8}
              onPress={() => handleRoleTabChange('ADMIN')}
            >
              <View
                style={[
                  styles.roleIconWrap,
                  selectedRole === 'ADMIN' && styles.roleIconWrapActive,
                ]}
              >
                <Building2 size={20} color={selectedRole === 'ADMIN' ? '#FFFFFF' : '#38BDF8'} />
              </View>
              <Text
                style={[
                  styles.roleTabTitle,
                  selectedRole === 'ADMIN' && styles.roleTabTitleActive,
                ]}
              >
                ADMINISTRADOR
              </Text>
              <Text style={styles.roleTabSub}>Oficina y control total</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Formulario de Credenciales */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {selectedRole === 'COBRADOR'
              ? 'Iniciar Turno de Ruta'
              : 'Acceso Gerencial de Oficina'}
          </Text>
          <Text style={styles.formSub}>
            {selectedRole === 'COBRADOR'
              ? 'Selecciona tu ruta o escribe tu usuario y contraseña asignados por la oficina.'
              : 'Control multi-ruta, liquidaciones, creación de rutas, credenciales y políticas.'}
          </Text>

          {/* Selector Rápido de Rutas Configuradas (Solo en modo Cobrador) */}
          {selectedRole === 'COBRADOR' && routes.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.inputLabel}>SELECCIONA TU RUTA ({routes.length})</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {routes.map((rt, idx) => {
                  const isSelected = rt.id === selectedRouteChipId;
                  const colUser = users.find(
                    (u) => u.id === rt.collectorId || u.routeId === rt.id
                  );
                  return (
                    <TouchableOpacity
                      key={rt.id}
                      style={[
                        styles.routeQuickChip,
                        isSelected && styles.routeQuickChipActive,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => handleSelectRouteChip(rt)}
                    >
                      <MapPin
                        size={13}
                        color={isSelected ? '#38BDF8' : '#94A3B8'}
                        style={{ marginRight: 5 }}
                      />
                      <View>
                        <Text
                          style={[
                            styles.routeQuickChipTitle,
                            isSelected && { color: '#FFFFFF' },
                          ]}
                        >
                          {rt.name || `Ruta ${idx + 1}`}
                        </Text>
                        <Text style={styles.routeQuickChipSub}>
                          Usuario: {colUser?.username || `ruta${idx + 1}`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          ) : null}

          {/* Input: Usuario */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>
              {selectedRole === 'COBRADOR' ? 'USUARIO DE LA RUTA' : 'USUARIO ADMINISTRADOR'}
            </Text>
            <View style={styles.inputWrapper}>
              <UserIcon size={16} color="#38BDF8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={username}
                onChangeText={(val) => {
                  setUsername(val);
                  setErrorMessage('');
                }}
                placeholder={selectedRole === 'COBRADOR' ? 'Ej. ruta1' : 'Ej. admin'}
                placeholderTextColor="#64748B"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Input: Contraseña */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONTRASEÑA DE ACCESO</Text>
            <View style={styles.inputWrapper}>
              <Lock size={16} color="#38BDF8" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setErrorMessage('');
                }}
                placeholder="Ingresa tu contraseña"
                placeholderTextColor="#64748B"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                activeOpacity={0.7}
              >
                {showPassword ? (
                  <EyeOff size={16} color="#94A3B8" />
                ) : (
                  <Eye size={16} color="#94A3B8" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Checkbox: Recordar sesión en este teléfono */}
          <TouchableOpacity
            style={styles.rememberRow}
            activeOpacity={0.7}
            onPress={() => setRememberSession(!rememberSession)}
          >
            <View style={[styles.checkbox, rememberSession && styles.checkboxActive]}>
              {rememberSession && <CheckCircle2 size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.rememberText}>
              Mantener sesión iniciada en este dispositivo
            </Text>
          </TouchableOpacity>

          {/* Botón Principal */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
            activeOpacity={0.8}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
            ) : null}
            <Text style={styles.submitBtnText}>
              {isLoading
                ? 'Verificando...'
                : selectedRole === 'COBRADOR'
                ? 'INGRESAR A MI RUTA'
                : 'INGRESAR A LA OFICINA'}
            </Text>
            {!isLoading && <ChevronRight size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>

        {/* 4. Opciones de Datos para Puesta en Marcha */}
        <View style={styles.toolsCard}>
          <Text style={styles.toolsTitle}>HERRAMIENTAS DE PUESTA EN MARCHA</Text>

          <TouchableOpacity
            style={styles.cleanSlateBtn}
            activeOpacity={0.8}
            onPress={handleCleanSlate}
          >
            <Trash2 size={16} color="#DC2626" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cleanSlateText}>Limpiar Clientes y Dejar en Blanco (Real)</Text>
              <Text style={styles.cleanSlateSub}>
                Borra clientes de prueba conservando tus credenciales y rutas
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loadDemoBtn}
            activeOpacity={0.8}
            onPress={handleLoadDemo}
          >
            <Sparkles size={16} color="#0284C7" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.loadDemoText}>Cargar Cartera Demo de Prueba</Text>
              <Text style={styles.loadDemoSub}>Rellena con 40 clientes de demostración</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ========================================================================= */}
      {/* MODAL ASISTENTE: CONFIGURAR OFICINA, CREDENCIALES ADMIN Y MULTI-RUTA      */}
      {/* ========================================================================= */}
      <Modal visible={wizardVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.wizardSheet}>
            {/* Header del Asistente */}
            <View style={styles.wizardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={styles.wizardHeaderBadge}>
                  <Building2 size={18} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wizardHeaderTitle}>
                    Configuración de Oficina y Rutas
                  </Text>
                  <Text style={styles.wizardHeaderSub}>
                    {!authGatePassed
                      ? 'Verificación de seguridad del Administrador'
                      : wizardStep === 1
                      ? 'Paso 1 de 3: Credenciales de Administrador'
                      : wizardStep === 2
                      ? 'Paso 2 de 3: ¿Cuántas rutas tendrá la oficina?'
                      : wizardStep === 3
                      ? `Paso 3 de 3: Configurar las ${wizRoutesCount} ruta(s) y sus claves`
                      : '¡Oficina y Rutas Configuradas con Éxito!'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setWizardVisible(false)}
                style={styles.wizardCloseBtn}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Indicador de Progreso de Pasos */}
            {authGatePassed && wizardStep < 4 && (
              <View style={styles.stepProgressRow}>
                {[1, 2, 3].map((st) => (
                  <View
                    key={st}
                    style={[
                      styles.stepProgressBar,
                      wizardStep >= st && styles.stepProgressBarActive,
                    ]}
                  />
                ))}
              </View>
            )}

            <ScrollView
              style={styles.wizardBody}
              contentContainerStyle={{ paddingBottom: 28 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Candado de seguridad si la oficina ya tenía credenciales personalizadas */}
              {!authGatePassed ? (
                <View style={{ gap: 14, paddingTop: 10 }}>
                  <View style={styles.infoBanner}>
                    <KeyRound size={18} color="#38BDF8" style={{ marginRight: 10 }} />
                    <Text style={styles.infoBannerText}>
                      Esta oficina ya tiene credenciales configuradas. Ingrese la contraseña actual del Administrador para modificar las credenciales o las rutas.
                    </Text>
                  </View>

                  {authGateError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>⚠️ {authGateError}</Text>
                    </View>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>CONTRASEÑA ACTUAL DEL ADMINISTRADOR</Text>
                    <View style={styles.inputWrapper}>
                      <Lock size={16} color="#38BDF8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        value={currentAdminPassCheck}
                        onChangeText={(t) => {
                          setCurrentAdminPassCheck(t);
                          setAuthGateError('');
                        }}
                        placeholder="Contraseña del Administrador"
                        placeholderTextColor="#64748B"
                        secureTextEntry
                        autoCapitalize="none"
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={() => {
                      const adminUser = localStore
                        .getUsers()
                        .find((u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN');
                      const expected = adminUser?.password || '123';
                      if (currentAdminPassCheck.trim() === expected) {
                        setAuthGatePassed(true);
                        setAuthGateError('');
                      } else {
                        setAuthGateError('Contraseña de Administrador incorrecta.');
                      }
                    }}
                  >
                    <Text style={styles.submitBtnText}>VERIFICAR Y CONTINUAR</Text>
                    <ChevronRight size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : wizardStep === 1 ? (
                /* ============================================================== */
                /* PASO 1: DATOS DE LA OFICINA Y CREDENCIALES DEL ADMINISTRADOR   */
                /* ============================================================== */
                <View style={{ gap: 12 }}>
                  <Text style={styles.stepSectionTitle}>
                    1. Datos de la Oficina
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>NOMBRE DE LA OFICINA / EMPRESA *</Text>
                    <View style={styles.inputWrapper}>
                      <Building2 size={16} color="#38BDF8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        value={wizCompanyName}
                        onChangeText={setWizCompanyName}
                        placeholder="Ej. Inversiones & Créditos El Dorado"
                        placeholderTextColor="#64748B"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>CIUDAD</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.textInput}
                          value={wizCity}
                          onChangeText={setWizCity}
                          placeholder="Barranquilla"
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>TELÉFONO / WHATSAPP</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.textInput}
                          value={wizPhone}
                          onChangeText={setWizPhone}
                          placeholder="300 123 4567"
                          placeholderTextColor="#64748B"
                          keyboardType="phone-pad"
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.stepDivider} />

                  <Text style={styles.stepSectionTitle}>
                    2. Crear Credenciales de Administrador
                  </Text>
                  <Text style={styles.stepSectionSub}>
                    Estas son las credenciales exclusivas del dueño o administrador de la oficina para ver todas las rutas, cuadrar caja y cambiar configuraciones.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>NOMBRE DEL ADMINISTRADOR *</Text>
                    <View style={styles.inputWrapper}>
                      <UserIcon size={16} color="#38BDF8" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        value={wizAdminName}
                        onChangeText={setWizAdminName}
                        placeholder="Ej. Fernando Baquero (Administrador)"
                        placeholderTextColor="#64748B"
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>USUARIO DE ADMINISTRADOR *</Text>
                    <View style={styles.inputWrapper}>
                      <UserIcon size={16} color="#10B981" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        value={wizAdminUsername}
                        onChangeText={(v) => {
                          setWizAdminUsername(v);
                          setWizError('');
                        }}
                        placeholder="Ej. admin o gerencia"
                        placeholderTextColor="#64748B"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>CONTRASEÑA DE ADMINISTRADOR *</Text>
                    <View style={styles.inputWrapper}>
                      <Lock size={16} color="#10B981" style={styles.inputIcon} />
                      <TextInput
                        style={styles.textInput}
                        value={wizAdminPassword}
                        onChangeText={(v) => {
                          setWizAdminPassword(v);
                          setWizError('');
                        }}
                        placeholder="Escribe tu contraseña de administrador"
                        placeholderTextColor="#64748B"
                        secureTextEntry={!wizShowAdminPass}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setWizShowAdminPass(!wizShowAdminPass)}
                        style={styles.eyeBtn}
                      >
                        {wizShowAdminPass ? (
                          <EyeOff size={16} color="#94A3B8" />
                        ) : (
                          <Eye size={16} color="#94A3B8" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {wizError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>⚠️ {wizError}</Text>
                    </View>
                  ) : null}
                </View>
              ) : wizardStep === 2 ? (
                /* ============================================================== */
                /* PASO 2: ¿CUÁNTAS RUTAS TENDRÁ LA OFICINA? Y POLÍTICAS          */
                /* ============================================================== */
                <View style={{ gap: 14 }}>
                  <Text style={styles.stepSectionTitle}>
                    ¿Cuántas rutas va a tener esta oficina?
                  </Text>
                  <Text style={styles.stepSectionSub}>
                    Elige el número de rutas que maneja tu oficina. En el siguiente paso podrás personalizar el nombre, cobrador, usuario y clave de cada ruta.
                  </Text>

                  {/* Selector grande con - / + y botones rápidos */}
                  <View style={styles.routesCounterCard}>
                    <View style={styles.counterControlRow}>
                      <TouchableOpacity
                        style={styles.counterStepBtn}
                        onPress={() => adjustWizardRoutesCount(wizRoutesCount - 1)}
                      >
                        <Minus size={20} color="#FFFFFF" />
                      </TouchableOpacity>

                      <View style={{ alignItems: 'center', minWidth: 110 }}>
                        <Text style={styles.counterBigNumber}>{wizRoutesCount}</Text>
                        <Text style={styles.counterBigLabel}>
                          {wizRoutesCount === 1 ? 'RUTA ACTIVA' : 'RUTAS ACTIVAS'}
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.counterStepBtn}
                        onPress={() => adjustWizardRoutesCount(wizRoutesCount + 1)}
                      >
                        <Plus size={20} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.quickNumbersRow}>
                      {[1, 2, 3, 4, 5, 6, 8, 10].map((num) => (
                        <TouchableOpacity
                          key={num}
                          style={[
                            styles.quickNumPill,
                            wizRoutesCount === num && styles.quickNumPillActive,
                          ]}
                          onPress={() => adjustWizardRoutesCount(num)}
                        >
                          <Text
                            style={[
                              styles.quickNumText,
                              wizRoutesCount === num && styles.quickNumTextActive,
                            ]}
                          >
                            {num}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.stepDivider} />

                  <Text style={styles.stepSectionTitle}>
                    Configura las Reglas de tu Oficina a tu Gusto
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>INTERÉS POR DEFECTO (%)</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.textInput}
                          value={wizInterestRateStr}
                          onChangeText={setWizInterestRateStr}
                          keyboardType="numeric"
                          placeholder="20"
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.inputLabel}>PAPELERÍA ($ x 100k)</Text>
                      <View style={styles.inputWrapper}>
                        <TextInput
                          style={styles.textInput}
                          value={wizPaperworkRateStr}
                          onChangeText={setWizPaperworkRateStr}
                          keyboardType="numeric"
                          editable={wizPaperworkEnabled}
                          placeholder="5000"
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.wizSwitchRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.wizSwitchTitle}>Cobrar Papelería / Cartulina</Text>
                      <Text style={styles.wizSwitchSub}>
                        Descuenta tarifa de papelería al desembolsar o renovar
                      </Text>
                    </View>
                    <Switch
                      value={wizPaperworkEnabled}
                      onValueChange={setWizPaperworkEnabled}
                      trackColor={{ false: '#334155', true: '#0284C7' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.wizSwitchRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.wizSwitchTitle}>Excluir Domingos del Calendario</Text>
                      <Text style={styles.wizSwitchSub}>
                        No genera cuotas de cobro los días domingo
                      </Text>
                    </View>
                    <Switch
                      value={wizExcludeSundays}
                      onValueChange={setWizExcludeSundays}
                      trackColor={{ false: '#334155', true: '#0284C7' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.wizSwitchRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.wizSwitchTitle}>
                        Permitir a Cobradores Crear Créditos en Ruta
                      </Text>
                      <Text style={styles.wizSwitchSub}>
                        Habilita desembolsar préstamos nuevos desde el celular
                      </Text>
                    </View>
                    <Switch
                      value={wizAllowNewLoans}
                      onValueChange={setWizAllowNewLoans}
                      trackColor={{ false: '#334155', true: '#0284C7' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.wizSwitchRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.wizSwitchTitle}>
                        Permitir Registrar Gastos de Ruta
                      </Text>
                      <Text style={styles.wizSwitchSub}>
                        Gasolina, pinchazos o viáticos con soporte en el cuadre
                      </Text>
                    </View>
                    <Switch
                      value={wizAllowExpenses}
                      onValueChange={setWizAllowExpenses}
                      trackColor={{ false: '#334155', true: '#0284C7' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.wizSwitchRow}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <Text style={styles.wizSwitchTitle}>
                        Iniciar Cartera en Blanco (Sin clientes demo)
                      </Text>
                      <Text style={styles.wizSwitchSub}>
                        Limpia datos de prueba y deja listas las bases de cada ruta
                      </Text>
                    </View>
                    <Switch
                      value={wizCleanCustomers}
                      onValueChange={setWizCleanCustomers}
                      trackColor={{ false: '#334155', true: '#10B981' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              ) : wizardStep === 3 ? (
                /* ============================================================== */
                /* PASO 3: CONFIGURAR CADA RUTA A SU GUSTO Y SUS CREDENCIALES     */
                /* ============================================================== */
                <View style={{ gap: 14 }}>
                  <Text style={styles.stepSectionTitle}>
                    Configura las {wizRoutesDraft.length} Ruta(s) y sus Credenciales
                  </Text>
                  <Text style={styles.stepSectionSub}>
                    Personaliza el nombre de cada ruta, el cobrador encargado, su base de efectivo y el usuario/contraseña con el que entrará en su teléfono.
                  </Text>

                  {wizError ? (
                    <View style={styles.errorBox}>
                      <Text style={styles.errorText}>⚠️ {wizError}</Text>
                    </View>
                  ) : null}

                  {wizRoutesDraft.map((draft, idx) => (
                    <View key={idx} style={styles.routeDraftCard}>
                      <View style={styles.routeDraftHeader}>
                        <View style={styles.routeDraftBadge}>
                          <Text style={styles.routeDraftBadgeText}>RUTA #{idx + 1}</Text>
                        </View>
                        <Text style={styles.routeDraftTitle}>{draft.name || `Ruta ${idx + 1}`}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={[styles.inputGroup, { flex: 1.2 }]}>
                          <Text style={styles.inputLabel}>NOMBRE DE LA RUTA *</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.textInput}
                              value={draft.name}
                              onChangeText={(v) => updateRouteDraftField(idx, 'name', v)}
                              placeholder={`Ruta ${idx + 1} - Norte`}
                              placeholderTextColor="#64748B"
                            />
                          </View>
                        </View>

                        <View style={[styles.inputGroup, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>BASE EFECTIVO ($)</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.textInput}
                              value={draft.initialCashBaseStr}
                              onChangeText={(v) =>
                                updateRouteDraftField(idx, 'initialCashBaseStr', v)
                              }
                              keyboardType="numeric"
                              placeholder="200000"
                              placeholderTextColor="#64748B"
                            />
                          </View>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>NOMBRE DEL COBRADOR *</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.textInput}
                              value={draft.collectorName}
                              onChangeText={(v) =>
                                updateRouteDraftField(idx, 'collectorName', v)
                              }
                              placeholder="Ej. Carlos Pérez"
                              placeholderTextColor="#64748B"
                            />
                          </View>
                        </View>

                        <View style={[styles.inputGroup, { flex: 1 }]}>
                          <Text style={styles.inputLabel}>SECTOR / BARRIOS</Text>
                          <View style={styles.inputWrapper}>
                            <TextInput
                              style={styles.textInput}
                              value={draft.description}
                              onChangeText={(v) =>
                                updateRouteDraftField(idx, 'description', v)
                              }
                              placeholder="Ej. Centro, Boston"
                              placeholderTextColor="#64748B"
                            />
                          </View>
                        </View>
                      </View>

                      <View style={styles.routeDraftCredsBox}>
                        <Text style={styles.routeDraftCredsHeader}>
                          🔑 CREDENCIALES DE ACCESO PARA ESTA RUTA
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <View style={[styles.inputGroup, { flex: 1, marginBottom: 0 }]}>
                            <Text style={styles.inputLabel}>USUARIO DE RUTA *</Text>
                            <View style={styles.inputWrapper}>
                              <TextInput
                                style={styles.textInput}
                                value={draft.username}
                                onChangeText={(v) =>
                                  updateRouteDraftField(idx, 'username', v)
                                }
                                placeholder={`ruta${idx + 1}`}
                                placeholderTextColor="#64748B"
                                autoCapitalize="none"
                                autoCorrect={false}
                              />
                            </View>
                          </View>

                          <View style={[styles.inputGroup, { flex: 1.1, marginBottom: 0 }]}>
                            <Text style={styles.inputLabel}>CONTRASEÑA DE RUTA *</Text>
                            <View style={styles.inputWrapper}>
                              <TextInput
                                style={styles.textInput}
                                value={draft.password}
                                onChangeText={(v) =>
                                  updateRouteDraftField(idx, 'password', v)
                                }
                                placeholder="Clave de acceso"
                                placeholderTextColor="#64748B"
                                secureTextEntry={!draft.showPassword}
                                autoCapitalize="none"
                              />
                              <TouchableOpacity
                                onPress={() =>
                                  updateRouteDraftField(
                                    idx,
                                    'showPassword',
                                    !draft.showPassword
                                  )
                                }
                                style={{ padding: 6 }}
                              >
                                {draft.showPassword ? (
                                  <EyeOff size={15} color="#94A3B8" />
                                ) : (
                                  <Eye size={15} color="#94A3B8" />
                                )}
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                /* ============================================================== */
                /* PASO 4: RESUMEN DE CREDENCIALES CREADAS Y ACCESO DIRECTO       */
                /* ============================================================== */
                <View style={{ gap: 14 }}>
                  <View style={styles.successBanner}>
                    <CheckCircle2 size={28} color="#10B981" style={{ marginBottom: 6 }} />
                    <Text style={styles.successBannerTitle}>
                      ¡{wizCompanyName} Configurada!
                    </Text>
                    <Text style={styles.successBannerSub}>
                      Se han creado las credenciales del Administrador y {wizRoutesDraft.length}{' '}
                      ruta(s) personalizadas.
                    </Text>
                  </View>

                  {/* Tarjeta Resumen Admin */}
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryCardTag}>👑 CREDENCIAL DE ADMINISTRADOR (OFICINA)</Text>
                    <Text style={styles.summaryCardName}>{wizAdminName}</Text>
                    <View style={styles.summaryCredRow}>
                      <Text style={styles.summaryCredLabel}>Usuario:</Text>
                      <Text style={styles.summaryCredVal}>
                        {wizAdminUsername.trim().toLowerCase()}
                      </Text>
                    </View>
                    <View style={styles.summaryCredRow}>
                      <Text style={styles.summaryCredLabel}>Contraseña:</Text>
                      <Text style={styles.summaryCredVal}>{wizAdminPassword.trim()}</Text>
                    </View>
                  </View>

                  {/* Tarjetas Resumen Rutas */}
                  {wizRoutesDraft.map((r, i) => (
                    <View key={i} style={styles.summaryCard}>
                      <Text style={[styles.summaryCardTag, { color: '#38BDF8' }]}>
                        🛵 RUTA #{i + 1}: {r.name.toUpperCase()}
                      </Text>
                      <Text style={styles.summaryCardName}>Cobrador: {r.collectorName}</Text>
                      <View style={styles.summaryCredRow}>
                        <Text style={styles.summaryCredLabel}>Usuario:</Text>
                        <Text style={styles.summaryCredVal}>
                          {r.username.trim().toLowerCase()}
                        </Text>
                      </View>
                      <View style={styles.summaryCredRow}>
                        <Text style={styles.summaryCredLabel}>Contraseña:</Text>
                        <Text style={styles.summaryCredVal}>{r.password.trim()}</Text>
                      </View>
                    </View>
                  ))}

                  <TouchableOpacity
                    style={styles.shareCredsBtn}
                    onPress={handleShareCredentialsSummary}
                  >
                    <Share2 size={16} color="#38BDF8" style={{ marginRight: 8 }} />
                    <Text style={styles.shareCredsBtnText}>
                      Compartir / Guardar Hoja de Credenciales
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {/* Footer de Navegación del Asistente */}
            {authGatePassed && (
              <View style={styles.wizardFooter}>
                {wizardStep > 1 && wizardStep < 4 ? (
                  <TouchableOpacity
                    style={styles.wizardBackBtn}
                    onPress={() => setWizardStep((wizardStep - 1) as 1 | 2 | 3)}
                  >
                    <ChevronLeft size={16} color="#CBD5E1" />
                    <Text style={styles.wizardBackBtnText}>Atrás</Text>
                  </TouchableOpacity>
                ) : (
                  <View />
                )}

                {wizardStep === 1 && (
                  <TouchableOpacity
                    style={styles.wizardNextBtn}
                    onPress={handleNextStepFrom1}
                  >
                    <Text style={styles.wizardNextBtnText}>Siguiente: Nº de Rutas</Text>
                    <ChevronRight size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                )}

                {wizardStep === 2 && (
                  <TouchableOpacity
                    style={styles.wizardNextBtn}
                    onPress={handleNextStepFrom2}
                  >
                    <Text style={styles.wizardNextBtnText}>
                      Configurar las {wizRoutesCount} Ruta(s)
                    </Text>
                    <ChevronRight size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                )}

                {wizardStep === 3 && (
                  <TouchableOpacity
                    style={[styles.wizardNextBtn, { backgroundColor: '#10B981' }]}
                    onPress={handleFinishWizardSetup}
                  >
                    <CheckCircle2 size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.wizardNextBtnText}>
                      Guardar Oficina y Credenciales
                    </Text>
                  </TouchableOpacity>
                )}

                {wizardStep === 4 && (
                  <View style={{ flexDirection: 'row', gap: 10, flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.wizardBackBtn, { flex: 1, justifyContent: 'center' }]}
                      onPress={() => setWizardVisible(false)}
                    >
                      <Text style={styles.wizardBackBtnText}>Ir al Login</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.wizardNextBtn,
                        { flex: 1.4, justifyContent: 'center', backgroundColor: '#10B981' },
                      ]}
                      onPress={() => {
                        setWizardVisible(false);
                        if (createdSummaryUser) {
                          onLoginSuccess(createdSummaryUser, true);
                        }
                      }}
                    >
                      <Text style={styles.wizardNextBtnText}>Entrar como Admin</Text>
                      <ChevronRight size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 18 : 12,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 6,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  companyName: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 3,
    textAlign: 'center',
  },
  appTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  appSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 300,
  },
  setupWizardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.16)',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    borderRadius: 16,
    padding: 13,
    marginBottom: 16,
    gap: 12,
  },
  setupWizardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupWizardBannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  setupWizardBannerSub: {
    color: '#BAE6FD',
    fontSize: 10.5,
    lineHeight: 14,
  },
  roleSelectorBox: {
    marginBottom: 14,
  },
  selectorLabel: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    textAlign: 'center',
  },
  roleTabsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleTabBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#334155',
  },
  roleTabBtnActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  roleIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  roleIconWrapActive: {
    backgroundColor: '#0284C7',
  },
  roleTabTitle: {
    color: '#E2E8F0',
    fontSize: 12.5,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  roleTabTitleActive: {
    color: '#38BDF8',
  },
  roleTabSub: {
    color: '#94A3B8',
    fontSize: 10,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  formTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  formSub: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 14,
  },
  routeQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  routeQuickChipActive: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(2, 132, 199, 0.22)',
  },
  routeQuickChipTitle: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '800',
  },
  routeQuickChipSub: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#451A1A',
    borderColor: '#991B1B',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 42,
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 8,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#64748B',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
  },
  checkboxActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  rememberText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  toolsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolsTitle: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  cleanSlateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  cleanSlateText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  cleanSlateSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  loadDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(2, 132, 199, 0.3)',
    borderRadius: 10,
    padding: 10,
  },
  loadDemoText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '800',
  },
  loadDemoSub: {
    color: '#94A3B8',
    fontSize: 10,
  },
  // Estilos del Modal Wizard
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end',
  },
  wizardSheet: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '94%',
    borderWidth: 1,
    borderColor: '#334155',
  },
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  wizardHeaderBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  wizardHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  wizardHeaderSub: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '600',
  },
  wizardCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepProgressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  stepProgressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1E293B',
  },
  stepProgressBarActive: {
    backgroundColor: '#38BDF8',
  },
  wizardBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  stepSectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  stepSectionSub: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 16,
  },
  stepDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoBannerText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  routesCounterCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    gap: 14,
  },
  counterControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  counterStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterBigNumber: {
    color: '#38BDF8',
    fontSize: 34,
    fontWeight: '900',
  },
  counterBigLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  quickNumbersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  quickNumPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickNumPillActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  quickNumText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
  },
  quickNumTextActive: {
    color: '#FFFFFF',
  },
  wizSwitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  wizSwitchTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  wizSwitchSub: {
    color: '#94A3B8',
    fontSize: 10.5,
    marginTop: 2,
  },
  routeDraftCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  routeDraftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  routeDraftBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.16)',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  routeDraftBadgeText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '900',
  },
  routeDraftTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  routeDraftCredsBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 2,
  },
  routeDraftCredsHeader: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  successBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  successBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  successBannerSub: {
    color: '#A7F3D0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 4,
  },
  summaryCardTag: {
    color: '#10B981',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  summaryCardName: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryCredRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  summaryCredLabel: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '700',
  },
  summaryCredVal: {
    color: '#38BDF8',
    fontSize: 12.5,
    fontWeight: '900',
  },
  shareCredsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#38BDF8',
    borderRadius: 12,
    paddingVertical: 12,
  },
  shareCredsBtnText: {
    color: '#38BDF8',
    fontSize: 12.5,
    fontWeight: '800',
  },
  wizardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  wizardBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  wizardBackBtnText: {
    color: '#CBD5E1',
    fontSize: 12.5,
    fontWeight: '700',
    marginLeft: 4,
  },
  wizardNextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
  },
  wizardNextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    marginRight: 4,
  },
});
