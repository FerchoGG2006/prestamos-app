import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { Share, PlusSquare, X, ArrowDown, Smartphone } from 'lucide-react-native';
import { COLORS, FONT_FAMILY } from '../theme/colors';

const DISMISS_STORAGE_KEY = '@kredia_ios_install_prompt_dismissed';

export const IosInstallPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    // Inyectar metadatos nativos de iOS (WebClip) para pantalla completa e ícono de Kredia
    const ensureMeta = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    };

    ensureMeta('apple-mobile-web-app-capable', 'yes');
    ensureMeta('apple-mobile-web-app-status-bar-style', 'default');
    ensureMeta('apple-mobile-web-app-title', 'Kredia');
    ensureMeta('mobile-web-app-capable', 'yes');
    ensureMeta('theme-color', '#F6F4EE');

    let touchIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (!touchIcon) {
      touchIcon = document.createElement('link');
      touchIcon.rel = 'apple-touch-icon';
      document.head.appendChild(touchIcon);
    }
    touchIcon.href = '/apple-touch-icon.png';

    let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = '/manifest.json';

    // Detectar si es un iPhone / iPad y aún no está abierto desde el ícono de inicio
    const ua = window.navigator.userAgent || '';
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    const isStandalone =
      (window.navigator as any).standalone === true ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches);

    const forcePreview = window.location.search.includes('ios_guide=1');

    let alreadyDismissed = false;
    try {
      alreadyDismissed = window.sessionStorage?.getItem(DISMISS_STORAGE_KEY) === '1';
    } catch {
      // Ignorar errores de sessionStorage en modo privado
    }

    if ((isIOS && !isStandalone && !alreadyDismissed) || forcePreview) {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage?.setItem(DISMISS_STORAGE_KEY, '1');
      }
    } catch {
      // Ignorar
    }
  };

  if (!visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={18} color="#64748B" />
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={styles.appIconBox}>
            <Smartphone size={22} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Instalar Kredia en tu iPhone</Text>
            <Text style={styles.subtitle}>
              Déjala en tu pantalla de inicio en 2 toques (sin App Store):
            </Text>
          </View>
        </View>

        <View style={styles.stepsBox}>
          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.stepText}>
              Toca el botón <Text style={styles.stepHighlight}>Compartir</Text> en la barra de abajo
            </Text>
            <View style={styles.iconPill}>
              <Share size={15} color="#2563EB" />
            </View>
          </View>

          <View style={styles.stepDivider} />

          <View style={styles.stepRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={styles.stepText}>
              Elige <Text style={styles.stepHighlight}>"Agregar a pantalla de inicio"</Text>
            </Text>
            <View style={styles.iconPill}>
              <PlusSquare size={15} color="#0F172A" />
            </View>
          </View>
        </View>

        <View style={styles.footerRow}>
          <View style={styles.arrowIndicator}>
            <ArrowDown size={16} color="#2563EB" />
            <Text style={styles.arrowText}>El botón está aquí abajo en tu iPhone</Text>
          </View>

          <TouchableOpacity style={styles.useNowBtn} onPress={handleDismiss} activeOpacity={0.8}>
            <Text style={styles.useNowBtnText}>Usar ya</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    zIndex: 9999,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 14,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 28,
    marginBottom: 12,
  },
  appIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    lineHeight: 16,
  },
  stepsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stepText: {
    flex: 1,
    fontFamily: FONT_FAMILY,
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 17,
  },
  stepHighlight: {
    fontWeight: '800',
    color: '#0F172A',
  },
  iconPill: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  arrowIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  arrowText: {
    fontFamily: FONT_FAMILY,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  useNowBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  useNowBtnText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
});

