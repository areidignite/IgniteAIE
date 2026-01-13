import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { signRequest } from "./aws-signer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FoundationModel {
  modelArn: string;
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
  responseStreamingSupported: boolean;
  inferenceProfileId?: string;
  inferenceProfileName?: string;
  inferenceProfileArn?: string;
}

interface InferenceProfile {
  inferenceProfileArn: string;
  inferenceProfileId: string;
  inferenceProfileName: string;
  models: Array<{
    modelArn: string;
  }>;
  status: string;
  type: string;
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
    let user;
    try {
      const { data, error: authError } = await supabase.auth.getUser(token);
      user = data?.user;

      if (authError || !user) {
        console.error("[list-foundation-models] Auth error:", authError);
        return new Response(
          JSON.stringify({ error: "Unauthorized - Please sign out and sign in again", details: authError?.message }),
          {
            status: 401,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }
    } catch (e) {
      console.error("[list-foundation-models] Exception during auth:", e);
      return new Response(
        JSON.stringify({ error: "Authentication failed", details: e instanceof Error ? e.message : "Unknown error" }),
        {
          status: 401,
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

    const endpoint = `https://bedrock.${awsRegion}.amazonaws.com/foundation-models`;

    const bedrockHeaders = await signRequest({
      method: "GET",
      url: endpoint,
      body: "",
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    const bedrockResponse = await fetch(endpoint, {
      method: "GET",
      headers: bedrockHeaders,
    });

    if (!bedrockResponse.ok) {
      const errorText = await bedrockResponse.text();
      console.error("Bedrock API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to list foundation models",
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
    const models: FoundationModel[] = data.modelSummaries || [];

    const profilesEndpoint = `https://bedrock.${awsRegion}.amazonaws.com/inference-profiles`;
    const profilesHeaders = await signRequest({
      method: "GET",
      url: profilesEndpoint,
      body: "",
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    const profilesResponse = await fetch(profilesEndpoint, {
      method: "GET",
      headers: profilesHeaders,
    });

    let profileMap = new Map<string, { id: string; name: string; arn: string }>();
    if (profilesResponse.ok) {
      const profilesData = await profilesResponse.json();
      const profiles: InferenceProfile[] = profilesData.inferenceProfileSummaries || [];

      profiles.forEach(profile => {
        profile.models.forEach(model => {
          profileMap.set(model.modelArn, {
            id: profile.inferenceProfileId,
            name: profile.inferenceProfileName,
            arn: profile.inferenceProfileArn
          });
        });
      });
    }

    const modelsWithProfiles = models.map(model => {
      const profile = profileMap.get(model.modelArn);
      return {
        ...model,
        inferenceProfileId: profile?.id,
        inferenceProfileName: profile?.name,
        inferenceProfileArn: profile?.arn
      };
    });

    const streamingModels = modelsWithProfiles.filter((model: FoundationModel) =>
      model.responseStreamingSupported && model.inferenceProfileId && model.inferenceProfileName
    );

    return new Response(JSON.stringify({ models: streamingModels }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in list-foundation-models function:", error);
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