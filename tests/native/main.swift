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
