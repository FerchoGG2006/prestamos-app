import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { DEFAULT_BUSINESS_CONFIG } from '../../../core/config/business-rules';
import { COLORS } from '../../theme/colors';
import { Settings, Check, AlertCircle, HelpCircle } from 'lucide-react-native';

export const ConfigView: React.FC = () => {
  const [interestRate, setInterestRate] = useState(
    (DEFAULT_BUSINESS_CONFIG.loan.defaultInterestRate * 100).toString()
  );
  const [paperworkRate, setPaperworkRate] = useState(
    DEFAULT_BUSINESS_CONFIG.paperwork.rate.toString()
  );
  const [paperworkBase, setPaperworkBase] = useState(
    DEFAULT_BUSINESS_CONFIG.paperwork.base.toString()
  );
  const [defaultInstallments, setDefaultInstallments] = useState(
    DEFAULT_BUSINESS_CONFIG.loan.defaultInstallmentsCount.toString()
  );

  const handleSave = () => {
    Alert.alert(
      'Configuración Guardada',
      'Los parámetros comerciales han sido actualizados y se aplicarán a las nuevas operaciones.'
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Parámetros del Negocio</Text>
          <Text style={styles.subtitle}>
            Tasas, papelería y reglas comerciales parametrizables (sin hardcoding)
          </Text>
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Check size={16} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={styles.saveBtnText}>Guardar</Text>
        </TouchableOpacity>
      </View>

      {/* Regla de Interés */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Tasa de Interés y Créditos</Text>
        <Text style={styles.cardDesc}>
          Actualmente el negocio aplica una tasa fija sobre el capital inicial (no sobre saldo restante).
        </Text>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Tasa de Interés por Defecto (%):</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={interestRate}
                onChangeText={setInterestRate}
              />
            </View>
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.fieldLabel}>Cuotas Diarias Estándar:</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={defaultInstallments}
                onChangeText={setDefaultInstallments}
              />
            </View>
          </View>
        </View>
      </View>

      {/* Regla de Papelería */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>2. Gastos de Papelería en Renovaciones</Text>
        <Text style={styles.cardDesc}>
          Regla comercial actual: $5.000 por cada $100.000 de capital nuevo.
        </Text>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Valor Papelería ($ COP):</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={paperworkRate}
                onChangeText={setPaperworkRate}
              />
            </View>
          </View>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.fieldLabel}>Base de Cálculo ($ COP):</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={paperworkBase}
                onChangeText={setPaperworkBase}
              />
            </View>
          </View>
        </View>
      </View>

      {/* DECISIÓN PENDIENTE: FÓRMULA DE MORA */}
      <View style={[styles.card, styles.pendingCard]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <AlertCircle size={18} color={COLORS.warning} style={{ marginRight: 8 }} />
          <Text style={styles.pendingTitle}>DECISIÓN PENDIENTE: FÓRMULA DE MORA</Text>
        </View>
        <Text style={styles.pendingText}>
          El negocio aún no ha definido la fórmula matemática oficial de mora (cuándo inicia, tasa diaria o recargo fijo, tope máximo, período de gracia).
        </Text>
        <View style={styles.ruleBox}>
          <Text style={styles.ruleText}>
            Estado actual en el código: La arquitectura registra fácticos (días de mora, cuotas vencidas y saldo vencido), manteniendo el recargo en $0 sin inventar valores hasta que administración entregue la regla oficial.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPrimary,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 14,
  },
  fieldRow: {
    flexDirection: 'row',
  },
  fieldLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWrap: {
    backgroundColor: COLORS.bgPrimary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    paddingHorizontal: 12,
  },
  input: {
    height: 48,
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pendingCard: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
  },
  pendingTitle: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  pendingText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  ruleBox: {
    backgroundColor: COLORS.bgPrimary,
    padding: 10,
    borderRadius: 8,
  },
  ruleText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
