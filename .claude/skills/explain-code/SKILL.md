---
name: explain-code
description: Explains code the user sends, very short and clear - says what the code is, then goes line by line with a one-line plain explanation of each line and how the data changes, using one example. Use when the user types /explain-code, or asks to be walked through code they have sent. Takes priority over explain-for-designer when the user invokes it by name.
---

# Explain code - very short, line by line, follow the data

The user wants two things: **what this code is**, and **what each line does to the data**, shown with an example. Nothing else.

## What to explain

The code is whatever the user sent in the same message. If they gave a file path or lines instead, read it. If there is neither, ask them to paste it - don't guess.

Use only the code given. If it depends on something outside it, read that file first or mark it as an assumption. Never invent behaviour.

## Format

**What it is** - one sentence: what the code does, what goes in, what comes out.

**Line by line** - pick one realistic example input, then go through the code in the order it runs. For every line (or condition), three short lines:

```
1. <the code line, exactly as written>
   Means: <one plain-English line - what this line does>
   Data:  <value before> → <value after>
```

Rules for each step:
- **Means** is one line, plain words, no jargon. If a symbol is unclear (`!`, `?.`, `\d`, `&&`), say what it means right there.
- **Data** shows the real value before and after. For a check, show the true/false result and what happens next.
- Split a long line (a regex, an `&&` chain) into its pieces, one step each.

End with `Output: <final result>`.

Then one more short run for a different input that takes another path or fails: just the input, the step where it differs, and the result. One to three lines.

## Example of the shape

```
Input: "  Ravi@Shop.com "

1. const text = value.trim();
   Means: remove spaces at the start and end.
   Data:  "  Ravi@Shop.com " → "Ravi@Shop.com"

2. if (!text) return null;
   Means: if nothing is left, it is valid (field is optional) - stop here.
   Data:  "Ravi@Shop.com" is not empty → false → keep going

Output: null (valid)
```

## Style

- Very short: no intro, no background, no quiz, no summary, no advice.
- One line each for Means and Data. Never more.
- Be exact: every value shown must match what the code really produces.
- Mention a bug or gap only if it changes the result for the example.
