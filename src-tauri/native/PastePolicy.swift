// Stable C ABI codes, mirrored by paste_message in logic.rs. No field contents,
// app names, identifiers, or AX descriptions are included in diagnostics.
enum PasteResult: Int32 {
    case sent = 0, accessibilityDenied, noApplication, originalFocusUnavailable
    case applicationChanged, currentFocusUnavailable, fieldChanged, secureField
    case unsupportedField, disabledField, clipboardFailed, eventCreationFailed
    case originalSecureField, originalUnsupportedField, originalDisabledField, ownApplication
    case cancelled
}

// Only explicit missing/transient attribute outcomes may try system-wide focus.
struct FocusLookup<Element> {
    let element: Element?
    let error: Int32
    let classification: String
    var mayFallback: Bool {
        ["nil_value", "no_value", "attribute_unsupported", "cannot_complete"].contains(classification)
    }
}

// Permission-free resolver; the adapter supplies PID-validated elements only.
func resolveFocus<Element>(trusted: () -> Bool, foregroundMatches: () -> Bool,
                          query: (Bool) -> FocusLookup<Element>, equal: (Element, Element) -> Bool,
                          report: (String, FocusLookup<Element>?) -> Void) -> Element? {
    guard trusted() else { report("untrusted", nil); return nil }
    guard foregroundMatches() else { report("application_changed", nil); return nil }
    let application = query(false)
    report("application", application)
    guard foregroundMatches(), trusted() else { report("application_changed_or_untrusted", nil); return nil }
    if let element = application.element { return element }
    guard application.mayFallback else { return nil }
    let system = query(true)
    report("systemwide", system)
    guard foregroundMatches(), trusted() else { report("application_changed_or_untrusted", nil); return nil }
    guard let element = system.element else { return nil }
    // Never choose between conflicting fields after a transient lookup failure.
    let confirmation = query(false)
    report("application_confirmation", confirmation)
    guard foregroundMatches(), trusted() else { report("application_changed_or_untrusted", nil); return nil }
    if let confirmed = confirmation.element {
        guard equal(element, confirmed) else { report("conflicting_elements", nil); return nil }
    } else if !confirmation.mayFallback { return nil }
    return element
}

func fieldPolicy(secure: Bool, enabled: Bool, explicitlyReadOnly: Bool,
                 standardTextRole: Bool, selectedTextWritable: Bool) -> PasteResult {
    if secure { return .secureField }
    if !enabled || explicitlyReadOnly { return .disabledField }
    // Nonstandard editors must positively expose writable text, not merely an
    // editable-looking role, a matching label, or a text selection.
    return standardTextRole || selectedTextWritable ? .sent : .unsupportedField
}
