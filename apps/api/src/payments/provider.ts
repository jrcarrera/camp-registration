import type { ProviderPaymentEvent, PaymentProviderName } from '@camp-registration/database';

export interface HostedCheckoutInput {
  amountCents: number;
  attemptId: string;
  camperName: string;
  currency: 'USD';
  customerEmail: string | null;
  familyId: string;
  organizationId: string;
  providerAccountId: string;
  registrationId: string;
  sessionName: string;
}

export interface HostedCheckoutResult {
  checkoutUrl: string;
  providerCheckoutSessionId: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult>;
  verifyWebhook?(rawBody: Buffer, signature: string): ProviderPaymentEvent | null;
}

export class LocalPaymentProvider implements PaymentProvider {
  readonly name = 'LOCAL' as const;

  constructor(private readonly publicBaseUrl: string) {}

  async createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult> {
    return {
      checkoutUrl: new URL(
        `/portal/payments/local/${input.attemptId}`,
        this.publicBaseUrl,
      ).toString(),
      providerCheckoutSessionId: `local_cs_${input.attemptId.replaceAll('-', '')}`,
    };
  }
}
