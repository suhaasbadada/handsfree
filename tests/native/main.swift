// Pure policy tests: no permission requests, capture, AX reads, or paste events.
for secure in [false, true] {
    for enabled in [false, true] {
        for readOnly in [false, true] {
            for standard in [false, true] {
                for writable in [false, true] {
                    let result = fieldPolicy(secure: secure, enabled: enabled,
                                             explicitlyReadOnly: readOnly,
                                             standardTextRole: standard,
                                             selectedTextWritable: writable)
                    let expected: PasteResult = secure ? .secureField :
                        (!enabled || readOnly) ? .disabledField :
                        (standard || writable) ? .sent : .unsupportedField
                    precondition(result == expected, "Field safety policy regression")
                }
            }
        }
    }
}
// Lock the C ABI mappings used for actionable Rust messages.
let codes: [PasteResult] = [.sent, .accessibilityDenied, .noApplication,
    .originalFocusUnavailable, .applicationChanged, .currentFocusUnavailable,
    .fieldChanged, .secureField, .unsupportedField, .disabledField,
    .clipboardFailed, .eventCreationFailed, .originalSecureField,
    .originalUnsupportedField, .originalDisabledField, .ownApplication, .cancelled]
for (index, code) in codes.enumerated() {
    precondition(code.rawValue == Int32(index), "Paste result ABI changed")
}
print("32 field policy combinations and 17 ABI codes passed")
precondition(PasteResult.submissionUncertain.rawValue == 17)

// Real delivery policy with synthetic proofs only; no live AX or key events.
for code in 0...17 {
    for enabled in [false, true] {
        for sameApp in [false, true] {
            for sameWindow in [false, true] {
                var session = DeliverySession(generation: 4, epoch: 9, compatibility: enabled)
                session.watchingWindow = true
                func eligible(_ s: DeliverySession, trusted: Bool = true, secure: Bool = false, field: PasteResult? = nil) -> Bool {
                    compatibilityPolicy(session: s, failure: PasteResult(rawValue: Int32(code))!, trusted: trusted,
                        sameApplication: sameApp, sameWindow: sameWindow, secureInput: secure, currentField: field)
                }
                let expected = enabled && sameApp && sameWindow && [3, 5].contains(code)
                precondition(eligible(session) == expected)
                precondition(!eligible(session, trusted: false))
                precondition(!eligible(session, secure: true))
                for refusal: PasteResult in [.secureField, .disabledField, .unsupportedField] {
                    precondition(!eligible(session, field: refusal))
                }
                session.interrupted = true
                precondition(!eligible(session))
                session.interrupted = false; session.watchingWindow = false
                precondition(!eligible(session))
                session.watchingWindow = true
                precondition(!session.claim(generation: 3, epoch: 9))
                precondition(!session.claim(generation: 4, epoch: 8))
                precondition(session.claim(generation: 4, epoch: 9))
                precondition(!eligible(session))
                precondition(!session.claim(generation: 4, epoch: 9))
            }
        }
    }
}
print("Compatibility policy: consent, window, secure input, interruptions and once-only generation guards passed")

var adapterSession = DeliverySession(generation: 12, epoch: 34, compatibility: true)
adapterSession.watchingWindow = true; adapterSession.originalFocusMissing = true
func adapter(_ original: Int? = 10, window: Int? = 10, missing: Bool = true,
             field: PasteResult? = nil, trust: [Bool] = [true], foreground: [Bool] = [true]) -> Bool {
    var t = 0, f = 0
    return resolveCompatibility(session: adapterSession, failure: .originalFocusUnavailable,
        originalWindow: original, trusted: { defer { t += 1 }; return trust[min(t, trust.count - 1)] },
        foregroundMatches: { defer { f += 1 }; return foreground[min(f, foreground.count - 1)] },
        focusedWindow: { window }, equal: { $0 == $1 }, secureInput: { false },
        currentField: { (field, missing) })
}
precondition(adapter()) // app hides focus but exposes its real focused AXWindow
precondition(!adapter(nil))
precondition(!adapter(window: nil))
precondition(!adapter(window: 11))
precondition(!adapter(missing: false)) // AX denied, wrong type/PID, conflicting elements
precondition(!adapter(field: .fieldChanged))
precondition(!adapter(field: .secureField))
precondition(!adapter(trust: [true, false]))
precondition(!adapter(foreground: [true, false]))
adapterSession.interrupted = true
precondition(!adapter()) // away then back cannot regain eligibility
adapterSession.interrupted = false
precondition(adapterSession.claim(generation: 12, epoch: 34))
precondition(!adapter()) // no retry even if app ignored the shortcut
let oldSession = adapterSession
adapterSession = DeliverySession(generation: 13, epoch: 35, compatibility: false)
precondition(!adapterSession.claim(generation: oldSession.generation, epoch: oldSession.epoch))
print("Synthetic compatibility adapter: original AXWindow identity, live proofs, missing-only errors and stale completion passed without AX or events")

