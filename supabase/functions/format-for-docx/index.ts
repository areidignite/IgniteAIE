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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const jwt = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid JWT" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content } = await req.json();

    if (!content || content.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const awsRegion = Deno.env.get("AWS_REGION") || "us-east-1";

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      return new Response(
        JSON.stringify({ error: "AWS credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const modelId = "us.anthropic.claude-3-5-haiku-20241022-v1:0";
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${modelId}/converse`;

    const systemPrompt = `You are a document formatter that converts text into HTML. Output ONLY valid HTML tags.

ABSOLUTE RULES - VIOLATION IS UNACCEPTABLE:
- NEVER use markdown syntax. No **, no *, no -, no #, no backticks.
- EVERY paragraph must be wrapped in <p></p> tags
- EVERY heading must use <h2> or <h3> tags (not # or **)
- EVERY bullet list must use <ul><li></li></ul> (not - or *)
- EVERY numbered list must use <ol><li></li></ol> (not 1. or a.)
- EVERY bold phrase must use <strong></strong> (not ** or __)
- EVERY italic phrase must use <em></em> (not * or _)

FORMATTING GUIDELINES:
- Break long blocks of text into separate <p> paragraphs at logical topic changes
- Identify section topics and add <h2> headings before related paragraphs
- Bold important terms, product names, standards, and key phrases with <strong>
- When content lists items inline (separated by commas), keep them in a paragraph
- When content has sequential items or steps, use <ol> numbered lists
- When content has non-sequential items or features, use <ul> bullet lists

PRESERVATION RULES:
- Keep ALL original text word-for-word
- Do NOT summarize, shorten, or omit any content
- Do NOT add commentary, notes, or explanations

OUTPUT: Raw HTML only. No code fences. No preamble. No explanation. Start directly with an HTML tag.`;

    const body = {
      messages: [{
        role: "user",
        content: [{ text: `Convert this into well-structured HTML. Use <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em> tags. NEVER use markdown. Break into logical paragraphs:\n\n${content}` }]
      }],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 8192,
        temperature: 0.1
      }
    };

    const bodyString = JSON.stringify(body);
    const headers = await signRequest({
      method: "POST",
      url: endpoint,
      body: bodyString,
      region: awsRegion,
      service: "bedrock",
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    });

    const bedrockResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: bodyString,
    });

    if (!bedrockResponse.ok) {
      const errorText = await bedrockResponse.text();
      console.error("Bedrock API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to format content", details: errorText }),
        { status: bedrockResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bedrockData = await bedrockResponse.json();
    const formattedHtml = bedrockData.output?.message?.content?.[0]?.text || content;

    return new Response(
      JSON.stringify({ formattedHtml }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
