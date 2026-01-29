import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AttachedFile {
  name: string;
  s3Key: string;
  size: number;
}

interface QueryRequest {
  query: string;
  knowledgeBaseId?: string;
  modelArn?: string;
  inferenceProfileId?: string;
  inferenceProfileArn?: string;
  useKnowledgeBase?: boolean;
  generateTitle?: boolean;
  systemPrompt?: string;
  attachments?: AttachedFile[];
  includeCitations?: boolean;
}

interface BedrockResponse {
  answer: string;
  citations: Array<{
    text: string;
    location?: any;
  }>;
  title?: string | null;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode('AWS4' + key), dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
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
  const path = urlObj.pathname.split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = await sha256(body);

  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';

  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const canonicalRequestHash = await sha256(canonicalRequest);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = Array.from(new Uint8Array(await hmacSha256(signingKey, stringToSign)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Host': host,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader,
    'Content-Type': 'application/json'
  };
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
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({
          code: 401,
          message: "Invalid JWT",
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

    const { query, knowledgeBaseId, modelArn, inferenceProfileId, inferenceProfileArn, useKnowledgeBase = true, generateTitle = false, systemPrompt, attachments, includeCitations = false }: QueryRequest = await req.json();

    console.log('Received request:', { modelArn, inferenceProfileId, inferenceProfileArn, useKnowledgeBase, attachments, includeCitations });

    // Fetch model details to get max output tokens
    let maxOutputTokens = 8000; // Default fallback
    if (modelArn) {
      try {
        const modelId = modelArn.split('/').pop() || modelArn;
        const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID")!;
        const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
        const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

        const modelDetailsEndpoint = `https://bedrock.${awsRegion}.amazonaws.com/foundation-models/${encodeURIComponent(modelId)}`;
        const modelDetailsHeaders = await signRequest(
          'GET',
          modelDetailsEndpoint,
          '',
          awsRegion,
          'bedrock',
          awsAccessKeyId,
          awsSecretAccessKey
        );

        const modelDetailsResponse = await fetch(modelDetailsEndpoint, {
          method: 'GET',
          headers: modelDetailsHeaders,
        });

        if (modelDetailsResponse.ok) {
          const modelDetails = await modelDetailsResponse.json();
          console.log('Model details:', modelDetails);

          // Extract max output tokens from model details
          if (modelDetails.modelDetails?.outputModalities) {
            for (const modality of modelDetails.modelDetails.outputModalities) {
              if (modality.text?.maxOutputTokens) {
                maxOutputTokens = Math.floor(modality.text.maxOutputTokens * 0.95); // Use 95% as safety margin
                console.log(`Using max output tokens: ${maxOutputTokens} (95% of ${modality.text.maxOutputTokens})`);
                break;
              }
            }
          }
        } else {
          console.warn('Failed to fetch model details, using default maxTokens');
        }
      } catch (error) {
        console.warn('Error fetching model details:', error);
        // Continue with default
      }
    }

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // No query augmentation - send queries exactly as typed

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";
    const awsKnowledgeBaseId = knowledgeBaseId || Deno.env.get("AWS_KNOWLEDGE_BASE_ID");

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

    let answer = "";
    let citations: Array<{ text: string; location?: any }> = [];

    if (awsKnowledgeBaseId && useKnowledgeBase) {
      const endpoint = `https://bedrock-agent-runtime.${awsRegion}.amazonaws.com/retrieveAndGenerate`;

      let finalModelArn: string;

      if (inferenceProfileId) {
        finalModelArn = inferenceProfileId;
      } else if (modelArn) {
        finalModelArn = modelArn;
      } else {
        finalModelArn = `arn:aws:bedrock:${awsRegion}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`;
      }

      const body: any = {
        input: {
          text: query
        },
        retrieveAndGenerateConfiguration: {
          type: "KNOWLEDGE_BASE",
          knowledgeBaseConfiguration: {
            knowledgeBaseId: awsKnowledgeBaseId,
            modelArn: finalModelArn,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 25
              }
            },
            generationConfiguration: {
              inferenceConfig: {
                textInferenceConfig: {
                  maxTokens: maxOutputTokens,
                  temperature: 0.7
                }
              }
            }
          }
        }
      };

      if (includeCitations) {
        body.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.orchestrationConfiguration = {
          queryTransformationConfiguration: {
            type: "QUERY_DECOMPOSITION"
          }
        };
      }

      const bodyString = JSON.stringify(body);
      const headers = await signRequest(
        "POST",
        endpoint,
        bodyString,
        awsRegion,
        "bedrock",
        awsAccessKeyId,
        awsSecretAccessKey
      );

      const bedrockResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyString,
      });

      if (!bedrockResponse.ok) {
        const errorText = await bedrockResponse.text();
        console.error("Bedrock API error:", errorText);
        return new Response(
          JSON.stringify({
            error: "Failed to get response from Bedrock Knowledge Base",
            details: errorText,
            status: bedrockResponse.status,
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

      const bedrockData = await bedrockResponse.json();
      answer = bedrockData.output?.text || "No answer generated";

      if (includeCitations && bedrockData.citations) {
        citations = bedrockData.citations.flatMap((citation: any) =>
          (citation.retrievedReferences || []).map((ref: any) => ({
            text: ref?.content?.text || "",
            location: ref?.location
          }))
        );
      }
    } else {
      let extractedModelId: string;
      if (inferenceProfileId) {
        extractedModelId = inferenceProfileId;
      } else {
        const modelId = modelArn || 'anthropic.claude-3-5-sonnet-20240620-v1:0';
        extractedModelId = modelId.includes('foundation-model/')
          ? modelId.split('foundation-model/')[1]
          : modelId;
      }

      const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${extractedModelId}/converse`;

      const body: any = {
        messages: [
          {
            role: "user",
            content: [
              {
                text: enhancedQuery
              }
            ]
          }
        ],
        inferenceConfig: {
          maxTokens: maxOutputTokens,
          temperature: 0.7
        }
      };

      if (systemPrompt) {
        body.system = [
          {
            text: systemPrompt
          }
        ];
      }

      const bodyString = JSON.stringify(body);
      const headers = await signRequest(
        "POST",
        endpoint,
        bodyString,
        awsRegion,
        "bedrock",
        awsAccessKeyId,
        awsSecretAccessKey
      );

      const bedrockResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyString,
      });

      if (!bedrockResponse.ok) {
        const errorText = await bedrockResponse.text();
        console.error("Bedrock API error:", errorText);
        return new Response(
          JSON.stringify({
            error: "Failed to get response from Bedrock",
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

      const bedrockData = await bedrockResponse.json();
      answer = bedrockData.output?.message?.content?.[0]?.text || "No answer generated";
    }

    // Generate title from first line of response (no LLM call needed)
    let title: string | undefined;

    if (generateTitle && answer) {
      const trimmedAnswer = answer.trim();
      // Extract the first line of the response (up to newline or max 150 chars)
      const firstLine = trimmedAnswer.split('\n')[0].trim();
      title = firstLine.slice(0, 150);
      console.log('Using first line of response as title:', title);
    }

    const response: BedrockResponse = {
      answer,
      citations,
      title: title || null,
    };

    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error in bedrock-llm function:", error);
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