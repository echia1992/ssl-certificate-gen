
// //api/generate-cert-automatic
// import { NextRequest, NextResponse } from "next/server";
// import { spawn } from "child_process";
// import { readFile } from "fs/promises";
// import { existsSync } from "fs";

// export async function POST(request: NextRequest): Promise<NextResponse> {
//   try {
//     const { domain, email, includeWildcard } = await request.json();

//     if (!domain || !email) {
//       return NextResponse.json(
//         { success: false, error: "Domain and email are required" },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         { success: false, error: "Invalid domain format" },
//         { status: 400 }
//       );
//     }

//     // Clean up any existing processes first
//     try {
//       await new Promise<void>((resolve) => {
//         const cleanup = spawn("sudo", [
//           "bash",
//           "-c",
//           "pkill -f certbot || true; rm -f /var/lib/letsencrypt/.certbot.lock || true; rm -rf /tmp/certbot-* || true",
//         ]);
//         cleanup.on("close", () => resolve());
//         setTimeout(() => {
//           cleanup.kill();
//           resolve();
//         }, 5000);
//       });
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//     } catch (cleanupError) {
//       console.log("Cleanup warning:", cleanupError);
//     }

//     // Build domains array
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

//     return new Promise<NextResponse>((resolvePromise) => {
//       // Step 1: Get DNS challenge records
//       const getDnsRecords = () => {
//         return new Promise<any[]>((resolveDns) => {
//           const certbotArgs = [
//             "certonly",
//             "--manual",
//             "--preferred-challenges",
//             "dns",
//             "--dry-run", // Get challenge without rate limits
//             "--agree-tos",
//             "--email",
//             email,
//             "--server",
//             "https://acme-v02.api.letsencrypt.org/directory",
//             "--cert-name",
//             domain,
//             "--non-interactive",
//             "--manual-public-ip-logging-ok",
//             ...domains.flatMap((d) => ["-d", d]),
//           ];

//           console.log("Getting DNS records for domain:", domain);
//           const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
//             stdio: ["pipe", "pipe", "pipe"],
//           });

//           let output = "";
//           const dnsRecords: any[] = [];

//           certbotProcess.stdout.on("data", (data) => {
//             const text = data.toString();
//             output += text;
//             console.log("DNS Challenge stdout:", text);

//             // Parse DNS records with multiple patterns
//             const lines = text.split("\n");
//             for (let i = 0; i < lines.length; i++) {
//               const line = lines[i].trim();

//               if (
//                 line.includes("Please deploy a DNS TXT record under the name")
//               ) {
//                 let recordName = "";
//                 let recordValue = "";

//                 const nameMatch = line.match(
//                   /_acme-challenge\.[a-zA-Z0-9\.\-]+/
//                 );
//                 if (nameMatch) {
//                   recordName = nameMatch[0].replace(/[:\.,\s]*$/, "");
//                   console.log("Found DNS record name:", recordName);
//                 }

//                 // Look for value in next lines
//                 for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
//                   const nextLine = lines[j].trim();

//                   if (nextLine.includes("with the following value")) {
//                     // Check same line first
//                     const valueParts = nextLine.split(":");
//                     if (valueParts.length > 1) {
//                       const possibleValue =
//                         valueParts[valueParts.length - 1].trim();
//                       if (
//                         possibleValue.length > 20 &&
//                         /^[A-Za-z0-9_\-]+$/.test(possibleValue)
//                       ) {
//                         recordValue = possibleValue;
//                         console.log("Found DNS record value:", recordValue);
//                         break;
//                       }
//                     }

//                     // Check next lines
//                     for (
//                       let k = j + 1;
//                       k < Math.min(j + 5, lines.length);
//                       k++
//                     ) {
//                       const valueLine = lines[k].trim();
//                       if (
//                         valueLine.length > 20 &&
//                         /^[A-Za-z0-9_\-]+$/.test(valueLine) &&
//                         !valueLine.includes("_acme-challenge")
//                       ) {
//                         recordValue = valueLine;
//                         console.log(
//                           "Found DNS record value on next line:",
//                           recordValue
//                         );
//                         break;
//                       }
//                     }
//                     break;
//                   }
//                 }

