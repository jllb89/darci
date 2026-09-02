import SwiftUI

struct MemberBillingView: View {
    private let designWidth: CGFloat = 440

    let session: AuthSession
    let returnEvent: MemberBillingReturn?
    let onBack: () -> Void
    let onShowTerms: () -> Void
    let onShowPrivacy: () -> Void
    let onContactSupport: () -> Void

    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @StateObject private var viewModel: MemberBillingViewModel

    init(
        session: AuthSession,
        apiClient: MemberBillingAPIProviding,
        refreshSession: @escaping () async -> AuthSession?,
        returnEvent: MemberBillingReturn?,
        onMembershipUpdated: @escaping (MemberMembershipPayload) -> Void = { _ in },
        onBack: @escaping () -> Void,
        onShowTerms: @escaping () -> Void,
        onShowPrivacy: @escaping () -> Void,
        onContactSupport: @escaping () -> Void
    ) {
        self.session = session
        self.returnEvent = returnEvent
        self.onBack = onBack
        self.onShowTerms = onShowTerms
        self.onShowPrivacy = onShowPrivacy
        self.onContactSupport = onContactSupport
        _viewModel = StateObject(
            wrappedValue: MemberBillingViewModel(
                accessToken: session.accessToken,
                apiClient: apiClient,
                refreshSession: refreshSession,
                onMembershipUpdated: onMembershipUpdated
            )
        )
    }

