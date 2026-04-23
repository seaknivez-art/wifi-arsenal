import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();
const db = admin.firestore();

const OPENAI_API_KEY = functions.config().openai?.key;

export const analyzeNails = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;

    if (!idToken) {
      res.status(401).json({ error: 'Missing Firebase ID token' });
      return;
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      res.status(404).json({ error: 'User profile not found' });
      return;
    }

    const userData = userSnap.data()!;
    const tokens = userData.tokens ?? 0;
    const isPremium = userData.isPremium ?? false;

    if (!isPremium && tokens <= 0) {
      res.status(402).json({ error: 'NO_TOKENS_PAYWALL' });
      return;
    }

    const { imageBase64 } = req.body as { imageBase64?: string };

    if (!imageBase64) {
      res.status(400).json({ error: 'imageBase64 is required' });
      return;
    }

    if (!OPENAI_API_KEY) {
      res.status(500).json({ error: 'OpenAI key missing in functions config' });
      return;
    }

    // Consumir 1 token si no es premium
    if (!isPremium) {
      await userRef.update({
        tokens: admin.firestore.FieldValue.increment(-1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const openaiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Analiza esta mano y responde SOLO JSON: {"technique":"Gelish|Acrílico","nailSize":"Corto|Medio|Largo","colorPalette":["#hex"],"rationale":"breve"}',
              },
              {
                type: 'input_image',
                image_url: `data:image/jpeg;base64,${imageBase64}`,
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!openaiRes.ok) {
      const e = await openaiRes.text();
      res.status(502).json({ error: `OpenAI error: ${e}` });
      return;
    }

    const openaiJson = await openaiRes.json() as {
      output_text?: string;
    };

    const recommendation = JSON.parse(openaiJson.output_text || '{}');

    await userRef.collection('analyses').add({
      recommendation,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ recommendation });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Trigger: al validar email, asigna tokens iniciales y aplica recompensa por referido.
export const onUserEmailVerified = functions.auth.user().onCreate(async (user) => {
  // Si en tu flujo usas link de verificación posterior al create,
  // sustituye este trigger por callable/HTTP al momento de confirmar email.
  if (!user.email) return;

  const userRef = db.collection('users').doc(user.uid);
  const snap = await userRef.get();

  if (!snap.exists) {
    await userRef.set({
      email: user.email,
      tokens: 20,
      referredBy: null,
      isPremium: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
});

export const claimReferralOnVerification = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Login requerido');
  }

  const uid = context.auth.uid;
  const authUser = await admin.auth().getUser(uid);

  if (!authUser.emailVerified) {
    throw new functions.https.HttpsError('failed-precondition', 'Debes validar email');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Perfil no encontrado');
  }

  const userData = userSnap.data()!;
  const referredBy = data?.referredBy || userData.referredBy;

  if (!referredBy || referredBy === uid) {
    return { ok: true, rewarded: false };
  }

  await db.runTransaction(async (tx) => {
    const inviterRef = db.collection('users').doc(referredBy);
    const inviterSnap = await tx.get(inviterRef);
    if (!inviterSnap.exists) return;

    const rewardLogRef = db.collection('referralRewards').doc(`${referredBy}_${uid}`);
    const rewardLogSnap = await tx.get(rewardLogRef);
    if (rewardLogSnap.exists) return;

    tx.update(inviterRef, {
      tokens: admin.firestore.FieldValue.increment(20),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.set(rewardLogRef, {
      inviterUid: referredBy,
      invitedUid: uid,
      rewardedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    tx.update(userRef, { referredBy });
  });

  return { ok: true, rewarded: true };
});
