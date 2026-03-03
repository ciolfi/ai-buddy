import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// export const config = {
//   matcher: '/api/:path*',
// };
export const config = {
  matcher: '/public/*',
};

export default function middleware(request: NextRequest) {
  const origin = request.headers.get('origin');
  const country = request.geo?.country || 'US';
  
  // Different CORS policies based on country
  const getCorsPolicy = (country: string) => {
    switch (country) {
      case 'US':
      case 'CA':
        return {
          allowedOrigins: ['https://ai-buddy-lime.vercel.app/', 'https://ai-buddy-lime.vercel.app'],
          allowCredentials: true,
        };
      case 'GB':
      case 'DE':
        return {
          allowedOrigins: ['https://ai-buddy-lime.vercel.app/'],
          allowCredentials: true,
        };
      default:
        return {
          allowedOrigins: ['https://ai-buddy-lime.vercel.app/'],
          allowCredentials: false,
        };
    }
  };
  
  const corsPolicy = getCorsPolicy(country);
  const isAllowedOrigin = origin && corsPolicy.allowedOrigins.includes(origin);
  
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'null',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': corsPolicy.allowCredentials.toString(),
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  
  const response = NextResponse.next();
  
  if (isAllowedOrigin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', corsPolicy.allowCredentials.toString());
  }
  
  return response;
}