    var body: some View {
        GeometryReader { proxy in
            Group {
                if let membership = viewModel.membership, membership.isActive {
                    activeMembership(membership, proxy: proxy)
                } else if let membership = viewModel.membership, membership.isPendingActivation {
                    statusScreen(
                        eyebrow: "ACTIVATION PENDING",
                        title: "Stripe is confirming your membership",
                        body: "Checkout is complete. Access activates as soon as DARCi receives the signed Stripe webhook.",
                        membership: membership,
                        showsSpinner: true,
                        proxy: proxy
                    )
                } else if let membership = viewModel.membership, membership.needsRecovery {
                    recoveryScreen(membership, proxy: proxy)
                } else {
                    paywall(proxy: proxy)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background((viewModel.membership?.isActive == true ? Color.black : Color.white).ignoresSafeArea())
        .task {
            await viewModel.load()
            if let result = returnEvent?.result {
                await viewModel.handleReturn(result)
            }
        }
        .onChange(of: session.accessToken) { _, accessToken in
            viewModel.updateAccessToken(accessToken)
        }
        .onChange(of: returnEvent?.id) { _, _ in
            guard let result = returnEvent?.result else { return }
            Task { await viewModel.handleReturn(result) }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await viewModel.refreshAfterReturningToApp() }
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    private func paywall(proxy: GeometryProxy) -> some View {
        let scale = widthScale(in: proxy)

        return VStack(spacing: 0) {
            billingNavigation(proxy: proxy)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("DARCi MEMBERSHIP")
                        .font(DARCiFont.maisonNeue(.book, size: 9 * scale))
                        .foregroundStyle(.black)

                    Text("Make it official.")
                        .font(DARCiFont.maisonNeue(.medium, size: 32 * scale))
                        .tracking(-0.35 * scale)
                        .foregroundStyle(.black)
                        .padding(.top, 10 * scale)

                    Text("Create, sign and notarize the documents that protect what matters—without losing the human notary step.")
                        .font(DARCiFont.maisonNeue(.book, size: 13 * scale))
                        .lineSpacing(5 * scale)
                        .foregroundStyle(Color.black.opacity(0.47))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 7 * scale)

                    VStack(alignment: .leading, spacing: 16 * scale) {
                        billingBenefit("Trusts, POAs & uploaded documents", scale: scale)
                        billingBenefit("Guided signing + in-person notarization", scale: scale)
                        billingBenefit("Sealed final package + verifiable proof", scale: scale)
                    }
                    .padding(.top, 32 * scale)

                    Text("Choose your monthly document allowance:")
                        .font(DARCiFont.maisonNeue(.book, size: 12 * scale))
                        .foregroundStyle(.black)
                        .padding(.top, 29 * scale)

                    VStack(spacing: 9 * scale) {
                        ForEach(viewModel.plans) { plan in
                            billingPlanRow(plan, scale: scale)
                        }
                    }
                    .padding(.top, 22 * scale)

                    if let errorMessage = viewModel.errorMessage {
                        billingError(errorMessage, scale: scale)
                            .padding(.top, 14 * scale)
                    }
                }
                .padding(.top, 28 * scale)
                .padding(.bottom, 24 * scale)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)

            paywallFooter(scale: scale)
        }
        .padding(.horizontal, 29 * scale)
        .background(Color.white)
    }

    private func billingNavigation(proxy: GeometryProxy, onDark: Bool = false) -> some View {
        let scale = widthScale(in: proxy)

        return HStack(spacing: 0) {
            Button(action: onBack) {
                Image(systemName: "xmark")
                    .font(.system(size: 14 * scale, weight: .light))
                    .foregroundStyle(onDark ? Color.white : Color.black)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close billing")
            .accessibilityIdentifier("member-billing-close-button")

            Spacer(minLength: 0)

            HStack(spacing: 0) {
                Text("PRIVATE BETA · TEST MODE")
                    .font(DARCiFont.maisonNeue(.mono, size: 9 * scale))
                    .tracking(0.35 * scale)
                    .foregroundStyle(onDark ? Color.white.opacity(0.72) : Color.black.opacity(0.78))
            }
            .padding(.horizontal, 11 * scale)
            .frame(minHeight: 24 * scale)
            .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 4 * scale : 0)
            .background(onDark ? Color.white.opacity(0.12) : Color(red: 0.94, green: 0.94, blue: 0.94))
            .clipShape(Capsule())
        }
        .frame(minHeight: 44 * scale)
        .padding(.top, 1 * scale)
    }

    private func billingBenefit(_ title: String, scale: CGFloat) -> some View {
        HStack(spacing: 12 * scale) {
            ZStack {
                Circle()
                    .fill(DARCiTheme.onboardingGreen)

                DARCiCheckIcon()
                    .stroke(.black, style: StrokeStyle(lineWidth: 1.7 * scale, lineCap: .square, lineJoin: .miter))
                    .padding(5.5 * scale)
            }
            .frame(width: 20 * scale, height: 20 * scale)

            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 13 * scale))
                .foregroundStyle(.black)
        }
    }

    private func billingPlanRow(_ plan: MemberBillingPlan, scale: CGFloat) -> some View {
        let isSelected = viewModel.selectedPriceCode == plan.priceCode

        return Button {
            viewModel.selectedPriceCode = plan.priceCode
        } label: {
            HStack(spacing: 0) {
                Circle()
                    .fill(isSelected ? DARCiTheme.onboardingGreen : Color.clear)
                    .overlay {
                        Circle()
                            .stroke(isSelected ? DARCiTheme.onboardingGreen : Color.black.opacity(0.25), lineWidth: 1.5 * scale)
                    }
                    .frame(width: 19 * scale, height: 19 * scale)

                VStack(alignment: .leading, spacing: 3 * scale) {
                    Text(plan.displayName)
                        .font(DARCiFont.maisonNeue(.medium, size: 14 * scale))
                        .foregroundStyle(isSelected ? Color.white : Color.black)

                    Text("\(plan.documentWorkflowAllowance) documents / month")
                        .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                        .foregroundStyle(isSelected ? Color.white.opacity(0.58) : Color.black.opacity(0.42))
                }
                .padding(.leading, 18 * scale)

                Spacer(minLength: 8 * scale)

                VStack(alignment: .trailing, spacing: 3 * scale) {
                    Text(formattedPrice(plan))
                        .font(DARCiFont.maisonNeue(.medium, size: 14 * scale))
                        .foregroundStyle(isSelected ? Color.white : Color.black)

                    Text("per month")
                        .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                        .foregroundStyle(isSelected ? Color.white.opacity(0.58) : Color.black.opacity(0.42))
                }
            }
            .padding(.horizontal, 15 * scale)
            .frame(minHeight: 68 * scale)
            .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 8 * scale : 0)
            .background(isSelected ? Color.black : Color.white)
            .overlay {
                RoundedRectangle(cornerRadius: 12 * scale, style: .continuous)
                    .stroke(
                        isSelected ? DARCiTheme.onboardingGreen : Color.black.opacity(0.28),
                        lineWidth: isSelected ? 2.5 * scale : 1 * scale
                    )
            }
            .clipShape(RoundedRectangle(cornerRadius: 12 * scale, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 12 * scale, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(plan.displayName), \(plan.documentWorkflowAllowance) documents per month, \(formattedPrice(plan))")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("member-billing-plan-\(plan.priceCode)")
    }

    private func paywallFooter(scale: CGFloat) -> some View {
        let plan = selectedPlan

        return VStack(spacing: 0) {
            if viewModel.payload?.actions.iosCheckoutAvailable == true {
                Button {
                    Task {
                        guard let url = await viewModel.createCheckout() else { return }
                        openURL(url)
                    }
                } label: {
                    Text(viewModel.startingPriceCode == nil
                        ? "Continue with \(plan.displayName) · \(formattedPrice(plan))/mo"
                        : "Opening Stripe…")
                        .font(DARCiFont.maisonNeue(.medium, size: 15 * scale))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 56 * scale)
                        .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 6 * scale : 0)
                        .background(Color.black)
                }
                .buttonStyle(.plain)
                .disabled(viewModel.canCheckout == false || viewModel.startingPriceCode != nil)
                .opacity(viewModel.isLoading && viewModel.payload == nil ? 0.55 : 1)
                .accessibilityIdentifier("member-billing-checkout-button")
            } else {
                Text("Membership purchase is unavailable in this iOS build while App Review classification is pending.")
                    .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                    .lineSpacing(3 * scale)
                    .foregroundStyle(Color.black.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12 * scale)
                    .accessibilityIdentifier("member-billing-purchase-policy-notice")
            }

            Text("\(plan.documentWorkflowAllowance) documents every month · No rollover")
                .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                .foregroundStyle(Color.black.opacity(0.45))
                .padding(.top, 11 * scale)

            Text("Stripe test mode — no real charge")
                .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                .foregroundStyle(Color.black.opacity(0.45))
                .padding(.top, 3 * scale)

            Button {
                Task {
                    if viewModel.payload?.actions.canOpenPortal == true,
                       let url = await viewModel.createPortalSession() {
                        openURL(url)
                    } else {
                        await viewModel.load()
                    }
                }
            } label: {
                Text("Already subscribed? Manage billing")
                    .font(DARCiFont.maisonNeue(.medium, size: 11 * scale))
                    .foregroundStyle(.black)
                    .underline()
            }
            .buttonStyle(.plain)
            .padding(.top, 10 * scale)
            .accessibilityIdentifier("member-billing-existing-subscription-button")

            Button("Not now", action: onBack)
                .buttonStyle(.plain)
                .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                .foregroundStyle(Color.black.opacity(0.55))
                .padding(.top, 12 * scale)
                .accessibilityIdentifier("member-billing-not-now-button")

            HStack(spacing: 5 * scale) {
                Button("Terms", action: onShowTerms)
                Text("·")
                Button("Privacy", action: onShowPrivacy)
                Text("·")
                Text("Cancel anytime")
            }
            .buttonStyle(.plain)
            .font(DARCiFont.maisonNeue(.book, size: 9 * scale))
            .foregroundStyle(Color.black.opacity(0.42))
            .padding(.top, 13 * scale)
            .padding(.bottom, 40 * scale)
        }
        .background(Color.white)
    }

    private func activeMembership(
        _ membership: MemberMembershipPayload.Membership,
        proxy: GeometryProxy
    ) -> some View {
        let scale = widthScale(in: proxy)
        let plan = currentPlan(for: membership)
        let total = membership.allowance.total
        let used = membership.allowance.used
        let progress = total.map { $0 > 0 ? min(CGFloat(used) / CGFloat($0), 1) : 0 } ?? 0

        return VStack(spacing: 0) {
            billingNavigation(proxy: proxy, onDark: true)

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("BILLING")
                        .font(DARCiFont.maisonNeue(.light, size: 9 * scale))
                        .foregroundStyle(Color.white.opacity(0.62))

                    Text("Your membership.")
                        .font(DARCiFont.maisonNeue(.book, size: 32 * scale))
                        .foregroundStyle(.white)
                        .padding(.top, 10 * scale)

                    Text("Manage usage, payment methods, invoices and cancellation from one place.")
                        .font(DARCiFont.maisonNeue(.book, size: 13 * scale))
                        .lineSpacing(5 * scale)
                        .foregroundStyle(Color.white.opacity(0.52))
                        .padding(.top, 7 * scale)

                    if membership.cancelAtPeriodEnd {
                        billingNotice(
                            title: "Membership scheduled to end",
                            body: "Your plan will remain active through \(formattedDate(membership.currentPeriodEnd)).",
                            foreground: .black,
                            background: DARCiTheme.onboardingGreen,
                            scale: scale
                        )
                        .padding(.top, 22 * scale)
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .top, spacing: 12 * scale) {
                            VStack(alignment: .leading, spacing: 4 * scale) {
                                Text(membership.planName ?? plan?.displayName ?? "DARCi membership")
                                    .font(DARCiFont.maisonNeue(.book, size: 20 * scale))

                                Text(plan.map { "\(formattedPrice($0)) per month" } ?? "Monthly membership")
                                    .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                                    .foregroundStyle(Color.black.opacity(0.55))
                            }

                            Spacer(minLength: 0)

                            HStack(spacing: 6 * scale) {
                                Circle()
                                    .fill(.black)
                                    .frame(width: 6 * scale, height: 6 * scale)
                                Text(statusLabel(membership.state).uppercased())
                                    .font(DARCiFont.abcMono(size: 9 * scale))
                            }
                        }

                        HStack(alignment: .lastTextBaseline) {
                            Text("Document usage")
                                .font(DARCiFont.maisonNeue(.book, size: 12 * scale))
                            Spacer()
                            Text(total.map { "\(used) of \($0) used" } ?? "\(used) used")
                                .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                                .foregroundStyle(Color.black.opacity(0.55))
                        }
                        .padding(.top, 30 * scale)

                        GeometryReader { barProxy in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color.black.opacity(0.16))
                                Capsule()
                                    .fill(.black)
                                    .frame(width: barProxy.size.width * progress)
                            }
                        }
                        .frame(height: 7 * scale)
                        .padding(.top, 11 * scale)

                        Text(remainingCopy(membership.allowance))
                            .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                            .foregroundStyle(Color.black.opacity(0.55))
                            .padding(.top, 8 * scale)
                    }
                    .foregroundStyle(.black)
                    .padding(20 * scale)
                    .background(DARCiTheme.onboardingGreen)
                    .padding(.top, 27 * scale)
                    .accessibilityIdentifier("member-billing-active-plan-card")

                    Text("MEMBERSHIP DETAILS")
                        .font(DARCiFont.abcMono(size: 9 * scale))
                        .foregroundStyle(Color.white.opacity(0.52))
                        .padding(.top, 30 * scale)

                    VStack(spacing: 0) {
                        statusRow("Subscription status", value: statusLabel(membership.state), scale: scale)
                        Rectangle()
                            .fill(Color.white.opacity(0.22))
                            .frame(height: 0.5)
                        statusRow(
                            "Current period",
                            value: "\(formattedDate(membership.currentPeriodStart)) – \(formattedDate(membership.currentPeriodEnd))",
                            scale: scale
                        )
                        Rectangle()
                            .fill(Color.white.opacity(0.22))
                            .frame(height: 0.5)
                        statusRow(
                            "Renewal",
                            value: membership.cancelAtPeriodEnd ? "Will not renew" : formattedDate(membership.currentPeriodEnd),
                            scale: scale
                        )
                    }
                    .padding(.top, 10 * scale)

                    if membership.allowance.exhausted {
                        billingNotice(
                            title: "Monthly allowance reached",
                            body: "New workflows become available when the period renews. Already accepted notary work can still finish.",
                            foreground: .white,
                            background: Color.white.opacity(0.10),
                            scale: scale
                        )
                        .padding(.top, 18 * scale)
                    }

                    if membership.heldFinalPackageCount > 0 {
                        billingNotice(
                            title: "\(membership.heldFinalPackageCount) final package\(membership.heldFinalPackageCount == 1 ? " is" : "s are") safely held",
                            body: "Completed files remain preserved. Access resumes while membership is active.",
                            foreground: .white,
                            background: Color.white.opacity(0.10),
                            scale: scale
                        )
                        .padding(.top, 18 * scale)
                    }

                    if let errorMessage = viewModel.errorMessage {
                        billingError(errorMessage, scale: scale)
                            .padding(.top, 18 * scale)
                    }

                    Button {
                        Task {
                            guard let url = await viewModel.createPortalSession() else { return }
                            openURL(url)
                        }
                    } label: {
                        Text(viewModel.isOpeningPortal ? "Opening Stripe…" : "Manage billing in Stripe")
                            .font(DARCiFont.maisonNeue(.book, size: 15 * scale))
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: 56 * scale)
                            .padding(.vertical, dynamicTypeSize.isAccessibilitySize ? 6 * scale : 0)
                            .background(DARCiTheme.onboardingGreen)
                    }
                    .buttonStyle(.plain)
                    .disabled(viewModel.isOpeningPortal || viewModel.payload?.actions.canOpenPortal != true)
                    .opacity(viewModel.isOpeningPortal || viewModel.payload?.actions.canOpenPortal != true ? 0.48 : 1)
                    .padding(.top, 26 * scale)
                    .accessibilityIdentifier("member-billing-portal-button")

                    Text("Stripe manages payment methods, invoice history and cancellation. Plan switching is unavailable during private beta.")
                        .font(DARCiFont.maisonNeue(.book, size: 10 * scale))
                        .lineSpacing(3 * scale)
                        .foregroundStyle(Color.white.opacity(0.42))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12 * scale)

                    Button("Need help? Contact support", action: onContactSupport)
                        .buttonStyle(.plain)
                        .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                        .foregroundStyle(.white)
                        .underline()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 14 * scale)
                        .padding(.bottom, 28 * scale)
                }
                .padding(.top, 28 * scale)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, 25 * scale)
        .background(Color.black)
        .accessibilityIdentifier("member-billing-active-screen")
    }

    private func recoveryScreen(
        _ membership: MemberMembershipPayload.Membership,
        proxy: GeometryProxy
    ) -> some View {
        let copy = recoveryCopy(for: membership.state)
        return statusScreen(
            eyebrow: statusLabel(membership.state).uppercased(),
            title: copy.title,
            body: copy.body + " A document already accepted by a notary can still finish its scheduled session; its sealed final package stays held until membership is restored.",
            membership: membership,
            showsSpinner: false,
            proxy: proxy
        )
    }

    private func statusScreen(
        eyebrow: String,
        title: String,
        body: String,
        membership: MemberMembershipPayload.Membership,
        showsSpinner: Bool,
        proxy: GeometryProxy
    ) -> some View {
        let scale = widthScale(in: proxy)

        return VStack(spacing: 0) {
            billingNavigation(proxy: proxy)

            ScrollView(showsIndicators: true) {
                VStack(spacing: 0) {
                    Spacer(minLength: 30 * scale)

                    VStack(spacing: 0) {
                        if showsSpinner {
                            ProgressView()
                                .tint(.black)
                                .controlSize(.regular)
                                .padding(.bottom, 26 * scale)
                        } else {
                            Circle()
                                .fill(DARCiTheme.onboardingGreen)
                                .frame(width: 20 * scale, height: 20 * scale)
                                .padding(.bottom, 26 * scale)
                        }

                        Text(eyebrow)
                            .font(DARCiFont.maisonNeue(.mono, size: 9 * scale))
                            .tracking(0.6 * scale)

                        Text(title)
                            .font(DARCiFont.maisonNeue(.medium, size: 28 * scale))
                            .tracking(-0.2 * scale)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12 * scale)

                        Text(body)
                            .font(DARCiFont.maisonNeue(.book, size: 13 * scale))
                            .lineSpacing(5 * scale)
                            .foregroundStyle(Color.black.opacity(0.50))
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12 * scale)

                        if let errorMessage = viewModel.errorMessage {
                            billingError(errorMessage, scale: scale)
                                .padding(.top, 20 * scale)
                        }
                    }

                    Spacer(minLength: 30 * scale)

                    if showsSpinner {
                        Button("Check again") {
                            Task { await viewModel.load() }
                        }
                        .buttonStyle(BillingPrimaryButtonStyle(scale: scale))
                        .accessibilityIdentifier("member-billing-refresh-button")
                    } else if viewModel.payload?.actions.canOpenPortal == true {
                        Button(viewModel.isOpeningPortal ? "Opening Stripe…" : "Manage billing in Stripe") {
                            Task {
                                guard let url = await viewModel.createPortalSession() else { return }
                                openURL(url)
                            }
                        }
                        .buttonStyle(BillingPrimaryButtonStyle(scale: scale))
                        .disabled(viewModel.isOpeningPortal)
                        .accessibilityIdentifier("member-billing-recovery-portal-button")
                    }

                    Button("Contact support", action: onContactSupport)
                        .buttonStyle(.plain)
                        .font(DARCiFont.maisonNeue(.medium, size: 11 * scale))
                        .underline()
                        .padding(.top, 16 * scale)
                        .padding(.bottom, max(24 * scale, proxy.safeAreaInsets.bottom))
                }
                .frame(maxWidth: .infinity, minHeight: max(proxy.size.height - (41 * scale), 0))
            }
        }
        .padding(.horizontal, 29 * scale)
        .background(Color.white)
    }

    private func statusRow(_ title: String, value: String, scale: CGFloat) -> some View {
        HStack(alignment: .center, spacing: 16 * scale) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                .foregroundStyle(Color.white.opacity(0.52))
            Spacer(minLength: 0)
            Text(value)
                .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
        }
        .frame(minHeight: 47 * scale)
    }

    private func billingNotice(
        title: String,
        body: String,
        foreground: Color,
        background: Color,
        scale: CGFloat
    ) -> some View {
        VStack(alignment: .leading, spacing: 5 * scale) {
            Text(title)
                .font(DARCiFont.maisonNeue(.book, size: 12 * scale))
            Text(body)
                .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                .lineSpacing(3 * scale)
                .opacity(0.62)
        }
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16 * scale)
        .background(background)
    }

    private func billingError(_ message: String, scale: CGFloat) -> some View {
        HStack(alignment: .top, spacing: 10 * scale) {
            Text(message)
                .font(DARCiFont.maisonNeue(.book, size: 11 * scale))
                .lineSpacing(3 * scale)
            Spacer(minLength: 0)
            Button("Retry") {
                Task { await viewModel.load() }
            }
            .buttonStyle(.plain)
            .font(DARCiFont.maisonNeue(.medium, size: 11 * scale))
            .underline()
        }
        .foregroundStyle(Color(red: 0.52, green: 0.16, blue: 0.16))
        .padding(12 * scale)
        .background(Color(red: 1, green: 0.96, blue: 0.96))
        .overlay {
            RoundedRectangle(cornerRadius: 8 * scale, style: .continuous)
                .stroke(Color(red: 0.78, green: 0.48, blue: 0.48), lineWidth: 1)
        }
    }

    private var selectedPlan: MemberBillingPlan {
        viewModel.plans.first(where: { $0.priceCode == viewModel.selectedPriceCode })
            ?? viewModel.plans.first
            ?? MemberBillingPlan.fallbackPlans[1]
    }

    private func currentPlan(for membership: MemberMembershipPayload.Membership) -> MemberBillingPlan? {
        viewModel.plans.first(where: { $0.priceCode == membership.priceCode })
    }

    private func formattedPrice(_ plan: MemberBillingPlan) -> String {
        let amount = Decimal(plan.unitAmountCents) / 100
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.locale = Locale(identifier: "en_US")
        formatter.currencyCode = plan.currencyCode
        formatter.maximumFractionDigits = 0
        return formatter.string(from: amount as NSDecimalNumber) ?? "$\(plan.unitAmountCents / 100)"
    }

    private func formattedDate(_ value: String?) -> String {
        guard let value else { return "Not available" }
        let fractionalParser = ISO8601DateFormatter()
        fractionalParser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let standardParser = ISO8601DateFormatter()
        guard let date = fractionalParser.date(from: value) ?? standardParser.date(from: value) else {
            return "Not available"
        }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    private func statusLabel(_ state: String) -> String {
        switch state {
        case "trialing": return "Trial active"
        case "activation_pending", "pending": return "Activating"
        default: return state.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    private func remainingCopy(_ allowance: MemberMembershipPayload.Allowance) -> String {
        guard let remaining = allowance.remaining else {
            return "Usage updates whenever a document workflow begins."
        }
        return "\(remaining) document\(remaining == 1 ? "" : "s") remaining in the current period."
    }

    private func recoveryCopy(for state: String) -> (title: String, body: String) {
        switch state {
        case "paused":
            return ("Your membership is paused", "Open the billing portal to restore your membership and completed final-package access.")
        case "incomplete":
            return ("Your membership setup is incomplete", "Finish the required payment step in Stripe to activate your document allowance.")
        case "unpaid":
            return ("Your membership is unpaid", "Resolve the outstanding payment in Stripe to restore membership access.")
        case "canceled":
            return ("Your membership has ended", "Your completed records remain preserved. Restore billing if a recovery option is available.")
        case "expired":
            return ("Your membership has expired", "Restore billing to regain access to held final packages.")
        default:
            return ("Your payment needs attention", "Update your billing details to restore membership access and release completed final packages.")
        }
    }

    private func widthScale(in proxy: GeometryProxy) -> CGFloat {
        min(proxy.size.width / designWidth, 1.08)
    }
}

private struct BillingPrimaryButtonStyle: ButtonStyle {
    let scale: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(DARCiFont.maisonNeue(.medium, size: 15 * scale))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 56 * scale)
            .background(Color.black.opacity(configuration.isPressed ? 0.76 : 1))
    }
}
