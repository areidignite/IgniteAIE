interface SignRequestParams {
  method: string;
  url?: string;
  host?: string;
  path?: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function signRequest(params: SignRequestParams): Promise<Record<string, string>> {
  const { method, url, host, path, body, region, service, accessKeyId, secretAccessKey } = params;

  let finalHost: string;
  let finalPath: string;

  if (url) {
    const urlObj = new URL(url);
    finalHost = urlObj.hostname;
    finalPath = urlObj.pathname + urlObj.search;
  } else if (host && path) {
    finalHost = host;
    finalPath = path;
  } else {
    throw new Error('Either url or both host and path must be provided');
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const encoder = new TextEncoder();
  const bodyHash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
  const bodyHashHex = Array.from(new Uint8Array(bodyHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const canonicalHeaders = `host:${finalHost}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = `${method}\n${finalPath}\n\n${canonicalHeaders}\n${signedHeaders}\n${bodyHashHex}`;

  const canonicalRequestHash = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonicalRequest)
  );
  const canonicalRequestHashHex = Array.from(new Uint8Array(canonicalRequestHash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    canonicalRequestHashHex
  ].join('\n');

  const getSignatureKey = async (
    key: string,
    dateStamp: string,
    regionName: string,
    serviceName: string
  ) => {
    const kDate = await crypto.subtle.importKey(
      'raw',
      encoder.encode('AWS4' + key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const kDateSigned = await crypto.subtle.sign(
      'HMAC',
      kDate,
      encoder.encode(dateStamp)
    );

    const kRegion = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(kDateSigned),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const kRegionSigned = await crypto.subtle.sign(
      'HMAC',
      kRegion,
      encoder.encode(regionName)
    );

    const kService = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(kRegionSigned),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const kServiceSigned = await crypto.subtle.sign(
      'HMAC',
      kService,
      encoder.encode(serviceName)
    );

    const kSigning = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(kServiceSigned),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return kSigning;
  };

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    service
  );

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    signingKey,
    encoder.encode(stringToSign)
  );
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const authorizationHeader = [
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`
  ].join(', ');

  return {
    'Host': finalHost,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader,
    'Content-Type': 'application/json'
  };
}
