package com.cartera.payments.application;
import com.cartera.customers.application.*;
import com.cartera.infrastructure.backup.*;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.*;
import com.cartera.loans.application.*;
import com.cartera.settlement.application.*;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.cartera.sync.application.MobileSyncProcessorService;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.sql.DriverManager;
import java.time.*;
import java.util.*;
import java.util.zip.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties="cartera.sync.port=0")
class DesktopParityTest {
 @Autowired ApplicationContext ctx;@TempDir Path temporary;
 String collector,route;CustomerEntity customer;LoanEntity loan;
 <T>T bean(Class<T> type){return ctx.getBean(type);}static BigDecimal n(String s){return new BigDecimal(s);}
 @BeforeEach void setup(){
  UserSessionContext.setSession(new UserSession("usr-admin-1","admin","Admin","ADMIN"));
  collector="usr-col-test-"+UUID.randomUUID();route="route-test-"+UUID.randomUUID();
  bean(AppUserRepository.class).save(new AppUserEntity(collector,collector,"unused-fixture","Collector",1,LocalDate.now().toString()));
  bean(RouteRepository.class).save(new RouteEntity(route,"Test route",collector,1,LocalDate.now().toString()));
  customer=bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand("Fictitious",UUID.randomUUID().toString(),"3000000000",null,"Test address","Test zone","Test city",null,null,null,route,collector,"usr-admin-1"));
  loan=createLoan();
 }
 LoanEntity createLoan(){return bean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(customer.getId(),route,collector,n("300000"),n("0.2"),n("360000"),24,"DIARIO",LocalDate.now(),"usr-admin-1",n("15000")));}
 @AfterEach void clear(){UserSessionContext.clear();}
 RecordPaymentUseCase.PaymentExecutionResult pay(String id,String amount){return bean(RecordPaymentUseCase.class).execute(new RecordPaymentUseCase.RecordPaymentCommand(id,n(amount),"EFECTIVO",collector,LocalDate.now(),UUID.randomUUID().toString()));}
 BigDecimal balance(String id){return bean(InstallmentRepository.class).findByLoanId(id).stream().map(InstallmentEntity::getPendingAmount).reduce(BigDecimal.ZERO,BigDecimal::add);}
 @Test void deactivationRejectsPaymentsWithoutChangingCustomerLoanOrLedger(){
  var payment=pay(loan.getId(),"5000");long ledger=bean(CashMovementRepository.class).count();
  assertThrows(IllegalStateException.class,()->bean(CustomerLifecycleService.class).deactivate(customer.getId(),"Test rejection"));
  assertEquals("ACTIVO",bean(LoanRepository.class).findById(loan.getId()).orElseThrow().getStatus());
  assertEquals("ACTIVO",bean(CustomerRepository.class).findById(customer.getId()).orElseThrow().getStatus());
  assertEquals(ledger,bean(CashMovementRepository.class).count());assertFalse(bean(PaymentAllocationRepository.class).findByPaymentId(payment.paymentId()).isEmpty());
 }
 @Test void deactivationIsAtomicAcrossAllContracts(){
  var second=createLoan();pay(second.getId(),"5000");
  assertThrows(IllegalStateException.class,()->bean(CustomerLifecycleService.class).deactivate(customer.getId(),"Reject all"));
  assertEquals("ACTIVO",bean(LoanRepository.class).findById(loan.getId()).orElseThrow().getStatus());
  assertEquals("ACTIVO",bean(CustomerRepository.class).findById(customer.getId()).orElseThrow().getStatus());
 }
 @Test void successfulDeactivationPreservesHistoryAndReplaysWithoutDuplicateMoney(){
  var service=bean(CustomerLifecycleService.class);service.deactivate(customer.getId(),"Test deactivation");
  long cash=bean(CashMovementRepository.class).count(),audit=bean(AuditLogRepository.class).count();service.deactivate(customer.getId(),"Replay");
  assertEquals(cash,bean(CashMovementRepository.class).count());assertEquals(audit,bean(AuditLogRepository.class).count());
  assertEquals("INACTIVO",bean(CustomerRepository.class).findById(customer.getId()).orElseThrow().getStatus());
  assertEquals("ANULADO",bean(LoanRepository.class).findById(loan.getId()).orElseThrow().getStatus());assertEquals(0,bean(CashMovementUseCase.class).availableBalance(route).signum());
 }
 @Test void lifecycleRejectsCollectorAndSilentRouteTransfer(){
  UserSessionContext.setSession(new UserSession(collector,collector,"Collector","COBRADOR"));
  assertThrows(SecurityException.class,()->bean(CustomerLifecycleService.class).deactivate(customer.getId(),"Denied"));
  UserSessionContext.setSession(new UserSession("usr-admin-1","admin","Admin","ADMIN"));
  assertThrows(IllegalStateException.class,()->bean(CustomerLifecycleService.class).update(new CustomerLifecycleService.Profile(customer.getId(),"Changed","3000000000","Address","Zone","Shop","Work","route-sur")));
  assertEquals(route,bean(CustomerRepository.class).findById(customer.getId()).orElseThrow().getRouteId());
 }
 @Test void followUpPersistsAndDoesNotSynthesizePayments(){
  var follow=bean(FollowUpService.class);long payments=bean(PaymentRepository.class).count(),cash=bean(CashMovementRepository.class).count();String id=UUID.randomUUID().toString();
  follow.promise(id,loan.getId(),n("10000"),LocalDate.now(),"Test promise");follow.promise(id,loan.getId(),n("10000"),LocalDate.now(),"Test promise");
  assertThrows(IllegalArgumentException.class,()->follow.promise(id,loan.getId(),n("10001"),LocalDate.now(),"Test promise"));
  String visit=UUID.randomUUID().toString();follow.visit(visit,loan.getId(),"Customer absent");follow.visit(visit,loan.getId(),"Customer absent");
  assertEquals(1,follow.visits(customer.getId()).size());follow.resolve(id,"CUMPLIDA","User declaration only");
  assertEquals("CUMPLIDA",follow.promises(customer.getId()).getFirst().getStatus());assertEquals(payments,bean(PaymentRepository.class).count());assertEquals(cash,bean(CashMovementRepository.class).count());
  assertEquals(0,n("360000").compareTo(balance(loan.getId())));
 }
 @Test void followUpOwnershipAndInvalidTermsAreRejected(){
  var follow=bean(FollowUpService.class);assertThrows(IllegalArgumentException.class,()->follow.promise(UUID.randomUUID().toString(),loan.getId(),n("360001"),LocalDate.now(),"Invalid"));
  assertThrows(IllegalArgumentException.class,()->follow.promise(UUID.randomUUID().toString(),loan.getId(),n("1"),LocalDate.now().minusDays(1),"Invalid"));
  UserSessionContext.setSession(new UserSession("usr-col-1","other","Other","COBRADOR"));assertThrows(SecurityException.class,()->follow.visit(UUID.randomUUID().toString(),loan.getId(),"Denied"));
 }
 Path file()throws Exception{return Files.writeString(temporary.resolve("example.pdf"),"%PDF-1.4 synthetic test attachment");}
 @Test void managedAttachmentSurvivesReplayAndRollbackRemovesUncommittedCopy()throws Exception{
  var files=bean(AttachmentService.class);var source=file();String id=UUID.randomUUID().toString();var saved=files.attach(id,customer.getId(),source);
  assertEquals(saved.getStoredName(),files.attach(id,customer.getId(),source).getStoredName());assertNotEquals(source,files.openPath(id));assertEquals(AttachmentService.hash(source),AttachmentService.hash(files.openPath(id)));
  String rolled=UUID.randomUUID().toString();final Path[] copied={null};new TransactionTemplate(bean(PlatformTransactionManager.class)).executeWithoutResult(status->{files.attach(rolled,customer.getId(),source);copied[0]=files.openPath(rolled);status.setRollbackOnly();});
  assertFalse(Files.exists(copied[0]));assertTrue(bean(CustomerAttachmentRepository.class).findById(rolled).isEmpty());
 }
 @Test void completeRecoveryPreservesClosedSettlementAndAttachmentWithoutChangingLiveOffice()throws Exception{
  var attachment=bean(AttachmentService.class).attach(UUID.randomUUID().toString(),customer.getId(),file());pay(loan.getId(),"10000");
  var settlement=bean(SettlementUseCase.class);var summary=settlement.getOrCreateDaySummary(collector,LocalDate.now());var closed=settlement.closeSettlement(summary.sessionId(),n("10000"),"Test close","usr-admin-1");
  var recovery=bean(OfficeRecoveryService.class);Path archive=recovery.exportOffice(temporary.resolve("office.zip"));
  long liveCount=bean(CustomerRepository.class).count();Path recovered=recovery.recover(archive,temporary,"Isolated test");
  assertEquals(liveCount,OfficeRecoveryService.inspect(recovered.resolve("cartera.db")).customers());
  assertEquals(liveCount,bean(CustomerRepository.class).count());assertEquals(attachment.getSha256(),AttachmentService.hash(recovered.resolve("attachments").resolve(attachment.getStoredName())));
  try(var connection=DriverManager.getConnection("jdbc:sqlite:"+recovered.resolve("cartera.db"));var statement=connection.prepareStatement("SELECT count(*) FROM daily_settlement WHERE id=?")){statement.setString(1,closed.getId());try(var row=statement.executeQuery()){row.next();assertEquals(1,row.getInt(1));}}
 }
 @Test void invalidRecoveryAndTraversalCannotOverwriteExistingFiles()throws Exception{
  Path marker=Files.writeString(temporary.resolve("keep.txt"),"Keep unchanged"),bad=Files.writeString(temporary.resolve("bad.db"),"not SQLite");
  var recovery=bean(OfficeRecoveryService.class);assertThrows(IllegalStateException.class,()->recovery.recover(bad,temporary,"Rejected"));
  Path zip=temporary.resolve("unsafe.zip");try(var out=new ZipOutputStream(Files.newOutputStream(zip))){out.putNextEntry(new ZipEntry("../keep.txt"));out.write("Changed".getBytes());out.closeEntry();}
  assertThrows(IllegalStateException.class,()->recovery.recover(zip,temporary,"Rejected"));assertEquals("Keep unchanged",Files.readString(marker));
 }
 private HttpResponse<String> http(String method,String url,String body)throws Exception{
  Thread.sleep(170);var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(15));
  return HttpClient.newHttpClient().send(method.equals("GET")?request.GET().build():request.header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(),HttpResponse.BodyHandlers.ofString());
 }
 ObjectNode legacyPackage(){
  var pkg=new ObjectMapper().createObjectNode().put("operatingDate",LocalDate.now().toString()).put("routeId",route).put("collectorId",collector);
  String next="mobile-"+UUID.randomUUID();pkg.putArray("newLoans").addObject().put("id",next).put("customerId",customer.getId()).put("routeId",route).put("collectorId",collector)
   .put("principal",100000).put("interestRate",n("0.2")).put("totalAgreed",120000).put("installmentCount",1).put("frequency","MONTHLY").put("status","ACTIVE").put("startDate",LocalDate.now().toString());
  String inst=next+"-cuota-1";pkg.putArray("installments").addObject().put("id",inst).put("loanId",next).put("installmentNumber",1).put("expectedAmount",120000).put("paidAmount",5000).put("status","PARCIAL").put("dueDate",LocalDate.now().plusMonths(1).toString());
  pkg.putArray("cashMovements").addObject().put("id",UUID.randomUUID().toString()).put("referenceId",next).put("type","EXPENSE").put("category","LOAN_DISBURSEMENT").put("amount",95000);
  pkg.putArray("payments").addObject().put("id",UUID.randomUUID().toString()).put("loanId",next).put("amountReceived","5000").put("paymentMethod","CASH").put("createdAt",LocalDate.now().toString());return pkg;
 }
 @Test void realLegacySnapshotViaHttpPostsOnceAndDoesNotDoubleApplyPaidAmount()throws Exception{
  var server=bean(LanSyncServerService.class);String link=server.createPairingLink(route);var pkg=legacyPackage();String next=pkg.path("newLoans").get(0).path("id").asText();
  assertEquals(200,http("POST",link+"/api/sync/push",pkg.toString()).statusCode());assertEquals(0,n("115000").compareTo(balance(next)));
  assertEquals("MENSUAL",bean(LoanRepository.class).findById(next).orElseThrow().getFrequency());
  var before=bean(CashMovementUseCase.class).availableBalance(route);assertEquals(0,n("-375000").compareTo(before));
  assertEquals(200,http("POST",link+"/api/sync/push",pkg.toString()).statusCode());assertEquals(0,before.compareTo(bean(CashMovementUseCase.class).availableBalance(route)));
 }
 @Test void httpRequiresPairingScopesRoutesAndRevokesLinks()throws Exception{
  var server=bean(LanSyncServerService.class);String base="http://127.0.0.1:"+server.getPort();
  assertEquals(200,http("GET",base+"/api/sync/status",null).statusCode());assertEquals(401,http("GET",base+"/api/sync/pull?routeId="+route,null).statusCode());
  bean(SystemSettingRepository.class).save(new SystemSettingEntity("private_secret_key","never-export",LocalDate.now().toString()));
  String link=server.createPairingLink(route);var response=http("GET",link+"/api/sync/pull?routeId=ALL",null);assertEquals(200,response.statusCode());
  var payload=new ObjectMapper().readTree(response.body());assertEquals(route,payload.path("routeId").asText());assertFalse(response.body().contains("never-export"));
  var wrong=legacyPackage().put("routeId","route-sur");assertEquals(403,http("POST",link+"/api/sync/push",wrong.toString()).statusCode());
  server.revokePairings();assertEquals(401,http("GET",link+"/api/sync/pull",null).statusCode());
 }
 @Test void predecessorPaymentThenRenewalThenSuccessorPaymentReplaysConsistently(){
  var pkg=legacyPackage();var next=(ObjectNode)pkg.path("newLoans").get(0);String nextId=next.path("id").asText();
  next.put("principal",700000).put("interestRate",n("0.4")).put("totalAgreed",980000).put("installmentCount",2).put("previousLoanId",loan.getId());
  var installments=pkg.putArray("installments");for(int number=1;number<=2;number++)installments.addObject().put("id",nextId+"-cuota-"+number).put("loanId",nextId).put("installmentNumber",number).put("expectedAmount",490000).put("paidAmount",number==1?10000:0).put("dueDate",LocalDate.now().plusMonths(number).toString());
  var payments=pkg.putArray("payments");payments.addObject().put("id",UUID.randomUUID().toString()).put("loanId",loan.getId()).put("amountReceived",5000).put("paymentMethod","CASH").put("createdAt",LocalDate.now().toString());
  payments.addObject().put("id",UUID.randomUUID().toString()).put("loanId",nextId).put("amountReceived",10000).put("paymentMethod","CASH").put("createdAt",LocalDate.now().toString());
  pkg.putArray("cashMovements");pkg.putArray("renewals").addObject().put("id",UUID.randomUUID().toString()).put("previousLoanId",loan.getId()).put("newLoanId",nextId).put("newPrincipal",700000).put("previousBalanceDeducted",355000).put("paperworkDeducted",35000).put("actualCashDisbursed",310000);
  var sync=bean(MobileSyncProcessorService.class);sync.importPackage(pkg.toString());
  assertEquals(0,n("970000").compareTo(balance(nextId)));assertEquals("RENOVADO",bean(LoanRepository.class).findById(loan.getId()).orElseThrow().getStatus());
  var cash=bean(CashMovementUseCase.class).availableBalance(route);assertEquals(0,n("-615000").compareTo(cash));sync.importPackage(pkg.toString());
  assertEquals(0,cash.compareTo(bean(CashMovementUseCase.class).availableBalance(route)));
 }
 @Test void migrationBaselineSubtractsUploadedAllocationBeforeApplyingPayment(){
  var pkg=legacyPackage();var next=(ObjectNode)pkg.path("newLoans").get(0);next.put("notes","Migrado de cartulina física ficticia");String id=next.path("id").asText();
  var installment=(ObjectNode)pkg.path("installments").get(0);installment.put("paidAmount",15000);
  var payment=(ObjectNode)pkg.path("payments").get(0);payment.putArray("allocations").addObject().put("installmentId",id+"-cuota-1").put("amountApplied",5000);
  pkg.putArray("cashMovements");bean(MobileSyncProcessorService.class).importPackage(pkg.toString());
  assertEquals(0,n("105000").compareTo(balance(id)));assertEquals(0,n("-280000").compareTo(bean(CashMovementUseCase.class).availableBalance(route)));
 }
 @Test void closedDayRejectsHttpBundleWithoutPartialWrites()throws Exception{
  var settlement=bean(SettlementUseCase.class);var summary=settlement.getOrCreateDaySummary(collector,LocalDate.now());settlement.closeSettlement(summary.sessionId(),BigDecimal.ZERO,"Empty test day","usr-admin-1");
  long count=bean(LoanRepository.class).count(),cash=bean(CashMovementRepository.class).count();var server=bean(LanSyncServerService.class);
  assertEquals(400,http("POST",server.createPairingLink(route)+"/api/sync/push",legacyPackage().toString()).statusCode());
  assertEquals(count,bean(LoanRepository.class).count());assertEquals(cash,bean(CashMovementRepository.class).count());
 }
 @Test void collectorCannotExportAnotherRouteOrTheConsolidatedOffice(){
  UserSessionContext.setSession(new UserSession(collector,collector,"Collector","COBRADOR"));
  var sync=bean(MobileSyncProcessorService.class);
  assertThrows(SecurityException.class,()->sync.exportRoutePackage("ALL",LocalDate.now()));
  assertThrows(SecurityException.class,()->sync.exportRoutePackage("route-sur",LocalDate.now()));
  assertTrue(sync.exportRoutePackage(route,LocalDate.now()).contains(customer.getId()));
 }
 @Test void incompleteSnapshotCannotSilentlyLosePaymentsOrCreateDuplicateLoans(){
  var pkg=legacyPackage();pkg.putArray("payments");long count=bean(LoanRepository.class).count();
  assertThrows(IllegalArgumentException.class,()->bean(MobileSyncProcessorService.class).importPackage(pkg.toString()));assertEquals(count,bean(LoanRepository.class).count());
  var missing=legacyPackage();((ObjectNode)missing.path("newLoans").get(0)).remove("id");
  assertThrows(IllegalArgumentException.class,()->bean(MobileSyncProcessorService.class).importPackage(missing.toString()));assertEquals(count,bean(LoanRepository.class).count());
 }
 @Test void ambiguousReversalSnapshotIsRejectedWithoutAnyFinancialWrite(){
  var pkg=legacyPackage();((ArrayNode)pkg.path("cashMovements")).addObject().put("category","PAYMENT_REVERSAL");long count=bean(LoanRepository.class).count();
  assertThrows(IllegalArgumentException.class,()->bean(MobileSyncProcessorService.class).importPackage(pkg.toString()));assertEquals(count,bean(LoanRepository.class).count());
 }
}
