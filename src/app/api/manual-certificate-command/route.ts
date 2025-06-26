// app/api/manual-certificate-command/route.ts
import { NextRequest, NextResponse } from "next/server";

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

interface ManualCertificateRequest {
  domain: string;
  email: string;
  includeWildcard?: boolean;
  dnsRecords?: DnsRecord[];
}

interface ManualCertificateSuccessResponse {
  success: true;
  domain: string;
  certName: string;
  manualCommand: string;
  stepByStepInstructions: string[];
  dnsRecordsNeeded: DnsRecord[];
  troubleshootingTips: string[];
  certificatePaths: {
    fullchain: string;
    privkey: string;
    cert: string;
    chain: string;
  };
  renewalCommand: string;
}

interface ManualCertificateErrorResponse {
  success: false;
  error: string;
}

type ManualCertificateResponse =
  | ManualCertificateSuccessResponse
  | ManualCertificateErrorResponse;

export async function POST(
  request: NextRequest
): Promise<NextResponse<ManualCertificateResponse>> {
  try {
    const body: ManualCertificateRequest = await request.json();
    const { domain, email, includeWildcard = false, dnsRecords = [] } = body;

    if (!domain || !email) {
      return NextResponse.json<ManualCertificateErrorResponse>(
        { success: false, error: "Domain and email are required" },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return NextResponse.json<ManualCertificateErrorResponse>(
        { success: false, error: "Invalid domain format" },
        { status: 400 }
      );
    }

    console.log(`Generating manual certificate command for domain: ${domain}`);

    // Build domains array
    const domains: string[] = includeWildcard
      ? [domain, `*.${domain}`]
      : [domain];
    const certName: string = domain.replace(/\*\./g, "wildcard-");

    // Generate DNS records template if not provided
    const dnsRecordsNeeded: DnsRecord[] =
      dnsRecords.length > 0
        ? dnsRecords
        : domains.map((d: string) => {
            const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
            return {
              name: `_acme-challenge.${challengeDomain}`,
              type: "TXT",
              value: "[VALUE_WILL_BE_SHOWN_BY_CERTBOT]",
              domain: challengeDomain,
            };
          });

    // Build the manual certbot command
    const domainArgs = domains.map((d: string) => `-d "${d}"`).join(" ");
    const manualCommand = `sudo certbot certonly \\
  --manual \\
  --preferred-challenges dns \\
  --email "${email}" \\
  --agree-tos \\
  --cert-name "${certName}" \\
  --manual-public-ip-logging-ok \\
  ${domainArgs}`;

    // Step-by-step instructions
    const stepByStepInstructions: string[] = [
      `SSH into your server where certbot is installed`,
      `Run the following command:`,
      `${manualCommand}`,
      `Certbot will show you the exact DNS TXT record(s) to add`,
      `Add each DNS TXT record to your domain's DNS settings:`,
      ...dnsRecordsNeeded.map(
        (record, index) =>
          `  ${index + 1}. Name: ${
            record.name
          }, Type: TXT, Value: [shown by certbot]`
      ),
      `Wait 5-10 minutes for DNS propagation`,
      `Press Enter in the certbot prompt to continue verification`,
      `Certbot will verify the DNS records and generate certificates`,
      `Your certificates will be saved to /etc/letsencrypt/live/${certName}/`,
    ];

    // Certificate file paths
    const certificatePaths = {
      fullchain: `/etc/letsencrypt/live/${certName}/fullchain.pem`,
      privkey: `/etc/letsencrypt/live/${certName}/privkey.pem`,
      cert: `/etc/letsencrypt/live/${certName}/cert.pem`,
      chain: `/etc/letsencrypt/live/${certName}/chain.pem`,
    };

    // Renewal command
    const renewalCommand = `sudo certbot renew --cert-name "${certName}"`;

    // Troubleshooting tips
    const troubleshootingTips: string[] = [
      "Make sure certbot is installed: sudo apt install certbot",
      "Ensure you have sudo privileges on the server",
      "Verify the domain is accessible from the internet",
      "Check that port 53 (DNS) is not blocked by firewall",
      "Use online DNS propagation checkers to verify records",
      "If wildcard certificate fails, try without wildcard first",
      "For rate limit issues, wait 1 hour before retrying",
      "Check /var/log/letsencrypt/letsencrypt.log for detailed errors",
      "Ensure DNS records are added to the ROOT domain, not a subdomain",
      "Remove any conflicting DNS records before adding new ones",
    ];

    return NextResponse.json<ManualCertificateSuccessResponse>({
      success: true,
      domain,
      certName,
      manualCommand,
      stepByStepInstructions,
      dnsRecordsNeeded,
      troubleshootingTips,
      certificatePaths,
      renewalCommand,
    });
  } catch (error) {
    console.error(`Manual certificate command generation error:`, error);
    return NextResponse.json<ManualCertificateErrorResponse>(
      {
        success: false,
        error: `Internal server error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}

// // app/api/manual-certificate-command/route.ts
// import { NextRequest, NextResponse } from "next/server";

// interface DnsRecord {
//   name: string;
//   type: string;
//   value: string;
//   domain: string;
// }

// interface ManualCertificateRequest {
//   domain: string;
//   email: string;
//   includeWildcard?: boolean;
//   dnsRecords?: DnsRecord[];
// }

// interface ManualCertificateSuccessResponse {
//   success: true;
//   domain: string;
//   certName: string;
//   manualCommand: string;
//   stepByStepInstructions: string[];
//   dnsRecordsNeeded: DnsRecord[];
//   troubleshootingTips: string[];
//   certificatePaths: {
//     fullchain: string;
//     privkey: string;
//     cert: string;
//     chain: string;
//   };
//   renewalCommand: string;
// }

// interface ManualCertificateErrorResponse {
//   success: false;
//   error: string;
// }

// type ManualCertificateResponse =
//   | ManualCertificateSuccessResponse
//   | ManualCertificateErrorResponse;

// export async function POST(
//   request: NextRequest
// ): Promise<NextResponse<ManualCertificateResponse>> {
//   try {
//     const body: ManualCertificateRequest = await request.json();
//     const { domain, email, includeWildcard = false, dnsRecords = [] } = body;

//     if (!domain || !email) {
//       return NextResponse.json<ManualCertificateErrorResponse>(
//         { success: false, error: "Domain and email are required" },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json<ManualCertificateErrorResponse>(
//         { success: false, error: "Invalid domain format" },
//         { status: 400 }
//       );
//     }

//     console.log(`Generating manual certificate command for domain: ${domain}`);

//     // Build domains array
//     const domains: string[] = includeWildcard
//       ? [domain, `*.${domain}`]
//       : [domain];
//     const certName: string = domain.replace(/\*\./g, "wildcard-");

//     // Generate DNS records template if not provided
//     const dnsRecordsNeeded: DnsRecord[] =
//       dnsRecords.length > 0
//         ? dnsRecords
//         : domains.map((d: string) => {
//             const challengeDomain = d.startsWith("*.") ? d.substring(2) : d;
//             return {
//               name: `_acme-challenge.${challengeDomain}`,
//               type: "TXT",
//               value: "[VALUE_WILL_BE_SHOWN_BY_CERTBOT]",
//               domain: challengeDomain,
//             };
//           });

//     // Build the manual certbot command
//     const domainArgs = domains.map((d: string) => `-d "${d}"`).join(" ");
//     const manualCommand = `sudo certbot certonly \\
//   --manual \\
//   --preferred-challenges dns \\
//   --email "${email}" \\
//   --agree-tos \\
//   --cert-name "${certName}" \\
//   --manual-public-ip-logging-ok \\
//   ${domainArgs}`;

//     // Step-by-step instructions
//     const stepByStepInstructions: string[] = [
//       `SSH into your server where certbot is installed`,
//       `Run the following command:`,
//       `${manualCommand}`,
//       `Certbot will show you the exact DNS TXT record(s) to add`,
//       `Add each DNS TXT record to your domain's DNS settings:`,
//       ...dnsRecordsNeeded.map(
//         (record, index) =>
//           `  ${index + 1}. Name: ${
//             record.name
//           }, Type: TXT, Value: [shown by certbot]`
//       ),
//       `Wait 5-10 minutes for DNS propagation`,
//       `Press Enter in the certbot prompt to continue verification`,
//       `Certbot will verify the DNS records and generate certificates`,
//       `Your certificates will be saved to /etc/letsencrypt/live/${certName}/`,
//     ];

//     // Certificate file paths
//     const certificatePaths = {
//       fullchain: `/etc/letsencrypt/live/${certName}/fullchain.pem`,
//       privkey: `/etc/letsencrypt/live/${certName}/privkey.pem`,
//       cert: `/etc/letsencrypt/live/${certName}/cert.pem`,
//       chain: `/etc/letsencrypt/live/${certName}/chain.pem`,
//     };

//     // Renewal command
//     const renewalCommand = `sudo certbot renew --cert-name "${certName}"`;

//     // Troubleshooting tips
//     const troubleshootingTips: string[] = [
//       "Make sure certbot is installed: sudo apt install certbot",
//       "Ensure you have sudo privileges on the server",
//       "Verify the domain is accessible from the internet",
//       "Check that port 53 (DNS) is not blocked by firewall",
//       "Use online DNS propagation checkers to verify records",
//       "If wildcard certificate fails, try without wildcard first",
//       "For rate limit issues, wait 1 hour before retrying",
//       "Check /var/log/letsencrypt/letsencrypt.log for detailed errors",
//       "Ensure DNS records are added to the ROOT domain, not a subdomain",
//       "Remove any conflicting DNS records before adding new ones",
//     ];

//     return NextResponse.json<ManualCertificateSuccessResponse>({
//       success: true,
//       domain,
//       certName,
//       manualCommand,
//       stepByStepInstructions,
//       dnsRecordsNeeded,
//       troubleshootingTips,
//       certificatePaths,
//       renewalCommand,
//     });
//   } catch (error) {
//     console.error(`Manual certificate command generation error:`, error);
//     return NextResponse.json<ManualCertificateErrorResponse>(
//       {
//         success: false,
//         error: `Internal server error: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//       },
//       { status: 500 }
//     );
//   }
// }
