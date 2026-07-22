import ConversationItem from "./ConversationItem";

const sampleConversations = [
  {
    id: 1,
    name: "Alex Rivera",
    preview: "Working on something exciting 🚀",
    time: "9:42 AM",
    isOnline: true,
    isActive: true,
  },
  {
    id: 2,
    name: "Sarah Chen",
    preview: "Available for a quick conversation",
    time: "Yesterday",
    isOnline: true,
  },
  {
    id: 3,
    name: "Michael Santos",
    preview: "Building one step at a time",
    time: "Monday",
  },
];

function ConversationList() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
      <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        Messages
      </p>

      <div className="space-y-1">
        {sampleConversations.map((conversation) => (
          <ConversationItem key={conversation.id} {...conversation} />
        ))}
      </div>
    </div>
  );
}

export default ConversationList;