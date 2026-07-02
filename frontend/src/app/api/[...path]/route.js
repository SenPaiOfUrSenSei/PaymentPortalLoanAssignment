import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  return handleRequest(request, params, 'GET');
}

export async function POST(request, { params }) {
  return handleRequest(request, params, 'POST');
}

export async function PUT(request, { params }) {
  return handleRequest(request, params, 'PUT');
}

export async function DELETE(request, { params }) {
  return handleRequest(request, params, 'DELETE');
}

export async function PATCH(request, { params }) {
  return handleRequest(request, params, 'PATCH');
}

async function handleRequest(request, params, method) {
  const backendUrl = process.env.BACKEND_API_URL || 'http://backend:8000';
  const path = params.path.join('/');
  const { search } = new URL(request.url);
  
  const targetUrl = `${backendUrl.replace(/\/$/, '')}/api/${path}${search}`;
  
  // Clone incoming headers
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Skip 'host' header to avoid hostname mismatch on target
    if (key.toLowerCase() !== 'host') {
      headers.set(key, value);
    }
  });

  try {
    let body = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await request.text();
    }

    console.log(`[Proxy] Routing ${method} request to: ${targetUrl}`);

    const response = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: 'no-store'
    });

    const data = await response.text();
    
    // Forward the response back to the client
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      // Skip content-encoding & content-length as we already read and decompressed the body text
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'content-encoding' && lowerKey !== 'content-length') {
        responseHeaders.set(key, value);
      }
    });

    return new NextResponse(data, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[Proxy Error] Failed to reach backend ${targetUrl}:`, error);
    return new NextResponse(
      JSON.stringify({ 
        detail: `Gateway Proxy Error: Unable to connect to backend at ${backendUrl}. Details: ${error.message}` 
      }), 
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
