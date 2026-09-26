const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Format currency amount with Indian rupee formatting
 */
function formatRupees(amount) {
  const num = Number(amount || 0);
  return num.toLocaleString('en-IN');
}

/**
 * Helper to fetch landlord device tokens from users/{ownerId}
 */
async function getLandlordTokens(landlordUid) {
  if (!landlordUid) return [];
  const tokensSet = new Set();

  try {
    const userSnap = await db.collection('users').doc(landlordUid).get();
    if (userSnap.exists) {
      const data = userSnap.data();
      if (Array.isArray(data.notificationTokens)) {
        data.notificationTokens.forEach((t) => {
          if (t && typeof t === 'string' && t.trim()) {
            tokensSet.add(t.trim());
          }
        });
      }
    }
  } catch (e) {
    console.error(`Error reading landlord tokens for ${landlordUid}:`, e);
  }

  return Array.from(tokensSet);
}

/**
 * Helper to fetch tenant device tokens from users/{uid} and tenants/{tenantId}
 */
async function getTenantTokens(tenantId, tenantAuthUid) {
  const tokensSet = new Set();

  if (tenantAuthUid) {
    try {
      const userSnap = await db.collection('users').doc(tenantAuthUid).get();
      if (userSnap.exists) {
        const data = userSnap.data();
        if (Array.isArray(data.notificationTokens)) {
          data.notificationTokens.forEach((t) => {
            if (t && typeof t === 'string' && t.trim()) {
              tokensSet.add(t.trim());
            }
          });
        }
      }
    } catch (e) {
      console.log('Error reading tenant user tokens:', e);
    }
  }

  if (tenantId) {
    try {
      const tenantSnap = await db.collection('tenants').doc(tenantId).get();
      if (tenantSnap.exists) {
        const data = tenantSnap.data();
        if (Array.isArray(data.notificationTokens)) {
          data.notificationTokens.forEach((t) => {
            if (t && typeof t === 'string' && t.trim()) {
              tokensSet.add(t.trim());
            }
          });
        }
      }
    } catch (e) {
      console.log('Error reading tenant document tokens:', e);
    }
  }

  return Array.from(tokensSet);
}

/**
 * Remove invalid / expired tokens from users doc to keep token registry clean
 */
async function cleanupInvalidTokens(userDocRef, invalidTokens) {
  if (!userDocRef || !invalidTokens || invalidTokens.length === 0) return;
  try {
    await userDocRef.update({
      notificationTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens),
    });
  } catch (err) {
    console.warn('Failed to prune stale notification tokens:', err);
  }
}

/**
 * Send push notifications via Firebase Cloud Messaging & Expo push fallback
 */
async function sendPushNotification(tokens, payload) {
  if (!tokens || tokens.length === 0) return;

  const fcmTokens = [];
  const expoTokens = [];

  tokens.forEach((t) => {
    if (typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))) {
      expoTokens.push(t);
    } else if (typeof t === 'string' && t.length > 10) {
      fcmTokens.push(t);
    }
  });

  // 1. Send native FCM multicast message
  if (fcmTokens.length > 0) {
    try {
      const message = {
        tokens: fcmTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            sound: 'default',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`[FCM] Sent: ${response.successCount} success, ${response.failureCount} failed.`);

      // Collect invalid tokens to prune
      if (response.failureCount > 0 && payload.recipientUserRef) {
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error ? resp.error.code : '';
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(fcmTokens[idx]);
            }
          }
        });
        if (invalidTokens.length > 0) {
          await cleanupInvalidTokens(payload.recipientUserRef, invalidTokens);
        }
      }
    } catch (fcmErr) {
      console.error('[FCM] Error sending multicast message:', fcmErr);
    }
  }

  // 2. Fallback / support for Expo push tokens (when tested in Expo Go)
  if (expoTokens.length > 0) {
    try {
      const messages = expoTokens.map((to) => ({
        to,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        priority: 'high',
        channelId: 'default',
      }));

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      console.log(`[Expo Push] Sent to ${expoTokens.length} Expo push tokens.`);
    } catch (expoErr) {
      console.warn('[Expo Push] Error sending Expo push fallback:', expoErr);
    }
  }
}

