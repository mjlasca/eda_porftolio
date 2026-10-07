import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';

/**
 * Bus global de EventBridge (compartido por todos los dominios).
 *
 * Los productores (invoices/payments/documents) publican con PutEvents sobre
 * este bus; los consumidores (notifications/audit) crean reglas sobre él.
 *
 * Nota: los eventos de S3 (subida de documentos) llegan al bus por defecto de
 * la cuenta, no a este bus, por eso la regla de documents-stack no lo
 * referencia.
 */
export class EventsStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.eventBus = new events.EventBus(this, 'BillingEventBus', {
      eventBusName: 'billing-events',
    });

    new cdk.CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'Bus global de eventos del dominio de facturación',
    });
  }
}
