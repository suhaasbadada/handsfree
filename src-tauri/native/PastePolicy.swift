// Stable C ABI codes, mirrored by paste_message in logic.rs. No field contents,
// app names, identifiers, or AX descriptions are included in diagnostics.
enum PasteResult: Int32 {
    case sent = 0, accessibilityDenied, noApplication, originalFocusUnavailable
    case applicationChanged, currentFocusUnavailable, fieldChanged, secureField
    case unsupportedField, disabledField, clipboardFailed, eventCreationFailed
    case originalSecureField, originalUnsupportedField, originalDisabledField, ownApplication
    case cancelled
}

func fieldPolicy(secure: Bool, enabled: Bool, explicitlyReadOnly: Bool,
                 standardTextRole: Bool, selectedTextWritable: Bool) -> PasteResult {
    if secure { return .secureField }
    if !enabled || explicitlyReadOnly { return .disabledField }
    // Nonstandard editors must positively expose writable text, not merely an
    // editable-looking role, a matching label, or a text selection.
    return standardTextRole || selectedTextWritable ? .sent : .unsupportedField
}
