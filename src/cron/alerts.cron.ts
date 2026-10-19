import cron from 'node-cron';
import axios from 'axios';

// Interfaces
interface SubscriptionReminderCandidate {
  subscription_id: string;
  member_id: string;
  member_name: string;
  member_phone: string;
  member_email: string;
  push_token?: string;
  plan_name: string;
  price: number;
  end_date: string;
  days_remaining: number;
  milestone: '7_days' | '3_days' | '1_day' | 'expired';
}

/**
 * Executes daily at 08:00 AM (0 8 * * *)
 */
export function initPaymentAlertsCron() {
  console.log('[CRON] Initializing Daily Payment Alerts Engine (Schedule: 08:00 AM)');

  cron.schedule('0 8 * * *', async () => {
    console.log(`[CRON] Starting payment alerts execution at ${new Date().toISOString()}`);
    await runPaymentAlertsWorkflow();
  });
}

export async function runPaymentAlertsWorkflow() {
  try {
    // 1. SQL Query to fetch candidates for 7, 3, 1 days remaining & expired today
    const query = `
      WITH candidate_subscriptions AS (
        SELECT 
          s.id AS subscription_id,
          u.id AS member_id,
          u.name AS member_name,
          u.phone AS member_phone,
          u.email AS member_email,
          m.name AS plan_name,
          m.price,
          s.end_date,
          (s.end_date - CURRENT_DATE) AS days_remaining,
          CASE 
            WHEN (s.end_date - CURRENT_DATE) = 7 THEN '7_days'
            WHEN (s.end_date - CURRENT_DATE) = 3 THEN '3_days'
            WHEN (s.end_date - CURRENT_DATE) = 1 THEN '1_day'
            WHEN (s.end_date - CURRENT_DATE) <= 0 THEN 'expired'
          END AS milestone
        FROM subscriptions s
        JOIN users u ON s.member_id = u.id
        JOIN memberships m ON s.plan_id = m.id
        WHERE s.status IN ('Active', 'Expiring_Soon')
          AND (s.end_date - CURRENT_DATE) IN (7, 3, 1, 0)
      )
      SELECT cs.*
      FROM candidate_subscriptions cs
      -- IDEMPOTENCY CHECK: Exclude candidates who already received a notification for this milestone today
      WHERE NOT EXISTS (
        SELECT 1 
        FROM notifications_log nl
        WHERE nl.member_id = cs.member_id
          AND nl.type::text = cs.milestone
          AND nl.sent_at >= CURRENT_DATE
      );
    `;

    // Simulated query execution output for prototype demonstration:
    const candidates: SubscriptionReminderCandidate[] = [
      {
        subscription_id: 'sub-001',
        member_id: 'usr-101',
        member_name: 'Carlos Mendoza',
        member_phone: '+525512345678',
        member_email: 'carlos@fit.com',
        plan_name: 'VIP Anual',
        price: 90.00,
        end_date: '2026-10-07',
        days_remaining: 3,
        milestone: '3_days',
      },
      {
        subscription_id: 'sub-003',
        member_id: 'usr-103',
        member_name: 'Mateo Fernández',
        member_phone: '+525555551212',
        member_email: 'mateo@mail.com',
        plan_name: 'Mensual Básico',
        price: 45.00,
        end_date: '2026-10-05',
        days_remaining: 1,
        milestone: '1_day',
      },
    ];

    console.log(`[CRON] Found ${candidates.length} unique candidates for payment reminders.`);

    for (const candidate of candidates) {
      await processCandidateNotification(candidate);
    }

    console.log('[CRON] Payment alerts execution completed successfully.');
  } catch (error) {
    console.error('[CRON ERROR] Failed to execute payment alerts job:', error);
  }
}

async function processCandidateNotification(candidate: SubscriptionReminderCandidate) {
  const paymentLink = `https://pay.fitforge.gym/renew/${candidate.subscription_id}`;
  
  // 1. Build dynamic WhatsApp text message
  const whatsappText = buildWhatsAppTemplate(candidate, paymentLink);
  
  // 2. Dispatch via WhatsApp Cloud API
  const waSuccess = await sendWhatsAppMessage(candidate.member_phone, whatsappText);

  // 3. Dispatch Push Notification if available
  let pushSuccess = false;
  if (candidate.push_token) {
    pushSuccess = await sendPushNotification(candidate.push_token, candidate);
  }

  // 4. Record entry in NotificationsLog DB table
  await recordNotificationLog({
    member_id: candidate.member_id,
    subscription_id: candidate.subscription_id,
    type: candidate.milestone,
    channel: waSuccess ? 'whatsapp' : 'push',
    delivery_status: waSuccess || pushSuccess ? 'sent' : 'failed',
    payment_link: paymentLink,
    metadata: {
      days_remaining: candidate.days_remaining,
      plan_price: candidate.price,
    },
  });
}

function buildWhatsAppTemplate(c: SubscriptionReminderCandidate, paymentLink: string): string {
  if (c.milestone === 'expired') {
    return `Hola ${c.member_name} 🏋️‍♂️, tu membresía *${c.plan_name}* en FitForge ha vencido. ¡No pierdas la racha de tu entrenamiento! Renueva hoy en 1-clic aquí: ${paymentLink}`;
  }
  return `Hola ${c.member_name} 🔥, te recordamos que tu membresía *${c.plan_name}* vence en *${c.days_remaining} días* (${c.end_date}). Monto a renovar: *$${c.price} USD*. Renueva rápido y sin filas aquí: ${paymentLink}`;
}

async function sendWhatsAppMessage(phone: string, text: string): Promise<boolean> {
  try {
    // WhatsApp Cloud API HTTP Endpoint Simulation:
    // await axios.post(`https://graph.facebook.com/v18.0/${process.env.WA_PHONE_NUMBER_ID}/messages`, {
    //   messaging_product: 'whatsapp',
    //   to: phone,
    //   type: 'text',
    //   text: { body: text }
    // }, { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });

    console.log(`[WHATSAPP SENT] To: ${phone} | Content: ${text.substring(0, 60)}...`);
    return true;
  } catch (err) {
    console.error(`[WHATSAPP FAIL] To: ${phone}`, err);
    return false;
  }
}

async function sendPushNotification(token: string, c: SubscriptionReminderCandidate): Promise<boolean> {
  try {
    // FCM Push Notification payload simulation
    console.log(`[PUSH SENT] Token: ${token} | Title: Recordatorio de Membresía`);
    return true;
  } catch (err) {
    return false;
  }
}

async function recordNotificationLog(log: any) {
  // INSERT INTO notifications_log (member_id, subscription_id, type, channel, delivery_status, payment_link, metadata) ...
  console.log(`[DB LOGGED] NotificationsLog entry created for member ${log.member_id} [Status: ${log.delivery_status}]`);
}
