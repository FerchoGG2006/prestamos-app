package com.cartera.payments.application;

import com.cartera.customers.application.CreateCustomerUseCase;
import com.cartera.infrastructure.persistence.entity.*;
import com.cartera.infrastructure.persistence.repository.*;
import com.cartera.infrastructure.security.*;
import com.cartera.collections.application.TodayCollectionsService;
import com.cartera.sync.infrastructure.LanSyncServerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import java.math.BigDecimal;
import java.nio.file.*;
import java.net.URI;
import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import static org.junit.jupiter.api.Assertions.*;

/** Cross-runtime integration: actual TS localStore + real HTTP + isolated SQLite. */
@SpringBootTest(properties="cartera.sync.port=0")
class MobileEngineRoundTripTest {
 @Autowired ApplicationContext context; @TempDir Path temporary;
 <T>T bean(Class<T> type){return context.getBean(type);}static BigDecimal n(String s){return new BigDecimal(s);}
 @AfterEach void clear(){UserSessionContext.clear();}
 @Test void actualMobileEnginePullPaymentRenewalPushReplayAndPull()throws Exception{
  UserSessionContext.setSession(new UserSession("usr-admin-1","admin","Admin","ADMIN"));
  String route="qa-engine-"+UUID.randomUUID(), collector="usr-col-engine-"+UUID.randomUUID();String today=LocalDate.now().toString();
  bean(AppUserRepository.class).save(new AppUserEntity(collector,collector,"unused-fixture","Fictitious collector",1,today));
  bean(RouteRepository.class).save(new RouteEntity(route,"Fictitious engine route",collector,1,today));
  var customer=bean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand("Fictitious roundtrip client",UUID.randomUUID().toString(),"3000000000",null,"Fictitious address","QA","QA",null,null,null,route,collector,"usr-admin-1"));
  String old=UUID.randomUUID().toString();
  bean(LoanRepository.class).save(new LoanEntity(old,customer.getId(),route,collector,null,"MIGRACION",n("800000"),n("0.4"),n("320000"),n("1120000"),2,"MENSUAL",LocalDate.now().minusMonths(1).toString(),LocalDate.now().plusMonths(1).toString(),"ACTIVO",today));
  bean(InstallmentRepository.class).save(new InstallmentEntity(old+"-paper",old,1,today,n("500000"),n("500000"),"PAGADA"));
  bean(InstallmentRepository.class).save(new InstallmentEntity(old+"-pending",old,2,LocalDate.now().plusMonths(1).toString(),n("620000"),BigDecimal.ZERO,"PENDIENTE"));
  bean(CashMovementRepository.class).save(new CashMovementEntity(UUID.randomUUID().toString(),route,collector,null,"INGRESO","CAPITAL_INJECTION",n("500000"),null,"Fictitious opening balance",today));
  var server=bean(LanSyncServerService.class);String tokenPath=URI.create(server.createPairingLink(route)).getRawPath();
  Path script=Path.of("..","mobile","scripts","test-desktop-roundtrip.cjs").toAbsolutePath().normalize();assertTrue(Files.isRegularFile(script));
  var process=new ProcessBuilder("node",script.toString());var env=process.environment();env.put("QA_SYNC_ENDPOINT","http://127.0.0.1:"+server.getPort()+tokenPath);env.put("QA_ROUTE_ID",route);env.put("QA_COLLECTOR_ID",collector);env.put("QA_LOAN_ID",old);env.put("QA_TODAY",today);env.put("QA_RESULT_PATH",temporary.resolve("result.json").toString());
  Path output=temporary.resolve("node.log");var running=process.redirectErrorStream(true).redirectOutput(output.toFile()).start();
  if(!running.waitFor(45,TimeUnit.SECONDS)){running.destroyForcibly();fail("Mobile engine timed out");}
  assertEquals(0,running.exitValue(),Files.readString(output));
  var result=new ObjectMapper().readTree(Files.readString(temporary.resolve("result.json")));
  var metrics=bean(TodayCollectionsService.class).getDailyMetricsForRoute(LocalDate.now(),route);
  assertEquals(0,n("420000").compareTo(metrics.cashBalance()));assertEquals(0,n("10000").compareTo(metrics.digitalBalance()));
  assertEquals(0,n("970000").compareTo(metrics.totalActiveDebt()));assertEquals(0,n("1400000").compareTo(metrics.totalAdministrativeCapital()));
  assertEquals("RENOVADO",bean(LoanRepository.class).findById(old).orElseThrow().getStatus());assertEquals(2,result.path("paymentCount").asInt());assertEquals(1,result.path("renewalCount").asInt());
  assertEquals(1,bean(PaymentRepository.class).findAll().stream().filter(p->"qa-roundtrip-cash-1".equals(p.getIdempotencyKey())).count());
  assertEquals(1,bean(PaymentRepository.class).findAll().stream().filter(p->"qa-roundtrip-digital-1".equals(p.getIdempotencyKey())).count());
  Path evidence=Path.of("build","qa","mobile-engine-roundtrip.json");Files.createDirectories(evidence.getParent());Files.copy(temporary.resolve("result.json"),evidence,StandardCopyOption.REPLACE_EXISTING);
 }
}
