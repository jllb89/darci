import Foundation
@preconcurrency import PhoneNumberKit

struct PhoneCountry: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let dialCode: String
}

enum PhoneNumberFormatting {
    nonisolated(unsafe) private static let utility = PhoneNumberUtility()

    static let countries: [PhoneCountry] = utility.allCountries()
        .compactMap { regionCode -> PhoneCountry? in
            guard let countryCode = utility.countryCode(for: regionCode) else { return nil }

            return PhoneCountry(
                id: regionCode,
                name: Locale.current.localizedString(forRegionCode: regionCode) ?? regionCode,
                dialCode: "+\(countryCode)"
            )
        }
        .sorted { left, right in
            if left.name.localizedCaseInsensitiveCompare(right.name) == .orderedSame {
                return left.id < right.id
            }
            return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
        }

    static var defaultCountry: PhoneCountry {
        let regionCode = PhoneNumberUtility.defaultRegionCode()
        return countries.first { $0.id == regionCode } ?? countries.first { $0.id == "US" } ?? countries[0]
    }

    static func country(matchingPhone value: String?) -> PhoneCountry {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard trimmed.isEmpty == false else { return defaultCountry }

        if let parsed = try? utility.parse(trimmed, ignoreType: true),
           let regionCode = utility.getRegionCode(of: parsed),
           let country = countries.first(where: { $0.id == regionCode }) {
            return country
        }

        return defaultCountry
    }

    static func formattedNationalNumber(_ value: String, country: PhoneCountry) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return "" }

        if let parsed = try? utility.parse(trimmed, withRegion: country.id, ignoreType: true) {
            return utility.format(parsed, toType: .national)
        }

        return PartialFormatter(
            utility: utility,
            defaultRegion: country.id,
            withPrefix: false
        ).formatPartial(trimmed)
    }

    static func e164(_ value: String, country: PhoneCountry) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else { return nil }

        guard let parsed = try? utility.parse(trimmed, withRegion: country.id, ignoreType: true) else {
            return nil
        }

        return utility.format(parsed, toType: .e164)
    }
}