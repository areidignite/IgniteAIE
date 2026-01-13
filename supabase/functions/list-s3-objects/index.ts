import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
  ETag: string;
}

interface ListObjectsResponse {
  Contents: S3Object[];
  IsTruncated: boolean;
  NextContinuationToken?: string;
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

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")?.trim();
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")?.trim();
    const awsRegion = (Deno.env.get("AWS_REGION") || "us-east-1").trim();

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

    const url = new URL(req.url);
    let prefix = url.searchParams.get("prefix") || "";
    const continuationToken = url.searchParams.get("continuationToken") || "";
    const maxKeys = url.searchParams.get("maxKeys") || "1000";
    const knowledgeBaseId = url.searchParams.get("knowledgeBaseId") || "";

    let bucketName: string | undefined;

    // If a knowledge base ID is provided, get its data source configuration to extract the S3 bucket and prefix
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
        console.log("Data sources list response:", JSON.stringify(dsListData, null, 2));
        if (dsListData.dataSourceSummaries && dsListData.dataSourceSummaries.length > 0) {
          const dataSourceId = dsListData.dataSourceSummaries[0].dataSourceId;
          console.log("Found data source ID:", dataSourceId);

          // Get detailed data source configuration
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

            // Extract S3 bucket and prefix from data source configuration
            const s3Config = dsDetailData.dataSource?.dataSourceConfiguration?.s3Configuration;
            console.log("S3 Config:", JSON.stringify(s3Config, null, 2));
            if (s3Config?.bucketArn) {
              // Parse the bucket ARN to get the bucket name and prefix
              // Format: arn:aws:s3:::bucket-name or arn:aws:s3:::bucket-name/prefix
              const bucketArn = s3Config.bucketArn;
              const arnParts = bucketArn.split(':::');
              if (arnParts.length > 1) {
                const pathPart = arnParts[1];
                const slashIndex = pathPart.indexOf('/');
                if (slashIndex > -1) {
                  // Bucket name is before the slash, prefix is after
                  bucketName = pathPart.substring(0, slashIndex);
                  prefix = pathPart.substring(slashIndex + 1);
                  if (prefix && !prefix.endsWith('/')) {
                    prefix = prefix + '/';
                  }
                  console.log("Extracted from bucket ARN - bucket:", bucketName, "prefix:", prefix);
                } else {
                  // No prefix in ARN, just bucket name
                  bucketName = pathPart;
                  console.log("Extracted bucket name from ARN:", bucketName);
                }
              }
            }

            // Also check for inclusionPrefixes (this takes precedence over ARN prefix)
            if (s3Config?.inclusionPrefixes && s3Config.inclusionPrefixes.length > 0) {
              prefix = s3Config.inclusionPrefixes[0];
              console.log("Using inclusion prefix:", prefix);
            }

            if (!s3Config?.bucketArn) {
              console.error("No bucketArn found in S3 configuration");
            }
          } else {
            const errorText = await dsDetailResponse.text();
            console.error("Failed to fetch data source details:", dsDetailResponse.status, errorText);
          }
        } else {
          console.error("No data sources found in response");
        }
      } else {
        const errorText = await dsListResponse.text();
        console.error("Failed to fetch data sources:", dsListResponse.status, errorText);
      }
    } else {
      bucketName = Deno.env.get("AWS_S3_BUCKET_NAME")?.trim();
    }

    // Ensure we have a bucket name
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

    const s3Url = new URL(`https://${bucketName}.s3.${awsRegion}.amazonaws.com/`);
    s3Url.searchParams.set("list-type", "2");
    s3Url.searchParams.set("max-keys", maxKeys);
    if (prefix) {
      s3Url.searchParams.set("prefix", prefix);
    }
    if (continuationToken) {
      s3Url.searchParams.set("continuation-token", continuationToken);
    }

    const s3UrlString = s3Url.toString();

    const s3Headers = await signRequest({
      method: "GET",
      url: s3UrlString,
      body: "",
      region: awsRegion,
      service: "s3",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    console.log("Making S3 request:", {
      url: s3UrlString,
      region: awsRegion,
      bucket: bucketName,
      hasAuth: !!s3Headers.Authorization,
    });

    const s3Response = await fetch(s3UrlString, {
      method: "GET",
      headers: s3Headers,
    });

    if (!s3Response.ok) {
      const errorText = await s3Response.text();
      console.error("S3 API error:", {
        status: s3Response.status,
        statusText: s3Response.statusText,
        error: errorText,
        url: s3UrlString,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to list S3 objects",
          details: errorText,
          status: s3Response.status,
          url: s3UrlString,
        }),
        {
          status: s3Response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const xmlText = await s3Response.text();

    const contents: S3Object[] = [];
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
    const contentMatches = xmlText.matchAll(contentsRegex);

    for (const match of contentMatches) {
      const contentXml = match[1];
      const key = contentXml.match(/<Key>(.*?)<\/Key>/)?.[1] || "";
      const size = parseInt(contentXml.match(/<Size>(.*?)<\/Size>/)?.[1] || "0");
      const lastModified = contentXml.match(/<LastModified>(.*?)<\/LastModified>/)?.[1] || "";
      const etag = contentXml.match(/<ETag>(.*?)<\/ETag>/)?.[1] || "";

      contents.push({
        Key: key,
        Size: size,
        LastModified: lastModified,
        ETag: etag,
      });
    }

    const isTruncated = xmlText.match(/<IsTruncated>(.*?)<\/IsTruncated>/)?.[1] === "true";
    const nextToken = xmlText.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1] || undefined;

    const response: ListObjectsResponse = {
      Contents: contents,
      IsTruncated: isTruncated,
      NextContinuationToken: nextToken,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in list-s3-objects function:", error);
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