import crypto from 'crypto';

/**
 * Self-contained AWS DynamoDB Client & DocumentClient implementation using
 * AWS Signature Version 4 (AWS4-HMAC-SHA256), EC2 IMDSv2 IAM Role temporary credentials,
 * and the official DynamoDB JSON 1.0 wire protocol (`DynamoDB_20120810.*`).
 *
 * This avoids pulling 200+ transitive npm packages during container startup while
 * providing full wire compatibility with Amazon DynamoDB in `ap-south-1` and DynamoDB Local.
 */

export interface AwsExceptionOptions {
  message?: string;
  $metadata?: Record<string, unknown>;
  CancellationReasons?: Array<{ Code?: string; Message?: string }>;
}

export class ConditionalCheckFailedException extends Error {
  public readonly name = 'ConditionalCheckFailedException';
  public readonly $metadata: Record<string, unknown>;
  constructor(input: string | AwsExceptionOptions = 'The conditional request failed') {
    const msg = typeof input === 'string' ? input : input.message || 'The conditional request failed';
    super(msg);
    this.$metadata = typeof input === 'object' && input.$metadata ? input.$metadata : {};
    Object.setPrototypeOf(this, ConditionalCheckFailedException.prototype);
  }
}

export class TransactionCanceledException extends Error {
  public readonly name = 'TransactionCanceledException';
  public readonly $metadata: Record<string, unknown>;
  public readonly CancellationReasons?: Array<{ Code?: string; Message?: string }>;
  constructor(
    input: string | AwsExceptionOptions = 'Transaction cancelled',
    reasons?: Array<{ Code?: string; Message?: string }>
  ) {
    const msg = typeof input === 'string' ? input : input.message || 'Transaction cancelled';
    super(msg);
    this.$metadata = typeof input === 'object' && input.$metadata ? input.$metadata : {};
    this.CancellationReasons =
      reasons || (typeof input === 'object' ? input.CancellationReasons : undefined);
    Object.setPrototypeOf(this, TransactionCanceledException.prototype);
  }
}

export class ProvisionedThroughputExceededException extends Error {
  public readonly name = 'ProvisionedThroughputExceededException';
  public readonly $metadata: Record<string, unknown>;
  constructor(
    input:
      | string
      | AwsExceptionOptions = 'The level of configured provisioned throughput for the table was exceeded'
  ) {
    const msg =
      typeof input === 'string'
        ? input
        : input.message ||
          'The level of configured provisioned throughput for the table was exceeded';
    super(msg);
    this.$metadata = typeof input === 'object' && input.$metadata ? input.$metadata : {};
    Object.setPrototypeOf(this, ProvisionedThroughputExceededException.prototype);
  }
}

export class ResourceNotFoundException extends Error {
  public readonly name = 'ResourceNotFoundException';
  public readonly $metadata: Record<string, unknown>;
  constructor(input: string | AwsExceptionOptions = 'Requested resource not found') {
    const msg = typeof input === 'string' ? input : input.message || 'Requested resource not found';
    super(msg);
    this.$metadata = typeof input === 'object' && input.$metadata ? input.$metadata : {};
    Object.setPrototypeOf(this, ResourceNotFoundException.prototype);
  }
}

export type NativeAttributeMap = { [key: string]: any };

export interface DescribeTableCommandInput {
  TableName: string;
}
export class DescribeTableCommand {
  public readonly input: DescribeTableCommandInput;
  constructor(input: DescribeTableCommandInput) {
    this.input = input;
  }
}

export interface GetCommandInput {
  TableName: string;
  Key: NativeAttributeMap;
  ConsistentRead?: boolean;
}
export class GetCommand {
  public readonly input: GetCommandInput;
  constructor(input: GetCommandInput) {
    this.input = input;
  }
}

export interface PutCommandInput {
  TableName: string;
  Item: NativeAttributeMap;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: NativeAttributeMap;
}
export class PutCommand {
  public readonly input: PutCommandInput;
  constructor(input: PutCommandInput) {
    this.input = input;
  }
}

export interface UpdateCommandInput {
  TableName: string;
  Key: NativeAttributeMap;
  UpdateExpression: string;
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: NativeAttributeMap;
  ReturnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}
export class UpdateCommand {
  public readonly input: UpdateCommandInput;
  constructor(input: UpdateCommandInput) {
    this.input = input;
  }
}

