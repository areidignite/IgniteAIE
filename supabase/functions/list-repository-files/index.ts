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
          message: "AWS_REPOSITORY_BUCKET_NAME environment variable is not set",
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
    const prefix = url.searchParams.get("prefix") || "";
    const continuationToken = url.searchParams.get("continuationToken") || "";
    const maxKeys = url.searchParams.get("maxKeys") || "1000";

    console.log("Listing repository bucket:", repositoryBucket, "with prefix:", prefix);

    const s3Url = new URL(`https://${repositoryBucket}.s3.${awsRegion}.amazonaws.com/`);
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
      });
      return new Response(
        JSON.stringify({
          error: "Failed to list repository files",
          details: errorText,
          status: s3Response.status,
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
    console.error("Error in list-repository-files function:", error);
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