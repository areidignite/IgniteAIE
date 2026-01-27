import { createHmac } from "node:crypto";

interface SignRequestParams {
  method: string;
  url: string;
  body: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

function sha256(data: string): string {
  return createHmac("sha256", "").update(data).digest("hex");
}

function hmacSha256(key: Uint8Array | string, data: string): Uint8Array {
  const hmac = createHmac("sha256", key);
  hmac.update(data);
  return new Uint8Array(hmac.digest());
}

function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Uint8Array {
  const kDate = hmacSha256("AWS4" + key, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  const kSigning = hmacSha256(kService, "aws4_request");
  return kSigning;
}

export async function signRequest(params: SignRequestParams): Promise<Record<string, string>> {
  const {
    method,
    url,
    body,
    region,
    service,
    accessKeyId,
    secretAccessKey,
    sessionToken,
  } = params;

  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const canonicalUri = urlObj.pathname || "/";
  const canonicalQuerystring = urlObj.searchParams.toString();

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(body);

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";

  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuerystring}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${sha256(
    canonicalRequest
  )}`;

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = Array.from(hmacSha256(signingKey, stringToSign))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers: Record<string, string> = {
    "x-amz-date": amzDate,
    Authorization: authorizationHeader,
    "Content-Type": "application/json",
  };

  if (sessionToken) {
    headers["X-Amz-Security-Token"] = sessionToken;
  }

  return headers;
}
