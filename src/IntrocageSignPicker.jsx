import { useId, useRef, useState } from "react";
import { IconPlus, IconX } from "@tabler/icons-react";
import { matchChoices } from "./introcageSigns";

// Choosing the introcages for Introcage Signs (in the Documents pop-up): a
// search box that suggests introcages as you type, Add to List, and the
// list of signs to print underneath (each can be taken off, or all).
//   choices: signChoices(); list: the ids chosen, in order
//   onAdd(id), onRemove(id), onClear(); disabled: while a PDF is made

// How many suggestions show at once
const MOST_SUGGESTIONS = 8;

const monkeysText = (count) => (count === 0 ? "Empty" : `${count} ${count === 1 ? "monkey" : "monkeys"}`);

function IntrocageSignPicker({ choices, list, onAdd, onRemove, onClear, disabled = false }) {
    const id = useId();
    const inputRef = useRef(null);
    const [typed, setTyped] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    // (ones already on the list aren't suggested again)
    const suggestions = matchChoices(choices, typed)
        .filter((c) => !list.includes(c.id))
        .slice(0, MOST_SUGGESTIONS);
    // What Add to List adds: the one typed in full, or the only one found
    const exact = choices.find(
        (c) => !list.includes(c.id) && [c.label, c.name].some((n) => n.toLowerCase() === typed.trim().toLowerCase())
    );
    const toAdd = exact ?? (suggestions.length === 1 ? suggestions[0] : null);
    const showing = open && suggestions.length > 0 && !exact;

    function add(choice = toAdd) {
        if (!choice) return;
        onAdd(choice.id);
        setTyped("");
        setOpen(false);
        setActive(0);
        inputRef.current?.focus();
    }
    function onKeyDown(event) {
        if (event.key === "ArrowDown" && suggestions.length) {
            event.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % suggestions.length);
        } else if (event.key === "ArrowUp" && suggestions.length) {
            event.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        } else if (event.key === "Enter") {
            event.preventDefault();
            add(showing ? suggestions[active] : toAdd);
        } else if (event.key === "Escape" && showing) {
            // (closes the suggestions, not the pop-up)
            event.stopPropagation();
            setOpen(false);
        }
    }

    const chosen = list.map((chosenId) => choices.find((c) => c.id === chosenId)).filter(Boolean);
    return (
        <div className="SignPicker">
            <label className="SignPicker-label" htmlFor={`${id}-search`}>
                Introcage
            </label>
            <div className="SignPicker-row">
                <div className="SignPicker-search">
                    <input
                        ref={inputRef}
                        id={`${id}-search`}
                        type="text"
                        role="combobox"
                        aria-expanded={showing}
                        aria-controls={`${id}-suggestions`}
                        aria-autocomplete="list"
                        aria-activedescendant={showing ? `${id}-option-${active}` : undefined}
                        autoComplete="off"
                        placeholder="e.g. Goliath B1"
                        value={typed}
                        disabled={disabled}
                        onChange={(e) => {
                            setTyped(e.target.value);
                            setOpen(true);
                            setActive(0);
                        }}
                        onKeyDown={onKeyDown}
                        onBlur={() => setOpen(false)}
                    />
                    {showing && (
                        <ul className="SignPicker-suggestions" id={`${id}-suggestions`} role="listbox" aria-label="Introcages">
                            {suggestions.map((c, i) => (
                                <li
                                    key={c.id}
                                    id={`${id}-option-${i}`}
                                    role="option"
                                    aria-selected={i === active}
                                    className={i === active ? "is-active" : undefined}
                                    // (before the box loses focus, which closes the list)
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        setTyped(c.label);
                                        setOpen(false);
                                    }}
                                    onMouseEnter={() => setActive(i)}
                                >
                                    <span>{c.label}</span>
                                    <span className="SignPicker-count">{monkeysText(c.count)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <button type="button" className="SignPicker-add" onClick={() => add()} disabled={disabled || !toAdd}>
                    <IconPlus size={16} aria-hidden="true" />
                    Add to List
                </button>
            </div>
            {chosen.length > 0 && (
                <div className="SignPicker-list">
                    <div className="SignPicker-listHeader">
                        <h2 id={`${id}-list`}>Signs to Print ({chosen.length})</h2>
                        <button type="button" className="SignPicker-clear" onClick={onClear} disabled={disabled}>
                            Clear All
                        </button>
                    </div>
                    <ol aria-labelledby={`${id}-list`}>
                        {chosen.map((c) => (
                            <li key={c.id}>
                                <span className="SignPicker-name">{c.label}</span>
                                <span className="SignPicker-count">{monkeysText(c.count)}</span>
                                <button
                                    type="button"
                                    className="SignPicker-remove"
                                    onClick={() => onRemove(c.id)}
                                    disabled={disabled}
                                    aria-label={`Remove ${c.label}`}
                                    title="Remove"
                                >
                                    <IconX size={16} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}

export default IntrocageSignPicker;
