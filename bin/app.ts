#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DatabaseStack } from '../infra/database-stack.js';
import { ApiStack } from '../infra/api-stack.js';

const app = new cdk.App();

// 1. Instanciamos la base de datos
const databaseStack = new DatabaseStack(app, 'BillingDatabaseStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

// 2. Instanciamos la API y le inyectamos la tabla como dependencia
const apiStack = new ApiStack(app, 'BillingApiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  invoicesTable: databaseStack.invoicesTable,
});

// Aseguramos que la base de datos se cree antes de levantar la API
apiStack.addDependency(databaseStack);