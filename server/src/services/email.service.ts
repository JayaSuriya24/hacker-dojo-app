import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Transactional email.
 *
 * There was no email in this codebase at all — the notification service speaks
 * Expo push and nothing else, and Supabase Auth only sends its own confirmation
 * and reset mail. The welcome message that carries a member's Wi-Fi PIN is the
 * first thing that has to reach an inbox, so this is where that starts.
 *
 * Resend is the provider. Without `EMAIL_API_KEY` and `EMAIL_FROM` a send is
 * logged rather than transmitted, mirroring how the push service behaves
 * without `EXPO_ACCESS_TOKEN`: the feature stays exercisable locally, and
 * production refuses to start unconfigured rather than silently swallowing
 * mail members are waiting on.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Always populated. Plain text is what survives every client. */
  text: string;
  html?: string;
}

export interface EmailResult {
  delivered: boolean;
  /** Why it was not delivered, for the caller's log. */
  reason?: string;
  /**
   * The provider's id for the accepted message.
   *
   * Recorded because it is the only handle that ties a line in our logs to a
   * row in Resend's dashboard. Without it, "we sent it" and "they never got
   * it" are two claims with nothing in between to check.
   */
  id?: string;
}

/** True once both halves are present: a credential and a verified sender. */
export const isEmailConfigured = Boolean(env.EMAIL_API_KEY && env.EMAIL_FROM);

/** Resend's send endpoint. Spoken to over `fetch`, as the push sender does. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** A send must not hold a request — or a Stripe webhook — open indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Hand the message to Resend.
 *
 * `fetch` rather than the `resend` SDK: the payload is four fields and one
 * bearer header, the notification service already talks to Expo exactly this
 * way, and a dependency whose whole job is `JSON.stringify` is one more thing
 * to keep patched.
 *
 * The provider's own error body is surfaced in the log. "Email failed" with no
 * reason is the message that leaves someone guessing between a bad key, an
 * unverified sender and a malformed address — Resend distinguishes all three
 * and there is no reason to throw that away.
 */
async function deliver(message: EmailMessage): Promise<EmailResult> {
  if (!isEmailConfigured || !env.EMAIL_FROM) {
    logger.warn(
      { to: message.to, subject: message.subject },
      'Email not configured — logging instead of sending',
    );
    logger.debug({ body: message.text }, 'Email body');
    return { delivered: false, reason: 'not_configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      logger.error(
        { to: message.to, status: response.status, detail: detail.slice(0, 300) },
        'Resend rejected the message',
      );
      return { delivered: false, reason: `resend_${response.status}` };
    }

    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, ...(payload.id ? { id: payload.id } : {}) };
  } finally {
    clearTimeout(timeout);
  }
}

export const emailService = {
  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const result = await deliver(message);
      if (result.delivered) {
        logger.info(
          { to: message.to, subject: message.subject, providerId: result.id },
          'Email sent',
        );
      }
      return result;
    } catch (error) {
      // A failed send never fails the thing that triggered it. The welcome mail
      // matters, but not enough to roll back a membership Stripe has taken
      // money for — the PIN is on the Wi-Fi card in the app either way.
      logger.error({ err: error, to: message.to }, 'Email send failed');
      return { delivered: false, reason: 'send_failed' };
    }
  },

  /**
   * The welcome message, which is what carries the Wi-Fi PIN.
   *
   * The PIN is in the body rather than behind a link because it is typed into
   * an OS network prompt, often on the device that would have to follow the
   * link, sometimes before that device has any network at all.
   */
  /**
   * Tell someone a new event is on the calendar.
   *
   * Says plainly that anyone can come. Membership gates the door, the Wi-Fi and
   * the equipment, so "is this for me?" is a fair question for someone who has
   * not joined — and the answer for an open event is yes. An event the host
   * marked members-only never reaches this method.
   */
  async sendEventAnnouncement(input: {
    to: string;
    name: string | null;
    title: string;
    when: string;
    roomName: string;
    hostName: string;
    description: string | null;
  }): Promise<EmailResult> {
    const greeting = input.name ? `Hi ${input.name},` : 'Hi,';

    const text = [
      greeting,
      '',
      `${input.hostName} has added a new event at Hacker Dojo.`,
      '',
      input.title,
      `${input.when}`,
      `${input.roomName}`,
      ...(input.description ? ['', input.description] : []),
      '',
      'Open the app to RSVP. This one is open to everyone — you do not need a',
      'membership to come along.',
      '',
      '— Hacker Dojo',
    ].join('\n');

    return this.send({
      to: input.to,
      subject: `New at the Dojo: ${input.title}`,
      text,
    });
  },

  async sendMembershipWelcome(input: {
    to: string;
    name: string | null;
    memberSsid: string;
    guestSsid: string;
    guestPassword: string;
    pin: string;
  }): Promise<EmailResult> {
    const greeting = input.name ? `Hi ${input.name},` : 'Hi,';

    const text = [
      greeting,
      '',
      'Welcome to Hacker Dojo. Your membership is active, and the app now opens',
      'the front door for you.',
      '',
      'Wi-Fi',
      '',
      `There are two networks. The member network, ${input.memberSsid}, signs you in`,
      'as yourself:',
      '',
      `  Network:   ${input.memberSsid}`,
      `  Username:  ${input.to}`,
      `  PIN:       ${input.pin}`,
      '',
      `Guests and visitors use ${input.guestSsid} with the password`,
      `"${input.guestPassword}".`,
      '',
      'Your PIN is also on the Home screen of the app, under Wi-Fi, so there is',
      'nothing to keep hold of here.',
      '',
      '— Hacker Dojo',
    ].join('\n');

    return this.send({
      to: input.to,
      subject: 'Welcome to Hacker Dojo — your Wi-Fi PIN',
      text,
    });
  },
};
