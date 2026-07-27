import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { registerBufferedEdit, type BufferedEditEnding } from "./document-exit";

/**
 * What a field does with an edit that ends empty.
 *
 * `true` on fields whose commit policy has no representation for "empty" — a
 * category name, an expense group, a percentage that would silently become 0.
 * `false` (the default) on the money fields, where empty is a real value the
 * reader can see and correct: it means zero.
 *
 * `"document-end"` is the middle policy, and exactly one field wants it.
 * "Starting savings" is the only place where empty means *unset* and unset is
 * unrecoverable — it is the anchor every projection on the screen is measured
 * from, with no undo and no notice. Clearing it and then blurring, pressing
 * Return or navigating away are endings the reader performed, and they mean
 * what they say. Clearing it and then having the document torn down is not: an
 * empty box is indistinguishable from a reader who selected-all, was
 * interrupted, and pulled to refresh, and refusing costs them one extra tap
 * where accepting costs them a balance they may not be able to reconstruct.
 */
export type EmptyCommitPolicy = boolean | "document-end";

/** Whether this ending is one where the field refuses to commit an empty box. */
export function refusesEmptyCommit(
  policy: EmptyCommitPolicy,
  ending: BufferedEditEnding,
): boolean {
  return policy === true || policy === ending;
}

type BufferedTextInputProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "onBlur"
> & {
  value: string;
  onValue: (value: string) => void;
  /**
   * See `EmptyCommitPolicy`. It says nothing about typing: the box goes blank
   * on every field, on every keystroke, because the box shows the buffer and
   * the buffer is whatever the browser reported.
   */
  restoreOnEmpty?: EmptyCommitPolicy;
};

export function visibleTextInputValue(
  authoritativeValue: string,
  editingValue: string | null,
): string {
  return editingValue ?? authoritativeValue;
}

/** Whether a finished edit's value is one this field is allowed to persist. */
export function forwardsTextInputValue(
  value: string,
  restoreOnEmpty: boolean,
): boolean {
  return !restoreOnEmpty || value.trim() !== "";
}

/**
 * What a finished edit hands the persistence layer, or `null` when it has
 * nothing to say: no edit was open, the value is one this field refuses, or it
 * is what the field already held.
 */
export function committedTextInputValue(
  editingValue: string | null,
  authoritativeValue: string,
  restoreOnEmpty: boolean,
): string | null {
  if (editingValue === null) return null;
  const committed = editingValue.trim();
  if (!forwardsTextInputValue(committed, restoreOnEmpty)) return null;
  return committed === authoritativeValue ? null : committed;
}

/**
 * A text field that keeps the whole edit to itself and commits it **once**, at
 * the end.
 *
 * It used to forward every keystroke. Backspacing "Groceries" away therefore
 * wrote — and synced — "Grocerie", "Groceri", … "G", and a later restore-on-blur
 * only undid the damage *if a blur happened*. On the shipping target, an iPhone
 * PWA that is relaunched, purged and pull-to-refreshed constantly, it routinely
 * did not: a reload left "G" on the server permanently, the iOS keyboard's
 * Return does not blur, and on "Starting savings" — which cannot use the
 * restore, because empty is a value there — $28,500 became $2.00 and the header
 * read "Device save failed".
 *
 * So nothing travels mid-edit. `editingValue` is the buffer, the box renders
 * the buffer, and the authoritative `value` is frozen for the duration, which
 * also means no keystroke can be swallowed by a re-render (a `type=number`
 * reporting `""` for the intermediate `"12."` is just another buffer state) and
 * a mid-edit crash can no longer leave "Groc" behind on *any* rename.
 *
 * `commit` is idempotent — it empties the buffer first — so the exits below may
 * overlap freely, and every one of them is covered because an edit that ends
 * anywhere else would be silently lost. Blur, Return/Done and unmount are here;
 * the two document-level endings, and the ordering between committing a buffer
 * and flushing what it produced, live in `document-exit`.
 */
export function BufferedTextInput({
  value,
  onValue,
  restoreOnEmpty = false,
  ...props
}: BufferedTextInputProps) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  /**
   * Everything `commit` needs. The unmount and document-level exits fire from
   * closures wired up earlier, so they read the edit as it stands rather than
   * as it was when they were attached. The buffer is written here by the
   * keystroke itself, not by the effect below, so no exit can ever see a
   * keystroke older than the one on screen.
   */
  const session = useRef({ value, onValue, restoreOnEmpty, editingValue });
  useEffect(() => {
    session.current = { ...session.current, value, onValue, restoreOnEmpty };
  });

  const commit = useCallback((ending: BufferedEditEnding = "gesture") => {
    const current = session.current;
    const draft = current.editingValue;
    if (draft === null) return;
    current.editingValue = null;
    setEditingValue(null);
    const committed = committedTextInputValue(
      draft,
      current.value,
      refusesEmptyCommit(current.restoreOnEmpty, ending),
    );
    if (committed !== null) current.onValue(committed);
  }, []);

  // Navigating away from the surface. The editor unmounts with the route, and
  // an edit abandoned that way is the reader's typing, not garbage: it commits
  // like any other ending the reader performed.
  useEffect(() => () => commit(), [commit]);

  // iOS ends this document without unmounting it: it backgrounds the PWA and
  // kills it, or the reader pull-to-refreshes. `document-exit` owns both of
  // those endings, because the second one needs this commit to happen before
  // the flush that carries it off the device. Registering also declares the
  // edit pending, so the header stops claiming it is saved.
  const editing = editingValue !== null;
  useEffect(() => {
    if (!editing) return;
    return registerBufferedEdit(commit);
  }, [commit, editing]);

  return (
    <input
      {...props}
      value={visibleTextInputValue(value, editingValue)}
      onChange={(event) => {
        session.current.editingValue = event.target.value;
        setEditingValue(event.target.value);
      }}
      // Wrapped, not passed: React hands the handler a `FocusEvent`, and this
      // commit's first parameter is now the ending it is being asked about.
      onBlur={() => commit()}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        // Return / Done on the iOS keyboard ends the edit for the reader and
        // does not blur the field, so a commit hung only on blur never runs.
        if (event.key === "Enter") commit();
      }}
    />
  );
}
