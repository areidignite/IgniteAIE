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

  // Google's implicit flow puts the token in the URL hash fragment, which is
  // only visible client-side. This page reads the hash, extracts the token and
  // the state (app origin), then navigates the browser back to the app with
  // the token appended to the URL.
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Completing sign-in...</title>
<style>
*{margin:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#f8fafc;color:#475569;padding:1rem}
.card{text-align:center;max-width:420px}
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
function done(t,ok){sp.style.display="none";msg.className=ok?"ok":"err";msg.textContent=t;}
try{
var h=window.location.hash;
if(!h||h.indexOf("access_token")===-1){done("Sign-in failed. Please go back to the app and try again.",false);return;}
var parts=h.substring(1).split("&"),token=null,state=null,i,eq,k,v;
for(i=0;i<parts.length;i++){eq=parts[i].indexOf("=");if(eq<0)continue;k=parts[i].substring(0,eq);v=parts[i].substring(eq+1);if(k==="access_token")token=decodeURIComponent(v);if(k==="state")state=decodeURIComponent(v);}
if(!token){done("No token received. Please go back to the app and try again.",false);return;}
if(state){
msg.textContent="Signed in! Redirecting back to the app...";
window.location.replace(state+"/#google_drive_token="+encodeURIComponent(token));
}else{
done("Signed in, but cannot redirect back. Please go back to the app and try again.",false);
}
}catch(err){done("Error: "+err.message,false);}
})();
</script>
<noscript><p>JavaScript is required. Please enable it and try again.</p></noscript>
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
