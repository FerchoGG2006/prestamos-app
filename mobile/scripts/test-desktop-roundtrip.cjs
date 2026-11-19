// Actual legacy mobile engine, isolated AsyncStorage, fictitious JavaFX HTTP server only.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const endpoint = process.env.QA_SYNC_ENDPOINT;
if (!endpoint || new URL(endpoint).hostname !== '127.0.0.1' || !endpoint.includes('/enlace/')) {
  throw new Error('Only an explicitly supplied loopback QA pairing endpoint is allowed');
}
const values = new Map();
const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k,v) => { values.set(k,v); }, removeItem: async k => { values.delete(k); } };
const originalLoad = Module._load;
Module._load = function(name,parent,isMain) {
  if (name === '@react-native-async-storage/async-storage') return storage;
  return originalLoad.call(this,name,parent,isMain);
};
require.extensions['.ts'] = function(module, filename) {
 const result=ts.transpileModule(fs.readFileSync(filename,'utf8'), {fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 module._compile(result.outputText,filename);
};
const {localStore} = require(path.join(__dirname,'../src/infrastructure/storage/local-store.ts'));
const pause=()=>new Promise(resolve=>setTimeout(resolve,180));
(async()=>{
 const route=process.env.QA_ROUTE_ID, collector=process.env.QA_COLLECTOR_ID, oldLoan=process.env.QA_LOAN_ID, today=process.env.QA_TODAY;
 assert.ok(route && collector && oldLoan && today);
 await localStore.restoreFullBackupJSON(JSON.stringify({customers:[],loans:[],installments:[],payments:[],renewals:[],cashMovements:[],promises:[],nonPaymentVisits:[],settlements:[],auditLogs:[]}));
 await localStore.saveUsersAndRoutes([], [{id:route,name:'FICTITIOUS ROUNDTRIP',code:'QA',collectorId:collector,isActive:true,initialCashBase:0,targetAdministrative:0,expectedCustomersCount:1,createdAt:today}]);
 Object.assign(localStore.getActiveSession(),{routeId:route,collectorId:collector,date:today,status:'OPEN'});
 await localStore.pullRouteFromOfficeServer(endpoint,route);
 const downloaded=localStore.getLoans().find(l=>l.id===oldLoan);
 assert.equal(downloaded?.status,'ACTIVE','Downloaded credit must be operable by the actual mobile engine');
 assert.ok(localStore.getInstallmentsByLoanId(oldLoan).every(i=>Number.isFinite(i.expectedAmount) && i.expectedAmount>0),'Missing mobile expectedAmount');
 const before=localStore.getDailyRouteMetrics(today,route);
 assert.equal(before.activeCapitalInStreet,620000,'Opening debt');
 assert.equal(before.cashAvailableInHand,500000,'Opening physical cash');
 await localStore.recordPayment({loanId:oldLoan,amountReceived:20000,paymentMethod:'CASH',collectorId:collector,todayStr:today,idempotencyKey:'qa-roundtrip-cash-1'});
 const renewed=await localStore.recordRenewal({previousLoanId:oldLoan,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:today,paperworkFee:35000});
 assert.equal(renewed.renewal.previousBalanceDeducted,600000);
 assert.equal(renewed.renewal.actualCashDisbursed,65000);
 await localStore.recordPayment({loanId:renewed.newLoan.id,amountReceived:10000,paymentMethod:'NEQUI',collectorId:collector,todayStr:today,idempotencyKey:'qa-roundtrip-digital-1'});
 await pause(); await localStore.pushSyncToOfficeServer(endpoint,today);
 await pause(); await localStore.pushSyncToOfficeServer(endpoint,today); // A lost network response must not duplicate anything.
 await pause(); await localStore.pullRouteFromOfficeServer(endpoint,route);
 const mobile=localStore.getDailyRouteMetrics(today,route);
 assert.equal(mobile.activeCapitalInStreet,970000,'Debt after authoritative return');
 assert.equal(mobile.cashAvailableInHand,420000,'Cash after authoritative return');
 assert.equal(mobile.totalAdministrativeCapital,1400000,'Admin after authoritative return');
 assert.equal(localStore.getLoans().find(l=>l.id===oldLoan)?.status,'RENEWED','Old credit must stay closed by renewal');
 const result={mode:'real-mobile-engine-in-memory',physicalPhoneTransactions:false,route,oldLoan,newLoan:renewed.newLoan.id,openingDebt:620000,cashPayment:20000,newPrincipal:700000,rate:0.4,paperwork:35000,netDisbursed:65000,digitalPayment:10000,finalDebt:mobile.activeCapitalInStreet,finalCash:mobile.cashAvailableInHand,finalAdmin:mobile.totalAdministrativeCapital,paymentCount:localStore.getPayments().length,renewalCount:localStore.getRenewals().length,storage:'memory-only'};
 // A second empty in-memory client must reconstruct the same history without cached state.
 await localStore.restoreFullBackupJSON(JSON.stringify({customers:[],loans:[],installments:[],payments:[],renewals:[],cashMovements:[],promises:[],nonPaymentVisits:[],settlements:[],auditLogs:[]}));
 await pause(); await localStore.pullRouteFromOfficeServer(endpoint,route);
 const fresh=localStore.getDailyRouteMetrics(today,route);
 assert.equal(fresh.activeCapitalInStreet,970000,'Fresh-client debt');
 assert.equal(fresh.cashAvailableInHand,420000,'Fresh-client cash');
 assert.equal(fresh.totalAdministrativeCapital,1400000,'Fresh-client Admin');
 assert.equal(localStore.getPayments().length,2,'Fresh-client payments');
 assert.equal(localStore.getRenewals().length,1,'Fresh-client renewal history');
 assert.equal(localStore.getLoans().find(l=>l.id===oldLoan)?.status,'RENEWED');
 result.freshClientReconstruction=true;
 fs.writeFileSync(process.env.QA_RESULT_PATH,JSON.stringify(result,null,2));
 console.log('MOBILE_ENGINE_ROUNDTRIP PASS');
})().catch(error=>{console.error(String(error.stack||error).split(endpoint).join('[QA endpoint]'));process.exitCode=1;});
