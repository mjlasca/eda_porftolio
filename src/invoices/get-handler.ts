import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Inicializamos el cliente de DynamoDB fuera del handler (Cold Start Optimization)
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'invoices';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const invoiceId = event.pathParameters?.id;
    if (!invoiceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing invoice id parameter in path' }),
      };
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `INVOICE#${invoiceId}`,
          sk: `METADATA#${invoiceId}`,
        },
      })
    );

    if (!result.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Invoice not found' }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: result.Item,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching invoice:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
