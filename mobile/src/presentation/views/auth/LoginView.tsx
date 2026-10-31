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
  Modal,
  Alert,
} from 'react-native';
import { User, Route } from '../../../core/domain/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ShieldCheck,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Plus,
  Minus,
  X,
  CheckCircle2,
  Building2,
  Route as RouteIcon,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react-native';
import { localStore, safeStorage } from '../../../infrastructure/storage/local-store';
import { verifyPassword } from '../../../core/utils/security';
import { COLORS, FONT_FAMILY } from '../../theme/colors';

interface LoginViewProps {
  users: User[];
  routes?: Route[];
  onLoginSuccess: (user: User, remember: boolean) => void;
  onDataReset?: () => void;
}

interface EditableRouteDraft {
  id?: string;
  name: string;
  username: string;
  password: string;
  targetAdministrativeStr: string;
  expectedCustomersCountStr: string;
}

const FORBIDDEN_DEFAULT_PASSWORDS = new Set([
  '123',
  '1234',
  '12345',
  '123456',
  '000',
  '0000',
  '000000',
  'admin',
  'password',
  'cobrador',
]);

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onDataReset,
}) => {
  const insets = useSafeAreaInsets();
  const officeConfig = localStore.getOfficeConfig();
  const isOfficeRegistered = Boolean(
    officeConfig.isSetupCompleted && officeConfig.companyName?.trim()
  );

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [rememberPassword, setRememberPassword] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    safeStorage.getItem('@prestamos_remembered_credentials').then((raw) => {
      if (raw) {
        try {
          const creds = JSON.parse(raw);
          if (creds.username) setUsername(creds.username);
          if (creds.password) setPassword(creds.password);
          setRememberPassword(true);
        } catch {}
      } else {
        setUsername('admin');
        setPassword('123456');
      }
    });
  }, []);

  // Modal de Registro / Configuración de Oficina y Credenciales
  const [setupVisible, setSetupVisible] = useState(false);
  const [isSetupUnlocked, setIsSetupUnlocked] = useState(false);
  const [wizCurrentAdminPassword, setWizCurrentAdminPassword] = useState('');
  const [wizCompanyName, setWizCompanyName] = useState('');
  const [wizAdminUsername, setWizAdminUsername] = useState('');
  const [wizAdminPassword, setWizAdminPassword] = useState('');
  const [wizRoutesCount, setWizRoutesCount] = useState<number>(1);
  const [wizRoutesDraft, setWizRoutesDraft] = useState<EditableRouteDraft[]>([
    { name: '', username: '', password: '', targetAdministrativeStr: '', expectedCustomersCountStr: '' },
  ]);
  const [wizError, setWizError] = useState('');

  const handleLogin = () => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!isOfficeRegistered) {
      setErrorMessage(
        'Primero registra tu oficina y crea las credenciales de acceso para habilitar el sistema.'
      );
      return;
    }

    if (!cleanUser || !cleanPass) {
      setErrorMessage('Ingresa tu usuario y contraseña.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setSavedNotice('');

    setTimeout(() => {
      setIsLoading(false);
      const allUsers = localStore.getUsers();
      const matchedUser = allUsers.find(
        (u) =>
          (u.username || '').toLowerCase() === cleanUser ||
          (u.email || '').toLowerCase() === cleanUser
      );

      const storedPassword = matchedUser?.password?.trim() || '';
      if (
        !matchedUser ||
        !storedPassword ||
        FORBIDDEN_DEFAULT_PASSWORDS.has(cleanPass.toLowerCase()) ||
        !verifyPassword(cleanPass, storedPassword)
      ) {
        setErrorMessage('Credenciales incorrectas. Verifica tu usuario y contraseña.');
        return;
      }

      if (rememberPassword) {
        safeStorage.setItem(
          '@prestamos_remembered_credentials',
          JSON.stringify({ username: cleanUser, password: cleanPass })
        );
      } else {
        safeStorage.removeItem('@prestamos_remembered_credentials');
      }

      // El sistema identifica automáticamente si es Administrador o a qué Ruta pertenece el cobrador
      onLoginSuccess(matchedUser, rememberPassword);
    }, 120);
  };

  const handleVerifyCurrentPassword = () => {
    if (!wizCurrentAdminPassword.trim()) {
      setWizError('Ingresa la clave actual del Administrador para desbloquear la edición.');
      return;
    }
    const isValid = localStore.verifyAdminPassword(wizCurrentAdminPassword);
    if (!isValid) {
      setWizError('Clave actual incorrecta. La edición permanece bloqueada.');
      setIsSetupUnlocked(false);
      return;
    }
    setIsSetupUnlocked(true);
    setWizError('');
  };

  const handleCurrentPasswordChange = (text: string) => {
    setWizCurrentAdminPassword(text);
    if (text.length >= 6 && localStore.verifyAdminPassword(text)) {
      setIsSetupUnlocked(true);
      setWizError('');
    } else if (isSetupUnlocked && !localStore.verifyAdminPassword(text)) {
      setIsSetupUnlocked(false);
    }
  };

  const resetWizardToBlank = () => {
    if (isOfficeRegistered && !isSetupUnlocked) {
      setWizError('Ingresa la clave actual del Administrador para autorizar cambios.');
      return;
    }
    setWizCurrentAdminPassword('');
    setWizCompanyName('');
    setWizAdminUsername('');
    setWizAdminPassword('');
    setWizRoutesCount(1);
    setWizRoutesDraft([{ name: '', username: '', password: '', targetAdministrativeStr: '', expectedCustomersCountStr: '' }]);
    setWizError('');
  };

  const openSetupModal = () => {
    const cfg = localStore.getOfficeConfig();

    // Si la oficina aún NO ha sido registrada por el usuario, abrir 100% en blanco
    // para que el dueño escriba el nombre de su oficina y cree sus credenciales desde cero.
    if (!cfg.isSetupCompleted || !cfg.companyName?.trim()) {
      resetWizardToBlank();
      setIsSetupUnlocked(true);
      setSetupVisible(true);
      return;
    }

    // Si ya había registrado su oficina previamente, verificar si tiene clave válida
    const currentUsers = localStore.getUsers();
    const currentRoutes = localStore.getRoutes();
    const existingAdmin = currentUsers.find(
      (u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'
    );
    const hasAdminPassword = Boolean(existingAdmin?.password?.trim());
    setIsSetupUnlocked(!hasAdminPassword); // Si es v1 residual sin clave, auto-desbloquear

    const adminUserStr = (existingAdmin?.username || '').toLowerCase();
    setWizCurrentAdminPassword('');
    setWizCompanyName(cfg.companyName || '');
    setWizAdminUsername(adminUserStr);
    setWizAdminPassword('');

    const count = Math.max(1, currentRoutes.length || 1);
    setWizRoutesCount(count);

    const seenUsers = new Set<string>(adminUserStr ? [adminUserStr] : []);
    const drafts: EditableRouteDraft[] = [];

    for (let i = 0; i < count; i++) {
      const r = currentRoutes[i];
      const col = r
        ? currentUsers.find((u) => u.id === r.collectorId || u.routeId === r.id)
        : undefined;

      let candidateUser = (col?.username || '').toLowerCase();
      if (candidateUser && seenUsers.has(candidateUser)) {
        candidateUser = '';
      }
      if (candidateUser) {
        seenUsers.add(candidateUser);
      }

      drafts.push({
        id: r?.id,
        name: r?.name || '',
        username: candidateUser,
        password: '',
        targetAdministrativeStr: r?.targetAdministrative ? String(r.targetAdministrative) : '',
        expectedCustomersCountStr: r?.expectedCustomersCount ? String(r.expectedCustomersCount) : '',
      });
    }

    setWizRoutesDraft(drafts);
    setWizError('');
    setSetupVisible(true);
  };

  const handleFactoryReset = () => {
    const doReset = async () => {
      await localStore.factoryResetAll();
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.clear();
        }
      } catch {}
      if (onDataReset) onDataReset();
      setSavedNotice('Almacenamiento reiniciado correctamente. Ahora puedes registrar tu oficina.');
      setErrorMessage('');
      resetWizardToBlank();
      setIsSetupUnlocked(true);
      setSetupVisible(true);
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && window.confirm(
        '¿Deseas restablecer el sistema completo para iniciar una oficina desde cero?'
      );
      if (confirmed) {
        doReset();
      }
    } else {
      Alert.alert(
        'Iniciar Oficina desde Cero',
        '¿Deseas restablecer todo el almacenamiento para registrar una nueva oficina y crear credenciales desde cero?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sí, Restablecer Todo',
            style: 'destructive',
            onPress: doReset,
          },
        ]
      );
    }
  };

  const changeRoutesCount = (newCount: number) => {
    if (isOfficeRegistered && !isSetupUnlocked) {
      setWizError('Debes ingresar la clave actual del Administrador para modificar las rutas.');
      return;
    }
    const clamped = Math.max(1, Math.min(15, newCount));
    setWizRoutesCount(clamped);
    setWizRoutesDraft((prev) => {
      const next = [...prev];
      while (next.length < clamped) {
        next.push({
          name: '',
          username: '',
          password: '',
          targetAdministrativeStr: '',
          expectedCustomersCountStr: '',
        });
      }
      return next.slice(0, clamped);
    });
    setWizError('');
  };

  const updateRouteDraft = (idx: number, field: keyof EditableRouteDraft, val: string) => {
    if (isOfficeRegistered && !isSetupUnlocked) {
      setWizError('Debes ingresar la clave actual del Administrador para realizar cambios.');
      return;
    }
    setWizRoutesDraft((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: val } : item))
    );
    setWizError('');
  };

  const handleSaveSetup = async (enterDirectlyAsAdmin: boolean) => {
    try {
      if (isOfficeRegistered && !isSetupUnlocked) {
        setWizError('Debes ingresar la clave actual del Administrador para autorizar cambios.');
        return;
      }
      if (!wizCompanyName.trim()) {
        setWizError('Escribe el nombre de tu oficina.');
        return;
      }
      if (isOfficeRegistered && !wizCurrentAdminPassword.trim()) {
        setWizError('Ingresa la clave actual del Administrador para autorizar cambios.');
        return;
      }
      if (!wizAdminUsername.trim() || !wizAdminPassword.trim()) {
        setWizError('Crea el usuario y la nueva clave para el Administrador.');
        return;
      }
      if (
        wizAdminPassword.trim().length < 6 ||
        FORBIDDEN_DEFAULT_PASSWORDS.has(wizAdminPassword.trim().toLowerCase())
      ) {
        setWizError(
          'La clave del Administrador debe tener mínimo 6 caracteres y no usar valores predeterminados.'
        );
        return;
      }

      for (let i = 0; i < wizRoutesDraft.length; i++) {
        const rt = wizRoutesDraft[i];
        if (!rt.username.trim() || !rt.password.trim()) {
          setWizError(`Define el usuario y clave (mín. 6 caracteres) para la Ruta ${i + 1}.`);
          return;
        }
        if (
          rt.password.trim().length < 6 ||
          FORBIDDEN_DEFAULT_PASSWORDS.has(rt.password.trim().toLowerCase())
        ) {
          setWizError(
            `La clave de la Ruta ${i + 1} debe tener al menos 6 caracteres y no usar valores predeterminados.`
          );
          return;
        }
      }

      const result = await localStore.setupOfficeAndRoutes({
        companyName: wizCompanyName.trim(),
        adminName: 'Administración General',
        adminUsername: wizAdminUsername.trim().toLowerCase(),
        adminPassword: wizAdminPassword.trim(),
        currentAdminPassword: isOfficeRegistered ? wizCurrentAdminPassword.trim() : undefined,
        cleanCustomersData: true, // La cartera de la oficina siempre inicia limpia en $0 lista para registrar clientes
        routesConfig: wizRoutesDraft.map((d, i) => {
          const cleanName = d.name.trim() || `Ruta ${i + 1}`;
          const targetAdmin = parseInt(d.targetAdministrativeStr?.replace(/\D/g, '') || '0', 10);
          const expectedCust = parseInt(d.expectedCustomersCountStr?.replace(/\D/g, '') || '0', 10);
          return {
            id: d.id,
            name: cleanName,
            collectorName: cleanName,
            username: d.username.trim().toLowerCase(),
            password: d.password.trim(),
            targetAdministrative: targetAdmin,
            expectedCustomersCount: expectedCust,
          };
        }),
      });

      if (onDataReset) onDataReset();
      setSetupVisible(false);

      // Pre-llenar credenciales del Administrador recién configurado con recordar activo
      const cleanAdminUser = wizAdminUsername.trim().toLowerCase();
      const cleanAdminPass = wizAdminPassword.trim();
      setUsername(cleanAdminUser);
      setPassword(cleanAdminPass);
      setRememberPassword(true);
      await safeStorage.setItem(
        '@prestamos_remembered_credentials',
        JSON.stringify({ username: cleanAdminUser, password: cleanAdminPass })
      );

      if (enterDirectlyAsAdmin) {
        onLoginSuccess(result.adminUser, true);
      } else {
        setSavedNotice(
          `Oficina "${wizCompanyName.trim()}" y ${result.createdRoutes.length} ruta(s) configuradas exitosamente. Puedes iniciar sesión con las credenciales creadas.`
        );
        setErrorMessage('');
      }
    } catch (err: any) {
      setWizError(err?.message || 'Error al guardar la configuración.');
    }
  };

  const isFormEditable = !isOfficeRegistered || isSetupUnlocked;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centerContent}>
          {/* Identidad Visual Unificada: Azul Tinta (#12263F) + Ocre (#C9892B) */}
          <View style={styles.header}>
            <View style={styles.brandEmblem}>
              <Text style={styles.brandEmblemLetter}>K</Text>
              <View style={styles.brandEmblemDot}>
                <ShieldCheck size={11} color="#FFFFFF" />
              </View>
            </View>
            <Text style={styles.appBrandName}>Kredia</Text>
            <Text style={styles.appTagline}>Gestión de Cartera y Cobro en Ruta</Text>

            {isOfficeRegistered ? (
              <View style={styles.activeOfficeBadge}>
                <Building2 size={12} color={COLORS.primary} style={{ marginRight: 5 }} />
                <Text style={styles.activeOfficeBadgeText} numberOfLines={1}>
                  {officeConfig.companyName}
                </Text>
              </View>
            ) : (
              <View style={styles.unconfiguredNoticeBadge}>
                <AlertTriangle size={12} color={COLORS.warning} style={{ marginRight: 5 }} />
                <Text style={styles.unconfiguredNoticeText}>
                  Oficina pendiente de configuración inicial
                </Text>
              </View>
            )}
          </View>

          {/* Tarjeta Blanca de Acceso */}
          <View style={styles.card}>
            {savedNotice ? (
              <View style={styles.successBox}>
                <CheckCircle2 size={14} color={COLORS.success} />
                <Text style={styles.successText}>{savedNotice}</Text>
              </View>
            ) : null}

            {errorMessage ? (
              <View style={styles.errorBox}>
                <AlertTriangle size={14} color={COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Usuario de Ruta o Administración</Text>
              <View style={styles.inputWrapper}>
                <UserIcon size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={username}
                  onChangeText={(v) => {
                    setUsername(v);
                    setErrorMessage('');
                  }}
                  placeholder="Ingresa tu usuario asignado"
                  placeholderTextColor={COLORS.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contraseña</Text>
              <View style={styles.inputWrapper}>
                <Lock size={16} color={COLORS.textSecondary} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setErrorMessage('');
                  }}
                  placeholder="Ingresa tu contraseña"
                  placeholderTextColor={COLORS.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={COLORS.textSecondary} />
                  ) : (
                    <Eye size={16} color={COLORS.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Casilla Recordar Contraseña */}
            <TouchableOpacity
              style={styles.rememberRow}
              activeOpacity={0.7}
              onPress={() => setRememberPassword(!rememberPassword)}
            >
              <View style={[styles.checkbox, rememberPassword && styles.checkboxActive]}>
                {rememberPassword && <CheckCircle2 size={13} color="#2563EB" />}
              </View>
              <Text style={styles.rememberText}>Recordar contraseña en este dispositivo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
              activeOpacity={0.85}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading && (
                <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
              )}
              <Text style={styles.submitBtnText}>Iniciar Jornada</Text>
            </TouchableOpacity>

            {/* Botón de Acceso Rápido Administrador */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#EFF6FF',
                borderColor: '#BFDBFE',
                borderWidth: 1,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                marginTop: 10,
              }}
              activeOpacity={0.8}
              onPress={() => {
                setUsername('admin');
                setPassword('123456');
                setTimeout(() => {
                  const allUsers = localStore.getUsers();
                  const admin = allUsers.find((u) => u.username === 'admin');
                  if (admin) onLoginSuccess(admin, true);
                  else handleLogin();
                }, 50);
              }}
            >
              <ShieldCheck size={15} color="#2563EB" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#1D4ED8', fontFamily: FONT_FAMILY }}>
                ⚡ Entrar como Administrador (Inversiones FBV)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Botón para Registrar o Configurar Oficina y Credenciales */}
          <TouchableOpacity
            style={[
              styles.setupPill,
              !isOfficeRegistered && styles.setupPillHighlight,
            ]}
            activeOpacity={0.75}
            onPress={openSetupModal}
          >
            <SlidersHorizontal
              size={14}
              color={!isOfficeRegistered ? COLORS.accent : COLORS.primary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.setupPillText,
                !isOfficeRegistered && { color: COLORS.primary, fontWeight: '800' },
              ]}
            >
              {isOfficeRegistered
                ? 'Configurar oficina y rutas (Requiere clave Admin)'
                : 'Registrar mi oficina y crear credenciales'}
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: 22, alignItems: 'center', paddingBottom: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#F1F5F9',
                paddingVertical: 5,
                paddingHorizontal: 14,
                borderRadius: 20,
              }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: '#10B981',
                  marginRight: 6,
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: '#334155',
                  fontFamily: FONT_FAMILY,
                }}
              >
                Kredia v1.2.1 • Compilación 5 (Sistema al Día)
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal de Configuración de Oficina y Credenciales */}
      <Modal
        visible={setupVisible}
        animationType="fade"
        transparent
        statusBarTranslucent={false}
        onRequestClose={() => setSetupVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[
            styles.modalOverlay,
            {
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconCircle}>
                  <Building2 size={16} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Configurar Oficina y Rutas</Text>
                  <Text style={styles.modalSubtitle}>
                    Claves personales seguras (mínimo 6 caracteres)
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={resetWizardToBlank}
                  disabled={!isFormEditable}
                  style={[styles.clearBtn, !isFormEditable && { opacity: 0.35 }]}
                >
                  <RotateCcw size={12} color={COLORS.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={styles.clearBtnText}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSetupVisible(false)}
                  style={styles.closeBtn}
                >
                  <X size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{ paddingBottom: 12, gap: 10 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {wizError ? (
                <View style={styles.errorBox}>
                  <AlertTriangle size={14} color={COLORS.danger} style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{wizError}</Text>
                </View>
              ) : null}

              {isOfficeRegistered && (
                <View
                  style={[
                    styles.authVerifyBox,
                    isSetupUnlocked && styles.authVerifyBoxUnlocked,
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text
                      style={[
                        styles.authVerifyTitle,
                        { marginBottom: 0 },
                        isSetupUnlocked && { color: COLORS.success },
                      ]}
                    >
                      {isSetupUnlocked
                        ? '✓ Administrador Autorizado'
                        : '🔒 Autorización de Administrador Requerida'}
                    </Text>
                    <View
                      style={[
                        styles.lockStatusBadge,
                        isSetupUnlocked ? styles.lockStatusBadgeUnlocked : styles.lockStatusBadgeLocked,
                      ]}
                    >
                      <Text
                        style={[
                          styles.lockStatusBadgeText,
                          isSetupUnlocked ? styles.lockStatusBadgeTextUnlocked : styles.lockStatusBadgeTextLocked,
                        ]}
                      >
                        {isSetupUnlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.fieldCaption}>
                    {isSetupUnlocked
                      ? 'Clave confirmada. Edición habilitada para modificar datos y rutas.'
                      : 'Ingresa la clave actual del Administrador para desbloquear la edición:'}
                  </Text>

                  {!isSetupUnlocked ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <TextInput
                        style={[styles.compactInput, { flex: 1 }]}
                        value={wizCurrentAdminPassword}
                        onChangeText={handleCurrentPasswordChange}
                        onSubmitEditing={handleVerifyCurrentPassword}
                        placeholder="Ingresa clave actual"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={styles.verifyBtn}
                        activeOpacity={0.8}
                        onPress={handleVerifyCurrentPassword}
                      >
                        <ShieldCheck size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                        <Text style={styles.verifyBtnText}>Desbloquear</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              )}

              {/* 1. Tarjeta de Oficina y Administrador */}
              <View style={[styles.adminBox, !isFormEditable && styles.boxLocked]}>
                <View style={styles.sectionBadgeRow}>
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>1. DATOS DE TU OFICINA Y ADMIN</Text>
                  </View>
                  {!isFormEditable && (
                    <View style={styles.miniLockTag}>
                      <Lock size={10} color="#64748B" style={{ marginRight: 3 }} />
                      <Text style={styles.miniLockTagText}>Bloqueado</Text>
                    </View>
                  )}
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.fieldCaption}>Nombre de la Oficina</Text>
                  <TextInput
                    style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                    value={wizCompanyName}
                    onChangeText={setWizCompanyName}
                    placeholder="Escribe el nombre de tu oficina"
                    placeholderTextColor={COLORS.textMuted}
                    editable={isFormEditable}
                  />
                </View>

                <View style={styles.twoColRow}>
                  <View style={styles.colItem}>
                    <Text style={styles.fieldCaption}>Usuario Administrador</Text>
                    <TextInput
                      style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                      value={wizAdminUsername}
                      onChangeText={setWizAdminUsername}
                      placeholder="Crea tu usuario"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                      editable={isFormEditable}
                    />
                  </View>
                  <View style={styles.colItem}>
                    <Text style={styles.fieldCaption}>Clave Admin (mín. 6)</Text>
                    <TextInput
                      style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                      value={wizAdminPassword}
                      onChangeText={setWizAdminPassword}
                      placeholder="Mín. 6 caracteres"
                      placeholderTextColor={COLORS.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      editable={isFormEditable}
                    />
                  </View>
                </View>
              </View>

              {/* 2. Selector de Cantidad de Rutas */}
              <View style={[styles.routesHeaderBar, !isFormEditable && { opacity: 0.6 }]}>
                <View style={styles.routesHeaderLeft}>
                  <RouteIcon size={15} color={COLORS.primary} />
                  <Text style={styles.routesHeaderTitle}>2. ¿Cuántas rutas tendrá la oficina?</Text>
                </View>

                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    style={[styles.stepBtn, !isFormEditable && { opacity: 0.35 }]}
                    disabled={!isFormEditable}
                    onPress={() => changeRoutesCount(wizRoutesCount - 1)}
                  >
                    <Minus size={13} color={COLORS.primary} />
                  </TouchableOpacity>
                  <Text style={styles.stepCountText}>{wizRoutesCount}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, !isFormEditable && { opacity: 0.35 }]}
                    disabled={!isFormEditable}
                    onPress={() => changeRoutesCount(wizRoutesCount + 1)}
                  >
                    <Plus size={13} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3. Tarjetas por Ruta */}
              {wizRoutesDraft.map((rt, idx) => (
                <View key={idx} style={[styles.routeCard, !isFormEditable && styles.boxLocked]}>
                  <View style={styles.routeTopLine}>
                    <View style={[styles.routeNumBadge, !isFormEditable && { backgroundColor: '#64748B' }]}>
                      <Text style={styles.routeNumBadgeText}>RUTA {idx + 1}</Text>
                    </View>
                    <View style={styles.colItem}>
                      <TextInput
                        style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                        value={rt.name}
                        onChangeText={(v) => updateRouteDraft(idx, 'name', v)}
                        placeholder={`Nombre de la Ruta ${idx + 1} (opcional)`}
                        placeholderTextColor={COLORS.textMuted}
                        editable={isFormEditable}
                      />
                    </View>
                  </View>

                  <View style={styles.twoColRow}>
                    <View style={styles.colItem}>
                      <Text style={styles.fieldCaption}>Usuario Cobrador</Text>
                      <TextInput
                        style={[styles.compactInput, styles.inkInputText, !isFormEditable && styles.inputLocked]}
                        value={rt.username}
                        onChangeText={(v) => updateRouteDraft(idx, 'username', v)}
                        placeholder={`Usuario ruta ${idx + 1}`}
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                        editable={isFormEditable}
                      />
                    </View>
                    <View style={styles.colItem}>
                      <Text style={styles.fieldCaption}>Clave (mín. 6)</Text>
                      <TextInput
                        style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                        value={rt.password}
                        onChangeText={(v) => updateRouteDraft(idx, 'password', v)}
                        placeholder="Mín. 6 caracteres"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        autoCapitalize="none"
                        editable={isFormEditable}
                      />
                    </View>
                  </View>

                  <View style={[styles.twoColRow, { marginTop: 6 }]}>
                    <View style={styles.colItem}>
                      <Text style={styles.fieldCaption}>Dinero Total de la Ruta ($)</Text>
                      <TextInput
                        style={[styles.compactInput, !isFormEditable && styles.inputLocked]}
                        value={rt.targetAdministrativeStr ? (parseInt(rt.targetAdministrativeStr.replace(/\D/g, ''), 10) || 0).toLocaleString('es-CO') : ''}
                        onChangeText={(v) => updateRouteDraft(idx, 'targetAdministrativeStr', v.replace(/\D/g, ''))}
                        placeholder="ej: 20.000.000"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                        editable={isFormEditable}
                      />
                    </View>
                  </View>
                  <Text style={{ fontSize: 10, color: '#0F766E', marginTop: 3, fontStyle: 'italic' }}>
                    💡 Base disponible = Dinero Total de la ruta - Cartera en calle de los clientes que pases uno a uno.
                  </Text>
                </View>
              ))}



              {!isFormEditable && (
                <View style={styles.lockedNoticeBanner}>
                  <Lock size={13} color="#991B1B" style={{ marginRight: 6 }} />
                  <Text style={styles.lockedNoticeText}>
                    Formulario bloqueado. Ingresa la clave actual del Administrador arriba para autorizar cambios.
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.secondarySaveBtn, !isFormEditable && { opacity: 0.35 }]}
                disabled={!isFormEditable}
                onPress={() => handleSaveSetup(false)}
              >
                <Text style={styles.secondarySaveBtnText}>Guardar credenciales</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primarySaveBtn,
                  !isFormEditable && { opacity: 0.35, backgroundColor: '#94A3B8' },
                ]}
                disabled={!isFormEditable}
                onPress={() => handleSaveSetup(true)}
              >
                <Text style={styles.primarySaveBtnText}>Guardar y Entrar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 16,
  },
  centerContent: {
    paddingHorizontal: 22,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  brandEmblem: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  brandEmblemLetter: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandEmblemDot: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    borderWidth: 2,
    borderColor: COLORS.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBrandName: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  appTagline: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  activeOfficeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: '90%',
  },
  activeOfficeBadgeText: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
  },
  unconfiguredNoticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.warningLight,
    borderWidth: 1,
    borderColor: COLORS.warningBorder,
  },
  unconfiguredNoticeText: {
    color: COLORS.warning,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  successText: {
    color: COLORS.success,
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 14.5,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 8,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  rememberText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
  },
  setupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  setupPillHighlight: {
    borderColor: COLORS.accentBorder,
    backgroundColor: COLORS.accentLight,
  },
  setupPillText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlayBackdrop,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalSheet: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 22,
    maxHeight: '90%',
    flexShrink: 1,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: COLORS.surfaceSoft,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '500',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  clearBtnText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 14,
  },
  authVerifyBox: {
    backgroundColor: COLORS.accentLight,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: COLORS.accentBorder,
  },
  authVerifyBoxUnlocked: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  authVerifyTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  lockStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  lockStatusBadgeLocked: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  lockStatusBadgeUnlocked: {
    backgroundColor: '#DCFCE7',
    borderColor: '#BBF7D0',
  },
  lockStatusBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  lockStatusBadgeTextLocked: {
    color: '#DC2626',
  },
  lockStatusBadgeTextUnlocked: {
    color: '#166534',
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 9,
    justifyContent: 'center',
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
  },
  boxLocked: {
    opacity: 0.75,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  miniLockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniLockTagText: {
    fontFamily: FONT_FAMILY,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  inputLocked: {
    backgroundColor: '#F1F5F9',
    color: '#64748B',
    borderColor: '#E2E8F0',
  },
  lockedNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 4,
  },
  lockedNoticeText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  adminBox: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminBadge: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primaryBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fieldCaption: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  compactInput: {
    width: '100%',
    minWidth: 0,
    height: 40,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    paddingHorizontal: 10,
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
  },
  inkInputText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colItem: {
    flex: 1,
    minWidth: 0,
  },
  routesHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },
  routesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routesHeaderTitle: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.accentBorder,
  },
  stepBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: COLORS.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCountText: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  routeCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  routeTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeNumBadge: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeNumBadgeText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    fontWeight: '800',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceSoft,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  secondarySaveBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySaveBtnText: {
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '700',
  },
  primarySaveBtn: {
    flex: 1.2,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySaveBtnText: {
    color: '#FFFFFF',
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    fontWeight: '800',
  },
  factoryResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  factoryResetText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    color: COLORS.textMuted,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
