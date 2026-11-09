const PROJECT_ID = "zyqmora-ai";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedKeys = null;
let keysExpireAt = 0;
const requestWindows = new Map();

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function getGoogleSigningKey(kid, forceRefresh = false) {
  if (!forceRefresh && cachedKeys && Date.now() < keysExpireAt) {
    const cached = cachedKeys.find((item) => item.kid === kid);
    if (cached) return cached;
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) throw new RequestError("تعذّر التحقق من جلسة Google حالياً. حاول بعد قليل.", 503);
  const data = await response.json();
  cachedKeys = Array.isArray(data.keys) ? data.keys : [];
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAge = Number((cacheControl.match(/max-age=(\d+)/i) || [])[1] || 3600);
  keysExpireAt = Date.now() + Math.max(60, maxAge) * 1000;

  const key = cachedKeys.find((item) => item.kid === kid);
  if (!key) throw new RequestError("مفتاح جلسة Google غير صالح. سجّل الدخول مجدداً.", 401);
  return key;
}

export async function requireFirebaseUser(request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new RequestError("سجّل الدخول أولاً لاستخدام الذكاء الاصطناعي.", 401);

  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 10000) {
    throw new RequestError("رمز تسجيل الدخول غير صالح. سجّل الدخول مجدداً.", 401);
  }

  let header;
  let claims;
  try {
    header = decodeJsonPart(parts[0]);
    claims = decodeJsonPart(parts[1]);
  } catch {
    throw new RequestError("تعذّر قراءة رمز تسجيل الدخول. سجّل الدخول مجدداً.", 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    header.alg !== "RS256" ||
    !header.kid ||
    claims.iss !== "https://securetoken.google.com/" + PROJECT_ID ||
    claims.aud !== PROJECT_ID ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    !Number.isFinite(claims.iat) ||
    claims.iat > now + 60
  ) {
    throw new RequestError("انتهت جلسة الدخول أو أن رمزها غير صالح. سجّل الدخول مجدداً.", 401);
  }

  let jwk = await getGoogleSigningKey(header.kid);
  let publicKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch {
    jwk = await getGoogleSigningKey(header.kid, true);
    publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  }

  const signature = decodeBase64Url(parts[2]);
  const signedData = new TextEncoder().encode(parts[0] + "." + parts[1]);
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signature,
    signedData
  );
  if (!valid) throw new RequestError("رمز تسجيل الدخول غير موثوق. سجّل الدخول مجدداً.", 401);

  return { uid: claims.sub, email: claims.email || "" };
}

export function enforceUserRateLimit(uid, limit = 10) {
  const now = Date.now();
  const current = requestWindows.get(uid);
  if (!current || now - current.startedAt >= 60_000) {
    requestWindows.set(uid, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= limit) {
    throw new RequestError("أرسلت طلبات كثيرة خلال دقيقة واحدة. انتظر قليلاً ثم حاول مجدداً.", 429);
  }
  current.count += 1;

  if (requestWindows.size > 4000) {
    for (const [key, value] of requestWindows) {
      if (now - value.startedAt >= 60_000) requestWindows.delete(key);
    }
  }
}

export function jsonError(error) {
  const status = error instanceof RequestError ? error.status : 502;
  const message = error instanceof RequestError
    ? error.message
    : "تعذّر تشغيل نموذج الذكاء الاصطناعي السحابي. قد تكون الحصة المجانية اليومية قد انتهت؛ حاول لاحقاً.";
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}
