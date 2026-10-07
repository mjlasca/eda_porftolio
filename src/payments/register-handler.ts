import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import type { Payment, PaymentMethod } from '../shared/types/payments.js';
import { publishEvent } from '../shared/events.js';

// Inicializamos el cliente de DynamoDB fuera del handler (Cold Start Optimization)
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'invoices';
const PAYMENT_METHODS: PaymentMethod[] = ['TRANSFER', 'CARD', 'CASH', 'OTHER'];

/**
 * POST /invoices/{id}/payment
 * Registra el pago de una factura de forma atómica:
 *   1) marca la factura como PAID (condicionado a que no lo esté ya)
 *   2) crea el ítem PAYMENT en la misma partición
 * y emite el evento PaymentRegistered.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const invoiceId = event.pathParameters?.id;
    if (!invoiceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing invoice id parameter in path' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing request body' }),
      };
    }

    let body: {
      amount?: unknown;
      method?: unknown;
      paymentId?: unknown;
      paidAt?: unknown;
    };
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid JSON in request body' }),
      };
    }

    const { amount, method, paymentId, paidAt } = body;

    // Validaciones básicas de negocio
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid payload. Required: amount (positive number)' }),
      };
    }

    const rawMethod = typeof method === 'string' ? method : 'OTHER';
    if (!PAYMENT_METHODS.includes(rawMethod as PaymentMethod)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Invalid method. Allowed: ${PAYMENT_METHODS.join(', ')}`,
        }),
      };
    }
    const paymentMethod = rawMethod as PaymentMethod;

    // 1. Leemos la factura para validar el estado antes de pagar
    const { Item: invoice } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `INVOICE#${invoiceId}`,
          sk: `METADATA#${invoiceId}`,
        },
      }),
    );

    if (!invoice) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Invoice not found' }),
      };
    }

    if (invoice.status === 'PAID') {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Invoice already paid' }),
      };
    }

    const now = new Date().toISOString();
    const id = typeof paymentId === 'string' && paymentId.trim() ? paymentId.trim() : randomUUID();

    const newPayment: Payment = {
      pk: `INVOICE#${invoiceId}`,
      sk: `PAYMENT#${id}`,
      paymentId: id,
      invoiceId,
      amount,
      method: paymentMethod,
      paidAt: typeof paidAt === 'string' && paidAt ? paidAt : now,
      createdAt: now,
    };

    // 2. Transacción: o se aplican los dos cambios o ninguno
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: TABLE_NAME,
              Key: {
                pk: `INVOICE#${invoiceId}`,
                sk: `METADATA#${invoiceId}`,
              },
              UpdateExpression:
                'SET #status = :paid, paidAt = :paidAt, updatedAt = :updatedAt',
              ConditionExpression:
                'attribute_exists(pk) AND (attribute_not_exists(#status) OR #status <> :paid)',
              ExpressionAttributeNames: {
                '#status': 'status',
              },
              ExpressionAttributeValues: {
                ':paid': 'PAID',
                ':paidAt': newPayment.paidAt,
                ':updatedAt': now,
              },
            },
          },
          {
            Put: {
              TableName: TABLE_NAME,
              Item: newPayment,
              // Evita pisar un pago con el mismo paymentId
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        ],
      }),
    );

    // 3. Emitimos el evento de dominio (best-effort: el pago ya está persistido)
    try {
      await publishEvent({
        source: 'billing.payments',
        detailType: 'PaymentRegistered',
        detail: {
          invoiceId: newPayment.invoiceId,
          paymentId: newPayment.paymentId,
          amount: newPayment.amount,
          method: newPayment.method,
          paidAt: newPayment.paidAt,
        },
      });
    } catch (eventError) {
      console.error('No se pudo publicar el evento PaymentRegistered:', eventError);
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Payment registered successfully',
        data: newPayment,
      }),
    };
  } catch (error: any) {
    // Carrera entre la lectura y la transacción: otra petición pagó antes
    if (error?.name === 'TransactionCanceledException') {
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Invoice already paid' }),
      };
    }
    console.error('Error registering payment:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
