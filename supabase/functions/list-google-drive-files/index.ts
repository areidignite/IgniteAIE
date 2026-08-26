import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Google-Access-Token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const googleAccessToken = req.headers.get("X-Google-Access-Token");
    if (!googleAccessToken) {
      return new Response(
        JSON.stringify({ error: "Google access token is required. Please sign in with Google." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const folderId = url.searchParams.get("folderId") || "root";
    const pageToken = url.searchParams.get("pageToken") || "";

    const query = `'${folderId}' in parents and trashed = false`;
    const fields = "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)";

    let apiUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=folder,name`;
    if (pageToken) {
      apiUrl += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const driveResponse = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!driveResponse.ok) {
      const errorText = await driveResponse.text();
      if (driveResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: "Google token expired. Please sign in again.", code: "TOKEN_EXPIRED" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Google Drive API error (${driveResponse.status}): ${errorText}`);
    }

    const driveData = await driveResponse.json();

    return new Response(
      JSON.stringify({
        files: driveData.files || [],
        nextPageToken: driveData.nextPageToken || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in list-google-drive-files:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