// Synthetic lookups only: exercise production selection/control flow without AX.
func valid(_ value: Int = 10) -> FocusLookup<Int> {
    FocusLookup(element: value, error: 0, classification: "valid")
}
func missing(_ name: String = "cannot_complete", _ error: Int32 = -25204) -> FocusLookup<Int> {
    FocusLookup(element: nil, error: error, classification: name)
}
func checkFocus(_ lookups: [FocusLookup<Int>], expected: Int?,
                sources: [Bool], trusts: [Bool] = [true], foreground: [Bool] = [true],
                outcome: String? = nil) {
    var queries: [Bool] = []
    var reports: [String] = []
    var trustIndex = 0, foregroundIndex = 0
    let result = resolveFocus(trusted: {
        defer { trustIndex += 1 }
        return trusts[min(trustIndex, trusts.count - 1)]
    }, foregroundMatches: {
        defer { foregroundIndex += 1 }
        return foreground[min(foregroundIndex, foreground.count - 1)]
    }, query: { system in
        precondition(queries.count < lookups.count, "Unexpected extra lookup")
        queries.append(system)
        return lookups[queries.count - 1]
    }, equal: { $0 == $1 }, report: { source, lookup in
        reports.append(source)
        if let lookup { precondition(lookup.error == lookups[queries.count - 1].error) }
    })
    precondition(result == expected && queries == sources, "Unsafe focus selection")
    if let outcome { precondition(reports.last == outcome) }
}
checkFocus([valid()], expected: 10, sources: [false])
for name in ["cannot_complete", "no_value", "attribute_unsupported", "nil_value"] {
    checkFocus([missing(name), valid(), missing(name)], expected: 10, sources: [false, true, false])
    checkFocus([missing(name), valid(), valid()], expected: 10, sources: [false, true, false])
}
for name in ["api_disabled", "ax_error", "wrong_type", "pid_mismatch", "pid_query_failed"] {
    checkFocus([missing(name)], expected: nil, sources: [false])
    checkFocus([missing(), missing(name)], expected: nil, sources: [false, true])
    checkFocus([missing(), valid(), missing(name)], expected: nil, sources: [false, true, false])
}
checkFocus([missing(), valid(), valid(11)], expected: nil, sources: [false, true, false], outcome: "conflicting_elements")
checkFocus([], expected: nil, sources: [], trusts: [false], outcome: "untrusted")
checkFocus([], expected: nil, sources: [], foreground: [false], outcome: "application_changed")
checkFocus([valid()], expected: nil, sources: [false], trusts: [true, false])
checkFocus([valid()], expected: nil, sources: [false], foreground: [true, false])
checkFocus([missing(), valid()], expected: nil, sources: [false, true], foreground: [true, true, false])
checkFocus([missing(), valid(), valid()], expected: nil, sources: [false, true, false], foreground: [true, true, true, false])
checkFocus([missing(), valid()], expected: nil, sources: [false, true], trusts: [true, true, false])
checkFocus([missing(), valid(), valid()], expected: nil, sources: [false, true, false], trusts: [true, true, true, false])
print("Synthetic focus resolver: bounded fallback, identity conflicts, trust and foreground guards passed without AX")
