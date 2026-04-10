export type ClassValue =
  | string
  | number
  | null
  | false
  | undefined
  | ClassValue[]
  | Record<string, unknown>;

const toClassName = (input: ClassValue): string[] => {
  if (!input) {
    return [];
  }

  if (typeof input === "string" || typeof input === "number") {
    return [String(input)];
  }

  if (Array.isArray(input)) {
    return input.flatMap((item) => toClassName(item));
  }

  if (typeof input === "object") {
    return Object.entries(input)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key);
  }

  return [];
};

export const cn = (...inputs: ClassValue[]): string => {
  return inputs.flatMap((input) => toClassName(input)).join(" ");
};
