import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export interface FirebaseAuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
}

async function verifyViaIdentityToolkit(idToken: string): Promise<DecodedIdToken | null> {
  if (!firebaseConfig.apiKey) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    const fallbackUser = await verifyViaIdentityToolkit(token);
    if (fallbackUser) {
      req.firebaseUser = fallbackUser;
      next();
      return;
    }
    console.error('Error verifying Firebase ID token:', adminErr);
    res.status(401).json({ error: 'Unauthorized: Invalid Firebase ID token.' });
  }
};
