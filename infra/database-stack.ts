import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class DatabaseStack extends cdk.Stack {
  // Exponemos la tabla públicamente para que otros stacks (como API o Lambdas) puedan referenciarla
  public readonly invoicesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.invoicesTable = new dynamodb.Table(this, 'InvoicesTable', {
      tableName: 'invoices',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      // Modo On-Demand: No provisionas RCU/WCU, pagas por lo que usas (ideal para Serverless)
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // DESTROY elimina la tabla si haces cdk destroy. En producción usarías RETAIN.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}