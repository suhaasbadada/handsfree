//! Conservative text-only filtering: annotations are not a finite Whisper enum.
//! Never blacklist ordinary speech (including common silence hallucinations).
use unicode_segmentation::UnicodeSegmentation;

// Canonical display names also define the documentation table (checked below).
const ANNOTATIONS: &[(&str, &[&str])] = &[
    (
        "No audio/speech",
        &[
            "BLANK_AUDIO",
            "NO_AUDIO",
            "NO_SPEECH",
            "NO_SOUND",
            "SILENCE",
            "SILENT",
        ],
    ),
    (
        "Music",
        &[
            "MUSIC",
            "MUSIC_PLAYING",
            "INSTRUMENTAL",
            "INSTRUMENTAL_MUSIC",
            "BACKGROUND_MUSIC",
            "SOFT_MUSIC",
            "DRAMATIC_MUSIC",
        ],
    ),
    (
        "Whistling, humming and singing",
        &[
            "WHISTLE",
            "WHISTLES",
            "WHISTLING",
            "HUM",
            "HUMS",
            "HUMMING",
            "SINGING",
        ],
    ),
    (
        "Audience",
        &[
            "APPLAUSE",
            "CLAPPING",
            "CHEER",
            "CHEERS",
            "CHEERING",
            "BOOING",
            "CROWD_NOISE",
        ],
    ),
    (
        "Laughter",
        &[
            "LAUGHTER",
            "LAUGH",
            "LAUGHING",
            "LAUGHS",
            "CHUCKLE",
            "CHUCKLING",
            "CHUCKLES",
            "GIGGLE",
            "GIGGLES",
            "GIGGLING",
        ],
    ),
    (
        "Unclear audio and vocal delivery",
        &[
            "INAUDIBLE",
            "UNINTELLIGIBLE",
            "CROSSTALK",
            "MUMBLES",
            "MUMBLING",
            "WHISPERING",
            "SHOUTING",
        ],
    ),
    (
        "Breathing and sighs",
        &[
            "BREATH",
            "BREATHING",
            "HEAVY_BREATHING",
            "EXHALE",
            "EXHALES",
            "EXHALING",
            "INHALE",
            "INHALES",
            "INHALING",
            "SIGH",
            "SIGHS",
            "SIGHING",
            "GASP",
            "GASPS",
            "GASPING",
        ],
    ),
    (
        "Coughs, sneezes and throat sounds",
        &[
            "COUGH",
            "COUGHS",
            "COUGHING",
            "SNEEZE",
            "SNEEZES",
            "SNEEZING",
            "THROAT_CLEARING",
            "CLEARS_THROAT",
            "SNIFF",
            "SNIFFS",
            "SNIFFING",
            "SNIFFLING",
            "HICCUP",
            "HICCUPS",
            "HICCUPPING",
        ],
    ),
    (
        "Other vocal sounds",
        &[
            "SOB",
            "SOBS",
            "SOBBING",
            "CRYING",
            "GRUNT",
            "GRUNTS",
            "GRUNTING",
            "GROAN",
            "GROANS",
            "GROANING",
            "SCREAM",
            "SCREAMS",
            "SCREAMING",
            "SNORE",
            "SNORES",
            "SNORING",
        ],
    ),
    (
        "Electronic sounds and bells",
        &[
            "BEEP",
            "BEEPS",
            "BEEPING",
            "BLEEP",
            "BLEEPS",
            "BLEEPING",
            "BUZZ",
            "BUZZES",
            "BUZZING",
            "RING",
            "RINGS",
            "RINGING",
            "PHONE_RINGING",
            "CHIME",
            "CHIMES",
            "CHIMING",
            "DING",
            "DOORBELL",
        ],
    ),
    (
        "Movement and objects",
        &[
            "CLICK",
            "CLICKS",
            "CLICKING",
            "TAP",
            "TAPS",
            "TAPPING",
            "FOOTSTEPS",
            "RUSTLING",
            "CRACKLING",
            "DOOR_SLAMMING",
        ],
    ),
    ("Weather", &["THUNDER", "RAIN", "WIND", "WIND_BLOWING"]),
    (
        "Animals",
        &[
            "BARK",
            "BARKS",
            "BARKING",
            "DOG_BARKING",
            "MEOW",
            "MEOWS",
            "MEOWING",
            "BIRDS_CHIRPING",
            "CHIRP",
            "CHIRPS",
            "CHIRPING",
        ],
    ),
    ("Noise", &["BACKGROUND_NOISE", "STATIC", "NOISE"]),
];

fn language(value: &str) -> bool {
    (2..=3).contains(&value.len())
        && value.bytes().all(|c| c.is_ascii_lowercase())
        // Unlike get_lang_id, valid-ID lookup never logs unrecognized text.
        && (0..=whisper_rs::get_lang_max_id())
            .any(|id| whisper_rs::get_lang_str(id) == Some(value))
}

