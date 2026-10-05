import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ApiStackProps extends cdk.StackProps {
  invoicesTable: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // 1. Definimos la función Lambda usando NodejsFunction (CDK compila TypeScript automáticamente por ti)
    const createInvoiceLambda = new nodejs.NodejsFunction(this, 'CreateInvoiceLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../src/invoices/create-handler.ts'),
      handler: 'handler',
      environment: {
        TABLE_NAME: props.invoicesTable.tableName,
      },
      bundling: {
        format: nodejs.OutputFormat.ESM, // Mantiene la compatibilidad con tu configuración ESM (nodenext)
        target: 'esnext',
      },
    });

    // 2. Otorgamos permisos de escritura a la Lambda sobre la tabla de DynamoDB (Least Privilege)
    props.invoicesTable.grantWriteData(createInvoiceLambda);

    // 3. Creamos el API Gateway (REST API)
    const api = new apigateway.RestApi(this, 'BillingApi', {
      restApiName: 'Billing Service',
      description: 'API for event-driven billing backend',
      deployOptions: {
        stageName: 'dev',
      },
    });

    // 4. Configuramos la ruta POST /invoices
    const invoicesResource = api.root.addResource('invoices');
    invoicesResource.addMethod('POST', new apigateway.LambdaIntegration(createInvoiceLambda));
  }
}