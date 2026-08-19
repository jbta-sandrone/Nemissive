import { Node, type Editor, type JSONContent } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acceptedFileInputTypes, formatFileSize, getFriendlyFileType, validateHttpUrl } from "./fileAttachments";
import { documentsEqual } from "./noteDocuments";
import type { NoteAttachment } from "./useNoteAttachments";

type AttachmentContextValue = { attachments: Map<string, NoteAttachment>; onRemove: (attachment: NoteAttachment, deleteNode: () => void) => void };
const AttachmentContext = createContext<AttachmentContextValue>({ attachments: new Map(), onRemove: () => undefined });

function AttachmentNodeView({ node, deleteNode }: NodeViewProps) {
  const { attachments, onRemove } = useContext(AttachmentContext);
  const id = typeof node.attrs.attachmentId === "string" ? node.attrs.attachmentId : "";
  const attachment = attachments.get(id);
  if (!attachment) return <NodeViewWrapper className="note-attachment note-attachment-missing" contentEditable={false}><p>Attachment unavailable</p></NodeViewWrapper>;
  return (
    <NodeViewWrapper className="note-attachment" contentEditable={false} data-drag-handle>
      {attachment.attachmentType === "image" && attachment.signedUrl ? <img src={attachment.signedUrl} alt={attachment.fileName} className="note-attachment-image" /> : attachment.attachmentType === "voice" && attachment.signedUrl ? <audio controls preload="metadata" src={attachment.signedUrl} className="w-full" aria-label={`Voice recording ${attachment.fileName}`} /> : <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-heading">{attachment.fileName}</p><p className="text-xs text-muted">{getFriendlyFileType(attachment.fileName, attachment.mimeType)} · {formatFileSize(attachment.fileSize)}</p>{attachment.signedUrl && <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-semibold text-primary underline-offset-4 hover:underline">Open or download</a>}</div>}
      <button type="button" onClick={() => onRemove(attachment, deleteNode)} aria-label={`Remove ${attachment.fileName}`} className="note-attachment-remove">Remove</button>
    </NodeViewWrapper>
  );
}

const NoteAttachmentNode = Node.create({
  name: "noteAttachment",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() { return { attachmentId: { default: null }, attachmentType: { default: null } }; },
  parseHTML() { return [{ tag: "div[data-note-attachment]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", { "data-note-attachment": "", "data-attachment-id": HTMLAttributes.attachmentId, "data-attachment-type": HTMLAttributes.attachmentType }]; },
  addNodeView() { return ReactNodeViewRenderer(AttachmentNodeView); },
});

const noteEditorExtensions = [
  StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, protocols: ["http", "https"] } }),
  Highlight,
  TaskList,
  TaskItem.configure({
    nested: true,
    onReadOnlyChecked: () => false,
    HTMLAttributes: { class: "note-task-item", "data-type": "taskItem" },
  }),
  NoteAttachmentNode,
];

type NoteRichTextEditorProps = {
  document: JSONContent;
  attachments: NoteAttachment[];
  onChange: (document: JSONContent, text: string) => void;
  onUploadImage: (file: File) => void;
  onUploadFile: (file: File) => void;
  onRecordVoice: () => void;
  onRemoveAttachment: (attachment: NoteAttachment, deleteNode: () => void) => void;
  onReady?: (editor: Editor | null) => void;
};

type InsertMenuPosition = { top: number; left: number; maxHeight: number };

function InsertActionIcon({ kind }: { kind: "photo" | "voice" | "file" | "divider" }) {
  const paths = {
    photo: "M4 5.5h16v13H4v-13Zm3 9 3-3 2.5 2.5 2-2 2.5 2.5M16.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
    voice: "M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Zm-6 8a6 6 0 0 0 12 0M12 18v3M9 21h6",
    file: "M6 3.5h8l4 4v13H6v-17Zm8 0v4h4M9 12h6M9 16h6",
    divider: "M4 12h16",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d={paths[kind]} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active || undefined} disabled={disabled} onClick={onClick} className={`note-toolbar-button ${active ? "is-active" : ""}`}>{children}</button>;
}

