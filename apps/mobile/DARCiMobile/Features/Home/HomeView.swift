import SwiftUI

struct HomeView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                statusSummary
                sectionMap
            }
            .padding(24)
        }
        .background(DARCiTheme.background.ignoresSafeArea())
        .navigationTitle("DARCi")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("DARCi")
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .foregroundStyle(DARCiTheme.ink)

            Text("Trust workflows, signatures, and notarization steps in one mobile workspace.")
                .font(.subheadline)
                .foregroundStyle(DARCiTheme.mutedInk)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var statusSummary: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
            SummaryTile(title: "Open", value: "0", systemImage: "doc.badge.clock")
            SummaryTile(title: "Ready", value: "0", systemImage: "signature")
            SummaryTile(title: "Meeting", value: "0", systemImage: "person.2.wave.2")
            SummaryTile(title: "Done", value: "0", systemImage: "checkmark.seal")
        }
    }

    private var sectionMap: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Mobile sections", systemImage: "rectangle.grid.2x2")
                .font(.headline)
                .foregroundStyle(DARCiTheme.ink)

            VStack(spacing: 10) {
                ForEach(AppSection.allCases) { section in
                    HStack(spacing: 12) {
                        Image(systemName: section.systemImage)
                            .font(.body.weight(.semibold))
                            .foregroundStyle(DARCiTheme.accent)
                            .frame(width: 24)

                        Text(section.title)
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(DARCiTheme.ink)

                        Spacer()

                        if section.isPrimaryTab {
                            Text("Tab")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(DARCiTheme.accent)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(DARCiTheme.accent.opacity(0.10), in: Capsule())
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DARCiTheme.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(DARCiTheme.accent.opacity(0.12), lineWidth: 1)
        }
    }
}

private struct SummaryTile: View {
    let title: String
    let value: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3.weight(.semibold))
                .foregroundStyle(DARCiTheme.accent)

            VStack(alignment: .leading, spacing: 4) {
                Text(value)
                    .font(.system(.title, design: .rounded).weight(.bold))
                    .foregroundStyle(DARCiTheme.ink)

                Text(title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(DARCiTheme.mutedInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(DARCiTheme.panel, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Circle()
                .fill(DARCiTheme.gold.opacity(0.14))
                .frame(width: 34, height: 34)
                .offset(x: 10, y: -10)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

#Preview {
    NavigationStack {
        HomeView()
    }
}
