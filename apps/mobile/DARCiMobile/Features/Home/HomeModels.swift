import Foundation

struct HomeProductFlowModesResponse: Decodable, Equatable, Sendable {
    let modes: [HomeProductFlowMode]?
    let message: String?

    static let preview = HomeProductFlowModesResponse(
        modes: HomeProductCard.fallbackCards.map { card in
            HomeProductFlowMode(
                modeKey: card.modeKey,
                displayName: card.title,
                description: card.description,
                isActive: true,
                sortOrder: card.sortOrder
            )
        },
        message: nil
    )
}

struct HomeProductFlowMode: Decodable, Equatable, Sendable {
    let modeKey: String
    let displayName: String
    let description: String?
    let isActive: Bool
    let sortOrder: Int
}

struct HomeProductCard: Identifiable, Equatable, Sendable {
    let id: String
    let modeKey: String
    let title: String
    let description: String
    let icon: HomeProductIcon
    let sortOrder: Int

    init(mode: HomeProductFlowMode) {
        let fallback = Self.fallback(for: mode.modeKey)
        let title = mode.displayName.trimmedForDisplay
        let description = mode.description?.trimmedForDisplay

        self.id = mode.modeKey
        self.modeKey = mode.modeKey
        self.title = title.isEmpty ? fallback.title : title
        self.description = description?.isEmpty == false ? description! : fallback.description
        self.icon = fallback.icon
        self.sortOrder = mode.sortOrder
    }

    private init(modeKey: String, title: String, description: String, icon: HomeProductIcon, sortOrder: Int) {
        self.id = modeKey
        self.modeKey = modeKey
        self.title = title
        self.description = description
        self.icon = icon
        self.sortOrder = sortOrder
    }

    static let fallbackCards: [HomeProductCard] = [
        HomeProductCard(
            modeKey: "poa_only",
            title: "Power of Attorney",
            description: "Authorize someone you trust to handle legal and financial decisions when you cannot or prefer not to act directly.",
            icon: .file,
            sortOrder: 10
        ),
        HomeProductCard(
            modeKey: "trust_bundle",
            title: "Trust Registration",
            description: "Protect family assets with clear trustee authority and the core trust documents needed to administer and present your trust confidently.",
            icon: .home,
            sortOrder: 20
        ),
        HomeProductCard(
            modeKey: "notarize_document",
            title: "Document Notarization",
            description: "Prepare an existing document for formal acceptance with secure upload and a guided notarization-ready workflow.",
            icon: .mail,
            sortOrder: 30
        )
    ]

    private static func fallback(for modeKey: String) -> HomeProductCard {
        fallbackCards.first { $0.modeKey == modeKey } ?? HomeProductCard(
            modeKey: modeKey,
            title: "Document",
            description: "Select this product to begin.",
            icon: .file,
            sortOrder: 999
        )
    }
}

enum HomeProductIcon: String, Equatable, Sendable {
    case bellHome = "bell-home"
    case file = "file 1"
    case home = "home 1"
    case mail = "mail 1"
    case search = "search"
    case smallArrow = "small-arrow"
}

struct HomeProfileContent: Equatable, Sendable {
    let initials: String
    let displayName: String
    let roleLabel: String
    let availableProfileCount: Int

    init(user: AuthenticatedUser?) {
        initials = Self.initials(for: user)
        displayName = Self.displayName(for: user)
        roleLabel = Self.roleLabel(for: user?.role)
        availableProfileCount = max(Self.uniqueRoleLabels(for: user?.availableRoles).count, 1)
    }

    private static func displayName(for user: AuthenticatedUser?) -> String {
        let names = [user?.firstName, user?.lastName]
            .compactMap { $0?.trimmedForDisplay }
            .filter { $0.isEmpty == false }

        if names.isEmpty == false {
            return names.joined(separator: " ")
        }

        let email = user?.email.trimmedForDisplay ?? ""
        return email.isEmpty ? "Member" : email
    }

    private static func initials(for user: AuthenticatedUser?) -> String {
        let firstInitial = firstDisplayCharacter(in: user?.firstName)
        let lastInitial = firstDisplayCharacter(in: user?.lastName)

        if let firstInitial, let lastInitial {
            return "\(firstInitial)\(lastInitial)"
        }

        if let firstInitial {
            return firstInitial
        }

        let emailName = user?.email.split(separator: "@").first.map(String.init) ?? ""
        let fallback = emailName.filter { $0.isLetter || $0.isNumber }
        let initials = String(fallback.prefix(2)).uppercased()
        return initials.isEmpty ? "DA" : initials
    }

    private static func firstDisplayCharacter(in value: String?) -> String? {
        let trimmed = value?.trimmedForDisplay ?? ""
        return trimmed.first.map { String($0).uppercased() }
    }

    private static func roleLabel(for role: String?) -> String {
        switch role?.lowercased() {
        case "member", "pro":
            return "Member"
        case "notary":
            return "Notary"
        case "admin":
            return "Member"
        default:
            return "Member"
        }
    }

    private static func uniqueRoleLabels(for roles: [String]?) -> [String] {
        var labels: [String] = []

        for role in roles ?? [] {
            let label = roleLabel(for: role)
            if labels.contains(label) == false {
                labels.append(label)
            }
        }

        return labels
    }
}

private extension String {
    var trimmedForDisplay: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}