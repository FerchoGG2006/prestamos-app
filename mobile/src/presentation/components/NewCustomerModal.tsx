import React from 'react';
import { localStore } from '../../infrastructure/storage/local-store';
import { NewLoanModal } from './NewLoanModal';

interface NewCustomerModalProps {
  visible: boolean;
  todayStr: string;
  defaultRouteId?: string;
  isCollector?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Componente unificado (Fase 1): delega al formulario maestro NewLoanModal
 * preseleccionando el modo de registro de Nuevo Cliente (con préstamo, cartulina del taco o solo cliente).
 */
export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  visible,
  todayStr,
  defaultRouteId,
  isCollector = false,
  onClose,
  onSuccess,
}) => {
  const effectiveRoute = defaultRouteId && defaultRouteId !== 'ALL' ? defaultRouteId : undefined;
  const customers = localStore.getCustomers();
  const loans = localStore.getLoans();
  const metrics = localStore.getDailyRouteMetrics(todayStr, effectiveRoute);

  return (
    <NewLoanModal
      visible={visible}
      customers={customers}
      loans={loans}
      todayStr={todayStr}
      defaultRouteId={defaultRouteId}
      baseAvailable={metrics.cashAvailableInHand}
      initialCustomerMode="NEW"
      isCollector={isCollector}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
};
