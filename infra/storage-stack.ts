import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Almacenamiento global: bucket S3 para los documentos de las facturas.
 *
 * eventBridgeEnabled publica "Object Created/Deleted" en EventBridge, de forma
 * que DocumentsStack pueda reaccionar con una regla sin acoplar este stack a
 * sus Lambdas (evita la dependencia circular storage <-> documents).
 */
export class StorageStack extends cdk.Stack {
  public readonly documentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      eventBridgeEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // DESTROY + autoDeleteObjects para poder hacer cdk destroy en desarrollo
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new cdk.CfnOutput(this, 'DocumentsBucketName', {
      value: this.documentsBucket.bucketName,
    });
  }
}
