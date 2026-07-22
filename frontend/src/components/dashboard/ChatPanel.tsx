type ChatPanelProps = {
  onStartConversation?: () => void;
};

function ChatPanel({ onStartConversation }: ChatPanelProps) {
  return (
    <main className="hidden min-w-0 flex-1 items-center justify-center overflow-hidden bg-background p-6 md:flex lg:p-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-4xl shadow-soft lg:h-24 lg:w-24 lg:text-5xl">
            💬
        </div>
  
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-heading lg:mt-8 lg:text-3xl">
            Welcome to Nemissive
        </h1>
  
        <p className="mt-4 text-base leading-7 text-body">
            Every meaningful conversation starts with a hello.
        </p>
  
        <p className="mt-2 text-base leading-7 text-body">
            Choose someone from the left or start a new conversation.
        </p>
  
        <button
          type="button"
          onClick={onStartConversation}
          className="mt-8 inline-flex items-center rounded-2xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-lg lg:mt-10"
        >
          Start Conversation
        </button>
      </div>
    </main>
  );
}

export default ChatPanel;
