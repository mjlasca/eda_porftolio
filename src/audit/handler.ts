/** Sobre(EventBridge) de un evento de dominio publicado en el bus global. */
interface DomainEventEnvelope<TDetail = Record<string, unknown>> {
  version?: string;
  id?: string;
  'detail-type': string;
  source: string;
  account?: string;
  time?: string;
  region?: string;
  resources?: string[];
  detail: TDetail;
}

/**
 * Consumidor de auditoría: registra cada evento de dominio del bus como una
 * línea JSON estructurada en CloudWatch Logs (grupo de logs de esta Lambda).
 *
 * Con CloudWatch Insights se consulta con:
 *   fields @timestamp, source, detailType, detail.invoiceId
 *   | filter audit = 1
 *   | sort @timestamp desc
 *
 * No lanza excepciones: un fallo de auditoría no debe romper el bus.
 */
export const handler = async (event: DomainEventEnvelope): Promise<void> => {
  console.log(
    JSON.stringify({
      audit: 1,
      eventId: event.id ?? '',
      source: event.source,
      detailType: event['detail-type'],
      account: event.account ?? '',
      region: event.region ?? '',
      occurredAt: event.time ?? new Date().toISOString(),
      auditedAt: new Date().toISOString(),
      detail: event.detail ?? {},
    }),
  );
};
