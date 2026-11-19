package com.cartera.qa;
import com.cartera.customers.application.*;
import com.cartera.loans.application.CreateLoanUseCase;
import com.cartera.infrastructure.security.*;
import com.cartera.ui.CarteraApplication;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Disposable data only; never opens the real office or phone database. */
public class ParityQaLauncher {
 public static void main(String[] args)throws Exception{
  var home=OfficeQaLauncher.isolate("parity-ui");
  try(var context=OfficeQaLauncher.open()){
   OfficeQaLauncher.seed(context);context.getBean(AuthService.class).authenticate("qaadmin",OfficeQaLauncher.PASSWORD).orElseThrow();
   var customer=context.getBean(CreateCustomerUseCase.class).execute(new CreateCustomerUseCase.CreateCustomerCommand(
    "QA Seguimiento Ficticio","QA-PARITY-001","3000000000",null,"Calle ficticia","Barrio QA","Ciudad QA",null,null,"Solo pruebas","route-norte","usr-col-1","usr-admin-1"));
   var loan=context.getBean(CreateLoanUseCase.class).execute(new CreateLoanUseCase.CreateLoanCommand(customer.getId(),"route-norte","usr-col-1",new BigDecimal("300000"),new BigDecimal("0.2"),new BigDecimal("360000"),24,"DIARIO",LocalDate.now(),"usr-admin-1",new BigDecimal("15000")));
   context.getBean(FollowUpService.class).promise(UUID.randomUUID().toString(),loan.getId(),new BigDecimal("10000"),LocalDate.now(),"Compromiso ficticio para revisar pantalla");
   var sample=java.nio.file.Files.writeString(home.resolve("ficticio.pdf"),"%PDF-1.4 synthetic QA file");
   context.getBean(AttachmentService.class).attach(UUID.randomUUID().toString(),customer.getId(),sample);
  }finally{UserSessionContext.clear();}
  System.out.println("PARITY_QA_OFFICE="+home.resolve(".sistema-cartera"));
  if(java.util.Arrays.asList(args).contains("--seed-only"))return;
  javafx.application.Application.launch(CarteraApplication.class,args);
 }
}
