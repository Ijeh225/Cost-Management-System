# CAP-02 Public Real-Receipt Benchmark

## Scope and Provenance

Measured 2026-10-06 using the unchanged application OCR engine and field suggester.
This is a local quality evaluation, not a production upload or financial test.

- Source: [ICDAR2019 SROIE paper, Huang et al.](https://arxiv.org/abs/2103.10213).
- Distribution: [jsdnrs/ICDAR2019-SROIE](https://huggingface.co/datasets/jsdnrs/ICDAR2019-SROIE), credited to Huang et al. and the distributor, listed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).
- Dataset revision: `bffe40c26759f3376ec2b3ae9031dbba54cd587c`.
- Test split; offsets chosen before execution: 0,30,60,90,120,150,180,210,240,270,300,330.
- Engine/source fingerprint (document-ocr.ts followed by document-readiness.ts):
  `75aec0da9d185fe511a6f7f45360f7dea3a5ab115fb052f99b6bed7cba667c81`.
- Real printed Malaysian receipt scans, not synthetic typeset fixtures. NOT
  Nigerian clearing documents, a handwriting benchmark, or a random sample.
- Public images downloaded to OS temp; no business data sent to a provider and
  no receipt attached to a live job. Images were not modified or resized.

## Method and Results

Run `node artifacts/api-server/node_modules/tsx/dist/cli.mjs scripts/cap02-receipt-benchmark.ts <local-output-directory>`.
The runner stores source hashes, annotations, OCR output, suggestions and results
locally and resumes completed samples only when dataset/engine fingerprints match.
The measured directory was `C:/Users/SONOFGRACE/AppData/Local/Temp/cap02-real-receipts-20261006`.
An upstream HTTP 502 interrupted the initial run; bounded retries/resume completed
the planned sample. No completed scan was rerun or substituted for a better one.

Gold values are dataset date/total annotations. Exact suggestion comparison folds
case/whitespace only, not dates, currencies or digits. Raw occurrence checks whether
the expected string appears anywhere: it does NOT prove correct field selection.
No gold receipt-ID field exists, so identifier accuracy was not scored.

| Offset / receipt key | Page confidence | Raw values present / 2 | Exact suggestions / 2 |
| --- | --- | --- | --- |
| 0 / X00016469670 | 74 | 2 | 1 |
| 30 / X51005442388 | 49 | 1 | 0 |
| 60 / X51005663310 | 69 | 2 | 0 |
| 90 / X51005719823 | 70 | 1 | 1 |
| 120 / X51005757220 | 77 | 2 | 0 |
| 150 / X51006327960 | 64 | 1 | 0 |
| 180 / X51006401853 | 67 | 2 | 0 |
| 210 / X51006556657 | 79 | 2 | 0 |
| 240 / X51006619503 | 62 | 1 | 0 |
| 270 / X51006828199 | 61 | 1 | 0 |
| 300 / X51007231372 | Not processed: >12 MP | N/A | N/A |
| 330 / X51007846321 | Not processed: >12 MP | N/A | N/A |

Ten scans processed; two correctly refused by the existing image-size guard.
Of 20 evaluated date/total fields, 15 values occurred in raw OCR and only two
suggestions matched exactly (one date, one amount). Five date suggestions and
seven amount suggestions were absent. Four date suggestions and two amount
suggestions were present but wrong or contaminated by other text.
Every emitted suggestion still required review. These are measured limitations,
not an OCR-accuracy acceptance pass or a claim of reliable automatic extraction.

## Confirmed Follow-Ups

### CAP02-OCR-001: Amount Context (Medium, Open)

Receipt X51005719823 visually shows total 46.20, but OCR misread that line and
`suggestFields` selected 1.26 from `TAX TOTAL: 1.26`. The unanchored Total/Amount
pattern accepts tax/subtotal context and returns the first matching field. Another
sample yielded malformed amount `M31 70` instead of annotated `RM36.96`.
Correction needed: context-aware monetary candidates, numeric/currency validation,
and abstention on ambiguity. Add these receipt-text regressions before changing
the parser. Do not infer correct totals when the underlying scan is unreadable.

### CAP02-OCR-002: Date Parsing and Contamination (Medium, Open)

Current date suggestions copy the rest of a matching line, including time/noise.
Observed `12/10/2017 [IME : Vedi od`, `ANA 9:29:44 AM` and a wrong-month value.
The colon/hyphen-oriented patterns also miss many readable unlabelled values.
Correction needed: isolate and validate complete dates, avoid trailing field
content, handle supported layouts conservatively and abstain when ambiguous.
Recognition mistakes can remain even with valid-looking dates; never bypass
mandatory source review or equate page confidence with field correctness.

Both affect document-review suggestions and potentially accepted documentary
metadata if a human approves unchecked values. They do not automatically post
invoices, bank entries or release jobs. No OCR product code was changed here.

## Limits

Public receipt evidence broadens the previous synthetic-only tests. It does not
replace a representative set of actual B/Ls, customs assessments, release/permit
documents, phone photographs or human handwriting. No such accuracy pass is
claimed. Manual review and a clearer source remain required when OCR is uncertain.
