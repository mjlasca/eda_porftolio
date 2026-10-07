import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface InvoicesStackProps extends cdk.StackProps {
  /** API Gateway compartido: aquí se registran las rutas de facturas. */
  api: apigateway.RestApi;
  /** Tabla única de DynamoDB (Single Table Design). */
  invoicesTable: dynamodb.Table;
  /** Bus global de EventBridge: emisión de eventos de dominio (InvoiceCreated). */
  eventBus: events.EventBus;
}

/**
 * Dominio Facturas.
 *
 * Lambdas + rutas:
 *   POST /invoices        -> create-handler.ts
 *   GET  /invoices        -> list-handler.ts
 *   GET  /invoices/{id}   -> get-handler.ts
 *
 * El recurso `/invoices/{id}` se crea aquí porque es la raíz del dominio:
 * payments y documents cuelgan de él (deben construirse después).
 */
export class InvoicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InvoicesStackProps) {
    super(scope, id, props);

    const environment = {
      TABLE_NAME: props.invoicesTable.tableName,
    };

    const bundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.ESM, // Compatibilidad con "type": "module" (nodenext)
      target: 'esnext',
    };

    const createInvoiceLambda = new nodejs.NodejsFunction(this, 'CreateInvoiceLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/invoices/create-handler.ts'),
      handler: 'handler',
      environment: {
        ...environment,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
      bundling,
    });

    const listInvoicesLambda = new nodejs.NodejsFunction(this, 'ListInvoicesLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/invoices/list-handler.ts'),
      handler: 'handler',
      environment,
      bundling,
    });

    const getInvoiceLambda = new nodejs.NodejsFunction(this, 'GetInvoiceLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/invoices/get-handler.ts'),
      handler: 'handler',
      environment,
      bundling,
    });

    // Least Privilege sobre la tabla y sobre el bus de eventos
    props.invoicesTable.grantWriteData(createInvoiceLambda);
    props.eventBus.grantPutEventsTo(createInvoiceLambda);
    props.invoicesTable.grantReadData(listInvoicesLambda);
    props.invoicesTable.grantReadData(getInvoiceLambda);

    // Rutas del dominio sobre el API compartido
    const invoicesResource = props.api.root.addResource('invoices');
    invoicesResource.addMethod('POST', new apigateway.LambdaIntegration(createInvoiceLambda));
    invoicesResource.addMethod('GET', new apigateway.LambdaIntegration(listInvoicesLambda));

    const invoiceByIdResource = invoicesResource.addResource('{id}');
    invoiceByIdResource.addMethod('GET', new apigateway.LambdaIntegration(getInvoiceLambda));
  }
}
