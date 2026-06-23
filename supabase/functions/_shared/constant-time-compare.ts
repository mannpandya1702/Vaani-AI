// Constant-time bearer compare — Aman §8 lifts verbatim from ClinicPro.
// Use this for every webhook auth gate.

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function verifyBearer(
  req: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;
  // 1) Authorization: Bearer <token>  (internal callers)
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) {
    if (constantTimeEqual(auth.slice(7), expectedToken)) return true;
  }
  // 2) x-vapi-secret: <token>  (VAPI server.secret on tool callbacks)
  const vapi = req.headers.get('x-vapi-secret') ?? '';
  if (vapi && constantTimeEqual(vapi, expectedToken)) return true;
  return false;
}
