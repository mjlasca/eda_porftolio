export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

export interface Invoice {
  pk: string;
  sk: string;
  /** GSI1: partición de listado ('INVOICE'), agrupa todas las facturas. */
  gsi1pk: string;
  /** GSI1: orden por fecha de creación, con invoiceId de desempate. */
  gsi1sk: string;
  invoiceId: string;
  customerId: string;
  number: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
}