fn digits(value: &str) -> bool {
    !value.is_empty() && value.bytes().all(|c| c.is_ascii_digit())
}

fn timestamp(value: &str) -> bool {
    let fields: Vec<_> = value.split(':').collect();
    if !(2..=3).contains(&fields.len()) {
        return false;
    }
    let seconds: Vec<_> = fields.last().unwrap().split(['.', ',']).collect();
    fields[..fields.len() - 1]
        .iter()
        .all(|f| f.len() == 2 && digits(f))
        && fields[fields.len() - 2]
            .parse::<u32>()
            .is_ok_and(|n| n < 60)
        && seconds.len() == 2
        && seconds[0].len() == 2
        && digits(seconds[0])
        && seconds[0].parse::<u32>().is_ok_and(|n| n < 60)
        && seconds[1].len() == 3
        && digits(seconds[1])
}

fn timing(value: &str) -> bool {
    if let Some((start, end)) = value.split_once("-->") {
        timestamp(start.trim()) && timestamp(end.trim())
    } else {
        timestamp(value)
    }
}

fn annotation(value: &str) -> bool {
    let normalized = normalize_annotation(value);
    ANNOTATIONS
        .iter()
        .flat_map(|(_, names)| *names)
        .any(|name| normalize_annotation(name) == normalized)
}

fn normalize_annotation(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_whitespace() && !matches!(c, '_' | '-'))
        .flat_map(char::to_lowercase)
        .collect()
}

fn native_token(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    if [
        "_eot_",
        "_sot_",
        "_translate_",
        "_transcribe_",
        "_solm_",
        "_prev_",
        "_nosp_",
        "_not_",
        "_beg_",
    ]
    .contains(&value.as_str())
    {
        return true;
    }
    if let Some(n) = value.strip_prefix("_tt_") {
        return digits(n) && n.parse::<u32>().is_ok_and(|n| (1..=1500).contains(&n));
    }
    if let Some(n) = value.strip_prefix("_extra_token_") {
        return digits(n);
    }
    value.strip_prefix("_lang_").is_some_and(language)
}

fn special_token(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    if [
        "endoftext",
        "startoftranscript",
        "translate",
        "transcribe",
        "startoflm",
        "startofprev",
        "nospeech",
        "nocaptions",
        "notimestamps",
    ]
    .contains(&value.as_str())
        || language(&value)
    {
        return true;
    }
    value.split_once('.').is_some_and(|(whole, fraction)| {
        digits(whole)
            && (whole == "0" || !whole.starts_with('0'))
            && fraction.len() == 2
            && digits(fraction)
            && whole.parse::<u32>().is_ok_and(|n| n <= 30)
            && fraction.parse::<u32>().is_ok_and(|n| n % 2 == 0)
            && (whole != "30" || fraction == "00")
    })
}

/// Remove only recognized annotation spans, not arbitrary brackets or HTML/code.
/// Replacements are spaces, so adjacent real words cannot be concatenated.
pub fn clean(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    for line in text.lines() {
        if timing(line.trim()) && line.contains("-->") {
            output.push(' ');
            continue;
        }
        // Even unrecognized bracket/code spans must remain insertion-safe.
        let line: String = line
            .chars()
            .map(|c| {
                if c.is_control() || matches!(c, '\u{2028}' | '\u{2029}') {
                    ' '
                } else {
                    c
                }
            })
            .collect();
        let mut rest = line.as_str();
        while !rest.is_empty() {
            let candidate = if let Some(inner) = rest.strip_prefix("<|") {
                inner
                    .find("|>")
                    .map(|end| (end + 4, special_token(&inner[..end])))
            } else if rest.starts_with('[') || rest.starts_with('(') {
                let close = if rest.starts_with('[') { ']' } else { ')' };
                rest.find(close).map(|end| {
                    let inner = &rest[1..end];
                    (
                        end + 1,
                        annotation(inner)
                            || (close == ']' && (native_token(inner) || timing(inner))),
                    )
                })
            } else {
                None
            };
            if let Some((end, remove)) = candidate {
                if remove {
                    output.push(' ');
                } else {
                    output.push_str(&rest[..end]);
                }
                rest = &rest[end..];
            } else {
                let c = rest.chars().next().unwrap();
                output.push(if c.is_control() || matches!(c, '\u{2028}' | '\u{2029}') {
                    ' '
                } else {
                    c
                });
                rest = &rest[c.len_utf8()..];
            }
        }
        output.push(' ');
    }
    let output = output.trim().to_owned();
    // Annotation punctuation or music symbols alone are not a dictation.
    if lexical_words(&output) == 0 {
        String::new()
    } else {
        output
    }
}

fn lexical_words(text: &str) -> u64 {
    text.unicode_words().count() as u64
}

