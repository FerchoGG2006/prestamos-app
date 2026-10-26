/**
 * DATOS INICIALES REALISTAS DE PRUEBA: 40 CLIENTES Y ADMINISTRATIVO DE $20.000.000 COP
 * - Cartera activa en calle (saldos pendientes): $17.000.000 COP
 * - Base de efectivo disponible para prestar en mano: $3.000.000 COP
 * - Total Administrativo de la Ruta: $20.000.000 COP
 */

import {
  User,
  Route,
  Customer,
  Loan,
  Installment,
  CollectionSession,
  PaymentPromise,
  CashMovement,
} from '../../core/domain/types';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-col-1',
    name: 'Carlos Cobrador (Ruta 1)',
    username: 'cobrador',
    password: '',
    email: 'cobrador@cobros.com',
    role: 'COBRADOR',
    phone: '3001234567',
    assignedRouteIds: ['route-norte'],
    routeId: 'route-norte',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'usr-col-2',
    name: 'Jorge Cobrador (Ruta 2)',
    username: 'ruta2',
    password: '',
    email: 'ruta2@cobros.com',
    role: 'COBRADOR',
    phone: '3009876543',
    assignedRouteIds: ['route-centro'],
    routeId: 'route-centro',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'usr-col-3',
    name: 'Andrés Cobrador (Ruta 3)',
    username: 'ruta3',
    password: '',
    email: 'ruta3@cobros.com',
    role: 'COBRADOR',
    phone: '3005558899',
    assignedRouteIds: ['route-sur'],
    routeId: 'route-sur',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'usr-sup-1',
    name: 'Supervisor de Rutas',
    username: 'supervisor',
    password: '',
    email: 'supervisor@cobros.com',
    role: 'SUPERVISOR',
    phone: '3105551234',
    assignedRouteIds: ['route-norte', 'route-centro', 'route-sur'],
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'usr-adm-1',
    name: 'Administración General',
    username: 'admin',
    password: '',
    email: 'admin@cobros.com',
    role: 'ADMIN',
    phone: '3109876543',
    assignedRouteIds: ['route-norte', 'route-centro', 'route-sur'],
    isActive: true,
    createdAt: '2026-09-01',
  },
];

