import { useMemo, useState } from "react";

type UserProfile = {
  id: number;
  displayName: string;
  username: string;
  status: string;
};

type NewConversationModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const sampleUsers: UserProfile[] = [
  {
    id: 1,
    displayName: "Alex Rivera",
    username: "alex",
    status: "Available",
  },
  {
    id: 2,
    displayName: "Sarah Chen",
    username: "sarah",
    status: "Working on a project",
  },
  {
    id: 3,
    displayName: "Michael Santos",
    username: "michael",
    status: "Available",
  },
  {
    id: 4,
    displayName: "Jamie Cruz",
    username: "jamie",
    status: "Away",
  },
];

function NewConversationModal({
  isOpen,
  onClose,
}: NewConversationModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return sampleUsers;
    }

    return sampleUsers.filter((user) => {
      return (
        user.displayName.toLowerCase().includes(normalizedQuery) ||
        user.username.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [searchQuery]);

  function handleClose() {
    setSearchQuery("");
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-heading/30 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={handleClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-soft sm:max-h-[min(620px,90dvh)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2
              id="new-conversation-title"
              className="text-xl font-bold tracking-tight text-heading"
            >
              New conversation
            </h2>

            <p className="mt-1 text-sm text-body">
              Find another Nemissive user to message.
            </p>
          </div>

          <button
            type="button"
            aria-label="Close new conversation"
            onClick={handleClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xl text-muted transition hover:bg-accent hover:text-heading"
          >
            ×
          </button>
        </header>

        <div className="shrink-0 px-4 py-4 sm:px-6 sm:py-5">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>

          <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 focus-within:border-primary focus-within:bg-white focus-within:ring-4 focus-within:ring-accent-hover">
            <span aria-hidden="true" className="text-muted">
              🔍
            </span>

            <input
              id="user-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name or username..."
              autoFocus
              className="min-w-0 flex-1 bg-transparent py-3 text-sm text-heading outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 sm:px-3 sm:pb-4">
          {filteredUsers.length > 0 ? (
            <div className="space-y-1">
              {filteredUsers.map((user) => {
                const initial = user.displayName.charAt(0).toUpperCase();

                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      console.log("Selected user:", user);
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-accent"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-primary">
                      {initial}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-heading">
                        {user.displayName}
                      </p>

                      <p className="mt-0.5 truncate text-sm text-body">
                        @{user.username} · {user.status}
                      </p>
                    </div>

                    <span
                      aria-hidden="true"
                      className="text-xl text-muted"
                    >
                      ›
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-2xl">
                🔍
              </div>

              <h3 className="mt-4 font-semibold text-heading">
                No users found
              </h3>

              <p className="mt-1 text-sm text-body">
                Try searching with another name or username.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default NewConversationModal;
