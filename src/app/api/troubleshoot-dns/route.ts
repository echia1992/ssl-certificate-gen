// app/api/troubleshoot-dns/route.ts
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

interface DnsLookupResult {
  server: string;
  values: string[];
  success: boolean;
  error?: string;
}

interface TroubleshootDnsRequest {
  domain: string;
  dnsRecords?: DnsRecord[];
}

interface TroubleshootDnsSuccessResponse {
  success: true;
  domain: string;
  timestamp: string;
  dnsResults: Array<{
    recordName: string;
    expectedValue?: string;
    lookupResults: DnsLookupResult[];
    propagated: boolean;
    issues: string[];
  }>;
  globalDnsStatus: {
    totalServers: number;
    successfulLookups: number;
    propagationPercentage: number;
  };
  recommendations: string[];
}

interface TroubleshootDnsErrorResponse {
  success: false;
  error: string;
}

type TroubleshootDnsResponse =
  | TroubleshootDnsSuccessResponse
  | TroubleshootDnsErrorResponse;

export async function POST(
  request: NextRequest
): Promise<NextResponse<TroubleshootDnsResponse>> {
  try {
    const body: TroubleshootDnsRequest = await request.json();
    const { domain, dnsRecords = [] } = body;

    if (!domain) {
      return NextResponse.json<TroubleshootDnsErrorResponse>(
        { success: false, error: "Domain is required" },
        { status: 400 }
      );
    }

    console.log(`Troubleshooting DNS for domain: ${domain}`);

    // DNS servers to check against
    const dnsServers: Array<{ name: string; ip: string }> = [
      { name: "Google Primary", ip: "8.8.8.8" },
      { name: "Google Secondary", ip: "8.8.4.4" },
      { name: "Cloudflare Primary", ip: "1.1.1.1" },
      { name: "Cloudflare Secondary", ip: "1.0.0.1" },
      { name: "OpenDNS Primary", ip: "208.67.222.222" },
      { name: "OpenDNS Secondary", ip: "208.67.220.220" },
      { name: "Quad9", ip: "9.9.9.9" },
      { name: "System Default", ip: "@" },
    ];

    // Generate record names to check if not provided
    let recordsToCheck: DnsRecord[] = dnsRecords;
    if (recordsToCheck.length === 0) {
      recordsToCheck = [
        {
          name: `_acme-challenge.${domain}`,
          type: "TXT",
          value: "",
          domain: domain,
        },
      ];
    }

    const dnsResults = await Promise.all(
      recordsToCheck.map(async (record) => {
        const lookupResults: DnsLookupResult[] = await Promise.all(
          dnsServers.map(async (server): Promise<DnsLookupResult> => {
            try {
              const digCommand =
                server.ip === "@"
                  ? `dig +short TXT "${record.name}"`
                  : `dig +short TXT "${record.name}" @${server.ip}`;

              const { stdout, stderr } = await execAsync(digCommand, {
                timeout: 10000,
              });

              if (stderr && stderr.trim()) {
                return {
                  server: server.name,
                  values: [],
                  success: false,
                  error: stderr.trim(),
                };
              }

              const values = stdout
                .split("\n")
                .filter((line: string) => line.trim())
                .map((line: string) => line.replace(/"/g, "").trim())
                .filter((line: string) => line.length > 0);

              return {
                server: server.name,
                values,
                success: true,
              };
            } catch (error) {
              return {
                server: server.name,
                values: [],
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              };
            }
          })
        );

        // Analyze the results
        const successfulLookups = lookupResults.filter((r) => r.success);
        const allValues = [
          ...new Set(successfulLookups.flatMap((r) => r.values)),
        ];

        let propagated = false;
        const issues: string[] = [];

        if (record.value) {
          // Check if expected value is found
          propagated = allValues.some(
            (value) => value === record.value || value.includes(record.value)
          );

          if (!propagated) {
            if (allValues.length === 0) {
              issues.push("No TXT records found for this name");
            } else {
              issues.push(
                `Expected value not found. Found: ${allValues.join(", ")}`
              );
            }
          }
        } else {
          // Just check if any values exist
          propagated = allValues.length > 0;
          if (!propagated) {
            issues.push("No TXT records found");
          }
        }

        // Check for consistency across servers
        const valuesByServer = new Map<string, string[]>();
        successfulLookups.forEach((result) => {
          const key = result.values.sort().join(",");
          if (!valuesByServer.has(key)) {
            valuesByServer.set(key, []);
          }
          valuesByServer.get(key)!.push(result.server);
        });

        if (valuesByServer.size > 1) {
          issues.push(
            "Inconsistent values across DNS servers - propagation may still be in progress"
          );
        }

        // Check propagation percentage
        const propagationPercentage =
          (successfulLookups.length / dnsServers.length) * 100;
        if (propagationPercentage < 75) {
          issues.push(
            `Low propagation rate: ${propagationPercentage.toFixed(
              0
            )}% of DNS servers responding`
          );
        }

        return {
          recordName: record.name,
          expectedValue: record.value || undefined,
          lookupResults,
          propagated,
          issues,
        };
      })
    );

    // Calculate global DNS status
    const totalLookups = dnsResults.reduce(
      (sum, result) => sum + result.lookupResults.length,
      0
    );
    const successfulLookups = dnsResults.reduce(
      (sum, result) =>
        sum + result.lookupResults.filter((r) => r.success).length,
      0
    );

    const globalDnsStatus = {
      totalServers: dnsServers.length,
      successfulLookups: successfulLookups / dnsResults.length,
      propagationPercentage:
        totalLookups > 0 ? (successfulLookups / totalLookups) * 100 : 0,
    };

    // Generate recommendations
    const recommendations: string[] = [];

    const allIssues = dnsResults.flatMap((r) => r.issues);
    const hasNoDnsRecords = allIssues.some((issue) =>
      issue.includes("No TXT records found")
    );
    const hasInconsistentValues = allIssues.some((issue) =>
      issue.includes("Inconsistent values")
    );
    const hasLowPropagation = allIssues.some((issue) =>
      issue.includes("Low propagation rate")
    );

    if (hasNoDnsRecords) {
      recommendations.push(
        "Add the required DNS TXT records to your domain's DNS settings"
      );
      recommendations.push(
        "Verify you're adding records to the correct domain/subdomain"
      );
      recommendations.push(
        "Check with your DNS provider if records are being filtered or blocked"
      );
    }

    if (hasInconsistentValues) {
      recommendations.push(
        "Wait 10-15 minutes for DNS propagation to complete"
      );
      recommendations.push(
        "Clear DNS cache: sudo systemctl flush-dns or equivalent"
      );
      recommendations.push(
        "Check if your DNS provider has multiple name servers that need time to sync"
      );
    }

    if (hasLowPropagation) {
      recommendations.push(
        "Check your internet connection and DNS server accessibility"
      );
      recommendations.push("Try using a different DNS server for testing");
      recommendations.push(
        "Contact your DNS provider if propagation is unusually slow"
      );
    }

    if (globalDnsStatus.propagationPercentage > 75 && !hasNoDnsRecords) {
      recommendations.push(
        "DNS propagation looks good - you should be able to proceed with certificate generation"
      );
    }

    recommendations.push(
      "Use online DNS propagation checkers for additional verification"
    );
    recommendations.push(
      "Test from different locations/networks to confirm global propagation"
    );

    return NextResponse.json<TroubleshootDnsSuccessResponse>({
      success: true,
      domain,
      timestamp: new Date().toISOString(),
      dnsResults,
      globalDnsStatus,
      recommendations,
    });
  } catch (error) {
    console.error("DNS troubleshooting error:", error);
    return NextResponse.json<TroubleshootDnsErrorResponse>(
      {
        success: false,
        error: `DNS troubleshooting failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}

// // app/api/troubleshoot-dns/route.ts
// import { NextRequest, NextResponse } from "next/server";
// import { exec } from "child_process";
// import { promisify } from "util";

// const execAsync = promisify(exec);

// interface DnsRecord {
//   name: string;
//   type: string;
//   value: string;
//   domain: string;
// }

// interface DnsLookupResult {
//   server: string;
//   values: string[];
//   success: boolean;
//   error?: string;
// }

// interface TroubleshootDnsRequest {
//   domain: string;
//   dnsRecords?: DnsRecord[];
// }

// interface TroubleshootDnsSuccessResponse {
//   success: true;
//   domain: string;
//   timestamp: string;
//   dnsResults: Array<{
//     recordName: string;
//     expectedValue?: string;
//     lookupResults: DnsLookupResult[];
//     propagated: boolean;
//     issues: string[];
//   }>;
//   globalDnsStatus: {
//     totalServers: number;
//     successfulLookups: number;
//     propagationPercentage: number;
//   };
//   recommendations: string[];
// }

// interface TroubleshootDnsErrorResponse {
//   success: false;
//   error: string;
// }

// type TroubleshootDnsResponse =
//   | TroubleshootDnsSuccessResponse
//   | TroubleshootDnsErrorResponse;

// export async function POST(
//   request: NextRequest
// ): Promise<NextResponse<TroubleshootDnsResponse>> {
//   try {
//     const body: TroubleshootDnsRequest = await request.json();
//     const { domain, dnsRecords = [] } = body;

//     if (!domain) {
//       return NextResponse.json<TroubleshootDnsErrorResponse>(
//         { success: false, error: "Domain is required" },
//         { status: 400 }
//       );
//     }

//     console.log(`Troubleshooting DNS for domain: ${domain}`);

//     // DNS servers to check against
//     const dnsServers: Array<{ name: string; ip: string }> = [
//       { name: "Google Primary", ip: "8.8.8.8" },
//       { name: "Google Secondary", ip: "8.8.4.4" },
//       { name: "Cloudflare Primary", ip: "1.1.1.1" },
//       { name: "Cloudflare Secondary", ip: "1.0.0.1" },
//       { name: "OpenDNS Primary", ip: "208.67.222.222" },
//       { name: "OpenDNS Secondary", ip: "208.67.220.220" },
//       { name: "Quad9", ip: "9.9.9.9" },
//       { name: "System Default", ip: "@" },
//     ];

//     // Generate record names to check if not provided
//     let recordsToCheck: DnsRecord[] = dnsRecords;
//     if (recordsToCheck.length === 0) {
//       recordsToCheck = [
//         {
//           name: `_acme-challenge.${domain}`,
//           type: "TXT",
//           value: "",
//           domain: domain,
//         },
//       ];
//     }

//     const dnsResults = await Promise.all(
//       recordsToCheck.map(async (record) => {
//         const lookupResults: DnsLookupResult[] = await Promise.all(
//           dnsServers.map(async (server): Promise<DnsLookupResult> => {
//             try {
//               const digCommand =
//                 server.ip === "@"
//                   ? `dig +short TXT "${record.name}"`
//                   : `dig +short TXT "${record.name}" @${server.ip}`;

//               const { stdout, stderr } = await execAsync(digCommand, {
//                 timeout: 10000,
//               });

//               if (stderr && stderr.trim()) {
//                 return {
//                   server: server.name,
//                   values: [],
//                   success: false,
//                   error: stderr.trim(),
//                 };
//               }

//               const values = stdout
//                 .split("\n")
//                 .filter((line: string) => line.trim())
//                 .map((line: string) => line.replace(/"/g, "").trim())
//                 .filter((line: string) => line.length > 0);

//               return {
//                 server: server.name,
//                 values,
//                 success: true,
//               };
//             } catch (error) {
//               return {
//                 server: server.name,
//                 values: [],
//                 success: false,
//                 error: error instanceof Error ? error.message : "Unknown error",
//               };
//             }
//           })
//         );

//         // Analyze the results
//         const successfulLookups = lookupResults.filter((r) => r.success);
//         const allValues = [
//           ...new Set(successfulLookups.flatMap((r) => r.values)),
//         ];

//         let propagated = false;
//         const issues: string[] = [];

//         if (record.value) {
//           // Check if expected value is found
//           propagated = allValues.some(
//             (value) => value === record.value || value.includes(record.value)
//           );

//           if (!propagated) {
//             if (allValues.length === 0) {
//               issues.push("No TXT records found for this name");
//             } else {
//               issues.push(
//                 `Expected value not found. Found: ${allValues.join(", ")}`
//               );
//             }
//           }
//         } else {
//           // Just check if any values exist
//           propagated = allValues.length > 0;
//           if (!propagated) {
//             issues.push("No TXT records found");
//           }
//         }

//         // Check for consistency across servers
//         const valuesByServer = new Map<string, string[]>();
//         successfulLookups.forEach((result) => {
//           const key = result.values.sort().join(",");
//           if (!valuesByServer.has(key)) {
//             valuesByServer.set(key, []);
//           }
//           valuesByServer.get(key)!.push(result.server);
//         });

//         if (valuesByServer.size > 1) {
//           issues.push(
//             "Inconsistent values across DNS servers - propagation may still be in progress"
//           );
//         }

//         // Check propagation percentage
//         const propagationPercentage =
//           (successfulLookups.length / dnsServers.length) * 100;
//         if (propagationPercentage < 75) {
//           issues.push(
//             `Low propagation rate: ${propagationPercentage.toFixed(
//               0
//             )}% of DNS servers responding`
//           );
//         }

//         return {
//           recordName: record.name,
//           expectedValue: record.value || undefined,
//           lookupResults,
//           propagated,
//           issues,
//         };
//       })
//     );

//     // Calculate global DNS status
//     const totalLookups = dnsResults.reduce(
//       (sum, result) => sum + result.lookupResults.length,
//       0
//     );
//     const successfulLookups = dnsResults.reduce(
//       (sum, result) =>
//         sum + result.lookupResults.filter((r) => r.success).length,
//       0
//     );

//     const globalDnsStatus = {
//       totalServers: dnsServers.length,
//       successfulLookups: successfulLookups / dnsResults.length,
//       propagationPercentage:
//         totalLookups > 0 ? (successfulLookups / totalLookups) * 100 : 0,
//     };

//     // Generate recommendations
//     const recommendations: string[] = [];

//     const allIssues = dnsResults.flatMap((r) => r.issues);
//     const hasNoDnsRecords = allIssues.some((issue) =>
//       issue.includes("No TXT records found")
//     );
//     const hasInconsistentValues = allIssues.some((issue) =>
//       issue.includes("Inconsistent values")
//     );
//     const hasLowPropagation = allIssues.some((issue) =>
//       issue.includes("Low propagation rate")
//     );

//     if (hasNoDnsRecords) {
//       recommendations.push(
//         "Add the required DNS TXT records to your domain's DNS settings"
//       );
//       recommendations.push(
//         "Verify you're adding records to the correct domain/subdomain"
//       );
//       recommendations.push(
//         "Check with your DNS provider if records are being filtered or blocked"
//       );
//     }

//     if (hasInconsistentValues) {
//       recommendations.push(
//         "Wait 10-15 minutes for DNS propagation to complete"
//       );
//       recommendations.push(
//         "Clear DNS cache: sudo systemctl flush-dns or equivalent"
//       );
//       recommendations.push(
//         "Check if your DNS provider has multiple name servers that need time to sync"
//       );
//     }

//     if (hasLowPropagation) {
//       recommendations.push(
//         "Check your internet connection and DNS server accessibility"
//       );
//       recommendations.push("Try using a different DNS server for testing");
//       recommendations.push(
//         "Contact your DNS provider if propagation is unusually slow"
//       );
//     }

//     if (globalDnsStatus.propagationPercentage > 75 && !hasNoDnsRecords) {
//       recommendations.push(
//         "DNS propagation looks good - you should be able to proceed with certificate generation"
//       );
//     }

//     recommendations.push(
//       "Use online DNS propagation checkers for additional verification"
//     );
//     recommendations.push(
//       "Test from different locations/networks to confirm global propagation"
//     );

//     return NextResponse.json<TroubleshootDnsSuccessResponse>({
//       success: true,
//       domain,
//       timestamp: new Date().toISOString(),
//       dnsResults,
//       globalDnsStatus,
//       recommendations,
//     });
//   } catch (error) {
//     console.error("DNS troubleshooting error:", error);
//     return NextResponse.json<TroubleshootDnsErrorResponse>(
//       {
//         success: false,
//         error: `DNS troubleshooting failed: ${
//           error instanceof Error ? error.message : "Unknown error"
//         }`,
//       },
//       { status: 500 }
//     );
//   }
// }
