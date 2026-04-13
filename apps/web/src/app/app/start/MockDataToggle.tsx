"use client";

type MockDataToggleProps = {
  checked: boolean;
  disabled: boolean;
  onChange: (nextChecked: boolean) => void;
};

export function MockDataToggle({ checked, disabled, onChange }: MockDataToggleProps) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-medium text-Color-Neutral">
      <span>Use mock data</span>
      <input
        checked={checked}
        className="h-4 w-4 accent-Color-Scheme-1-Text"
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
