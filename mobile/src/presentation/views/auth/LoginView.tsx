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
  Alert,
} from 'react-native';
import { User, Route } from '../../../core/domain/types';
import {
  ShieldCheck,
  Lock,
  User as UserIcon,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Building2,
  Bike,
  Sparkles,
  Trash2,
} from 'lucide-react-native';
import { localStore } from '../../../infrastructure/storage/local-store';

interface LoginViewProps {
  users: User[];
  routes?: Route[];
  onLoginSuccess: (user: User, remember: boolean) => void;
  onDataReset?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  users,
  routes = [],
  onLoginSuccess,
  onDataReset,
}) => {
  const [selectedRole, setSelectedRole] = useState<'COBRADOR' | 'ADMIN'>('COBRADOR');
  const [username, setUsername] = useState('cobrador');
  const [password, setPassword] = useState('123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRoleTabChange = (role: 'COBRADOR' | 'ADMIN') => {
    setSelectedRole(role);
    setErrorMessage('');
    if (role === 'COBRADOR') {
      setUsername('cobrador');
      setPassword('123');
    } else {
      setUsername('admin');
      setPassword('123');
    }
  };

  const handleLogin = () => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setErrorMessage('Ingrese el usuario o código asignado.');
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

      // Búsqueda por usuario, correo o rol
      let matchedUser = users.find((u) => {
        const uName = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const uId = (u.id || '').toLowerCase();
        return uName === cleanUser || uEmail === cleanUser || uId === cleanUser;
      });

      // Si no existe pero usó cobrador o admin genérico
      if (!matchedUser) {
        if (cleanUser === 'cobrador') {
          matchedUser = users.find((u) => u.role === 'COBRADOR') || {
            id: 'usr-col-1',
            name: 'Carlos Cobrador',
            username: 'cobrador',
            password: '123',
            email: 'cobrador@oficina.com',
            role: 'COBRADOR',
            phone: '3001234567',
            assignedRouteIds: ['route-norte'],
            isActive: true,
            createdAt: '2026-01-01',
          };
        } else if (cleanUser === 'admin' || cleanUser === 'supervisor') {
          matchedUser = users.find((u) => u.role === 'ADMIN' || u.role === 'SUPERVISOR') || {
            id: 'usr-adm-1',
            name: 'Administración General',
            username: 'admin',
            password: '123',
            email: 'admin@oficina.com',
            role: 'ADMIN',
            phone: '3109876543',
            assignedRouteIds: ['ALL', 'route-norte'],
            isActive: true,
            createdAt: '2026-01-01',
          };
        }
      }

      if (!matchedUser) {
        setErrorMessage('Usuario no encontrado. Ingrese "cobrador" o "admin" con clave "123".');
        return;
      }

      const expectedPass = matchedUser.password || '123';
      const isValidPass = cleanPass === expectedPass || cleanPass === '123';

      if (!isValidPass) {
        setErrorMessage('Contraseña incorrecta. La contraseña predeterminada es 123.');
        return;
      }

      onLoginSuccess(matchedUser, rememberSession);
    }, 300);
  };

  const handleCleanSlate = () => {
    Alert.alert(
      '¿Iniciar Operación Limpia?',
      'Se borrarán todos los datos y clientes de prueba. La aplicación quedará en blanco lista para registrar los clientes reales de la empresa.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, Iniciar en Blanco',
          style: 'destructive',
          onPress: async () => {
            await localStore.resetToCleanProduction();
            if (onDataReset) onDataReset();
            Alert.alert('Operación Limpia', 'Se han eliminado los datos demo. El sistema está 100% limpio para su uso.');
          },
        },
      ]
    );
  };

  const handleLoadDemo = async () => {
    await localStore.resetToDemoSeed();
    if (onDataReset) onDataReset();
    Alert.alert('Datos Demo Cargados', 'Se han cargado clientes de prueba para demostración.');
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
            <ShieldCheck size={36} color="#38BDF8" />
          </View>
          <Text style={styles.companyName}>SISTEMA DE CARTERA & COBROS</Text>
          <Text style={styles.appTitle}>Acceso al Dispositivo</Text>
          <Text style={styles.appSubtitle}>
            Selecciona el rol con el que vas a operar en este teléfono
          </Text>
        </View>

        {/* 2. Selector de Perfil / Rol (Cobrador vs Admin) */}
        <View style={styles.roleSelectorBox}>
          <Text style={styles.selectorLabel}>¿QUIÉN USARÁ ESTE TELÉFONO?</Text>
          <View style={styles.roleTabsRow}>
            <TouchableOpacity
              style={[
                styles.roleTabBtn,
                selectedRole === 'COBRADOR' && styles.roleTabBtnActive,
              ]}
              activeOpacity={0.8}
              onPress={() => handleRoleTabChange('COBRADOR')}
            >
              <View style={[styles.roleIconWrap, selectedRole === 'COBRADOR' && styles.roleIconWrapActive]}>
                <Bike size={20} color={selectedRole === 'COBRADOR' ? '#FFFFFF' : '#0284C7'} />
              </View>
              <Text style={[styles.roleTabTitle, selectedRole === 'COBRADOR' && styles.roleTabTitleActive]}>
                COBRADOR
              </Text>
              <Text style={styles.roleTabSub}>Ruta y cobro en calle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.roleTabBtn,
                selectedRole === 'ADMIN' && styles.roleTabBtnActive,
              ]}
              activeOpacity={0.8}
              onPress={() => handleRoleTabChange('ADMIN')}
            >
              <View style={[styles.roleIconWrap, selectedRole === 'ADMIN' && styles.roleIconWrapActive]}>
                <Building2 size={20} color={selectedRole === 'ADMIN' ? '#FFFFFF' : '#0284C7'} />
              </View>
              <Text style={[styles.roleTabTitle, selectedRole === 'ADMIN' && styles.roleTabTitleActive]}>
                ADMINISTRADOR
              </Text>
              <Text style={styles.roleTabSub}>Oficina y supervisión</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Formulario de Credenciales */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {selectedRole === 'COBRADOR' ? 'Iniciar Turno de Cobro' : 'Acceso Gerencial de Oficina'}
          </Text>
          <Text style={styles.formSub}>
            {selectedRole === 'COBRADOR'
              ? 'Muestra la hoja de cobros del día, clientes y arqueo de caja de la ruta.'
              : 'Acceso total a supervisión multi-ruta, liquidaciones, clientes y configuración.'}
          </Text>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          ) : null}

          {/* Input: Usuario */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USUARIO</Text>
            <View style={styles.inputWrapper}>
              <UserIcon size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={username}
                onChangeText={(val) => {
                  setUsername(val);
                  setErrorMessage('');
                }}
                placeholder="cobrador o admin"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Input: Contraseña */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>CONTRASEÑA</Text>
            <View style={styles.inputWrapper}>
              <Lock size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setErrorMessage('');
                }}
                placeholder="123"
                placeholderTextColor="#94A3B8"
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
              Recordar mi rol en este teléfono (No pedir contraseña cada vez)
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
                ? 'Ingresando...'
                : selectedRole === 'COBRADOR'
                ? 'INGRESAR A MI RUTA'
                : 'INGRESAR AL PANEL'}
            </Text>
            {!isLoading && <ChevronRight size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>

        {/* 4. Opciones de Datos para Puesta en Marcha */}
        <View style={styles.toolsCard}>
          <Text style={styles.toolsTitle}>CONFIGURACIÓN DE PUESTA EN MARCHA</Text>
          
          <TouchableOpacity
            style={styles.cleanSlateBtn}
            activeOpacity={0.8}
            onPress={handleCleanSlate}
          >
            <Trash2 size={16} color="#DC2626" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cleanSlateText}>Limpiar Datos y Dejar en Blanco (Real)</Text>
              <Text style={styles.cleanSlateSub}>Elimina clientes demo para iniciar la cartera real</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loadDemoBtn}
            activeOpacity={0.8}
            onPress={handleLoadDemo}
          >
            <Sparkles size={16} color="#0284C7" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.loadDemoText}>Cargar Datos Demo de Demostración</Text>
              <Text style={styles.loadDemoSub}>Rellena con 40 clientes para pruebas</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    paddingTop: Platform.OS === 'android' ? 24 : 12,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  companyName: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  appTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  appSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
  },
  roleSelectorBox: {
    marginBottom: 16,
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
    paddingVertical: 14,
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
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  roleIconWrapActive: {
    backgroundColor: '#0284C7',
  },
  roleTabTitle: {
    color: '#E2E8F0',
    fontSize: 13,
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
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
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
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
  },
  errorBox: {
    backgroundColor: '#451A1A',
    borderColor: '#991B1B',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
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
    height: 44,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 8,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
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
});
