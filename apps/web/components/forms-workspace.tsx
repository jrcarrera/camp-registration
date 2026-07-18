'use client';

import type {
  FormField,
  FormFieldType,
  FormTemplate,
  ProblemResponse,
  SessionSummary,
} from '@camp-registration/contracts';
import { AlertCircle, CheckCircle2, FilePlus2, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface FormsWorkspaceProps {
  initialTemplates: FormTemplate[];
  sessions: SessionSummary[];
}

interface DraftValue {
  description: string;
  fields: FormField[];
  name: string;
}

interface MessageState {
  message: string | null;
  tone: 'error' | 'success';
}

const fieldTypes: { label: string; value: FormFieldType }[] = [
  { label: 'Long text', value: 'TEXT' },
  { label: 'Single choice', value: 'SINGLE_CHOICE' },
  { label: 'Date', value: 'DATE' },
  { label: 'Acknowledgement', value: 'ACKNOWLEDGEMENT' },
  { label: 'Signature', value: 'SIGNATURE' },
];

function emptyField(index: number): FormField {
  return {
    id: `field_${index}`,
    label: '',
    options: [],
    required: true,
    type: 'TEXT',
  };
}

function isProblem(value: FormTemplate | ProblemResponse): value is ProblemResponse {
  return 'message' in value && 'code' in value;
}

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

async function requestTemplate(
  url: string,
  method: 'PATCH' | 'POST',
  body: unknown,
): Promise<FormTemplate | ProblemResponse> {
  try {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method,
    });
    return (await response.json()) as FormTemplate | ProblemResponse;
  } catch {
    return { code: 'request_failed', message: 'The form request could not be completed.' };
  }
}

function WorkspaceMessage({ state }: { state: MessageState }) {
  if (!state.message) return null;
  return (
    <div
      className={`notice notice${state.tone === 'error' ? 'Error' : 'Success'}`}
      role={state.tone === 'error' ? 'alert' : 'status'}
    >
      {state.tone === 'error' ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <CheckCircle2 size={18} aria-hidden="true" />
      )}
      {state.message}
    </div>
  );
}

function FieldEditor({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FormField;
  index: number;
  onChange: (field: FormField) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof FormField>(key: K, value: FormField[K]) =>
    onChange({ ...field, [key]: value });
  return (
    <div className="formBuilderField">
      <div className="formBuilderFieldHeader">
        <strong>Field {index + 1}</strong>
        <button className="iconButton" type="button" onClick={onRemove} aria-label="Remove field">
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="fieldGrid fieldGridThree">
        <label className="formField fieldWide">
          Prompt
          <input
            value={field.label}
            onChange={(event) => set('label', event.target.value)}
            placeholder="I acknowledge the cancellation policy"
            required
          />
        </label>
        <label className="formField">
          Field ID
          <input
            value={field.id}
            onChange={(event) => set('id', event.target.value.toLowerCase())}
            pattern="[a-z][a-z0-9_]+"
            required
          />
        </label>
        <label className="formField">
          Type
          <select
            value={field.type}
            onChange={(event) => {
              const type = event.target.value as FormFieldType;
              onChange({ ...field, options: type === 'SINGLE_CHOICE' ? field.options : [], type });
            }}
          >
            {fieldTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="toggleField">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => set('required', event.target.checked)}
          />
          <span>
            <strong>Required</strong>
            <small>Parents must answer before submission.</small>
          </span>
        </label>
        {field.type === 'SINGLE_CHOICE' && (
          <label className="formField fieldWide">
            Choices
            <input
              value={field.options.join(', ')}
              onChange={(event) =>
                set(
                  'options',
                  event.target.value.split(',').map((option) => option.trim()),
                )
              }
              placeholder="Yes, No, Not sure"
              required
            />
            <span className="fieldHint">Separate choices with commas.</span>
          </label>
        )}
      </div>
    </div>
  );
}

function DraftEditor({
  initialValue,
  onSave,
  saveLabel,
}: {
  initialValue: DraftValue;
  onSave: (value: DraftValue) => Promise<boolean>;
  saveLabel: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const update = (next: DraftValue) => {
    setValue(next);
    setDirty(true);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const saved = await onSave(value);
    setSaving(false);
    if (saved) setDirty(false);
  };
  return (
    <form className="formDraftEditor" onSubmit={submit} data-dirty={dirty || undefined}>
      <div className="fieldGrid">
        <label className="formField">
          Form name
          <input
            value={value.name}
            onChange={(event) => update({ ...value, name: event.target.value })}
            placeholder="Camper participation waiver"
            required
          />
        </label>
        <label className="formField fieldWide">
          Instructions
          <textarea
            value={value.description}
            onChange={(event) => update({ ...value, description: event.target.value })}
            placeholder="Explain what families should review before completing this form."
          />
        </label>
      </div>
      <div className="formBuilderFields">
        {value.fields.map((field, index) => (
          <FieldEditor
            field={field}
            index={index}
            key={index}
            onChange={(next) =>
              update({
                ...value,
                fields: value.fields.map((current, currentIndex) =>
                  currentIndex === index ? next : current,
                ),
              })
            }
            onRemove={() =>
              update({ ...value, fields: value.fields.filter((_, current) => current !== index) })
            }
          />
        ))}
      </div>
      <div className="inlineActions">
        <button
          className="buttonSecondary"
          type="button"
          onClick={() =>
            update({ ...value, fields: [...value.fields, emptyField(value.fields.length + 1)] })
          }
        >
          <Plus size={16} aria-hidden="true" />
          Add field
        </button>
        <button
          className="buttonPrimary"
          disabled={saving || value.fields.length === 0}
          type="submit"
        >
          <Save size={16} aria-hidden="true" />
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </form>
  );
}

function PublishPanel({
  onPublished,
  sessions,
  template,
}: {
  onPublished: (template: FormTemplate) => void;
  sessions: SessionSummary[];
  template: FormTemplate;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const [state, setState] = useState<MessageState>({ message: null, tone: 'success' });
  const [publishing, setPublishing] = useState(false);
  const publish = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPublishing(true);
    setState({ message: null, tone: 'success' });
    const result = await requestTemplate(`/api/v1/forms/${template.id}/publish`, 'POST', {
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      session_ids: selected,
      version: template.version,
    });
    setPublishing(false);
    if (isProblem(result)) {
      setState({ message: result.message, tone: 'error' });
      return;
    }
    onPublished(result);
    setSelected([]);
    setDueAt('');
    setState({
      message: `Version ${result.published_versions[0]?.version_number} published.`,
      tone: 'success',
    });
  };
  return (
    <form className="formPublishPanel" onSubmit={publish}>
      <div>
        <strong>Publish this saved draft</strong>
        <p>Publishing creates an immutable copy. Later edits only affect the next version.</p>
      </div>
      <div className="formSessionChoices" aria-label="Assign to sessions">
        {sessions.map((session) => (
          <label key={session.id}>
            <input
              type="checkbox"
              checked={selected.includes(session.id)}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, session.id]
                    : current.filter((id) => id !== session.id),
                )
              }
            />
            <span>
              <strong>{session.name}</strong>
              <small>{session.starts_on}</small>
            </span>
          </label>
        ))}
      </div>
      <label className="formField formDueField">
        Due date (optional)
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
        />
      </label>
      <WorkspaceMessage state={state} />
      <button
        className="buttonPrimary"
        disabled={publishing || selected.length === 0}
        type="submit"
      >
        <Send size={16} aria-hidden="true" />
        {publishing ? 'Publishing…' : 'Publish to sessions'}
      </button>
    </form>
  );
}

