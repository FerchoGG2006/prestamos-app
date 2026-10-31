import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from 'react-native';

/**
 * Pantalla puente para instaladores antiguos (runtime 1.2.0).
 *
 * Esos APK no incluyen los módulos nativos nuevos (cámara, fuentes, instalador interno),
 * así que no pueden ejecutar la app actual. Esta pantalla solo usa React Native básico y
 * lleva al usuario a descargar el APK vigente. Los datos locales se conservan al instalar
 * encima porque el paquete y la firma son los mismos.
 */
const CLOUD_VERSION_URL =
  'https://raw.githubusercontent.com/FerchoGG2006/prestamos-app/feat/ui-ux-audit-handoff/version.json';

export default function LegacyUpgradeScreen() {
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    fetch(CLOUD_VERSION_URL, { headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => r.json())
      .then((d) => {
        setApkUrl(d.apk_url);
        setVersion(d.latest_version || '');
      })
      .catch(() => setApkUrl(null));
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>K</Text>
      </View>
      <Text style={styles.title}>Nueva versión de Kredia</Text>
      <Text style={styles.body}>
        Esta instalación es antigua y ya no recibe mejoras. Descarga la versión nueva
        {version ? ` (${version})` : ''} e instálala encima. Tus datos se conservan.
      </Text>
      <TouchableOpacity
        style={[styles.btn, !apkUrl && { opacity: 0.6 }]}
        disabled={!apkUrl}
        onPress={() => apkUrl && Linking.openURL(apkUrl)}
        activeOpacity={0.85}
      >
        {apkUrl ? (
          <Text style={styles.btnText}>Descargar e instalar</Text>
        ) : (
          <ActivityIndicator color="#FFFFFF" />
        )}
      </TouchableOpacity>
      <Text style={styles.hint}>
        Si Android lo pide, permite instalar apps desde el navegador y luego toca Instalar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center', padding: 28 },
  logo: { width: 64, height: 64, borderRadius: 16, backgroundColor: '#13233D', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  logoText: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: '#13233D', marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 15, color: '#475569', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: { backgroundColor: '#13233D', borderRadius: 14, height: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 12, color: '#64748B', textAlign: 'center', marginTop: 14, lineHeight: 17 },
});
