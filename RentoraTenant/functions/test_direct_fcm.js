/**
 * Dedicated Direct FCM Test Tool & Token Inspector for Rentora
 * Tests basic FCM delivery before running business events, per Section 12 of specifications.
 * 
 * Usage:
 *   node test_direct_fcm.js --token <TARGET_FCM_TOKEN>
 *   node test_direct_fcm.js --uid <USER_UID>
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (initErr) {
    console.error('[DirectFCMTest] Firebase Admin initialization error:', initErr.message);
  }
}

const db = admin.firestore();

async function sendDirectTestNotification(targetToken) {
  if (!targetToken) {
    console.error('[DirectFCMTest] No FCM token provided.');
    return false;
  }

  const safeToken = targetToken.length > 12 
    ? `${targetToken.substring(0, 6)}...${targetToken.substring(targetToken.length - 4)} (len: ${targetToken.length})` 
    : targetToken;

  console.log(`[FCM] Event: DIRECT_TEST_NOTIFICATION`);
  console.log(`[FCM] Token found: YES (${safeToken})`);
  console.log(`[FCM] Send started`);

  const message = {
    token: targetToken,
    notification: {
      title: 'Rentora Test Notification',
      body: 'FCM test notification',
    },
    data: {
      type: 'test_notification',
      sentAt: new Date().toISOString(),
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'rentora_notifications',
        sound: 'default',
        defaultSound: true,
        defaultVibrateTimings: true,
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);
    console.log(`[FCM] Send success. Message ID: ${response}`);
    return true;
  } catch (err) {
    console.error(`[FCM] Send failed:`, err.message);
    return false;
  }
}

async function inspectUserTokens(uid) {
  console.log(`[FCM] Inspecting tokens for User UID: ${uid}`);
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      console.log(`[FCM] User ${uid} does not exist in Firestore.`);
      return [];
    }
    const data = userDoc.data();
    const tokens = Array.isArray(data.notificationTokens) ? data.notificationTokens : [];
    console.log(`[FCM] Found ${tokens.length} token(s) for user.`);
    tokens.forEach((t, i) => {
      const safe = t.length > 12 ? `${t.substring(0, 6)}...${t.substring(t.length - 4)} (len: ${t.length})` : t;
      console.log(`[FCM] Token [${i + 1}]: ${safe}`);
    });
    return tokens;
  } catch (e) {
    console.error('[FCM] Error reading user doc:', e.message);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf('--token');
  const uidIdx = args.indexOf('--uid');

  if (tokenIdx !== -1 && args[tokenIdx + 1]) {
    await sendDirectTestNotification(args[tokenIdx + 1]);
  } else if (uidIdx !== -1 && args[uidIdx + 1]) {
    const tokens = await inspectUserTokens(args[uidIdx + 1]);
    for (const t of tokens) {
      await sendDirectTestNotification(t);
    }
  } else {
    console.log('--- Rentora Direct FCM Test Utility ---');
    console.log('Usage:');
    console.log('  node test_direct_fcm.js --token <FCM_TOKEN>');
    console.log('  node test_direct_fcm.js --uid <USER_UID>');
  }
}

main().catch(console.error);
