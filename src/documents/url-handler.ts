import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Inicializamos el cliente fuera del handler (Cold Start Optimization)
const client = new S3Client({});

const BUCKET_NAME = process.env.BUCKET_NAME;
const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * POST /invoices/{id}/document/upload-url
 * Devuelve una URL prefirmada (PUT) para subir el PDF de la factura a S3.
 * El cliente NO necesita credenciales de AWS: sólo la URL y el Content-Type
 * con el que se prefirmó.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    if (!BUCKET_NAME) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'BUCKET_NAME is not configured' }),
      };
    }

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

    let body: { fileName?: unknown; contentType?: unknown };
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid JSON in request body' }),
      };
    }

    const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
    if (!fileName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid payload. Required: fileName' }),
      };
    }

    // Sólo el nombre base: evitamos traversal (../../) o claves anidadas arbitrarias
    const safeFileName = fileName.split(/[/\\]/).pop() ?? '';
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid fileName' }),
      };
    }

    if (!safeFileName.toLowerCase().endsWith('.pdf')) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Only .pdf files are supported' }),
      };
    }

    const contentType = typeof body.contentType === 'string' ? body.contentType : 'application/pdf';
    const key = `invoices/${invoiceId}/${safeFileName}`;

    // La URL prefirmada exige exactamente este Content-Type en el PUT
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        uploadUrl,
        method: 'PUT',
        key,
        contentType,
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      }),
    };
  } catch (error: any) {
    console.error('Error generating upload url:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal Server Error', error: error.message }),
    };
  }
};
