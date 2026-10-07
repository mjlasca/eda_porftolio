import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { publishEvent } from '../shared/events.js';

// Inicializamos el cliente fuera del handler (Cold Start Optimization)
const client = new S3Client({});

/** Evento de EventBridge "Object Created" generado por S3 (eventBridgeEnabled). */
interface ObjectCreatedEvent {
  source: string;
  'detail-type': string;
  account: string;
  region: string;
  time: string;
  resources: string[];
  detail: {
    bucket: { name: string };
    object: { key: string; size?: number; etag?: string };
    reason?: string;
  };
}

/**
 * Trigger de S3 (vía EventBridge) para procesar los PDFs subidos.
 * Cualquier error se propaga para que EventBridge reintente el evento.
 */
export const handler = async (event: ObjectCreatedEvent): Promise<void> => {
  const bucket = event.detail?.bucket?.name;
  const rawKey = event.detail?.object?.key;

  if (!bucket || !rawKey) {
    console.warn('Evento S3 sin bucket/clave:', JSON.stringify(event));
    return;
  }

  // S3 envía la clave URL-encoded (espacios, tildes, etc.)
  const key = decodeURIComponent(rawKey);

  // Sólo interesan los documentos de facturas en PDF
  if (!key.startsWith('invoices/') || !key.toLowerCase().endsWith('.pdf')) {
    console.log(`Objeto ignorado (no es un PDF de facturas): ${key}`);
    return;
  }

  const invoiceId = key.split('/')[1];
  if (!invoiceId) {
    console.warn(`Clave con formato inesperado (se esperaba invoices/{id}/archivo): ${key}`);
    return;
  }

  // Verificamos que el objeto existe y leemos sus metadatos sin descargarlo
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));

  if (head.ContentType && head.ContentType !== 'application/pdf') {
    console.log(`Objeto ignorado (Content-Type ${head.ContentType}): ${key}`);
    return;
  }

  // Punto de extensión: OCR/extracción de texto, validación de factura, etc.
  console.log(`Procesando documento ${key} (${head.ContentLength ?? 0} bytes)`);

  await publishEvent({
    source: 'billing.documents',
    detailType: 'DocumentProcessed',
    detail: {
      invoiceId,
      bucket,
      key,
      size: head.ContentLength ?? 0,
      etag: head.ETag ?? '',
      processedAt: new Date().toISOString(),
    },
  });

  console.log(`Documento procesado: ${key}`);
};
