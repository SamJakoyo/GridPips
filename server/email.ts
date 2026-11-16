import { db } from './db.ts';

interface NotificationPayload {
  to: string;
  subject: string;
  category: 'welcome' | 'order_receipt' | 'wallet_deposit' | 'security_alert' | 'payout' | 'mt5_bridge';
  html: string;
  textPreview: string;
}

export async function sendAutomatedEmail(payload: NotificationPayload): Promise<{ status: string }> {
  const deliveryStatus = 'delivered_in_app';

  db.prepare(
    `INSERT INTO email_logs (recipient_email, subject, body_preview, category, delivery_status)
     VALUES (?, ?, ?, ?, ?)`
  ).run(payload.to, payload.subject, payload.textPreview.slice(0, 400), payload.category, deliveryStatus);

  return { status: deliveryStatus };
}
