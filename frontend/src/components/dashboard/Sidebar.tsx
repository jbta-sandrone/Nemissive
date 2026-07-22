import ConversationList from "./ConversationList";
import UserCard from "./UserCard";

type SidebarProps = {
  onNewConversation: () => void;
};

function Sidebar({ onNewConversation }: SidebarProps) {
  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:w-80 md:min-w-80 lg:w-96 lg:min-w-96">
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 pb-5 pt-6 sm:px-6 sm:pb-6 sm:pt-7 md:px-5 lg:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-heading">
            Nemissive
          </h1>

          <p className="mt-2 max-w-[250px] text-sm leading-6 text-body">
            Made for meaningful conversations.
          </p>
        </div>

        <button
          type="button"
          aria-label="Start a new conversation"
          onClick={onNewConversation}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl font-light text-white shadow-soft transition-all duration-200 hover:-translate-y-1 hover:bg-primary-hover hover:shadow-lg active:translate-y-0"
        >
          +
        </button>
      </header>

      <div className="shrink-0 px-4 pb-5 sm:px-5">
        <label htmlFor="conversation-search" className="sr-only">
          Search conversations
        </label>

        <input
          id="conversation-search"
          type="search"
          placeholder="Search people or messages..."
          className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm text-heading outline-none transition placeholder:text-muted focus:border-primary focus:bg-white focus:ring-4 focus:ring-accent-hover"
        />
      </div>

      <ConversationList />

      <UserCard />
    </aside>
  );
}

export default Sidebar;
