import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface KnowledgeBase {
  knowledgeBaseId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  dataSourceId?: string;
}

Deno.serve(async (req: Request) => {
  console.log("[list-knowledge-bases] Request received", {
    method: req.method,
    headers: Object.fromEntries(req.headers.entries())
  });

  if (req.method === "OPTIONS") {
    console.log("[list-knowledge-bases] Handling OPTIONS request");
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    console.log("[list-knowledge-bases] Creating Supabase client");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    console.log("[list-knowledge-bases] Auth header present:", !!authHeader);

    if (!authHeader) {
      console.error("[list-knowledge-bases] No Authorization header");
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
    console.log("[list-knowledge-bases] Verifying user token");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[list-knowledge-bases] Auth error:", authError);
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

    console.log("[list-knowledge-bases] User authenticated:", user.id);

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      console.error("[list-knowledge-bases] AWS credentials not configured");
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

    const endpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/`;
    const requestBody = JSON.stringify({ maxResults: 100 });
    console.log("[list-knowledge-bases] Calling Bedrock endpoint:", endpoint);
    console.log("[list-knowledge-bases] Request body:", requestBody);

    const bedrockHeaders = await signRequest({
      method: "POST",
      url: endpoint,
      body: requestBody,
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    bedrockHeaders["Content-Type"] = "application/json";
    bedrockHeaders["Host"] = `bedrock-agent.${awsRegion}.amazonaws.com`;

    const bedrockResponse = await fetch(endpoint, {
      method: "POST",
      headers: bedrockHeaders,
      body: requestBody,
    });

    console.log("[list-knowledge-bases] Bedrock response status:", bedrockResponse.status);

    if (!bedrockResponse.ok) {
      const errorText = await bedrockResponse.text();
      console.error("[list-knowledge-bases] Bedrock API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to list knowledge bases",
          details: errorText,
          status: bedrockResponse.status
        }),
        {
          status: bedrockResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await bedrockResponse.json();
    const knowledgeBases: KnowledgeBase[] = data.knowledgeBaseSummaries || [];
    console.log("[list-knowledge-bases] Found knowledge bases:", knowledgeBases.length);

    // Fetch data source IDs for each knowledge base
    const knowledgeBasesWithDataSources = await Promise.all(
      knowledgeBases.map(async (kb) => {
        try {
          console.log(`[list-knowledge-bases] Fetching data sources for KB: ${kb.knowledgeBaseId}`);
          const dsEndpoint = `https://bedrock-agent.${awsRegion}.amazonaws.com/knowledgebases/${kb.knowledgeBaseId}/datasources`;

          const dsHeaders = await signRequest({
            method: "GET",
            url: dsEndpoint,
            body: "",
            region: awsRegion,
            service: "bedrock",
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey,
          });

          dsHeaders["Content-Type"] = "application/json";
          dsHeaders["Host"] = `bedrock-agent.${awsRegion}.amazonaws.com`;

          console.log(`[list-knowledge-bases] Calling data sources endpoint: ${dsEndpoint}`);
          const dsResponse = await fetch(dsEndpoint, {
            method: "GET",
            headers: dsHeaders,
          });

          console.log(`[list-knowledge-bases] Data sources response status for KB ${kb.knowledgeBaseId}: ${dsResponse.status}`);

          if (dsResponse.ok) {
            const dsData = await dsResponse.json();
            console.log(`[list-knowledge-bases] Data sources response for KB ${kb.knowledgeBaseId}:`, JSON.stringify(dsData));
            const dataSources = dsData.dataSourceSummaries || [];
            console.log(`[list-knowledge-bases] KB ${kb.knowledgeBaseId} has ${dataSources.length} data sources`);
            if (dataSources.length > 0) {
              console.log(`[list-knowledge-bases] KB ${kb.knowledgeBaseId} first data source:`, JSON.stringify(dataSources[0]));
              console.log(`[list-knowledge-bases] KB ${kb.knowledgeBaseId} first data source ID: ${dataSources[0].dataSourceId}`);
              return { ...kb, dataSourceId: dataSources[0].dataSourceId };
            } else {
              console.warn(`[list-knowledge-bases] KB ${kb.knowledgeBaseId} has no data sources configured`);
            }
          } else {
            const errorText = await dsResponse.text();
            console.error(`[list-knowledge-bases] Failed to fetch data sources for KB ${kb.knowledgeBaseId}: ${dsResponse.status} ${dsResponse.statusText}`);
            console.error(`[list-knowledge-bases] Error response body:`, errorText);
          }
        } catch (error) {
          console.error(`[list-knowledge-bases] Exception fetching data source for KB ${kb.knowledgeBaseId}:`, error);
          console.error(`[list-knowledge-bases] Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
        }
        return kb;
      })
    );

    return new Response(JSON.stringify({ knowledgeBases: knowledgeBasesWithDataSources }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("[list-knowledge-bases] Error in function:", error);
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