/// Unicode word boundaries (UAX #29), after the same delivery cleanup.
pub fn count_words(text: &str) -> u64 {
    lexical_words(&clean(text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_supported_annotation_and_separator_variant() {
        for name in ANNOTATIONS.iter().flat_map(|(_, names)| *names) {
            for value in [
                name.to_string(),
                name.to_lowercase(),
                normalize_annotation(name),
                name.replace('_', " "),
                name.replace('_', "-"),
                format!(" _{name}- "),
            ] {
                for (open, close) in [('[', ']'), ('(', ')')] {
                    let marker = format!("{open}{value}{close}");
                    assert_eq!(clean(&marker), "", "{marker}");
                    assert_eq!(count_words(&marker), 0);
                    assert_eq!(clean(&format!("hello{marker}world")), "hello world");
                    assert_eq!(count_words(&format!("hello{marker}world")), 2);
                }
            }
        }
        for marker in [
            "[BLANK_AUDIO]",
            "[No\u{2003}Speech]",
            "[background-music]",
            "(Background Music)",
        ] {
            assert_eq!(clean(marker), "");
        }
    }

    #[test]
    fn documented_annotations_match_the_single_source() {
        let docs = include_str!("../../docs/TRANSCRIPTION.md");
        let start = docs.find("| Category | Recognized names |\n").unwrap();
        let table = docs[start..].split("\n\n").next().unwrap();
        let mut expected = String::from("| Category | Recognized names |\n| --- | --- |");
        let mut unique = std::collections::HashSet::new();
        for (category, names) in ANNOTATIONS {
            let names: Vec<_> = names
                .iter()
                .map(|name| {
                    assert!(
                        unique.insert(normalize_annotation(name)),
                        "duplicate {name}"
                    );
                    format!("`{name}`")
                })
                .collect();
            expected.push_str(&format!("\n| {category} | {} |", names.join(", ")));
        }
        assert_eq!(table, expected);
    }

    #[test]
    fn machine_tokens_and_timestamps() {
        for marker in [
            "[_EOT_]",
            "[_SOT_]",
            "[_TRANSLATE_]",
            "[_TRANSCRIBE_]",
            "[_SOLM_]",
            "[_PREV_]",
            "[_NOSP_]",
            "[_NOT_]",
            "[_BEG_]",
            "[_TT_1]",
            "[_TT_1500]",
            "[_LANG_en]",
            "[_extra_token_123]",
            "<|endoftext|>",
            "<|startoftranscript|>",
            "<|translate|>",
            "<|transcribe|>",
            "<|startoflm|>",
            "<|startofprev|>",
            "<|nospeech|>",
            "<|nocaptions|>",
            "<|notimestamps|>",
            "<|en|>",
            "<|0.00|>",
            "<|30.00|>",
            "[00:01.200]",
            "[00:00:01.200 --> 00:00:02.000]",
            "00:00:01,200 --> 00:00:02,000",
        ] {
            assert_eq!(clean(marker), "", "{marker}");
        }
        assert_eq!(clean("[BLANK_AUDIO]. (silence)! ♪♫ <|nospeech|>"), "");
    }

    #[test]
    fn preserves_unknown_brackets_code_and_actual_speech() {
        for text in [
            "[TODO] [API] [NASA] [2026]",
            "(music theory)",
            "[SOUND_OF_A_DOOR]",
            "[UNKNOWN_STATE]",
            "<html>hello</html>",
            "if(a<b) foo_bar",
            "[unfinished",
            "<|unknown|>",
            "[_TT_1501]",
            "[_LANG_xyz]",
            "<|30.02|>",
            "[12:34]",
            "Thank you. Thanks for watching.",
            "Um, uh, I, I mean… well.",
            "whistling",
            "Whistle hum singing rain wind beep.",
        ] {
            assert_eq!(clean(text), text);
        }
        assert_eq!(count_words("[TODO] [API] [NASA] [2026]"), 4);
        assert_eq!(count_words("whistling"), 1);
    }

    #[test]
    fn mixed_annotations_never_join_or_rewrite_words() {
        assert_eq!(clean("hello[MUSIC]world"), "hello world");
        assert_eq!(count_words("Hello,world! [BLANK_AUDIO] (laughs) Again."), 3);
        assert_eq!(
            clean("Um, uh, I, I mean…\nwell.\tOkay.\r\0\u{1b}"),
            "Um, uh, I, I mean… well. Okay."
        );
        assert_eq!(clean("a\u{2028}b\u{2029}c"), "a b c");
        assert_eq!(
            clean("[TODO\titem\0] <|unknown\u{1b}|>"),
            "[TODO item ] <|unknown |>"
        );
    }

    #[test]
    fn unicode_word_count_not_whitespace_or_punctuation_count() {
        for (text, expected) in [
            ("... — ! ♪♫ 😀", 0),
            ("hello,world", 2),
            ("don't can’t", 2),
            ("well-known", 2),
            ("foo_bar API", 2),
            ("1,000 3.14 2026", 3),
            ("café cafe\u{301}", 2),
            ("नमस्ते दुनिया", 2),
            ("مرحبا بالعالم", 2),
        ] {
            assert_eq!(count_words(text), expected, "{text}");
        }
    }
}
