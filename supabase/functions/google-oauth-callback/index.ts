const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve((_req: Request) => {
  if (_req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Google Sign-in</title>
  <style>
    body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#475569}
    .card{text-align:center;padding:2rem}
    .spinner{width:24px;height:24px;border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin .6s linear infinite;margin:0 auto 1rem}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <p id="status">Completing sign-in...</p>
  </div>
  <script>
    (function() {
      var hash = window.location.hash;
      var statusEl = document.getElementById('status');

      if (!hash || hash.indexOf('access_token') === -1) {
        statusEl.textContent = 'Sign-in failed. Please close this tab and try again.';
        return;
      }

      var params = new URLSearchParams(hash.substring(1));
      var token = params.get('access_token');

      if (!token) {
        statusEl.textContent = 'No token received. Please close this tab and try again.';
        return;
      }

      if (window.opener) {
        window.opener.postMessage({ type: 'google_drive_token', token: token }, '*');
        statusEl.textContent = 'Signed in! This tab will close automatically.';
        setTimeout(function() { window.close(); }, 500);
      } else {
        statusEl.textContent = 'Signed in, but could not connect to the app. Please close this tab, reopen the Google Drive dialog, and try again.';
      }
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
});
