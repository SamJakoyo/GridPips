import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export function getFirebaseAdminMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.FIREBASE_PROJECT_ID && !firebaseConfig.projectId) {
    missing.push('FIREBASE_PROJECT_ID');
  }
  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    missing.push('FIREBASE_CLIENT_EMAIL');
  }
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    missing.push('FIREBASE_PRIVATE_KEY');
  }
  return missing;
}

function initFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim().replace(/^['"]+|['"]+$/g, '');
  const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, '\n') : '';

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  return initializeApp({
    projectId: projectId || undefined,
  });
}

const adminApp = initFirebaseAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
