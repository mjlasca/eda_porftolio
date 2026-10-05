export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

export interface Invoice {
  pk: string;
  sk: string;
  invoiceId: string;
  customerId: string;
  number: string;
  amount: number;
  status: InvoiceStatus;
  createdAt: string;
}