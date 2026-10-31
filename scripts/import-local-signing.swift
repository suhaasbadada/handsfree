// Only used by local-signing.sh --init. Never prints key material or passwords.
import Foundation
import Security

func check(_ status: OSStatus) throws {
    guard status == errSecSuccess else {
        throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
    }
}

do {
    let args = CommandLine.arguments
    guard args.count == 4 else { throw NSError(domain: "arguments", code: 1) }
    let data = try Data(contentsOf: URL(fileURLWithPath: args[1]))
    let password = try String(contentsOfFile: args[2], encoding: .utf8)
        .trimmingCharacters(in: .newlines)
    var keychain: SecKeychain?
    try check(SecKeychainOpen(args[3], &keychain))
    var application: SecTrustedApplication?
    try check(SecTrustedApplicationCreateFromPath("/usr/bin/codesign", &application))
    var access: SecAccess?
    try check(SecAccessCreate("HandsFree Local Development" as CFString,
                              [application!] as CFArray, &access))
    let options = [kSecImportExportPassphrase: password,
                   kSecImportExportKeychain: keychain!,
                   kSecImportExportAccess: access!] as CFDictionary
    var items: CFArray?
    try check(SecPKCS12Import(data as CFData, options, &items))
    print("Imported dedicated HandsFree identity; no trust settings changed.")
} catch {
    fputs("Identity import failed: \(error)\n", stderr)
    exit(1)
}
