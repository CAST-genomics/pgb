Edward Tufte critique of PGB Heatmap Tooltip Design:

# What’s working

* Clear grouping (“Ad Mixed American,” “African,” “East Asian”) and immediate presentation of the headline %.
* Generous white space and simple bullets (low chartjunk).

# Biggest opportunities

1. **ALL CAPS vs Capitalization**

* **ALL CAPS hurts legibility** (destroys word shapes, increases cognitive load) and reads like “shouting.” Tufte would call it *aggressive non-data ink*.
* Prefer **sentence case** (best) or **small caps** for quiet emphasis. If you *must* emphasize, use size/weight/spacing—not shouting.
* For section heads: “Ad mixed American” (sentence case) or small caps with modest letter-spacing.

2. **Hierarchy & typography**

* Use a **calm typographic ladder**: section head (larger, regular weight), then items (regular), then numbers (right-aligned, tabular figures). Big, bold, caps + very large size is overkill.
* Consider **small caps** via `font-variant-caps: small-caps;` instead of ALL CAPS.

3. **Numbers & precision**

* Align numbers on the decimal point; use **tabular figures**.
* Drop meaningless zeros: `100%` not `100.0%`; consider consistent precision (e.g., `37.5%` vs `62.5%` → keep one decimal only when needed).
* Avoid repeating `.0%` lines that convey no extra information.

4. **Redundancy & scanning**

* Colons after labels add ink without value—drop them.
* Bullets add clutter. Prefer a **two-column listing** (Label • %), using whitespace for separation. Right-align the % column.

5. **Grouping clarity**

* The header number likely summarizes the subgroup items—make this relation explicit with **indentation** or a faint rule, not typography shouting.
* Consider ordering sub-items **descending by %** to favor meaningful comparison.

6. **Dense, quiet design**

* Avoid heavy borders; if you use rules, make them hairline, neutral gray.
* Keep the card’s drop shadow subtle; content should dominate.

7. **Copy & semantics**

* “Ad Mixed American” reads oddly; if this is “Admixed American,” write it that way. Be precise and culturally sensitive in labels.

8. **Accessibility**

* ALL CAPS can hurt readability for dyslexic users and reduces pace for everyone. Ensure **sufficient contrast** and don’t rely only on weight/size for hierarchy.

9. **Space economy**

* The current leading (line spacing) is generous; tighten slightly so related items are visually grouped, unrelated items separated.

10. **Consistent punctuation**

* Either end items with nothing or with a consistent mark—right now you mix styles (`37.5%` vs `100.0%`). Choose one convention.

---

## Suggested layout (concept)

* Section head in **small caps** or sentence case, modest size bump.
* A **gridless table** with two columns; labels left, percents right, decimal-aligned.

**Example (HTML/CSS idea):**

```html
<section class="block">
  <h2 class="group">Admixed American <span class="pct">56.3%</span></h2>
  <div class="rows">
    <div class="row"><span>Colombian</span><span class="num">37.5%</span></div>
    <div class="row"><span>Puerto Rican</span><span class="num">62.5%</span></div>
    <div class="row"><span>Peruvian</span><span class="num">62.5%</span></div>
  </div>
</section>
```

```css
.group { 
  font-variant-caps: small-caps; 
  letter-spacing: .02em; 
  font-weight: 500; 
}
.group .pct { 
  font-weight: 400; 
  margin-left: .5rem; 
  color: #555; 
}
.rows { margin-top: .25rem }
.row { 
  display: grid; 
  grid-template-columns: 1fr max-content; 
  padding: .12rem 0; 
}
.num { 
  font-variant-numeric: tabular-nums; 
  text-align: right; 
}
section + section { margin-top: 1rem; border-top: 1px solid #eee; padding-top: .75rem }
```

---

## Quick before/after rules (Tufte checklist)

* **Replace ALL CAPS** → sentence case or small caps.
* **Right-align** and **decimal-align** the percentages; use tabular figures.
* **Remove bullets/colons**; use whitespace as structure.
* **Round consistently** (drop `.0%`).
* **Sort by value** within each group.
* Keep everything **quiet**—let the numbers do the talking.
