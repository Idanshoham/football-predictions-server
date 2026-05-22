import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SendArgs {
  to: { email: string; name: string };
  subject: string;
  textContent: string;
}

/**
 * Minimal Brevo transactional-email client. Plain text only — keeps emails
 * out of Gmail's "Promotions" tab better than marketing-style HTML.
 */
@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);

  constructor(private readonly config: ConfigService) {}

  async send(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const senderEmail = this.config.get<string>('BREVO_SENDER_EMAIL');
    const senderName =
      this.config.get<string>('BREVO_SENDER_NAME') ?? 'מונדיאל 2026';

    if (!apiKey || !senderEmail) {
      this.logger.error('BREVO_API_KEY or BREVO_SENDER_EMAIL not set; skipping send');
      return { ok: false, error: 'Brevo not configured' };
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [args.to],
        subject: args.subject,
        textContent: args.textContent,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Brevo send failed (${res.status}): ${body}`);
      return { ok: false, error: `${res.status}: ${body}` };
    }
    return { ok: true };
  }
}