//                 if (recordName && recordValue) {
//                   const baseDomain = recordName.replace("_acme-challenge.", "");
//                   const dnsRecord = {
//                     name: recordName,
//                     type: "TXT",
//                     value: recordValue,
//                     domain: baseDomain,
//                   };

//                   if (
//                     !dnsRecords.find(
//                       (r) => r.name === recordName && r.value === recordValue
//                     )
//                   ) {
//                     dnsRecords.push(dnsRecord);
//                     console.log(
//                       "Added DNS record for domain:",
//                       baseDomain,
//                       dnsRecord
//                     );
//                   }
//                 }
//               }
//             }

//             // When we have records and see the prompt, send them immediately
//             if (
//               dnsRecords.length > 0 &&
//               (text.includes("Press Enter to Continue") ||
//                 text.includes("Press ENTER to continue"))
//             ) {
//               setTimeout(() => {
//                 certbotProcess.kill("SIGTERM");
//                 resolveDns(dnsRecords);
//               }, 1000);
//             }
//           });

//           certbotProcess.stderr.on("data", (data) => {
//             console.error("DNS Challenge stderr:", data.toString());
//           });

//           certbotProcess.on("close", (code) => {
//             console.log("DNS challenge process ended with code:", code);
//             resolveDns(dnsRecords);
//           });

//           // Timeout after 30 seconds
//           setTimeout(() => {
//             certbotProcess.kill("SIGTERM");
//             resolveDns(dnsRecords);
//           }, 30000);
//         });
//       };

//       // Step 2: Verify DNS propagation
//       const verifyDnsPropagation = async (dnsRecords: any[]) => {
//         const verificationResults = [];

//         for (const record of dnsRecords) {
//           try {
//             console.log(`Checking DNS propagation for ${record.name}...`);

//             // Use dig to check DNS record
//             const digProcess = spawn("dig", [
//               "+short",
//               "TXT",
//               record.name,
//               "@8.8.8.8",
//             ]);

//             const result = await new Promise<boolean>((resolve) => {
//               let output = "";

//               digProcess.stdout.on("data", (data) => {
//                 output += data.toString();
//               });

//               digProcess.on("close", () => {
//                 const cleanOutput = output.replace(/"/g, "").trim();
//                 const isVerified = cleanOutput.includes(record.value);
//                 console.log(
//                   `DNS verification for ${record.name}: ${
//                     isVerified ? "SUCCESS" : "PENDING"
//                   }`
//                 );
//                 resolve(isVerified);
//               });

//               setTimeout(() => {
//                 digProcess.kill();
//                 resolve(false);
//               }, 10000);
//             });

//             verificationResults.push({
//               name: record.name,
//               verified: result,
//               domain: record.domain,
//             });
//           } catch (error) {
//             console.error(`DNS verification error for ${record.name}:`, error);
//             verificationResults.push({
//               name: record.name,
//               verified: false,
//               error: error.message,
//               domain: record.domain,
//             });
//           }
//         }

//         return verificationResults;
//       };

//       // Step 3: Generate real certificates using multiple methods
//       const generateRealCertificates = async (dnsRecords: any[]) => {
//         // Try different certificate generation methods
//         const methods = [
//           {
//             name: "dns-manual",
//             args: [
//               "certonly",
//               "--manual",
//               "--preferred-challenges",
//               "dns",
//               "--agree-tos",
//               "--email",
//               email,
//               "--server",
//               "https://acme-v02.api.letsencrypt.org/directory",
//               "--cert-name",
//               domain,
//               "--non-interactive",
//               "--manual-public-ip-logging-ok",
//               "--manual-auth-hook",
//               `echo "DNS records should be configured"`,
//               ...domains.flatMap((d) => ["-d", d]),
//             ],
//           },
//           {
//             name: "standalone",
//             args: [
//               "certonly",
//               "--standalone",
//               "--agree-tos",
//               "--email",
//               email,
//               "--cert-name",
//               domain,
//               "--non-interactive",
//               ...domains.flatMap((d) => ["-d", d]),
//             ],
//           },
//         ];

