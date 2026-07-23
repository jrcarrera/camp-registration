'use client';

import type { ProblemResponse } from '@camp-registration/contracts';
import { MailPlus } from 'lucide-react';
import { useState } from 'react';

export function FamilyInvitationButton({
  adultId,
  familyId,
  requestHeaders = {},
}: {
  adultId: string;
  familyId: string;
  requestHeaders?: Record<string, string>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function sendInvitation() {
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/v1/families/${encodeURIComponent(familyId)}/adults/${encodeURIComponent(adultId)}/invitations`,
        { headers: requestHeaders, method: 'POST' },
      );
      if (!response.ok) {
        const problem = (await response.json()) as ProblemResponse;
        setMessage(problem.message);
        return;
      }
      setMessage('Invitation sent.');
    } catch {
      setMessage('The invitation could not be sent.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="familyInvitationAction">
      <button
        className="buttonSecondary buttonCompact"
        disabled={sending}
        onClick={() => void sendInvitation()}
        type="button"
      >
        <MailPlus aria-hidden="true" size={15} />
        {sending ? 'Sending…' : 'Invite to account'}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
