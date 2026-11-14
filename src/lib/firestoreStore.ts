import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';

// Blueprint-synchronized volumetric limits & patterns
export const FIRESTORE_LIMITS = {
  idPattern: /^[a-zA-Z0-9_-]+$/,
  displayNameMax: 80,
  emailMax: 120,
  exnessIdMax: 40,
  symbolMax: 16,
  entryZoneMax: 64,
  notesMax: 500,
  promptMax: 600,
  modelMax: 64,
  aspectMax: 12,
};

export interface SavedFirestoreSetup {
  id: string;
  uid: string;
  symbol: string;
  timeframe: 'M15' | 'H1' | 'H4' | 'D1';
  bias: 'Bullish' | 'Bearish';
  entryZone: string;
  stopLoss: number;
  tp1: number;
  notes: string;
  createdAtMs: number;
}

export interface FirestoreMediaCreation {
  id: string;
  uid: string;
  kind: 'image' | 'video';
  model: string;
  prompt: string;
  aspectRatio: string;
  createdAtMs: number;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return cleaned || `item_${Date.now()}`;
}

export async function syncFirestoreTraderProfile(params: {
  uid: string;
  displayName: string;
  email: string;
  exnessAccountId: string;
  preferredModel?: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite' | 'gemini-4-argon' | 'gemini-4-carbon';
}): Promise<void> {
  const uid = sanitizeId(params.uid);
  const displayName = (params.displayName || 'Trader').trim().slice(0, FIRESTORE_LIMITS.displayNameMax) || 'Trader';
  const email = (params.email || '').trim().slice(0, FIRESTORE_LIMITS.emailMax);
  const exnessAccountId = (params.exnessAccountId || '').trim().slice(0, FIRESTORE_LIMITS.exnessIdMax);
  const preferredModel = params.preferredModel || 'gemini-4-hydrogen';

  const rootPath = `users/${uid}`;
  const rootRef = doc(db, 'users', uid);

  try {
    const existingRoot = await getDoc(rootRef);
    if (!existingRoot.exists()) {
      await setDoc(rootRef, {
        uid,
        displayName,
        role: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (existingRoot.data()?.displayName !== displayName) {
      await updateDoc(rootRef, {
        displayName,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, rootPath);
  }

  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  try {
    const existingPriv = await getDoc(privateRef);
    if (!existingPriv.exists()) {
      await setDoc(privateRef, {
        uid,
        email,
        exnessAccountId,
        preferredModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(privateRef, {
        exnessAccountId,
        preferredModel,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }
}

export async function saveIctSetupToFirestore(
  uid: string,
  setup: {
    symbol: string;
    timeframe: 'M15' | 'H1' | 'H4' | 'D1';
    bias: 'Bullish' | 'Bearish';
    entryZone: string;
    stopLoss: number;
    tp1: number;
    notes: string;
  }
): Promise<string> {
  const cleanUid = sanitizeId(uid);
  const setupId = sanitizeId(`ict_${setup.symbol}_${setup.timeframe}_${Date.now()}`);
  const path = `users/${cleanUid}/savedSetups/${setupId}`;

  try {
    await setDoc(doc(db, 'users', cleanUid, 'savedSetups', setupId), {
      uid: cleanUid,
      symbol: setup.symbol.trim().slice(0, FIRESTORE_LIMITS.symbolMax),
      timeframe: setup.timeframe,
      bias: setup.bias,
      entryZone: setup.entryZone.trim().slice(0, FIRESTORE_LIMITS.entryZoneMax) || 'Market',
      stopLoss: Number(setup.stopLoss) || 0,
      tp1: Number(setup.tp1) || 0,
      notes: setup.notes.trim().slice(0, FIRESTORE_LIMITS.notesMax),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return setupId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteSavedSetupFromFirestore(uid: string, setupId: string): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const cleanId = sanitizeId(setupId);
  const path = `users/${cleanUid}/savedSetups/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'users', cleanUid, 'savedSetups', cleanId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeSavedSetups(
  uid: string,
  onData: (setups: SavedFirestoreSetup[]) => void
): Unsubscribe {
  const cleanUid = sanitizeId(uid);
  const path = `users/${cleanUid}/savedSetups`;
  const q = query(collection(db, 'users', cleanUid, 'savedSetups'), where('uid', '==', cleanUid), limit(30));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedFirestoreSetup[] = snapshot.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
        return {
          id: d.id,
          uid: String(data.uid || cleanUid),
          symbol: String(data.symbol || ''),
          timeframe: (data.timeframe || 'M15') as 'M15' | 'H1' | 'H4' | 'D1',
          bias: (data.bias || 'Bullish') as 'Bullish' | 'Bearish',
          entryZone: String(data.entryZone || ''),
          stopLoss: Number(data.stopLoss || 0),
          tp1: Number(data.tp1 || 0),
          notes: String(data.notes || ''),
          createdAtMs: ts,
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}

export async function logMediaCreationToFirestore(
  uid: string,
  record: {
    kind: 'image' | 'video';
    model: string;
    prompt: string;
    aspectRatio: string;
  }
): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const creationId = sanitizeId(`${record.kind}_${Date.now()}`);
  const path = `users/${cleanUid}/mediaCreations/${creationId}`;
  try {
    await setDoc(doc(db, 'users', cleanUid, 'mediaCreations', creationId), {
      uid: cleanUid,
      kind: record.kind,
      model: record.model.trim().slice(0, FIRESTORE_LIMITS.modelMax),
      prompt: record.prompt.trim().slice(0, FIRESTORE_LIMITS.promptMax) || 'Media creation',
      aspectRatio: record.aspectRatio.trim().slice(0, FIRESTORE_LIMITS.aspectMax) || '1:1',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeMediaCreations(
  uid: string,
  onData: (items: FirestoreMediaCreation[]) => void
): Unsubscribe {
  const cleanUid = sanitizeId(uid);
  const path = `users/${cleanUid}/mediaCreations`;
  const q = query(collection(db, 'users', cleanUid, 'mediaCreations'), where('uid', '==', cleanUid), limit(25));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreMediaCreation[] = snapshot.docs.map((d) => {
        const data = d.data();
        const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
        return {
          id: d.id,
          uid: String(data.uid || cleanUid),
          kind: (data.kind || 'image') as 'image' | 'video',
          model: String(data.model || ''),
          prompt: String(data.prompt || ''),
          aspectRatio: String(data.aspectRatio || '1:1'),
          createdAtMs: ts,
        };
      });
      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  );
}
