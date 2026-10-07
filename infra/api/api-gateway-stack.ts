import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

/**
 * API Gateway compartido.
 *
 * Este stack solo crea el RestApi (y su despliegue/etapa). Las rutas concretas
 * las añaden los stacks de dominio (invoices/payments/documents) usando la
 * instancia `api` que se les inyecta como prop.
 */
export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.api = new apigateway.RestApi(this, 'BillingApi', {
      restApiName: 'Billing Service',
      description: 'API for event-driven billing backend',
      deployOptions: {
        stageName: 'dev',
      },
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'URL base de la API',
    });
  }
}