function NoteRichTextEditor({ document, attachments, onChange, onUploadImage, onUploadFile, onRecordVoice, onRemoveAttachment, onReady }: NoteRichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertTriggerRef = useRef<HTMLButtonElement>(null);
  const insertMenuRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const lastEmittedDocumentRef = useRef<JSONContent | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertMenuPosition, setInsertMenuPosition] = useState<InsertMenuPosition | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState("");
  const handleEditorUpdate = useCallback(({ editor: instance }: { editor: Editor }) => {
    const nextDocument = instance.getJSON();
    lastEmittedDocumentRef.current = nextDocument;
    onChangeRef.current(nextDocument, instance.getText({ blockSeparator: "\n" }));
  }, []);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: noteEditorExtensions,
    content: document,
    editorProps: { attributes: { class: "note-prosemirror", "aria-label": "Note content", spellcheck: "true" }, transformPastedHTML: (html) => html.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/giu, "") },
    onUpdate: handleEditorUpdate,
  });

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onReadyRef.current?.(editor); return () => onReadyRef.current?.(null); }, [editor]);
  useEffect(() => {
    if (!editor || document === lastEmittedDocumentRef.current || documentsEqual(editor.getJSON(), document)) return;
    editor.commands.setContent(document, { emitUpdate: false });
  }, [document, editor]);

  const positionInsertMenu = useCallback(() => {
    const trigger = insertTriggerRef.current;
    if (!trigger) return;
    const triggerRect = trigger.getBoundingClientRect();
    const viewportMargin = 12;
    const gap = 8;
    const menuWidth = Math.max(168, insertMenuRef.current?.offsetWidth ?? 168);
    const menuHeight = Math.max(176, insertMenuRef.current?.offsetHeight ?? 176);
    const availableBelow = window.innerHeight - triggerRect.bottom - gap - viewportMargin;
    const availableAbove = triggerRect.top - gap - viewportMargin;
    const opensBelow = availableBelow >= Math.min(menuHeight, 176) || availableBelow >= availableAbove;
    const top = opensBelow ? triggerRect.bottom + gap : Math.max(viewportMargin, triggerRect.top - gap - menuHeight);
    const left = Math.min(Math.max(viewportMargin, triggerRect.right - menuWidth), window.innerWidth - menuWidth - viewportMargin);
    setInsertMenuPosition({ top, left, maxHeight: Math.max(120, opensBelow ? availableBelow : availableAbove) });
  }, []);

  useLayoutEffect(() => {
    if (!insertOpen) return;
    const frame = window.requestAnimationFrame(positionInsertMenu);
    return () => window.cancelAnimationFrame(frame);
  }, [insertOpen, positionInsertMenu]);

  useEffect(() => {
    if (!insertOpen) return;
    function reposition() { positionInsertMenu(); }
    function dismiss(event: PointerEvent) {
      const target = event.target as globalThis.Node;
      if (!insertMenuRef.current?.contains(target) && !insertTriggerRef.current?.contains(target)) setInsertOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setInsertOpen(false);
      insertTriggerRef.current?.focus();
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    globalThis.document.addEventListener("pointerdown", dismiss);
    globalThis.document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      globalThis.document.removeEventListener("pointerdown", dismiss);
      globalThis.document.removeEventListener("keydown", closeOnEscape);
    };
  }, [insertOpen, positionInsertMenu]);
  useEffect(() => {
    if (!insertOpen || !insertMenuPosition) return;
    const frame = window.requestAnimationFrame(() => insertMenuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [insertMenuPosition, insertOpen]);
  const context = useMemo(() => ({ attachments: new Map(attachments.map((item) => [item.id, item])), onRemove: onRemoveAttachment }), [attachments, onRemoveAttachment]);
  if (!editor) return <div role="status" className="note-editor-loading">Preparing editor…</div>;

  function applyLink() {
    if (!linkValue.trim()) { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); return; }
    const href = validateHttpUrl(linkValue);
    if (!href) { setLinkError("Enter a valid http:// or https:// address."); return; }
    editor?.chain().focus().extendMarkRange("link").setLink({ href }).run(); setLinkOpen(false); setLinkError("");
  }

  function toggleInsertMenu() {
    if (insertOpen) { setInsertOpen(false); return; }
    setInsertMenuPosition(null);
    setInsertOpen(true);
  }

  function handleInsertMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!insertMenuRef.current || !["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) return;
    const items = [...insertMenuRef.current.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = Math.max(0, items.indexOf(globalThis.document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? (currentIndex - 1 + items.length) % items.length : (currentIndex + 1) % items.length;
    items[nextIndex]?.focus();
  }

  return (
    <AttachmentContext.Provider value={context}>
      <div className="note-editor-shell">
        <div className="note-toolbar" role="toolbar" aria-label="Note formatting">
          <ToolButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></ToolButton>
          <ToolButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></ToolButton>
          <ToolButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolButton>
          <ToolButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolButton>
          <ToolButton label="Highlight" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>HL</ToolButton>
          {[1, 2, 3].map((level) => <ToolButton key={level} label={`Heading ${level}`} active={editor.isActive("heading", { level })} onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}>H{level}</ToolButton>)}
          <ToolButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</ToolButton>
          <ToolButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</ToolButton>
          <ToolButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>☐</ToolButton>
          <ToolButton label="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>“”</ToolButton>
          <ToolButton label="Link" active={editor.isActive("link")} onClick={() => { setLinkValue(editor.getAttributes("link").href ?? ""); setLinkOpen(true); }}>Link</ToolButton>
          <ToolButton label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}>↶</ToolButton>
          <ToolButton label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolButton>
          <button ref={insertTriggerRef} type="button" aria-label="Insert" title="Insert" aria-expanded={insertOpen} aria-haspopup="menu" onClick={toggleInsertMenu} className={`note-toolbar-button ${insertOpen ? "is-active" : ""}`}>+</button>
        </div>
        {insertOpen && insertMenuPosition && typeof globalThis.document !== "undefined" && createPortal(<div ref={insertMenuRef} className="note-insert-menu" role="menu" aria-label="Insert into note" onKeyDown={handleInsertMenuKeyDown} style={{ "--note-insert-top": `${insertMenuPosition.top}px`, "--note-insert-left": `${insertMenuPosition.left}px`, "--note-insert-max-height": `${insertMenuPosition.maxHeight}px` } as CSSProperties}><button type="button" role="menuitem" onClick={() => { setInsertOpen(false); imageInputRef.current?.click(); }}><InsertActionIcon kind="photo" />Photo</button><button type="button" role="menuitem" onClick={() => { setInsertOpen(false); onRecordVoice(); }}><InsertActionIcon kind="voice" />Voice</button><button type="button" role="menuitem" onClick={() => { setInsertOpen(false); fileInputRef.current?.click(); }}><InsertActionIcon kind="file" />File</button><button type="button" role="menuitem" onClick={() => { setInsertOpen(false); editor.chain().focus().setHorizontalRule().run(); }}><InsertActionIcon kind="divider" />Divider</button></div>, globalThis.document.body)}
        {linkOpen && <div className="note-link-editor" role="group" aria-label="Edit link"><label className="sr-only" htmlFor="note-link-url">Link address</label><input id="note-link-url" type="url" value={linkValue} onChange={(event) => { setLinkValue(event.target.value); setLinkError(""); }} placeholder="https://example.com" autoFocus /><button type="button" onClick={applyLink}>Apply</button><button type="button" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); }}>Remove</button><button type="button" onClick={() => setLinkOpen(false)}>Cancel</button>{linkError && <p role="alert">{linkError}</p>}</div>}
        <EditorContent editor={editor} className="note-editor-content" />
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUploadImage(file); }} />
        <input ref={fileInputRef} type="file" accept={acceptedFileInputTypes} hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onUploadFile(file); }} />
      </div>
    </AttachmentContext.Provider>
  );
}

export default NoteRichTextEditor;
