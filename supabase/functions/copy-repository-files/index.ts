import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({
          error: "Invalid JWT",
          details: authError?.message || "User not authenticated"
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { fileKeys, knowledgeBaseId } = await req.json();

    if (!fileKeys || !Array.isArray(fileKeys) || fileKeys.length === 0) {
      return new Response(
        JSON.stringify({ error: "fileKeys array is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!knowledgeBaseId) {
      return new Response(
        JSON.stringify({ error: "knowledgeBaseId is required" }),
        {
          status: 400,
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
    const repositoryBucket = Deno.env.get("AWS_REPOSITORY_BUCKET_NAME")?.trim();

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

    if (!repositoryBucket) {
      return new Response(
        JSON.stringify({
          error: "Repository bucket not configured",
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

    console.log("Fetching destination bucket for KB:", knowledgeBaseId);

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
      console.error("Failed to fetch data sources:", dsListResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch knowledge base data sources",
          details: errorText,
        }),
        {
          status: dsListResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const dsListData = await dsListResponse.json();
    if (!dsListData.dataSourceSummaries || dsListData.dataSourceSummaries.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No data sources found for knowledge base",
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
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
      console.error("Failed to fetch data source details:", dsDetailResponse.status, errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch data source details",
          details: errorText,
        }),
        {
          status: dsDetailResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const dsDetailData = await dsDetailResponse.json();
    const s3Config = dsDetailData.dataSource?.dataSourceConfiguration?.s3Configuration;

    if (!s3Config?.bucketArn) {
      return new Response(
        JSON.stringify({
          error: "No S3 bucket configured for knowledge base",
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

    const bucketArn = s3Config.bucketArn;
    const arnParts = bucketArn.split(':::');
    let destinationBucket = "";
    let destinationPrefix = "";

    if (arnParts.length > 1) {
      const pathPart = arnParts[1];
      const slashIndex = pathPart.indexOf('/');
      if (slashIndex > -1) {
        destinationBucket = pathPart.substring(0, slashIndex);
        destinationPrefix = pathPart.substring(slashIndex + 1);
        if (destinationPrefix && !destinationPrefix.endsWith('/')) {
          destinationPrefix = destinationPrefix + '/';
        }
      } else {
        destinationBucket = pathPart;
      }
    }

    if (s3Config?.inclusionPrefixes && s3Config.inclusionPrefixes.length > 0) {
      destinationPrefix = s3Config.inclusionPrefixes[0];
      if (!destinationPrefix.endsWith('/')) {
        destinationPrefix = destinationPrefix + '/';
      }
    }

    if (!destinationBucket) {
      return new Response(
        JSON.stringify({
          error: "Could not determine destination bucket",
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

    console.log("Copying files from", repositoryBucket, "to", destinationBucket, "prefix:", destinationPrefix);

    const copyResults = [];

    for (const fileKey of fileKeys) {
      try {
        const fileName = fileKey.split('/').pop();
        const destinationKey = destinationPrefix + fileName;

        const copySource = `/${repositoryBucket}/${fileKey}`;
        const copyUrl = `https://${destinationBucket}.s3.${awsRegion}.amazonaws.com/${destinationKey}`;

        const copyHeaders = await signRequest({
          method: "PUT",
          url: copyUrl,
          body: "",
          region: awsRegion,
          service: "s3",
          accessKeyId: awsAccessKeyId,
          secretAccessKey: awsSecretAccessKey,
          extraHeaders: {
            "x-amz-copy-source": copySource,
          },
        });

        console.log("Copying", copySource, "to", copyUrl);

        const copyResponse = await fetch(copyUrl, {
          method: "PUT",
          headers: copyHeaders,
        });

        if (!copyResponse.ok) {
          const errorText = await copyResponse.text();
          console.error("Failed to copy file:", fileKey, errorText);
          copyResults.push({
            fileKey,
            success: false,
            error: errorText,
          });
        } else {
          console.log("Successfully copied:", fileKey);
          copyResults.push({
            fileKey,
            success: true,
            destinationKey,
          });
        }
      } catch (error) {
        console.error("Error copying file:", fileKey, error);
        copyResults.push({
          fileKey,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = copyResults.filter(r => r.success).length;
    const failureCount = copyResults.filter(r => !r.success).length;

    return new Response(
      JSON.stringify({
        message: `Copied ${successCount} file(s) successfully, ${failureCount} failed`,
        results: copyResults,
        successCount,
        failureCount,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in copy-repository-files function:", error);
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
