const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Google's implicit flow puts the access token in the URL hash fragment.
  // The hash is only available client-side, so this page reads it and sends
  // the token back to the opener window via postMessage.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"/>
<title>Google Sign-in</title>
<style>
*{margin:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#475569;padding:1rem}
.card{text-align:center;max-width:400px}
.spinner{width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#3b82f6;border-radius:50%;animation:spin .6s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}
p{line-height:1.5;margin-bottom:.75rem}
.ok{color:#16a34a}
.err{color:#dc2626}
</style>
</head>
<body>
<div class="card">
<div class="spinner" id="sp"></div>
<p id="msg">Completing sign-in...</p>
</div>
<script>
(function(){
var msg=document.getElementById("msg");
var sp=document.getElementById("sp");
function done(text,ok){sp.style.display="none";msg.className=ok?"ok":"err";msg.textContent=text;}
try{
var h=window.location.hash;
if(!h||h.indexOf("access_token")===-1){done("Sign-in failed. Please close this tab and try again.",false);return;}
var parts=h.substring(1).split("&"),token=null,i,eq,k,v;
for(i=0;i<parts.length;i++){eq=parts[i].indexOf("=");if(eq<0)continue;k=parts[i].substring(0,eq);v=parts[i].substring(eq+1);if(k==="access_token")token=decodeURIComponent(v);}
if(!token){done("No token received. Please close this tab and try again.",false);return;}
if(window.opener){
window.opener.postMessage({type:"google_drive_token",token:token},"*");
done("Signed in! You can close this tab.",true);
setTimeout(function(){try{window.close();}catch(e){}},1500);
}else{
done("Signed in, but could not communicate with the app. Please close this tab and try again.",false);
}
}catch(err){done("Error: "+err.message,false);}
})();
</script>
<noscript><p>JavaScript is required for sign-in. Please enable JavaScript and try again.</p></noscript>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});
