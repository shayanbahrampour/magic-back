import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Undo,
  Redo,
  RemoveFormatting,
} from 'lucide-react';
import { cx } from './ui';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

type ActiveKey =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'ul'
  | 'ol'
  | 'justifyLeft'
  | 'justifyCenter'
  | 'justifyRight'
  | 'justifyFull';

type ActiveStates = Record<ActiveKey, boolean>;

const INITIAL_STATES: ActiveStates = {
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  ul: false,
  ol: false,
  justifyLeft: false,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
};

/**
 * Toolbar definition. Keeping it as data rather than fifteen near-identical
 * JSX blocks is what makes the button styling consistent by construction.
 * `active` names the queryCommandState key that lights the button up; buttons
 * without one are stateless actions.
 */
type ToolbarItem =
  | { kind: 'divider' }
  | {
      kind: 'button';
      icon: ComponentType<{ className?: string }>;
      label: string;
      command: string;
      arg?: string;
      active?: ActiveKey;
    };

const TOOLBAR: ToolbarItem[] = [
  { kind: 'button', icon: Bold, label: 'ضخیم', command: 'bold', active: 'bold' },
  { kind: 'button', icon: Italic, label: 'کج', command: 'italic', active: 'italic' },
  { kind: 'button', icon: Underline, label: 'زیرخط', command: 'underline', active: 'underline' },
  {
    kind: 'button',
    icon: Strikethrough,
    label: 'خط‌خورده',
    command: 'strikeThrough',
    active: 'strikethrough',
  },
  { kind: 'divider' },
  {
    kind: 'button',
    icon: List,
    label: 'لیست نقطه‌ای',
    command: 'insertUnorderedList',
    active: 'ul',
  },
  {
    kind: 'button',
    icon: ListOrdered,
    label: 'لیست عددی',
    command: 'insertOrderedList',
    active: 'ol',
  },
  { kind: 'divider' },
  { kind: 'button', icon: Heading1, label: 'تیتر اصلی', command: 'formatBlock', arg: '<h3>' },
  { kind: 'button', icon: Heading2, label: 'تیتر فرعی', command: 'formatBlock', arg: '<h4>' },
  { kind: 'button', icon: Quote, label: 'نقل‌قول', command: 'formatBlock', arg: '<blockquote>' },
  { kind: 'divider' },
  {
    kind: 'button',
    icon: AlignRight,
    label: 'راست‌چین',
    command: 'justifyRight',
    active: 'justifyRight',
  },
  {
    kind: 'button',
    icon: AlignCenter,
    label: 'وسط‌چین',
    command: 'justifyCenter',
    active: 'justifyCenter',
  },
  {
    kind: 'button',
    icon: AlignLeft,
    label: 'چپ‌چین',
    command: 'justifyLeft',
    active: 'justifyLeft',
  },
  {
    kind: 'button',
    icon: AlignJustify,
    label: 'تراز کامل',
    command: 'justifyFull',
    active: 'justifyFull',
  },
  { kind: 'divider' },
  {
    kind: 'button',
    icon: RemoveFormatting,
    label: 'حذف قالب‌بندی',
    command: 'removeFormat',
  },
  { kind: 'button', icon: Undo, label: 'بازگشت', command: 'undo' },
  { kind: 'button', icon: Redo, label: 'تکرار', command: 'redo' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'متن خود را اینجا بنویسید…',
  className = '',
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastReportedValue = useRef(value);
  const [activeStates, setActiveStates] = useState<ActiveStates>(INITIAL_STATES);

  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastReportedValue.current) {
      editorRef.current.innerHTML = value || '';
      lastReportedValue.current = value || '';
    }
  }, [value]);

  const updateActiveStates = () => {
    setActiveStates({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikethrough: document.queryCommandState('strikeThrough'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
      justifyLeft: document.queryCommandState('justifyLeft'),
      justifyCenter: document.queryCommandState('justifyCenter'),
      justifyRight: document.queryCommandState('justifyRight'),
      justifyFull: document.queryCommandState('justifyFull'),
    });
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      if (document.activeElement === editorRef.current) {
        updateActiveStates();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      lastReportedValue.current = html;
      onChange(html);
    }
  };

  const handleCommand = (command: string, arg?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, arg);
    updateActiveStates();
    handleInput();
  };

  const isEmpty =
    !value ||
    value.trim() === '' ||
    value === '<br>' ||
    value === '<p><br></p>' ||
    value === '<div><br></div>';

  return (
    <div
      className={cx(
        'overflow-hidden rounded-control border border-line bg-surface',
        'transition-colors duration-150 ease-out-quart',
        'focus-within:border-accent focus-within:ring-[3px] focus-within:ring-accent/15',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-raised/60 px-2 py-1.5">
        {TOOLBAR.map((item, i) => {
          if (item.kind === 'divider') {
            return <span key={`d${i}`} className="mx-1 h-5 w-px bg-line" aria-hidden />;
          }

          const Icon = item.icon;
          const active = item.active ? activeStates[item.active] : false;

          return (
            <button
              key={item.label}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={item.active ? active : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                handleCommand(item.command, item.arg);
              }}
              className={cx(
                'inline-flex h-7 w-7 items-center justify-center rounded-[6px]',
                'transition-colors duration-150 ease-out-quart',
                active
                  ? 'bg-accent-soft text-accent-strong'
                  : 'text-muted hover:bg-surface hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      <div className="relative">
        {isEmpty && (
          <div
            className="pointer-events-none absolute top-4 start-4 select-none text-sm text-faint"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          dir="rtl"
          onInput={handleInput}
          onFocus={updateActiveStates}
          onKeyUp={updateActiveStates}
          onMouseUp={updateActiveStates}
          className="richtext min-h-[180px] w-full overflow-y-auto p-4 outline-none"
        />
      </div>
    </div>
  );
}

export function RichTextDisplay({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  if (!content) return null;
  return (
    <div
      className={cx('richtext rounded-control border border-line bg-raised/40 p-4', className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