//         for (const method of methods) {
//           console.log(`Trying certificate generation method: ${method.name}`);

//           const result = await new Promise<any>((resolveCert) => {
//             const certbotProcess = spawn("sudo", ["certbot", ...method.args], {
//               stdio: ["pipe", "pipe", "pipe"],
//             });

//             let output = "";
//             let errorOutput = "";

//             certbotProcess.stdout.on("data", (data) => {
//               const text = data.toString();
//               output += text;
//               console.log(`${method.name} stdout:`, text);
//             });

//             certbotProcess.stderr.on("data", (data) => {
//               const text = data.toString();
//               errorOutput += text;
//               console.error(`${method.name} stderr:`, text);
//             });

//             certbotProcess.on("close", async (code) => {
//               console.log(`${method.name} process ended with code:`, code);

//               if (code === 0) {
//                 // Success - try to read certificate files
//                 try {
//                   const certPath = `/etc/letsencrypt/live/${domain}`;

//                   if (existsSync(certPath)) {
//                     const certificateFiles = {
//                       fullchain: existsSync(`${certPath}/fullchain.pem`)
//                         ? (
//                             await readFile(`${certPath}/fullchain.pem`, "utf8")
//                           ).toString()
//                         : null,
//                       privkey: existsSync(`${certPath}/privkey.pem`)
//                         ? (
//                             await readFile(`${certPath}/privkey.pem`, "utf8")
//                           ).toString()
//                         : null,
//                       cert: existsSync(`${certPath}/cert.pem`)
//                         ? (
//                             await readFile(`${certPath}/cert.pem`, "utf8")
//                           ).toString()
//                         : null,
//                       chain: existsSync(`${certPath}/chain.pem`)
//                         ? (
//                             await readFile(`${certPath}/chain.pem`, "utf8")
//                           ).toString()
//                         : null,
//                     };

//                     resolveCert({
//                       success: true,
//                       method: method.name,
//                       certificateFiles,
//                       certPath,
//                       output,
//                     });
//                     return;
//                   }
//                 } catch (readError) {
//                   console.error("Failed to read certificate files:", readError);
//                 }
//               }

//               resolveCert({
//                 success: false,
//                 method: method.name,
//                 error: `Method ${method.name} failed with code ${code}`,
//                 output,
//                 errorOutput,
//               });
//             });

//             // Timeout for each method
//             setTimeout(() => {
//               certbotProcess.kill("SIGTERM");
//               resolveCert({
//                 success: false,
//                 method: method.name,
//                 error: `Method ${method.name} timed out`,
//                 output,
//                 errorOutput,
//               });
//             }, 180000); // 3 minutes per method
//           });

//           if (result.success) {
//             return result;
//           }

//           console.log(`Method ${method.name} failed, trying next method...`);
//         }

//         // If all methods fail, generate sample certificates for testing
//         return {
//           success: false,
//           error: "All certificate generation methods failed",
//           fallbackCertificates: generateFallbackCertificates(domain),
//         };
//       };

//       // Generate fallback certificates for testing/development
//       const generateFallbackCertificates = (domain: string) => {
//         const currentDate = new Date();
//         const serialNumber = Math.random()
//           .toString(36)
//           .substring(2, 15)
//           .toUpperCase();

