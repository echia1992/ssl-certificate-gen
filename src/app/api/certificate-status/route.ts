// app/api/certificate-status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, statSync, Stats } from "fs";

const execAsync = promisify(exec);

interface CertificateInfo {
  certName: string;
  domain: string;
  issuer: string;
  notBefore: string;
  notAfter: string;
  subjectAltNames: string[];
  lastModified: string;
  certPath: string;
  daysUntilExpiry?: number;
  isExpiringSoon?: boolean;
  isExpired?: boolean;
}

interface CertbotCertificate {
  name: string;
  domains: string[];
  expiry: string | null;
  path: string | null;
}

interface HttpsStatus {
  accessible: boolean;
  statusCode?: number | null;
  response?: string;
  error?: string;
}

interface ManagementCommands {
  renew: string;
  revoke: string;
  delete: string;
  test: string;
}

interface Recommendation {
  type: "critical" | "warning" | "info";
  message: string;
  action: string;
}

interface CertificateStatusRequest {
  domain: string;
}

interface CertificateStatusResponse {
  success: boolean;
  hasCertificate?: boolean;
  certificate?: CertificateInfo;
  httpsStatus?: HttpsStatus | null;
  allCertificates?: CertbotCertificate[];
  renewalCommand?: string;
  managementCommands?: ManagementCommands;
  recommendations?: Recommendation[];
  message?: string;
  suggestions?: string[];
  error?: string;
  troubleshooting?: string[];
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<CertificateStatusResponse>> {
  try {
    const body: CertificateStatusRequest = await request.json();
    const { domain } = body;

    if (!domain) {
      return NextResponse.json(
        { success: false, error: "Domain is required" },
        { status: 400 }
      );
    }

    console.log(`Checking certificate status for domain: ${domain}`);

    // Check for certificates with different naming patterns
    const possibleCertNames: string[] = [
      domain,
      domain.replace(/\*\./g, "wildcard-"),
      domain.replace(/\./g, "-"),
    ];

    let certificateInfo: CertificateInfo | null = null;
    let certPath: string | null = null;

    // Check each possible certificate name
    for (const certName of possibleCertNames) {
      const testPath: string = `/etc/letsencrypt/live/${certName}`;
      if (existsSync(testPath)) {
        certPath = testPath;

        try {
          // Get certificate information using openssl
          const certFile: string = `${testPath}/cert.pem`;
          if (existsSync(certFile)) {
            const { stdout: certInfo } = await execAsync(
              `openssl x509 -in ${certFile} -text -noout`
            );

            // Extract relevant information
            const subjectMatch: RegExpMatchArray | null = certInfo.match(
              /Subject:.*CN\s*=\s*([^,\n]+)/
            );
            const issuerMatch: RegExpMatchArray | null = certInfo.match(
              /Issuer:.*CN\s*=\s*([^,\n]+)/
            );
            const notBeforeMatch: RegExpMatchArray | null = certInfo.match(
              /Not Before\s*:\s*(.+)/
            );
            const notAfterMatch: RegExpMatchArray | null =
              certInfo.match(/Not After\s*:\s*(.+)/);
            const sanMatch: RegExpMatchArray | null = certInfo.match(
              /DNS:([^,\n]+(?:,\s*DNS:[^,\n]+)*)/
            );

            // Get file modification times
            const stats: Stats = statSync(certFile);

            certificateInfo = {
              certName,
              domain: subjectMatch ? subjectMatch[1].trim() : domain,
              issuer: issuerMatch ? issuerMatch[1].trim() : "Unknown",
              notBefore: notBeforeMatch ? notBeforeMatch[1].trim() : "Unknown",
              notAfter: notAfterMatch ? notAfterMatch[1].trim() : "Unknown",
              subjectAltNames: sanMatch
                ? sanMatch[1]
                    .split(",")
                    .map((s: string) => s.replace("DNS:", "").trim())
                : [],
              lastModified: stats.mtime.toISOString(),
              certPath: testPath,
            };

            // Calculate days until expiry
            if (notAfterMatch) {
              const expiryDate: Date = new Date(notAfterMatch[1].trim());
              const now: Date = new Date();
              const daysUntilExpiry: number = Math.ceil(
                (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );
              certificateInfo.daysUntilExpiry = daysUntilExpiry;
              certificateInfo.isExpiringSoon = daysUntilExpiry <= 30;
              certificateInfo.isExpired = daysUntilExpiry <= 0;
            }

            break;
          }
        } catch (opensslError) {
          console.error(`OpenSSL error for ${certName}:`, opensslError);
        }
      }
    }

    // Get list of all Let's Encrypt certificates
    let allCertificates: CertbotCertificate[] = [];
    try {
      const { stdout: certbotList } = await execAsync(
        "sudo certbot certificates 2>/dev/null || echo 'No certificates found'"
      );

      if (!certbotList.includes("No certificates found")) {
        // Parse certbot output to get certificate list
        const certLines: string[] = certbotList.split("\n");
        let currentCert: Partial<CertbotCertificate> | null = null;

        for (const line of certLines) {
          if (line.includes("Certificate Name:")) {
            if (currentCert && currentCert.name) {
              allCertificates.push(currentCert as CertbotCertificate);
            }
            currentCert = {
              name: line.split("Certificate Name:")[1].trim(),
              domains: [],
              expiry: null,
              path: null,
            };
          } else if (line.includes("Domains:") && currentCert) {
            currentCert.domains = line.split("Domains:")[1].trim().split(" ");
          } else if (line.includes("Expiry Date:") && currentCert) {
            currentCert.expiry = line.split("Expiry Date:")[1].trim();
          } else if (line.includes("Certificate Path:") && currentCert) {
            currentCert.path = line.split("Certificate Path:")[1].trim();
          }
        }
        if (currentCert && currentCert.name) {
          allCertificates.push(currentCert as CertbotCertificate);
        }
      }
    } catch (listError) {
      console.warn("Could not list certificates:", listError);
    }

    // Check if domain has active HTTPS
    let httpsStatus: HttpsStatus | null = null;
    try {
      const { stdout: httpsCheck } = await execAsync(
        `timeout 10 curl -Is https://${domain} | head -1 || echo "Connection failed"`,
        { timeout: 15000 }
      );

      if (httpsCheck.includes("HTTP/")) {
        const statusCodeMatch: RegExpMatchArray | null = httpsCheck.match(
          /HTTP\/[\d\.]+\s+(\d+)/
        );
        httpsStatus = {
          accessible: true,
          statusCode: statusCodeMatch ? parseInt(statusCodeMatch[1]) : null,
          response: httpsCheck.trim(),
        };
      } else {
        httpsStatus = {
          accessible: false,
          error: httpsCheck.trim(),
        };
      }
    } catch (httpsError) {
      httpsStatus = {
        accessible: false,
        error: "Connection timeout or error",
      };
    }

    if (certificateInfo) {
      const managementCommands: ManagementCommands = {
        renew: `sudo certbot renew --cert-name ${certificateInfo.certName}`,
        revoke: `sudo certbot revoke --cert-name ${certificateInfo.certName}`,
        delete: `sudo certbot delete --cert-name ${certificateInfo.certName}`,
        test: `sudo certbot renew --cert-name ${certificateInfo.certName} --dry-run`,
      };

      return NextResponse.json({
        success: true,
        hasCertificate: true,
        certificate: certificateInfo,
        httpsStatus,
        allCertificates,
        renewalCommand: `sudo certbot renew --cert-name ${certificateInfo.certName}`,
        managementCommands,
        recommendations: generateRecommendations(certificateInfo, httpsStatus),
      });
    } else {
      return NextResponse.json({
        success: true,
        hasCertificate: false,
        message: `No SSL certificate found for ${domain}`,
        httpsStatus,
        allCertificates,
        suggestions: [
          `Generate a new certificate for ${domain}`,
          "Check if the domain name is spelled correctly",
          "Verify the certificate wasn't created with a different name",
          "Use the SSL generator to create a new certificate",
        ],
      });
    }
  } catch (error) {
    console.error("Certificate status check error:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to check certificate status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        troubleshooting: [
          "Check server permissions",
          "Verify certbot is installed",
          "Ensure domain is accessible",
          "Try again in a few moments",
        ],
      },
      { status: 500 }
    );
  }
}

