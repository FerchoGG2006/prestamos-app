/** General renewal regression matrix; all persisted data lives in the test runner's Map. */
import { localStore, DEFAULT_OFFICE_CONFIG } from '../local-store';
import type { Loan, Installment, Customer, Route, LoanFrequency } from '../../../core/domain/types';
const day='2026-11-18',route='route-matrix',collector='matrix-collector';
let checks=0;
function snapshot(){const data=JSON.parse(localStore.exportFullBackupJSON());delete data.exportedAt;return JSON.stringify(data);}
function equal(actual:number,expected:number,label:string){checks++;if(actual!==expected)throw new Error(`${label}: expected ${expected}, got ${actual}`);}
function unchanged(actual:string,expected:string,label:string){checks++;if(actual!==expected)throw new Error(label);}
async function fixture(balance:number,cash:number,migrated=true,paid=0,paperwork=true){
 const total=balance+paid,principal=Math.round(total/1.2);
 const loan:Loan={id:'matrix-old',loanNumber:'#MATRIX',customerId:'matrix-customer',routeId:route,collectorId:collector,principal,interestRate:0.2,interestType:'FLAT_INITIAL_CAPITAL',interestAmount:total-principal,totalAgreed:total,installmentCount:1,installmentAmount:total,frequency:'MONTHLY',startDate:day,endDate:'2026-12-18',status:'ACTIVE',notes:migrated?'Migrado de cartulina física':'Préstamo regular',createdAt:day,updatedAt:day};
 const customer:Customer={id:loan.customerId,fullName:'FICTITIOUS MATRIX',documentNumber:'QA-MATRIX',phone:'3000000000',address:'QA',neighborhood:'QA',city:'QA',references:[],occupation:'QA',status:'ACTIVE',routeId:route,assignedCollectorId:collector,createdAt:day,updatedAt:day};
 const installment:Installment={id:'matrix-installment',loanId:loan.id,installmentNumber:1,dueDate:'2026-12-18',expectedAmount:total,paidAmount:paid,pendingAmount:balance,status:paid?'PARCIAL':'PENDIENTE'};
 const base=migrated?cash-paid:cash+principal-paid;
 const definition:Route={id:route,name:'FICTITIOUS MATRIX',code:'QA-MATRIX',collectorId:collector,isActive:true,initialCashBase:base,targetAdministrative:0,expectedCustomersCount:1,createdAt:day};
 await localStore.saveUsersAndRoutes([], [definition]);
 await localStore.restoreFullBackupJSON(JSON.stringify({customers:[customer],loans:[loan],installments:[installment],payments:[],renewals:[],cashMovements:[],promises:[],nonPaymentVisits:[],settlements:[],auditLogs:[],officeConfig:{...DEFAULT_OFFICE_CONFIG,paperworkFeeEnabled:paperwork}}));
 Object.assign(localStore.getActiveSession(),{routeId:route,collectorId:collector,date:day,status:'OPEN'});
 return loan;
}
async function validCase(balance:number,principal:number,fee:number,rate:number,migrated:boolean,freq:LoanFrequency='MONTHLY',count=2,cash=2000000,paid=0,paperwork=true,omitFee=false){
 const loan=await fixture(balance,cash,migrated,paid,paperwork);
 const before=localStore.getDailyRouteMetrics(day,route);equal(before.cashAvailableInHand,cash,'Opening cash');equal(before.activeCapitalInStreet,balance,'Opening debt');
 const command={previousLoanId:loan.id,newPrincipal:principal,interestRate:rate,installmentCount:count,frequency:freq,collectorId:collector,todayStr:day,...(omitFee?{}:{paperworkFee:fee})};
 const result=await localStore.recordRenewal(command);
 equal(result.renewal.previousBalanceDeducted,balance,'Deduct actual balance');equal(result.renewal.paperworkDeducted,fee,'Paperwork amount including zero');equal(result.renewal.actualCashDisbursed,principal-balance-fee,'Net is P-S-F');
 const after=localStore.getDailyRouteMetrics(day,route);const interest=Math.round(principal*rate),debt=principal+interest;
 equal(after.cashAvailableInHand,cash-(principal-balance),'Cash decreases by net plus paperwork');equal(after.activeCapitalInStreet,debt,'New agreed debt');equal(after.totalAdministrativeCapital,cash+balance+interest,'Admin increases only by new interest');equal(after.collectedToday,before.collectedToday,'Refinancing is not a payment');
 const savedSnapshot=snapshot();const persisted=(globalThis as any).__QA_STORAGE_SNAPSHOT__();localStore.getDailyRouteMetrics(day,route);unchanged(snapshot(),savedSnapshot,'Reading metrics must not rewrite saved records');unchanged((globalThis as any).__QA_STORAGE_SNAPSHOT__(),persisted,'Reading metrics rewrote persisted bytes');
 const data=JSON.parse(savedSnapshot);data.loans.reverse();await localStore.restoreFullBackupJSON(JSON.stringify(data));const reopened=localStore.getDailyRouteMetrics(day,route);
 equal(reopened.cashAvailableInHand,after.cashAvailableInHand,'Historical ordering after reopening');equal(reopened.totalAdministrativeCapital,after.totalAdministrativeCapital,'Admin after reopening');
 // Same command after response loss must not create another contract or outflow.
 const replay=await localStore.recordRenewal(command);unchanged(replay.newLoan.id,result.newLoan.id,'Replay identity');equal(localStore.getRenewals().length,1,'No duplicate renewal');
}
async function run(){
 let scenarios=0;
 for(const migrated of [true,false])for(const principal of [100000,350000,700000,1250000])for(const fee of [0,5000,35000])for(const rate of [0,0.1,0.2,0.4]){
  const balance=Math.floor(principal/2);if(principal-balance-fee<=0)continue;
  await validCase(balance,principal,fee,rate,migrated);scenarios++;
 }
 for(const frequency of ['DAILY','WEEKLY','BIWEEKLY','MONTHLY','FIXED_DATE'] as LoanFrequency[]){await validCase(120000,350000,0,0.2,true,frequency,frequency==='FIXED_DATE'?1:2);scenarios++;}
 // Disabled setting, explicit fee waiver, and configured fee must remain distinct.
 await validCase(620000,700000,0,0.4,true,'MONTHLY',2,500000,0,false,true);scenarios++;
 await validCase(620000,700000,0,0.4,true,'MONTHLY',2,500000,0,true,false);scenarios++;
 await validCase(620000,700000,35000,0.4,true,'MONTHLY',2,500000,0,true,true);scenarios++;
 await validCase(100000,350000,18000,0.2,true,'MONTHLY',2,1000000,0,true,true);scenarios++;
 await validCase(620000,700000,0,0.4,true,'MONTHLY',2,20000);scenarios++; // Never fabricate cash when cash is negative.
 await validCase(620000,700000,35000,0.4,true,'MONTHLY',2,500000,500000);scenarios++;
 // Payment before renewal: cash and digital both reduce debt, only cash changes physical cash.
 for(const method of ['CASH','NEQUI'] as const){
  const loan=await fixture(620000,500000);await localStore.recordPayment({loanId:loan.id,amountReceived:20000,paymentMethod:method,collectorId:collector,todayStr:day,idempotencyKey:'matrix-payment'});
  await localStore.recordRenewal({previousLoanId:loan.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:day,paperworkFee:0});
  const metrics=localStore.getDailyRouteMetrics(day,route);equal(metrics.cashAvailableInHand,method==='CASH'?420000:400000,'Payment method preserves physical cash');equal(metrics.collectedDigitalToday,method==='NEQUI'?20000:0,'Digital remains separate');equal(metrics.totalAdministrativeCapital,1400000,'Payment method does not invent Admin');scenarios++;
 }
 // Two renewals of successors: prior refinancing is never counted as collections.
 const loan=await fixture(200000,2000000);const first=await localStore.recordRenewal({previousLoanId:loan.id,newPrincipal:400000,interestRate:0.2,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:day,paperworkFee:0});
 await new Promise(resolve=>setTimeout(resolve,3));
 await localStore.recordRenewal({previousLoanId:first.newLoan.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:day,paperworkFee:35000});
 const chain=localStore.getDailyRouteMetrics(day,route);equal(chain.cashAvailableInHand,1580000,'Multiple renewals cash');equal(chain.activeCapitalInStreet,980000,'Only final contract active');equal(chain.totalAdministrativeCapital,2560000,'Interest from both renewals');equal(chain.collectedToday,0,'Neither compensation is collections');scenarios++;
 for(const bad of [{newPrincipal:0},{newPrincipal:-1},{newPrincipal:100000},{newPrincipal:620000},{newPrincipal:700000,paperworkFee:-1},{newPrincipal:700000,interestRate:-0.1},{newPrincipal:700000,installmentCount:0},{newPrincipal:NaN},{newPrincipal:Infinity},{newPrincipal:700000,paperworkFee:NaN},{newPrincipal:700000,paperworkFee:120000},{newPrincipal:700000,interestRate:Infinity},{newPrincipal:700000,installmentCount:1.5}]){
  const previous=await fixture(620000,500000);const saved=snapshot();let rejected=false;
  try{await localStore.recordRenewal(Object.assign({previousLoanId:previous.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY' as LoanFrequency,collectorId:collector,todayStr:day,paperworkFee:0},bad));}catch{rejected=true;}
  if(!rejected)throw new Error('Invalid renewal was accepted: '+JSON.stringify(bad));unchanged(snapshot(),saved,'Rejected renewal changed data');scenarios++;
 }
 for(const status of ['PAID','CANCELLED']){
  const current=await fixture(620000,500000);const data=JSON.parse(snapshot());data.loans[0].status=status;await localStore.restoreFullBackupJSON(JSON.stringify(data));
  const saved=snapshot();let rejected=false;try{await localStore.recordRenewal({previousLoanId:current.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:day,paperworkFee:0});}catch{rejected=true;}
  if(!rejected)throw new Error('Closed credit accepted renewal');unchanged(snapshot(),saved,'Closed credit changed');scenarios++;
 }
 {
  const current=await fixture(620000,500000);const data=JSON.parse(snapshot());data.settlements=[{id:'qa-settled',routeId:route,date:day,status:'SETTLED'}];await localStore.restoreFullBackupJSON(JSON.stringify(data));
  const saved=snapshot();let rejected=false;try{await localStore.recordRenewal({previousLoanId:current.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY',collectorId:collector,todayStr:day,paperworkFee:0});}catch{rejected=true;}
  if(!rejected)throw new Error('Closed day accepted renewal');unchanged(snapshot(),saved,'Closed day changed');scenarios++;
 }
 {
  const current=await fixture(620000,500000);const command={previousLoanId:current.id,newPrincipal:700000,interestRate:0.4,installmentCount:2,frequency:'MONTHLY' as LoanFrequency,collectorId:collector,todayStr:day,paperworkFee:0};
  await localStore.recordRenewal(command);const saved=snapshot();let rejected=false;try{await localStore.recordRenewal({...command,paperworkFee:35000});}catch{rejected=true;}
  if(!rejected)throw new Error('Replay with different conditions accepted');unchanged(snapshot(),saved,'Conflicting retry changed records');scenarios++;
 }
 console.log(`RENEWAL_MATRIX PASS scenarios=${scenarios} assertions=${checks}`);
}
export const renewalMatrixTests=run();