/**
 * Idempotency check: returns true if already processed, false otherwise
 */
async function checkAndMarkProcessed(idempotencyKey) {
  const docRef = db.collection('processed_events').doc(idempotencyKey);
  try {
    await docRef.create({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false; // Not previously processed
  } catch (err) {
    if (err.code === 6 || (err.message && err.message.includes('ALREADY_EXISTS'))) {
      return true; // Already processed
    }
    // In case of unexpected error, fail safe to prevent infinite looping
    console.warn(`Idempotency check error for ${idempotencyKey}:`, err);
    return false;
  }
}

/**
 * ============================================================================
 * 1. TRIGGER: Tenant Submits Payment -> Landlord Receives FCM Notification
 * ============================================================================
 */
exports.onPaymentCreated = functions.firestore
  .document('payments/{paymentId}')
  .onCreate(async (snapshot, context) => {
    const payment = snapshot.data();
    const paymentId = context.params.paymentId;

    if (!payment) return null;

    // Idempotency: Prevent duplicate notifications
    const idempotencyKey = `notif_payment_created_${paymentId}`;
    const alreadyProcessed = await checkAndMarkProcessed(idempotencyKey);
    if (alreadyProcessed) {
      console.log(`[onPaymentCreated] Skipped duplicate trigger for paymentId ${paymentId}`);
      return null;
    }

    // Security & Ownership: Verify relationship using authoritative tenant record
    let landlordOwnerId = payment.ownerId || '';
    let tenantName = 'Tenant';
    let unitLabel = 'Unit';

    if (payment.tenantId) {
      try {
        const tenantSnap = await db.collection('tenants').doc(payment.tenantId).get();
        if (tenantSnap.exists) {
          const tenantData = tenantSnap.data();
          if (tenantData.ownerId) {
            landlordOwnerId = tenantData.ownerId; // Trusted authoritative ownerId
          }
          if (tenantData.name) {
            tenantName = tenantData.name.trim();
          }

          const unitId = payment.unitId || tenantData.unitId;
          if (unitId) {
            try {
              const unitSnap = await db.collection('units').doc(unitId).get();
              if (unitSnap.exists && unitSnap.data().unitNumber) {
                const uNum = unitSnap.data().unitNumber;
                unitLabel = isNaN(Number(uNum)) ? uNum : `Room ${uNum}`;
              }
            } catch (uErr) {
              console.warn('Unit name lookup failed:', uErr);
            }
          }
        }
      } catch (tErr) {
        console.warn('Authoritative tenant lookup failed:', tErr);
      }
    }

    if (!landlordOwnerId) {
      console.log(`[onPaymentCreated] No landlord owner found for payment ${paymentId}`);
      return null;
    }

    const amountNum = Number(payment.amount || payment.amountPaid || 0);
    const formattedAmount = formatRupees(amountNum);
    const title = 'New Payment Submitted';
    const body = `${tenantName} submitted a payment of ₹${formattedAmount} for ${unitLabel}.`;

    // 1. Create in-app notification record in Firestore
    const notificationData = {
      recipientUserId: landlordOwnerId,
      ownerId: landlordOwnerId,
      tenantId: payment.tenantId || '',
      type: 'payment_submitted',
      notificationType: 'payment_submitted',
      title,
      message: body,
      body,
      relatedPaymentId: paymentId,
      relatedBillId: payment.billId || '',
      relatedTenantId: payment.tenantId || '',
      relatedPropertyId: payment.propertyId || '',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.collection('notifications').add(notificationData);
    } catch (notifErr) {
      console.error('[onPaymentCreated] Failed to write in-app notification doc:', notifErr);
    }

    // 2. Fetch landlord device tokens and send FCM push
    const tokens = await getLandlordTokens(landlordOwnerId);
    if (!tokens || tokens.length === 0) {
      console.log(`[onPaymentCreated] Landlord ${landlordOwnerId} has no registered push tokens.`);
      return null;
    }

    const payload = {
      title,
      body,
      data: {
        type: 'payment_submitted',
        notificationType: 'payment_submitted',
        paymentId,
        billId: payment.billId || '',
        tenantId: payment.tenantId || '',
        amount: String(amountNum),
      },
      recipientUserRef: db.collection('users').doc(landlordOwnerId),
    };

    await sendPushNotification(tokens, payload);
    return null;
  });

/**
 * ============================================================================
 * 2. TRIGGER: Landlord Generates Bill -> Tenant Receives FCM Notification
 * ============================================================================
 */
exports.onBillCreated = functions.firestore
  .document('bills/{billId}')
  .onCreate(async (snapshot, context) => {
    const bill = snapshot.data();
    const billId = context.params.billId;

    if (!bill || !bill.tenantId) return null;

    // Idempotency check
    const idempotencyKey = `notif_bill_created_${billId}`;
    const alreadyProcessed = await checkAndMarkProcessed(idempotencyKey);
    if (alreadyProcessed) {
      console.log(`[onBillCreated] Skipped duplicate trigger for billId ${billId}`);
      return null;
    }

    const amountNum = Number(bill.totalAmount || 0);
    const formattedAmount = formatRupees(amountNum);
    const month = bill.billingMonth || '';
    const title = 'New Rent Bill';
    const body = `Your ${month} rent bill of ₹${formattedAmount} is ready.`;

    const tenantAuthUid = bill.tenantAuthUid || '';

    // 1. Create in-app notification document
    const notificationDocData = {
      recipientUserId: tenantAuthUid,
      tenantId: bill.tenantId,
      tenantAuthUid,
      ownerId: bill.ownerId || '',
      type: 'new_bill',
      notificationType: 'new_bill',
      title,
      message: body,
      body,
      relatedBillId: billId,
      billId,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.collection('notifications').add(notificationDocData);
    } catch (e) {
      console.warn('Could not write notification doc to Firestore:', e);
    }

    // 2. Fetch tenant tokens & send FCM push
    const tokens = await getTenantTokens(bill.tenantId, tenantAuthUid);
    if (!tokens || tokens.length === 0) {
      console.log(`[onBillCreated] No tokens found for tenantId ${bill.tenantId}`);
      return null;
    }

    const payload = {
      title,
      body,
      data: {
        type: 'new_bill',
        notificationType: 'new_bill',
        billId,
        tenantId: bill.tenantId || '',
        billingMonth: month,
        amount: String(amountNum),
      },
      recipientUserRef: tenantAuthUid ? db.collection('users').doc(tenantAuthUid) : null,
    };

    await sendPushNotification(tokens, payload);
    return null;
  });

/**
 * ============================================================================
 * 3. TRIGGER: Bill Status Changed (e.g. Fully Paid)
 * ============================================================================
 */
exports.onBillUpdated = functions.firestore
  .document('bills/{billId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const billId = context.params.billId;

    if (!beforeData || !afterData) return null;

    // Trigger ONLY if paymentStatus actually changed
    if (beforeData.paymentStatus === afterData.paymentStatus) {
      return null;
    }

    const newStatus = afterData.paymentStatus;
    const idempotencyKey = `notif_bill_${billId}_${newStatus}`;
    const alreadyProcessed = await checkAndMarkProcessed(idempotencyKey);
    if (alreadyProcessed) return null;

    if (newStatus === 'paid') {
      const amountNum = Number(afterData.totalAmount || 0);
      const formattedAmount = formatRupees(amountNum);
      const month = afterData.billingMonth || '';
      const title = 'Bill Fully Paid';
      const body = `Your ${month} rent bill of ₹${formattedAmount} has been fully paid.`;

      const notificationDocData = {
        recipientUserId: afterData.tenantAuthUid || '',
        tenantId: afterData.tenantId || '',
        tenantAuthUid: afterData.tenantAuthUid || '',
        ownerId: afterData.ownerId || '',
        type: 'bill_paid',
        notificationType: 'bill_paid',
        title,
        message: body,
        body,
        relatedBillId: billId,
        billId,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      try {
        await db.collection('notifications').add(notificationDocData);
      } catch (e) {
        console.warn('Could not write notification doc to Firestore:', e);
      }

      const tokens = await getTenantTokens(afterData.tenantId, afterData.tenantAuthUid);
      if (tokens && tokens.length > 0) {
        await sendPushNotification(tokens, {
          title,
          body,
          data: {
            type: 'bill_paid',
            notificationType: 'bill_paid',
            billId,
            tenantId: afterData.tenantId || '',
          },
          recipientUserRef: afterData.tenantAuthUid
            ? db.collection('users').doc(afterData.tenantAuthUid)
            : null,
        });
      }
    }

    return null;
  });

/**
 * ============================================================================
 * 4. TRIGGER: Payment Approved / Rejected by Landlord -> Notify Tenant
 * ============================================================================
 */
exports.onPaymentUpdated = functions.firestore
  .document('payments/{paymentId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();
    const paymentId = context.params.paymentId;

    if (!beforeData || !afterData) return null;

    // Trigger ONLY if status changed from pending -> approved or pending -> rejected
    if (beforeData.status === afterData.status) {
      return null;
    }

    const newStatus = afterData.status;
    const idempotencyKey = `notif_payment_${paymentId}_${newStatus}`;
    const alreadyProcessed = await checkAndMarkProcessed(idempotencyKey);
    if (alreadyProcessed) return null;

    const amountNum = Number(afterData.amount || afterData.amountPaid || 0);
    const formattedAmount = formatRupees(amountNum);
    const tenantAuthUid = afterData.tenantAuthUid || '';

    let title = '';
    let body = '';
    let type = '';

    if (newStatus === 'approved') {
      title = 'Payment Approved';
      body = `Your payment of ₹${formattedAmount} has been approved.`;
      type = 'payment_approved';
    } else if (newStatus === 'rejected') {
      title = 'Payment Rejected';
      body = `Your payment of ₹${formattedAmount} was rejected. Please check your payment details.`;
      type = 'payment_rejected';
    } else {
      return null;
    }

    // 1. Create in-app notification doc
    const notificationDocData = {
      recipientUserId: tenantAuthUid,
      tenantId: afterData.tenantId || '',
      tenantAuthUid,
      ownerId: afterData.ownerId || '',
      type,
      notificationType: type,
      title,
      message: body,
      body,
      relatedBillId: afterData.billId || '',
      billId: afterData.billId || '',
      relatedPaymentId: paymentId,
      paymentId,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.collection('notifications').add(notificationDocData);
    } catch (e) {
      console.warn('Could not write notification doc to Firestore:', e);
    }

    // 2. Send push to tenant devices
    const tokens = await getTenantTokens(afterData.tenantId, tenantAuthUid);
    if (tokens && tokens.length > 0) {
      await sendPushNotification(tokens, {
        title,
        body,
        data: {
          type,
          notificationType: type,
          paymentId,
          billId: afterData.billId || '',
          tenantId: afterData.tenantId || '',
          amount: String(amountNum),
        },
        recipientUserRef: tenantAuthUid ? db.collection('users').doc(tenantAuthUid) : null,
      });
    }

    return null;
  });

/**
 * ============================================================================
 * 5. BILL DUE / OVERDUE REMINDERS LOGIC
 * ============================================================================
 */
async function processBillDueReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let processedCount = 0;

  try {
    // Query bills that have outstanding amounts
    const billsSnap = await db
      .collection('bills')
      .where('paymentStatus', 'in', ['unpaid', 'partial'])
      .get();

    for (const docSnap of billsSnap.docs) {
      const bill = docSnap.data();
      const billId = docSnap.id;

      if (!bill.dueDate || !bill.tenantId) continue;
      const remainingAmount = Number(bill.remainingAmount || bill.totalAmount || 0);
      if (remainingAmount <= 0) continue;

      const dueParts = bill.dueDate.split('-').map(Number);
      let due;
      if (dueParts.length === 3 && !isNaN(dueParts[0])) {
        due = new Date(dueParts[0], dueParts[1] - 1, dueParts[2]);
      } else {
        due = new Date(bill.dueDate);
      }
      due.setHours(0, 0, 0, 0);

      const diffMs = due.getTime() - today.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const formattedAmount = formatRupees(remainingAmount);
      const formattedDueDate = due.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
      });

      let title = '';
      let body = '';
      let type = '';

      if (diffDays === 2 || diffDays === 1 || diffDays === 0) {
        // Due Soon or Due Today
        title = 'Rent Due Soon';
        body = `Your rent payment of ₹${formattedAmount} is due on ${formattedDueDate}.`;
        type = 'rent_due_soon';
      } else if (diffDays < 0) {
        // Overdue
        title = 'Rent Overdue';
        body = `Your rent payment of ₹${formattedAmount} is overdue.`;
        type = 'rent_overdue';
      }

      if (!type) continue;

      const idempotencyKey = `notif_bill_due_${billId}_${type}_${bill.dueDate}`;
      const alreadyProcessed = await checkAndMarkProcessed(idempotencyKey);
      if (alreadyProcessed) continue;

      const tenantAuthUid = bill.tenantAuthUid || '';

      // Create in-app notification doc
      await db.collection('notifications').add({
        recipientUserId: tenantAuthUid,
        tenantId: bill.tenantId,
        tenantAuthUid,
        ownerId: bill.ownerId || '',
        type,
        notificationType: type,
        title,
        message: body,
        body,
        relatedBillId: billId,
        billId,
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      // Send push notification
      const tokens = await getTenantTokens(bill.tenantId, tenantAuthUid);
      if (tokens && tokens.length > 0) {
        await sendPushNotification(tokens, {
          title,
          body,
          data: {
            type,
            notificationType: type,
            billId,
            tenantId: bill.tenantId,
            remainingAmount: String(remainingAmount),
          },
          recipientUserRef: tenantAuthUid ? db.collection('users').doc(tenantAuthUid) : null,
        });
      }

      processedCount++;
    }
  } catch (err) {
    console.error('Error processing bill due reminders:', err);
  }

  return processedCount;
}

