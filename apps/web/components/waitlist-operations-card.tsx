'use client';

import type {
  ProblemResponse,
  WaitlistNotificationIssue,
  WaitlistNotificationReplayResult,
  WaitlistOperationsStatus,
} from '@camp-registration/contracts';
import { Activity, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

interface WaitlistOperationsCardProps {
  organizationTimeZone: string;
  status: WaitlistOperationsStatus | null;
}

function formatTimestamp(value: string | null, timeZone: string): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeZone,
    timeStyle: 'short',
  }).format(new Date(value));
}

function automationLabel(status: WaitlistOperationsStatus | null): string {
  if (!status) return 'Unavailable';
  const labels: Record<WaitlistOperationsStatus['health'], string> = {
    DEGRADED: 'Needs attention',
    HEALTHY: 'Healthy',
    NOT_RUNNING: 'Not running',
    STALE: 'Delayed',
  };
  return labels[status.health];
}

function notificationLabel(issue: WaitlistNotificationIssue): string {
  const labels: Record<WaitlistNotificationIssue['notification_type'], string> = {
    WAITLIST_ACCEPTED: 'Acceptance confirmation',
    WAITLIST_CANCELLED: 'Cancellation notice',
    WAITLIST_DECLINED: 'Decline confirmation',
    WAITLIST_EXPIRED: 'Expiration notice',
    WAITLIST_EXPIRING_SOON: 'Offer reminder',
    WAITLIST_OFFERED: 'Waitlist offer',
  };
  return labels[issue.notification_type];
}

function issueTypePath(issue: WaitlistNotificationIssue): 'coverage' | 'delivery' {
  return issue.issue_type === 'NO_ELIGIBLE_RECIPIENT' ? 'coverage' : 'delivery';
}

export function WaitlistOperationsCard({
  organizationTimeZone,
  status: initialStatus,
}: WaitlistOperationsCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [selectedIssue, setSelectedIssue] = useState<WaitlistNotificationIssue | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function replayNotification() {
    if (!status || !selectedIssue || reason.trim().length < 3) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/operations/waitlist/notifications/${issueTypePath(selectedIssue)}/${selectedIssue.id}/replay`,
        {
          body: JSON.stringify({ reason: reason.trim() }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as ProblemResponse | null;
        throw new Error(problem?.message ?? 'The notification could not be replayed.');
      }
      const result = (await response.json()) as WaitlistNotificationReplayResult;
      setStatus((current) => {
        if (!current) return current;
        const notificationIssues = result.issue_open
          ? current.notification_issues.map((issue) =>
              issue.id === result.issue_id
                ? { ...issue, replay_count: issue.replay_count + 1 }
                : issue,
            )
          : current.notification_issues.filter((issue) => issue.id !== result.issue_id);
        const failedDeliveryCount =
          result.issue_type === 'DELIVERY_FAILED' && !result.issue_open
            ? Math.max(0, current.failed_delivery_count - 1)
            : current.failed_delivery_count;
        const noRecipientCount =
          result.issue_type === 'NO_ELIGIBLE_RECIPIENT' && !result.issue_open
            ? Math.max(0, current.no_recipient_count - 1)
            : current.no_recipient_count;
        return {
          ...current,
          failed_delivery_count: failedDeliveryCount,
          health:
            current.health === 'DEGRADED' &&
            current.consecutive_failures === 0 &&
            current.expired_offer_count === 0 &&
            failedDeliveryCount === 0 &&
            noRecipientCount === 0
              ? 'HEALTHY'
              : current.health,
          no_recipient_count: noRecipientCount,
          notification_issues: notificationIssues,
          pending_delivery_count: current.pending_delivery_count + result.queued_count,
        };
      });
      setNotice(
        result.issue_open
          ? 'No eligible recipient is available yet. The issue remains open.'
          : `${result.queued_count} notification${result.queued_count === 1 ? '' : 's'} queued for delivery.`,
      );
      setSelectedIssue(null);
      setReason('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The notification could not be replayed.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="queueSection queueSectionOperations">
      <div className="queueHeader operationsHeader">
        <span aria-hidden="true">
          <Activity size={18} />
        </span>
        <div>
          <p className="contextLabel">Automation</p>
          <h2>Waitlist operations</h2>
        </div>
        <strong className={`operationsBadge operationsBadge${status?.health ?? 'UNKNOWN'}`}>
          {automationLabel(status)}
        </strong>
      </div>
      {status ? (
        <>
          <ul className="operationsMetrics" aria-label="Waitlist automation status">
            <li>
              <span>Last completed cycle</span>
              <strong>{formatTimestamp(status.last_completed_at, organizationTimeZone)}</strong>
            </li>
            <li>
              <span>Pending deliveries</span>
              <strong>{status.pending_delivery_count}</strong>
            </li>
            <li>
              <span>Failed deliveries</span>
              <strong>{status.failed_delivery_count}</strong>
            </li>
            <li>
              <span>Missing recipients</span>
              <strong>{status.no_recipient_count}</strong>
            </li>
            <li>
              <span>Expired offers awaiting processing</span>
              <strong>{status.expired_offer_count}</strong>
            </li>
          </ul>

          <div className="notificationIssues">
            <div className="notificationIssuesHeading">
              <h3>Notification issues</h3>
              <span>{status.notification_issues.length} shown</span>
            </div>
            {notice ? (
              <p className="operationNotice" role="status">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="operationError" role="alert">
                {error}
              </p>
            ) : null}
            {status.notification_issues.length > 0 ? (
              <ul className="notificationIssueList">
                {status.notification_issues.map((issue) => (
                  <li key={`${issue.issue_type}:${issue.id}`}>
                    <div>
                      <strong>{notificationLabel(issue)}</strong>
                      <span>
                        {issue.camper_name} · {issue.session_name}
                      </span>
                      <small>
                        {issue.issue_type === 'NO_ELIGIBLE_RECIPIENT'
                          ? 'No eligible family recipient'
                          : `Delivery failed${issue.recipient_hint ? ` · ${issue.recipient_hint}` : ''}`}
                      </small>
                    </div>
                    {status.can_replay_notifications ? (
                      <button
                        className="buttonSecondary notificationReplayButton"
                        onClick={() => {
                          setSelectedIssue(issue);
                          setReason('');
                          setError(null);
                          setNotice(null);
                        }}
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                        Replay
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="queueEmpty">No notification issues require staff action.</p>
            )}
          </div>

          {selectedIssue ? (
            <div className="notificationReplayPanel" role="region" aria-label="Replay notification">
              <div className="notificationReplayHeading">
                <div>
                  <p className="contextLabel">Administrator action</p>
                  <h3>Replay {notificationLabel(selectedIssue).toLowerCase()}</h3>
                </div>
                <button
                  aria-label="Close replay form"
                  className="iconButton"
                  disabled={submitting}
                  onClick={() => setSelectedIssue(null)}
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                </button>
              </div>
              <label className="formField">
                <span>Reason for replay</span>
                <textarea
                  autoFocus
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Describe what changed or why another attempt is appropriate."
                  rows={3}
                  value={reason}
                />
              </label>
              <div className="notificationReplayActions">
                <button
                  className="buttonSecondary"
                  disabled={submitting}
                  onClick={() => setSelectedIssue(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="buttonPrimary"
                  disabled={submitting || reason.trim().length < 3}
                  onClick={() => void replayNotification()}
                  type="button"
                >
                  {submitting ? 'Replaying…' : 'Confirm replay'}
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="queueEmpty">
          Waitlist automation health could not be loaded. Registration data remains available.
        </p>
      )}
    </div>
  );
}
