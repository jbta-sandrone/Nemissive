export type EliteComparisonPlan = {
  id: "free" | "elite";
  productName: string;
  tierLabel: "Free" | "Premium";
  description: string;
  benefitsHeading: string;
  benefits: readonly string[];
};

export const eliteComparisonPlans: readonly EliteComparisonPlan[] = [
  {
    id: "free",
    productName: "Nemissive",
    tierLabel: "Free",
    description: "A complete experience for meaningful conversations and everyday personal tools.",
    benefitsHeading: "Core Nemissive experience",
    benefits: [
      "Messaging",
      "Notes, Gallery, and Reminders",
      "Standard profile personalization",
      "Standard sharing and capability limits",
    ],
  },
  {
    id: "elite",
    productName: "Nemissive Elite",
    tierLabel: "Premium",
    description: "Everything in Nemissive, with more room for personalization, expression, privacy, and AI.",
    benefitsHeading: "Planned Elite benefits",
    benefits: [
      "Premium conversation themes",
      "Profile and avatar designs",
      "More status, reaction, and sticker options",
      "Expanded media limits",
      "Enhanced privacy controls",
      "Expanded AI capabilities and higher models",
    ],
  },
];
