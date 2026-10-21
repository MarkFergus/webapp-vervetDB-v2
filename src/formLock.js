import { createContext, useContext, useEffect } from "react";

// A form open inside a pop-up (a new injury, an update, an integration
// report…) holds the pop-up where it is: no moving to another monkey, and
// no closing it, until the form's Cancel (or Confirm). So a half-filled form
// can't be lost by an arrow key, Escape or a stray tap outside.
//
// The pop-up provides lock(): call it to hold the pop-up; it returns the
// function that lets go. Forms just call useFormLock().
export const FormLockContext = createContext(null);

export function useFormLock(active = true) {
    const lock = useContext(FormLockContext);
    useEffect(() => {
        if (!active || !lock) return undefined;
        return lock();
    }, [lock, active]);
}

// Typing in a box: the arrow keys move the cursor, not between monkeys
export const isTyping = (target) =>
    Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
