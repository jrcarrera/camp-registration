export function GET(): Response {
  return Response.json({
    service: 'camp-registration-web',
    status: 'ok',
    version: '0.0.0',
  });
}