export interface QueryCommandInput {
  TableName: string;
  IndexName?: string;
  KeyConditionExpression: string;
  FilterExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: NativeAttributeMap;
  ScanIndexForward?: boolean;
  Limit?: number;
}
export class QueryCommand {
  public readonly input: QueryCommandInput;
  constructor(input: QueryCommandInput) {
    this.input = input;
  }
}

export interface TransactWriteItem {
  Put?: PutCommandInput;
  Update?: UpdateCommandInput;
  Delete?: {
    TableName: string;
    Key: NativeAttributeMap;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: NativeAttributeMap;
  };
}

export interface TransactWriteCommandInput {
  TransactItems: TransactWriteItem[];
}
export class TransactWriteCommand {
  public readonly input: TransactWriteCommandInput;
  constructor(input: TransactWriteCommandInput) {
    this.input = input;
  }
}

// ---------------- AttributeValue Marshaller / Unmarshaller ----------------

export type AttributeValue =
  | { S: string }
  | { N: string }
  | { BOOL: boolean }
  | { NULL: true }
  | { L: AttributeValue[] }
  | { M: Record<string, AttributeValue> };

export function marshallValue(value: unknown, removeUndefined = true): AttributeValue | undefined {
  if (value === undefined) {
    return removeUndefined ? undefined : { NULL: true };
  }
  if (value === null) {
    return { NULL: true };
  }
  if (typeof value === 'boolean') {
    return { BOOL: value };
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot marshall non-finite number to DynamoDB: ${value}`);
    }
    return { N: String(value) };
  }
  if (typeof value === 'string') {
    return { S: value };
  }
  if (Array.isArray(value)) {
    const list: AttributeValue[] = [];
    for (const elem of value) {
      const m = marshallValue(elem, removeUndefined);
      if (m !== undefined) list.push(m);
    }
    return { L: list };
  }
  if (typeof value === 'object') {
    const map: Record<string, AttributeValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const m = marshallValue(v, removeUndefined);
      if (m !== undefined) {
        map[k] = m;
      }
    }
    return { M: map };
  }
  return { S: String(value) };
}

export function marshallMap(
  record: Record<string, unknown> | undefined,
  removeUndefined = true
): Record<string, AttributeValue> | undefined {
  if (!record) return undefined;
  const result: Record<string, AttributeValue> = {};
  for (const [key, val] of Object.entries(record)) {
    const m = marshallValue(val, removeUndefined);
    if (m !== undefined) {
      result[key] = m;
    }
  }
  return result;
}

export function unmarshallValue(attr: AttributeValue): unknown {
  if ('NULL' in attr) return null;
  if ('BOOL' in attr) return attr.BOOL;
  if ('N' in attr) return Number(attr.N);
  if ('S' in attr) return attr.S;
  if ('L' in attr) return attr.L.map(unmarshallValue);
  if ('M' in attr) return unmarshallMap(attr.M);
  return null;
}

export function unmarshallMap(
  item: Record<string, AttributeValue> | undefined
): Record<string, unknown> | undefined {
  if (!item) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    out[k] = unmarshallValue(v);
  }
  return out;
}

// ---------------- AWS Credentials & EC2 IMDSv2 Resolution ----------------

interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expirationMs?: number;
}

let cachedImdsCredentials: AwsCredentials | null = null;

async function resolveAwsCredentials(): Promise<AwsCredentials> {
  // 1. Check standard environment variables (e.g. injected by ECS/Lambda or local DynamoDB test runner)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    };
  }

  // 2. Check cached EC2 IMDSv2 role credentials (refresh 2 minutes before expiry)
  if (
    cachedImdsCredentials &&
    cachedImdsCredentials.expirationMs &&
    Date.now() + 120_000 < cachedImdsCredentials.expirationMs
  ) {
    return cachedImdsCredentials;
  }

  // 3. Query EC2 Instance Metadata Service v2 (IMDSv2) at 169.254.169.254
  const imdsBase = process.env.AWS_EC2_METADATA_SERVICE_ENDPOINT || 'http://169.254.169.254';
  try {
    const tokenRes = await fetch(`${imdsBase}/latest/api/token`, {
      method: 'PUT',
      headers: {
        'X-aws-ec2-metadata-token-ttl-seconds': '21600',
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!tokenRes.ok) {
      throw new Error(`IMDSv2 token request returned ${tokenRes.status}`);
    }
    const imdsToken = (await tokenRes.text()).trim();

    const roleRes = await fetch(`${imdsBase}/latest/meta-data/iam/security-credentials/`, {
      headers: { 'X-aws-ec2-metadata-token': imdsToken },
      signal: AbortSignal.timeout(1500),
    });
    if (!roleRes.ok) {
      throw new Error(`IMDSv2 role lookup returned ${roleRes.status}`);
    }
    const roleName = (await roleRes.text()).split('\n')[0].trim();

    const credsRes = await fetch(
      `${imdsBase}/latest/meta-data/iam/security-credentials/${encodeURIComponent(roleName)}`,
      {
        headers: { 'X-aws-ec2-metadata-token': imdsToken },
        signal: AbortSignal.timeout(1500),
      }
    );
    if (!credsRes.ok) {
      throw new Error(`IMDSv2 credentials lookup returned ${credsRes.status}`);
    }
    const credsJson = (await credsRes.json()) as {
      AccessKeyId: string;
      SecretAccessKey: string;
      Token?: string;
      Expiration?: string;
    };

    cachedImdsCredentials = {
      accessKeyId: credsJson.AccessKeyId,
      secretAccessKey: credsJson.SecretAccessKey,
      sessionToken: credsJson.Token,
      expirationMs: credsJson.Expiration ? Date.parse(credsJson.Expiration) : Date.now() + 300_000,
    };
    return cachedImdsCredentials;
  } catch (err) {
    throw new Error(
      `Unable to resolve AWS IAM credentials from environment or EC2 IMDSv2: ${(err as Error).message}`
    );
  }
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

export interface DynamoDBClientConfig {
  region: string;
  endpoint?: string;
  maxAttempts?: number;
}

export class DynamoDBClient {
  public readonly config: DynamoDBClientConfig;

  constructor(config: DynamoDBClientConfig) {
    this.config = {
      region: config.region || 'ap-south-1',
      endpoint: config.endpoint,
      maxAttempts: config.maxAttempts ?? 4,
    };
  }

  public async sendRpc(targetOperation: string, payload: Record<string, unknown>): Promise<unknown> {
    const endpointUrl =
      this.config.endpoint || `https://dynamodb.${this.config.region}.amazonaws.com/`;
    const parsedUrl = new URL(endpointUrl);
    const body = JSON.stringify(payload);
    const creds = await resolveAwsCredentials();

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const service = 'dynamodb';
    const region = this.config.region;
    const amzTarget = `DynamoDB_20120810.${targetOperation}`;
    const contentType = 'application/x-amz-json-1.0';
    const payloadHash = sha256Hex(body);

    const headers: Record<string, string> = {
      'content-type': contentType,
      host: parsedUrl.host,
      'x-amz-date': amzDate,
      'x-amz-target': amzTarget,
    };
    if (creds.sessionToken) {
      headers['x-amz-security-token'] = creds.sessionToken;
    }

    const signedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}\n`).join('');
    const signedHeaders = signedHeaderKeys.join(';');

    const canonicalRequest = [
      'POST',
      parsedUrl.pathname || '/',
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = hmacSha256(`AWS4${creds.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    headers.Authorization = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers,
      body,
    });

    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const rawType = String(json.__type || json.code || '');
      const errorCode = rawType.includes('#') ? rawType.split('#')[1] : rawType;
      const errorMessage = String(json.message || json.Message || `DynamoDB HTTP ${res.status}`);

      if (errorCode === 'ConditionalCheckFailedException') {
        throw new ConditionalCheckFailedException(errorMessage);
      }
      if (errorCode === 'TransactionCanceledException') {
        throw new TransactionCanceledException(
          errorMessage,
          json.CancellationReasons as Array<{ Code?: string; Message?: string }> | undefined
        );
      }
      if (errorCode === 'ProvisionedThroughputExceededException') {
        throw new ProvisionedThroughputExceededException(errorMessage);
      }
      if (errorCode === 'ResourceNotFoundException') {
        throw new ResourceNotFoundException(errorMessage);
      }
      throw new Error(`${errorCode || 'DynamoDBError'}: ${errorMessage}`);
    }

    return json;
  }
}

