import { useState, type ComponentProps } from "react";

type BufferedTextInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "onBlur"
> & {
  value: string;
  onValue: (value: string) => void;
};

export function visibleTextInputValue(
  authoritativeValue: string,
  editingValue: string | null,
): string {
  return editingValue ?? authoritativeValue;
}

export function BufferedTextInput({
  value,
  onValue,
  ...props
}: BufferedTextInputProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);

  return (
    <input
      {...props}
      value={visibleTextInputValue(value, editingValue)}
      onChange={(event) => {
        const next = event.target.value;
        setEditingValue(next);
        onValue(next);
      }}
      onBlur={() => {
        if (editingValue === null) return;
        const committed = editingValue.trim();
        setEditingValue(null);
        if (committed !== value) onValue(committed);
      }}
    />
  );
}
