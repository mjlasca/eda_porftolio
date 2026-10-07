import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DocumentsStackProps extends cdk.StackProps {
  /** API Gateway compartido. */
  api: apigateway.RestApi;
  /** Bucket S3 de documentos (creado en StorageStack). */
  documentsBucket: s3.Bucket;
  /** Bus global de EventBridge: emisión de eventos de dominio (DocumentProcessed). */
  eventBus: events.EventBus;
}

/**
 * Dominio Documentos.
 *
 * Lambdas + rutas:
 *   POST /invoices/{id}/document/upload-url -> url-handler.ts
 *   S3 Object Created -> process-handler.ts (vía EventBridge)
 *
 * El bucket vive en StorageStack y aquí solo se consume. La conexión S3 -> Lambda
 * se hace con EventBridge en vez de addEventNotification() para evitar una
 * dependencia circular de stacks (storage <-> documents).
 *
 * El recurso `/invoices/{id}` lo creó InvoicesStack: este stack debe construirse
 * después de él.
 */
export class DocumentsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DocumentsStackProps) {
    super(scope, id, props);

    const environment = {
      BUCKET_NAME: props.documentsBucket.bucketName,
    };

    const bundling: nodejs.BundlingOptions = {
      format: nodejs.OutputFormat.ESM,
      target: 'esnext',
    };

    const uploadUrlLambda = new nodejs.NodejsFunction(this, 'UploadUrlLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/documents/url-handler.ts'),
      handler: 'handler',
      environment,
      bundling,
    });

    const processDocumentLambda = new nodejs.NodejsFunction(this, 'ProcessDocumentLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../src/documents/process-handler.ts'),
      handler: 'handler',
      environment: {
        ...environment,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
      bundling,
    });

    props.documentsBucket.grantReadWrite(processDocumentLambda);
    props.eventBus.grantPutEventsTo(processDocumentLambda);

    // POST /invoices/{id}/document/upload-url
    const invoicesResource = props.api.root.getResource('invoices');
    const invoiceByIdResource = invoicesResource?.getResource('{id}');
    if (!invoicesResource || !invoiceByIdResource) {
      throw new Error(
        'No existe /invoices/{id}. InvoicesStack debe construirse antes que DocumentsStack (ver bin/app.ts)',
      );
    }
    const documentResource = invoiceByIdResource.addResource('document');
    const uploadUrlResource = documentResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(uploadUrlLambda));

    // S3 (eventBridgeEnabled) -> EventBridge -> process-handler
    const documentUploadedRule = new events.Rule(this, 'DocumentUploadedRule', {
      description: 'Procesa los documentos subidos al bucket de facturas',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: {
            name: [props.documentsBucket.bucketName],
          },
        },
      },
    });

    documentUploadedRule.addTarget(new targets.LambdaFunction(processDocumentLambda));
  }
}
