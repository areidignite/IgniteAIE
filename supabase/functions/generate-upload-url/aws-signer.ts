interface SignRequestOptions {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
}

async function sha256(data: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return await crypto.subtle.digest('SHA-256', encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const encoder = new TextEncoder();
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmac(encoder.encode('AWS4' + key), dateStamp);
  const kRegion = await hmac(kDate, regionName);
  const kService = await hmac(kRegion, serviceName);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

function encodeURIComponent2(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

function canonicalURI(path: string): string {
  if (path === '' || path === '/') return '/';
  const segments = path.split('/');
  return segments.map(segment => encodeURIComponent2(segment)).join('/');
}

function getCanonicalQueryString(searchParams: URLSearchParams): string {
  const params: [string, string][] = [];
  searchParams.forEach((value, key) => {
    params.push([encodeURIComponent2(key), encodeURIComponent2(value)]);
  });
  params.sort((a, b) => {
    if (a[0] === b[0]) {
      return a[1].localeCompare(b[1]);
    }
    return a[0].localeCompare(b[0]);
  });
  return params.map(([key, value]) => `${key}=${value}`).join('&');
}

export async function signRequest(options: SignRequestOptions): Promise<Record<string, string>> {
  const { method, url, body, region, service, accessKeyId, secretAccessKey } = options;

  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const canonicalPath = canonicalURI(urlObj.pathname);
  const canonicalQueryString = getCanonicalQueryString(urlObj.searchParams);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|[.]\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = toHex(await sha256(body));

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `${method}\n${canonicalPath}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${toHex(await sha256(canonicalRequest))}`;

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Host': host,
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    'Authorization': authorizationHeader,
  };
}