export class DynamoDBDocumentClient {
  private readonly client: DynamoDBClient;
  private readonly removeUndefinedValues: boolean;

  private constructor(client: DynamoDBClient, removeUndefinedValues = true) {
    this.client = client;
    this.removeUndefinedValues = removeUndefinedValues;
  }

  public static from(
    client: DynamoDBClient,
    options?: { marshallOptions?: { removeUndefinedValues?: boolean } }
  ): DynamoDBDocumentClient {
    return new DynamoDBDocumentClient(
      client,
      options?.marshallOptions?.removeUndefinedValues ?? true
    );
  }

  public async send(command: unknown): Promise<unknown> {
    const rmUndef = this.removeUndefinedValues;

    if (command instanceof DescribeTableCommand) {
      return this.client.sendRpc('DescribeTable', {
        TableName: command.input.TableName,
      });
    }

    if (command instanceof GetCommand) {
      const raw = (await this.client.sendRpc('GetItem', {
        TableName: command.input.TableName,
        Key: marshallMap(command.input.Key, rmUndef),
        ConsistentRead: command.input.ConsistentRead,
      })) as { Item?: Record<string, AttributeValue> };
      return {
        Item: unmarshallMap(raw.Item),
      };
    }

    if (command instanceof PutCommand) {
      await this.client.sendRpc('PutItem', {
        TableName: command.input.TableName,
        Item: marshallMap(command.input.Item, rmUndef),
        ConditionExpression: command.input.ConditionExpression,
        ExpressionAttributeNames: command.input.ExpressionAttributeNames,
        ExpressionAttributeValues: marshallMap(command.input.ExpressionAttributeValues, rmUndef),
      });
      return {};
    }

    if (command instanceof UpdateCommand) {
      const raw = (await this.client.sendRpc('UpdateItem', {
        TableName: command.input.TableName,
        Key: marshallMap(command.input.Key, rmUndef),
        UpdateExpression: command.input.UpdateExpression,
        ConditionExpression: command.input.ConditionExpression,
        ExpressionAttributeNames: command.input.ExpressionAttributeNames,
        ExpressionAttributeValues: marshallMap(command.input.ExpressionAttributeValues, rmUndef),
        ReturnValues: command.input.ReturnValues,
      })) as { Attributes?: Record<string, AttributeValue> };
      return {
        Attributes: unmarshallMap(raw.Attributes),
      };
    }

    if (command instanceof QueryCommand) {
      const raw = (await this.client.sendRpc('Query', {
        TableName: command.input.TableName,
        IndexName: command.input.IndexName,
        KeyConditionExpression: command.input.KeyConditionExpression,
        FilterExpression: command.input.FilterExpression,
        ExpressionAttributeNames: command.input.ExpressionAttributeNames,
        ExpressionAttributeValues: marshallMap(command.input.ExpressionAttributeValues, rmUndef),
        ScanIndexForward: command.input.ScanIndexForward,
        Limit: command.input.Limit,
      })) as { Items?: Array<Record<string, AttributeValue>>; Count?: number };
      return {
        Items: (raw.Items || []).map((item) => unmarshallMap(item)),
        Count: raw.Count ?? (raw.Items ? raw.Items.length : 0),
      };
    }

    if (command instanceof TransactWriteCommand) {
      const wireItems = command.input.TransactItems.map((txItem) => {
        if (txItem.Put) {
          return {
            Put: {
              TableName: txItem.Put.TableName,
              Item: marshallMap(txItem.Put.Item, rmUndef),
              ConditionExpression: txItem.Put.ConditionExpression,
              ExpressionAttributeNames: txItem.Put.ExpressionAttributeNames,
              ExpressionAttributeValues: marshallMap(
                txItem.Put.ExpressionAttributeValues,
                rmUndef
              ),
            },
          };
        }
        if (txItem.Update) {
          return {
            Update: {
              TableName: txItem.Update.TableName,
              Key: marshallMap(txItem.Update.Key, rmUndef),
              UpdateExpression: txItem.Update.UpdateExpression,
              ConditionExpression: txItem.Update.ConditionExpression,
              ExpressionAttributeNames: txItem.Update.ExpressionAttributeNames,
              ExpressionAttributeValues: marshallMap(
                txItem.Update.ExpressionAttributeValues,
                rmUndef
              ),
            },
          };
        }
        if (txItem.Delete) {
          return {
            Delete: {
              TableName: txItem.Delete.TableName,
              Key: marshallMap(txItem.Delete.Key, rmUndef),
              ConditionExpression: txItem.Delete.ConditionExpression,
              ExpressionAttributeNames: txItem.Delete.ExpressionAttributeNames,
              ExpressionAttributeValues: marshallMap(
                txItem.Delete.ExpressionAttributeValues,
                rmUndef
              ),
            },
          };
        }
        return {};
      });

      await this.client.sendRpc('TransactWriteItems', {
        TransactItems: wireItems,
      });
      return {};
    }

    throw new Error(`Unsupported DynamoDB command: ${String(command)}`);
  }
}
