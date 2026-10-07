import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Invoice, InvoiceStatus } from '../shared/types/invoices.js';
import { publishEvent } from '../shared/events.js';

// Inicializamos el cliente de DynamoDB fuera del handler (Cold Start Optimization)
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'invoices';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing request body' }),
      };
    }

    const body = JSON.parse(event.body);
    const { invoiceId, customerId, number, amount } = body;

    // Validaciones básicas de negocio
    if (!invoiceId || !customerId || !number || typeof amount !== 'number') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid payload. Required: invoiceId, customerId, number, amount' }),
      };
    }

    const now = new Date().toISOString();
    const newInvoice: Invoice = {
      pk: `INVOICE#${invoiceId}`,
      sk: `METADATA#${invoiceId}`,
      invoiceId,
      customerId,
      number,
      amount,
      status: 'DRAFT' as InvoiceStatus,
      createdAt: now,
    };

    // Guardamos en DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: newInvoice,
        ConditionExpression: 'attribute_not_exists(pk)', // Evita sobrescribir facturas existentes
      })
    );

    // Emitimos el evento de dominio una vez persistida la factura.
    // Best-effort: si EventBridge falla, la factura ya existe y devolvemos 201
    // (se deja trazado el error para reintentar/notificar).
    try {
      await publishEvent({
        source: 'billing.invoices',
        detailType: 'InvoiceCreated',
        detail: {
          invoiceId: newInvoice.invoiceId,
          customerId: newInvoice.customerId,
          number: newInvoice.number,
          amount: newInvoice.amount,
          status: newInvoice.status,
          createdAt: newInvoice.createdAt,
        },
      });
    } catch (eventError) {
      console.error('No se pudo publicar el evento InvoiceCreated:', eventError);
    }

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: 'Invoice created successfully',
        data: newInvoice,
      }),
    };
  } catch (error: any) {
    console.log('Error creating invoice:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};