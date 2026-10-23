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
} from 'react-native';
import { User } from '../../../core/domain/types';
import {
  ShieldCheck,
  Lock,
  User as UserIcon,
  ChevronRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Building2,
} from 'lucide-react-native';

interface LoginViewProps {
  users: User[];
  onLoginSuccess: (user: User, remember: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  users,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setErrorMessage('Ingrese el usuario o código de ruta asignado.');
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

      // Búsqueda estricta por usuario, correo o identificador exacto de ruta
      const matchedUser = users.find((u) => {
        const uName = (u.username || '').toLowerCase();
        const uEmail = (u.email || '').toLowerCase();
        const uId = (u.id || '').toLowerCase();

        return uName === cleanUser || uEmail === cleanUser || uId === cleanUser;
      });

      if (!matchedUser) {
        setErrorMessage(
          'Usuario o código de ruta no encontrado. Verifique las credenciales con la oficina.'
        );
        return;
      }

      // Validación estricta de la contraseña configurada para el usuario
      const expectedPass = matchedUser.password;
      const isValidPass = Boolean(expectedPass) && cleanPass === expectedPass;

      if (!isValidPass) {
        setErrorMessage(
          'Contraseña incorrecta para esta ruta. Verifique con la administración.'
        );
        return;
      }

      // Éxito: autenticado con su usuario y ruta
      onLoginSuccess(matchedUser, rememberSession);
    }, 350);
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
        {/* 1. Header Corporativo de la Oficina */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <ShieldCheck size={38} color="#38BDF8" />
          </View>
          <Text style={styles.companyName}>OFICINA DE COBROS</Text>
          <Text style={styles.appTitle}>SISTEMA DE RUTAS Y CARTERA</Text>
          <Text style={styles.appSubtitle}>
            Acceso exclusivo por credenciales de ruta
          </Text>

          <View style={styles.badgeRow}>
            <View style={styles.securityPill}>
              <Building2 size={11} color="#38BDF8" />
              <Text style={styles.securityPillText}>Multi-Ruta Corporativo</Text>
            </View>
          </View>
        </View>

        {/* 2. Tarjeta de Formulario de Credenciales */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Iniciar Turno de Cobro</Text>
          <Text style={styles.formSub}>
            Ingrese las credenciales que la oficina le asignó a su ruta.
          </Text>

          {/* Mensaje de Error */}
          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          ) : null}

          {/* Input: Usuario / Ruta */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USUARIO / CÓDIGO DE RUTA</Text>
            <View style={styles.inputWrapper}>
              <UserIcon size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={username}
                onChangeText={(val) => {
                  setUsername(val);
                  setErrorMessage('');
                }}
                placeholder="Ej. ruta1-excelencia o admin"
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
              <Lock size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  setErrorMessage('');
                }}
                placeholder="Ingrese su contraseña"
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

          {/* Checkbox: Recordar en este teléfono */}
          <TouchableOpacity
            style={styles.rememberRow}
            activeOpacity={0.7}
            onPress={() => setRememberSession(!rememberSession)}
          >
            <View
              style={[
                styles.checkbox,
                rememberSession && styles.checkboxActive,
              ]}
            >
              {rememberSession && <CheckCircle2 size={13} color="#FFFFFF" />}
            </View>
            <Text style={styles.rememberText}>
              Recordar credenciales en este dispositivo
            </Text>
          </TouchableOpacity>

          {/* Botón de Ingreso */}
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
              {isLoading ? 'Verificando Ruta...' : 'INGRESAR A LA RUTA'}
            </Text>
            {!isLoading && <ChevronRight size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>

        {/* 3. Acceso Rápido Demo (Pruebas de Ruta y Oficina) */}
        <View style={styles.demoCard}>
          <Text style={styles.demoSectionTitle}>ACCESO RÁPIDO DEMO (PRUEBAS)</Text>
          <View style={styles.demoButtonsList}>
            {users.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={styles.demoBtn}
                activeOpacity={0.75}
                onPress={() => {
                  setUsername(u.username || u.email || u.id);
                  setPassword(u.password || '');
                  setErrorMessage('');
                  onLoginSuccess(u, rememberSession);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.demoBtnName}>
                    {u.role === 'ADMIN' ? '🏢 ' : '🛵 '}
                    {u.name} ({u.role === 'ADMIN' ? 'Administrador' : 'Cobrador'})
                  </Text>
                  <Text style={styles.demoBtnCreds}>
                    Usuario: {u.username}
                  </Text>
                </View>
                <View style={styles.demoBtnBadge}>
                  <Text style={styles.demoBtnBadgeText}>Entrar</Text>
                  <ChevronRight size={14} color="#38BDF8" />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>


        {/* 4. Footer de Seguridad y Auditoría */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            PRESTACAR • Software Profesional de Cobranzas
          </Text>
          <Text style={styles.footerSubText}>
            Cada recibo, gasto y cierre queda auditado y firmado con las credenciales de la ruta.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 36,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 22,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  companyName: {
    fontSize: 11,
    fontWeight: '900',
    color: '#38BDF8',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  appTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    paddingHorizontal: 11,
    paddingVertical: 3.5,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  securityPillText: {
    color: '#38BDF8',
    fontSize: 10.5,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#131B2E',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  formSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 18,
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#94A3B8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A0F1D',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 8,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 16,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  rememberText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    borderRadius: 14,
    height: 50,
    gap: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  demoCard: {
    marginTop: 16,
    backgroundColor: 'rgba(19, 27, 46, 0.85)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  demoSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  demoButtonsList: {
    gap: 8,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0A0F1D',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  demoBtnName: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '700',
  },
  demoBtnCreds: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  demoBtnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
  },
  demoBtnBadgeText: {
    color: '#38BDF8',
    fontSize: 11,
    fontWeight: '800',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  footerSubText: {
    fontSize: 10,
    color: '#475569',
    marginTop: 3,
    textAlign: 'center',
    lineHeight: 14,
  },
});
