const { SNSClient, CreateSMSSandboxPhoneNumberCommand, ListSMSSandboxPhoneNumbersCommand } = require("@aws-sdk/client-sns");

const phoneNumbers = ["+17077877170", "+14154305306", "+16143093410"];
const client = new SNSClient({ region: "us-east-1" });

async function run() {
  for (const phoneNumber of phoneNumbers) {
    try {
      const res = await client.send(new CreateSMSSandboxPhoneNumberCommand({
        PhoneNumber: phoneNumber,
        LanguageCode: "en-US"
      }));
      console.log(\`\${phoneNumber}: Success (RequestId: \${res.$metadata.requestId})\`);
    } catch (err) {
      console.log(\`\${phoneNumber}: Error \${err.name} - \${err.message} (RequestId: \${err.$metadata?.requestId})\`);
    }
  }

  try {
    const listRes = await client.send(new ListSMSSandboxPhoneNumbersCommand({}));
    console.log("\nSandbox Phone Statuses:");
    if (listRes.PhoneNumbers) {
      listRes.PhoneNumbers.forEach(p => {
        const masked = p.PhoneNumber.replace(/.(?=.{2})/g, "*");
        console.log(\`\${masked}: \${p.Status}\`);
      });
    }
  } catch (err) {
    console.log(\`List Error: \${err.message}\`);
  }
}

run();
