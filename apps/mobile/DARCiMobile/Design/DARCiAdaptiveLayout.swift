import CoreGraphics

enum DARCiAdaptiveLayout {
    static func contentFittingSheetHeight(
        contentHeight: CGFloat,
        actionsHeight: CGFloat,
        viewportHeight: CGFloat
    ) -> CGFloat {
        // Measure natural content, not the scroll viewport, to avoid a sizing loop.
        // Long lists scroll; the footer remains pinned and the page stays visible.
        let maximum = max(0, viewportHeight * 0.82)
        return min(maximum, max(240, ceil(contentHeight + actionsHeight)))
    }

    // Keyboard avoidance must reduce the scroll viewport, not font/control sizes.
    static func authenticationScale(viewportWidth: CGFloat) -> CGFloat {
        min(viewportWidth / 440, 1)
    }

    static func shouldStackActions(
        viewportWidth: CGFloat,
        isAccessibilityText: Bool
    ) -> Bool {
        isAccessibilityText || viewportWidth < 350
    }

    static func boundedPanelHeight(
        viewportHeight: CGFloat,
        bottomInset: CGFloat,
        preferredRatio: CGFloat,
        minimumHeight: CGFloat,
        maximumHeight: CGFloat,
        topClearance: CGFloat
    ) -> CGFloat {
        let availableHeight = max(0, viewportHeight - bottomInset - topClearance)
        let preferredHeight = min(
            max(viewportHeight * preferredRatio, minimumHeight),
            maximumHeight
        )
        return min(preferredHeight, availableHeight)
    }

    static func dockedKeyboardOverlap(
        screenBounds: CGRect,
        keyboardFrame: CGRect
    ) -> CGFloat {
        guard screenBounds.isEmpty == false,
              keyboardFrame.isEmpty == false,
              keyboardFrame.maxY >= screenBounds.maxY - 1,
              keyboardFrame.width >= screenBounds.width * 0.8
        else {
            return 0
        }

        return max(0, screenBounds.intersection(keyboardFrame).height)
    }
}
