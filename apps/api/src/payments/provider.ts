import type {
  PaymentAdjustmentStatus,
  ProviderPaymentEvent,
  ProviderRefundEvent,
  PaymentProviderName,
} from '@camp-registration/database';

export interface HostedCheckoutInput {
  amountCents: number;
  attemptId: string;
  camperName: string;
  currency: 'USD';
  customerEmail: string | null;
  familyId: string;
  organizationId: string;
  providerAccountId: string;
  registrationId: string | null;
  orderId: string | null;
  purpose: 'DEPOSIT' | 'INSTALLMENT' | 'BALANCE';
  sessionName: string;
}

export interface HostedCheckoutResult {
  checkoutUrl: string;
  providerCheckoutSessionId: string;
}

export interface RefundInput {
  adjustmentId: string;
  amountCents: number;
  currency: 'USD';
  organizationId: string;
  paymentIntentId: string;
  providerAccountId: string;
}

export interface RefundResult {
  failureCode: string | null;
  providerRefundId: string;
  status: PaymentAdjustmentStatus;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult>;
  createRefund(input: RefundInput): Promise<RefundResult>;
  expireHostedCheckout?(
    providerAccountId: string,
    providerCheckoutSessionId: string,
  ): Promise<void>;
  verifyWebhook?(
    rawBody: Buffer,
    signature: string,
  ): ProviderPaymentEvent | ProviderRefundEvent | null;
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

  async createRefund(input: RefundInput): Promise<RefundResult> {
    return {
      failureCode: null,
      providerRefundId: `local_re_${input.adjustmentId.replaceAll('-', '')}`,
      status: 'SUCCEEDED',
    };
  }

  async expireHostedCheckout(): Promise<void> {}
}
