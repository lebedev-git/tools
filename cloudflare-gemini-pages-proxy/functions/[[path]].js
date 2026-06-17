export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Определяем целевой хост на основе пути
  if (url.pathname.startsWith("/chatgpt")) {
    // Перенаправляем на ChatGPT (веб-версию)
    url.pathname = url.pathname.substring(8); // Удаляем '/chatgpt'
    url.hostname = "chatgpt.com";
  } else if (url.pathname.startsWith("/openai")) {
    // Перенаправляем на официальный API OpenAI
    url.pathname = url.pathname.substring(7); // Удаляем '/openai'
    url.hostname = "api.openai.com";
  } else {
    // По умолчанию перенаправляем на Google Gemini API
    url.hostname = "generativelanguage.googleapis.com";
  }
  
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
