import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.478.0";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri: string;
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: serviceAccount.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContent = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function getGoogleDriveFileContent(
  fileId: string,
  mimeType: string,
  accessToken: string
): Promise<{ content: ArrayBuffer; exportedMimeType: string }> {
  const googleDocsMimeTypes = [
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
  ];

  let downloadUrl: string;
  let exportedMimeType = mimeType;

  if (googleDocsMimeTypes.includes(mimeType)) {
    let exportMime: string;
    switch (mimeType) {
      case "application/vnd.google-apps.document":
        exportMime = "application/pdf";
        exportedMimeType = "application/pdf";
        break;
      case "application/vnd.google-apps.spreadsheet":
        exportMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        exportedMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        break;
      case "application/vnd.google-apps.presentation":
        exportMime = "application/pdf";
        exportedMimeType = "application/pdf";
        break;
      default:
        exportMime = "application/pdf";
        exportedMimeType = "application/pdf";
    }
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download file: ${errorText}`);
  }

  const content = await response.arrayBuffer();
  return { content, exportedMimeType };
}

function getFileExtension(mimeType: string, originalName: string): string {
  const hasExtension = originalName.includes('.') && originalName.lastIndexOf('.') > 0;
  if (hasExtension) return "";

  switch (mimeType) {
    case "application/vnd.google-apps.document":
      return ".pdf";
    case "application/vnd.google-apps.spreadsheet":
      return ".xlsx";
    case "application/vnd.google-apps.presentation":
      return ".pdf";
    default:
      return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { fileIds, fileNames, fileMimeTypes, knowledgeBaseId } = await req.json();

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "fileIds array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!knowledgeBaseId) {
      return new Response(
        JSON.stringify({ error: "knowledgeBaseId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: "Google service account not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
    const awsRegion = (Deno.env.get("AWS_REGION") || "us-east-1").trim();

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: "AWS credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const serviceAccount: ServiceAccountKey = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(serviceAccount);

    // Get the destination bucket from knowledge base
    const dsEndpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/${knowledgeBaseId}/datasources/`;
    const dsRequestBody = JSON.stringify({});

    const dsHeaders = await signRequest({
      method: "POST",
      url: dsEndpoint,
      body: dsRequestBody,
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    dsHeaders["Content-Type"] = "application/json";
    dsHeaders["Host"] = `bedrock-agent.${awsRegion}.amazonaws.com`;

    const dsListResponse = await fetch(dsEndpoint, {
      method: "POST",
      headers: dsHeaders,
      body: dsRequestBody,
    });

    if (!dsListResponse.ok) {
      const errorText = await dsListResponse.text();
      throw new Error(`Failed to fetch data sources: ${errorText}`);
    }

    const dsListData = await dsListResponse.json();
    if (!dsListData.dataSourceSummaries || dsListData.dataSourceSummaries.length === 0) {
      return new Response(
        JSON.stringify({ error: "No data sources found for knowledge base" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataSourceId = dsListData.dataSourceSummaries[0].dataSourceId;
    const dsDetailEndpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/${knowledgeBaseId}/datasources/${dataSourceId}`;

    const dsDetailHeaders = await signRequest({
      method: "GET",
      url: dsDetailEndpoint,
      body: "",
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    dsDetailHeaders["Content-Type"] = "application/json";

    const dsDetailResponse = await fetch(dsDetailEndpoint, {
      method: "GET",
      headers: dsDetailHeaders,
    });

    if (!dsDetailResponse.ok) {
      const errorText = await dsDetailResponse.text();
      throw new Error(`Failed to fetch data source details: ${errorText}`);
    }

    const dsDetailData = await dsDetailResponse.json();
    const s3Config = dsDetailData.dataSource?.dataSourceConfiguration?.s3Configuration;

    if (!s3Config?.bucketArn) {
      return new Response(
        JSON.stringify({ error: "No S3 bucket configured for knowledge base" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bucketArn = s3Config.bucketArn;
    const arnParts = bucketArn.split(":::");
    let destinationBucket = "";
    let destinationPrefix = "";

    if (arnParts.length > 1) {
      const pathPart = arnParts[1];
      const slashIndex = pathPart.indexOf("/");
      if (slashIndex > -1) {
        destinationBucket = pathPart.substring(0, slashIndex);
        destinationPrefix = pathPart.substring(slashIndex + 1);
        if (destinationPrefix && !destinationPrefix.endsWith("/")) {
          destinationPrefix += "/";
        }
      } else {
        destinationBucket = pathPart;
      }
    }

    if (s3Config?.inclusionPrefixes && s3Config.inclusionPrefixes.length > 0) {
      destinationPrefix = s3Config.inclusionPrefixes[0];
      if (!destinationPrefix.endsWith("/")) {
        destinationPrefix += "/";
      }
    }

    if (!destinationBucket) {
      return new Response(
        JSON.stringify({ error: "Could not determine destination bucket" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    const copyResults = [];

    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      const fileName = fileNames[i] || `file_${fileId}`;
      const mimeType = fileMimeTypes[i] || "application/octet-stream";

      try {
        const extension = getFileExtension(mimeType, fileName);
        const finalFileName = fileName + extension;

        const { content, exportedMimeType } = await getGoogleDriveFileContent(fileId, mimeType, accessToken);
        const destinationKey = destinationPrefix + finalFileName;

        const putCommand = new PutObjectCommand({
          Bucket: destinationBucket,
          Key: destinationKey,
          Body: new Uint8Array(content),
          ContentType: exportedMimeType,
        });

        await s3Client.send(putCommand);

        copyResults.push({
          fileId,
          fileName: finalFileName,
          success: true,
          destinationKey,
        });
      } catch (error) {
        console.error(`Error copying file ${fileName}:`, error);
        copyResults.push({
          fileId,
          fileName,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = copyResults.filter((r) => r.success).length;
    const failureCount = copyResults.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Copied ${successCount} file(s) successfully, ${failureCount} failed`,
        results: copyResults,
        successCount,
        failureCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in copy-google-drive-files:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
