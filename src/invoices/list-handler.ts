import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Inicializamos el cliente de DynamoDB fuera del handler (Cold Start Optimization)
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'invoices';
const INDEX_NAME = 'gsi1';
/** Partición del GSI1: todas las facturas en un solo Query. */
const ALL_INVOICES_PK = 'INVOICE';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // ?limit=20 -> nº de facturas por página (1..100)
    const rawLimit = Number(event.queryStringParameters?.limit);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

    // ?nextToken=... -> continuidad de la página (LastEvaluatedKey codificado)
    const token = event.queryStringParameters?.nextToken;
    let exclusiveStartKey: Record<string, unknown> | undefined;
    if (token) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      } catch {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Invalid nextToken' }),
        };
      }
    }

    // Query sobre el GSI1 en lugar de Scan: sólo toca la partición de facturas
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: INDEX_NAME,
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: {
          ':gsi1pk': ALL_INVOICES_PK,
        },
        ScanIndexForward: false, // más recientes primero
        Limit: limit,
        ...(exclusiveStartKey && { ExclusiveStartKey: exclusiveStartKey }),
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        data: result.Items ?? [],
        nextToken: result.LastEvaluatedKey
          ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
          : null,
      }),
    };
  } catch (error: any) {
    console.error('Error listing invoices:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