//         const certTemplate = `-----BEGIN CERTIFICATE-----
// MIIFXTCCBEWgAwIBAgISA7${serialNumber}AgNVBAoTEkxldCdzIEVuY3J5cHQwHhcN
// ${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(
//           2,
//           "0"
//         )}${String(currentDate.getDate()).padStart(2, "0")}000000Z
// Mh0xCzAJBgNVBAYTAlVTMQswCQYDVQQIEwJDQTEWMBQGA1UEBxMNU2FuIEZyYW5j
// aXNjbzEfMB0GA1UEChMWTGV0J3MgRW5jcnlwdCBUZXN0IENBMIIBIjANBgkqhkiG
// 9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2YjTkKHFoXznGHOE7x3jQkHfFTfTjT+YnKk9
// Y7DjwKdCL8CvP7qWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE
// 7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjY
// qWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJ
// sTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7K
// j9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqW
// ZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsT
// wIDAQABo4ICYjCCAl4wDgYDVR0PAQH/BAQDAgWgMB0GA1UdJQQWMBQGCCsGAQUF
// BwMBBggrBgEFBQcDAjAMBgNVHRMBAf8EAjAAMB0GA1UdDgQWBBTJ8m1dJHSKJSD
// KJSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSD
// -----END CERTIFICATE-----`;

//         const privateKeyTemplate = `-----BEGIN RSA PRIVATE KEY-----
// MIIEpAIBAAKCAQEA2YjTkKHFoXznGHOE7x3jQkHfFTfTjT+YnKk9Y7DjwKdCL8Cv
// P7qWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGk
// HdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8Y
// E7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTj
// YqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkH
// dJsTnKgH2EfTjYqWZxHgK4M8YE7Kj9YE4XfGkHdJsTnKgH2EfTjYqWZxHgK4M8YE
// wIDAQABAoIBADKJSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSD
// KJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJB
// SDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDK
// JBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSDKJBSD
// -----END RSA PRIVATE KEY-----`;

//         return {
//           fullchain: certTemplate,
//           privkey: privateKeyTemplate,
//           cert: certTemplate,
//           chain: certTemplate,
//         };
//       };

//       // Execute the complete automatic process
//       (async () => {
//         try {
//           console.log(
//             `Starting automatic SSL generation for domain: ${domain}`
//           );

//           // Step 1: Get DNS challenge records
//           console.log("Step 1: Getting DNS challenge records...");
//           const dnsRecords = await getDnsRecords();

//           if (dnsRecords.length === 0) {
//             resolvePromise(
//               NextResponse.json({
//                 success: false,
//                 error: `Failed to generate DNS challenge records for ${domain}`,
//                 troubleshooting: [
//                   "Try using Manual DNS Verification instead",
//                   "Check if the domain is valid and reachable",
//                   "Ensure certbot is properly installed on the server",
//                   "Verify domain ownership",
//                 ],
//               })
//             );
//             return;
//           }

//           console.log(`Found ${dnsRecords.length} DNS records for ${domain}`);

//           // Step 2: Return DNS records for manual addition (automatic in next version)
//           console.log(
//             "Step 2: DNS records generated, waiting for user to add them..."
//           );

//           // For now, return the DNS records and instructions
//           // User will add them manually, then we can verify and generate certificates

//           // Step 3: Verify DNS (optional check)
//           console.log("Step 3: Checking current DNS propagation...");
//           const verificationResults = await verifyDnsPropagation(dnsRecords);

//           const allVerified = verificationResults.every(
//             (result) => result.verified
//           );

//           if (allVerified) {
//             console.log(
//               "Step 4: DNS records verified, generating certificates..."
//             );
//             const certResult = await generateRealCertificates(dnsRecords);

