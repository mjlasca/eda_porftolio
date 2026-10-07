import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PaymentsStackProps extends cdk.StackProps {
  /** API Gateway compartido. */
  api: apigateway.RestApi;
  /** Tabla única de DynamoDB (Single Table Design). */
  invoicesTable: dynamodb.Table;
  /** Bus global de EventBridge: emisión de eventos de dominio (PaymentRegistered). */
  eventBus: events.EventBus;
}

/**
 * Dominio Pagos.
 *
 * Lambdas + rutas:
 *   POST /invoices/{id}/payment -> register-handler.ts
 *
 * El recurso `/invoices/{id}` lo creó InvoicesStack, por eso este stack debe
 * construirse (y desplegarse) después de él: bin/app.ts encadena esa orden.
 */
export class PaymentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PaymentsStackProps) {
    super(scope, id, props);

    const registerPaymentLambda = new nodejs.NodejsFunction(this, 'RegisterPaymentLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/payments/register-handler.ts'),
      handler: 'handler',
      environment: {
        TABLE_NAME: props.invoicesTable.tableName,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'esnext',
      },
    });

    // Least Privilege sobre la tabla y sobre el bus de eventos
    // (lectura para validar el estado de la factura antes de pagar)
    props.invoicesTable.grantReadData(registerPaymentLambda);
    props.invoicesTable.grantWriteData(registerPaymentLambda);
    props.eventBus.grantPutEventsTo(registerPaymentLambda);

    // grantWriteData() no incluye esta acción, necesaria para TransactWriteCommand
    registerPaymentLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:TransactWriteItems'],
        resources: [props.invoicesTable.tableArn],
      }),
    );

    // POST /invoices/{id}/payment
    const invoicesResource = props.api.root.getResource('invoices');
    const invoiceByIdResource = invoicesResource?.getResource('{id}');
    if (!invoicesResource || !invoiceByIdResource) {
      throw new Error(
        'No existe /invoices/{id}. InvoicesStack debe construirse antes que PaymentsStack (ver bin/app.ts)',
      );
    }
    const paymentResource = invoiceByIdResource.addResource('payment');
    paymentResource.addMethod('POST', new apigateway.LambdaIntegration(registerPaymentLambda));
  }
}
