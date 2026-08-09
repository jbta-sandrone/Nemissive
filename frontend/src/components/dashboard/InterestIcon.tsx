import type { InterestIconName } from "./profileInterests";

function InterestIcon({ icon, className = "h-4 w-4" }: { icon: InterestIconName; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, className, "aria-hidden": true } as const;

  if (icon === "gamepad") return <svg {...common}><path d="M7.5 8h9a4 4 0 0 1 3.8 5.2l-1.1 3.2a2.2 2.2 0 0 1-3.7.8L13.7 15h-3.4l-1.8 2.2a2.2 2.2 0 0 1-3.7-.8l-1.1-3.2A4 4 0 0 1 7.5 8Z" /><path d="M8 11v4M6 13h4M16.5 11.8h.01M18 14h.01" strokeLinecap="round" /></svg>;
  if (icon === "code") return <svg {...common}><path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5l-3 14" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (icon === "music") return <svg {...common}><path d="M9 18V6l9-2v12M9 9l9-2" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="15.5" cy="16" r="2.5" /></svg>;
  if (icon === "film") return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M8 5v14M16 5v14M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5" /></svg>;
  if (icon === "sparkles") return <svg {...common}><path d="m12 3 1.3 4.2L17.5 9l-4.2 1.8L12 15l-1.3-4.2L6.5 9l4.2-1.8L12 3ZM18.5 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3ZM5 13l.6 1.8 1.9.7-1.9.7L5 18l-.6-1.8-1.9-.7 1.9-.7L5 13Z" strokeLinejoin="round" /></svg>;
  if (icon === "book") return <svg {...common}><path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v15H7.5A3.5 3.5 0 0 0 4 20.5v-15ZM20 5.5A3.5 3.5 0 0 0 16.5 4H13v15h3.5a3.5 3.5 0 0 1 3.5 1.5v-15Z" strokeLinejoin="round" /></svg>;
  if (icon === "plane") return <svg {...common}><path d="m21 15-8-3V5.5a1.5 1.5 0 0 0-3 0V12l-7 3v2l7-1v3l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-3l8 1v-2Z" strokeLinejoin="round" /></svg>;
  if (icon === "camera") return <svg {...common}><path d="M4 7.5h3l1.5-2h7l1.5 2h3v11H4v-11Z" strokeLinejoin="round" /><circle cx="12" cy="13" r="3.5" /></svg>;
  if (icon === "dumbbell") return <svg {...common}><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10M2.5 10v4M21.5 10v4" strokeLinecap="round" /></svg>;
  if (icon === "trophy") return <svg {...common}><path d="M7 4h10v4a5 5 0 0 1-10 0V4ZM9 18h6M12 13v5M7 6H4v1a4 4 0 0 0 4 4M17 6h3v1a4 4 0 0 1-4 4M7 21h10" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (icon === "motorcycle") return <svg {...common}><circle cx="6" cy="16" r="3" /><circle cx="18" cy="16" r="3" /><path d="m6 16 4-6h4l4 6M10 10l-2-2M13 16H9l3-6M15 8h3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (icon === "car") return <svg {...common}><path d="m5 10 2-4h10l2 4 1.5 1.5V17h-17v-5.5L5 10Z" strokeLinejoin="round" /><path d="M6.5 17v2M17.5 17v2M6 13h.01M18 13h.01M5 10h14" strokeLinecap="round" /></svg>;
  if (icon === "palette") return <svg {...common}><path d="M12 3a9 9 0 1 0 0 18h1.2a1.8 1.8 0 0 0 1.2-3.1 1.7 1.7 0 0 1 1.2-3h2.1A3.3 3.3 0 0 0 21 11.6 9 9 0 0 0 12 3Z" /><path d="M7.5 10h.01M10 6.5h.01M15 7h.01M6.5 14h.01" strokeLinecap="round" /></svg>;
  if (icon === "cooking") return <svg {...common}><path d="M5 10h14v2a7 7 0 0 1-14 0v-2ZM8 20h8M12 17v3M7 7c0-1 1-1.5 1-2.5M12 7c0-1 1-1.5 1-2.5M17 7c0-1 1-1.5 1-2.5" strokeLinecap="round" /></svg>;
  if (icon === "coffee") return <svg {...common}><path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 5c0-1 1-1.5 1-2.5M13 5c0-1 1-1.5 1-2.5" strokeLinecap="round" /></svg>;
  if (icon === "shirt") return <svg {...common}><path d="m8 4-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4.5 4.5 0 0 1-8 0Z" strokeLinejoin="round" /></svg>;
  if (icon === "paw") return <svg {...common}><ellipse cx="12" cy="15.5" rx="4.5" ry="3.5" /><circle cx="6.5" cy="11" r="1.7" /><circle cx="9" cy="6.8" r="1.7" /><circle cx="15" cy="6.8" r="1.7" /><circle cx="17.5" cy="11" r="1.7" /></svg>;
  if (icon === "leaf") return <svg {...common}><path d="M20 4C11 4 5 8 5 14a5 5 0 0 0 5 5c6 0 10-6 10-15Z" /><path d="M4 20c3-5 7-8 12-11" strokeLinecap="round" /></svg>;
  if (icon === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2" strokeLinejoin="round" /></svg>;
  if (icon === "video") return <svg {...common}><rect x="3.5" y="6" width="13" height="12" rx="2" /><path d="m16.5 10 4-2v8l-4-2v-4Z" strokeLinejoin="round" /><path d="M7 10h6M7 14h4" strokeLinecap="round" /></svg>;
  if (icon === "esports") return <svg {...common}><path d="M7 6h10l2 4-2 8-5-3-5 3-2-8 2-4Z" strokeLinejoin="round" /><path d="M8 10v3M6.5 11.5h3M15.5 10.5h.01M17 12.5h.01" strokeLinecap="round" /></svg>;
  if (icon === "podcast") return <svg {...common}><circle cx="12" cy="10" r="2.5" /><path d="M8.5 15a5 5 0 1 1 7 0M6 18a8.5 8.5 0 1 1 12 0M10 14l-1 7h6l-1-7" strokeLinecap="round" /></svg>;
  if (icon === "dancing") return <svg {...common}><circle cx="14" cy="4.5" r="2" /><path d="m12 8 3 3 3-1M12 8l-3 4-4 1M13.5 11.5 11 16l-4 4M14 13l3 3 1 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg {...common}><path d="M12 20S4 15.5 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5C20 15.5 12 20 12 20Z" strokeLinejoin="round" /><path d="m8.5 15-2 2M15.5 15l2 2" strokeLinecap="round" /></svg>;
}

export default InterestIcon;
