import type { FormTemplate, SessionSummary } from '@camp-registration/contracts';
import { AlertCircle } from 'lucide-react';

import { FormsWorkspace } from '../../components/forms-workspace';
import { getForms, getSessions } from '../../lib/api';

export const dynamic = 'force-dynamic';

export default async function FormsPage() {
  let templates: FormTemplate[] = [];
  let sessions: SessionSummary[] = [];
  let errorMessage: string | null = null;
  try {
    const [forms, sessionResponse] = await Promise.all([getForms(), getSessions()]);
    templates = forms.templates;
    sessions = sessionResponse.sessions.filter(
      (session) => session.status !== 'CANCELLED' && session.status !== 'ARCHIVED',
    );
  } catch {
    errorMessage = 'Forms could not be loaded. Confirm that the local API is running.';
  }

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="contextLabel">Readiness management</p>
          <h1>Forms & waivers</h1>
          <p className="pageDescription">
            Build reusable forms, publish immutable versions to sessions, and monitor completion.
          </p>
        </div>
      </header>
      {errorMessage ? (
        <div className="notice noticeError" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {errorMessage}
        </div>
      ) : (
        <FormsWorkspace initialTemplates={templates} sessions={sessions} />
      )}
    </>
  );
}
