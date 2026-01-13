import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueryRequest {
  query: string;
  knowledgeBaseId?: string;
  modelArn?: string;
  inferenceProfileId?: string;
  inferenceProfileArn?: string;
  useKnowledgeBase?: boolean;
  generateTitle?: boolean;
  systemPrompt?: string;
}

interface BedrockResponse {
  answer: string;
  citations: Array<{
    text: string;
    location?: any;
  }>;
  title?: string | null;
  titleDebug?: any;
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

    const { query, knowledgeBaseId, modelArn, inferenceProfileId, inferenceProfileArn, useKnowledgeBase = true, generateTitle = false, systemPrompt }: QueryRequest = await req.json();

    console.log('Received request:', { modelArn, inferenceProfileId, inferenceProfileArn, useKnowledgeBase });

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

      const body = {
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
                numberOfResults: 5
              }
            },
            generationConfiguration: {
              inferenceConfig: {
                textInferenceConfig: {
                  maxTokens: 4096,
                  temperature: 0.7
                }
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

      if (bedrockData.citations) {
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
                text: query
              }
            ]
          }
        ],
        inferenceConfig: {
          maxTokens: 4096,
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

    let title: string | undefined;
    const titleDebug: any = {
      attempted: false,
      generateTitleParam: generateTitle,
      hasAnswer: !!answer,
      answerLength: answer.length
    };

    console.log('Title generation check - generateTitle:', generateTitle, 'answer length:', answer.length);

    if (generateTitle && answer) {
      titleDebug.attempted = true;
      try {
        const titlePrompt = `Create a 5-8 word title for this content:\n\n${answer.slice(0, 500)}`;

        let extractedModelId: string;

        if (inferenceProfileId) {
          extractedModelId = inferenceProfileId;
        } else if (modelArn) {
          extractedModelId = modelArn.includes('foundation-model/')
            ? modelArn.split('foundation-model/')[1]
            : modelArn;
        } else {
          extractedModelId = 'anthropic.claude-3-5-sonnet-20240620-v1:0';
        }

        console.log('Title generation - extractedModelId:', extractedModelId);

        const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${extractedModelId}/converse`;
        console.log('Title generation endpoint:', endpoint);
        titleDebug.endpoint = endpoint;

        const titleBody = {
          messages: [
            {
              role: "user",
              content: [
                {
                  text: titlePrompt
                }
              ]
            }
          ],
          inferenceConfig: {
            maxTokens: 1500,
            temperature: 0.3
          },
          system: [
            {
              text: "You are a title generator. Output only a short title (5-8 words). No reasoning, no explanations, no quotes. Just the title."
            }
          ]
        };

        const titleBodyString = JSON.stringify(titleBody);
        const titleHeaders = await signRequest(
          "POST",
          endpoint,
          titleBodyString,
          awsRegion,
          "bedrock",
          awsAccessKeyId,
          awsSecretAccessKey
        );

        console.log('Making title request...');
        const titleResponse = await fetch(endpoint, {
          method: "POST",
          headers: titleHeaders,
          body: titleBodyString,
        });

        console.log('Title response status:', titleResponse.status);
        titleDebug.status = titleResponse.status;

        if (titleResponse.ok) {
          const titleData = await titleResponse.json();
          console.log('Title response data:', JSON.stringify(titleData));
          titleDebug.fullResponse = titleData;

          let rawTitle: string | undefined;
          const contentArray = titleData.output?.message?.content;

          if (contentArray && Array.isArray(contentArray)) {
            for (const item of contentArray) {
              if (item.text) {
                rawTitle = item.text;
                break;
              } else if (item.reasoningContent?.reasoningText?.text) {
                continue;
              }
            }

            if (!rawTitle) {
              for (const item of contentArray) {
                if (item.reasoningContent?.reasoningText?.text) {
                  const reasoningText = item.reasoningContent.reasoningText.text;
                  const lastSentence = reasoningText.split('.').filter((s: string) => s.trim()).pop();
                  if (lastSentence && lastSentence.length < 100) {
                    rawTitle = lastSentence.trim();
                    titleDebug.extractedFromReasoning = true;
                    break;
                  }
                }
              }
            }
          }

          console.log('Raw title:', rawTitle);
          titleDebug.rawTitle = rawTitle;
          if (rawTitle) {
            title = rawTitle.trim().replace(/^["']|["']$/g, '').slice(0, 100);
            console.log('Processed title:', title);
            titleDebug.processedTitle = title;
          } else {
            console.log('No raw title found in response');
            titleDebug.error = 'No raw title in response';
            titleDebug.outputExists = !!titleData.output;
            titleDebug.messageExists = !!titleData.output?.message;
            titleDebug.contentExists = !!titleData.output?.message?.content;
            titleDebug.contentLength = titleData.output?.message?.content?.length;
            titleDebug.stopReason = titleData.stopReason;
          }
        } else {
          const errorText = await titleResponse.text();
          console.error('Title generation error response:', errorText);
          titleDebug.error = errorText;
        }
      } catch (titleError) {
        console.error('Error generating title (exception):', titleError);
        titleDebug.error = titleError instanceof Error ? titleError.message : String(titleError);
      }
    } else {
      console.log('Skipping title generation - generateTitle:', generateTitle, 'answer:', !!answer);
    }

    console.log('Final title value before response:', title);
    titleDebug.finalTitle = title;

    const response: BedrockResponse = {
      answer,
      citations,
      title: title || null,
      titleDebug,
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