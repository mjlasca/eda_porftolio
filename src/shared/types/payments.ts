export type PaymentMethod = 'TRANSFER' | 'CARD' | 'CASH' | 'OTHER';

export interface Payment {
  /** Comparte partición con la factura (Single Table Design). */
  pk: string;
  sk: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  createdAt: string;
}
