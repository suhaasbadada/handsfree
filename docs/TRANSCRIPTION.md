# Transcript cleanup and word counts

Whisper can emit non-speech annotations such as `[BLANK_AUDIO]` even with
special-token printing disabled. These are generated text, **not a finite enum
of model states**. There is no exhaustive list of everything the model might
write. HandsFree recognizes the explicit list below; it does not remove
arbitrary uppercase tags or bracketed text.

## Recognized non-speech annotations

These names are recognized inside **square brackets or round parentheses**,
case-insensitively. Spaces (including Unicode whitespace), underscores and
hyphens are ignored within these names: `[BLANK_AUDIO]`, `[blank audio]` and
`(Blank-Audio)` are equivalent. Bare spoken words are never removed.

| Category | Recognized names |
| --- | --- |
| No audio/speech | `BLANK_AUDIO`, `NO_AUDIO`, `NO_SPEECH`, `SILENCE`, `SILENT` |
| Music | `MUSIC`, `INSTRUMENTAL_MUSIC`, `BACKGROUND_MUSIC` |
| Audience | `APPLAUSE`, `CLAPPING` |
| Laughter | `LAUGHTER`, `LAUGHING`, `LAUGHS`, `CHUCKLING`, `CHUCKLES` |
| Unclear audio | `INAUDIBLE`, `UNINTELLIGIBLE`, `CROSSTALK` |
| Noise | `BACKGROUND_NOISE`, `STATIC`, `NOISE` |
| Other vocal sounds | `SIGHS`, `SIGHING`, `COUGH`, `COUGHS`, `COUGHING`, `BREATHING`, `GASP`, `GASPS`, `GASPING`, `SOBBING`, `CRYING`, `SNEEZING`, `SNEEZES` |

These are conventional sound/transcript labels, not guaranteed outputs of every
model. An intentionally dictated literal `(music)` is indistinguishable from a
generated annotation and will also be removed. Unknown labels such as
`[SOUND_OF_A_DOOR]` remain intact; add a narrow rule and regression test if an
actual additional artifact is reported. There is no wildcard `SOUND_OF_*` rule.

## Machine tokens and timing

The locked whisper.cpp vocabulary construction in `src/whisper.cpp` supplies
these native debug spellings, also recognized case-insensitively:

- `[_EOT_]`, `[_SOT_]`, `[_TRANSLATE_]`, `[_TRANSCRIBE_]`, `[_SOLM_]`,
  `[_PREV_]`, `[_NOSP_]`, `[_NOT_]`, `[_BEG_]`.
- `[_TT_1]` through `[_TT_1500]` (20-ms timestamp steps), `[_LANG_en]`
  and other language codes recognized by the linked Whisper library,
  `[_extra_token_N]` with a nonempty decimal `N`.

The corresponding common tokenizer spellings are recognized too:
`<|endoftext|>`, `<|startoftranscript|>`, `<|translate|>`, `<|transcribe|>`,
`<|startoflm|>`, `<|startofprev|>`, `<|nospeech|>`, `<|nocaptions|>`,
`<|notimestamps|>`, valid language codes such as `<|en|>`, and timestamps
`<|0.00|>` through `<|30.00|>` in 0.02-second steps.

Recognized bracketed timestamps use `mm:ss.mmm` or `hh:mm:ss.mmm` (a comma may
replace the decimal point), either singly or as a `start --> end` range. A
complete standalone subtitle timing line using that range is also removed.
Ordinary numbers such as `[2026]` and `[12:34]` are preserved. This does not
parse full SRT files, strip subtitle sequence numbers, HTML, or code.

## Delivery and counting

Shared cleanup runs on chunk text and the completed joined transcript,
**before** dashboard publication, Paste, fallback clipboard copy, and usage
accounting. Removed spans become spaces, never concatenating adjacent words.
Control characters become spaces to keep insertion on one line. A result with
no lexical words (including annotation remnants, punctuation, emoji or music
symbols alone) follows the existing **No speech** path: no delivery or changes
to any usage metric. Mixed speech retains its real words, punctuation and
fillers. Statistics defensively apply the same cleanup as delivery.

Words use Unicode Standard Annex #29 boundaries via `unicode-segmentation`, not
whitespace splitting: `hello,world` is two, `don't` and `can’t` are each one,
`well-known` is two, `foo_bar` is one, and `1,000`, `3.14`, and `2026` are each
one. Punctuation and standalone emoji are zero. This is a defined text-word
metric, not perfect measurement of spoken words across all languages;
the transcription model remains English-only.

`[TODO]`, `[API]`, `[NASA]`, `(music theory)`, unknown tags, and ordinary code
are preserved. “Thank you” and “Thanks for watching” are **not** blacklisted:
they can be genuine speech. Energy and no-speech-probability gates remain the
audio-level defenses; text filtering cannot identify every hallucination.

Existing aggregate history and preferences are not reset or recalculated.
Previous overcounts cannot be reliably repaired because transcripts are not
persisted. The new rules apply to new dictations only; no transcript logging,
model download, microphone recording, or additional network service is added.
