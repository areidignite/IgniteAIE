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
        JSON.stringify({ error: "Missing Authorization header" }),
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
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError?.message }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { knowledgeBaseId } = await req.json();

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

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

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

    const listDataSourcesEndpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/${knowledgeBaseId}/datasources/`;
    const listRequestBody = JSON.stringify({});

    const listHeaders = await signRequest({
      method: "POST",
      url: listDataSourcesEndpoint,
      body: listRequestBody,
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    listHeaders["Content-Type"] = "application/json";
    listHeaders["Host"] = `bedrock-agent.${awsRegion}.amazonaws.com`;

    const listResponse = await fetch(listDataSourcesEndpoint, {
      method: "POST",
      headers: listHeaders,
      body: listRequestBody,
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      return new Response(
        JSON.stringify({
          error: "Failed to retrieve data source",
          details: errorText,
        }),
        {
          status: listResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const listData = await listResponse.json();

    console.log("ListDataSources raw JSON:", JSON.stringify(listData, null, 2));

    if (!listData.dataSourceSummaries || listData.dataSourceSummaries.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No data source found for this knowledge base",
          rawResponse: listData,
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

    const dataSourceId = listData.dataSourceSummaries[0]?.dataSourceId;
    console.log("Extracted dataSourceId:", dataSourceId);

    if (!dataSourceId) {
      return new Response(
        JSON.stringify({
          error: "Data source ID is undefined",
          rawResponse: listData,
          firstSummary: listData.dataSourceSummaries[0],
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

    const syncEndpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/${knowledgeBaseId}/datasources/${dataSourceId}/ingestionjobs/`;
    const syncRequestBody = JSON.stringify({});

    const syncHeaders = await signRequest({
      method: "PUT",
      url: syncEndpoint,
      body: syncRequestBody,
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    syncHeaders["Content-Type"] = "application/json";
    syncHeaders["Host"] = `bedrock-agent.${awsRegion}.amazonaws.com`;

    const syncResponse = await fetch(syncEndpoint, {
      method: "PUT",
      headers: syncHeaders,
      body: syncRequestBody,
    });

    if (!syncResponse.ok) {
      const errorText = await syncResponse.text();
      return new Response(
        JSON.stringify({
          error: "Failed to start knowledge base sync",
          details: errorText,
        }),
        {
          status: syncResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const syncData = await syncResponse.json();

    return new Response(
      JSON.stringify({
        message: "Knowledge base sync started successfully",
        ingestionJob: syncData.ingestionJob,
        knowledgeBaseId,
        dataSourceId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
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