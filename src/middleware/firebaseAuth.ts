import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export interface FirebaseAuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let cachedCerts: Record<string, string> = {};
let certsExpiresAtMs = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAtMs && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Failed to load Google public certs (${resp.status})`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = certs;
  certsExpiresAtMs = now + Math.max(60, maxAgeSec) * 1000;
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

async function verifyFirebaseJwtViaGoogleCerts(idToken: string): Promise<DecodedIdToken | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
    const payload = decodeBase64UrlJson<Record<string, unknown>>(payloadB64);
    if (!header || !payload || header.alg !== 'RS256' || !header.kid) {
      return null;
    }

    let certs = await getGooglePublicCerts();
    let pem = certs[header.kid];
    if (!pem) {
      certsExpiresAtMs = 0;
      certs = await getGooglePublicCerts();
      pem = certs[header.kid];
    }
    if (!pem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();

    const sigBuf = Buffer.from(signatureB64, 'base64url');
    if (!verifier.verify(pem, sigBuf)) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp || 0);
    const iat = Number(payload.iat || 0);
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const aud = typeof payload.aud === 'string' ? payload.aud : '';
    const iss = typeof payload.iss === 'string' ? payload.iss : '';
    const expectedIssuer = `https://securetoken.google.com/${firebaseConfig.projectId}`;

    if (
      aud !== firebaseConfig.projectId ||
      iss !== expectedIssuer ||
      !sub ||
      exp <= nowSec ||
      iat > nowSec + 300
    ) {
      return null;
    }

    return {
      ...(payload as Record<string, unknown>),
      uid: sub,
      sub,
      aud,
      iss,
      exp,
      iat,
      auth_time: Number(payload.auth_time || iat),
      email: typeof payload.email === 'string' ? payload.email : undefined,
      email_verified: Boolean(payload.email_verified),
      name: typeof payload.name === 'string' ? payload.name : undefined,
      firebase:
        (payload.firebase as DecodedIdToken['firebase']) || {
          identities: {},
          sign_in_provider: 'google.com',
        },
    } as DecodedIdToken;
  } catch {
    return null;
  }
}

async function verifyViaIdentityToolkit(idToken: string, referer?: string): Promise<DecodedIdToken | null> {
  if (!firebaseConfig.apiKey) return null;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (referer) headers.Referer = referer;
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      users?: Array<{
        localId: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
      }>;
    };
    const u = data.users?.[0];
    if (!u || !u.localId) return null;
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      aud: firebaseConfig.projectId,
      auth_time: nowSec,
      exp: nowSec + 3600,
      iat: nowSec,
      iss: `https://securetoken.google.com/${firebaseConfig.projectId}`,
      firebase: { identities: {}, sign_in_provider: 'google.com' },
      uid: u.localId,
      sub: u.localId,
      email: u.email,
      email_verified: Boolean(u.emailVerified),
      name: u.displayName,
    } as DecodedIdToken;
  } catch {
    return null;
  }
}

export const requireFirebaseAuth = async (
  req: FirebaseAuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing Firebase Bearer token.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decodedToken;
    next();
  } catch (adminErr) {
    const certVerified = await verifyFirebaseJwtViaGoogleCerts(token);
    if (certVerified) {
      req.firebaseUser = certVerified;
      next();
      return;
    }

    const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
    const fallbackUser = await verifyViaIdentityToolkit(token, originHeader);
    if (fallbackUser) {
      req.firebaseUser = fallbackUser;
      next();
      return;
    }

    console.error('Error verifying Firebase ID token:', adminErr);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired Google Sign-In token. Please try again.' });
  }
};

