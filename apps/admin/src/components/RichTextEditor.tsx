import { useEffect, useRef, useState } from 'react';
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
  RemoveFormatting
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'متن خود را اینجا بنویسید...',
  className = ''
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastReportedValue = useRef(value);
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    ul: false,
    ol: false,
    justifyLeft: false,
    justifyCenter: false,
    justifyRight: false,
    justifyFull: false
  });

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
      justifyFull: document.queryCommandState('justifyFull')
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
    <div className={`border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 focus-within:bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/15 transition-all duration-200 shadow-sm ${className}`}>
      {/* Toolbar */}
      <div className="bg-slate-100/90 border-b border-slate-200/80 px-3 py-2 flex flex-wrap items-center gap-1">
        {/* Bold */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('bold');
          }}
          title="ضخیم (Bold)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.bold
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <Bold className="w-4 h-4" />
        </button>

        {/* Italic */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('italic');
          }}
          title="کج (Italic)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.italic
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <Italic className="w-4 h-4" />
        </button>

        {/* Underline */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('underline');
          }}
          title="زیرخط (Underline)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.underline
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <Underline className="w-4 h-4" />
        </button>

        {/* Strikethrough */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('strikeThrough');
          }}
          title="خط‌خورده (Strike)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.strikethrough
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('insertUnorderedList');
          }}
          title="لیست نقطه‌ای (Bullet List)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.ul
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <List className="w-4 h-4" />
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('insertOrderedList');
          }}
          title="لیست عددی (Numbered List)"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.ol
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Headings */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('formatBlock', '<h3>');
          }}
          title="تیتر اصلی (Heading 1)"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <Heading1 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('formatBlock', '<h4>');
          }}
          title="تیتر فرعی (Heading 2)"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <Heading2 className="w-4 h-4" />
        </button>

        {/* Quote */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('formatBlock', '<blockquote>');
          }}
          title="نقل‌قول (Quote)"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <Quote className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('justifyRight');
          }}
          title="راست‌چین"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.justifyRight
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <AlignRight className="w-4 h-4" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('justifyCenter');
          }}
          title="وسط‌چین"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.justifyCenter
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <AlignCenter className="w-4 h-4" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('justifyLeft');
          }}
          title="چپ‌چین"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.justifyLeft
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <AlignLeft className="w-4 h-4" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('justifyFull');
          }}
          title="تراز کامل"
          className={`p-2 rounded-xl text-xs flex items-center justify-center transition ${
            activeStates.justifyFull
              ? 'bg-indigo-600 text-white shadow-sm font-bold'
              : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          <AlignJustify className="w-4 h-4" />
        </button>

        <div className="h-5 w-px bg-slate-300 mx-1" />

        {/* Remove Formatting */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('removeFormat');
          }}
          title="حذف قالب‌بندی"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <RemoveFormatting className="w-4 h-4" />
        </button>

        {/* Undo */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('undo');
          }}
          title="بازگشت (Undo)"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <Undo className="w-4 h-4" />
        </button>

        {/* Redo */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleCommand('redo');
          }}
          title="تکرار (Redo)"
          className="p-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition flex items-center justify-center"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Editable Area */}
      <div className="relative">
        {isEmpty && (
          <div
            className="absolute top-4 right-4 pointer-events-none text-slate-400 text-sm italic select-none"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          dir="rtl"
          onInput={handleInput}
          onFocus={() => {
            updateActiveStates();
          }}
          onKeyUp={updateActiveStates}
          onMouseUp={updateActiveStates}
          className="w-full min-h-[180px] p-4 text-sm text-slate-800 leading-relaxed outline-none overflow-y-auto font-normal [&_ul]:list-disc [&_ul]:mr-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:mr-6 [&_ol]:my-2 [&_li]:my-1.5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:my-2 [&_h3]:text-indigo-950 [&_h4]:text-base [&_h4]:font-bold [&_h4]:my-2 [&_h4]:text-indigo-900 [&_blockquote]:border-r-4 [&_blockquote]:border-indigo-500 [&_blockquote]:pr-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:my-2 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_s]:line-through [&_p]:my-1.5"
        />
      </div>
    </div>
  );
}

export function RichTextDisplay({ content, className = '' }: { content: string; className?: string }) {
  if (!content) return null;
  return (
    <div
      className={`text-sm text-slate-700 leading-relaxed font-normal bg-slate-50/50 p-4 rounded-2xl border border-slate-100 ${className} [&_ul]:list-disc [&_ul]:mr-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:mr-6 [&_ol]:my-2 [&_li]:my-1.5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:my-2 [&_h3]:text-indigo-950 [&_h4]:text-base [&_h4]:font-bold [&_h4]:my-2 [&_h4]:text-indigo-900 [&_blockquote]:border-r-4 [&_blockquote]:border-indigo-500 [&_blockquote]:pr-3 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:my-2 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_s]:line-through [&_p]:my-1.5`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
