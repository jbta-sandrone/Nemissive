import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ProfileSearchResult } from "../../types/conversations";
import AnchoredPopover from "./AnchoredPopover";
import ConversationContentBrowser from "./ConversationContentBrowser";
import ConversationDeleteDialog from "./ConversationDeleteDialog";
import ConversationDisconnectDialog from "./ConversationDisconnectDialog";
import ConversationNicknameDialog from "./ConversationNicknameDialog";
import ConversationProfileDrawer from "./ConversationProfileDrawer";
import ConversationThemeDialog from "./ConversationThemeDialog";
import UserBlockDialog from "./UserBlockDialog";
import type { ConversationThemeId } from "./conversationThemes";

type Props = {
  conversationId: string;
  conversationName: string;
  profile: ProfileSearchResult;
  profilePresenceText: string | null;
  isProfileOnline: boolean;
  isArchived: boolean;
  isBlocked: boolean;
  isDeleted: boolean;
  messagingAvailable: boolean;
  isConnected: boolean;
  nicknamesByUserId: ReadonlyMap<string, string>;
  participants: ProfileSearchResult[];
  currentTheme: ConversationThemeId;
  onArchivedChange: (archived: boolean) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onDisconnect: () => Promise<string | null>;
  onNicknameSave: (userId: string, nickname: string | null) => Promise<string | null>;
  onThemeApply: (theme: ConversationThemeId) => Promise<string | null>;
  onContentJump: (messageId: string) => void;
  onUserBlockChange: (blocked: boolean) => Promise<string | null>;
};

const iconClass = "h-4 w-4";
const icons = {
  profile: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></svg>,
  nickname: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M5 5h14v10H9l-4 4V5Z" /><path d="M9 9h6" /></svg>,
  theme: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10h-4Z" /></svg>,
  content: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m7 16 4-4 3 3 2-2 2 3" /><circle cx="15.5" cy="9" r="1" /></svg>,
  archive: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M5 8.5h14v10H5v-10ZM4 5h16v3.5H4V5Zm5 7h6" /></svg>,
  delete: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" /></svg>,
  disconnect: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M8.5 8.5 5 12l3.5 3.5M15.5 8.5 19 12l-3.5 3.5M5 12h14" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  block: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m6.5 6.5 11 11" /></svg>,
  report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClass} aria-hidden="true"><path d="M6 21V4m0 1h11l-2 4 2 4H6" /></svg>,
};

