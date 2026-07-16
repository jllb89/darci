import Foundation

enum IntakeContactFormatting {
    private static let emailPattern = #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#
    private static let usPhoneDigitLimit = 10

    static func normalizedEmailInput(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func isValidEmail(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else {
            return false
        }

        return trimmed.range(of: emailPattern, options: .regularExpression) != nil
    }

    static func normalizedPhoneCountryCodeInput(_ value: String) -> String {
        let digits = value.filter(\.isNumber).prefix(4)
        return digits.isEmpty ? "+" : "+\(digits)"
    }

    static func phoneCountryIso2(forDialCode dialCode: String) -> String {
        switch dialCode.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "+1":
            "US"
        case "+44":
            "GB"
        default:
            "US"
        }
    }

    static func isValidPhoneCountryCode(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: #"^\+[1-9]\d{0,3}$"#, options: .regularExpression) != nil
    }

    static func formatPhoneInputForEditing(_ value: String, countryIso2: String) -> String {
        let digits = limitedPhoneDigits(value, countryIso2: countryIso2)
        guard digits.isEmpty == false else {
            return ""
        }

        guard countryIso2.uppercased() == "US" else {
            return digits
        }

        switch digits.count {
        case 0...3:
            return digits
        case 4...6:
            let area = digits.prefix(3)
            let prefix = digits.dropFirst(3)
            return "(\(area)) \(prefix)"
        default:
            let area = digits.prefix(3)
            let prefix = digits.dropFirst(3).prefix(3)
            let line = digits.dropFirst(6)
            return "(\(area)) \(prefix)-\(line)"
        }
    }

    static func limitedPhoneInput(_ value: String, countryIso2: String) -> String {
        limitedPhoneDigits(value, countryIso2: countryIso2)
    }

    static func isValidPhone(_ value: String, countryIso2: String) -> Bool {
        let digits = phoneDigits(value)
        guard digits.isEmpty == false else {
            return false
        }

        if countryIso2.uppercased() == "US" {
            return digits.count == usPhoneDigitLimit
        }

        return (7...15).contains(digits.count)
    }

    private static func limitedPhoneDigits(_ value: String, countryIso2: String) -> String {
        let digits = phoneDigits(value)
        guard countryIso2.uppercased() == "US" else {
            return digits
        }

        return String(digits.prefix(usPhoneDigitLimit))
    }

    private static func phoneDigits(_ value: String) -> String {
        String(value.filter(\.isNumber))
    }
}

enum IntakeDateFormatting {
    static func formatISODateInput(_ value: String) -> String {
        let digits = value.filter(\.isNumber).prefix(8)
        let digitText = String(digits)

        switch digitText.count {
        case 0...4:
            return digitText
        case 5...6:
            let year = digitText.prefix(4)
            let month = digitText.dropFirst(4)
            return "\(year)-\(month)"
        default:
            let year = digitText.prefix(4)
            let month = digitText.dropFirst(4).prefix(2)
            let day = digitText.dropFirst(6)
            return "\(year)-\(month)-\(day)"
        }
    }

    static func isValidISODate(_ value: String) -> Bool {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else {
            return false
        }

        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.year = year
        components.month = month
        components.day = day

        guard let date = components.calendar?.date(from: components),
              let resolved = components.calendar?.dateComponents([.year, .month, .day], from: date) else {
            return false
        }

        return resolved.year == year && resolved.month == month && resolved.day == day
    }

    static func isFutureISODate(_ value: String, today: Date = Date()) -> Bool {
        guard let date = date(fromISODate: value) else {
            return false
        }

        let calendar = Calendar(identifier: .gregorian)
        let startOfToday = calendar.startOfDay(for: today)
        return date > startOfToday
    }

    static func isValidPastOrTodayISODate(_ value: String, today: Date = Date()) -> Bool {
        isValidISODate(value) && isFutureISODate(value, today: today) == false
    }

    private static func date(fromISODate value: String) -> Date? {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].count == 4,
              parts[1].count == 2,
              parts[2].count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2]) else {
            return nil
        }

        var components = DateComponents()
        components.calendar = Calendar(identifier: .gregorian)
        components.year = year
        components.month = month
        components.day = day

        guard let date = components.calendar?.date(from: components),
              let resolved = components.calendar?.dateComponents([.year, .month, .day], from: date),
              resolved.year == year,
              resolved.month == month,
              resolved.day == day else {
            return nil
        }

        return date
    }
}