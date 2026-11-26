// Run the legacy finance regressions against isolated, in-memory storage.
// No browser, office database or customer localStorage is accessed.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');

const values = new Map();
const storage = {
  getItem: async (key) => values.get(key) ?? null,
  setItem: async (key, value) => { values.set(key, value); },
  removeItem: async (key) => { values.delete(key); },
};
globalThis.__QA_STORAGE_SNAPSHOT__ = () => JSON.stringify([...values.entries()].sort(([a],[b]) => a.localeCompare(b)));
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === '@react-native-async-storage/async-storage') return storage;
  if (name === 'react-native') {
    return {
      Platform: { OS: 'web' },
      Linking: { openURL: async () => {} },
      Share: { share: async () => {} },
      Alert: { alert: () => {} },
    };
  }
  return originalLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = function (module, filename) {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};
// The legacy calculator suite uses console.assert; make failures fail the run.
console.assert = (condition, message) => assert.ok(condition, message);
require(path.join(__dirname, '../src/core/domain/__tests__/calculator.test.ts'));
(async () => {
  await require(path.join(__dirname, '../src/infrastructure/storage/__tests__/renewal-metrics.test.ts')).renewalMetricsTests;
  await require(path.join(__dirname, '../src/infrastructure/storage/__tests__/renewal-matrix.test.ts')).renewalMatrixTests;
  await require(path.join(__dirname, '../src/infrastructure/storage/__tests__/backup-and-newloan.test.ts')).backupAndNewLoanTests;
  await require(path.join(__dirname, '../src/infrastructure/storage/__tests__/paperwork-and-settlement.test.ts')).paperworkAndSettlementTests;
  await require(path.join(__dirname, '../src/infrastructure/sync/__tests__/cloud-sync-safety.test.ts')).cloudSyncSafetyTests;
  await require(path.join(__dirname, '../src/core/domain/__tests__/migration-and-renewal-fixed.test.ts')).migrationAndRenewalFixedTests;
  await require(path.join(__dirname, '../src/core/utils/__tests__/official-receipts.test.ts')).officialReceiptsTests;
})().catch(error => { console.error(error); process.exitCode = 1; });
