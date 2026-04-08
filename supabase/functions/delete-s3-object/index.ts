import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function md5Base64(data: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("md5").update(data, "utf8").digest("base64");
  return hash;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { key, keys, knowledgeBaseId } = await req.json();

    if (!key && (!keys || keys.length === 0)) {
      return new Response(
        JSON.stringify({ error: "Key or keys array is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const keysToDelete: string[] = keys && keys.length > 0 ? keys : [key];

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
    const awsRegion = (Deno.env.get("AWS_REGION") || "us-east-1").trim();
    let bucketName = Deno.env.get("AWS_S3_BUCKET_NAME")?.trim();
    let prefix = "";

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({
          error: "AWS credentials not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (knowledgeBaseId) {
      console.log("Fetching data source configuration for KB:", knowledgeBaseId);

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

      if (dsListResponse.ok) {
        const dsListData = await dsListResponse.json();

        if (dsListData.dataSourceSummaries && dsListData.dataSourceSummaries.length > 0) {
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

          if (dsDetailResponse.ok) {
            const dsDetailData = await dsDetailResponse.json();
            console.log("Data source details:", JSON.stringify(dsDetailData, null, 2));

            const s3Config = dsDetailData.dataSource?.dataSourceConfiguration?.s3Configuration;
            if (s3Config?.bucketArn) {
              const bucketArn = s3Config.bucketArn;
              const arnParts = bucketArn.split(':::');
              if (arnParts.length > 1) {
                const pathPart = arnParts[1];
                const slashIndex = pathPart.indexOf('/');
                if (slashIndex > -1) {
                  bucketName = pathPart.substring(0, slashIndex);
                  prefix = pathPart.substring(slashIndex + 1);
                  if (prefix && !prefix.endsWith('/')) {
                    prefix = prefix + '/';
                  }
                  console.log("Extracted from bucket ARN - bucket:", bucketName, "prefix:", prefix);
                } else {
                  bucketName = pathPart;
                  console.log("Extracted bucket name from ARN:", bucketName);
                }
              }
            }

            if (s3Config?.inclusionPrefixes && s3Config.inclusionPrefixes.length > 0) {
              prefix = s3Config.inclusionPrefixes[0];
              console.log("Using inclusion prefix:", prefix);
            }
          }
        }
      }
    }

    if (!bucketName) {
      return new Response(
        JSON.stringify({
          error: "No S3 bucket configured",
          message: knowledgeBaseId
            ? "Could not determine S3 bucket from knowledge base configuration"
            : "No default bucket configured and no knowledge base specified",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log("Using S3 bucket:", bucketName, "with prefix:", prefix);

    const fullKeys = keysToDelete.map((k: string) => prefix ? `${prefix}${k}` : k);
    console.log("Deleting objects with keys:", fullKeys);

    const objectElements = fullKeys
      .map((k: string) => `<Object><Key>${escapeXml(k)}</Key></Object>`)
      .join("");
    const deleteXmlBody = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>false</Quiet>${objectElements}</Delete>`;

    const contentMd5 = await md5Base64(deleteXmlBody);

    const s3Url = `https://${bucketName}.s3.${awsRegion}.amazonaws.com/?delete`;

    const s3Headers = await signRequest({
      method: "POST",
      url: s3Url,
      body: deleteXmlBody,
      region: awsRegion,
      service: "s3",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    s3Headers["Content-Type"] = "application/xml";
    s3Headers["Content-MD5"] = contentMd5;

    console.log("Sending multi-object delete request to:", s3Url);

    const s3Response = await fetch(s3Url, {
      method: "POST",
      headers: s3Headers,
      body: deleteXmlBody,
    });

    const responseText = await s3Response.text();
    console.log("S3 delete response status:", s3Response.status, "body:", responseText);

    if (!s3Response.ok) {
      console.error("S3 multi-object delete error:", {
        status: s3Response.status,
        error: responseText,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to delete S3 objects",
          failedKeys: keysToDelete,
          details: responseText,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const failed: string[] = [];
    const errorRegex = /<Error><Key>(.*?)<\/Key>.*?<Message>(.*?)<\/Message><\/Error>/gs;
    let errorMatch;
    while ((errorMatch = errorRegex.exec(responseText)) !== null) {
      console.error("Failed to delete key:", errorMatch[1], "reason:", errorMatch[2]);
      failed.push(errorMatch[1]);
    }

    let deleted = 0;
    const deletedRegex = /<Deleted><Key>(.*?)<\/Key>/g;
    let deletedMatch;
    while ((deletedMatch = deletedRegex.exec(responseText)) !== null) {
      deleted++;
    }

    if (failed.length > 0 && deleted === 0) {
      return new Response(
        JSON.stringify({
          error: "Failed to delete S3 objects",
          failedKeys: failed,
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Deleted ${deleted} object(s)${failed.length > 0 ? `, ${failed.length} failed` : ""}`,
        deleted,
        failed,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in delete-s3-object function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});