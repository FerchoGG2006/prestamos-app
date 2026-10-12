import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AuditLog } from '../../../core/domain/types';
import { COLORS } from '../../theme/colors';
import { ShieldCheck, Clock, FileText } from 'lucide-react-native';

interface AuditLogsViewProps {
  logs: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Registro Inmutable de Auditoría</Text>
          <Text style={styles.subtitle}>
            Trazabilidad completa de operaciones financieras y modificaciones sensibles
          </Text>
        </View>
        <View style={styles.badge}>
          <ShieldCheck size={16} color={COLORS.success} style={{ marginRight: 6 }} />
          <Text style={styles.badgeText}>Audit Log Activo</Text>
        </View>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No hay registros de auditoría aún.</Text>
        </View>
      ) : (
        logs.map((log) => {
          let actionColor = COLORS.primary;
          if (log.action === 'CREATE') actionColor = COLORS.success;
          if (log.action === 'CLOSE') actionColor = COLORS.purple;
          if (log.action === 'ANNUL' || log.action === 'ADJUST') actionColor = COLORS.danger;

          return (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.actionTag, { backgroundColor: `${actionColor}25` }]}>
                    <Text style={[styles.actionText, { color: actionColor }]}>
                      {log.action}
                    </Text>
                  </View>
                  <Text style={styles.entityName}>{log.entity} • ID: {log.entityId}</Text>
                </View>
                <View style={styles.timeRow}>
                  <Clock size={12} color={COLORS.textMuted} style={{ marginRight: 4 }} />
                  <Text style={styles.timeText}>{log.timestamp.replace('T', ' ').substring(0, 19)}</Text>
                </View>
              </View>

              <Text style={styles.userText}>Operador: {log.userId}</Text>

              {log.reason && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Motivo / Justificación:</Text>
                  <Text style={styles.reasonText}>"{log.reason}"</Text>
                </View>
              )}

              <View style={styles.payloadBox}>
                <Text style={styles.payloadLabel}>Detalle registrado:</Text>
                <Text style={styles.payloadText} numberOfLines={3}>
                  {log.newValue}
                </Text>
              </View>
            </View>
          );
        })
      )}
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  badgeText: {
    color: COLORS.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  logCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.bgTertiary,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  actionTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  entityName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    color: COLORS.textMuted,
    fontSize: 11,
  },
  userText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginBottom: 8,
  },
  reasonBox: {
    backgroundColor: COLORS.bgPrimary,
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
  },
  reasonLabel: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: 'bold',
  },
  reasonText: {
    color: COLORS.warning,
    fontSize: 12,
    fontStyle: 'italic',
  },
  payloadBox: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 8,
    borderRadius: 6,
  },
  payloadLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  payloadText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
