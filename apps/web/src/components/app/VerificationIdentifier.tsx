/** Preserve the complete value while allowing even unbroken hashes to fit narrow cards. */
export function VerificationIdentifier({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0 max-w-full">
      <span>{label}: </span>
      <span className="font-mono text-[11px] leading-5" style={{ overflowWrap: "anywhere", whiteSpace: "normal" }}>
        {value ?? "-"}
      </span>
    </div>
  );
}