/**
 * Callable: Send Bill Due / Overdue Reminders on demand (e.g. from Landlord app)
 */
exports.sendBillDueReminders = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const count = await processBillDueReminders();
  return { success: true, processedCount: count };
});

/**
 * Scheduled: Run daily at 9:00 AM IST to send rent due reminders
 */
exports.scheduledBillDueCheck = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const count = await processBillDueReminders();
    console.log(`[scheduledBillDueCheck] Sent ${count} due/overdue reminders.`);
    return null;
  });

/**
 * ============================================================================
 * 6. CALLABLE: Securely Reset Tenant Temporary Password
 * ============================================================================
 */
exports.resetTenantPassword = functions.https.onCall(async (data, context) => {
  // 1. Verify caller authentication
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated as a landlord.'
    );
  }

  const landlordUid = context.auth.uid;
  const { tenantId } = data || {};

  if (!tenantId) {
    throw new functions.https.HttpsError('invalid-argument', 'Tenant ID is required.');
  }

  // 2. Fetch tenant record from Firestore
  const tenantRef = db.collection('tenants').doc(tenantId);
  const tenantSnap = await tenantRef.get();

  if (!tenantSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Tenant record does not exist.');
  }

  const tenantData = tenantSnap.data();

  // 3. Verify landlord ownership
  if (tenantData.ownerId !== landlordUid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'You are not authorized to reset password for this tenant.'
    );
  }

  const tenantAuthUid = tenantData.tenantAuthUid;
  if (!tenantAuthUid) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Tenant does not have an active login account.'
    );
  }

  // 4. Verify user profile document
  const userRef = db.collection('users').doc(tenantAuthUid);
  const userSnap = await userRef.get();

  if (!userSnap.exists || userSnap.data().ownerId !== landlordUid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Tenant user profile ownership verification failed.'
    );
  }

  // 5. Generate secure random temporary password (min 8 chars, mix of upper, lower, numbers)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let tempPassword = 'Rent';
  for (let i = 0; i < 5; i++) {
    tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // 6. Update password in Firebase Auth using Admin SDK
  await admin.auth().updateUser(tenantAuthUid, {
    password: tempPassword,
  });

  // 7. Update Firestore state
  const now = new Date().toISOString();
  await tenantRef.update({
    isFirstLogin: true,
    updatedAt: now,
  });

  await userRef.update({
    isFirstLogin: true,
    updatedAt: now,
  });

  return {
    success: true,
    tenantName: tenantData.name || userSnap.data().name || 'Tenant',
    temporaryPassword: tempPassword,
  };
});