export const INITIAL_ROUTES: Route[] = [
  {
    id: 'route-norte',
    name: 'Ruta Norte',
    code: 'RN-01',
    collectorId: 'usr-col-1',
    description: 'Sectores: El Prado, Bellavista, Boston, San Roque',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'route-centro',
    name: 'Ruta Centro',
    code: 'RC-02',
    collectorId: 'usr-col-2',
    description: 'Sectores: Centro, San Roque, Chiquinquirá',
    isActive: true,
    createdAt: '2026-09-01',
  },
  {
    id: 'route-sur',
    name: 'Ruta Sur',
    code: 'RS-03',
    collectorId: 'usr-col-3',
    description: 'Sectores: Ciudadela, Murillo, Simón Bolívar, Soledad',
    isActive: true,
    createdAt: '2026-09-01',
  },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    fullName: 'Juan Pérez',
    documentNumber: '1045234890',
    phone: '3012345678',
    address: 'Calle 54 # 43 - 21',
    neighborhood: 'Boston',
    city: 'Barranquilla',
    occupation: 'Panadero',
    businessName: 'Panadería El Sol',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 1,
    status: 'ACTIVE',
    references: [
      { id: 'ref-1', fullName: 'Marta Pérez', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-2',
    fullName: 'Carlos Díaz',
    documentNumber: '1047890123',
    phone: '3023456789',
    address: 'Cra 38 # 28 - 15',
    neighborhood: 'San Roque',
    city: 'Barranquilla',
    occupation: 'Mecánico',
    businessName: 'Taller San Roque',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 2,
    status: 'ACTIVE',
    references: [
      { id: 'ref-2', fullName: 'Pedro Díaz', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-3',
    fullName: 'María López',
    documentNumber: '1043210987',
    phone: '3009876543',
    address: 'Calle 68 # 52 - 10',
    neighborhood: 'El Prado',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Miscelánea María',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 3,
    status: 'ACTIVE',
    references: [
      { id: 'ref-3', fullName: 'Lucía López', relationship: 'Prima', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-4',
    fullName: 'Pedro Gómez',
    documentNumber: '1049988776',
    phone: '3156789012',
    address: 'Calle 70 # 60 - 30',
    neighborhood: 'Bellavista',
    city: 'Barranquilla',
    occupation: 'Cocinero',
    businessName: 'Comidas Don Pedro',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 4,
    status: 'ACTIVE',
    references: [
      { id: 'ref-4', fullName: 'Carmen Gómez', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-5',
    fullName: 'Luisa Martínez',
    documentNumber: '1041122334',
    phone: '3201234567',
    address: 'Cra 44 # 35 - 12',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    occupation: 'Estilista',
    businessName: 'Peluquería Estilo',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 5,
    status: 'ACTIVE',
    references: [
      { id: 'ref-5', fullName: 'Jorge Martínez', relationship: 'Hermano', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-6',
    fullName: 'Andrés Castro',
    documentNumber: '1046554433',
    phone: '3104567890',
    address: 'Calle 30 # 25 - 40',
    neighborhood: 'Rebolo',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Frutería La Bendición',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 6,
    status: 'ACTIVE',
    references: [
      { id: 'ref-6', fullName: 'Sonia Castro', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-7',
    fullName: 'Gloria Ospina',
    documentNumber: '1048776655',
    phone: '3112345678',
    address: 'Cra 21 # 45 - 18',
    neighborhood: 'San José',
    city: 'Barranquilla',
    occupation: 'Costurera',
    businessName: 'Modistería Gloria',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 7,
    status: 'ACTIVE',
    references: [
      { id: 'ref-7', fullName: 'Raúl Ospina', relationship: 'Esposo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-8',
    fullName: 'Jhon Jairo Moreno',
    documentNumber: '1042334455',
    phone: '3145678901',
    address: 'Calle 45 # 14 - 08',
    neighborhood: 'Chiquinquirá',
    city: 'Barranquilla',
    occupation: 'Mecánico',
    businessName: 'Llantas & Moto Jhon',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 8,
    status: 'ACTIVE',
    references: [
      { id: 'ref-8', fullName: 'Yuli Moreno', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-9',
    fullName: 'Diana Marcela Ruiz',
    documentNumber: '1044998811',
    phone: '3167890123',
    address: 'Cra 27 # 53 - 22',
    neighborhood: 'Los Andes',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Papelería Ruiz',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 9,
    status: 'ACTIVE',
    references: [
      { id: 'ref-9', fullName: 'Fabio Ruiz', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-10',
    fullName: 'Fernando Herrera',
    documentNumber: '1046112299',
    phone: '3189012345',
    address: 'Calle 63 # 24 - 15',
    neighborhood: 'Lucero',
    city: 'Barranquilla',
    occupation: 'Carnicero',
    businessName: 'Carnicería El Buen Corte',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 10,
    status: 'ACTIVE',
    references: [
      { id: 'ref-10', fullName: 'Rosa Herrera', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-11',
    fullName: 'Claudia Patricia Vega',
    documentNumber: '1047223388',
    phone: '3001122334',
    address: 'Cra 16 # 38 - 50',
    neighborhood: 'La Victoria',
    city: 'Barranquilla',
    occupation: 'Cocinera',
    businessName: 'Cafetería & Desayunos',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 11,
    status: 'ACTIVE',
    references: [
      { id: 'ref-11', fullName: 'Héctor Vega', relationship: 'Hermano', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-12',
    fullName: 'Óscar Iván Morales',
    documentNumber: '1048334477',
    phone: '3012233445',
    address: 'Calle 40 # 19 - 33',
    neighborhood: 'Montes',
    city: 'Barranquilla',
    occupation: 'Zapatero',
    businessName: 'Zapatería El Calzado',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 12,
    status: 'ACTIVE',
    references: [
      { id: 'ref-12', fullName: 'Luz Morales', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-13',
    fullName: 'Paola Andrea Silva',
    documentNumber: '1049445566',
    phone: '3023344556',
    address: 'Cra 33 # 47 - 05',
    neighborhood: 'Chiquinquirá',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Boutique Paola',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 13,
    status: 'ACTIVE',
    references: [
      { id: 'ref-13', fullName: 'Mario Silva', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-14',
    fullName: 'Ricardo Antonio Ramos',
    documentNumber: '1040556677',
    phone: '3044455667',
    address: 'Calle 51 # 36 - 19',
    neighborhood: 'San Roque',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Ferretería El Tornillo',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 14,
    status: 'ACTIVE',
    references: [
      { id: 'ref-14', fullName: 'Estela Ramos', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-15',
    fullName: 'Sandra Milena Torres',
    documentNumber: '1041667788',
    phone: '3055566778',
    address: 'Cra 41 # 58 - 42',
    neighborhood: 'Boston',
    city: 'Barranquilla',
    occupation: 'Regente',
    businessName: 'Droguería San Jorge',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 15,
    status: 'ACTIVE',
    references: [
      { id: 'ref-15', fullName: 'Luis Torres', relationship: 'Hermano', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-16',
    fullName: 'Wilson Javier Mendoza',
    documentNumber: '1042778899',
    phone: '3136677889',
    address: 'Calle 72 # 48 - 11',
    neighborhood: 'El Prado',
    city: 'Barranquilla',
    occupation: 'Técnico',
    businessName: 'Taller de Frenos Wilson',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 16,
    status: 'ACTIVE',
    references: [
      { id: 'ref-16', fullName: 'Nubia Mendoza', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-17',
    fullName: 'Adriana Lucía Romero',
    documentNumber: '1043889900',
    phone: '3147788990',
    address: 'Cra 46 # 65 - 08',
    neighborhood: 'Bellavista',
    city: 'Barranquilla',
    occupation: 'Repostera',
    businessName: 'Pastelería Dulce Arte',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 17,
    status: 'ACTIVE',
    references: [
      { id: 'ref-17', fullName: 'Camilo Romero', relationship: 'Hijo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-18',
    fullName: 'Gustavo Adolfo Peña',
    documentNumber: '1044001122',
    phone: '3158899001',
    address: 'Calle 37 # 22 - 14',
    neighborhood: 'San José',
    city: 'Barranquilla',
    occupation: 'Cocinero',
    businessName: 'Comidas Rápidas Tavo',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 18,
    status: 'ACTIVE',
    references: [
      { id: 'ref-18', fullName: 'Yolanda Peña', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-19',
    fullName: 'Luz Dary Quintero',
    documentNumber: '1045112233',
    phone: '3169900112',
    address: 'Cra 23 # 41 - 25',
    neighborhood: 'Rebolo',
    city: 'Barranquilla',
    occupation: 'Tendera',
    businessName: 'Abarrotes Doña Luz',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 19,
    status: 'ACTIVE',
    references: [
      { id: 'ref-19', fullName: 'Álvaro Quintero', relationship: 'Esposo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-20',
    fullName: 'Héctor Fabio Valencia',
    documentNumber: '1046223344',
    phone: '3170011223',
    address: 'Calle 48 # 17 - 30',
    neighborhood: 'La Victoria',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Repuestos Valencia',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 20,
    status: 'ACTIVE',
    references: [
      { id: 'ref-20', fullName: 'Marcela Valencia', relationship: 'Hija', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-21',
    fullName: 'Yolanda Betancur',
    documentNumber: '1047334455',
    phone: '3181122334',
    address: 'Cra 14 # 35 - 19',
    neighborhood: 'Montes',
    city: 'Barranquilla',
    occupation: 'Costurera',
    businessName: 'Confecciones Yoly',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 21,
    status: 'ACTIVE',
    references: [
      { id: 'ref-21', fullName: 'Guillermo Betancur', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-22',
    fullName: 'Mauricio Restrepo',
    documentNumber: '1048445566',
    phone: '3192233445',
    address: 'Calle 56 # 26 - 12',
    neighborhood: 'Lucero',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Minimercado Mau',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 22,
    status: 'ACTIVE',
    references: [
      { id: 'ref-22', fullName: 'Patricia Restrepo', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-23',
    fullName: 'Tatiana Cárdenas',
    documentNumber: '1049556677',
    phone: '3203344556',
    address: 'Cra 30 # 50 - 45',
    neighborhood: 'Los Andes',
    city: 'Barranquilla',
    occupation: 'Estilista',
    businessName: 'Sala de Belleza Tati',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 23,
    status: 'ACTIVE',
    references: [
      { id: 'ref-23', fullName: 'Nelson Cárdenas', relationship: 'Esposo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-24',
    fullName: 'Gabriel Jaime Ochoa',
    documentNumber: '1040667788',
    phone: '3214455667',
    address: 'Calle 60 # 41 - 18',
    neighborhood: 'Boston',
    city: 'Barranquilla',
    occupation: 'Pizzero',
    businessName: 'Pizzería Don Gabriel',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 24,
    status: 'ACTIVE',
    references: [
      { id: 'ref-24', fullName: 'Elena Ochoa', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-25',
    fullName: 'Martha Cecilia Salazar',
    documentNumber: '1041778899',
    phone: '3225566778',
    address: 'Cra 42 # 32 - 04',
    neighborhood: 'Centro',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Bazar Central',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 25,
    status: 'ACTIVE',
    references: [
      { id: 'ref-25', fullName: 'David Salazar', relationship: 'Hijo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-26',
    fullName: 'Diego Fernando Rincón',
    documentNumber: '1042889900',
    phone: '3236677889',
    address: 'Calle 44 # 16 - 29',
    neighborhood: 'San Roque',
    city: 'Barranquilla',
    occupation: 'Operario',
    businessName: 'Lavado de Motos Diego',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 26,
    status: 'ACTIVE',
    references: [
      { id: 'ref-26', fullName: 'Gladys Rincón', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-27',
    fullName: 'Esperanza Guzmán',
    documentNumber: '1043990011',
    phone: '3007788990',
    address: 'Cra 20 # 43 - 15',
    neighborhood: 'Chiquinquirá',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Frutas & Verduras Espe',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 27,
    status: 'ACTIVE',
    references: [
      { id: 'ref-27', fullName: 'Tomas Guzmán', relationship: 'Hermano', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-28',
    fullName: 'Albeiro Cardona',
    documentNumber: '1044112200',
    phone: '3018899001',
    address: 'Calle 65 # 55 - 20',
    neighborhood: 'El Prado',
    city: 'Barranquilla',
    occupation: 'Electricista',
    businessName: 'Taller Eléctrico Albeiro',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 28,
    status: 'ACTIVE',
    references: [
      { id: 'ref-28', fullName: 'Silvia Cardona', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-29',
    fullName: 'Mónica Janeth Pineda',
    documentNumber: '1045223311',
    phone: '3029900112',
    address: 'Cra 48 # 62 - 10',
    neighborhood: 'Bellavista',
    city: 'Barranquilla',
    occupation: 'Diseñadora',
    businessName: 'Floristería Pétalos',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 29,
    status: 'ACTIVE',
    references: [
      { id: 'ref-29', fullName: 'César Pineda', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-30',
    fullName: 'César Augusto Montoya',
    documentNumber: '1046334422',
    phone: '3040011223',
    address: 'Calle 33 # 21 - 35',
    neighborhood: 'San José',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Asadero & Broaster César',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 30,
    status: 'ACTIVE',
    references: [
      { id: 'ref-30', fullName: 'Amparo Montoya', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-31',
    fullName: 'Nelly Rocío Parra',
    documentNumber: '1047445533',
    phone: '3051122334',
    address: 'Cra 25 # 39 - 18',
    neighborhood: 'Rebolo',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Miscelánea La Fe',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 31,
    status: 'ACTIVE',
    references: [
      { id: 'ref-31', fullName: 'Iván Parra', relationship: 'Esposo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-32',
    fullName: 'Javier Enrique Arango',
    documentNumber: '1048556644',
    phone: '3102233445',
    address: 'Calle 49 # 18 - 40',
    neighborhood: 'La Victoria',
    city: 'Barranquilla',
    occupation: 'Mecánico',
    businessName: 'Taller de Bicicletas Javi',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 32,
    status: 'ACTIVE',
    references: [
      { id: 'ref-32', fullName: 'Dora Arango', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-33',
    fullName: 'Sonia Margarita Duque',
    documentNumber: '1049667755',
    phone: '3113344556',
    address: 'Cra 15 # 34 - 22',
    neighborhood: 'Montes',
    city: 'Barranquilla',
    occupation: 'Cocinera',
    businessName: 'Arepas de Choclo Sonia',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 33,
    status: 'ACTIVE',
    references: [
      { id: 'ref-33', fullName: 'Rubén Duque', relationship: 'Hijo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-34',
    fullName: 'Víctor Manuel Correa',
    documentNumber: '1040778866',
    phone: '3124455667',
    address: 'Calle 58 # 27 - 09',
    neighborhood: 'Lucero',
    city: 'Barranquilla',
    occupation: 'Vidriero',
    businessName: 'Vidriería y Espejos Víctor',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 34,
    status: 'ACTIVE',
    references: [
      { id: 'ref-34', fullName: 'Flor Correa', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-35',
    fullName: 'Marisol Echeverri',
    documentNumber: '1041889977',
    phone: '3135566778',
    address: 'Cra 32 # 52 - 30',
    neighborhood: 'Los Andes',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Pañalera Huellitas',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 35,
    status: 'ACTIVE',
    references: [
      { id: 'ref-35', fullName: 'Jorge Echeverri', relationship: 'Hermano', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-36',
    fullName: 'Fabián Andrés Cano',
    documentNumber: '1042990088',
    phone: '3146677889',
    address: 'Calle 52 # 38 - 14',
    neighborhood: 'San Roque',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Salsamentaria El Paisa',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 36,
    status: 'ACTIVE',
    references: [
      { id: 'ref-36', fullName: 'Blanca Cano', relationship: 'Madre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-37',
    fullName: 'Olga Lucía Giraldo',
    documentNumber: '1043001199',
    phone: '3157788990',
    address: 'Cra 43 # 57 - 25',
    neighborhood: 'Boston',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Variedades Olguita',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 37,
    status: 'ACTIVE',
    references: [
      { id: 'ref-37', fullName: 'Jaime Giraldo', relationship: 'Esposo', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-38',
    fullName: 'Rodrigo Alberto Maya',
    documentNumber: '1044112299',
    phone: '3168899001',
    address: 'Calle 71 # 50 - 16',
    neighborhood: 'El Prado',
    city: 'Barranquilla',
    occupation: 'Barbero',
    businessName: 'Barbería Vintage Maya',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 38,
    status: 'ACTIVE',
    references: [
      { id: 'ref-38', fullName: 'Ana Maya', relationship: 'Hermana', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-39',
    fullName: 'Blanca Inés Holguín',
    documentNumber: '1045223399',
    phone: '3179900112',
    address: 'Cra 47 # 64 - 15',
    neighborhood: 'Bellavista',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Ropa & Accesorios Blanca',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 39,
    status: 'ACTIVE',
    references: [
      { id: 'ref-39', fullName: 'Darío Holguín', relationship: 'Padre', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
  {
    id: 'cust-40',
    fullName: 'Raúl Emilio Zapata',
    documentNumber: '1046334499',
    phone: '3180011223',
    address: 'Calle 39 # 20 - 28',
    neighborhood: 'San José',
    city: 'Barranquilla',
    occupation: 'Comerciante',
    businessName: 'Almacén de Aves Don Raúl',
    routeId: 'route-norte',
    assignedCollectorId: 'usr-col-1',
    orderIndex: 40,
    status: 'ACTIVE',
    references: [
      { id: 'ref-40', fullName: 'Clara Zapata', relationship: 'Esposa', phone: '3000000000' },
    ],
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
  },
];

function buildLoansAndInstallments(): { loans: Loan[]; installments: Installment[] } {
  const loans: Loan[] = [];
  const installments: Installment[] = [];

  // Crédito 1: Juan Pérez (Saldo pendiente exacto: $240000)
  const loan_1: Loan = {
    id: 'loan-001',
    loanNumber: '#00101',
    customerId: 'cust-1',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_1);

  {
    let currentRemaining = 240000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 18;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 18;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-001-inst-' + i,
        loanId: 'loan-001',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 2: Carlos Díaz (Saldo pendiente exacto: $300000)
  const loan_2: Loan = {
    id: 'loan-002',
    loanNumber: '#00102',
    customerId: 'cust-2',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_2);

  {
    let currentRemaining = 300000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 15;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 15;
        if (2 > 0 && unpaidIdx <= 2) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (2 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 2 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 2 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-002-inst-' + i,
        loanId: 'loan-002',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 3: María López (Saldo pendiente exacto: $360000)
  const loan_3: Loan = {
    id: 'loan-003',
    loanNumber: '#00103',
    customerId: 'cust-3',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_3);

  {
    let currentRemaining = 360000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 12;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 12;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-003-inst-' + i,
        loanId: 'loan-003',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 4: Pedro Gómez (Saldo pendiente exacto: $180000)
  const loan_4: Loan = {
    id: 'loan-004',
    loanNumber: '#00104',
    customerId: 'cust-4',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_4);

  {
    let currentRemaining = 180000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 21;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 21;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-004-inst-' + i,
        loanId: 'loan-004',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 5: Luisa Martínez (Saldo pendiente exacto: $420000)
  const loan_5: Loan = {
    id: 'loan-005',
    loanNumber: '#00105',
    customerId: 'cust-5',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_5);

  {
    let currentRemaining = 420000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 9;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 9;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-005-inst-' + i,
        loanId: 'loan-005',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 6: Andrés Castro (Saldo pendiente exacto: $300000)
  const loan_6: Loan = {
    id: 'loan-006',
    loanNumber: '#00106',
    customerId: 'cust-6',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_6);

  {
    let currentRemaining = 300000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 15;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 15;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-006-inst-' + i,
        loanId: 'loan-006',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 7: Gloria Ospina (Saldo pendiente exacto: $480000)
  const loan_7: Loan = {
    id: 'loan-007',
    loanNumber: '#00107',
    customerId: 'cust-7',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_7);

  {
    let currentRemaining = 480000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 6;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 6;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-007-inst-' + i,
        loanId: 'loan-007',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 8: Jhon Jairo Moreno (Saldo pendiente exacto: $240000)
  const loan_8: Loan = {
    id: 'loan-008',
    loanNumber: '#00108',
    customerId: 'cust-8',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_8);

  {
    let currentRemaining = 240000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 18;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 18;
        if (2 > 0 && unpaidIdx <= 2) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (2 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 2 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 2 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-008-inst-' + i,
        loanId: 'loan-008',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 9: Diana Marcela Ruiz (Saldo pendiente exacto: $360000)
  const loan_9: Loan = {
    id: 'loan-009',
    loanNumber: '#00109',
    customerId: 'cust-9',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_9);

  {
    let currentRemaining = 360000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 12;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 12;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-009-inst-' + i,
        loanId: 'loan-009',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 10: Fernando Herrera (Saldo pendiente exacto: $320000)
  const loan_10: Loan = {
    id: 'loan-010',
    loanNumber: '#00110',
    customerId: 'cust-10',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_10);

  {
    let currentRemaining = 320000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 14;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 14;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-010-inst-' + i,
        loanId: 'loan-010',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 11: Claudia Patricia Vega (Saldo pendiente exacto: $500000)
  const loan_11: Loan = {
    id: 'loan-011',
    loanNumber: '#00111',
    customerId: 'cust-11',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_11);

  {
    let currentRemaining = 500000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-011-inst-' + i,
        loanId: 'loan-011',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 12: Óscar Iván Morales (Saldo pendiente exacto: $450000)
  const loan_12: Loan = {
    id: 'loan-012',
    loanNumber: '#00112',
    customerId: 'cust-12',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 437500,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 87500,
    totalAgreed: 525000,
    installmentCount: 35,
    installmentAmount: 15000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_12);

  {
    let currentRemaining = 450000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 15000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-012-inst-' + i,
        loanId: 'loan-012',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 13: Paola Andrea Silva (Saldo pendiente exacto: $400000)
  const loan_13: Loan = {
    id: 'loan-013',
    loanNumber: '#00113',
    customerId: 'cust-13',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_13);

  {
    let currentRemaining = 400000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 10;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 10;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-013-inst-' + i,
        loanId: 'loan-013',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 14: Ricardo Antonio Ramos (Saldo pendiente exacto: $600000)
  const loan_14: Loan = {
    id: 'loan-014',
    loanNumber: '#00114',
    customerId: 'cust-14',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 583333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 116667,
    totalAgreed: 700000,
    installmentCount: 35,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_14);

  {
    let currentRemaining = 600000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (2 > 0 && unpaidIdx <= 2) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (2 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 2 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 2 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-014-inst-' + i,
        loanId: 'loan-014',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 15: Sandra Milena Torres (Saldo pendiente exacto: $350000)
  const loan_15: Loan = {
    id: 'loan-015',
    loanNumber: '#00115',
    customerId: 'cust-15',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 333333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 66667,
    totalAgreed: 400000,
    installmentCount: 40,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_15);

  {
    let currentRemaining = 350000;
    for (let i = 1; i <= 40; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-015-inst-' + i,
        loanId: 'loan-015',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 16: Wilson Javier Mendoza (Saldo pendiente exacto: $550000)
  const loan_16: Loan = {
    id: 'loan-016',
    loanNumber: '#00116',
    customerId: 'cust-16',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 60,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_16);

  {
    let currentRemaining = 550000;
    for (let i = 1; i <= 60; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-016-inst-' + i,
        loanId: 'loan-016',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 17: Adriana Lucía Romero (Saldo pendiente exacto: $400000)
  const loan_17: Loan = {
    id: 'loan-017',
    loanNumber: '#00117',
    customerId: 'cust-17',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_17);

  {
    let currentRemaining = 400000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 10;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 10;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-017-inst-' + i,
        loanId: 'loan-017',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 18: Gustavo Adolfo Peña (Saldo pendiente exacto: $450000)
  const loan_18: Loan = {
    id: 'loan-018',
    loanNumber: '#00118',
    customerId: 'cust-18',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 437500,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 87500,
    totalAgreed: 525000,
    installmentCount: 35,
    installmentAmount: 15000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_18);

  {
    let currentRemaining = 450000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 15000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-018-inst-' + i,
        loanId: 'loan-018',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 19: Luz Dary Quintero (Saldo pendiente exacto: $500000)
  const loan_19: Loan = {
    id: 'loan-019',
    loanNumber: '#00119',
    customerId: 'cust-19',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_19);

  {
    let currentRemaining = 500000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-019-inst-' + i,
        loanId: 'loan-019',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 20: Héctor Fabio Valencia (Saldo pendiente exacto: $300000)
  const loan_20: Loan = {
    id: 'loan-020',
    loanNumber: '#00120',
    customerId: 'cust-20',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_20);

  {
    let currentRemaining = 300000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 15;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 15;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-020-inst-' + i,
        loanId: 'loan-020',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 21: Yolanda Betancur (Saldo pendiente exacto: $480000)
  const loan_21: Loan = {
    id: 'loan-021',
    loanNumber: '#00121',
    customerId: 'cust-21',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_21);

  {
    let currentRemaining = 480000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 6;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 6;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-021-inst-' + i,
        loanId: 'loan-021',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 22: Mauricio Restrepo (Saldo pendiente exacto: $420000)
  const loan_22: Loan = {
    id: 'loan-022',
    loanNumber: '#00122',
    customerId: 'cust-22',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_22);

  {
    let currentRemaining = 420000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 9;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 9;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-022-inst-' + i,
        loanId: 'loan-022',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 23: Tatiana Cárdenas (Saldo pendiente exacto: $600000)
  const loan_23: Loan = {
    id: 'loan-023',
    loanNumber: '#00123',
    customerId: 'cust-23',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 583333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 116667,
    totalAgreed: 700000,
    installmentCount: 35,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_23);

  {
    let currentRemaining = 600000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-023-inst-' + i,
        loanId: 'loan-023',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 24: Gabriel Jaime Ochoa (Saldo pendiente exacto: $360000)
  const loan_24: Loan = {
    id: 'loan-024',
    loanNumber: '#00124',
    customerId: 'cust-24',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_24);

  {
    let currentRemaining = 360000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 12;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 12;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-024-inst-' + i,
        loanId: 'loan-024',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 25: Martha Cecilia Salazar (Saldo pendiente exacto: $540000)
  const loan_25: Loan = {
    id: 'loan-025',
    loanNumber: '#00125',
    customerId: 'cust-25',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 533333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 106667,
    totalAgreed: 640000,
    installmentCount: 32,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_25);

  {
    let currentRemaining = 540000;
    for (let i = 1; i <= 32; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-025-inst-' + i,
        loanId: 'loan-025',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 26: Diego Fernando Rincón (Saldo pendiente exacto: $480000)
  const loan_26: Loan = {
    id: 'loan-026',
    loanNumber: '#00126',
    customerId: 'cust-26',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_26);

  {
    let currentRemaining = 480000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 6;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 6;
        if (2 > 0 && unpaidIdx <= 2) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (2 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 2 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 2 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-026-inst-' + i,
        loanId: 'loan-026',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 27: Esperanza Guzmán (Saldo pendiente exacto: $420000)
  const loan_27: Loan = {
    id: 'loan-027',
    loanNumber: '#00127',
    customerId: 'cust-27',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_27);

  {
    let currentRemaining = 420000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 9;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 9;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-027-inst-' + i,
        loanId: 'loan-027',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 28: Albeiro Cardona (Saldo pendiente exacto: $600000)
  const loan_28: Loan = {
    id: 'loan-028',
    loanNumber: '#00128',
    customerId: 'cust-28',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 583333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 116667,
    totalAgreed: 700000,
    installmentCount: 35,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_28);

  {
    let currentRemaining = 600000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-028-inst-' + i,
        loanId: 'loan-028',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 29: Mónica Janeth Pineda (Saldo pendiente exacto: $450000)
  const loan_29: Loan = {
    id: 'loan-029',
    loanNumber: '#00129',
    customerId: 'cust-29',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 437500,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 87500,
    totalAgreed: 525000,
    installmentCount: 35,
    installmentAmount: 15000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_29);

  {
    let currentRemaining = 450000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 15000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-029-inst-' + i,
        loanId: 'loan-029',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 30: César Augusto Montoya (Saldo pendiente exacto: $450000)
  const loan_30: Loan = {
    id: 'loan-030',
    loanNumber: '#00130',
    customerId: 'cust-30',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 437500,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 87500,
    totalAgreed: 525000,
    installmentCount: 35,
    installmentAmount: 15000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_30);

  {
    let currentRemaining = 450000;
    for (let i = 1; i <= 35; i++) {
      const isPaid = i <= 5;
      let expAmt = 15000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-030-inst-' + i,
        loanId: 'loan-030',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 31: Nelly Rocío Parra (Saldo pendiente exacto: $640000)
  const loan_31: Loan = {
    id: 'loan-031',
    loanNumber: '#00131',
    customerId: 'cust-31',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 616667,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 123333,
    totalAgreed: 740000,
    installmentCount: 37,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_31);

  {
    let currentRemaining = 640000;
    for (let i = 1; i <= 37; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-031-inst-' + i,
        loanId: 'loan-031',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 32: Javier Enrique Arango (Saldo pendiente exacto: $512000)
  const loan_32: Loan = {
    id: 'loan-032',
    loanNumber: '#00132',
    customerId: 'cust-32',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 468333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 93667,
    totalAgreed: 562000,
    installmentCount: 57,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_32);

  {
    let currentRemaining = 512000;
    for (let i = 1; i <= 57; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-032-inst-' + i,
        loanId: 'loan-032',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 33: Sonia Margarita Duque (Saldo pendiente exacto: $480000)
  const loan_33: Loan = {
    id: 'loan-033',
    loanNumber: '#00133',
    customerId: 'cust-33',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_33);

  {
    let currentRemaining = 480000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 6;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 6;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-033-inst-' + i,
        loanId: 'loan-033',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 34: Víctor Manuel Correa (Saldo pendiente exacto: $320000)
  const loan_34: Loan = {
    id: 'loan-034',
    loanNumber: '#00134',
    customerId: 'cust-34',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_34);

  {
    let currentRemaining = 320000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 14;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 14;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-034-inst-' + i,
        loanId: 'loan-034',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 35: Marisol Echeverri (Saldo pendiente exacto: $608000)
  const loan_35: Loan = {
    id: 'loan-035',
    loanNumber: '#00135',
    customerId: 'cust-35',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 548333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 109667,
    totalAgreed: 658000,
    installmentCount: 66,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_35);

  {
    let currentRemaining = 608000;
    for (let i = 1; i <= 66; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (2 > 0 && unpaidIdx <= 2) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (2 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 2 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 2 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-035-inst-' + i,
        loanId: 'loan-035',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 36: Fabián Andrés Cano (Saldo pendiente exacto: $448000)
  const loan_36: Loan = {
    id: 'loan-036',
    loanNumber: '#00136',
    customerId: 'cust-36',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 415000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 83000,
    totalAgreed: 498000,
    installmentCount: 50,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_36);

  {
    let currentRemaining = 448000;
    for (let i = 1; i <= 50; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-036-inst-' + i,
        loanId: 'loan-036',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 37: Olga Lucía Giraldo (Saldo pendiente exacto: $500000)
  const loan_37: Loan = {
    id: 'loan-037',
    loanNumber: '#00137',
    customerId: 'cust-37',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_37);

  {
    let currentRemaining = 500000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 5;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-037-inst-' + i,
        loanId: 'loan-037',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 38: Rodrigo Alberto Maya (Saldo pendiente exacto: $350000)
  const loan_38: Loan = {
    id: 'loan-038',
    loanNumber: '#00138',
    customerId: 'cust-38',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 333333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 66667,
    totalAgreed: 400000,
    installmentCount: 40,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_38);

  {
    let currentRemaining = 350000;
    for (let i = 1; i <= 40; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-038-inst-' + i,
        loanId: 'loan-038',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 39: Blanca Inés Holguín (Saldo pendiente exacto: $400000)
  const loan_39: Loan = {
    id: 'loan-039',
    loanNumber: '#00139',
    customerId: 'cust-39',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 500000,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 100000,
    totalAgreed: 600000,
    installmentCount: 30,
    installmentAmount: 20000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_39);

  {
    let currentRemaining = 400000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 10;
      let expAmt = 20000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 10;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-039-inst-' + i,
        loanId: 'loan-039',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }
  // Crédito 40: Raúl Emilio Zapata (Saldo pendiente exacto: $242000)
  const loan_40: Loan = {
    id: 'loan-040',
    loanNumber: '#00140',
    customerId: 'cust-40',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    principal: 243333,
    interestRate: 0.20,
    interestType: 'FLAT_INITIAL_CAPITAL',
    interestAmount: 48667,
    totalAgreed: 292000,
    installmentCount: 30,
    installmentAmount: 10000,
    frequency: 'DAILY',
    startDate: '2026-08-20',
    endDate: '2026-09-30',
    status: 'ACTIVE',
    createdAt: '2026-08-20',
    updatedAt: '2026-09-19',
  };
  loans.push(loan_40);

  {
    let currentRemaining = 242000;
    for (let i = 1; i <= 30; i++) {
      const isPaid = i <= 5;
      let expAmt = 10000;
      let paidAmt = 0;
      let pendingAmt = 0;
      let status: 'PAGADA' | 'PENDIENTE' | 'VENCIDA' | 'PARCIAL' = 'PAGADA';
      let dueDate = '2026-09-19';

      if (isPaid) {
        paidAmt = expAmt;
        pendingAmt = 0;
        status = 'PAGADA';
        dueDate = '2026-08-' + String(10 + Math.min(18, i)).padStart(2, '0');
      } else {
        // Unpaid
        if (currentRemaining <= expAmt) {
          expAmt = currentRemaining;
          pendingAmt = currentRemaining;
          currentRemaining = 0;
        } else {
          pendingAmt = expAmt;
          currentRemaining -= expAmt;
        }
        paidAmt = 0;
        
        // Due date calculation
        const unpaidIdx = i - 5;
        if (0 > 0 && unpaidIdx <= 0) {
          status = 'VENCIDA';
          dueDate = '2026-09-' + String(19 - (0 - unpaidIdx + 1)).padStart(2, '0');
        } else if (unpaidIdx === 0 + 1) {
          status = 'PENDIENTE';
          dueDate = '2026-09-19'; // Hoy
        } else {
          status = 'PENDIENTE';
          dueDate = '2026-09-' + String(20 + (unpaidIdx - 0 - 1)).padStart(2, '0');
        }
      }

      installments.push({
        id: 'loan-040-inst-' + i,
        loanId: 'loan-040',
        installmentNumber: i,
        dueDate,
        expectedAmount: expAmt,
        paidAmount: paidAmt,
        pendingAmount: pendingAmt,
        status,
        lastPaymentDate: isPaid ? '2026-09-15' : undefined,
      });
    }
  }

  return { loans, installments };
}

export const { loans: INITIAL_LOANS, installments: INITIAL_INSTALLMENTS } = buildLoansAndInstallments();

export const INITIAL_SESSION: CollectionSession = {
  id: 'session-2026-09-19-norte',
  date: '2026-09-19',
  routeId: 'route-norte',
  collectorId: 'usr-col-1',
  status: 'OPEN',
  startTime: '07:30:00',
  expectedCollection: 780000,
  collectedAmount: 0,
  expectedCustomersCount: 40,
  visitedCustomersCount: 0,
  notes: 'Jornada iniciada con normalidad. Ruta completa de 40 clientes.',
};

export const INITIAL_PROMISES: PaymentPromise[] = [
  {
    id: 'prom-001',
    customerId: 'cust-5',
    loanId: 'loan-005',
    collectorId: 'usr-col-1',
    promisedAmount: 20000,
    promisedDate: '2026-09-19',
    status: 'PENDIENTE',
    notes: 'Promete pagar en la tarde después de las 4 PM en su peluquería',
    createdAt: '2026-09-18',
    updatedAt: '2026-09-18',
  },
  {
    id: 'prom-002',
    customerId: 'cust-12',
    loanId: 'loan-012',
    collectorId: 'usr-col-1',
    promisedAmount: 30000,
    promisedDate: '2026-09-19',
    status: 'PENDIENTE',
    notes: 'Abona al mediodía cuando abra el taller',
    createdAt: '2026-09-18',
    updatedAt: '2026-09-18',
  },
];

export const INITIAL_CASH_MOVEMENTS: CashMovement[] = [
  {
    id: 'cm-001',
    routeId: 'route-norte',
    collectorId: 'usr-col-1',
    sessionId: 'session-2026-09-19-norte',
    type: 'INCOME',
    category: 'ADJUSTMENT',
    amount: 3000000, // Base de $3.000.000 COP para prestar en mano
    description: 'Base de efectivo disponible para desembolsos y préstamos nuevos',
    createdAt: '2026-09-19 07:30:00',
  },
];
