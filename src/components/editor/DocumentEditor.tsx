import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import Placeholder from '@tiptap/extension-placeholder';
import FontFamily from '@tiptap/extension-font-family';
import { useEffect, useRef, type CSSProperties } from 'react';
import {
  FontSizeExtension,
  PageBreak,
  StyledHeading,
  StyledParagraph,
  StyledTableCell,
  StyledTableHeader,
} from './extensions';

export interface DocumentEditorProps {
  html: string;
  editable?: boolean;
  onReady?: (editor: Editor) => void;
  onUpdate?: (html: string) => void;
  defaults?: {
    fontFamily?: string;
    fontSize?: string;
    lineHeight?: string | number;
    textColor?: string;
  };
}

export function DocumentEditor({
  html,
  editable = true,
  onReady,
  onUpdate,
  defaults,
}: DocumentEditorProps) {
  const applyingRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
      }),
      StyledParagraph,
      StyledHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSizeExtension,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer' },
      }),
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      PageBreak,
    ],
    content: html || '<p></p>',
    editable,
    editorProps: {
      attributes: {
        class: 'document-prosemirror',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (applyingRef.current) return;
      onUpdateRef.current?.(ed.getHTML());
    },
  });

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (normalizeHtml(current) === normalizeHtml(html)) return;
    applyingRef.current = true;
    editor.commands.setContent(html || '<p></p>', { emitUpdate: false });
    applyingRef.current = false;
  }, [editor, html]);

  const paperStyle: CSSProperties = {
    fontFamily: defaults?.fontFamily
      ? `'${defaults.fontFamily}', Times, serif`
      : 'Times New Roman, Times, Georgia, serif',
    fontSize: defaults?.fontSize ?? '11pt',
    lineHeight: defaults?.lineHeight ?? 1.15,
    color: defaults?.textColor ?? '#000000',
  };

  return (
    <div className={`document-canvas ${editable ? '' : 'is-preview'}`}>
      <div className="document-paper" style={paperStyle}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

export type { Editor };
