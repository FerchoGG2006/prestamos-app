import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { AppVersionInfo, CURRENT_APP_VERSION, openApkDownload } from '../utils/appUpdates';
import {
  Download,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  X,
} from 'lucide-react-native';

interface AppUpdateModalProps {
  visible: boolean;
  versionInfo: AppVersionInfo | null;
  isForceUpdate: boolean;
  serverUrl?: string;
  onClose: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  visible,
  versionInfo,
  isForceUpdate,
  serverUrl,
  onClose,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  if (!versionInfo) return null;

  const notesList = (versionInfo.release_notes || 'Mejoras continuas en la experiencia de cobro y sincronización.')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[•\-\*]\s*/, ''));

  const handleInstallPress = async () => {
    setIsProcessing(true);
    setProgress(null);
    try {
      await openApkDownload(versionInfo.apk_url, serverUrl, (f) => setProgress(f));
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(null);
      }, 1500);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isForceUpdate) {
          onClose();
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Botón de cierre superior (solo si no es forzada) */}
          {!isForceUpdate && (
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={20} color={COLORS.navy} />
            </TouchableOpacity>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Ícono de cabecera */}
            <View
              style={[
                styles.iconContainer,
                isForceUpdate ? styles.iconForce : styles.iconNormal,
              ]}
            >
              {isForceUpdate ? (
                <ShieldAlert size={34} color={COLORS.danger} />
              ) : (
                <Sparkles size={34} color={COLORS.brandBlue} />
              )}
            </View>

            {/* Badge de tipo de actualización */}
            <View
              style={[
                styles.badge,
                isForceUpdate ? styles.badgeForce : styles.badgeNormal,
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  isForceUpdate ? styles.badgeTextForce : styles.badgeTextNormal,
                ]}
              >
                {isForceUpdate ? 'ACTUALIZACIÓN OBLIGATORIA' : 'NUEVA VERSIÓN DISPONIBLE'}
              </Text>
            </View>

            {/* Título y subtítulo */}
            <Text style={styles.title}>
              {isForceUpdate
                ? 'Actualización Requerida'
                : 'Mejora Kredia en tu Móvil'}
            </Text>
            <Text style={styles.subtitle}>
              {isForceUpdate
                ? 'Para garantizar la integridad financiera y continuar sincronizando con la oficina, debes instalar la versión obligatoria.'
                : 'Hay una nueva versión instalable con novedades diseñadas para agilizar tu ruta diaria.'}
            </Text>

            {/* Comparación de Versiones */}
            <View style={styles.versionBox}>
              <View style={styles.versionCol}>
                <Text style={styles.versionLabel}>Instalada</Text>
                <Text style={styles.versionCurrent}>v{CURRENT_APP_VERSION}</Text>
              </View>

              <View style={styles.versionArrow}>
                <ArrowRight size={18} color={COLORS.textSecondary} />
              </View>

              <View style={styles.versionCol}>
                <Text style={styles.versionLabel}>Nueva Versión</Text>
                <Text style={styles.versionTarget}>v{versionInfo.latest_version}</Text>
              </View>
            </View>

            {/* Novedades y Notas de Versión */}
            <View style={styles.notesSection}>
              <Text style={styles.notesTitle}>¿Qué hay de nuevo?</Text>
              {notesList.map((note, index) => (
                <View key={index} style={styles.noteItem}>
                  <CheckCircle2 size={16} color={COLORS.success} style={styles.noteIcon} />
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </View>

            {/* Garantía de datos offline */}
            <View style={styles.safetyBox}>
              <Lock size={16} color={COLORS.success} style={styles.safetyIcon} />
              <Text style={styles.safetyText}>
                <Text style={styles.safetyBold}>Datos 100% seguros:</Text> Tus clientes, abonos cobrados y saldo en efectivo se mantendrán intactos en tu teléfono.
              </Text>
            </View>
          </ScrollView>

          {/* Botones de Acción */}
          <View style={styles.actionContainer}>
            <TouchableOpacity
              style={[
                styles.installBtn,
                isForceUpdate ? styles.installBtnForce : styles.installBtnNormal,
                isProcessing && styles.btnDisabled,
              ]}
              onPress={handleInstallPress}
              disabled={isProcessing}
              activeOpacity={0.85}
            >
              {isProcessing ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={styles.installBtnText}>
                    {progress !== null && progress < 1
                      ? `Descargando ${Math.round(progress * 100)}%`
                      : 'Abriendo instalador...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.processingRow}>
                  <Download size={20} color="#FFFFFF" />
                  <Text style={styles.installBtnText}>Descargar e Instalar APK</Text>
                </View>
              )}
            </TouchableOpacity>

            {!isForceUpdate && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Más tarde</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.bgPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  iconContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconNormal: {
    backgroundColor: '#EFF6FF',
  },
  iconForce: {
    backgroundColor: '#FEF2F2',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  badgeNormal: {
    backgroundColor: '#E0E7FF',
  },
  badgeForce: {
    backgroundColor: '#FEE2E2',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTextNormal: {
    color: COLORS.brandBlue,
  },
  badgeTextForce: {
    color: COLORS.danger,
  },
  title: {
    fontSize: 20,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.navy,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  versionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
    width: '100%',
    justifyContent: 'space-around',
  },
  versionCol: {
    alignItems: 'center',
  },
  versionLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  versionCurrent: {
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.navy,
  },
  versionArrow: {
    paddingHorizontal: 10,
  },
  versionTarget: {
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    fontWeight: '800',
    color: COLORS.success,
  },
  notesSection: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notesTitle: {
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.navy,
    marginBottom: 8,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  noteIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: FONT_FAMILY,
    color: '#334155',
    lineHeight: 17,
  },
  safetyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    width: '100%',
  },
  safetyIcon: {
    marginRight: 8,
  },
  safetyText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    color: '#065F46',
    lineHeight: 16,
  },
  safetyBold: {
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
  },
  actionContainer: {
    width: '100%',
    marginTop: 10,
  },
  installBtn: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  installBtnNormal: {
    backgroundColor: COLORS.brandBlue,
  },
  installBtnForce: {
    backgroundColor: COLORS.danger,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  installBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: FONT_FAMILY,
    fontWeight: '600',
  },
});
