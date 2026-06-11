import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback } from 'react';
import { EditorToolbar } from './EditorToolbar';

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-slate dark:prose-invert max-w-none focus:outline-none min-h-[550px] px-4 py-3',
      },
      handleDrop: (view, event) => {
        const text = event.dataTransfer?.getData('text/plain');
        if (text) {
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            const paragraphs = text.split('\n').filter(Boolean);
            let insertContent = '';
            for (const para of paragraphs) {
              insertContent += `<p>${para}</p>`;
            }
            editor?.chain().focus().insertContentAt(pos.pos, insertContent).run();
          }
          return true;
        }
        return false;
      },
    },
  });

  const setContent = useCallback((newContent: string) => {
    if (editor && newContent !== editor.getHTML()) {
      editor.commands.setContent(newContent);
    }
  }, [editor]);

  useEffect(() => {
    setContent(content);
  }, [content, setContent]);

  return (
    <div className="flex flex-col rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
      <EditorToolbar editor={editor} />
      <div
        className="bg-white dark:bg-slate-800 overflow-y-auto cursor-text"
        style={{ minHeight: '550px' }}
        onClick={() => editor?.chain().focus().run()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
