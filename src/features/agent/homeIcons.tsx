/**
 * Two icons lucide-react (0.454) does not have, drawn as in the owner's
 * mockups (#370): the standard restroom pictogram (never "WC") and the
 * stairs-and-arrow "find exit" sign. Everything else on the home uses lucide.
 */
export function RestroomIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="7" cy="4" r="2" />
      <path d="M5 7h4l1 7H8.5v7h-3v-7H4l1-7Z" />
      <circle cx="17" cy="4" r="2" />
      <path d="M15.2 7h3.6l2.2 8h-2.5v6h-3v-6H13l2.2-8Z" />
      <rect x="11.5" y="3" width="1" height="18" opacity="0.5" />
    </svg>
  );
}

export function ExitStairsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M4 20h5v-5h5v-5h6" />
      <path d="m17 7 3 3-3 3" />
    </svg>
  );
}
