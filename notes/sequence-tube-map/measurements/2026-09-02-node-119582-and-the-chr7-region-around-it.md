# One node crashes, and its region is slower than the viewer will wait — measured 2026-09-02

Found while testing [#156](https://github.com/CAST-genomics/pgb/pull/156), the flip to the
band payload. Retrieval got fast enough that many more nodes got opened, and one of them
failed. This records what that failure actually is, because it is **two different failures
wearing one card**, and neither of them is about the band format.

The node: `chr7:55,167,260-55,167,310`, `minigraphnode=119582` — a 50 bp window in the EGFR
neighbourhood. It is not a rendering problem and should be raised with UCSD.

## What the reported URL does

It does not time out. It fails in about three seconds, with a status and a sentence:

```
HTTP/1.1 502 Bad Gateway
content-type: application/json
access-control-allow-origin: *

{"detail":"the generate_bands stage failed for chr7:55167260-55167310:
  the Node render exited non-zero or wrote no output; its stderr is in the log above"}
```

Six attempts, all 502, 3.0–3.2 s each. Through the mounted panel it draws the failure card
in **3.2 s**, reading *"The tube map could not be fetched. / The server answered 502 Bad
Gateway."*

Three things follow, and each kills a hypothesis:

- **It is not the band format.** The same window without `&format=bands` returns the same
  502, differing in one word: `the generate_svg stage failed`. Both encodings run the same
  render stage and it is the stage that dies.
- **It is not CORS, and not opaque.** Unlike the 500s catalogued in
  [`2026-08-12-api-reachability-and-cors.md`](2026-08-12-api-reachability-and-cors.md),
  this response carries `access-control-allow-origin: *` when the request carries an
  `Origin`. The browser reads the status, and `fetchDocument.ts`'s `response.ok` branch —
  not its `catch` — is what produces the card.
- **It is not `PATIENCE_MS`.** Nothing waited 90 seconds. A three-second 502 and a ninety-
  second abort arrive as the same "could not be fetched" card, which is how one gets
  mistaken for the other.

## But the 90 seconds is real, one window over

Same node, same everything, only the coordinate window widened. `format=bands` throughout,
sequential, no cooldown:

| window | | result | | response |
|---|---|---|---|---|
| **50 bp** (as reported) | | **502** | 3.1 s | 155 B |
| 100 bp | | 200 | **4.2 s** | 4,443,200 B |
| 200 bp | | 200 | **104.2 s** | 2,682,540 B |
| 500 bp | | 200 | **111.3 s** | 2,010,156 B |
| 5 kb | | 200 | **163.0 s** | 3,010,464 B |

For contrast, chr7 node `119565` at 906 bp answers in **2.0 s** with 298 KB. The region, not
the API, is what is expensive here.

Repeats are deterministic: 100 bp returned 4,443,200 bytes three times, in 4.1 / 4.2 / 4.7 s;
50 bp 502'd six times out of six.

**Three of those five windows are over `PATIENCE_MS`.** So a researcher exploring around this
node will meet the 90-second abort for real — and *that* card is the one this investigation
started from. The reported URL had by then become the fast 502.

## What the numbers say, and what they contradict

**Cost does not track response size, and does not track window.** 100 bp returns 4.4 MB in
4.2 s; 200 bp returns *less* — 2.7 MB — and takes **twenty-five times longer**. Widening the
window from 200 bp to 500 bp makes the response smaller again and barely moves the clock.

That is worth stating plainly because it contradicts the model in
[`2026-08-13-api-fetch-ceiling.md`](2026-08-13-api-fetch-ceiling.md), which concluded — after
being rewritten twice — that "the failure is driven by **response size**, not span," and that
narrowing the window is a client-side workaround. On this node it is neither. The 50 bp
window is the *narrowest* request and the only one that fails outright, and the second
narrowest is the fastest by a factor of twenty-five.

So the earlier note's finding should be read as scoped to the nodes it probed, not as a law.
Whatever dominates here is in the layout stage — path count, crossing minimisation, something
that varies discontinuously with which haplotypes fall inside the window — and it is
invisible from the client. Two adjacent windows in one region differ by 25× in cost and by
2× in output, in opposite directions.

**And the crash looks like a degenerate-window bug rather than a load one.** 50 bp fails
while 100 bp centred on the same point succeeds; the failing request is the cheapest one
asked. `the Node render exited non-zero or wrote no output` is consistent with a render that
produced nothing for a window narrower than whatever it needs, and then was treated as a
crash. The stderr that would settle it is in UCSD's log and reaches no client.

## What this is not

**Not an argument against the band payload.** At 500 bp the payload still took 111 s: the
cost is in the server's render stage, upstream of the point where the encoding is chosen.
Bands make the *transfer* an eighth to a tenth of the size and remove the parse; they cannot
make a slow render fast. #156's measurements stand and this is a different axis.

## Open, and for whom

**For UCSD:**

- Why does a 50 bp window make the render exit non-zero, when a 100 bp window centred on the
  same point succeeds? Is there a minimum window, and should it be a 4xx with a sentence
  rather than a 502?
- What makes 200 bp cost 25× what 100 bp costs while returning less? If that is knowable
  server-side before the render starts, it is the number a client would most like to be told.

**For PGB, and deliberately not decided here:** a 502 with a readable `detail` and a 90-second
abort are two different things to know, and today they are one card. Whether the viewer should
say which happened — and whether it should ever repeat the server's own sentence — is a
question for the failure card's owner, not for this note.
