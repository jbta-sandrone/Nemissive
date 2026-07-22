type UserCardProps = {
  displayName?: string;
  username?: string;
  isOnline?: boolean;
};

function UserCard({
  displayName = "Jonel Bryan",
  username = "jonel",
  isOnline = true,
}: UserCardProps) {
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="shrink-0 border-t border-border p-4">
      <button type="button" className="group flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-200 hover:bg-accent">
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary font-semibold text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
            {initial}
          </div>
  
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-online" />
          )}
        </div>
  
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-heading">{displayName}</p>
          <p className="mt-0.5 truncate text-sm text-body">{isOnline ? "Online" : `@${username}`}</p>
        </div>
  
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg text-muted transition-all duration-200 group-hover:bg-surface group-hover:text-heading">
            ⚙
        </div>
      </button>
    </div>
  );
}

export default UserCard;
