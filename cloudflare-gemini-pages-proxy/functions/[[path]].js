export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  // Перенаправляем на официальный API Gemini
  url.hostname = "generativelanguage.googleapis.com";
  
  const modifiedRequest = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow'
  });
  
  try {
    const response = await fetch(modifiedRequest);
    return response;
  } catch (err) {
    return new Response(JSON.stringify({
      error: {
        message: `Proxy Error: ${err.message}`,
        status: "PROXY_FAILED"
      }
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
