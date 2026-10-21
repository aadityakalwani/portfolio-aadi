/* Routing Middleware: send phones to the lightweight page (m.html) at the edge,
   so the 3D page and its bundle are never served to them and there is no redirect hop. */
export const config = { matcher: ['/'] };

const PHONE = /iphone|ipod|android.+mobile|windows phone|blackberry|opera mini/i;

export default function middleware(request) {
  try {
    const ua = request.headers.get('user-agent') || '';
    const hint = request.headers.get('sec-ch-ua-mobile') || '';
    const url = new URL(request.url);
    const forced3d = url.searchParams.get('view') === '3d';
    if (!forced3d && (PHONE.test(ua) || hint === '?1')) {
      return new Response(null, {
        headers: { 'x-middleware-rewrite': new URL('/m.html', request.url).toString(), 'Vary': 'User-Agent, Sec-CH-UA-Mobile' },
      });
    }
  } catch (e) { /* fall through to the normal page */ }
  return new Response(null, { headers: { 'x-middleware-next': '1', 'Vary': 'User-Agent, Sec-CH-UA-Mobile' } });
}
