type ConversationItemProps = {
  name: string;
  preview: string;
  time?: string;
  isOnline?: boolean;
  isActive?: boolean;
};

function ConversationItem({
  name,
  preview,
  time,
  isOnline = false,
  isActive = false,
}: ConversationItemProps) {
  const initial = name.charAt(0).toUpperCase();
  const stateClasses = isActive ? "bg-accent shadow-soft" : "hover:-translate-y-0.5 hover:bg-accent hover:shadow-soft";

  return (
    <button type="button" className={`group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-200 ${stateClasses}`}>
      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-surface bg-primary font-semibold text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
          {initial}
        </div>
  
        {isOnline && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-online" />
        )}
      </div>
  
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-semibold text-heading">{name}</p>
  
          {time && (
            <span className="max-w-20 shrink-0 truncate text-right text-xs text-muted">{time}</span>
          )}
        </div>
  
        <p className="mt-1 truncate text-sm leading-5 text-body">{preview}</p>
      </div>
    </button>
  );
}

export default ConversationItem;
