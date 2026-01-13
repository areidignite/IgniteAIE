interface SignRequestParams {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export async function signRequest(params: SignRequestParams): Promise<Record<string, string>> {
  const { method, url, body, region, service, accessKeyId, secretAccessKey } = params;

  const encoder = new TextEncoder();
  const algorithm = 'AWS4-HMAC-SHA256';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const canonicalUri = urlObj.pathname || '/';
  const canonicalQuerystring = urlObj.search.substring(1);

  async function sha256(data: Uint8Array): Promise<ArrayBuffer> {
    return await crypto.subtle.digest('SHA-256', data);
  }

  function hexEncode(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const payloadHash = hexEncode(await sha256(encoder.encode(body)));

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = hexEncode(await sha256(encoder.encode(canonicalRequest)));
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  async function hmac(key: Uint8Array, data: string): Promise<Uint8Array> {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
    return new Uint8Array(signature);
  }

  const kDate = await hmac(encoder.encode('AWS4' + secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const signature = hexEncode(await hmac(kSigning, stringToSign));

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Authorization': authorizationHeader,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };
}