import React, { useState } from 'react';
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
} from 'react-native';
import { User, Route } from '../../../core/domain/types';
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
  username: string;
  password: string;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onDataReset,
}) => {
  const officeConfig = localStore.getOfficeConfig();
  const isOfficeRegistered = Boolean(
    officeConfig.isSetupCompleted && officeConfig.companyName?.trim()
  );

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modal de Registro / Configuración de Oficina y Credenciales
  const [setupVisible, setSetupVisible] = useState(false);
  const [wizCompanyName, setWizCompanyName] = useState('');
  const [wizAdminUsername, setWizAdminUsername] = useState('');
  const [wizAdminPassword, setWizAdminPassword] = useState('');
  const [wizRoutesCount, setWizRoutesCount] = useState<number>(1);
  const [wizRoutesDraft, setWizRoutesDraft] = useState<EditableRouteDraft[]>([
    { name: '', username: '', password: '' },
  ]);
  const [wizError, setWizError] = useState('');

  const handleLogin = () => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

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

      if (!matchedUser || cleanPass !== (matchedUser.password || '123')) {
        setErrorMessage('Credenciales incorrectas. Verifica tu usuario y clave.');
        return;
      }

      // El sistema identifica automáticamente si es Administrador o a qué Ruta pertenece el cobrador
      onLoginSuccess(matchedUser, true);
    }, 120);
  };

  const resetWizardToBlank = () => {
    setWizCompanyName('');
    setWizAdminUsername('');
    setWizAdminPassword('');
    setWizRoutesCount(1);
    setWizRoutesDraft([{ name: '', username: '', password: '' }]);
    setWizError('');
  };

  const openSetupModal = () => {
    const cfg = localStore.getOfficeConfig();

    // Si la oficina aún NO ha sido registrada por el usuario, abrir 100% en blanco
    // para que el dueño escriba el nombre de su oficina y cree sus credenciales desde cero.
    if (!cfg.isSetupCompleted || !cfg.companyName?.trim()) {
      resetWizardToBlank();
      setSetupVisible(true);
      return;
    }

    // Si ya había registrado su oficina previamente, cargar sus datos actuales
    const currentUsers = localStore.getUsers();
    const currentRoutes = localStore.getRoutes();
    const existingAdmin = currentUsers.find(
      (u) => u.role === 'ADMIN' || u.role === 'SUPER_ADMIN'
    );

    const adminUserStr = (existingAdmin?.username || '').toLowerCase();
    setWizCompanyName(cfg.companyName || '');
    setWizAdminUsername(adminUserStr);
    setWizAdminPassword(existingAdmin?.password || '');

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
        password: col?.password || '',
      });
    }

    setWizRoutesDraft(drafts);
    setWizError('');
    setSetupVisible(true);
  };

  const changeRoutesCount = (newCount: number) => {
    const clamped = Math.max(1, Math.min(15, newCount));
    setWizRoutesCount(clamped);
    setWizRoutesDraft((prev) => {
      const next = [...prev];
      while (next.length < clamped) {
        next.push({
          name: '',
          username: '',
          password: '',
        });
      }
      return next.slice(0, clamped);
    });
    setWizError('');
  };

  const updateRouteDraft = (idx: number, field: keyof EditableRouteDraft, val: string) => {
    setWizRoutesDraft((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: val } : item))
    );
    setWizError('');
  };

  const handleSaveSetup = async (enterDirectlyAsAdmin: boolean) => {
    try {
      if (!wizCompanyName.trim()) {
        setWizError('Escribe el nombre de tu oficina.');
        return;
      }
      if (!wizAdminUsername.trim() || !wizAdminPassword.trim()) {
        setWizError('Crea el usuario y la clave para el Administrador.');
        return;
      }

      for (let i = 0; i < wizRoutesDraft.length; i++) {
        const rt = wizRoutesDraft[i];
        if (!rt.username.trim() || !rt.password.trim()) {
          setWizError(`Define el usuario y clave para la Ruta ${i + 1}.`);
          return;
        }
      }

      const result = await localStore.setupOfficeAndRoutes({
        companyName: wizCompanyName.trim(),
        adminName: 'Administración General',
        adminUsername: wizAdminUsername.trim().toLowerCase(),
        adminPassword: wizAdminPassword.trim(),
        routesConfig: wizRoutesDraft.map((d, i) => {
          const cleanName = d.name.trim() || `Ruta ${i + 1}`;
          return {
            id: d.id,
            name: cleanName,
            collectorName: cleanName,
            username: d.username.trim().toLowerCase(),
            password: d.password.trim(),
          };
        }),
      });

      if (onDataReset) onDataReset();
      setSetupVisible(false);

      if (enterDirectlyAsAdmin) {
        onLoginSuccess(result.adminUser, true);
      } else {
        setSavedNotice(
          `Oficina "${wizCompanyName.trim()}" y ${result.createdRoutes.length} ruta(s) configuradas.`
        );
        setErrorMessage('');
      }
    } catch (err: any) {
      setWizError(err?.message || 'Error al guardar la configuración.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.centerContent}>
        {/* Identidad Propia de la Aplicación: Kredia */}
        <View style={styles.header}>
          <View style={styles.brandEmblem}>
            <Text style={styles.brandEmblemLetter}>K</Text>
            <View style={styles.brandEmblemDot}>
              <ShieldCheck size={11} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.appBrandName}>Kredia</Text>
          <Text style={styles.appTagline}>Sistema de Gestión de Cartera y Rutas</Text>

          {isOfficeRegistered && (
            <View style={styles.activeOfficeBadge}>
              <Building2 size={11} color="#0F766E" style={{ marginRight: 5 }} />
              <Text style={styles.activeOfficeBadgeText} numberOfLines={1}>
                {officeConfig.companyName}
              </Text>
            </View>
          )}
        </View>

        {/* Tarjeta Blanca Fintech: Solo Usuario y Contraseña */}
        <View style={styles.card}>
          {savedNotice ? (
            <View style={styles.successBox}>
              <CheckCircle2 size={14} color="#059669" />
              <Text style={styles.successText}>{savedNotice}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Usuario</Text>
            <View style={styles.inputWrapper}>
              <UserIcon size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={username}
                onChangeText={(v) => {
                  setUsername(v);
                  setErrorMessage('');
                }}
                placeholder="Ingresa tu usuario"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Contraseña</Text>
            <View style={styles.inputWrapper}>
              <Lock size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setErrorMessage('');
                }}
                placeholder="Ingresa tu contraseña"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                {showPassword ? (
                  <EyeOff size={16} color="#64748B" />
                ) : (
                  <Eye size={16} color="#64748B" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
            activeOpacity={0.85}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading && (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
            )}
            <Text style={styles.submitBtnText}>Ingresar</Text>
          </TouchableOpacity>
        </View>

        {/* Botón Ligero para Registrar o Configurar Oficina y Credenciales */}
        <TouchableOpacity
          style={styles.setupPill}
          activeOpacity={0.75}
          onPress={openSetupModal}
        >
          <SlidersHorizontal size={13} color="#0D9488" style={{ marginRight: 6 }} />
          <Text style={styles.setupPillText}>
            {isOfficeRegistered
              ? 'Configurar oficina y credenciales'
              : 'Registrar mi oficina y crear credenciales'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal Fintech Claro: Creación / Configuración de Oficina y Credenciales */}
      <Modal visible={setupVisible} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            {/* Encabezado Claro */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.modalIconCircle}>
                  <Building2 size={16} color="#0D9488" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Configurar Oficina y Rutas</Text>
                  <Text style={styles.modalSubtitle}>
                    Crea las credenciales de tu oficina y de cada ruta
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={resetWizardToBlank}
                  style={styles.clearBtn}
                >
                  <RotateCcw size={12} color="#64748B" style={{ marginRight: 4 }} />
                  <Text style={styles.clearBtnText}>Limpiar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSetupVisible(false)}
                  style={styles.closeBtn}
                >
                  <X size={16} color="#64748B" />
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
                  <Text style={styles.errorText}>{wizError}</Text>
                </View>
              ) : null}

              {/* 1. Tarjeta de Oficina y Administrador */}
              <View style={styles.adminBox}>
                <View style={styles.sectionBadgeRow}>
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>1. DATOS DE TU OFICINA Y ADMIN</Text>
                  </View>
                </View>

                <View style={{ marginBottom: 8 }}>
                  <Text style={styles.fieldCaption}>Nombre de la Oficina</Text>
                  <TextInput
                    style={styles.compactInput}
                    value={wizCompanyName}
                    onChangeText={setWizCompanyName}
                    placeholder="Escribe el nombre de tu oficina"
                    placeholderTextColor="#94A3B8"
                  />
                </View>

                <View style={styles.twoColRow}>
                  <View style={styles.colItem}>
                    <Text style={styles.fieldCaption}>Usuario Administrador</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={wizAdminUsername}
                      onChangeText={setWizAdminUsername}
                      placeholder="Crea tu usuario"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.colItem}>
                    <Text style={styles.fieldCaption}>Clave Administrador</Text>
                    <TextInput
                      style={styles.compactInput}
                      value={wizAdminPassword}
                      onChangeText={setWizAdminPassword}
                      placeholder="Crea tu clave"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              {/* 2. Selector Ligero de Cantidad de Rutas */}
              <View style={styles.routesHeaderBar}>
                <View style={styles.routesHeaderLeft}>
                  <RouteIcon size={15} color="#0D9488" />
                  <Text style={styles.routesHeaderTitle}>2. ¿Cuántas rutas tendrá la oficina?</Text>
                </View>

                <View style={styles.stepperBox}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => changeRoutesCount(wizRoutesCount - 1)}
                  >
                    <Minus size={13} color="#0D9488" />
                  </TouchableOpacity>
                  <Text style={styles.stepCountText}>{wizRoutesCount}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => changeRoutesCount(wizRoutesCount + 1)}
                  >
                    <Plus size={13} color="#0D9488" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 3. Tarjetas Ligeras por Ruta (campos limpios para que la oficina los configure a su gusto) */}
              {wizRoutesDraft.map((rt, idx) => (
                <View key={idx} style={styles.routeCard}>
                  <View style={styles.routeTopLine}>
                    <View style={styles.routeNumBadge}>
                      <Text style={styles.routeNumBadgeText}>RUTA {idx + 1}</Text>
                    </View>
                    <View style={styles.colItem}>
                      <TextInput
                        style={styles.compactInput}
                        value={rt.name}
                        onChangeText={(v) => updateRouteDraft(idx, 'name', v)}
                        placeholder={`Nombre de la Ruta ${idx + 1} (opcional)`}
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  </View>

                  <View style={styles.twoColRow}>
                    <View style={styles.colItem}>
                      <Text style={styles.fieldCaption}>Usuario Cobrador</Text>
                      <TextInput
                        style={[styles.compactInput, styles.tealInputText]}
                        value={rt.username}
                        onChangeText={(v) => updateRouteDraft(idx, 'username', v)}
                        placeholder={`Crea usuario ruta ${idx + 1}`}
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={styles.colItem}>
                      <Text style={styles.fieldCaption}>Clave de Acceso</Text>
                      <TextInput
                        style={styles.compactInput}
                        value={rt.password}
                        onChangeText={(v) => updateRouteDraft(idx, 'password', v)}
                        placeholder="Crea su clave"
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            {/* Pie del Modal con Doble Acción Clara */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.secondarySaveBtn}
                onPress={() => handleSaveSetup(false)}
              >
                <Text style={styles.secondarySaveBtnText}>Guardar credenciales</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primarySaveBtn}
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
    backgroundColor: '#F3F7FA',
    justifyContent: 'center',
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
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  brandEmblemLetter: {
    color: '#FFFFFF',
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
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#F3F7FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBrandName: {
    color: '#0F172A',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  appTagline: {
    color: '#64748B',
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
    backgroundColor: '#E6F7F5',
    borderWidth: 1,
    borderColor: '#99F6E4',
    maxWidth: '90%',
  },
  activeOfficeBadgeText: {
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 2,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  successText: {
    color: '#065F46',
    fontSize: 11.5,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 13,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '500',
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: '#0D9488',
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  setupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  setupPillText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    backgroundColor: '#E6F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '500',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearBtnText: {
    color: '#475569',
    fontSize: 10.5,
    fontWeight: '700',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 14,
  },
  adminBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  adminBadge: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    color: '#4F46E5',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  fieldCaption: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  compactInput: {
    width: '100%',
    minWidth: 0,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 10,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '600',
  },
  tealInputText: {
    color: '#0F766E',
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
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  routesHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routesHeaderTitle: {
    color: '#0F766E',
    fontSize: 12,
    fontWeight: '800',
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  stepBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#E6F7F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCountText: {
    color: '#0F766E',
    fontSize: 14,
    fontWeight: '800',
    minWidth: 18,
    textAlign: 'center',
  },
  routeCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  routeTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeNumBadge: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#E6F7F5',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeNumBadgeText: {
    color: '#0D9488',
    fontSize: 10.5,
    fontWeight: '800',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  secondarySaveBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySaveBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  primarySaveBtn: {
    flex: 1.2,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primarySaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
});