//             if (certResult.success) {
//               resolvePromise(
//                 NextResponse.json({
//                   success: true,
//                   message: `SSL certificates generated successfully for ${domain}!`,
//                   certificateFiles: certResult.certificateFiles,
//                   certificatePath: certResult.certPath,
//                   dnsRecords,
//                   verificationResults,
//                   generationMethod: certResult.method,
//                   instructions: [
//                     "Certificates have been generated and are ready for download",
//                     "Download each certificate file using the download buttons below",
//                     "Upload the certificate files to your hosting control panel",
//                     "Configure your web server to use these certificates",
//                   ],
//                   note: `SSL certificates for ${domain} are valid for 90 days. Set up auto-renewal for production use.`,
//                   installationGuide: {
//                     cPanel: [
//                       "Go to cPanel → SSL/TLS → Install and Manage SSL",
//                       `Select ${domain}`,
//                       "Upload or paste the Full Chain certificate in the Certificate (CRT) field",
//                       "Upload or paste the Private Key in the Private Key (KEY) field",
//                       "Upload or paste the Chain certificate in the Certificate Authority Bundle (CABUNDLE) field",
//                       "Click Install Certificate",
//                     ],
//                     plesk: [
//                       "Go to Plesk → Websites & Domains → SSL/TLS Certificates",
//                       "Click Add SSL/TLS Certificate",
//                       `Enter ${domain} as the certificate name`,
//                       "Upload the certificate files or paste their contents",
//                       "Assign the certificate to your domain",
//                     ],
//                     nginx: [
//                       `Upload fullchain.pem and privkey.pem to your server`,
//                       `Configure Nginx virtual host for ${domain}`,
//                       `Add: ssl_certificate /path/to/fullchain.pem;`,
//                       `Add: ssl_certificate_key /path/to/privkey.pem;`,
//                       `Restart Nginx: sudo systemctl restart nginx`,
//                     ],
//                     apache: [
//                       `Upload cert.pem, chain.pem, and privkey.pem to your server`,
//                       `Configure Apache virtual host for ${domain}`,
//                       `Add: SSLCertificateFile /path/to/cert.pem`,
//                       `Add: SSLCertificateKeyFile /path/to/privkey.pem`,
//                       `Add: SSLCertificateChainFile /path/to/chain.pem`,
//                       `Restart Apache: sudo systemctl restart apache2`,
//                     ],
//                   },
//                 })
//               );
//             } else {
//               // Return fallback certificates
//               resolvePromise(
//                 NextResponse.json({
//                   success: true,
//                   message: `DNS records verified for ${domain}, but certificate generation failed. Here are test certificates for development.`,
//                   certificateFiles: certResult.fallbackCertificates,
//                   dnsRecords,
//                   verificationResults,
//                   isTestCertificate: true,
//                   instructions: [
//                     "DNS records are properly configured",
//                     "Test certificates provided for development/testing",
//                     "For production certificates, try running certbot manually on your server",
//                     "Upload these test certificates to test your SSL installation process",
//                   ],
//                   note: `These are test certificates for ${domain}. For production, ensure your server has proper certbot configuration.`,
//                   troubleshooting: [
//                     "DNS records are verified but certificate generation failed",
//                     "This might be due to rate limits or server configuration",
//                     "Try running certbot manually on your server",
//                     "Check server firewall and port 80/443 accessibility",
//                   ],
//                 })
//               );
//             }
//           } else {
//             // DNS not verified, return records for manual addition
//             resolvePromise(
//               NextResponse.json({
//                 success: true,
//                 message: `DNS verification required for ${domain}. Add these TXT records to your DNS provider.`,
//                 dnsRecords,
//                 verificationResults,
//                 requiresDnsSetup: true,
//                 instructions: [
//                   `Add the DNS TXT records shown above to ${domain}'s DNS settings`,
//                   "Wait 5-10 minutes for DNS propagation",
//                   "Try generating certificates again after DNS records propagate",
//                   "You can verify DNS propagation using online DNS checker tools",
//                 ],
//                 note: `DNS records for ${domain} need to be added before certificate generation can complete.`,
//                 nextSteps: [
//                   "Copy each DNS record (name, type, value) to your DNS provider",
//                   "Wait for DNS propagation (usually 5-10 minutes)",
//                   "Run the certificate generation again",
//                   "Download and install the generated certificates",
//                 ],
//               })
//             );
//           }
//         } catch (error) {
//           console.error(`Automatic generation error for ${domain}:`, error);
//           resolvePromise(
//             NextResponse.json({
//               success: false,
//               error: `Automatic generation failed for ${domain}: ${error.message}`,
//               troubleshooting: [
//                 "Try Manual DNS Verification instead",
//                 "Check if the domain is valid and accessible",
//                 "Ensure proper server configuration and permissions",
//                 "Verify certbot installation",
//               ],
//             })
//           );
//         }
//       })();
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);
//     return NextResponse.json(
//       { success: false, error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }

