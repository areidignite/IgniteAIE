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

  // The implicit OAuth flow puts the token in the URL hash fragment,
  // which is NOT sent to the server. We must serve a page that reads
  // the hash client-side and redirects the user back to the app.
  //
  // Multiple redirect strategies are attempted in order of reliability:
  // 1. window.location.replace (standard)
  // 2. window.location.href assignment
  // 3. Clickable link as ultimate fallback
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Redirecting...</title>
</head>
<body onload="go()">
<p id="msg">Redirecting...</p>
<script type="text/javascript">
function go(){
var m=document.getElementById('msg');
try{
var h=window.location.hash;
if(!h){m.innerHTML='No data received. <a href="javascript:window.close()">Close this tab</a>';return;}
var r=h.substring(1),t=null,s=null,p=r.split('&'),i,e,k,v;
for(i=0;i<p.length;i++){e=p[i].indexOf('=');if(e<0)continue;k=p[i].substring(0,e);v=p[i].substring(e+1);if(k==='access_token')t=decodeURIComponent(v);if(k==='state')s=decodeURIComponent(v);}
if(t&&s){
var u=s+'#google_drive_token='+encodeURIComponent(t);
try{window.location.replace(u);}catch(x){window.location.href=u;}
}else if(t){
m.innerHTML='Signed in but cannot redirect. <a href="javascript:window.close()">Close this tab</a> and try again.';
}else{
m.innerHTML='Sign-in failed. <a href="javascript:window.close()">Close this tab</a> and try again.';
}
}catch(err){m.textContent='Error: '+err.message;}
}
</script>
<noscript><p>JavaScript is required. Please enable JavaScript and try again.</p></noscript>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; default-src 'self'",
    },
  });
});
