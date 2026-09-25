// Local rendering only: no provider calls, account reads or email delivery.
import {mkdirSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {renderNotificationTemplate} from "../src/services/notificationTemplateRenderService";

const output = resolve(process.argv[2] ?? "/private/tmp/darci-email-preview");
mkdirSync(output, {recursive: true});
const rendered = renderNotificationTemplate({
  template: {
    templateKey: "document_ready_for_review_email", audienceScope: "registrant",
    subjectTemplate: "Your documents are ready for review",
    bodyFormat: "markdown",
    bodyTemplate: "Hi {{firstName}},\n\nYour documents are ready for review.\n\nPlease take a few minutes to look them over carefully before you approve them for signing:\n{{reviewUrl}}\n\nIf something does not look right, do not approve yet. You can return to your dashboard, update your information, and regenerate the document set.\n\nQuestions? We are happy to help.\n\n- Your DARCi Team",
  },
  payload: {firstName: "Jorge", reviewUrl: "https://app.illuminotary.com/app/review?documentId=synthetic-preview"},
});
writeFileSync(resolve(output, "document-review.html"), rendered.html);
writeFileSync(resolve(output, "document-review.txt"), rendered.text);
console.log(`Local preview (not sent): ${resolve(output, "document-review.html")}`);
