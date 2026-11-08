import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { COLORS, FONT_FAMILY } from '../theme/colors';
import { Camera, Video, Image as ImageIcon, X, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { persistMediaUri } from '../../infrastructure/storage/media-storage';

export interface ClientMediaValue {
  uri: string;
  mediaType: 'PHOTO' | 'VIDEO';
  fileName?: string;
}

interface ClientMediaAttachmentProps {
  value?: ClientMediaValue | null;
  onChange: (media: ClientMediaValue | null) => void;
  title?: string;
}

export const ClientMediaAttachment: React.FC<ClientMediaAttachmentProps> = ({
  value,
  onChange,
  title = 'Foto o Video del Cliente',
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const pickFromWeb = (captureMode?: 'user' | 'environment', isVideo?: boolean) => {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = isVideo ? 'video/*' : 'image/*,video/*';
    if (captureMode) {
      input.setAttribute('capture', captureMode);
    }
    input.onchange = (e: any) => {
      const file = e.target?.files?.[0];
      if (file) {
        setIsLoading(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const resultUri = event.target?.result as string;
            const detectedType: 'PHOTO' | 'VIDEO' = file.type.startsWith('video') ? 'VIDEO' : 'PHOTO';
            const optimizedUri = await persistMediaUri(resultUri, detectedType === 'VIDEO');
            onChange({
              uri: optimizedUri,
              mediaType: detectedType,
              fileName: file.name,
            });
          } finally {
            setIsLoading(false);
          }
        };
        reader.onerror = () => {
          setIsLoading(false);
          Alert.alert('Error', 'No fue posible leer el archivo seleccionado.');
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleTakePhoto = async () => {
    if (Platform.OS === 'web') {
      pickFromWeb('environment', false);
      return;
    }

    try {
      setIsLoading(true);
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permiso Requerido',
          'Se necesita acceso a la cámara para capturar la fotografía del cliente.'
        );
        setIsLoading(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.55,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        onChange({
          uri: asset.uri,
          mediaType: 'PHOTO',
          fileName: asset.fileName || 'foto_cliente.jpg',
        });
      }
    } catch (err: any) {
      console.warn('[ImagePicker] Error al abrir cámara:', err);
      Alert.alert('Cámara', 'No se pudo iniciar la cámara en este dispositivo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecordVideo = async () => {
    if (Platform.OS === 'web') {
      pickFromWeb('environment', true);
      return;
    }

    try {
      setIsLoading(true);
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permiso Requerido',
          'Se necesita acceso a la cámara para grabar el video del cliente.'
        );
        setIsLoading(false);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 30,
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        onChange({
          uri: asset.uri,
          mediaType: 'VIDEO',
          fileName: asset.fileName || 'video_cliente.mp4',
        });
      }
    } catch (err: any) {
      console.warn('[ImagePicker] Error al grabar video:', err);
      Alert.alert('Grabación', 'No se pudo iniciar la grabación de video.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFromGallery = async () => {
    if (Platform.OS === 'web') {
      pickFromWeb(undefined, false);
      return;
    }

    try {
      setIsLoading(true);
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Permiso Requerido',
          'Se necesita acceso a la galería para seleccionar la foto o video.'
        );
        setIsLoading(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 0.55,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const isVid = asset.type === 'video' || (asset.mimeType && asset.mimeType.startsWith('video'));
        onChange({
          uri: asset.uri,
          mediaType: isVid ? 'VIDEO' : 'PHOTO',
          fileName: asset.fileName || (isVid ? 'video_cliente.mp4' : 'foto_cliente.jpg'),
        });
      }
    } catch (err: any) {
      console.warn('[ImagePicker] Error al seleccionar de galería:', err);
      Alert.alert('Galería', 'No fue posible abrir la galería.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{title}</Text>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Optimizando y guardando archivo audiovisual...</Text>
        </View>
      ) : value && value.uri ? (
        <View style={styles.previewCard}>
          {value.mediaType === 'PHOTO' ? (
            <Image source={{ uri: value.uri }} style={styles.thumbnailImage} resizeMode="cover" />
          ) : (
            <View style={styles.videoPlaceholder}>
              <Video size={32} color={COLORS.brandBlue} />
              <Text style={styles.videoLabel}>Video Registrado</Text>
            </View>
          )}

          <View style={styles.previewInfo}>
            <View style={styles.badgeRow}>
              <View style={styles.badgeSuccess}>
                <CheckCircle2 size={12} color={COLORS.success} />
                <Text style={styles.badgeSuccessText}>
                  {value.mediaType === 'PHOTO' ? 'Fotografía Optimizada' : 'Video Adjunto'}
                </Text>
              </View>
            </View>
            <Text style={styles.fileNameText} numberOfLines={1}>
              {value.fileName || (value.mediaType === 'PHOTO' ? 'foto_cliente.jpg' : 'video_cliente.mp4')}
            </Text>

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.changeBtn}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
              >
                <RefreshCw size={12} color={COLORS.primary} />
                <Text style={styles.changeBtnText}>Cambiar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onChange(null)}
                activeOpacity={0.7}
              >
                <X size={12} color={COLORS.danger} />
                <Text style={styles.removeBtnText}>Quitar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.buttonsRow}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleTakePhoto}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
              <Camera size={18} color={COLORS.brandBlue} />
            </View>
            <Text style={styles.actionBtnText}>Tomar Foto</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleRecordVideo}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#F0FDF4' }]}>
              <Video size={18} color={COLORS.success} />
            </View>
            <Text style={styles.actionBtnText}>Grabar Video</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={handleSelectFromGallery}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF' }]}>
              <ImageIcon size={18} color="#7C3AED" />
            </View>
            <Text style={styles.actionBtnText}>Galería</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 11.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    padding: 10,
    gap: 12,
  },
  thumbnailImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: COLORS.bgSecondary,
  },
  videoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  videoLabel: {
    fontSize: 9,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.brandBlue,
    marginTop: 2,
  },
  previewInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeSuccessText: {
    fontSize: 10.5,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.success,
  },
  fileNameText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 8,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
  },
  changeBtnText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.primary,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeBtnText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY,
    fontWeight: '700',
    color: COLORS.danger,
  },
});
