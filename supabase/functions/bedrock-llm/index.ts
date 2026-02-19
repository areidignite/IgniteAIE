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
    console.log("DEBUG: Auth header exists?", !!authHeader);
    console.log("DEBUG: Auth header value:", authHeader?.substring(0, 20) + "...");

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

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("DEBUG: Supabase URL:", supabaseUrl);
    console.log("DEBUG: Has anon key:", !!supabaseAnonKey);
    console.log("DEBUG: Auth header received:", authHeader.substring(0, 20) + "...");

    // Extract JWT token from Authorization header
    const jwt = authHeader.replace('Bearer ', '');
    console.log("DEBUG: JWT extracted (first 20 chars):", jwt.substring(0, 20) + "...");

    // Create client and validate the user token
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    console.log("DEBUG: Auth validation completed");
    console.log("DEBUG: Auth error?", !!authError);
    console.log("DEBUG: Auth error message:", authError?.message);
    console.log("DEBUG: Auth error name:", authError?.name);
    console.log("DEBUG: User exists?", !!user);
    console.log("DEBUG: User ID:", user?.id);

    if (authError || !user) {
      console.error("Auth validation failed:", authError);
      return new Response(
        JSON.stringify({
          code: 401,
          message: "Invalid JWT",
          details: authError?.message || "User not authenticated",
          errorName: authError?.name
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

    // If attachments are provided, download them for use in the API call
    interface ProcessedAttachment {
      name: string;
      format: string;
      source: {
        bytes: string;
      };
    }

    let processedAttachments: ProcessedAttachment[] = [];
    if (attachments && attachments.length > 0) {
      console.log('Processing attachments:', attachments);

      for (const attachment of attachments) {
        try {
          // Get presigned URL to download the file
          const s3Bucket = Deno.env.get("AWS_S3_BUCKET_NAME");
          if (!s3Bucket) {
            console.error('S3 bucket not configured');
            continue;
          }

          // Generate presigned URL for download
          const s3Endpoint = `https://${s3Bucket}.s3.${awsRegion}.amazonaws.com/${attachment.s3Key}`;
          const s3Headers = await signRequest(
            'GET',
            s3Endpoint,
            '',
            awsRegion,
            's3',
            awsAccessKeyId,
            awsSecretAccessKey
          );

          const s3Response = await fetch(s3Endpoint, {
            method: 'GET',
            headers: s3Headers,
          });

          if (s3Response.ok) {
            // Get the file as binary data
            const arrayBuffer = await s3Response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Convert to base64
            const base64 = btoa(String.fromCharCode(...bytes));

            // Determine format
            let format = 'pdf';
            const extension = attachment.name.toLowerCase().split('.').pop();
            if (extension === 'txt') format = 'txt';
            else if (extension === 'md') format = 'md';
            else if (extension === 'csv') format = 'csv';
            else if (extension === 'doc' || extension === 'docx') format = 'doc';

            processedAttachments.push({
              name: attachment.name,
              format: format,
              source: {
                bytes: base64
              }
            });

            console.log(`Successfully processed attachment ${attachment.name} (${format})`);
          } else {
            console.error(`Failed to download ${attachment.name}:`, await s3Response.text());
          }
        } catch (error) {
          console.error(`Error processing attachment ${attachment.name}:`, error);
        }
      }
    }

    if (awsKnowledgeBaseId && useKnowledgeBase && processedAttachments.length === 0) {
      // Use knowledge base for queries without attachments
      const endpoint = `https://bedrock-agent-runtime.${awsRegion}.amazonaws.com/retrieveAndGenerate`;

      let finalModelArn: string;

      if (inferenceProfileId) {
        finalModelArn = inferenceProfileId;
      } else if (modelArn) {
        finalModelArn = modelArn;
      } else {
        finalModelArn = `arn:aws:bedrock:${awsRegion}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`;
      }

      // Add instruction to extract names from source documents
      let enhancedQuery = query;
      if (query.toLowerCase().includes('candidate') || query.toLowerCase().includes('resume')) {
        enhancedQuery = `${query}\n\nIMPORTANT: For each candidate you identify, extract their full name from the source document. Look for names at the beginning of documents or in header sections. Include the source document filename in your response. Present the information in a clear list format with: 1) Candidate Name, 2) Certifications, 3) Source Document.`;
      }

      const body: any = {
        input: {
          text: enhancedQuery
        },
        retrieveAndGenerateConfiguration: {
          type: "KNOWLEDGE_BASE",
          knowledgeBaseConfiguration: {
            knowledgeBaseId: awsKnowledgeBaseId,
            modelArn: finalModelArn,
            retrievalConfiguration: {
              vectorSearchConfiguration: {
                numberOfResults: 50,
                overrideSearchType: "HYBRID"
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

      console.log("DEBUG: Sending request to Bedrock Knowledge Base");
      console.log("DEBUG: Endpoint:", endpoint);
      console.log("DEBUG: Request body:", JSON.stringify(body, null, 2));

      const bedrockResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: bodyString,
      });

      console.log("DEBUG: Bedrock response status:", bedrockResponse.status);

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
      console.log("DEBUG: Bedrock response data:", JSON.stringify(bedrockData, null, 2));

      answer = bedrockData.output?.text || "No answer generated";
      console.log("DEBUG: Extracted answer:", answer);

      if (includeCitations && bedrockData.citations) {
        citations = bedrockData.citations.flatMap((citation: any) =>
          (citation.retrievedReferences || []).map((ref: any) => ({
            text: ref?.content?.text || "",
            location: ref?.location
          }))
        );
        console.log("DEBUG: Extracted citations count:", citations.length);
      }
    } else {
      // Use Converse API for direct model calls (with or without attachments)
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

      // Build content array with text and documents
      const content: any[] = [
        {
          text: query
        }
      ];

      // Add documents if attachments are present
      if (processedAttachments.length > 0) {
        console.log(`Adding ${processedAttachments.length} documents to the request`);
        for (const attachment of processedAttachments) {
          content.push({
            document: {
              name: attachment.name,
              format: attachment.format,
              source: {
                bytes: attachment.source.bytes
              }
            }
          });
        }
      }

      const body: any = {
        messages: [
          {
            role: "user",
            content: content
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