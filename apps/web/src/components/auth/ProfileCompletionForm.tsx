import { AsYouType } from "libphonenumber-js";

export type ProfileCompletionFormValue = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type ProfileCompletionUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ProfileCompletionFormProps = {
  value: ProfileCompletionFormValue;
  onChange: (value: ProfileCompletionFormValue) => void;
  disabled?: boolean;
  lockedEmail?: boolean;
  lockedPhone?: boolean;
};

export const formatProfilePhoneInputValue = (value: string) => {
  const trimmed = value.trimStart();
  if (!trimmed) {
    return "";
  }

  return new AsYouType("US").input(trimmed);
};

export const createProfileCompletionFormValue = (
  user?: ProfileCompletionUser | null,
): ProfileCompletionFormValue => ({
  firstName: user?.firstName ?? "",
  lastName: user?.lastName ?? "",
  email: user?.email ?? "",
  phone: formatProfilePhoneInputValue(user?.phone ?? ""),
});

export default function ProfileCompletionForm({
  value,
  onChange,
  disabled = false,
  lockedEmail = false,
  lockedPhone = false,
}: ProfileCompletionFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium">First name</label>
          <input
            autoComplete="given-name"
            className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-70"
            disabled={disabled}
            onChange={(event) => onChange({ ...value, firstName: event.target.value })}
            required
            type="text"
            value={value.firstName}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium">Last name</label>
          <input
            autoComplete="family-name"
            className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-70"
            disabled={disabled}
            onChange={(event) => onChange({ ...value, lastName: event.target.value })}
            required
            type="text"
            value={value.lastName}
          />
        </div>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">Email</label>
        <input
          autoComplete="email"
          className={`w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-70 ${
            lockedEmail ? "bg-Color-Neutral-Lightest text-Color-Neutral" : ""
          }`}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, email: event.target.value })}
          readOnly={lockedEmail}
          required
          type="email"
          value={value.email}
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium">Phone number</label>
        <input
          autoComplete="tel"
          className={`w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-70 ${
            lockedPhone ? "bg-Color-Neutral-Lightest text-Color-Neutral" : ""
          }`}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, phone: formatProfilePhoneInputValue(event.target.value) })}
          placeholder="(555) 555-1234"
          readOnly={lockedPhone}
          required
          type="tel"
          value={value.phone}
        />
      </div>
    </div>
  );
}