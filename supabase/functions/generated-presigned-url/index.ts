import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { S3Client, GetObjectCommand } from "npm:@aws-sdk/client-s3@3.478.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.478.0";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PresignedUrlRequest {
  s3Uri?: string;
  key?: string;
  expiresIn?: number;
  knowledgeBaseId?: string;
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

    const { s3Uri, key: requestKey, expiresIn = 3600, knowledgeBaseId }: PresignedUrlRequest = await req.json();

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
    const awsRegion = (Deno.env.get("AWS_REGION") || "us-east-1").trim();
    let bucketName = Deno.env.get("AWS_S3_BUCKET_NAME")?.trim();

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: "AWS credentials not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (knowledgeBaseId && requestKey) {
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
            const s3Config = dsDetailData.dataSource?.dataSourceConfiguration?.s3Configuration;

            if (s3Config?.bucketArn) {
              const bucketArn = s3Config.bucketArn;
              const arnParts = bucketArn.split(':::');
              if (arnParts.length > 1) {
                const pathPart = arnParts[1];
                const slashIndex = pathPart.indexOf('/');
                if (slashIndex > -1) {
                  bucketName = pathPart.substring(0, slashIndex);
                  console.log("Extracted bucket name from ARN:", bucketName);
                } else {
                  bucketName = pathPart;
                  console.log("Extracted bucket name from ARN:", bucketName);
                }
              }
            }
          }
        }
      }
    }

    let bucket: string;
    let key: string;

    // Support both s3Uri format and separate key parameter
    if (s3Uri) {
      if (!s3Uri.startsWith("s3://")) {
        return new Response(
          JSON.stringify({ error: "Invalid S3 URI - must start with s3://" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const s3UriMatch = s3Uri.match(/^s3:\/\/([^\/]+)\/(.+)$/);
      if (!s3UriMatch) {
        return new Response(
          JSON.stringify({ error: "Invalid S3 URI format" }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      bucket = s3UriMatch[1];
      key = s3UriMatch[2];
    } else if (requestKey) {
      if (!bucketName) {
        return new Response(
          JSON.stringify({ error: "Bucket name not configured" }),
          {
            status: 500,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
      bucket = bucketName;
      key = requestKey;
    } else {
      return new Response(
        JSON.stringify({ error: "Either s3Uri or key must be provided" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn,
    });

    return new Response(
      JSON.stringify({ url: presignedUrl }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
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