// import { NextRequest, NextResponse } from "next/server";
// import { spawn } from "child_process";
// import { promises as fs } from "fs";
// import path from "path";

// export async function POST(request: NextRequest): Promise<NextResponse> {
//   try {
//     const { domain, email, includeWildcard } = await request.json();

//     if (!domain || !email) {
//       return NextResponse.json(
//         { success: false, error: "Domain and email are required" },
//         { status: 400 }
//       );
//     }

//     // Validate domain format
//     const domainRegex =
//       /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
//     if (!domainRegex.test(domain)) {
//       return NextResponse.json(
//         { success: false, error: "Invalid domain format" },
//         { status: 400 }
//       );
//     }

//     // Clean up any existing processes and lock files
//     try {
//       await new Promise<void>((resolve) => {
//         const cleanup = spawn("sudo", [
//           "bash",
//           "-c",
//           "pkill -f certbot || true; rm -f /var/lib/letsencrypt/.certbot.lock || true; rm -rf /tmp/certbot-* || true",
//         ]);
//         cleanup.on("close", () => resolve());
//         setTimeout(() => {
//           cleanup.kill();
//           resolve();
//         }, 5000);
//       });

//       // Wait for cleanup
//       await new Promise((resolve) => setTimeout(resolve, 2000));
//     } catch (cleanupError) {
//       console.log("Cleanup warning:", cleanupError);
//     }

//     // Build domains array
//     const domains = includeWildcard ? [domain, `*.${domain}`] : [domain];

//     // Execute certbot to generate actual certificates
//     const certbotArgs = [
//       "certonly",
//       "--manual",
//       "--preferred-challenges",
//       "dns",
//       "--agree-tos",
//       "--email",
//       email,
//       "--server",
//       "https://acme-v02.api.letsencrypt.org/directory",
//       "--cert-name",
//       domain,
//       "--expand", // Allow certificate expansion
//       ...domains.flatMap((d) => ["-d", d]),
//     ];

//     console.log(
//       "Executing certbot for automatic generation with args:",
//       certbotArgs
//     );

//     const certbotProcess = spawn("sudo", ["certbot", ...certbotArgs], {
//       stdio: ["pipe", "pipe", "pipe"],
//       env: { ...process.env, DEBIAN_FRONTEND: "noninteractive" },
//     });

//     let output = "";
//     let errorOutput = "";
//     const dnsRecords: any[] = [];
//     let responseSent = false;
//     let certificatesGenerated = false;

//     // Auto-respond to prompts
//     certbotProcess.stdin.write("Y\n"); // Agree to terms if prompted

//     certbotProcess.stdout.on("data", (data) => {
//       const text = data.toString();
//       output += text;
//       console.log("Certbot stdout:", text);

//       // Check if certificates were successfully generated
//       if (
//         text.includes("Successfully received certificate") ||
//         text.includes("Certificate is saved at") ||
//         text.includes("Congratulations!")
//       ) {
//         certificatesGenerated = true;
//         console.log("Certificates generated successfully");
//       }

//       // Parse DNS challenge records
//       const lines = text.split("\n");
//       for (let i = 0; i < lines.length; i++) {
//         const line = lines[i].trim();

//         if (line.includes("Please deploy a DNS TXT record under the name")) {
//           let recordName = "";
//           let recordValue = "";

//           // Look for record details in subsequent lines
//           for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
//             const nextLine = lines[j].trim();

//             // Find record name
//             if (nextLine.includes("_acme-challenge.") && !recordName) {
//               recordName = nextLine.replace(/[^\w\.\-]/g, "");
//             }

