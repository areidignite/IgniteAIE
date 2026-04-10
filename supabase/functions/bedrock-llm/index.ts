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

    function getMaxOutputTokens(modelIdentifier: string | undefined): number {
      const id = (modelIdentifier || '').toLowerCase();

      if (id.includes('claude-opus')) return 32000;
      if (id.includes('claude-sonnet-4')) return 16000;
      if (id.includes('claude-3-5-sonnet') || id.includes('claude-3.5-sonnet')) return 8192;
      if (id.includes('claude-3-5-haiku') || id.includes('claude-3.5-haiku')) return 8192;
      if (id.includes('claude-haiku-4') || id.includes('claude-haiku-4.5')) return 16000;
      if (id.includes('claude')) return 8192;

      if (id.includes('nova-premier')) return 25000;
      if (id.includes('nova-pro')) return 5120;
      if (id.includes('nova-lite')) return 5120;
      if (id.includes('nova-micro')) return 5120;

      if (id.includes('llama-4')) return 16384;
      if (id.includes('llama-3') || id.includes('llama3')) return 8192;
      if (id.includes('llama')) return 4096;

      if (id.includes('mistral-large')) return 8192;
      if (id.includes('mistral')) return 8192;

      if (id.includes('deepseek')) return 16384;
      if (id.includes('command-r')) return 4096;
      if (id.includes('jamba')) return 4096;

      return 4096;
    }

    const resolvedModelId = inferenceProfileId || inferenceProfileArn || modelArn || '';
    const maxOutputTokens = getMaxOutputTokens(resolvedModelId);
    console.log(`Model: ${resolvedModelId}, maxOutputTokens: ${maxOutputTokens}`);

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

    function uint8ArrayToBase64(bytes: Uint8Array): string {
      const chunkSize = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
      }
      return btoa(binary);
    }

    function sanitizeDocName(name: string): string {
      const withoutExt = name.replace(/\.[^.]+$/, '');
      return withoutExt.replace(/[^a-zA-Z0-9\s\-()[\]]/g, '_').slice(0, 100);
    }

    function getDocFormat(filename: string): string {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'txt') return 'txt';
      if (ext === 'md') return 'md';
      if (ext === 'csv') return 'csv';
      if (ext === 'doc' || ext === 'docx') return 'doc';
      if (ext === 'xls' || ext === 'xlsx') return 'xls';
      if (ext === 'html' || ext === 'htm') return 'html';
      return 'pdf';
    }

    let processedAttachments: ProcessedAttachment[] = [];
    if (attachments && attachments.length > 0) {
      console.log('Processing attachments:', attachments);

      for (const attachment of attachments) {
        try {
          const s3Bucket = Deno.env.get("AWS_S3_BUCKET_NAME");
          if (!s3Bucket) {
            console.error('S3 bucket not configured');
            continue;
          }

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
            const arrayBuffer = await s3Response.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            const base64 = uint8ArrayToBase64(bytes);
            const format = getDocFormat(attachment.name);

            processedAttachments.push({
              name: sanitizeDocName(attachment.name),
              format,
              source: { bytes: base64 }
            });

            console.log(`Successfully processed attachment ${attachment.name} (${format}, ${bytes.length} bytes)`);
          } else {
            console.error(`Failed to download ${attachment.name}:`, await s3Response.text());
          }
        } catch (error) {
          console.error(`Error processing attachment ${attachment.name}:`, error);
        }
      }
    }

    function resolveModelId(): string {
      if (inferenceProfileId) return inferenceProfileId;
      if (inferenceProfileArn) return inferenceProfileArn;
      const modelId = modelArn || 'anthropic.claude-sonnet-4-5-20250929-v1:0';
      const baseId = modelId.includes('foundation-model/')
        ? modelId.split('foundation-model/')[1]
        : modelId;
      return `us.${baseId}`;
    }

    function extractCitations(bedrockCitations: any[]) {
      const allRefs: Array<{ text: string; location?: any }> = [];
      const filenameMap = new Map<string, string>();

      for (const citation of bedrockCitations) {
        for (const ref of (citation.retrievedReferences || [])) {
          const s3Uri = ref?.location?.s3Location?.uri;
          if (s3Uri) {
            const parts = s3Uri.split('/');
            const filename = decodeURIComponent(parts[parts.length - 1] || s3Uri);
            if (!filenameMap.has(s3Uri)) {
              filenameMap.set(s3Uri, filename);
            }
          }
          allRefs.push({
            text: ref?.content?.text || "",
            location: ref?.location
          });
        }
      }

      return { allRefs, filenameMap };
    }

    function replaceSourceReferences(text: string, filenameMap: Map<string, string>): string {
      const uniqueFiles = Array.from(filenameMap.entries());
      if (uniqueFiles.length === 0) return text;
      return text.replace(
        /Source\s+Document[s]?\s*[:.]?\s*(\d+)/gi,
        (match: string, num: string) => {
          const idx = parseInt(num, 10) - 1;
          if (idx >= 0 && idx < uniqueFiles.length) {
            return `Source: ${uniqueFiles[idx][1]}`;
          }
          return match;
        }
      );
    }

    if (awsKnowledgeBaseId && useKnowledgeBase && processedAttachments.length === 0) {
      const endpoint = `https://bedrock-agent-runtime.${awsRegion}.amazonaws.com/retrieveAndGenerate`;

      const finalModelArn = resolveModelId();
      console.log('Knowledge Base modelArn resolved to:', finalModelArn);

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
              },
              promptTemplate: {
                textPromptTemplate: `You are a helpful assistant. Using the provided search results, answer the user's question accurately and thoroughly. If the search results don't contain enough information to fully answer the question, say so clearly.

$search_results$

$output_format_instructions$

User question: $query$`
              }
            },
            orchestrationConfiguration: {
              promptTemplate: {
                textPromptTemplate: `You are a helpful assistant that answers questions using the provided knowledge base. Use the conversation history and search results to provide accurate, thorough answers.

$conversation_history$

$output_format_instructions$

User question: $query$`
              }
            }
          }
        }
      };

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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const bedrockData = await bedrockResponse.json();
      answer = bedrockData.output?.text || "No answer generated";

      if (answer.includes("unable to assist")) {
        console.error("CONTENT FILTER TRIGGERED - Full response:", JSON.stringify(bedrockData, null, 2));
      }

      if (bedrockData.citations) {
        const { allRefs, filenameMap } = extractCitations(bedrockData.citations);
        citations = allRefs;
        answer = replaceSourceReferences(answer, filenameMap);
        console.log("DEBUG: Extracted citations count:", citations.length);
      }
    } else if (awsKnowledgeBaseId && useKnowledgeBase && processedAttachments.length > 0) {
      console.log("Using KB Retrieve + Converse with attachments");

      const retrieveEndpoint = `https://bedrock-agent-runtime.${awsRegion}.amazonaws.com/knowledgebases/${awsKnowledgeBaseId}/retrieve`;
      const retrieveBody: any = {
        retrievalQuery: { text: query },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 25,
            overrideSearchType: "HYBRID"
          }
        }
      };

      const retrieveBodyString = JSON.stringify(retrieveBody);
      const retrieveHeaders = await signRequest(
        "POST",
        retrieveEndpoint,
        retrieveBodyString,
        awsRegion,
        "bedrock",
        awsAccessKeyId,
        awsSecretAccessKey
      );

      let kbContext = '';
      const retrieveResponse = await fetch(retrieveEndpoint, {
        method: "POST",
        headers: retrieveHeaders,
        body: retrieveBodyString,
      });

      if (retrieveResponse.ok) {
        const retrieveData = await retrieveResponse.json();
        const results = retrieveData.retrievalResults || [];
        console.log(`Retrieved ${results.length} chunks from knowledge base`);

        const filenameMap = new Map<string, string>();
        const chunks: string[] = [];

        for (const result of results) {
          const text = result?.content?.text;
          if (text) chunks.push(text);

          const s3Uri = result?.location?.s3Location?.uri;
          if (s3Uri) {
            const parts = s3Uri.split('/');
            const filename = decodeURIComponent(parts[parts.length - 1] || s3Uri);
            if (!filenameMap.has(s3Uri)) filenameMap.set(s3Uri, filename);
          }

          citations.push({
            text: text || "",
            location: result?.location
          });
        }

        if (chunks.length > 0) {
          kbContext = chunks.join('\n\n---\n\n');
        }

        console.log("DEBUG: KB context length:", kbContext.length, "citations:", citations.length);
      } else {
        console.error("KB Retrieve failed:", retrieveResponse.status, await retrieveResponse.text());
      }

      const extractedModelId = resolveModelId();
      const converseEndpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${extractedModelId}/converse`;

      const content: any[] = [];

      if (kbContext) {
        content.push({
          text: `The following is reference information retrieved from the knowledge base. Use it to help answer the user's question:\n\n${kbContext}\n\n---\n\nUser's question: ${query}`
        });
      } else {
        content.push({ text: query });
      }

      for (const attachment of processedAttachments) {
        content.push({
          document: {
            name: attachment.name,
            format: attachment.format,
            source: { bytes: attachment.source.bytes }
          }
        });
      }

      const converseBody: any = {
        messages: [{ role: "user", content }],
        inferenceConfig: {
          maxTokens: maxOutputTokens,
          temperature: 0.7
        }
      };

      if (systemPrompt) {
        converseBody.system = [{ text: systemPrompt }];
      } else {
        converseBody.system = [{
          text: "You are a helpful assistant. You have been given attached document(s) and reference information from a knowledge base. Use both the attached documents and the knowledge base context to provide accurate, thorough answers. When referencing information, indicate whether it came from the attached document or the knowledge base."
        }];
      }

      const converseBodyString = JSON.stringify(converseBody);
      const converseHeaders = await signRequest(
        "POST",
        converseEndpoint,
        converseBodyString,
        awsRegion,
        "bedrock",
        awsAccessKeyId,
        awsSecretAccessKey
      );

      const converseResponse = await fetch(converseEndpoint, {
        method: "POST",
        headers: converseHeaders,
        body: converseBodyString,
      });

      if (!converseResponse.ok) {
        const errorText = await converseResponse.text();
        console.error("Converse API error:", errorText);
        return new Response(
          JSON.stringify({
            error: "Failed to get response from Bedrock",
            details: errorText,
            status: converseResponse.status
          }),
          {
            status: converseResponse.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const converseData = await converseResponse.json();
      answer = converseData.output?.message?.content?.[0]?.text || "No answer generated";
    } else {
      const extractedModelId = resolveModelId();
      const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${extractedModelId}/converse`;

      const content: any[] = [{ text: query }];

      if (processedAttachments.length > 0) {
        console.log(`Adding ${processedAttachments.length} documents to the request`);
        for (const attachment of processedAttachments) {
          content.push({
            document: {
              name: attachment.name,
              format: attachment.format,
              source: { bytes: attachment.source.bytes }
            }
          });
        }
      }

      const body: any = {
        messages: [{ role: "user", content }],
        inferenceConfig: {
          maxTokens: maxOutputTokens,
          temperature: 0.7
        }
      };

      if (systemPrompt) {
        body.system = [{ text: systemPrompt }];
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
            headers: { ...corsHeaders, "Content-Type": "application/json" },
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