function generateRecommendations(
  certificateInfo: CertificateInfo,
  httpsStatus: HttpsStatus | null
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (certificateInfo.isExpired) {
    recommendations.push({
      type: "critical",
      message: "Certificate has expired and needs immediate renewal",
      action: `sudo certbot renew --cert-name ${certificateInfo.certName} --force-renewal`,
    });
  } else if (certificateInfo.isExpiringSoon) {
    recommendations.push({
      type: "warning",
      message: `Certificate expires in ${certificateInfo.daysUntilExpiry} days`,
      action: `sudo certbot renew --cert-name ${certificateInfo.certName}`,
    });
  } else {
    recommendations.push({
      type: "info",
      message: `Certificate is valid for ${certificateInfo.daysUntilExpiry} more days`,
      action: "No action needed",
    });
  }

  if (httpsStatus && !httpsStatus.accessible) {
    recommendations.push({
      type: "warning",
      message: "HTTPS is not accessible for this domain",
      action:
        "Check web server configuration and ensure certificate is properly installed",
    });
  } else if (
    httpsStatus &&
    httpsStatus.statusCode &&
    httpsStatus.statusCode >= 400
  ) {
    recommendations.push({
      type: "warning",
      message: `HTTPS returns status code ${httpsStatus.statusCode}`,
      action: "Check web server configuration",
    });
  }

  // Set up auto-renewal reminder
  recommendations.push({
    type: "info",
    message: "Set up automatic renewal",
    action: "Add to crontab: 0 12 * * * /usr/bin/certbot renew --quiet",
  });

  return recommendations;
}
