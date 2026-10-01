import type { Editor } from '@tiptap/react';
import { useEffect, useReducer } from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Minus,
  RemoveFormatting,
  Undo2,
  Redo2,
  Highlighter,
  Pilcrow,
} from 'lucide-react';
import { Button } from '../ui/Button';
import './toolbar.css';

interface EditorToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const FONT_FAMILIES = [
  { label: 'Default', value: '' },
  { label: 'Times New Roman', value: 'Times New Roman, Times, serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Inter', value: 'Inter, sans-serif' },
];

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];

export function EditorToolbar({
  editor,
  disabled,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditorToolbarProps) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!editor) return;
    const update = () => rerender();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  if (!editor) {
    return <div className="editor-toolbar is-empty" aria-hidden />;
  }

  const undoDisabled = disabled || (onUndo ? !canUndo : !editor.can().undo());
  const redoDisabled = disabled || (onRedo ? !canRedo : !editor.can().redo());

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const src = reader.result as string;
        editor.chain().focus().setImage({ src }).run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Document formatting">
      <div className="toolbar-group">
        <Button
          variant="icon"
          aria-label="Undo"
          disabled={undoDisabled}
          onClick={() => (onUndo ? onUndo() : editor.chain().focus().undo().run())}
        >
          <Undo2 size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Redo"
          disabled={redoDisabled}
          onClick={() => (onRedo ? onRedo() : editor.chain().focus().redo().run())}
        >
          <Redo2 size={16} />
        </Button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <select
          className="toolbar-select"
          aria-label="Font family"
          disabled={disabled}
          value={editor.getAttributes('textStyle').fontFamily || ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="toolbar-select toolbar-select-sm"
          aria-label="Font size"
          disabled={disabled}
          value={editor.getAttributes('textStyle').fontSize || '16px'}
          onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s.replace('px', '')}
            </option>
          ))}
        </select>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <Button
          variant="icon"
          aria-label="Bold"
          active={editor.isActive('bold')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Italic"
          active={editor.isActive('italic')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Underline"
          active={editor.isActive('underline')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Strikethrough"
          active={editor.isActive('strike')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </Button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <label className="toolbar-color" title="Text color">
          <input
            type="color"
            aria-label="Text color"
            disabled={disabled}
            value={editor.getAttributes('textStyle').color || '#1a1a1a'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <Button
          variant="icon"
          aria-label="Highlight"
          active={editor.isActive('highlight')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHighlight({ color: '#ffe566' }).run()}
        >
          <Highlighter size={16} />
        </Button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <Button
          variant="icon"
          aria-label="Align left"
          active={editor.isActive({ textAlign: 'left' })}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Justify"
          active={editor.isActive({ textAlign: 'justify' })}
          disabled={disabled}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <AlignJustify size={16} />
        </Button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <Button
          variant="icon"
          aria-label="Bullet list"
          active={editor.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Numbered list"
          active={editor.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Indent"
          disabled={disabled}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
        >
          <Indent size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Outdent"
          disabled={disabled}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
        >
          <Outdent size={16} />
        </Button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <Button variant="icon" aria-label="Insert link" disabled={disabled} onClick={setLink}>
          <Link2 size={16} />
        </Button>
        <Button variant="icon" aria-label="Insert image" disabled={disabled} onClick={addImage}>
          <ImageIcon size={16} />
        </Button>
        <Button variant="icon" aria-label="Insert table" disabled={disabled} onClick={insertTable}>
          <TableIcon size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Horizontal rule"
          disabled={disabled}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Page break"
          disabled={disabled}
          onClick={() => editor.chain().focus().setPageBreak().run()}
        >
          <Pilcrow size={16} />
        </Button>
        <Button
          variant="icon"
          aria-label="Clear formatting"
          disabled={disabled}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormatting size={16} />
        </Button>
      </div>
    </div>
  );
}
