import { useNavigate } from 'react-router-dom';
import { useDocStore } from '../store/docStore';
import { Dropzone } from './Dropzone';
import { cn, formatRelativeTime } from '../lib/utils';

export function HomeCard() {
  const navigate = useNavigate();
  const uploadFile = useDocStore((s) => s.uploadFile);
  const createBlank = useDocStore((s) => s.createBlank);
  const openDoc = useDocStore((s) => s.openDoc);
  const recents = useDocStore((s) => s.recents);
  const parseProgress = useDocStore((s) => s.parseProgress);
  const parseMessage = useDocStore((s) => s.parseMessage);

  const onFile = async (file: File) => {
    const id = await uploadFile(file);
    if (id) navigate(`/doc/${id}`);
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10">
      <div
        className="rounded-[20px] border border-[var(--line)] bg-[var(--surface)] p-8 shadow-[var(--shadow-soft)]"
        style={{
          backgroundImage:
            'radial-gradient(120% 80% at 50% -20%, var(--primary-soft), transparent 60%)',
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}
            aria-hidden
          >
            B
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--ink)]">
            Buildesk Convertor
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
          Document Workspace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Edit your document and HTML side by side. Changes stay synchronized automatically.
        </p>

        <div className="mt-6">
          <Dropzone
            onFile={onFile}
            progress={parseProgress}
            progressMessage={parseMessage}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-[var(--primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}
          >
            Upload DOCX
          </button>
          <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold hover:border-[var(--primary)] hover:text-[var(--primary)]">
            Upload HTML
            <input
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] px-4 text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]"
            onClick={() => {
              const id = createBlank();
              navigate(`/doc/${id}`);
            }}
          >
            Create blank document
          </button>
        </div>

        <div className="my-6 h-px bg-[var(--line)]" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Supported
          </span>
          {['DOCX', 'HTML'].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-2.5 py-0.5 text-xs font-medium text-[var(--ink)]"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {recents.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-soft)]">
          <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Recent documents</h2>
          <ul className="space-y-2">
            {recents.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
                  )}
                  onClick={() => {
                    void openDoc(r.id).then(() => navigate(`/doc/${r.id}`));
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                  <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase text-[var(--muted)]">
                    {r.sourceFormat}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)]">
                    {formatRelativeTime(r.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