function PublishedHistory({ template }: { template: FormTemplate }) {
  if (template.published_versions.length === 0) return null;
  return (
    <div className="formVersionHistory">
      <h3>Published versions</h3>
      {template.published_versions.map((version) => (
        <div className="formVersionRow" key={version.id}>
          <div>
            <strong>Version {version.version_number}</strong>
            <small>{formatPublishedAt(version.published_at)} UTC</small>
          </div>
          <div className="formAssignmentList">
            {version.assignments.map((assignment) => (
              <span key={assignment.id}>
                {assignment.session_name}: {assignment.completed_count}/{assignment.total_count}{' '}
                complete
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplateCard({
  onUpdated,
  sessions,
  template,
}: {
  onUpdated: (template: FormTemplate) => void;
  sessions: SessionSummary[];
  template: FormTemplate;
}) {
  const [state, setState] = useState<MessageState>({ message: null, tone: 'success' });
  const save = async (value: DraftValue) => {
    setState({ message: null, tone: 'success' });
    const result = await requestTemplate(`/api/v1/forms/${template.id}`, 'PATCH', {
      ...value,
      version: template.version,
    });
    if (isProblem(result)) {
      setState({ message: result.message, tone: 'error' });
      return false;
    }
    onUpdated(result);
    setState({ message: 'Draft saved. Published versions were not changed.', tone: 'success' });
    return true;
  };
  return (
    <article className="formTemplateCard">
      <div className="formTemplateHeader">
        <div>
          <p className="contextLabel">Draft revision {template.version}</p>
          <h2>{template.name}</h2>
        </div>
        <span className="statusBadge">{template.published_versions.length} versions</span>
      </div>
      <WorkspaceMessage state={state} />
      <details className="formTemplateDetails">
        <summary>Edit draft</summary>
        <DraftEditor initialValue={template} onSave={save} saveLabel="Save draft" />
      </details>
      <PublishPanel onPublished={onUpdated} sessions={sessions} template={template} />
      <PublishedHistory template={template} />
    </article>
  );
}

export function FormsWorkspace({ initialTemplates, sessions }: FormsWorkspaceProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [createState, setCreateState] = useState<MessageState>({ message: null, tone: 'success' });
  const updateTemplate = (updated: FormTemplate) =>
    setTemplates((current) =>
      [...current.filter((template) => template.id !== updated.id), updated].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
  const create = async (value: DraftValue) => {
    setCreateState({ message: null, tone: 'success' });
    const result = await requestTemplate('/api/v1/forms', 'POST', value);
    if (isProblem(result)) {
      setCreateState({ message: result.message, tone: 'error' });
      return false;
    }
    updateTemplate(result);
    setCreateState({ message: `${result.name} created.`, tone: 'success' });
    return true;
  };
  return (
    <div className="formsWorkspace">
      <section className="contentSection formCreateSection" aria-labelledby="create-form-heading">
        <div className="sectionHeadingWithIcon">
          <FilePlus2 size={20} aria-hidden="true" />
          <div>
            <h2 id="create-form-heading">Create a reusable template</h2>
            <p>
              Start with a draft, then publish the exact version required for selected sessions.
            </p>
          </div>
        </div>
        <WorkspaceMessage state={createState} />
        <DraftEditor
          initialValue={{ description: '', fields: [emptyField(1)], name: '' }}
          onSave={create}
          saveLabel="Create template"
        />
      </section>
      <section className="formTemplateStack" aria-label="Form templates">
        {templates.length === 0 ? (
          <div className="contentSection portalEmptyState">
            <h2>No templates yet</h2>
            <p>Create the first form or waiver above.</p>
          </div>
        ) : (
          templates.map((template) => (
            <TemplateCard
              key={`${template.id}:${template.version}:${template.published_versions.length}`}
              onUpdated={updateTemplate}
              sessions={sessions}
              template={template}
            />
          ))
        )}
      </section>
    </div>
  );
}
