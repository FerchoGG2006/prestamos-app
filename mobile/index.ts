import { registerRootComponent } from 'expo';
import * as Updates from 'expo-updates';

// Los APK con runtime 1.2.0 no traen los módulos nativos que usa la app actual.
// En ellos se carga solo la pantalla puente (require diferido: App.tsx nunca se ejecuta allí).
const LEGACY_RUNTIMES = ['1.2.0'];
const isLegacyBinary = LEGACY_RUNTIMES.includes(String(Updates.runtimeVersion ?? ''));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Root = isLegacyBinary
  ? require('./src/presentation/views/LegacyUpgradeScreen').default
  : require('./App').default;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