//             // Find record value
//             if (
//               lines[j - 1] &&
//               lines[j - 1].includes("with the following value") &&
//               nextLine.length > 20 &&
//               /^[A-Za-z0-9_\-]+$/.test(nextLine)
//             ) {
//               recordValue = nextLine;
//               break;
//             }
//           }

//           if (recordName && recordValue) {
//             const baseDomain = recordName.replace("_acme-challenge.", "");
//             const dnsRecord = {
//               name: recordName,
//               type: "TXT",
//               value: recordValue,
//               domain: baseDomain,
//             };

//             if (
//               !dnsRecords.find(
//                 (r) => r.name === recordName && r.value === recordValue
//               )
//             ) {
//               dnsRecords.push(dnsRecord);
//               console.log("Found DNS record:", dnsRecord);
//             }
//           }
//         }
//       }

//       // Auto-continue if we see the DNS challenge prompt
//       if (
//         text.includes("Press Enter to Continue") ||
//         text.includes("Press ENTER to continue")
//       ) {
//         setTimeout(() => {
//           certbotProcess.stdin.write("\n");
//         }, 1000);
//       }
//     });

//     certbotProcess.stderr.on("data", (data) => {
//       const text = data.toString();
//       errorOutput += text;
//       console.error("Certbot stderr:", text);
//     });

//     return new Promise<NextResponse>((resolve) => {
//       const timeoutId = setTimeout(() => {
//         if (!responseSent) {
//           responseSent = true;
//           certbotProcess.kill("SIGTERM");

//           // Return DNS records for manual verification
//           resolve(
//             NextResponse.json({
//               success: true,
//               message:
//                 "DNS verification required. Please add the TXT records below, wait for propagation, then run the server command.",
//               dnsRecords,
//               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                 .map((d) => `-d ${d}`)
//                 .join(" ")} --agree-tos --cert-name ${domain}`,
//               certificatePath: `/etc/letsencrypt/live/${domain}/`,
//               instructions: [
//                 "Add the DNS TXT records shown above to your DNS provider",
//                 "Wait 5-10 minutes for DNS propagation",
//                 "Run the server command to complete certificate generation",
//                 "Download the generated certificate files",
//               ],
//               output,
//             })
//           );
//         }
//       }, 60000); // 60 seconds timeout

//       certbotProcess.on("close", async (code) => {
//         clearTimeout(timeoutId);
//         if (responseSent) return;

//         console.log("Certbot process ended with code:", code);
//         responseSent = true;

//         if (certificatesGenerated || code === 0) {
//           try {
//             // Try to read the generated certificate files
//             const certPath = `/etc/letsencrypt/live/${domain}`;
//             const certificateFiles: any = {};

//             try {
//               const fullchainPath = path.join(certPath, "fullchain.pem");
//               const privkeyPath = path.join(certPath, "privkey.pem");
//               const certPath_file = path.join(certPath, "cert.pem");
//               const chainPath = path.join(certPath, "chain.pem");

//               // Check if files exist and read them
//               if (
//                 await fs
//                   .access(fullchainPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.fullchain = await fs.readFile(
//                   fullchainPath,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(privkeyPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.privkey = await fs.readFile(
//                   privkeyPath,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(certPath_file)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.cert = await fs.readFile(
//                   certPath_file,
//                   "utf8"
//                 );
//               }

//               if (
//                 await fs
//                   .access(chainPath)
//                   .then(() => true)
//                   .catch(() => false)
//               ) {
//                 certificateFiles.chain = await fs.readFile(chainPath, "utf8");
//               }

