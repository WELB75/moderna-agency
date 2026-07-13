export function Monogram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="47" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="50" cy="50" r="41" stroke="currentColor" strokeWidth="0.5" />
      <path
        d="M27 63V37L38.5 55L50 37V63"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <path
        d="M54 63L64.5 37L75 63M58.4 52H70.6"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
