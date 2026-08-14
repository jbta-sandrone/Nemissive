export type PasswordStrength = "Weak" | "Fair" | "Strong" | "Very strong";

export type PasswordPolicyRules = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
  notCommon: boolean;
};

export type PasswordRuleKey = keyof PasswordPolicyRules;

export const PASSWORD_REQUIREMENTS: ReadonlyArray<{ key: PasswordRuleKey; label: string }> = [
  { key: "minLength", label: "12+ characters" },
  { key: "uppercase", label: "Uppercase letter" },
  { key: "lowercase", label: "Lowercase letter" },
  { key: "number", label: "Number" },
  { key: "special", label: "Special character" },
  { key: "notCommon", label: "Not a common password" },
];

export type PasswordPolicyResult = {
  valid: boolean;
  strength: PasswordStrength;
  rules: PasswordPolicyRules;
};

const commonPasswords = new Set([
  "password",
  "password123",
  "password123!",
  "123456789",
  "qwerty123",
  "qwerty123!",
  "admin123",
  "admin123!",
  "letmein",
  "welcome123",
  "welcome123!",
]);

export function validatePassword(password: string): PasswordPolicyResult {
  const rules = {
    minLength: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    notCommon: password.length > 0 && !commonPasswords.has(password.toLocaleLowerCase()),
  };
  const metCoreRules = [rules.minLength, rules.uppercase, rules.lowercase, rules.number, rules.special].filter(Boolean).length;
  let strength: PasswordStrength = "Weak";
  if (metCoreRules >= 4 && password.length >= 10) strength = "Fair";
  if (metCoreRules === 5 && rules.notCommon) strength = "Strong";
  if (metCoreRules === 5 && rules.notCommon && password.length >= 16 && new Set(password).size >= 10) strength = "Very strong";

  return {
    valid: Object.values(rules).every(Boolean),
    strength,
    rules,
  };
}