function Icon({ children }: { children: ReactNode }) { return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">{children}</span>; }
function Item({ label, icon, onClick, disabled, destructive = false, autofocus = false }: { label: string; icon: ReactNode; onClick?: () => void; disabled?: boolean; destructive?: boolean; autofocus?: boolean }) {
  return <button data-autofocus={autofocus || undefined} type="button" role="menuitem" onClick={onClick} disabled={disabled} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50 ${destructive ? "text-primary hover:bg-accent" : "text-heading hover:bg-accent"}`}><Icon>{icon}</Icon>{label}</button>;
}
function FutureItem({ label, icon }: { label: string; icon: ReactNode }) { return <button type="button" role="menuitem" disabled aria-disabled="true" aria-label={`${label}, coming soon`} className="flex min-h-11 w-full cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted opacity-70"><Icon>{icon}</Icon><span className="min-w-0 flex-1 font-semibold">{label}</span><span aria-hidden="true" className="rounded-lg bg-background px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wide">Coming soon</span></button>; }

function MobileOptions({ triggerRef, children, onClose }: { triggerRef: RefObject<HTMLButtonElement | null>; children: ReactNode; onClose: () => void }) {
  const reduceMotion = useReducedMotion(); const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.body.style.overflow; const returnFocus = triggerRef.current; document.body.style.overflow = "hidden"; const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus()); function keydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); onClose(); return; } if (event.key !== "Tab" || !panelRef.current) return; const controls = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])")]; const first = controls[0]; const last = controls.at(-1); if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } } document.addEventListener("keydown", keydown); return () => { cancelAnimationFrame(frame); document.body.style.overflow = previous; document.removeEventListener("keydown", keydown); requestAnimationFrame(() => returnFocus?.focus()); }; }, [onClose, triggerRef]);
  return createPortal(<motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] flex items-end bg-heading/20 md:hidden" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><motion.div ref={panelRef} initial={reduceMotion ? false : { y: "100%" }} animate={{ y: 0 }} exit={reduceMotion ? { opacity: 0 } : { y: "100%" }} role="dialog" aria-modal="true" aria-labelledby="conversation-options-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-soft"><div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" /><div className="mb-3 flex items-center justify-between"><h2 id="conversation-options-title" className="text-lg font-semibold text-heading">Conversation options</h2><button type="button" onClick={onClose} aria-label="Close conversation options" className="h-10 w-10 rounded-xl text-muted hover:bg-accent">×</button></div>{children}</motion.div></motion.div>, document.body);
}

function ConversationOptionsMenu({ conversationId, conversationName, profile, profilePresenceText, isProfileOnline, isArchived, isBlocked, isDeleted, messagingAvailable, isConnected, nicknamesByUserId, participants, currentTheme, onArchivedChange, onDelete, onDisconnect, onNicknameSave, onThemeApply, onContentJump, onUserBlockChange }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null); const blockReturnFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false); const [desktop, setDesktop] = useState(() => matchMedia("(min-width: 768px)").matches); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false); const [nicknamesOpen, setNicknamesOpen] = useState(false); const [themeOpen, setThemeOpen] = useState(false); const [contentOpen, setContentOpen] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false); const [deleting, setDeleting] = useState(false); const [deleteError, setDeleteError] = useState("");
  const [disconnectOpen, setDisconnectOpen] = useState(false); const [disconnecting, setDisconnecting] = useState(false); const [disconnectError, setDisconnectError] = useState("");
  const [blockOpen, setBlockOpen] = useState(false); const [blockSaving, setBlockSaving] = useState(false); const [blockError, setBlockError] = useState("");
  useEffect(() => { const query = matchMedia("(min-width: 768px)"); const update = () => setDesktop(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  async function archive() { if (saving) return; setSaving(true); setError(""); const nextError = await onArchivedChange(!isArchived); setSaving(false); if (nextError) setError(nextError); else setOpen(false); }
  async function confirmDelete() { if (deleting) return; setDeleting(true); setDeleteError(""); const nextError = await onDelete(); setDeleting(false); if (nextError) setDeleteError(nextError); else setDeleteOpen(false); }
  async function confirmDisconnect() { if (disconnecting) return; setDisconnecting(true); setDisconnectError(""); const nextError = await onDisconnect(); setDisconnecting(false); if (nextError) setDisconnectError(nextError); else setDisconnectOpen(false); }
  async function confirmBlock() { if (blockSaving) return; setBlockSaving(true); setBlockError(""); const nextError = await onUserBlockChange(!isBlocked); setBlockSaving(false); if (nextError) setBlockError(nextError); else setBlockOpen(false); }
  function openBlockDialog() { blockReturnFocusRef.current = triggerRef.current; setOpen(false); setProfileOpen(false); setBlockError(""); setBlockOpen(true); }
  const content = <><div role="menu" className="space-y-1">{!isDeleted && <Item autofocus label="View profile" icon={icons.profile} onClick={() => { setOpen(false); setProfileOpen(true); }} disabled={saving} />}<Item label="Edit nicknames" icon={icons.nickname} onClick={() => { setOpen(false); setNicknamesOpen(true); }} disabled={saving || !messagingAvailable} /><Item label="Change theme" icon={icons.theme} onClick={() => { setOpen(false); setThemeOpen(true); }} disabled={saving || !messagingAvailable} /><Item autofocus={isDeleted} label="Media, files & links" icon={icons.content} onClick={() => { setOpen(false); setContentOpen(true); }} disabled={saving} /><div role="separator" className="my-2 border-t border-border" /><Item label={isArchived ? "Unarchive conversation" : "Archive conversation"} icon={icons.archive} onClick={() => void archive()} disabled={saving} /><Item label="Delete chat" icon={icons.delete} onClick={() => { setOpen(false); setDeleteOpen(true); }} disabled={saving} destructive />{isConnected && <Item label={`Disconnect from ${conversationName}`} icon={icons.disconnect} onClick={() => { setOpen(false); setDisconnectError(""); setDisconnectOpen(true); }} disabled={saving} destructive />}{!isDeleted && <><div role="separator" className="my-2 border-t border-border" /><Item label={`${isBlocked ? "Unblock" : "Block"} ${conversationName}`} icon={icons.block} onClick={openBlockDialog} disabled={saving} destructive={!isBlocked} /><FutureItem label={`Report ${conversationName}`} icon={icons.report} /></>}</div>{saving && <p role="status" className="px-3 pt-2 text-xs text-muted">Saving…</p>}{error && <p role="alert" className="mt-2 rounded-xl bg-accent px-3 py-2 text-xs text-body">{error}</p>}</>;
  return <><button ref={triggerRef} type="button" aria-label="Conversation options" title="Conversation options" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`chat-header-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-hover ${open ? "chat-header-control-active border-primary/25 bg-accent text-primary" : "border-border bg-background text-muted hover:bg-accent hover:text-heading"}`}><svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg></button><AnimatePresence>{open && (desktop ? <AnchoredPopover anchorRef={triggerRef} ariaLabel="Conversation options" placement="bottom" onClose={() => setOpen(false)} panelClassName="max-h-[min(42rem,calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-3xl border border-border bg-surface p-3 shadow-soft"><h2 className="px-3 pb-2 text-base font-semibold text-heading">Conversation options</h2>{content}</AnchoredPopover> : <MobileOptions triggerRef={triggerRef} onClose={() => setOpen(false)}>{content}</MobileOptions>)}</AnimatePresence><AnimatePresence>{profileOpen && <ConversationProfileDrawer conversationId={conversationId} profile={profile} conversationNickname={nicknamesByUserId.get(profile.id) ?? null} currentTheme={currentTheme} presenceText={profilePresenceText} isOnline={isProfileOnline} isBlocked={isBlocked} messagingAvailable={messagingAvailable} returnFocusRef={triggerRef} onClose={() => setProfileOpen(false)} onEditNicknames={() => { setProfileOpen(false); setNicknamesOpen(true); }} onChangeTheme={() => { setProfileOpen(false); setThemeOpen(true); }} onOpenContent={() => { setProfileOpen(false); setContentOpen(true); }} onBlockChange={openBlockDialog} />}{nicknamesOpen && <ConversationNicknameDialog nicknamesByUserId={nicknamesByUserId} participants={participants} returnFocusRef={triggerRef} onClose={() => setNicknamesOpen(false)} onSave={onNicknameSave} />}{themeOpen && <ConversationThemeDialog currentTheme={currentTheme} returnFocusRef={triggerRef} onClose={() => setThemeOpen(false)} onApply={onThemeApply} />}{contentOpen && <ConversationContentBrowser conversationId={conversationId} participants={participants} returnFocusRef={triggerRef} onClose={() => setContentOpen(false)} onJump={onContentJump} />}{deleteOpen && <ConversationDeleteDialog conversationName={conversationName} error={deleteError} isDeleting={deleting} returnFocusRef={triggerRef} onCancel={() => setDeleteOpen(false)} onConfirm={() => void confirmDelete()} />}{disconnectOpen && <ConversationDisconnectDialog conversationName={conversationName} error={disconnectError} isDisconnecting={disconnecting} returnFocusRef={triggerRef} onCancel={() => setDisconnectOpen(false)} onConfirm={() => void confirmDisconnect()} />}{blockOpen && <UserBlockDialog blocked={!isBlocked} displayName={conversationName} error={blockError} isSaving={blockSaving} returnFocusRef={blockReturnFocusRef} onCancel={() => setBlockOpen(false)} onConfirm={() => void confirmBlock()} />}</AnimatePresence></>;
}

export default ConversationOptionsMenu;
