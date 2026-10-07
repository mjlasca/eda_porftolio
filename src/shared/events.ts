import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

// Cliente fuera del handler (Cold Start Optimization)
const client = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME;

export interface DomainEvent<TDetail = Record<string, unknown>> {
  /** Dominio emisor, p. ej. 'billing.invoices' (no puede empezar por 'aws.') */
  source: string;
  /** Nombre del evento, p. ej. 'InvoiceCreated' */
  detailType: string;
  detail: TDetail;
}

export interface InvoiceCreatedDetail {
  invoiceId: string;
  customerId: string;
  number: string;
  amount: number;
  status: string;
  createdAt: string;
}

/**
 * Publica un evento de dominio en el bus global de EventBridge.
 * Lanza si el bus no está configurado o si EventBridge rechaza la entrada.
 */
export async function publishEvent(event: DomainEvent): Promise<void> {
  if (!EVENT_BUS_NAME) {
    throw new Error('EVENT_BUS_NAME no está definido: no se puede publicar el evento');
  }

  const result = await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: event.source,
          DetailType: event.detailType,
          Detail: JSON.stringify(event.detail),
        },
      ],
    }),
  );

  if (result.FailedEntryCount && result.FailedEntryCount > 0) {
    throw new Error(`EventBridge rechazó el evento: ${JSON.stringify(result.Entries)}`);
  }
}
