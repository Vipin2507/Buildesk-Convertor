import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { StatusIndicator } from '../ui/StatusIndicator';
import { Button } from '../ui/Button';
import { Copy, WrapText } from 'lucide-react';

interface HtmlEditorProps {
  value: string;
  htmlValid: boolean;
  onChange: (value: string) => void;
  onCopy: () => void;
  onFormat: () => void;
  readOnly?: boolean;
}

export function HtmlEditor({
  value,
  htmlValid,
  onChange,
  onCopy,
  onFormat,
  readOnly,
}: HtmlEditorProps) {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const applyingRef = useRef(false);
  const lastExternal = useRef(value);

  const handleMount: OnMount = (ed) => {
    editorRef.current = ed;
  };

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (value === lastExternal.current) return;
    const model = ed.getModel();
    if (!model) return;
    if (model.getValue() === value) {
      lastExternal.current = value;
      return;
    }

    applyingRef.current = true;
    const position = ed.getPosition();
    const scrollTop = ed.getScrollTop();
    model.pushEditOperations(
      [],
      [
        {
          range: model.getFullModelRange(),
          text: value,
        },
      ],
      () => null,
    );
    if (position) ed.setPosition(position);
    ed.setScrollTop(scrollTop);
    lastExternal.current = value;
    applyingRef.current = false;
  }, [value]);

  return (
    <div className="html-editor-pane">
      <div className="html-editor-header">
        <h2>HTML Source</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusIndicator
            state={htmlValid ? 'valid' : 'invalid'}
            label={htmlValid ? 'HTML valid' : 'HTML has syntax errors'}
          />
          <Button variant="ghost" size="sm" onClick={onFormat} aria-label="Format HTML">
            <WrapText size={14} />
            Format
          </Button>
          <Button variant="ghost" size="sm" onClick={onCopy} aria-label="Copy HTML">
            <Copy size={14} />
            Copy
          </Button>
        </div>
      </div>
      <div className="html-editor-body">
        <Editor
          height="100%"
          defaultLanguage="html"
          theme="vs"
          value={value}
          onMount={handleMount}
          onChange={(v) => {
            if (applyingRef.current) return;
            const next = v ?? '';
            lastExternal.current = next;
            onChange(next);
          }}
          options={{
            readOnly,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace",
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            renderLineHighlight: 'line',
            folding: true,
            bracketPairColorization: { enabled: true },
            padding: { top: 12 },
            ariaLabel: 'HTML source editor',
          }}
        />
      </div>
    </div>
  );
}