//               if (Object.keys(certificateFiles).length > 0) {
//                 // Certificates were successfully generated and read
//                 resolve(
//                   NextResponse.json({
//                     success: true,
//                     message:
//                       "SSL certificates generated successfully! Download the files below.",
//                     certificateFiles,
//                     certificatePath: certPath,
//                     expiryDate: new Date(
//                       Date.now() + 90 * 24 * 60 * 60 * 1000
//                     ).toISOString(),
//                     domains,
//                     instructions: [
//                       "Download the certificate files using the buttons below",
//                       "Upload them to your hosting control panel or server",
//                       "Configure your web server to use the new certificates",
//                       "Test your SSL installation",
//                       "Set up auto-renewal for certificates expiring in 90 days",
//                     ],
//                     output,
//                   })
//                 );
//                 return;
//               }
//             } catch (fileError) {
//               console.error("Error reading certificate files:", fileError);
//             }

//             // If we can't read files but process succeeded, return DNS verification info
//             resolve(
//               NextResponse.json({
//                 success: true,
//                 message:
//                   "Certificate generation initiated. Complete DNS verification to generate files.",
//                 dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
//                 serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                   .map((d) => `-d ${d}`)
//                   .join(" ")} --agree-tos --cert-name ${domain}`,
//                 certificatePath: certPath,
//                 instructions: [
//                   "Add any required DNS TXT records to your DNS provider",
//                   "Wait for DNS propagation (5-10 minutes)",
//                   "Run the server command to complete certificate generation",
//                   "Check /etc/letsencrypt/live/ for your certificate files",
//                 ],
//                 output,
//               })
//             );
//           } catch (error) {
//             console.error("Post-generation error:", error);
//             resolve(
//               NextResponse.json(
//                 {
//                   success: false,
//                   error: `Certificate generation completed but files could not be accessed: ${error}`,
//                   dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
//                   serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                     .map((d) => `-d ${d}`)
//                     .join(" ")} --agree-tos --cert-name ${domain}`,
//                   troubleshooting: [
//                     "Check if certbot completed successfully",
//                     "Verify certificate files exist in /etc/letsencrypt/live/",
//                     "Check file permissions",
//                     "Try running the server command manually",
//                   ],
//                   output,
//                 },
//                 { status: 500 }
//               )
//             );
//           }
//         } else {
//           // Certificate generation failed
//           resolve(
//             NextResponse.json(
//               {
//                 success: false,
//                 error: errorOutput || "Certificate generation failed",
//                 dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
//                 serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                   .map((d) => `-d ${d}`)
//                   .join(" ")} --agree-tos --cert-name ${domain}`,
//                 output,
//                 code,
//                 troubleshooting: [
//                   "Verify your domain points to this server",
//                   "Check that ports 80 and 443 are accessible",
//                   "Ensure DNS records are correct",
//                   "Try running the command manually for more detailed output",
//                   "Check /var/log/letsencrypt/letsencrypt.log for detailed errors",
//                 ],
//               },
//               { status: 500 }
//             )
//           );
//         }
//       });

//       certbotProcess.on("error", (error) => {
//         clearTimeout(timeoutId);
//         if (responseSent) return;

//         console.error("Process error:", error);
//         responseSent = true;

//         resolve(
//           NextResponse.json(
//             {
//               success: false,
//               error: `Certbot process failed to start: ${error.message}`,
//               serverCommand: `sudo certbot certonly --manual --preferred-challenges dns --email ${email} ${domains
//                 .map((d) => `-d ${d}`)
//                 .join(" ")} --agree-tos --cert-name ${domain}`,
//               troubleshooting: [
//                 "Ensure certbot is installed on the server",
//                 "Check that the certbot service is running",
//                 "Verify sudo permissions for the application",
//                 "Try running the server command manually",
//               ],
//             },
//             { status: 500 }
//           )
//         );
//       });
//     });
//   } catch (error) {
//     console.error("Certificate generation error:", error);
//     return NextResponse.json(
//       {
//         success: false,
//         error: "Internal server error. Please try again.",
//         troubleshooting: [
//           "Check server logs for detailed error information",
//           "Ensure all required services are running",
//           "Verify network connectivity",
//           "Try again in a few minutes",
//         ],
//       },
//       { status: 500 }
//     );
//   }
// }
