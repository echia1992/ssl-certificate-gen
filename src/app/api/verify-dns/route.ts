// app/api/verify-dns/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  domain: string;
}

interface DnsServerResult {
  server: string;
  verified: boolean;
  values: string[];
  error: string | null;
}

interface VerificationDetails {
  serversChecked: number;
  serversVerified: number;
  serverResults: Array<{
    server: string;
    verified: boolean;
    valueCount: number;
    error: string | null;
  }>;
}

interface VerifiedDnsRecord extends DnsRecord {
  verified: boolean;
  currentValues: string[];
  verificationDetails?: VerificationDetails;
  lastChecked: string;
  error?: string;
}

interface VerifyDnsRequest {
  records: DnsRecord[];
}

interface VerificationSummary {
  total: number;
  verified: number;
  pending: number;
  allVerified: boolean;
}

interface VerifyDnsResponse {
  success: boolean;
  verified?: boolean;
  records?: VerifiedDnsRecord[];
  summary?: VerificationSummary;
  pendingRecords?: VerifiedDnsRecord[];
  message?: string;
  nextSteps?: string[];
  error?: string;
  troubleshooting?: string[];
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<VerifyDnsResponse>> {
  try {
    const body: VerifyDnsRequest = await request.json();
    const { records } = body;

    if (!records || !Array.isArray(records)) {
      return NextResponse.json(
        { success: false, error: "DNS records array is required" },
        { status: 400 }
      );
    }

    console.log(`Verifying ${records.length} DNS records...`);

    const verificationResults: VerifiedDnsRecord[] = await Promise.all(
      records.map(async (record: DnsRecord): Promise<VerifiedDnsRecord> => {
        try {
          console.log(`Checking DNS propagation for ${record.name}...`);

          // Use multiple DNS servers for more reliable checking
          const dnsServers: string[] = [
            "8.8.8.8",
            "1.1.1.1",
            "8.8.4.4",
            "1.0.0.1",
          ];
          const verificationPromises: Promise<DnsServerResult>[] =
            dnsServers.map(async (server: string): Promise<DnsServerResult> => {
              try {
                const { stdout, stderr } = await execAsync(
                  `dig +short TXT "${record.name}" @${server}`,
                  { timeout: 10000 }
                );

                if (stderr) {
                  console.warn(
                    `DNS query warning for ${record.name} via ${server}:`,
                    stderr
                  );
                }

                const dnsValues: string[] = stdout
                  .split("\n")
                  .filter((line: string) => line.trim())
                  .map((line: string) => line.replace(/"/g, "").trim())
                  .filter((line: string) => line.length > 0);

                const isVerified: boolean = dnsValues.some(
                  (value: string) =>
                    value === record.value || value.includes(record.value)
                );

                return {
                  server,
                  verified: isVerified,
                  values: dnsValues,
                  error: null,
                };
              } catch (error) {
                return {
                  server,
                  verified: false,
                  values: [],
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                };
              }
            });

          const serverResults: DnsServerResult[] = await Promise.all(
            verificationPromises
          );

          // Consider verified if at least 2 DNS servers confirm it
          const verifiedCount: number = serverResults.filter(
            (r: DnsServerResult) => r.verified
          ).length;
          const isVerified: boolean = verifiedCount >= 2;

          // Collect all unique values found across servers
          const allValues: string[] = [
            ...new Set(serverResults.flatMap((r: DnsServerResult) => r.values)),
          ];

          console.log(
            `DNS verification for ${record.name}: ${
              isVerified ? "SUCCESS" : "PENDING"
            } (${verifiedCount}/${dnsServers.length} servers)`
          );

          const verificationDetails: VerificationDetails = {
            serversChecked: dnsServers.length,
            serversVerified: verifiedCount,
            serverResults: serverResults.map((r: DnsServerResult) => ({
              server: r.server,
              verified: r.verified,
              valueCount: r.values.length,
              error: r.error,
            })),
          };

          return {
            ...record,
            verified: isVerified,
            currentValues: allValues,
            verificationDetails,
            lastChecked: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`DNS verification error for ${record.name}:`, error);
          return {
            ...record,
            verified: false,
            currentValues: [],
            error: error instanceof Error ? error.message : "Unknown error",
            lastChecked: new Date().toISOString(),
          };
        }
      })
    );

    const verifiedRecords: VerifiedDnsRecord[] = verificationResults.filter(
      (result: VerifiedDnsRecord) => result.verified
    );
    const pendingRecords: VerifiedDnsRecord[] = verificationResults.filter(
      (result: VerifiedDnsRecord) => !result.verified
    );
    const allVerified: boolean = verificationResults.every(
      (result: VerifiedDnsRecord) => result.verified
    );

    console.log(
      `DNS verification complete: ${verifiedRecords.length}/${verificationResults.length} verified`
    );

    const summary: VerificationSummary = {
      total: verificationResults.length,
      verified: verifiedRecords.length,
      pending: pendingRecords.length,
      allVerified,
    };

    return NextResponse.json({
      success: true,
      verified: allVerified,
      records: verificationResults,
      summary,
      pendingRecords,
      message: allVerified
        ? "All DNS records verified successfully!"
        : `${verifiedRecords.length}/${verificationResults.length} DNS records verified. Please wait for propagation of remaining records.`,
      nextSteps: allVerified
        ? ["Proceed to certificate generation"]
        : [
            "Wait 5-10 minutes for DNS propagation",
            "Verify records are correctly added to your DNS provider",
            "Check again for DNS propagation",
          ],
    });
  } catch (error) {
    console.error("DNS verification error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `DNS verification failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: [
          "Check your internet connection",
          "Verify DNS records are correctly formatted",
          "Try again in a few minutes",
          "Check your DNS provider's propagation status",
        ],
      },
      { status: 500 }
    );
  }
}
