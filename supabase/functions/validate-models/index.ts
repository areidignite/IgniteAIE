import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  message: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

async function signRequest(
  method: string,
  url: string,
  body: string,
  region: string,
  service: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Record<string, string>> {
  const urlObj = new URL(url);
  const host = urlObj.hostname;
  const path = urlObj.pathname
    .split("/")
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join("/");

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256(body);

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-date";

  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalRequestHash = await sha256(canonicalRequest);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(
    secretAccessKey,
    dateStamp,
    region,
    serviceName
  );
  const signature = Array.from(
    new Uint8Array(await hmacSha256(signingKey, stringToSign))
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Host: host,
    "X-Amz-Date": amzDate,
    Authorization: authorizationHeader,
    "Content-Type": "application/json",
  };
}

async function testModelAccess(
  modelId: string,
  inferenceProfileId: string | undefined,
  awsRegion: string,
  awsAccessKeyId: string,
  awsSecretAccessKey: string
): Promise<boolean> {
  try {
    let resolvedId: string;
    if (inferenceProfileId) {
      resolvedId = inferenceProfileId;
    } else {
      const baseId = modelId.includes("foundation-model/")
        ? modelId.split("foundation-model/")[1]
        : modelId;
      resolvedId = `us.${baseId}`;
    }

    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${resolvedId}/converse`;

    const body = JSON.stringify({
      messages: [
        {
          role: "user",
          content: [{ text: "Hi" }],
        },
      ],
      inferenceConfig: {
        maxTokens: 1,
        temperature: 0,
      },
    });

    const headers = await signRequest(
      "POST",
      endpoint,
      body,
      awsRegion,
      "bedrock",
      awsAccessKeyId,
      awsSecretAccessKey
    );

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    if (response.ok) {
      return true;
    }

    const status = response.status;
    if (status === 403) {
      return false;
    }

    if (status === 429) {
      return true;
    }

    const errorText = await response.text();
    if (
      errorText.includes("not authorized") ||
      errorText.includes("explicit deny") ||
      errorText.includes("AccessDeniedException")
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.error(`Error testing model ${modelId}:`, error);
    return true;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: authError?.message,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { models } = await req.json();

    if (!models || !Array.isArray(models) || models.length === 0) {
      return new Response(
        JSON.stringify({ error: "models array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: "AWS credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const BATCH_SIZE = 5;
    const results: Record<string, boolean> = {};

    for (let i = 0; i < models.length; i += BATCH_SIZE) {
      const batch = models.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(
          async (model: {
            modelId: string;
            modelArn: string;
            inferenceProfileId?: string;
          }) => {
            const accessible = await testModelAccess(
              model.modelId,
              model.inferenceProfileId,
              awsRegion,
              awsAccessKeyId,
              awsSecretAccessKey
            );
            return { modelArn: model.modelArn, accessible };
          }
        )
      );

      for (const result of batchResults) {
        results[result.modelArn] = result.accessible;
      }
    }

    const accessibleCount = Object.values(results).filter(Boolean).length;
    const deniedCount = Object.values(results).filter((v) => !v).length;

    return new Response(
      JSON.stringify({
        results,
        summary: {
          total: models.length,
          accessible: accessibleCount,
          denied: deniedCount,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in validate-models function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
