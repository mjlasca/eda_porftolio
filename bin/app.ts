#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../infra/database-stack.js';
import { StorageStack } from '../infra/storage-stack.js';
import { EventsStack } from '../infra/events-stack.js';
import { ApiGatewayStack } from '../infra/api/api-gateway-stack.js';
import { InvoicesStack } from '../infra/api/invoices-stack.js';
import { PaymentsStack } from '../infra/api/payments-stack.js';
import { DocumentsStack } from '../infra/api/documents-stack.js';

const app = new cdk.App();

function stackEnv(): cdk.Environment {
  const account = process.env.CDK_DEFAULT_ACCOUNT;
  const region = process.env.CDK_DEFAULT_REGION || 'us-east-1';
  return account ? { account, region } : { region };
}

const env = stackEnv();

// ── Infraestructura global ────────────────────────────────────────────────
const databaseStack = new DatabaseStack(app, 'BillingDatabaseStack', { env });
const storageStack = new StorageStack(app, 'BillingStorageStack', { env });
const eventsStack = new EventsStack(app, 'BillingEventsStack', { env });

// ── API compartida ────────────────────────────────────────────────────────
// Debe construirse primero: los stacks de dominio le registran sus rutas.
const apiGatewayStack = new ApiGatewayStack(app, 'BillingApiGatewayStack', { env });

// ── Dominios (orden de construcción importante) ───────────────────────────
// 1. invoices crea /invoices y /invoices/{id}
const invoicesStack = new InvoicesStack(app, 'BillingInvoicesStack', {
  env,
  api: apiGatewayStack.api,
  invoicesTable: databaseStack.invoicesTable,
  eventBus: eventsStack.eventBus,
});

// 2. payments añade POST /invoices/{id}/payment
const paymentsStack = new PaymentsStack(app, 'BillingPaymentsStack', {
  env,
  api: apiGatewayStack.api,
  invoicesTable: databaseStack.invoicesTable,
  eventBus: eventsStack.eventBus,
});

// 3. documents añade POST /invoices/{id}/document/upload-url
const documentsStack = new DocumentsStack(app, 'BillingDocumentsStack', {
  env,
  api: apiGatewayStack.api,
  documentsBucket: storageStack.documentsBucket,
  eventBus: eventsStack.eventBus,
});

// Orden de despliegue explícito (además del que CDK infiere por referencias)
invoicesStack.addStackDependency(databaseStack);
invoicesStack.addStackDependency(eventsStack);
paymentsStack.addStackDependency(databaseStack);
paymentsStack.addStackDependency(eventsStack);
paymentsStack.addStackDependency(invoicesStack);
documentsStack.addStackDependency(storageStack);
documentsStack.addStackDependency(eventsStack);
documentsStack.addStackDependency(invoicesStack);
