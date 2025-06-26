"use client";
import React, { useState } from "react";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  Copy,
  ExternalLink,
} from "lucide-react";

interface DnsRecord {
  name: string;
  type: string;
  value: string;
  ttl: number;
}

interface Certificates {
  certificate: string;
  privateKey: string;
  caBundle: string;
  fullChain: string;
}

interface ChallengeData {
  domain: string;
  email: string;
  dnsRecords: DnsRecord[];
  challengeToken: string;
  instructions: string[];
}

export default function SSLAsServiceGenerator() {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [includeWildcard, setIncludeWildcard] = useState(true);
  const [loading, setLoading] = useState(false);
  const [challengeData, setChallengeData] = useState<ChallengeData | null>(
    null
  );
  const [certificates, setCertificates] = useState<Certificates | null>(null);
  const [error, setError] = useState<string>("");

  const CopyButton = ({ text, label }: { text: string; label: string }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    return (
      <button
        onClick={handleCopy}
        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
      >
        {copied ? "✅ Copied!" : `📋 Copy ${label}`}
      </button>
    );
  };

  const generateChallenge = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ssl-as-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          email,
          includeWildcard,
          step: "generate-challenge",
        }),
      });

      const data = await response.json();

      if (data.success) {
        setChallengeData({
          domain: data.domain,
          email: email,
          dnsRecords: data.dnsRecords,
          challengeToken: data.challengeToken,
          instructions: data.instructions,
        });
        setStep(2);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to generate challenge. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const completeCertificate = async () => {
    if (!challengeData) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ssl-as-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: challengeData.domain,
          email: challengeData.email,
          step: "complete-certificate",
          challengeToken: challengeData.challengeToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCertificates(data.certificates);
        setStep(3);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError("Failed to complete certificate generation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetProcess = () => {
    setStep(1);
    setDomain("");
    setEmail("");
    setIncludeWildcard(true);
    setChallengeData(null);
    setCertificates(null);
    setError("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🔒 SSL Certificate Generator Service
          </h1>
          <p className="text-gray-600">
            Generate free SSL certificates for any domain - Download and install
            on your hosting provider
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8 space-x-4">
          <div
            className={`flex items-center space-x-2 ${
              step >= 1 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
                step >= 1
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300"
              }`}
            >
              1
            </div>
            <span className="font-medium">Domain Setup</span>
          </div>

          <div
            className={`w-12 h-0.5 ${
              step >= 2 ? "bg-blue-600" : "bg-gray-300"
            }`}
          ></div>

          <div
            className={`flex items-center space-x-2 ${
              step >= 2 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
                step >= 2
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300"
              }`}
            >
              2
            </div>
            <span className="font-medium">DNS Setup</span>
          </div>

          <div
            className={`w-12 h-0.5 ${
              step >= 3 ? "bg-blue-600" : "bg-gray-300"
            }`}
          ></div>

          <div
            className={`flex items-center space-x-2 ${
              step >= 3 ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
                step >= 3
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300"
              }`}
            >
              3
            </div>
            <span className="font-medium">Download SSL</span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <h4 className="font-semibold text-red-800">Error</h4>
            </div>
            <p className="text-red-700 mt-1">{error}</p>
          </div>
        )}

        {/* Step 1: Domain Input */}
        {step === 1 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 1: Enter Your Domain
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Domain Name
                </label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) =>
                    setDomain(e.target.value.trim().toLowerCase())
                  }
                  placeholder="example.com"
                  pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}"
                  title="Enter a valid domain name (e.g., example.com)"
                  autoComplete="off"
                  spellCheck="false"
                  inputMode="url"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Enter the domain where you want to install the SSL certificate
                  (without www or https)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="your@email.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Required for Let's Encrypt notifications and certificate
                  management
                </p>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="wildcard"
                  checked={includeWildcard}
                  onChange={(e) => setIncludeWildcard(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label
                  htmlFor="wildcard"
                  className="ml-2 text-sm text-gray-700"
                >
                  Include wildcard certificate (*.{domain || "example.com"})
                </label>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">
                  📋 What You'll Need:
                </h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>Access to your domain's DNS settings</li>
                  <li>Ability to add TXT records to your DNS</li>
                  <li>A valid email address for SSL notifications</li>
                  <li>Access to your hosting control panel (cPanel, etc.)</li>
                  <li>5-10 minutes for DNS propagation</li>
                </ul>
              </div>

              <button
                onClick={generateChallenge}
                disabled={!domain || !email || loading}
                className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generating DNS Challenge...
                  </div>
                ) : (
                  "Generate DNS Challenge"
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: DNS Setup */}
        {step === 2 && challengeData && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Step 2: Add DNS Records for {challengeData.domain}
            </h3>

            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">
                ⚠️ Important Instructions:
              </h4>
              <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                <li>
                  Go to your domain's DNS provider (where you manage DNS
                  records)
                </li>
                <li>Add the TXT record(s) shown below exactly as displayed</li>
                <li>Wait 5-10 minutes for DNS propagation</li>
                <li>Click "Complete Certificate Generation" below</li>
              </ol>
            </div>

            <div className="space-y-4">
              {challengeData.dnsRecords.map((record, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <h5 className="font-semibold text-gray-800 mb-3">
                    DNS Record #{index + 1}
                  </h5>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <label className="block font-medium text-gray-700 mb-1">
                        Name/Host:
                      </label>
                      <div className="flex items-center space-x-2">
                        <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1">
                          {record.name}
                        </code>
                        <CopyButton text={record.name} label="Name" />
                      </div>
                    </div>

                    <div>
                      <label className="block font-medium text-gray-700 mb-1">
                        Type:
                      </label>
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                        {record.type}
                      </code>
                    </div>

                    <div>
                      <label className="block font-medium text-gray-700 mb-1">
                        TTL:
                      </label>
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                        {record.ttl}
                      </code>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="block font-medium text-gray-700 mb-1">
                      Value:
                    </label>
                    <div className="flex items-center space-x-2">
                      <textarea
                        value={record.value}
                        readOnly
                        className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-none h-20"
                        onClick={(e) =>
                          (e.target as HTMLTextAreaElement).select()
                        }
                      />
                      <CopyButton text={record.value} label="Value" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">
                ✅ After Adding DNS Records:
              </h4>
              <p className="text-sm text-green-700">
                Wait 5-10 minutes for DNS propagation, then click the button
                below to complete certificate generation. The system will verify
                your DNS records and generate your SSL certificates.
              </p>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={completeCertificate}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Generating Certificates...
                  </div>
                ) : (
                  "Complete Certificate Generation"
                )}
              </button>

              <button
                onClick={resetProcess}
                disabled={loading}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Start Over
              </button>
            </div>

            {loading && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 text-sm flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  Verifying DNS records and generating certificates... This may
                  take 2-5 minutes.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Download Certificates */}
        {step === 3 && certificates && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              🎉 SSL Certificates Ready for {challengeData?.domain}!
            </h3>

            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h4 className="font-semibold text-green-800 mb-2">
                ✅ Installation Instructions
              </h4>
              <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
                <li>Go to your hosting control panel (cPanel, Plesk, etc.)</li>
                <li>Find SSL/TLS Certificate installation section</li>
                <li>
                  Copy and paste each certificate section below into the
                  corresponding fields
                </li>
                <li>Save/Install the certificate</li>
                <li>Test your SSL with the link provided below</li>
              </ol>
            </div>

            <div className="space-y-6">
              {/* Certificate (CRT) */}
              <div className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-800">
                      Certificate (CRT)
                    </h5>
                    <CopyButton
                      text={certificates.certificate}
                      label="Certificate"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Paste this into the "Certificate" or "CRT" field in your
                    hosting panel
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={certificates.certificate}
                    readOnly
                    className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>

              {/* Private Key */}
              <div className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-800">
                      Private Key (KEY)
                    </h5>
                    <CopyButton
                      text={certificates.privateKey}
                      label="Private Key"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Paste this into the "Private Key" or "KEY" field in your
                    hosting panel
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={certificates.privateKey}
                    readOnly
                    className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>

              {/* CA Bundle */}
              <div className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-800">
                      CA Bundle (CABUNDLE)
                    </h5>
                    <CopyButton
                      text={certificates.caBundle}
                      label="CA Bundle"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Paste this into the "CA Bundle" or "CABUNDLE" field in your
                    hosting panel
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={certificates.caBundle}
                    readOnly
                    className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>

              {/* Full Chain (Alternative) */}
              <div className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h5 className="font-semibold text-gray-800">
                      Full Chain (Alternative)
                    </h5>
                    <CopyButton
                      text={certificates.fullChain}
                      label="Full Chain"
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Use this if your hosting provider asks for a single
                    certificate file
                  </p>
                </div>
                <div className="p-4">
                  <textarea
                    value={certificates.fullChain}
                    readOnly
                    className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-800 mb-2">
                🔒 Security Notes
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                <li>
                  Keep your Private Key secure and never share it publicly
                </li>
                <li>These certificates are valid for 90 days</li>
                <li>Set up automatic renewal before expiration</li>
                <li>After installation, test your SSL configuration</li>
              </ul>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={resetProcess}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Generate Another Certificate
              </button>

              <button
                onClick={() =>
                  window.open(
                    `https://www.ssllabs.com/ssltest/analyze.html?d=${challengeData?.domain}`,
                    "_blank"
                  )
                }
                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Test SSL Installation
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// "use client";
// import React, { useState } from "react";
// import {
//   CheckCircle,
//   Clock,
//   AlertCircle,
//   Download,
//   Copy,
//   ExternalLink,
// } from "lucide-react";

// interface DnsRecord {
//   name: string;
//   type: string;
//   value: string;
//   ttl: number;
// }

// interface Certificates {
//   certificate: string;
//   privateKey: string;
//   caBundle: string;
//   fullChain: string;
// }

// interface ChallengeData {
//   domain: string;
//   dnsRecords: DnsRecord[];
//   challengeToken: string;
//   instructions: string[];
// }

// export default function SSLAsServiceGenerator() {
//   const [step, setStep] = useState(1);
//   const [domain, setDomain] = useState("");
//   const [email, setEmail] = useState("");
//   const [includeWildcard, setIncludeWildcard] = useState(true);
//   const [loading, setLoading] = useState(false);
//   const [challengeData, setChallengeData] = useState<ChallengeData | null>(
//     null
//   );
//   const [certificates, setCertificates] = useState<Certificates | null>(null);
//   const [error, setError] = useState<string>("");

//   const CopyButton = ({ text, label }: { text: string; label: string }) => {
//     const [copied, setCopied] = useState(false);

//     const handleCopy = async () => {
//       try {
//         await navigator.clipboard.writeText(text);
//         setCopied(true);
//         setTimeout(() => setCopied(false), 2000);
//       } catch (err) {
//         console.error("Failed to copy:", err);
//       }
//     };

//     return (
//       <button
//         onClick={handleCopy}
//         className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
//       >
//         {copied ? "✅ Copied!" : `📋 Copy ${label}`}
//       </button>
//     );
//   };

//   const generateChallenge = async () => {
//     setLoading(true);
//     setError("");

//     try {
//       const response = await fetch("/api/ssl-as-service", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           domain,
//           email,
//           includeWildcard,
//           step: "generate-challenge",
//         }),
//       });

//       const data = await response.json();

//       if (data.success) {
//         setChallengeData({
//           domain: data.domain,
//           dnsRecords: data.dnsRecords,
//           challengeToken: data.challengeToken,
//           instructions: data.instructions,
//         });
//         setStep(2);
//       } else {
//         setError(data.error);
//       }
//     } catch (err) {
//       setError("Failed to generate challenge. Please try again.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const completeCertificate = async () => {
//     if (!challengeData) return;

//     setLoading(true);
//     setError("");

//     try {
//       const response = await fetch("/api/ssl-as-service", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           domain: challengeData.domain,
//           step: "complete-certificate",
//           challengeToken: challengeData.challengeToken,
//         }),
//       });

//       const data = await response.json();

//       if (data.success) {
//         setCertificates(data.certificates);
//         setStep(3);
//       } else {
//         setError(data.error);
//       }
//     } catch (err) {
//       setError("Failed to complete certificate generation. Please try again.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const resetProcess = () => {
//     setStep(1);
//     setDomain("");
//     setEmail("");
//     setIncludeWildcard(true);
//     setChallengeData(null);
//     setCertificates(null);
//     setError("");
//     setLoading(false);
//   };

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
//       <div className="max-w-4xl mx-auto">
//         <div className="text-center mb-8">
//           <h1 className="text-3xl font-bold text-gray-800 mb-2">
//             🔒 SSL Certificate Generator Service
//           </h1>
//           <p className="text-gray-600">
//             Generate free SSL certificates for any domain - Download and install
//             on your hosting provider
//           </p>
//         </div>

//         {/* Progress Steps */}
//         <div className="flex items-center justify-center mb-8 space-x-4">
//           <div
//             className={`flex items-center space-x-2 ${
//               step >= 1 ? "text-blue-600" : "text-gray-400"
//             }`}
//           >
//             <div
//               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
//                 step >= 1
//                   ? "bg-blue-600 text-white border-blue-600"
//                   : "border-gray-300"
//               }`}
//             >
//               1
//             </div>
//             <span className="font-medium">Domain Setup</span>
//           </div>

//           <div
//             className={`w-12 h-0.5 ${
//               step >= 2 ? "bg-blue-600" : "bg-gray-300"
//             }`}
//           ></div>

//           <div
//             className={`flex items-center space-x-2 ${
//               step >= 2 ? "text-blue-600" : "text-gray-400"
//             }`}
//           >
//             <div
//               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
//                 step >= 2
//                   ? "bg-blue-600 text-white border-blue-600"
//                   : "border-gray-300"
//               }`}
//             >
//               2
//             </div>
//             <span className="font-medium">DNS Setup</span>
//           </div>

//           <div
//             className={`w-12 h-0.5 ${
//               step >= 3 ? "bg-blue-600" : "bg-gray-300"
//             }`}
//           ></div>

//           <div
//             className={`flex items-center space-x-2 ${
//               step >= 3 ? "text-blue-600" : "text-gray-400"
//             }`}
//           >
//             <div
//               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
//                 step >= 3
//                   ? "bg-blue-600 text-white border-blue-600"
//                   : "border-gray-300"
//               }`}
//             >
//               3
//             </div>
//             <span className="font-medium">Download SSL</span>
//           </div>
//         </div>

//         {/* Error Display */}
//         {error && (
//           <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
//             <div className="flex items-center">
//               <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
//               <h4 className="font-semibold text-red-800">Error</h4>
//             </div>
//             <p className="text-red-700 mt-1">{error}</p>
//           </div>
//         )}

//         {/* Step 1: Domain Input */}
//         {step === 1 && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 1: Enter Your Domain
//             </h3>

//             <div className="space-y-4">
//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                   Domain Name
//                 </label>
//                 <input
//                   type="text"
//                   value={domain}
//                   onChange={(e) =>
//                     setDomain(e.target.value.trim().toLowerCase())
//                   }
//                   placeholder="example.com"
//                   pattern="[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}"
//                   title="Enter a valid domain name (e.g., example.com)"
//                   autoComplete="off"
//                   spellCheck="false"
//                   inputMode="url"
//                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
//                 />
//                 <p className="text-sm text-gray-500 mt-1">
//                   Enter the domain where you want to install the SSL certificate
//                   (without www or https)
//                 </p>
//               </div>

//               <div>
//                 <label className="block text-sm font-medium text-gray-700 mb-2">
//                   Email Address
//                 </label>
//                 <input
//                   type="email"
//                   value={email}
//                   onChange={(e) => setEmail(e.target.value.trim())}
//                   placeholder="your@email.com"
//                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
//                 />
//                 <p className="text-sm text-gray-500 mt-1">
//                   Required for Let's Encrypt notifications and certificate
//                   management
//                 </p>
//               </div>

//               <div className="flex items-center">
//                 <input
//                   type="checkbox"
//                   id="wildcard"
//                   checked={includeWildcard}
//                   onChange={(e) => setIncludeWildcard(e.target.checked)}
//                   className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
//                 />
//                 <label
//                   htmlFor="wildcard"
//                   className="ml-2 text-sm text-gray-700"
//                 >
//                   Include wildcard certificate (*.{domain || "example.com"})
//                 </label>
//               </div>

//               <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
//                 <h4 className="font-semibold text-blue-800 mb-2">
//                   📋 What You'll Need:
//                 </h4>
//                 <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
//                   <li>Access to your domain's DNS settings</li>
//                   <li>Ability to add TXT records to your DNS</li>
//                   <li>A valid email address for SSL notifications</li>
//                   <li>Access to your hosting control panel (cPanel, etc.)</li>
//                   <li>5-10 minutes for DNS propagation</li>
//                 </ul>
//               </div>

//               <button
//                 onClick={generateChallenge}
//                 disabled={!domain || !email || loading}
//                 className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//               >
//                 {loading ? (
//                   <div className="flex items-center justify-center">
//                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
//                     Generating DNS Challenge...
//                   </div>
//                 ) : (
//                   "Generate DNS Challenge"
//                 )}
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Step 2: DNS Setup */}
//         {step === 2 && challengeData && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               Step 2: Add DNS Records for {challengeData.domain}
//             </h3>

//             <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//               <h4 className="font-semibold text-yellow-800 mb-2">
//                 ⚠️ Important Instructions:
//               </h4>
//               <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
//                 <li>
//                   Go to your domain's DNS provider (where you manage DNS
//                   records)
//                 </li>
//                 <li>Add the TXT record(s) shown below exactly as displayed</li>
//                 <li>Wait 5-10 minutes for DNS propagation</li>
//                 <li>Click "Complete Certificate Generation" below</li>
//               </ol>
//             </div>

//             <div className="space-y-4">
//               {challengeData.dnsRecords.map((record, index) => (
//                 <div
//                   key={index}
//                   className="border border-gray-200 rounded-lg p-4"
//                 >
//                   <h5 className="font-semibold text-gray-800 mb-3">
//                     DNS Record #{index + 1}
//                   </h5>

//                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
//                     <div>
//                       <label className="block font-medium text-gray-700 mb-1">
//                         Name/Host:
//                       </label>
//                       <div className="flex items-center space-x-2">
//                         <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1">
//                           {record.name}
//                         </code>
//                         <CopyButton text={record.name} label="Name" />
//                       </div>
//                     </div>

//                     <div>
//                       <label className="block font-medium text-gray-700 mb-1">
//                         Type:
//                       </label>
//                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
//                         {record.type}
//                       </code>
//                     </div>

//                     <div>
//                       <label className="block font-medium text-gray-700 mb-1">
//                         TTL:
//                       </label>
//                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
//                         {record.ttl}
//                       </code>
//                     </div>
//                   </div>

//                   <div className="mt-3">
//                     <label className="block font-medium text-gray-700 mb-1">
//                       Value:
//                     </label>
//                     <div className="flex items-center space-x-2">
//                       <textarea
//                         value={record.value}
//                         readOnly
//                         className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-none h-20"
//                         onClick={(e) =>
//                           (e.target as HTMLTextAreaElement).select()
//                         }
//                       />
//                       <CopyButton text={record.value} label="Value" />
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>

//             <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
//               <h4 className="font-semibold text-green-800 mb-2">
//                 ✅ After Adding DNS Records:
//               </h4>
//               <p className="text-sm text-green-700">
//                 Wait 5-10 minutes for DNS propagation, then click the button
//                 below to complete certificate generation. The system will verify
//                 your DNS records and generate your SSL certificates.
//               </p>
//             </div>

//             <div className="flex gap-4 mt-6">
//               <button
//                 onClick={completeCertificate}
//                 disabled={loading}
//                 className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
//               >
//                 {loading ? (
//                   <div className="flex items-center justify-center">
//                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
//                     Generating Certificates...
//                   </div>
//                 ) : (
//                   "Complete Certificate Generation"
//                 )}
//               </button>

//               <button
//                 onClick={resetProcess}
//                 disabled={loading}
//                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
//               >
//                 Start Over
//               </button>
//             </div>

//             {loading && (
//               <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
//                 <p className="text-blue-800 text-sm flex items-center">
//                   <Clock className="w-4 h-4 mr-2" />
//                   Verifying DNS records and generating certificates... This may
//                   take 2-5 minutes.
//                 </p>
//               </div>
//             )}
//           </div>
//         )}

//         {/* Step 3: Download Certificates */}
//         {step === 3 && certificates && (
//           <div className="bg-white rounded-lg shadow-lg p-6">
//             <h3 className="text-lg font-bold text-gray-800 mb-4">
//               🎉 SSL Certificates Ready for {challengeData?.domain}!
//             </h3>

//             <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
//               <h4 className="font-semibold text-green-800 mb-2">
//                 ✅ Installation Instructions
//               </h4>
//               <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
//                 <li>Go to your hosting control panel (cPanel, Plesk, etc.)</li>
//                 <li>Find SSL/TLS Certificate installation section</li>
//                 <li>
//                   Copy and paste each certificate section below into the
//                   corresponding fields
//                 </li>
//                 <li>Save/Install the certificate</li>
//                 <li>Test your SSL with the link provided below</li>
//               </ol>
//             </div>

//             <div className="space-y-6">
//               {/* Certificate (CRT) */}
//               <div className="border border-gray-200 rounded-lg">
//                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
//                   <div className="flex items-center justify-between">
//                     <h5 className="font-semibold text-gray-800">
//                       Certificate (CRT)
//                     </h5>
//                     <CopyButton
//                       text={certificates.certificate}
//                       label="Certificate"
//                     />
//                   </div>
//                   <p className="text-xs text-gray-600 mt-1">
//                     Paste this into the "Certificate" or "CRT" field in your
//                     hosting panel
//                   </p>
//                 </div>
//                 <div className="p-4">
//                   <textarea
//                     value={certificates.certificate}
//                     readOnly
//                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
//                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
//                   />
//                 </div>
//               </div>

//               {/* Private Key */}
//               <div className="border border-gray-200 rounded-lg">
//                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
//                   <div className="flex items-center justify-between">
//                     <h5 className="font-semibold text-gray-800">
//                       Private Key (KEY)
//                     </h5>
//                     <CopyButton
//                       text={certificates.privateKey}
//                       label="Private Key"
//                     />
//                   </div>
//                   <p className="text-xs text-gray-600 mt-1">
//                     Paste this into the "Private Key" or "KEY" field in your
//                     hosting panel
//                   </p>
//                 </div>
//                 <div className="p-4">
//                   <textarea
//                     value={certificates.privateKey}
//                     readOnly
//                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
//                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
//                   />
//                 </div>
//               </div>

//               {/* CA Bundle */}
//               <div className="border border-gray-200 rounded-lg">
//                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
//                   <div className="flex items-center justify-between">
//                     <h5 className="font-semibold text-gray-800">
//                       CA Bundle (CABUNDLE)
//                     </h5>
//                     <CopyButton
//                       text={certificates.caBundle}
//                       label="CA Bundle"
//                     />
//                   </div>
//                   <p className="text-xs text-gray-600 mt-1">
//                     Paste this into the "CA Bundle" or "CABUNDLE" field in your
//                     hosting panel
//                   </p>
//                 </div>
//                 <div className="p-4">
//                   <textarea
//                     value={certificates.caBundle}
//                     readOnly
//                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
//                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
//                   />
//                 </div>
//               </div>

//               {/* Full Chain (Alternative) */}
//               <div className="border border-gray-200 rounded-lg">
//                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
//                   <div className="flex items-center justify-between">
//                     <h5 className="font-semibold text-gray-800">
//                       Full Chain (Alternative)
//                     </h5>
//                     <CopyButton
//                       text={certificates.fullChain}
//                       label="Full Chain"
//                     />
//                   </div>
//                   <p className="text-xs text-gray-600 mt-1">
//                     Use this if your hosting provider asks for a single
//                     certificate file
//                   </p>
//                 </div>
//                 <div className="p-4">
//                   <textarea
//                     value={certificates.fullChain}
//                     readOnly
//                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
//                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
//                   />
//                 </div>
//               </div>
//             </div>

//             <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
//               <h4 className="font-semibold text-yellow-800 mb-2">
//                 🔒 Security Notes
//               </h4>
//               <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
//                 <li>
//                   Keep your Private Key secure and never share it publicly
//                 </li>
//                 <li>These certificates are valid for 90 days</li>
//                 <li>Set up automatic renewal before expiration</li>
//                 <li>After installation, test your SSL configuration</li>
//               </ul>
//             </div>

//             <div className="flex gap-4 mt-6">
//               <button
//                 onClick={resetProcess}
//                 className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
//               >
//                 Generate Another Certificate
//               </button>

//               <button
//                 onClick={() =>
//                   window.open(
//                     `https://www.ssllabs.com/ssltest/analyze.html?d=${challengeData?.domain}`,
//                     "_blank"
//                   )
//                 }
//                 className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
//               >
//                 <ExternalLink className="w-4 h-4 mr-2" />
//                 Test SSL Installation
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }

// // "use client";
// // import React, { useState } from "react";
// // import {
// //   CheckCircle,
// //   Clock,
// //   AlertCircle,
// //   Download,
// //   Copy,
// //   ExternalLink,
// // } from "lucide-react";

// // interface DnsRecord {
// //   name: string;
// //   type: string;
// //   value: string;
// //   ttl: number;
// // }

// // interface Certificates {
// //   certificate: string;
// //   privateKey: string;
// //   caBundle: string;
// //   fullChain: string;
// // }

// // interface ChallengeData {
// //   domain: string;
// //   dnsRecords: DnsRecord[];
// //   challengeToken: string;
// //   instructions: string[];
// // }

// // export default function SSLAsServiceGenerator() {
// //   const [step, setStep] = useState(1);
// //   const [domain, setDomain] = useState("");
// //   const [email, setEmail] = useState("");
// //   const [includeWildcard, setIncludeWildcard] = useState(true);
// //   const [loading, setLoading] = useState(false);
// //   const [challengeData, setChallengeData] = useState<ChallengeData | null>(
// //     null
// //   );
// //   const [certificates, setCertificates] = useState<Certificates | null>(null);
// //   const [error, setError] = useState<string>("");

// //   const CopyButton = ({ text, label }: { text: string; label: string }) => {
// //     const [copied, setCopied] = useState(false);

// //     const handleCopy = async () => {
// //       try {
// //         await navigator.clipboard.writeText(text);
// //         setCopied(true);
// //         setTimeout(() => setCopied(false), 2000);
// //       } catch (err) {
// //         console.error("Failed to copy:", err);
// //       }
// //     };

// //     return (
// //       <button
// //         onClick={handleCopy}
// //         className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
// //       >
// //         {copied ? "✅ Copied!" : `📋 Copy ${label}`}
// //       </button>
// //     );
// //   };

// //   const generateChallenge = async () => {
// //     setLoading(true);
// //     setError("");

// //     try {
// //       const response = await fetch("/api/ssl-as-service", {
// //         method: "POST",
// //         headers: { "Content-Type": "application/json" },
// //         body: JSON.stringify({
// //           domain,
// //           email,
// //           includeWildcard,
// //           step: "generate-challenge",
// //         }),
// //       });

// //       const data = await response.json();

// //       if (data.success) {
// //         setChallengeData({
// //           domain: data.domain,
// //           dnsRecords: data.dnsRecords,
// //           challengeToken: data.challengeToken,
// //           instructions: data.instructions,
// //         });
// //         setStep(2);
// //       } else {
// //         setError(data.error);
// //       }
// //     } catch (err) {
// //       setError("Failed to generate challenge. Please try again.");
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   const completeCertificate = async () => {
// //     if (!challengeData) return;

// //     setLoading(true);
// //     setError("");

// //     try {
// //       const response = await fetch("/api/ssl-as-service", {
// //         method: "POST",
// //         headers: { "Content-Type": "application/json" },
// //         body: JSON.stringify({
// //           domain: challengeData.domain,
// //           step: "complete-certificate",
// //           challengeToken: challengeData.challengeToken,
// //         }),
// //       });

// //       const data = await response.json();

// //       if (data.success) {
// //         setCertificates(data.certificates);
// //         setStep(3);
// //       } else {
// //         setError(data.error);
// //       }
// //     } catch (err) {
// //       setError("Failed to complete certificate generation. Please try again.");
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   const resetProcess = () => {
// //     setStep(1);
// //     setDomain("");
// //     setEmail("");
// //     setIncludeWildcard(true);
// //     setChallengeData(null);
// //     setCertificates(null);
// //     setError("");
// //     setLoading(false);
// //   };

// //   return (
// //     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
// //       <div className="max-w-4xl mx-auto">
// //         <div className="text-center mb-8">
// //           <h1 className="text-3xl font-bold text-gray-800 mb-2">
// //             🔒 SSL Certificate Generator Service
// //           </h1>
// //           <p className="text-gray-600">
// //             Generate free SSL certificates for any domain - Download and install
// //             on your hosting provider
// //           </p>
// //         </div>

// //         {/* Progress Steps */}
// //         <div className="flex items-center justify-center mb-8 space-x-4">
// //           <div
// //             className={`flex items-center space-x-2 ${
// //               step >= 1 ? "text-blue-600" : "text-gray-400"
// //             }`}
// //           >
// //             <div
// //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// //                 step >= 1
// //                   ? "bg-blue-600 text-white border-blue-600"
// //                   : "border-gray-300"
// //               }`}
// //             >
// //               1
// //             </div>
// //             <span className="font-medium">Domain Setup</span>
// //           </div>

// //           <div
// //             className={`w-12 h-0.5 ${
// //               step >= 2 ? "bg-blue-600" : "bg-gray-300"
// //             }`}
// //           ></div>

// //           <div
// //             className={`flex items-center space-x-2 ${
// //               step >= 2 ? "text-blue-600" : "text-gray-400"
// //             }`}
// //           >
// //             <div
// //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// //                 step >= 2
// //                   ? "bg-blue-600 text-white border-blue-600"
// //                   : "border-gray-300"
// //               }`}
// //             >
// //               2
// //             </div>
// //             <span className="font-medium">DNS Setup</span>
// //           </div>

// //           <div
// //             className={`w-12 h-0.5 ${
// //               step >= 3 ? "bg-blue-600" : "bg-gray-300"
// //             }`}
// //           ></div>

// //           <div
// //             className={`flex items-center space-x-2 ${
// //               step >= 3 ? "text-blue-600" : "text-gray-400"
// //             }`}
// //           >
// //             <div
// //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// //                 step >= 3
// //                   ? "bg-blue-600 text-white border-blue-600"
// //                   : "border-gray-300"
// //               }`}
// //             >
// //               3
// //             </div>
// //             <span className="font-medium">Download SSL</span>
// //           </div>
// //         </div>

// //         {/* Error Display */}
// //         {error && (
// //           <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
// //             <div className="flex items-center">
// //               <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
// //               <h4 className="font-semibold text-red-800">Error</h4>
// //             </div>
// //             <p className="text-red-700 mt-1">{error}</p>
// //           </div>
// //         )}

// //         {/* Step 1: Domain Input */}
// //         {step === 1 && (
// //           <div className="bg-white rounded-lg shadow-lg p-6">
// //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// //               Step 1: Enter Your Domain
// //             </h3>

// //             <div className="space-y-4">
// //               <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                   Domain Name
// //                 </label>
// //                 <input
// //                   type="text"
// //                   value={domain}
// //                   onChange={(e) =>
// //                     setDomain(e.target.value.trim().toLowerCase())
// //                   }
// //                   placeholder="example.com"
// //                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
// //                 />
// //                 <p className="text-sm text-gray-500 mt-1">
// //                   Enter the domain where you want to install the SSL certificate
// //                 </p>
// //               </div>

// //               <div>
// //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// //                   Email Address
// //                 </label>
// //                 <input
// //                   type="email"
// //                   value={email}
// //                   onChange={(e) => setEmail(e.target.value.trim())}
// //                   placeholder="your@email.com"
// //                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
// //                 />
// //                 <p className="text-sm text-gray-500 mt-1">
// //                   Required for Let's Encrypt notifications and certificate
// //                   management
// //                 </p>
// //               </div>

// //               <div className="flex items-center">
// //                 <input
// //                   type="checkbox"
// //                   id="wildcard"
// //                   checked={includeWildcard}
// //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// //                   className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
// //                 />
// //                 <label
// //                   htmlFor="wildcard"
// //                   className="ml-2 text-sm text-gray-700"
// //                 >
// //                   Include wildcard certificate (*.{domain || "example.com"})
// //                 </label>
// //               </div>

// //               <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
// //                 <h4 className="font-semibold text-blue-800 mb-2">
// //                   📋 What You'll Need:
// //                 </h4>
// //                 <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
// //                   <li>Access to your domain's DNS settings</li>
// //                   <li>Ability to add TXT records to your DNS</li>
// //                   <li>A valid email address for SSL notifications</li>
// //                   <li>Access to your hosting control panel (cPanel, etc.)</li>
// //                   <li>5-10 minutes for DNS propagation</li>
// //                 </ul>
// //               </div>

// //               <button
// //                 onClick={generateChallenge}
// //                 disabled={!domain || !email || loading}
// //                 className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// //               >
// //                 {loading ? (
// //                   <div className="flex items-center justify-center">
// //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// //                     Generating DNS Challenge...
// //                   </div>
// //                 ) : (
// //                   "Generate DNS Challenge"
// //                 )}
// //               </button>
// //             </div>
// //           </div>
// //         )}

// //         {/* Step 2: DNS Setup */}
// //         {step === 2 && challengeData && (
// //           <div className="bg-white rounded-lg shadow-lg p-6">
// //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// //               Step 2: Add DNS Records for {challengeData.domain}
// //             </h3>

// //             <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// //               <h4 className="font-semibold text-yellow-800 mb-2">
// //                 ⚠️ Important Instructions:
// //               </h4>
// //               <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
// //                 <li>
// //                   Go to your domain's DNS provider (where you manage DNS
// //                   records)
// //                 </li>
// //                 <li>Add the TXT record(s) shown below exactly as displayed</li>
// //                 <li>Wait 5-10 minutes for DNS propagation</li>
// //                 <li>Click "Complete Certificate Generation" below</li>
// //               </ol>
// //             </div>

// //             <div className="space-y-4">
// //               {challengeData.dnsRecords.map((record, index) => (
// //                 <div
// //                   key={index}
// //                   className="border border-gray-200 rounded-lg p-4"
// //                 >
// //                   <h5 className="font-semibold text-gray-800 mb-3">
// //                     DNS Record #{index + 1}
// //                   </h5>

// //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
// //                     <div>
// //                       <label className="block font-medium text-gray-700 mb-1">
// //                         Name/Host:
// //                       </label>
// //                       <div className="flex items-center space-x-2">
// //                         <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1">
// //                           {record.name}
// //                         </code>
// //                         <CopyButton text={record.name} label="Name" />
// //                       </div>
// //                     </div>

// //                     <div>
// //                       <label className="block font-medium text-gray-700 mb-1">
// //                         Type:
// //                       </label>
// //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// //                         {record.type}
// //                       </code>
// //                     </div>

// //                     <div>
// //                       <label className="block font-medium text-gray-700 mb-1">
// //                         TTL:
// //                       </label>
// //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// //                         {record.ttl}
// //                       </code>
// //                     </div>
// //                   </div>

// //                   <div className="mt-3">
// //                     <label className="block font-medium text-gray-700 mb-1">
// //                       Value:
// //                     </label>
// //                     <div className="flex items-center space-x-2">
// //                       <textarea
// //                         value={record.value}
// //                         readOnly
// //                         className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-none h-20"
// //                         onClick={(e) =>
// //                           (e.target as HTMLTextAreaElement).select()
// //                         }
// //                       />
// //                       <CopyButton text={record.value} label="Value" />
// //                     </div>
// //                   </div>
// //                 </div>
// //               ))}
// //             </div>

// //             <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// //               <h4 className="font-semibold text-green-800 mb-2">
// //                 ✅ After Adding DNS Records:
// //               </h4>
// //               <p className="text-sm text-green-700">
// //                 Wait 5-10 minutes for DNS propagation, then click the button
// //                 below to complete certificate generation. The system will verify
// //                 your DNS records and generate your SSL certificates.
// //               </p>
// //             </div>

// //             <div className="flex gap-4 mt-6">
// //               <button
// //                 onClick={completeCertificate}
// //                 disabled={loading}
// //                 className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// //               >
// //                 {loading ? (
// //                   <div className="flex items-center justify-center">
// //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// //                     Generating Certificates...
// //                   </div>
// //                 ) : (
// //                   "Complete Certificate Generation"
// //                 )}
// //               </button>

// //               <button
// //                 onClick={resetProcess}
// //                 disabled={loading}
// //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
// //               >
// //                 Start Over
// //               </button>
// //             </div>

// //             {loading && (
// //               <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// //                 <p className="text-blue-800 text-sm flex items-center">
// //                   <Clock className="w-4 h-4 mr-2" />
// //                   Verifying DNS records and generating certificates... This may
// //                   take 2-5 minutes.
// //                 </p>
// //               </div>
// //             )}
// //           </div>
// //         )}

// //         {/* Step 3: Download Certificates */}
// //         {step === 3 && certificates && (
// //           <div className="bg-white rounded-lg shadow-lg p-6">
// //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// //               🎉 SSL Certificates Ready for {challengeData?.domain}!
// //             </h3>

// //             <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// //               <h4 className="font-semibold text-green-800 mb-2">
// //                 ✅ Installation Instructions
// //               </h4>
// //               <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
// //                 <li>Go to your hosting control panel (cPanel, Plesk, etc.)</li>
// //                 <li>Find SSL/TLS Certificate installation section</li>
// //                 <li>
// //                   Copy and paste each certificate section below into the
// //                   corresponding fields
// //                 </li>
// //                 <li>Save/Install the certificate</li>
// //                 <li>Test your SSL with the link provided below</li>
// //               </ol>
// //             </div>

// //             <div className="space-y-6">
// //               {/* Certificate (CRT) */}
// //               <div className="border border-gray-200 rounded-lg">
// //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// //                   <div className="flex items-center justify-between">
// //                     <h5 className="font-semibold text-gray-800">
// //                       Certificate (CRT)
// //                     </h5>
// //                     <CopyButton
// //                       text={certificates.certificate}
// //                       label="Certificate"
// //                     />
// //                   </div>
// //                   <p className="text-xs text-gray-600 mt-1">
// //                     Paste this into the "Certificate" or "CRT" field in your
// //                     hosting panel
// //                   </p>
// //                 </div>
// //                 <div className="p-4">
// //                   <textarea
// //                     value={certificates.certificate}
// //                     readOnly
// //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// //                   />
// //                 </div>
// //               </div>

// //               {/* Private Key */}
// //               <div className="border border-gray-200 rounded-lg">
// //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// //                   <div className="flex items-center justify-between">
// //                     <h5 className="font-semibold text-gray-800">
// //                       Private Key (KEY)
// //                     </h5>
// //                     <CopyButton
// //                       text={certificates.privateKey}
// //                       label="Private Key"
// //                     />
// //                   </div>
// //                   <p className="text-xs text-gray-600 mt-1">
// //                     Paste this into the "Private Key" or "KEY" field in your
// //                     hosting panel
// //                   </p>
// //                 </div>
// //                 <div className="p-4">
// //                   <textarea
// //                     value={certificates.privateKey}
// //                     readOnly
// //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// //                   />
// //                 </div>
// //               </div>

// //               {/* CA Bundle */}
// //               <div className="border border-gray-200 rounded-lg">
// //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// //                   <div className="flex items-center justify-between">
// //                     <h5 className="font-semibold text-gray-800">
// //                       CA Bundle (CABUNDLE)
// //                     </h5>
// //                     <CopyButton
// //                       text={certificates.caBundle}
// //                       label="CA Bundle"
// //                     />
// //                   </div>
// //                   <p className="text-xs text-gray-600 mt-1">
// //                     Paste this into the "CA Bundle" or "CABUNDLE" field in your
// //                     hosting panel
// //                   </p>
// //                 </div>
// //                 <div className="p-4">
// //                   <textarea
// //                     value={certificates.caBundle}
// //                     readOnly
// //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// //                   />
// //                 </div>
// //               </div>

// //               {/* Full Chain (Alternative) */}
// //               <div className="border border-gray-200 rounded-lg">
// //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// //                   <div className="flex items-center justify-between">
// //                     <h5 className="font-semibold text-gray-800">
// //                       Full Chain (Alternative)
// //                     </h5>
// //                     <CopyButton
// //                       text={certificates.fullChain}
// //                       label="Full Chain"
// //                     />
// //                   </div>
// //                   <p className="text-xs text-gray-600 mt-1">
// //                     Use this if your hosting provider asks for a single
// //                     certificate file
// //                   </p>
// //                 </div>
// //                 <div className="p-4">
// //                   <textarea
// //                     value={certificates.fullChain}
// //                     readOnly
// //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// //                   />
// //                 </div>
// //               </div>
// //             </div>

// //             <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// //               <h4 className="font-semibold text-yellow-800 mb-2">
// //                 🔒 Security Notes
// //               </h4>
// //               <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
// //                 <li>
// //                   Keep your Private Key secure and never share it publicly
// //                 </li>
// //                 <li>These certificates are valid for 90 days</li>
// //                 <li>Set up automatic renewal before expiration</li>
// //                 <li>After installation, test your SSL configuration</li>
// //               </ul>
// //             </div>

// //             <div className="flex gap-4 mt-6">
// //               <button
// //                 onClick={resetProcess}
// //                 className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// //               >
// //                 Generate Another Certificate
// //               </button>

// //               <button
// //                 onClick={() =>
// //                   window.open(
// //                     `https://www.ssllabs.com/ssltest/analyze.html?d=${challengeData?.domain}`,
// //                     "_blank"
// //                   )
// //                 }
// //                 className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
// //               >
// //                 <ExternalLink className="w-4 h-4 mr-2" />
// //                 Test SSL Installation
// //               </button>
// //             </div>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // }

// // // import React, { useState } from "react";
// // // import {
// // //   CheckCircle,
// // //   Clock,
// // //   AlertCircle,
// // //   Download,
// // //   Copy,
// // //   ExternalLink,
// // // } from "lucide-react";

// // // interface DnsRecord {
// // //   name: string;
// // //   type: string;
// // //   value: string;
// // //   ttl: number;
// // // }

// // // interface Certificates {
// // //   certificate: string;
// // //   privateKey: string;
// // //   caBundle: string;
// // //   fullChain: string;
// // // }

// // // interface ChallengeData {
// // //   domain: string;
// // //   dnsRecords: DnsRecord[];
// // //   challengeToken: string;
// // //   instructions: string[];
// // // }

// // // export default function SSLAsServiceGenerator() {
// // //   const [step, setStep] = useState(1);
// // //   const [domain, setDomain] = useState("");
// // //   const [includeWildcard, setIncludeWildcard] = useState(true);
// // //   const [loading, setLoading] = useState(false);
// // //   const [challengeData, setChallengeData] = useState<ChallengeData | null>(
// // //     null
// // //   );
// // //   const [certificates, setCertificates] = useState<Certificates | null>(null);
// // //   const [error, setError] = useState<string>("");

// // //   const CopyButton = ({ text, label }: { text: string; label: string }) => {
// // //     const [copied, setCopied] = useState(false);

// // //     const handleCopy = async () => {
// // //       try {
// // //         await navigator.clipboard.writeText(text);
// // //         setCopied(true);
// // //         setTimeout(() => setCopied(false), 2000);
// // //       } catch (err) {
// // //         console.error("Failed to copy:", err);
// // //       }
// // //     };

// // //     return (
// // //       <button
// // //         onClick={handleCopy}
// // //         className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
// // //       >
// // //         {copied ? "✅ Copied!" : `📋 Copy ${label}`}
// // //       </button>
// // //     );
// // //   };

// // //   const generateChallenge = async () => {
// // //     setLoading(true);
// // //     setError("");

// // //     try {
// // //       const response = await fetch("/api/ssl-as-service", {
// // //         method: "POST",
// // //         headers: { "Content-Type": "application/json" },
// // //         body: JSON.stringify({
// // //           domain,
// // //           includeWildcard,
// // //           step: "generate-challenge",
// // //         }),
// // //       });

// // //       const data = await response.json();

// // //       if (data.success) {
// // //         setChallengeData({
// // //           domain: data.domain,
// // //           dnsRecords: data.dnsRecords,
// // //           challengeToken: data.challengeToken,
// // //           instructions: data.instructions,
// // //         });
// // //         setStep(2);
// // //       } else {
// // //         setError(data.error);
// // //       }
// // //     } catch (err) {
// // //       setError("Failed to generate challenge. Please try again.");
// // //     } finally {
// // //       setLoading(false);
// // //     }
// // //   };

// // //   const completeCertificate = async () => {
// // //     if (!challengeData) return;

// // //     setLoading(true);
// // //     setError("");

// // //     try {
// // //       const response = await fetch("/api/ssl-as-service", {
// // //         method: "POST",
// // //         headers: { "Content-Type": "application/json" },
// // //         body: JSON.stringify({
// // //           domain: challengeData.domain,
// // //           step: "complete-certificate",
// // //           challengeToken: challengeData.challengeToken,
// // //         }),
// // //       });

// // //       const data = await response.json();

// // //       if (data.success) {
// // //         setCertificates(data.certificates);
// // //         setStep(3);
// // //       } else {
// // //         setError(data.error);
// // //       }
// // //     } catch (err) {
// // //       setError("Failed to complete certificate generation. Please try again.");
// // //     } finally {
// // //       setLoading(false);
// // //     }
// // //   };

// // //   const resetProcess = () => {
// // //     setStep(1);
// // //     setDomain("");
// // //     setIncludeWildcard(true);
// // //     setChallengeData(null);
// // //     setCertificates(null);
// // //     setError("");
// // //     setLoading(false);
// // //   };

// // //   return (
// // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
// // //       <div className="max-w-4xl mx-auto">
// // //         <div className="text-center mb-8">
// // //           <h1 className="text-3xl font-bold text-gray-800 mb-2">
// // //             🔒 SSL Certificate Generator Service
// // //           </h1>
// // //           <p className="text-gray-600">
// // //             Generate free SSL certificates for any domain - Download and install
// // //             on your hosting provider
// // //           </p>
// // //         </div>

// // //         {/* Progress Steps */}
// // //         <div className="flex items-center justify-center mb-8 space-x-4">
// // //           <div
// // //             className={`flex items-center space-x-2 ${
// // //               step >= 1 ? "text-blue-600" : "text-gray-400"
// // //             }`}
// // //           >
// // //             <div
// // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // //                 step >= 1
// // //                   ? "bg-blue-600 text-white border-blue-600"
// // //                   : "border-gray-300"
// // //               }`}
// // //             >
// // //               1
// // //             </div>
// // //             <span className="font-medium">Domain Setup</span>
// // //           </div>

// // //           <div
// // //             className={`w-12 h-0.5 ${
// // //               step >= 2 ? "bg-blue-600" : "bg-gray-300"
// // //             }`}
// // //           ></div>

// // //           <div
// // //             className={`flex items-center space-x-2 ${
// // //               step >= 2 ? "text-blue-600" : "text-gray-400"
// // //             }`}
// // //           >
// // //             <div
// // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // //                 step >= 2
// // //                   ? "bg-blue-600 text-white border-blue-600"
// // //                   : "border-gray-300"
// // //               }`}
// // //             >
// // //               2
// // //             </div>
// // //             <span className="font-medium">DNS Setup</span>
// // //           </div>

// // //           <div
// // //             className={`w-12 h-0.5 ${
// // //               step >= 3 ? "bg-blue-600" : "bg-gray-300"
// // //             }`}
// // //           ></div>

// // //           <div
// // //             className={`flex items-center space-x-2 ${
// // //               step >= 3 ? "text-blue-600" : "text-gray-400"
// // //             }`}
// // //           >
// // //             <div
// // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // //                 step >= 3
// // //                   ? "bg-blue-600 text-white border-blue-600"
// // //                   : "border-gray-300"
// // //               }`}
// // //             >
// // //               3
// // //             </div>
// // //             <span className="font-medium">Download SSL</span>
// // //           </div>
// // //         </div>

// // //         {/* Error Display */}
// // //         {error && (
// // //           <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
// // //             <div className="flex items-center">
// // //               <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
// // //               <h4 className="font-semibold text-red-800">Error</h4>
// // //             </div>
// // //             <p className="text-red-700 mt-1">{error}</p>
// // //           </div>
// // //         )}

// // //         {/* Step 1: Domain Input */}
// // //         {step === 1 && (
// // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // //               Step 1: Enter Your Domain
// // //             </h3>

// // //             <div className="space-y-4">
// // //               <div>
// // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // //                   Domain Name
// // //                 </label>
// // //                 <input
// // //                   type="text"
// // //                   value={domain}
// // //                   onChange={(e) =>
// // //                     setDomain(e.target.value.trim().toLowerCase())
// // //                   }
// // //                   placeholder="example.com"
// // //                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
// // //                 />
// // //                 <p className="text-sm text-gray-500 mt-1">
// // //                   Enter the domain where you want to install the SSL certificate
// // //                 </p>
// // //               </div>

// // //               <div className="flex items-center">
// // //                 <input
// // //                   type="checkbox"
// // //                   id="wildcard"
// // //                   checked={includeWildcard}
// // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // //                   className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
// // //                 />
// // //                 <label
// // //                   htmlFor="wildcard"
// // //                   className="ml-2 text-sm text-gray-700"
// // //                 >
// // //                   Include wildcard certificate (*.{domain || "example.com"})
// // //                 </label>
// // //               </div>

// // //               <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // //                 <h4 className="font-semibold text-blue-800 mb-2">
// // //                   📋 What You'll Need:
// // //                 </h4>
// // //                 <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
// // //                   <li>Access to your domain's DNS settings</li>
// // //                   <li>Ability to add TXT records to your DNS</li>
// // //                   <li>Access to your hosting control panel (cPanel, etc.)</li>
// // //                   <li>5-10 minutes for DNS propagation</li>
// // //                 </ul>
// // //               </div>

// // //               <button
// // //                 onClick={generateChallenge}
// // //                 disabled={!domain || loading}
// // //                 className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// // //               >
// // //                 {loading ? (
// // //                   <div className="flex items-center justify-center">
// // //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// // //                     Generating DNS Challenge...
// // //                   </div>
// // //                 ) : (
// // //                   "Generate DNS Challenge"
// // //                 )}
// // //               </button>
// // //             </div>
// // //           </div>
// // //         )}

// // //         {/* Step 2: DNS Setup */}
// // //         {step === 2 && challengeData && (
// // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // //               Step 2: Add DNS Records for {challengeData.domain}
// // //             </h3>

// // //             <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // //               <h4 className="font-semibold text-yellow-800 mb-2">
// // //                 ⚠️ Important Instructions:
// // //               </h4>
// // //               <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
// // //                 <li>
// // //                   Go to your domain's DNS provider (where you manage DNS
// // //                   records)
// // //                 </li>
// // //                 <li>Add the TXT record(s) shown below exactly as displayed</li>
// // //                 <li>Wait 5-10 minutes for DNS propagation</li>
// // //                 <li>Click "Complete Certificate Generation" below</li>
// // //               </ol>
// // //             </div>

// // //             <div className="space-y-4">
// // //               {challengeData.dnsRecords.map((record, index) => (
// // //                 <div
// // //                   key={index}
// // //                   className="border border-gray-200 rounded-lg p-4"
// // //                 >
// // //                   <h5 className="font-semibold text-gray-800 mb-3">
// // //                     DNS Record #{index + 1}
// // //                   </h5>

// // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
// // //                     <div>
// // //                       <label className="block font-medium text-gray-700 mb-1">
// // //                         Name/Host:
// // //                       </label>
// // //                       <div className="flex items-center space-x-2">
// // //                         <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1">
// // //                           {record.name}
// // //                         </code>
// // //                         <CopyButton text={record.name} label="Name" />
// // //                       </div>
// // //                     </div>

// // //                     <div>
// // //                       <label className="block font-medium text-gray-700 mb-1">
// // //                         Type:
// // //                       </label>
// // //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// // //                         {record.type}
// // //                       </code>
// // //                     </div>

// // //                     <div>
// // //                       <label className="block font-medium text-gray-700 mb-1">
// // //                         TTL:
// // //                       </label>
// // //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// // //                         {record.ttl}
// // //                       </code>
// // //                     </div>
// // //                   </div>

// // //                   <div className="mt-3">
// // //                     <label className="block font-medium text-gray-700 mb-1">
// // //                       Value:
// // //                     </label>
// // //                     <div className="flex items-center space-x-2">
// // //                       <textarea
// // //                         value={record.value}
// // //                         readOnly
// // //                         className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-none h-20"
// // //                         onClick={(e) =>
// // //                           (e.target as HTMLTextAreaElement).select()
// // //                         }
// // //                       />
// // //                       <CopyButton text={record.value} label="Value" />
// // //                     </div>
// // //                   </div>
// // //                 </div>
// // //               ))}
// // //             </div>

// // //             <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// // //               <h4 className="font-semibold text-green-800 mb-2">
// // //                 ✅ After Adding DNS Records:
// // //               </h4>
// // //               <p className="text-sm text-green-700">
// // //                 Wait 5-10 minutes for DNS propagation, then click the button
// // //                 below to complete certificate generation. The system will verify
// // //                 your DNS records and generate your SSL certificates.
// // //               </p>
// // //             </div>

// // //             <div className="flex gap-4 mt-6">
// // //               <button
// // //                 onClick={completeCertificate}
// // //                 disabled={loading}
// // //                 className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// // //               >
// // //                 {loading ? (
// // //                   <div className="flex items-center justify-center">
// // //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// // //                     Generating Certificates...
// // //                   </div>
// // //                 ) : (
// // //                   "Complete Certificate Generation"
// // //                 )}
// // //               </button>

// // //               <button
// // //                 onClick={resetProcess}
// // //                 disabled={loading}
// // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
// // //               >
// // //                 Start Over
// // //               </button>
// // //             </div>

// // //             {loading && (
// // //               <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // //                 <p className="text-blue-800 text-sm flex items-center">
// // //                   <Clock className="w-4 h-4 mr-2" />
// // //                   Verifying DNS records and generating certificates... This may
// // //                   take 2-5 minutes.
// // //                 </p>
// // //               </div>
// // //             )}
// // //           </div>
// // //         )}

// // //         {/* Step 3: Download Certificates */}
// // //         {step === 3 && certificates && (
// // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // //               🎉 SSL Certificates Ready for {challengeData?.domain}!
// // //             </h3>

// // //             <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// // //               <h4 className="font-semibold text-green-800 mb-2">
// // //                 ✅ Installation Instructions
// // //               </h4>
// // //               <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
// // //                 <li>Go to your hosting control panel (cPanel, Plesk, etc.)</li>
// // //                 <li>Find SSL/TLS Certificate installation section</li>
// // //                 <li>
// // //                   Copy and paste each certificate section below into the
// // //                   corresponding fields
// // //                 </li>
// // //                 <li>Save/Install the certificate</li>
// // //                 <li>Test your SSL with the link provided below</li>
// // //               </ol>
// // //             </div>

// // //             <div className="space-y-6">
// // //               {/* Certificate (CRT) */}
// // //               <div className="border border-gray-200 rounded-lg">
// // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // //                   <div className="flex items-center justify-between">
// // //                     <h5 className="font-semibold text-gray-800">
// // //                       Certificate (CRT)
// // //                     </h5>
// // //                     <CopyButton
// // //                       text={certificates.certificate}
// // //                       label="Certificate"
// // //                     />
// // //                   </div>
// // //                   <p className="text-xs text-gray-600 mt-1">
// // //                     Paste this into the "Certificate" or "CRT" field in your
// // //                     hosting panel
// // //                   </p>
// // //                 </div>
// // //                 <div className="p-4">
// // //                   <textarea
// // //                     value={certificates.certificate}
// // //                     readOnly
// // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // //                   />
// // //                 </div>
// // //               </div>

// // //               {/* Private Key */}
// // //               <div className="border border-gray-200 rounded-lg">
// // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // //                   <div className="flex items-center justify-between">
// // //                     <h5 className="font-semibold text-gray-800">
// // //                       Private Key (KEY)
// // //                     </h5>
// // //                     <CopyButton
// // //                       text={certificates.privateKey}
// // //                       label="Private Key"
// // //                     />
// // //                   </div>
// // //                   <p className="text-xs text-gray-600 mt-1">
// // //                     Paste this into the "Private Key" or "KEY" field in your
// // //                     hosting panel
// // //                   </p>
// // //                 </div>
// // //                 <div className="p-4">
// // //                   <textarea
// // //                     value={certificates.privateKey}
// // //                     readOnly
// // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // //                   />
// // //                 </div>
// // //               </div>

// // //               {/* CA Bundle */}
// // //               <div className="border border-gray-200 rounded-lg">
// // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // //                   <div className="flex items-center justify-between">
// // //                     <h5 className="font-semibold text-gray-800">
// // //                       CA Bundle (CABUNDLE)
// // //                     </h5>
// // //                     <CopyButton
// // //                       text={certificates.caBundle}
// // //                       label="CA Bundle"
// // //                     />
// // //                   </div>
// // //                   <p className="text-xs text-gray-600 mt-1">
// // //                     Paste this into the "CA Bundle" or "CABUNDLE" field in your
// // //                     hosting panel
// // //                   </p>
// // //                 </div>
// // //                 <div className="p-4">
// // //                   <textarea
// // //                     value={certificates.caBundle}
// // //                     readOnly
// // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // //                   />
// // //                 </div>
// // //               </div>

// // //               {/* Full Chain (Alternative) */}
// // //               <div className="border border-gray-200 rounded-lg">
// // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // //                   <div className="flex items-center justify-between">
// // //                     <h5 className="font-semibold text-gray-800">
// // //                       Full Chain (Alternative)
// // //                     </h5>
// // //                     <CopyButton
// // //                       text={certificates.fullChain}
// // //                       label="Full Chain"
// // //                     />
// // //                   </div>
// // //                   <p className="text-xs text-gray-600 mt-1">
// // //                     Use this if your hosting provider asks for a single
// // //                     certificate file
// // //                   </p>
// // //                 </div>
// // //                 <div className="p-4">
// // //                   <textarea
// // //                     value={certificates.fullChain}
// // //                     readOnly
// // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // //                   />
// // //                 </div>
// // //               </div>
// // //             </div>

// // //             <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // //               <h4 className="font-semibold text-yellow-800 mb-2">
// // //                 🔒 Security Notes
// // //               </h4>
// // //               <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
// // //                 <li>
// // //                   Keep your Private Key secure and never share it publicly
// // //                 </li>
// // //                 <li>These certificates are valid for 90 days</li>
// // //                 <li>Set up automatic renewal before expiration</li>
// // //                 <li>After installation, test your SSL configuration</li>
// // //               </ul>
// // //             </div>

// // //             <div className="flex gap-4 mt-6">
// // //               <button
// // //                 onClick={resetProcess}
// // //                 className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // //               >
// // //                 Generate Another Certificate
// // //               </button>

// // //               <button
// // //                 onClick={() =>
// // //                   window.open(
// // //                     `https://www.ssllabs.com/ssltest/analyze.html?d=${challengeData?.domain}`,
// // //                     "_blank"
// // //                   )
// // //                 }
// // //                 className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
// // //               >
// // //                 <ExternalLink className="w-4 h-4 mr-2" />
// // //                 Test SSL Installation
// // //               </button>
// // //             </div>
// // //           </div>
// // //         )}
// // //       </div>
// // //     </div>
// // //   );
// // // }

// // // // "use client";
// // // // import React, { useState } from "react";
// // // // import {
// // // //   Clock,
// // // //   AlertCircle,
// // // //   Download,
// // // //   Copy,
// // // //   ExternalLink,
// // // // } from "lucide-react";

// // // // interface DnsRecord {
// // // //   name: string;
// // // //   type: string;
// // // //   value: string;
// // // //   ttl: number;
// // // // }

// // // // interface Certificates {
// // // //   certificate: string;
// // // //   privateKey: string;
// // // //   caBundle: string;
// // // //   fullChain: string;
// // // // }

// // // // interface ChallengeData {
// // // //   domain: string;
// // // //   dnsRecords: DnsRecord[];
// // // //   challengeToken: string;
// // // //   instructions: string[];
// // // // }

// // // // export default function SSLAsServiceGenerator() {
// // // //   const [step, setStep] = useState(1);
// // // //   const [domain, setDomain] = useState("");
// // // //   const [includeWildcard, setIncludeWildcard] = useState(true);
// // // //   const [loading, setLoading] = useState(false);
// // // //   const [challengeData, setChallengeData] = useState<ChallengeData | null>(
// // // //     null
// // // //   );
// // // //   const [certificates, setCertificates] = useState<Certificates | null>(null);
// // // //   const [error, setError] = useState<string>("");

// // // //   const CopyButton = ({ text, label }: { text: string; label: string }) => {
// // // //     const [copied, setCopied] = useState(false);

// // // //     const handleCopy = async () => {
// // // //       try {
// // // //         await navigator.clipboard.writeText(text);
// // // //         setCopied(true);
// // // //         setTimeout(() => setCopied(false), 2000);
// // // //       } catch (err) {
// // // //         console.error("Failed to copy:", err);
// // // //       }
// // // //     };

// // // //     return (
// // // //       <button
// // // //         onClick={handleCopy}
// // // //         className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
// // // //       >
// // // //         {copied ? "✅ Copied!" : `📋 Copy ${label}`}
// // // //       </button>
// // // //     );
// // // //   };

// // // //   const generateChallenge = async () => {
// // // //     setLoading(true);
// // // //     setError("");

// // // //     try {
// // // //       const response = await fetch("/api/ssl-as-service", {
// // // //         method: "POST",
// // // //         headers: { "Content-Type": "application/json" },
// // // //         body: JSON.stringify({
// // // //           domain,
// // // //           includeWildcard,
// // // //           step: "generate-challenge",
// // // //         }),
// // // //       });

// // // //       const data = await response.json();

// // // //       if (data.success) {
// // // //         setChallengeData({
// // // //           domain: data.domain,
// // // //           dnsRecords: data.dnsRecords,
// // // //           challengeToken: data.challengeToken,
// // // //           instructions: data.instructions,
// // // //         });
// // // //         setStep(2);
// // // //       } else {
// // // //         setError(data.error);
// // // //       }
// // // //     } catch (err) {
// // // //       setError("Failed to generate challenge. Please try again.");
// // // //     } finally {
// // // //       setLoading(false);
// // // //     }
// // // //   };

// // // //   const completeCertificate = async () => {
// // // //     if (!challengeData) return;

// // // //     setLoading(true);
// // // //     setError("");

// // // //     try {
// // // //       const response = await fetch("/api/ssl-as-service", {
// // // //         method: "POST",
// // // //         headers: { "Content-Type": "application/json" },
// // // //         body: JSON.stringify({
// // // //           domain: challengeData.domain,
// // // //           step: "complete-certificate",
// // // //           challengeToken: challengeData.challengeToken,
// // // //         }),
// // // //       });

// // // //       const data = await response.json();

// // // //       if (data.success) {
// // // //         setCertificates(data.certificates);
// // // //         setStep(3);
// // // //       } else {
// // // //         setError(data.error);
// // // //       }
// // // //     } catch (err) {
// // // //       setError("Failed to complete certificate generation. Please try again.");
// // // //     } finally {
// // // //       setLoading(false);
// // // //     }
// // // //   };

// // // //   const resetProcess = () => {
// // // //     setStep(1);
// // // //     setDomain("");
// // // //     setIncludeWildcard(true);
// // // //     setChallengeData(null);
// // // //     setCertificates(null);
// // // //     setError("");
// // // //     setLoading(false);
// // // //   };

// // // //   return (
// // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
// // // //       <div className="max-w-4xl mx-auto">
// // // //         <div className="text-center mb-8">
// // // //           <h1 className="text-3xl font-bold text-gray-800 mb-2">
// // // //             🔒 SSL Certificate Generator Service
// // // //           </h1>
// // // //           <p className="text-gray-600">
// // // //             Generate free SSL certificates for any domain - Download and install
// // // //             on your hosting provider
// // // //           </p>
// // // //         </div>

// // // //         {/* Progress Steps */}
// // // //         <div className="flex items-center justify-center mb-8 space-x-4">
// // // //           <div
// // // //             className={`flex items-center space-x-2 ${
// // // //               step >= 1 ? "text-blue-600" : "text-gray-400"
// // // //             }`}
// // // //           >
// // // //             <div
// // // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // // //                 step >= 1
// // // //                   ? "bg-blue-600 text-white border-blue-600"
// // // //                   : "border-gray-300"
// // // //               }`}
// // // //             >
// // // //               1
// // // //             </div>
// // // //             <span className="font-medium">Domain Setup</span>
// // // //           </div>

// // // //           <div
// // // //             className={`w-12 h-0.5 ${
// // // //               step >= 2 ? "bg-blue-600" : "bg-gray-300"
// // // //             }`}
// // // //           ></div>

// // // //           <div
// // // //             className={`flex items-center space-x-2 ${
// // // //               step >= 2 ? "text-blue-600" : "text-gray-400"
// // // //             }`}
// // // //           >
// // // //             <div
// // // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // // //                 step >= 2
// // // //                   ? "bg-blue-600 text-white border-blue-600"
// // // //                   : "border-gray-300"
// // // //               }`}
// // // //             >
// // // //               2
// // // //             </div>
// // // //             <span className="font-medium">DNS Setup</span>
// // // //           </div>

// // // //           <div
// // // //             className={`w-12 h-0.5 ${
// // // //               step >= 3 ? "bg-blue-600" : "bg-gray-300"
// // // //             }`}
// // // //           ></div>

// // // //           <div
// // // //             className={`flex items-center space-x-2 ${
// // // //               step >= 3 ? "text-blue-600" : "text-gray-400"
// // // //             }`}
// // // //           >
// // // //             <div
// // // //               className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
// // // //                 step >= 3
// // // //                   ? "bg-blue-600 text-white border-blue-600"
// // // //                   : "border-gray-300"
// // // //               }`}
// // // //             >
// // // //               3
// // // //             </div>
// // // //             <span className="font-medium">Download SSL</span>
// // // //           </div>
// // // //         </div>

// // // //         {/* Error Display */}
// // // //         {error && (
// // // //           <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
// // // //             <div className="flex items-center">
// // // //               <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
// // // //               <h4 className="font-semibold text-red-800">Error</h4>
// // // //             </div>
// // // //             <p className="text-red-700 mt-1">{error}</p>
// // // //           </div>
// // // //         )}

// // // //         {/* Step 1: Domain Input */}
// // // //         {step === 1 && (
// // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // //               Step 1: Enter Your Domain
// // // //             </h3>

// // // //             <div className="space-y-4">
// // // //               <div>
// // // //                 <label className="block text-sm font-medium text-gray-700 mb-2">
// // // //                   Domain Name
// // // //                 </label>
// // // //                 <input
// // // //                   type="text"
// // // //                   value={domain}
// // // //                   onChange={(e) =>
// // // //                     setDomain(e.target.value.trim().toLowerCase())
// // // //                   }
// // // //                   placeholder="example.com"
// // // //                   className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
// // // //                 />
// // // //                 <p className="text-sm text-gray-500 mt-1">
// // // //                   Enter the domain where you want to install the SSL certificate
// // // //                 </p>
// // // //               </div>

// // // //               <div className="flex items-center">
// // // //                 <input
// // // //                   type="checkbox"
// // // //                   id="wildcard"
// // // //                   checked={includeWildcard}
// // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // //                   className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
// // // //                 />
// // // //                 <label
// // // //                   htmlFor="wildcard"
// // // //                   className="ml-2 text-sm text-gray-700"
// // // //                 >
// // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // //                 </label>
// // // //               </div>

// // // //               <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // // //                 <h4 className="font-semibold text-blue-800 mb-2">
// // // //                   📋 What You'll Need:
// // // //                 </h4>
// // // //                 <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
// // // //                   <li>Access to your domain's DNS settings</li>
// // // //                   <li>Ability to add TXT records to your DNS</li>
// // // //                   <li>Access to your hosting control panel (cPanel, etc.)</li>
// // // //                   <li>5-10 minutes for DNS propagation</li>
// // // //                 </ul>
// // // //               </div>

// // // //               <button
// // // //                 onClick={generateChallenge}
// // // //                 disabled={!domain || loading}
// // // //                 className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// // // //               >
// // // //                 {loading ? (
// // // //                   <div className="flex items-center justify-center">
// // // //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// // // //                     Generating DNS Challenge...
// // // //                   </div>
// // // //                 ) : (
// // // //                   "Generate DNS Challenge"
// // // //                 )}
// // // //               </button>
// // // //             </div>
// // // //           </div>
// // // //         )}

// // // //         {/* Step 2: DNS Setup */}
// // // //         {step === 2 && challengeData && (
// // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // //               Step 2: Add DNS Records for {challengeData.domain}
// // // //             </h3>

// // // //             <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // //               <h4 className="font-semibold text-yellow-800 mb-2">
// // // //                 ⚠️ Important Instructions:
// // // //               </h4>
// // // //               <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
// // // //                 <li>
// // // //                   Go to your domain's DNS provider (where you manage DNS
// // // //                   records)
// // // //                 </li>
// // // //                 <li>Add the TXT record(s) shown below exactly as displayed</li>
// // // //                 <li>Wait 5-10 minutes for DNS propagation</li>
// // // //                 <li>Click "Complete Certificate Generation" below</li>
// // // //               </ol>
// // // //             </div>

// // // //             <div className="space-y-4">
// // // //               {challengeData.dnsRecords.map((record, index) => (
// // // //                 <div
// // // //                   key={index}
// // // //                   className="border border-gray-200 rounded-lg p-4"
// // // //                 >
// // // //                   <h5 className="font-semibold text-gray-800 mb-3">
// // // //                     DNS Record #{index + 1}
// // // //                   </h5>

// // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
// // // //                     <div>
// // // //                       <label className="block font-medium text-gray-700 mb-1">
// // // //                         Name/Host:
// // // //                       </label>
// // // //                       <div className="flex items-center space-x-2">
// // // //                         <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono flex-1">
// // // //                           {record.name}
// // // //                         </code>
// // // //                         <CopyButton text={record.name} label="Name" />
// // // //                       </div>
// // // //                     </div>

// // // //                     <div>
// // // //                       <label className="block font-medium text-gray-700 mb-1">
// // // //                         Type:
// // // //                       </label>
// // // //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// // // //                         {record.type}
// // // //                       </code>
// // // //                     </div>

// // // //                     <div>
// // // //                       <label className="block font-medium text-gray-700 mb-1">
// // // //                         TTL:
// // // //                       </label>
// // // //                       <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
// // // //                         {record.ttl}
// // // //                       </code>
// // // //                     </div>
// // // //                   </div>

// // // //                   <div className="mt-3">
// // // //                     <label className="block font-medium text-gray-700 mb-1">
// // // //                       Value:
// // // //                     </label>
// // // //                     <div className="flex items-center space-x-2">
// // // //                       <textarea
// // // //                         value={record.value}
// // // //                         readOnly
// // // //                         className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 py-1 text-xs font-mono resize-none h-20"
// // // //                         onClick={(e) =>
// // // //                           (e.target as HTMLTextAreaElement).select()
// // // //                         }
// // // //                       />
// // // //                       <CopyButton text={record.value} label="Value" />
// // // //                     </div>
// // // //                   </div>
// // // //                 </div>
// // // //               ))}
// // // //             </div>

// // // //             <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // //               <h4 className="font-semibold text-green-800 mb-2">
// // // //                 ✅ After Adding DNS Records:
// // // //               </h4>
// // // //               <p className="text-sm text-green-700">
// // // //                 Wait 5-10 minutes for DNS propagation, then click the button
// // // //                 below to complete certificate generation. The system will verify
// // // //                 your DNS records and generate your SSL certificates.
// // // //               </p>
// // // //             </div>

// // // //             <div className="flex gap-4 mt-6">
// // // //               <button
// // // //                 onClick={completeCertificate}
// // // //                 disabled={loading}
// // // //                 className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
// // // //               >
// // // //                 {loading ? (
// // // //                   <div className="flex items-center justify-center">
// // // //                     <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
// // // //                     Generating Certificates...
// // // //                   </div>
// // // //                 ) : (
// // // //                   "Complete Certificate Generation"
// // // //                 )}
// // // //               </button>

// // // //               <button
// // // //                 onClick={resetProcess}
// // // //                 disabled={loading}
// // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
// // // //               >
// // // //                 Start Over
// // // //               </button>
// // // //             </div>

// // // //             {loading && (
// // // //               <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // // //                 <p className="text-blue-800 text-sm flex items-center">
// // // //                   <Clock className="w-4 h-4 mr-2" />
// // // //                   Verifying DNS records and generating certificates... This may
// // // //                   take 2-5 minutes.
// // // //                 </p>
// // // //               </div>
// // // //             )}
// // // //           </div>
// // // //         )}

// // // //         {/* Step 3: Download Certificates */}
// // // //         {step === 3 && certificates && (
// // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // //               🎉 SSL Certificates Ready for {challengeData?.domain}!
// // // //             </h3>

// // // //             <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // //               <h4 className="font-semibold text-green-800 mb-2">
// // // //                 ✅ Installation Instructions
// // // //               </h4>
// // // //               <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
// // // //                 <li>Go to your hosting control panel (cPanel, Plesk, etc.)</li>
// // // //                 <li>Find SSL/TLS Certificate installation section</li>
// // // //                 <li>
// // // //                   Copy and paste each certificate section below into the
// // // //                   corresponding fields
// // // //                 </li>
// // // //                 <li>Save/Install the certificate</li>
// // // //                 <li>Test your SSL with the link provided below</li>
// // // //               </ol>
// // // //             </div>

// // // //             <div className="space-y-6">
// // // //               {/* Certificate (CRT) */}
// // // //               <div className="border border-gray-200 rounded-lg">
// // // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // // //                   <div className="flex items-center justify-between">
// // // //                     <h5 className="font-semibold text-gray-800">
// // // //                       Certificate (CRT)
// // // //                     </h5>
// // // //                     <CopyButton
// // // //                       text={certificates.certificate}
// // // //                       label="Certificate"
// // // //                     />
// // // //                   </div>
// // // //                   <p className="text-xs text-gray-600 mt-1">
// // // //                     Paste this into the "Certificate" or "CRT" field in your
// // // //                     hosting panel
// // // //                   </p>
// // // //                 </div>
// // // //                 <div className="p-4">
// // // //                   <textarea
// // // //                     value={certificates.certificate}
// // // //                     readOnly
// // // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // // //                   />
// // // //                 </div>
// // // //               </div>

// // // //               {/* Private Key */}
// // // //               <div className="border border-gray-200 rounded-lg">
// // // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // // //                   <div className="flex items-center justify-between">
// // // //                     <h5 className="font-semibold text-gray-800">
// // // //                       Private Key (KEY)
// // // //                     </h5>
// // // //                     <CopyButton
// // // //                       text={certificates.privateKey}
// // // //                       label="Private Key"
// // // //                     />
// // // //                   </div>
// // // //                   <p className="text-xs text-gray-600 mt-1">
// // // //                     Paste this into the "Private Key" or "KEY" field in your
// // // //                     hosting panel
// // // //                   </p>
// // // //                 </div>
// // // //                 <div className="p-4">
// // // //                   <textarea
// // // //                     value={certificates.privateKey}
// // // //                     readOnly
// // // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // // //                   />
// // // //                 </div>
// // // //               </div>

// // // //               {/* CA Bundle */}
// // // //               <div className="border border-gray-200 rounded-lg">
// // // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // // //                   <div className="flex items-center justify-between">
// // // //                     <h5 className="font-semibold text-gray-800">
// // // //                       CA Bundle (CABUNDLE)
// // // //                     </h5>
// // // //                     <CopyButton
// // // //                       text={certificates.caBundle}
// // // //                       label="CA Bundle"
// // // //                     />
// // // //                   </div>
// // // //                   <p className="text-xs text-gray-600 mt-1">
// // // //                     Paste this into the "CA Bundle" or "CABUNDLE" field in your
// // // //                     hosting panel
// // // //                   </p>
// // // //                 </div>
// // // //                 <div className="p-4">
// // // //                   <textarea
// // // //                     value={certificates.caBundle}
// // // //                     readOnly
// // // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // // //                   />
// // // //                 </div>
// // // //               </div>

// // // //               {/* Full Chain (Alternative) */}
// // // //               <div className="border border-gray-200 rounded-lg">
// // // //                 <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
// // // //                   <div className="flex items-center justify-between">
// // // //                     <h5 className="font-semibold text-gray-800">
// // // //                       Full Chain (Alternative)
// // // //                     </h5>
// // // //                     <CopyButton
// // // //                       text={certificates.fullChain}
// // // //                       label="Full Chain"
// // // //                     />
// // // //                   </div>
// // // //                   <p className="text-xs text-gray-600 mt-1">
// // // //                     Use this if your hosting provider asks for a single
// // // //                     certificate file
// // // //                   </p>
// // // //                 </div>
// // // //                 <div className="p-4">
// // // //                   <textarea
// // // //                     value={certificates.fullChain}
// // // //                     readOnly
// // // //                     className="w-full h-32 text-xs font-mono bg-gray-50 border border-gray-200 rounded p-2 resize-none"
// // // //                     onClick={(e) => (e.target as HTMLTextAreaElement).select()}
// // // //                   />
// // // //                 </div>
// // // //               </div>
// // // //             </div>

// // // //             <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // //               <h4 className="font-semibold text-yellow-800 mb-2">
// // // //                 🔒 Security Notes
// // // //               </h4>
// // // //               <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
// // // //                 <li>
// // // //                   Keep your Private Key secure and never share it publicly
// // // //                 </li>
// // // //                 <li>These certificates are valid for 90 days</li>
// // // //                 <li>Set up automatic renewal before expiration</li>
// // // //                 <li>After installation, test your SSL configuration</li>
// // // //               </ul>
// // // //             </div>

// // // //             <div className="flex gap-4 mt-6">
// // // //               <button
// // // //                 onClick={resetProcess}
// // // //                 className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // //               >
// // // //                 Generate Another Certificate
// // // //               </button>

// // // //               <button
// // // //                 onClick={() =>
// // // //                   window.open(
// // // //                     `https://www.ssllabs.com/ssltest/analyze.html?d=${challengeData?.domain}`,
// // // //                     "_blank"
// // // //                   )
// // // //                 }
// // // //                 className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center"
// // // //               >
// // // //                 <ExternalLink className="w-4 h-4 mr-2" />
// // // //                 Test SSL Installation
// // // //               </button>
// // // //             </div>
// // // //           </div>
// // // //         )}
// // // //       </div>
// // // //     </div>
// // // //   );
// // // // }

// // // // // "use client";
// // // // // import React, { useState, useEffect } from "react";

// // // // // // Type definitions
// // // // // interface DnsRecord {
// // // // //   name: string;
// // // // //   type: string;
// // // // //   value: string;
// // // // //   domain: string;
// // // // //   placeholder?: boolean;
// // // // // }

// // // // // interface VerificationResult extends DnsRecord {
// // // // //   verified: boolean;
// // // // //   currentValues: string[];
// // // // //   error?: string;
// // // // // }

// // // // // interface CertificateFiles {
// // // // //   fullchain?: string;
// // // // //   privkey?: string;
// // // // //   cert?: string;
// // // // //   chain?: string;
// // // // // }

// // // // // interface CopyButtonProps {
// // // // //   text: string;
// // // // //   itemId: string;
// // // // //   className?: string;
// // // // // }
// // // // // import {
// // // // //   Copy,
// // // // //   Check,
// // // // //   Shield,
// // // // //   Globe,
// // // // //   Mail,
// // // // //   AlertCircle,
// // // // //   Terminal,
// // // // //   Download,
// // // // //   FileText,
// // // // //   Key,
// // // // //   Award,
// // // // //   Server,
// // // // //   Settings,
// // // // //   RefreshCw,
// // // // //   CheckCircle,
// // // // //   Clock,
// // // // //   ExternalLink,
// // // // // } from "lucide-react";

// // // // // const SSLGenerator: React.FC = () => {
// // // // //   const [domain, setDomain] = useState<string>("");
// // // // //   const [email, setEmail] = useState<string>("");
// // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // //     VerificationResult[]
// // // // //   >([]);
// // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // //     null
// // // // //   );
// // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);
// // // // //   const [manualCommand, setManualCommand] = useState<string>("");
// // // // //   const [showManualCommand, setShowManualCommand] = useState<boolean>(false);

// // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // //   useEffect(() => {
// // // // //     let interval;
// // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // //     }
// // // // //     return () => clearInterval(interval);
// // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // //   const copyToClipboard = async (
// // // // //     text: string,
// // // // //     itemId: string
// // // // //   ): Promise<void> => {
// // // // //     try {
// // // // //       const textContent =
// // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // //       await navigator.clipboard.writeText(textContent);
// // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // //       setTimeout(() => {
// // // // //         setCopiedItems((prev) => {
// // // // //           const newSet = new Set(prev);
// // // // //           newSet.delete(itemId);
// // // // //           return newSet;
// // // // //         });
// // // // //       }, 2000);
// // // // //     } catch (err) {
// // // // //       console.error("Copy failed:", err);
// // // // //     }
// // // // //   };

// // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // //     const textContent =
// // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // //     const txtFilename = filename.endsWith(".txt")
// // // // //       ? filename
// // // // //       : `${filename}.txt`;
// // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // //     const url = window.URL.createObjectURL(blob);
// // // // //     const a = document.createElement("a");
// // // // //     a.href = url;
// // // // //     a.download = txtFilename;
// // // // //     document.body.appendChild(a);
// // // // //     a.click();
// // // // //     window.URL.revokeObjectURL(url);
// // // // //     document.body.removeChild(a);
// // // // //   };

// // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // //     if (!domain || !email) return;

// // // // //     setLoading(true);
// // // // //     try {
// // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // //       });

// // // // //       const data = await response.json();
// // // // //       if (data.success) {
// // // // //         setDnsRecords(data.dnsRecords);
// // // // //         setStep(2);
// // // // //       } else {
// // // // //         alert(`Error: ${data.error}`);
// // // // //       }
// // // // //     } catch (error) {
// // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // //     if (dnsRecords.length === 0) return;

// // // // //     try {
// // // // //       const response = await fetch("/api/verify-dns", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // //       });

// // // // //       const data = await response.json();
// // // // //       setVerificationResults(data.records || []);

// // // // //       if (data.verified) {
// // // // //         setStep(3);
// // // // //         setAutoCheckDns(false);
// // // // //       }
// // // // //     } catch (error) {
// // // // //       console.error("DNS check failed:", error);
// // // // //     }
// // // // //   };

// // // // //   const generateCertificates = async (): Promise<void> => {
// // // // //     setLoading(true);
// // // // //     console.log("🚀 Starting certificate generation...");
// // // // //     console.log("Domain:", domain);
// // // // //     console.log("DNS Records:", dnsRecords);

// // // // //     try {
// // // // //       // Call the cPanel-ready certificate generation API
// // // // //       const response = await fetch("/api/generate-certificates-cpanel", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({
// // // // //           domain,
// // // // //           dnsRecords,
// // // // //         }),
// // // // //       });

// // // // //       console.log("API Response Status:", response.status);
// // // // //       const data = await response.json();
// // // // //       console.log("API Response Data:", data);

// // // // //       if (data.success) {
// // // // //         console.log("✅ Certificate generation successful!");
// // // // //         setCertificates(data.certificates);
// // // // //         setStep(4);
// // // // //       } else if (data.dnsUpdateRequired && data.newDnsRecords) {
// // // // //         console.log("⚠️ DNS update required");
// // // // //         // Let's Encrypt generated new challenge values
// // // // //         setDnsRecords(data.newDnsRecords);
// // // // //         setStep(2); // Go back to DNS records step
// // // // //         setVerificationResults([]); // Clear previous verification
// // // // //         alert(
// // // // //           `DNS records need to be updated! Let's Encrypt generated new challenge values. Please update your DNS records with the new values shown.`
// // // // //         );
// // // // //       } else if (data.requiresManualExecution && data.manualCommand) {
// // // // //         console.log("📝 Manual execution required");
// // // // //         // Show manual command for user to run
// // // // //         setManualCommand(data.manualCommand);
// // // // //         setShowManualCommand(true);
// // // // //       } else {
// // // // //         console.error("❌ Certificate generation failed:", data.error);
// // // // //         const errorMessage = `Error: ${data.error}`;
// // // // //         const troubleshootingInfo =
// // // // //           data.troubleshooting?.length > 0
// // // // //             ? `\n\nTroubleshooting:\n${data.troubleshooting.join("\n")}`
// // // // //             : "";
// // // // //         alert(errorMessage + troubleshootingInfo);
// // // // //       }
// // // // //     } catch (error) {
// // // // //       console.error("❌ Request failed:", error);
// // // // //       alert(
// // // // //         "Failed to generate certificates. Please check the console for details and try again."
// // // // //       );
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const resetForm = (): void => {
// // // // //     setStep(1);
// // // // //     setDomain("");
// // // // //     setEmail("");
// // // // //     setIncludeWildcard(false);
// // // // //     setDnsRecords([]);
// // // // //     setVerificationResults([]);
// // // // //     setCertificates(null);
// // // // //     setAutoCheckDns(false);
// // // // //     setManualCommand("");
// // // // //     setShowManualCommand(false);
// // // // //   };

// // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // //     text,
// // // // //     itemId,
// // // // //     className = "",
// // // // //   }) => {
// // // // //     const isCopied = copiedItems.has(itemId);
// // // // //     return (
// // // // //       <button
// // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // //           isCopied
// // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // //         }`}
// // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // //       >
// // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // //       </button>
// // // // //     );
// // // // //   };

// // // // //   return (
// // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // //       <div className="max-w-6xl mx-auto">
// // // // //         {/* Header */}
// // // // //         <div className="text-center mb-8">
// // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // //               SSL Certificate Generator
// // // // //             </h1>
// // // // //           </div>
// // // // //           <p className="text-gray-600">
// // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // //             guidance
// // // // //           </p>
// // // // //         </div>

// // // // //         {/* Progress Steps */}
// // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // //           <div className="flex items-center justify-between mb-6">
// // // // //             {[
// // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // //               <div key={num} className="flex items-center">
// // // // //                 <div
// // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // //                     step >= num
// // // // //                       ? "bg-blue-600 text-white"
// // // // //                       : "bg-gray-200 text-gray-500"
// // // // //                   }`}
// // // // //                 >
// // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // //                 </div>
// // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // //                   {title}
// // // // //                 </span>
// // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // //               </div>
// // // // //             ))}
// // // // //           </div>
// // // // //         </div>

// // // // //         {/* Step 1: Domain Information */}
// // // // //         {step === 1 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 1: Enter Domain Information
// // // // //             </h3>
// // // // //             <div className="space-y-4">
// // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // //                 <div>
// // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // //                     <Globe size={16} />
// // // // //                     Domain Name
// // // // //                   </label>
// // // // //                   <input
// // // // //                     type="text"
// // // // //                     value={domain}
// // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // //                     placeholder="example.com"
// // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // //                     required
// // // // //                   />
// // // // //                 </div>
// // // // //                 <div>
// // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // //                     <Mail size={16} />
// // // // //                     Email Address
// // // // //                   </label>
// // // // //                   <input
// // // // //                     type="email"
// // // // //                     value={email}
// // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // //                     placeholder="admin@example.com"
// // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // //                     required
// // // // //                   />
// // // // //                 </div>
// // // // //               </div>
// // // // //               <div className="flex items-center gap-2">
// // // // //                 <input
// // // // //                   type="checkbox"
// // // // //                   id="wildcard"
// // // // //                   checked={includeWildcard}
// // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // //                 />
// // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // //                 </label>
// // // // //               </div>
// // // // //               <button
// // // // //                 onClick={generateDnsChallenge}
// // // // //                 disabled={loading || !domain || !email}
// // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // //               >
// // // // //                 {loading
// // // // //                   ? "Generating DNS Challenge..."
// // // // //                   : "Generate DNS Challenge"}
// // // // //               </button>
// // // // //             </div>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 2: DNS Records */}
// // // // //         {step === 2 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // //               <p className="text-sm text-yellow-800">
// // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // //                 propagated.
// // // // //               </p>
// // // // //               <p className="text-xs text-yellow-700 mt-2">
// // // // //                 <strong>Note:</strong> Let's Encrypt may generate new challenge
// // // // //                 values during certificate generation. If that happens, you'll
// // // // //                 need to update these DNS records with the new values.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="space-y-4 mb-6">
// // // // //               {dnsRecords.map((record, index) => (
// // // // //                 <div
// // // // //                   key={index}
// // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // //                 >
// // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Name
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // //                           {record.name}
// // // // //                         </code>
// // // // //                         <CopyButton
// // // // //                           text={record.name}
// // // // //                           itemId={`name-${index}`}
// // // // //                         />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Type
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // //                           TXT
// // // // //                         </code>
// // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Value
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // //                           {record.value}
// // // // //                         </code>
// // // // //                         <CopyButton
// // // // //                           text={record.value}
// // // // //                           itemId={`value-${index}`}
// // // // //                         />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                   </div>
// // // // //                   {record.placeholder && (
// // // // //                     <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
// // // // //                       <p className="text-xs text-orange-800">
// // // // //                         <strong>Placeholder Value:</strong> This is a
// // // // //                         placeholder. Run the server command to get the actual
// // // // //                         DNS record value.
// // // // //                       </p>
// // // // //                     </div>
// // // // //                   )}
// // // // //                 </div>
// // // // //               ))}
// // // // //             </div>

// // // // //             <div className="flex items-center gap-4 mb-4">
// // // // //               <label className="flex items-center gap-2">
// // // // //                 <input
// // // // //                   type="checkbox"
// // // // //                   checked={autoCheckDns}
// // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // //                 />
// // // // //                 <span className="text-sm text-gray-700">
// // // // //                   Auto-check DNS every 30 seconds
// // // // //                 </span>
// // // // //               </label>
// // // // //             </div>

// // // // //             <div className="flex gap-4">
// // // // //               <button
// // // // //                 onClick={checkDnsRecords}
// // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // //               >
// // // // //                 <RefreshCw size={16} />
// // // // //                 Check DNS
// // // // //               </button>
// // // // //               <button
// // // // //                 onClick={resetForm}
// // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // //               >
// // // // //                 Start Over
// // // // //               </button>
// // // // //             </div>

// // // // //             {verificationResults.length > 0 && (
// // // // //               <div className="mt-6">
// // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // //                   DNS Verification Results:
// // // // //                 </h4>
// // // // //                 <div className="space-y-2">
// // // // //                   {verificationResults.map((result, index) => (
// // // // //                     <div
// // // // //                       key={index}
// // // // //                       className={`p-3 rounded border ${
// // // // //                         result.verified
// // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // //                       }`}
// // // // //                     >
// // // // //                       <div className="flex items-center gap-2">
// // // // //                         {result.verified ? (
// // // // //                           <CheckCircle size={16} />
// // // // //                         ) : (
// // // // //                           <Clock size={16} />
// // // // //                         )}
// // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // //                         <span className="text-xs">
// // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // //                         </span>
// // // // //                       </div>
// // // // //                       {result.error && (
// // // // //                         <p className="text-xs mt-1">{result.error}</p>
// // // // //                       )}
// // // // //                     </div>
// // // // //                   ))}
// // // // //                 </div>

// // // // //                 {verificationResults.every((r) => r.verified) && (
// // // // //                   <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
// // // // //                     <p className="text-sm text-green-800">
// // // // //                       <strong>All DNS records verified!</strong> You can now
// // // // //                       proceed to certificate generation.
// // // // //                     </p>
// // // // //                   </div>
// // // // //                 )}
// // // // //               </div>
// // // // //             )}
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 3: Verification Complete */}
// // // // //         {step === 3 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 3: DNS Verified - Generate Certificates
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // //               <p className="text-sm text-green-800">
// // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // //                 You can now generate your SSL certificates.
// // // // //               </p>
// // // // //             </div>
// // // // //             <button
// // // // //               onClick={generateCertificates}
// // // // //               disabled={loading}
// // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // //             >
// // // // //               {loading
// // // // //                 ? "Generating Certificates..."
// // // // //                 : "Generate SSL Certificates"}
// // // // //             </button>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Manual Command Section */}
// // // // //         {showManualCommand && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Manual Certificate Generation Required for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
// // // // //               <p className="text-sm text-orange-800">
// // // // //                 <strong>Automated generation failed.</strong> All automated
// // // // //                 methods (webroot, standalone, dns-cloudflare) were unsuccessful.
// // // // //                 Please run the manual command below on your server to generate
// // // // //                 certificates.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="mb-4">
// // // // //               <h4 className="font-semibold text-gray-800 mb-2">
// // // // //                 Manual Command:
// // // // //               </h4>
// // // // //               <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm relative">
// // // // //                 <pre className="whitespace-pre-wrap break-all">
// // // // //                   {manualCommand}
// // // // //                 </pre>
// // // // //                 <div className="absolute top-2 right-2">
// // // // //                   <CopyButton
// // // // //                     text={manualCommand}
// // // // //                     itemId="manual-command"
// // // // //                     className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// // // // //                   />
// // // // //                 </div>
// // // // //               </div>
// // // // //             </div>

// // // // //             <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // // // //               <h5 className="font-semibold text-blue-800 mb-2">
// // // // //                 Instructions:
// // // // //               </h5>
// // // // //               <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
// // // // //                 <li>SSH into your server where certbot is installed</li>
// // // // //                 <li>Copy and paste the command above</li>
// // // // //                 <li>
// // // // //                   Certbot will show you the DNS TXT records (they should match
// // // // //                   what you already added)
// // // // //                 </li>
// // // // //                 <li>Press Enter when prompted to continue verification</li>
// // // // //                 <li>Certbot will generate your certificates</li>
// // // // //                 <li>
// // // // //                   Download your certificates from `/etc/letsencrypt/live/
// // // // //                   {domain}/`
// // // // //                 </li>
// // // // //               </ol>
// // // // //             </div>

// // // // //             <div className="grid md:grid-cols-2 gap-4 mb-4">
// // // // //               <div className="p-3 bg-green-50 border border-green-200 rounded">
// // // // //                 <h6 className="font-semibold text-green-800 mb-1">
// // // // //                   Why Manual Works:
// // // // //                 </h6>
// // // // //                 <p className="text-xs text-green-700">
// // // // //                   Your DNS records are already verified and propagated. The
// // // // //                   manual method will work because you can respond to certbot's
// // // // //                   prompts directly.
// // // // //                 </p>
// // // // //               </div>
// // // // //               <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
// // // // //                 <h6 className="font-semibold text-yellow-800 mb-1">
// // // // //                   After Success:
// // // // //                 </h6>
// // // // //                 <p className="text-xs text-yellow-700">
// // // // //                   Once certificates are generated, you can download them
// // // // //                   directly from your server at `/etc/letsencrypt/live/{domain}/`
// // // // //                 </p>
// // // // //               </div>
// // // // //             </div>

// // // // //             <div className="flex gap-4">
// // // // //               <button
// // // // //                 onClick={() => {
// // // // //                   setShowManualCommand(false);
// // // // //                   generateCertificates();
// // // // //                 }}
// // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // //               >
// // // // //                 Try Automatic Again
// // // // //               </button>
// // // // //               <button
// // // // //                 onClick={resetForm}
// // // // //                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // //               >
// // // // //                 Start Over
// // // // //               </button>
// // // // //             </div>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 4: Certificates */}
// // // // //         {step === 4 && certificates && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 4: Your SSL Certificates for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // //               <p className="text-sm text-green-800">
// // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // //                 your certificate files below.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="grid gap-4">
// // // // //               {[
// // // // //                 {
// // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // //                   title: "Full Chain Certificate",
// // // // //                   desc: "Use for most hosting control panels",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // //                   title: "Private Key",
// // // // //                   desc: "Keep this secure and private",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "cert" as keyof CertificateFiles,
// // // // //                   title: "Certificate Only",
// // // // //                   desc: "Your domain certificate",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "chain" as keyof CertificateFiles,
// // // // //                   title: "Certificate Chain",
// // // // //                   desc: "Intermediate certificates",
// // // // //                 },
// // // // //               ].map(({ key, title, desc }) =>
// // // // //                 certificates && certificates[key] ? (
// // // // //                   <div
// // // // //                     key={key}
// // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // //                   >
// // // // //                     <div className="flex items-center justify-between mb-2">
// // // // //                       <div>
// // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // //                       </div>
// // // // //                       <div className="flex gap-2">
// // // // //                         <CopyButton
// // // // //                           text={certificates[key] || ""}
// // // // //                           itemId={key}
// // // // //                         />
// // // // //                         <button
// // // // //                           onClick={() =>
// // // // //                             downloadAsTextFile(
// // // // //                               certificates[key] || "",
// // // // //                               `${domain}_${key}.txt`
// // // // //                             )
// // // // //                           }
// // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // //                         >
// // // // //                           <Download size={12} />
// // // // //                           Download
// // // // //                         </button>
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // //                       </pre>
// // // // //                     </div>
// // // // //                   </div>
// // // // //                 ) : null
// // // // //               )}
// // // // //             </div>

// // // // //             <button
// // // // //               onClick={resetForm}
// // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // //             >
// // // // //               Generate Another Certificate
// // // // //             </button>
// // // // //           </div>
// // // // //         )}
// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default SSLGenerator;

// // // // // "use client";
// // // // // import React, { useState, useEffect } from "react";

// // // // // // Type definitions
// // // // // interface DnsRecord {
// // // // //   name: string;
// // // // //   type: string;
// // // // //   value: string;
// // // // //   domain: string;
// // // // //   placeholder?: boolean;
// // // // // }

// // // // // interface VerificationResult extends DnsRecord {
// // // // //   verified: boolean;
// // // // //   currentValues: string[];
// // // // //   error?: string;
// // // // // }

// // // // // interface CertificateFiles {
// // // // //   fullchain?: string;
// // // // //   privkey?: string;
// // // // //   cert?: string;
// // // // //   chain?: string;
// // // // // }

// // // // // interface CopyButtonProps {
// // // // //   text: string;
// // // // //   itemId: string;
// // // // //   className?: string;
// // // // // }
// // // // // import {
// // // // //   Copy,
// // // // //   Check,
// // // // //   Shield,
// // // // //   Globe,
// // // // //   Mail,
// // // // //   AlertCircle,
// // // // //   Terminal,
// // // // //   Download,
// // // // //   FileText,
// // // // //   Key,
// // // // //   Award,
// // // // //   Server,
// // // // //   Settings,
// // // // //   RefreshCw,
// // // // //   CheckCircle,
// // // // //   Clock,
// // // // //   ExternalLink,
// // // // // } from "lucide-react";

// // // // // const SSLGenerator: React.FC = () => {
// // // // //   const [domain, setDomain] = useState<string>("");
// // // // //   const [email, setEmail] = useState<string>("");
// // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // //     VerificationResult[]
// // // // //   >([]);
// // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // //     null
// // // // //   );
// // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);
// // // // //   const [manualCommand, setManualCommand] = useState<string>("");
// // // // //   const [showManualCommand, setShowManualCommand] = useState<boolean>(false);

// // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // //   useEffect(() => {
// // // // //     let interval;
// // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // //     }
// // // // //     return () => clearInterval(interval);
// // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // //   const copyToClipboard = async (
// // // // //     text: string,
// // // // //     itemId: string
// // // // //   ): Promise<void> => {
// // // // //     try {
// // // // //       const textContent =
// // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // //       await navigator.clipboard.writeText(textContent);
// // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // //       setTimeout(() => {
// // // // //         setCopiedItems((prev) => {
// // // // //           const newSet = new Set(prev);
// // // // //           newSet.delete(itemId);
// // // // //           return newSet;
// // // // //         });
// // // // //       }, 2000);
// // // // //     } catch (err) {
// // // // //       console.error("Copy failed:", err);
// // // // //     }
// // // // //   };

// // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // //     const textContent =
// // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // //     const txtFilename = filename.endsWith(".txt")
// // // // //       ? filename
// // // // //       : `${filename}.txt`;
// // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // //     const url = window.URL.createObjectURL(blob);
// // // // //     const a = document.createElement("a");
// // // // //     a.href = url;
// // // // //     a.download = txtFilename;
// // // // //     document.body.appendChild(a);
// // // // //     a.click();
// // // // //     window.URL.revokeObjectURL(url);
// // // // //     document.body.removeChild(a);
// // // // //   };

// // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // //     if (!domain || !email) return;

// // // // //     setLoading(true);
// // // // //     try {
// // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // //       });

// // // // //       const data = await response.json();
// // // // //       if (data.success) {
// // // // //         setDnsRecords(data.dnsRecords);
// // // // //         setStep(2);
// // // // //       } else {
// // // // //         alert(`Error: ${data.error}`);
// // // // //       }
// // // // //     } catch (error) {
// // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // //     if (dnsRecords.length === 0) return;

// // // // //     try {
// // // // //       const response = await fetch("/api/verify-dns", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // //       });

// // // // //       const data = await response.json();
// // // // //       setVerificationResults(data.records || []);

// // // // //       if (data.verified) {
// // // // //         setStep(3);
// // // // //         setAutoCheckDns(false);
// // // // //       }
// // // // //     } catch (error) {
// // // // //       console.error("DNS check failed:", error);
// // // // //     }
// // // // //   };

// // // // //   const generateCertificates = async (): Promise<void> => {
// // // // //     setLoading(true);
// // // // //     try {
// // // // //       const response = await fetch("/api/generate-certificates-cpanel", {
// // // // //         method: "POST",
// // // // //         headers: { "Content-Type": "application/json" },
// // // // //         body: JSON.stringify({ domain, dnsRecords }),
// // // // //       });

// // // // //       const data = await response.json();
// // // // //       if (data.success) {
// // // // //         setCertificates(data.certificates);
// // // // //         setStep(4);
// // // // //       } else if (data.dnsUpdateRequired && data.newDnsRecords) {
// // // // //         // Let's Encrypt generated new challenge values
// // // // //         setDnsRecords(data.newDnsRecords);
// // // // //         setStep(2); // Go back to DNS records step
// // // // //         setVerificationResults([]); // Clear previous verification
// // // // //         alert(
// // // // //           `DNS records need to be updated! Let's Encrypt generated new challenge values. Please update your DNS records with the new values shown.`
// // // // //         );
// // // // //       } else if (data.requiresManualExecution && data.manualCommand) {
// // // // //         // Show manual command for user to run
// // // // //         setManualCommand(data.manualCommand);
// // // // //         setShowManualCommand(true);
// // // // //       } else {
// // // // //         alert(
// // // // //           `Error: ${data.error}\n\nTroubleshooting:\n${
// // // // //             data.troubleshooting?.join("\n") || "No additional information"
// // // // //           }`
// // // // //         );
// // // // //       }
// // // // //     } catch (error) {
// // // // //       alert("Failed to generate certificates. Please try again.");
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const resetForm = (): void => {
// // // // //     setStep(1);
// // // // //     setDomain("");
// // // // //     setEmail("");
// // // // //     setIncludeWildcard(false);
// // // // //     setDnsRecords([]);
// // // // //     setVerificationResults([]);
// // // // //     setCertificates(null);
// // // // //     setAutoCheckDns(false);
// // // // //     setManualCommand("");
// // // // //     setShowManualCommand(false);
// // // // //   };

// // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // //     text,
// // // // //     itemId,
// // // // //     className = "",
// // // // //   }) => {
// // // // //     const isCopied = copiedItems.has(itemId);
// // // // //     return (
// // // // //       <button
// // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // //           isCopied
// // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // //         }`}
// // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // //       >
// // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // //       </button>
// // // // //     );
// // // // //   };

// // // // //   return (
// // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // //       <div className="max-w-6xl mx-auto">
// // // // //         {/* Header */}
// // // // //         <div className="text-center mb-8">
// // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // //               SSL Certificate Generator
// // // // //             </h1>
// // // // //           </div>
// // // // //           <p className="text-gray-600">
// // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // //             guidance
// // // // //           </p>
// // // // //         </div>

// // // // //         {/* Progress Steps */}
// // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // //           <div className="flex items-center justify-between mb-6">
// // // // //             {[
// // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // //               <div key={num} className="flex items-center">
// // // // //                 <div
// // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // //                     step >= num
// // // // //                       ? "bg-blue-600 text-white"
// // // // //                       : "bg-gray-200 text-gray-500"
// // // // //                   }`}
// // // // //                 >
// // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // //                 </div>
// // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // //                   {title}
// // // // //                 </span>
// // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // //               </div>
// // // // //             ))}
// // // // //           </div>
// // // // //         </div>

// // // // //         {/* Step 1: Domain Information */}
// // // // //         {step === 1 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 1: Enter Domain Information
// // // // //             </h3>
// // // // //             <div className="space-y-4">
// // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // //                 <div>
// // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // //                     <Globe size={16} />
// // // // //                     Domain Name
// // // // //                   </label>
// // // // //                   <input
// // // // //                     type="text"
// // // // //                     value={domain}
// // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // //                     placeholder="example.com"
// // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // //                     required
// // // // //                   />
// // // // //                 </div>
// // // // //                 <div>
// // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // //                     <Mail size={16} />
// // // // //                     Email Address
// // // // //                   </label>
// // // // //                   <input
// // // // //                     type="email"
// // // // //                     value={email}
// // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // //                     placeholder="admin@example.com"
// // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // //                     required
// // // // //                   />
// // // // //                 </div>
// // // // //               </div>
// // // // //               <div className="flex items-center gap-2">
// // // // //                 <input
// // // // //                   type="checkbox"
// // // // //                   id="wildcard"
// // // // //                   checked={includeWildcard}
// // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // //                 />
// // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // //                 </label>
// // // // //               </div>
// // // // //               <button
// // // // //                 onClick={generateDnsChallenge}
// // // // //                 disabled={loading || !domain || !email}
// // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // //               >
// // // // //                 {loading
// // // // //                   ? "Generating DNS Challenge..."
// // // // //                   : "Generate DNS Challenge"}
// // // // //               </button>
// // // // //             </div>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 2: DNS Records */}
// // // // //         {step === 2 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // //               <p className="text-sm text-yellow-800">
// // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // //                 propagated.
// // // // //               </p>
// // // // //               <p className="text-xs text-yellow-700 mt-2">
// // // // //                 <strong>Note:</strong> Let's Encrypt may generate new challenge
// // // // //                 values during certificate generation. If that happens, you'll
// // // // //                 need to update these DNS records with the new values.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="space-y-4 mb-6">
// // // // //               {dnsRecords.map((record, index) => (
// // // // //                 <div
// // // // //                   key={index}
// // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // //                 >
// // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Name
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // //                           {record.name}
// // // // //                         </code>
// // // // //                         <CopyButton
// // // // //                           text={record.name}
// // // // //                           itemId={`name-${index}`}
// // // // //                         />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Type
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // //                           TXT
// // // // //                         </code>
// // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div>
// // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // //                         Record Value
// // // // //                       </label>
// // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // //                           {record.value}
// // // // //                         </code>
// // // // //                         <CopyButton
// // // // //                           text={record.value}
// // // // //                           itemId={`value-${index}`}
// // // // //                         />
// // // // //                       </div>
// // // // //                     </div>
// // // // //                   </div>
// // // // //                   {record.placeholder && (
// // // // //                     <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
// // // // //                       <p className="text-xs text-orange-800">
// // // // //                         <strong>Placeholder Value:</strong> This is a
// // // // //                         placeholder. Run the server command to get the actual
// // // // //                         DNS record value.
// // // // //                       </p>
// // // // //                     </div>
// // // // //                   )}
// // // // //                 </div>
// // // // //               ))}
// // // // //             </div>

// // // // //             <div className="flex items-center gap-4 mb-4">
// // // // //               <label className="flex items-center gap-2">
// // // // //                 <input
// // // // //                   type="checkbox"
// // // // //                   checked={autoCheckDns}
// // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // //                 />
// // // // //                 <span className="text-sm text-gray-700">
// // // // //                   Auto-check DNS every 30 seconds
// // // // //                 </span>
// // // // //               </label>
// // // // //             </div>

// // // // //             <div className="flex gap-4">
// // // // //               <button
// // // // //                 onClick={checkDnsRecords}
// // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // //               >
// // // // //                 <RefreshCw size={16} />
// // // // //                 Check DNS
// // // // //               </button>
// // // // //               <button
// // // // //                 onClick={resetForm}
// // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // //               >
// // // // //                 Start Over
// // // // //               </button>
// // // // //             </div>

// // // // //             {verificationResults.length > 0 && (
// // // // //               <div className="mt-6">
// // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // //                   DNS Verification Results:
// // // // //                 </h4>
// // // // //                 <div className="space-y-2">
// // // // //                   {verificationResults.map((result, index) => (
// // // // //                     <div
// // // // //                       key={index}
// // // // //                       className={`p-3 rounded border ${
// // // // //                         result.verified
// // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // //                       }`}
// // // // //                     >
// // // // //                       <div className="flex items-center gap-2">
// // // // //                         {result.verified ? (
// // // // //                           <CheckCircle size={16} />
// // // // //                         ) : (
// // // // //                           <Clock size={16} />
// // // // //                         )}
// // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // //                         <span className="text-xs">
// // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // //                         </span>
// // // // //                       </div>
// // // // //                       {result.error && (
// // // // //                         <p className="text-xs mt-1">{result.error}</p>
// // // // //                       )}
// // // // //                     </div>
// // // // //                   ))}
// // // // //                 </div>

// // // // //                 {verificationResults.every((r) => r.verified) && (
// // // // //                   <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
// // // // //                     <p className="text-sm text-green-800">
// // // // //                       <strong>All DNS records verified!</strong> You can now
// // // // //                       proceed to certificate generation.
// // // // //                     </p>
// // // // //                   </div>
// // // // //                 )}
// // // // //               </div>
// // // // //             )}
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 3: Verification Complete */}
// // // // //         {step === 3 && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 3: DNS Verified - Generate Certificates
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // //               <p className="text-sm text-green-800">
// // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // //                 You can now generate your SSL certificates.
// // // // //               </p>
// // // // //             </div>
// // // // //             <button
// // // // //               onClick={generateCertificates}
// // // // //               disabled={loading}
// // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // //             >
// // // // //               {loading
// // // // //                 ? "Generating Certificates..."
// // // // //                 : "Generate SSL Certificates"}
// // // // //             </button>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Manual Command Section */}
// // // // //         {showManualCommand && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Manual Certificate Generation Required for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
// // // // //               <p className="text-sm text-orange-800">
// // // // //                 <strong>Automated generation failed.</strong> All automated
// // // // //                 methods (webroot, standalone, dns-cloudflare) were unsuccessful.
// // // // //                 Please run the manual command below on your server to generate
// // // // //                 certificates.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="mb-4">
// // // // //               <h4 className="font-semibold text-gray-800 mb-2">
// // // // //                 Manual Command:
// // // // //               </h4>
// // // // //               <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm relative">
// // // // //                 <pre className="whitespace-pre-wrap break-all">
// // // // //                   {manualCommand}
// // // // //                 </pre>
// // // // //                 <div className="absolute top-2 right-2">
// // // // //                   <CopyButton
// // // // //                     text={manualCommand}
// // // // //                     itemId="manual-command"
// // // // //                     className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// // // // //                   />
// // // // //                 </div>
// // // // //               </div>
// // // // //             </div>

// // // // //             <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // // // //               <h5 className="font-semibold text-blue-800 mb-2">
// // // // //                 Instructions:
// // // // //               </h5>
// // // // //               <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
// // // // //                 <li>SSH into your server where certbot is installed</li>
// // // // //                 <li>Copy and paste the command above</li>
// // // // //                 <li>
// // // // //                   Certbot will show you the DNS TXT records (they should match
// // // // //                   what you already added)
// // // // //                 </li>
// // // // //                 <li>Press Enter when prompted to continue verification</li>
// // // // //                 <li>Certbot will generate your certificates</li>
// // // // //                 <li>
// // // // //                   Download your certificates from `/etc/letsencrypt/live/
// // // // //                   {domain}/`
// // // // //                 </li>
// // // // //               </ol>
// // // // //             </div>

// // // // //             <div className="grid md:grid-cols-2 gap-4 mb-4">
// // // // //               <div className="p-3 bg-green-50 border border-green-200 rounded">
// // // // //                 <h6 className="font-semibold text-green-800 mb-1">
// // // // //                   Why Manual Works:
// // // // //                 </h6>
// // // // //                 <p className="text-xs text-green-700">
// // // // //                   Your DNS records are already verified and propagated. The
// // // // //                   manual method will work because you can respond to certbot's
// // // // //                   prompts directly.
// // // // //                 </p>
// // // // //               </div>
// // // // //               <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
// // // // //                 <h6 className="font-semibold text-yellow-800 mb-1">
// // // // //                   After Success:
// // // // //                 </h6>
// // // // //                 <p className="text-xs text-yellow-700">
// // // // //                   Once certificates are generated, you can download them
// // // // //                   directly from your server at `/etc/letsencrypt/live/{domain}/`
// // // // //                 </p>
// // // // //               </div>
// // // // //             </div>

// // // // //             <div className="flex gap-4">
// // // // //               <button
// // // // //                 onClick={() => {
// // // // //                   setShowManualCommand(false);
// // // // //                   generateCertificates();
// // // // //                 }}
// // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // //               >
// // // // //                 Try Automatic Again
// // // // //               </button>
// // // // //               <button
// // // // //                 onClick={resetForm}
// // // // //                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // //               >
// // // // //                 Start Over
// // // // //               </button>
// // // // //             </div>
// // // // //           </div>
// // // // //         )}

// // // // //         {/* Step 4: Certificates */}
// // // // //         {step === 4 && certificates && (
// // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // //               Step 4: Your SSL Certificates for {domain}
// // // // //             </h3>
// // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // //               <p className="text-sm text-green-800">
// // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // //                 your certificate files below.
// // // // //               </p>
// // // // //             </div>

// // // // //             <div className="grid gap-4">
// // // // //               {[
// // // // //                 {
// // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // //                   title: "Full Chain Certificate",
// // // // //                   desc: "Use for most hosting control panels",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // //                   title: "Private Key",
// // // // //                   desc: "Keep this secure and private",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "cert" as keyof CertificateFiles,
// // // // //                   title: "Certificate Only",
// // // // //                   desc: "Your domain certificate",
// // // // //                 },
// // // // //                 {
// // // // //                   key: "chain" as keyof CertificateFiles,
// // // // //                   title: "Certificate Chain",
// // // // //                   desc: "Intermediate certificates",
// // // // //                 },
// // // // //               ].map(({ key, title, desc }) =>
// // // // //                 certificates && certificates[key] ? (
// // // // //                   <div
// // // // //                     key={key}
// // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // //                   >
// // // // //                     <div className="flex items-center justify-between mb-2">
// // // // //                       <div>
// // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // //                       </div>
// // // // //                       <div className="flex gap-2">
// // // // //                         <CopyButton
// // // // //                           text={certificates[key] || ""}
// // // // //                           itemId={key}
// // // // //                         />
// // // // //                         <button
// // // // //                           onClick={() =>
// // // // //                             downloadAsTextFile(
// // // // //                               certificates[key] || "",
// // // // //                               `${domain}_${key}.txt`
// // // // //                             )
// // // // //                           }
// // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // //                         >
// // // // //                           <Download size={12} />
// // // // //                           Download
// // // // //                         </button>
// // // // //                       </div>
// // // // //                     </div>
// // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // //                       </pre>
// // // // //                     </div>
// // // // //                   </div>
// // // // //                 ) : null
// // // // //               )}
// // // // //             </div>

// // // // //             <button
// // // // //               onClick={resetForm}
// // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // //             >
// // // // //               Generate Another Certificate
// // // // //             </button>
// // // // //           </div>
// // // // //         )}
// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default SSLGenerator;

// // // // // // "use client";
// // // // // // import React, { useState, useEffect } from "react";

// // // // // // // Type definitions
// // // // // // interface DnsRecord {
// // // // // //   name: string;
// // // // // //   type: string;
// // // // // //   value: string;
// // // // // //   domain: string;
// // // // // //   placeholder?: boolean;
// // // // // // }

// // // // // // interface VerificationResult extends DnsRecord {
// // // // // //   verified: boolean;
// // // // // //   currentValues: string[];
// // // // // //   error?: string;
// // // // // // }

// // // // // // interface CertificateFiles {
// // // // // //   fullchain?: string;
// // // // // //   privkey?: string;
// // // // // //   cert?: string;
// // // // // //   chain?: string;
// // // // // // }

// // // // // // interface CopyButtonProps {
// // // // // //   text: string;
// // // // // //   itemId: string;
// // // // // //   className?: string;
// // // // // // }
// // // // // // import {
// // // // // //   Copy,
// // // // // //   Check,
// // // // // //   Shield,
// // // // // //   Globe,
// // // // // //   Mail,
// // // // // //   AlertCircle,
// // // // // //   Terminal,
// // // // // //   Download,
// // // // // //   FileText,
// // // // // //   Key,
// // // // // //   Award,
// // // // // //   Server,
// // // // // //   Settings,
// // // // // //   RefreshCw,
// // // // // //   CheckCircle,
// // // // // //   Clock,
// // // // // //   ExternalLink,
// // // // // // } from "lucide-react";

// // // // // // const SSLGenerator: React.FC = () => {
// // // // // //   const [domain, setDomain] = useState<string>("");
// // // // // //   const [email, setEmail] = useState<string>("");
// // // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // // //     VerificationResult[]
// // // // // //   >([]);
// // // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // // //     null
// // // // // //   );
// // // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);
// // // // // //   const [manualCommand, setManualCommand] = useState<string>("");
// // // // // //   const [showManualCommand, setShowManualCommand] = useState<boolean>(false);

// // // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // // //   useEffect(() => {
// // // // // //     let interval;
// // // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // // //     }
// // // // // //     return () => clearInterval(interval);
// // // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // // //   const copyToClipboard = async (
// // // // // //     text: string,
// // // // // //     itemId: string
// // // // // //   ): Promise<void> => {
// // // // // //     try {
// // // // // //       const textContent =
// // // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // // //       await navigator.clipboard.writeText(textContent);
// // // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // // //       setTimeout(() => {
// // // // // //         setCopiedItems((prev) => {
// // // // // //           const newSet = new Set(prev);
// // // // // //           newSet.delete(itemId);
// // // // // //           return newSet;
// // // // // //         });
// // // // // //       }, 2000);
// // // // // //     } catch (err) {
// // // // // //       console.error("Copy failed:", err);
// // // // // //     }
// // // // // //   };

// // // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // // //     const textContent =
// // // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // // //     const txtFilename = filename.endsWith(".txt")
// // // // // //       ? filename
// // // // // //       : `${filename}.txt`;
// // // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // // //     const url = window.URL.createObjectURL(blob);
// // // // // //     const a = document.createElement("a");
// // // // // //     a.href = url;
// // // // // //     a.download = txtFilename;
// // // // // //     document.body.appendChild(a);
// // // // // //     a.click();
// // // // // //     window.URL.revokeObjectURL(url);
// // // // // //     document.body.removeChild(a);
// // // // // //   };

// // // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // // //     if (!domain || !email) return;

// // // // // //     setLoading(true);
// // // // // //     try {
// // // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // // //         method: "POST",
// // // // // //         headers: { "Content-Type": "application/json" },
// // // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // // //       });

// // // // // //       const data = await response.json();
// // // // // //       if (data.success) {
// // // // // //         setDnsRecords(data.dnsRecords);
// // // // // //         setStep(2);
// // // // // //       } else {
// // // // // //         alert(`Error: ${data.error}`);
// // // // // //       }
// // // // // //     } catch (error) {
// // // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // // //     } finally {
// // // // // //       setLoading(false);
// // // // // //     }
// // // // // //   };

// // // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // // //     if (dnsRecords.length === 0) return;

// // // // // //     try {
// // // // // //       const response = await fetch("/api/verify-dns", {
// // // // // //         method: "POST",
// // // // // //         headers: { "Content-Type": "application/json" },
// // // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // // //       });

// // // // // //       const data = await response.json();
// // // // // //       setVerificationResults(data.records || []);

// // // // // //       if (data.verified) {
// // // // // //         setStep(3);
// // // // // //         setAutoCheckDns(false);
// // // // // //       }
// // // // // //     } catch (error) {
// // // // // //       console.error("DNS check failed:", error);
// // // // // //     }
// // // // // //   };

// // // // // //   const generateCertificates = async (): Promise<void> => {
// // // // // //     setLoading(true);
// // // // // //     try {
// // // // // //       const response = await fetch("/api/generate-certificates", {
// // // // // //         method: "POST",
// // // // // //         headers: { "Content-Type": "application/json" },
// // // // // //         body: JSON.stringify({ domain, dnsRecords }),
// // // // // //       });

// // // // // //       const data = await response.json();
// // // // // //       if (data.success) {
// // // // // //         setCertificates(data.certificates);
// // // // // //         setStep(4);
// // // // // //       } else if (data.dnsUpdateRequired && data.newDnsRecords) {
// // // // // //         // Let's Encrypt generated new challenge values
// // // // // //         setDnsRecords(data.newDnsRecords);
// // // // // //         setStep(2); // Go back to DNS records step
// // // // // //         setVerificationResults([]); // Clear previous verification
// // // // // //         alert(
// // // // // //           `DNS records need to be updated! Let's Encrypt generated new challenge values. Please update your DNS records with the new values shown.`
// // // // // //         );
// // // // // //       } else if (data.requiresManualExecution && data.manualCommand) {
// // // // // //         // Show manual command for user to run
// // // // // //         setManualCommand(data.manualCommand);
// // // // // //         setShowManualCommand(true);
// // // // // //       } else {
// // // // // //         alert(`Error: ${data.error}`);
// // // // // //       }
// // // // // //     } catch (error) {
// // // // // //       alert("Failed to generate certificates. Please try again.");
// // // // // //     } finally {
// // // // // //       setLoading(false);
// // // // // //     }
// // // // // //   };

// // // // // //   const resetForm = (): void => {
// // // // // //     setStep(1);
// // // // // //     setDomain("");
// // // // // //     setEmail("");
// // // // // //     setIncludeWildcard(false);
// // // // // //     setDnsRecords([]);
// // // // // //     setVerificationResults([]);
// // // // // //     setCertificates(null);
// // // // // //     setAutoCheckDns(false);
// // // // // //     setManualCommand("");
// // // // // //     setShowManualCommand(false);
// // // // // //   };

// // // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // // //     text,
// // // // // //     itemId,
// // // // // //     className = "",
// // // // // //   }) => {
// // // // // //     const isCopied = copiedItems.has(itemId);
// // // // // //     return (
// // // // // //       <button
// // // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // // //           isCopied
// // // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // // //         }`}
// // // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // // //       >
// // // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // // //       </button>
// // // // // //     );
// // // // // //   };

// // // // // //   return (
// // // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // // //       <div className="max-w-6xl mx-auto">
// // // // // //         {/* Header */}
// // // // // //         <div className="text-center mb-8">
// // // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // // //               SSL Certificate Generator
// // // // // //             </h1>
// // // // // //           </div>
// // // // // //           <p className="text-gray-600">
// // // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // // //             guidance
// // // // // //           </p>
// // // // // //         </div>

// // // // // //         {/* Progress Steps */}
// // // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // // //           <div className="flex items-center justify-between mb-6">
// // // // // //             {[
// // // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // // //               <div key={num} className="flex items-center">
// // // // // //                 <div
// // // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // // //                     step >= num
// // // // // //                       ? "bg-blue-600 text-white"
// // // // // //                       : "bg-gray-200 text-gray-500"
// // // // // //                   }`}
// // // // // //                 >
// // // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // // //                 </div>
// // // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // // //                   {title}
// // // // // //                 </span>
// // // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // // //               </div>
// // // // // //             ))}
// // // // // //           </div>
// // // // // //         </div>

// // // // // //         {/* Step 1: Domain Information */}
// // // // // //         {step === 1 && (
// // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // //               Step 1: Enter Domain Information
// // // // // //             </h3>
// // // // // //             <div className="space-y-4">
// // // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // // //                 <div>
// // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // //                     <Globe size={16} />
// // // // // //                     Domain Name
// // // // // //                   </label>
// // // // // //                   <input
// // // // // //                     type="text"
// // // // // //                     value={domain}
// // // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // // //                     placeholder="example.com"
// // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // //                     required
// // // // // //                   />
// // // // // //                 </div>
// // // // // //                 <div>
// // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // //                     <Mail size={16} />
// // // // // //                     Email Address
// // // // // //                   </label>
// // // // // //                   <input
// // // // // //                     type="email"
// // // // // //                     value={email}
// // // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // // //                     placeholder="admin@example.com"
// // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // //                     required
// // // // // //                   />
// // // // // //                 </div>
// // // // // //               </div>
// // // // // //               <div className="flex items-center gap-2">
// // // // // //                 <input
// // // // // //                   type="checkbox"
// // // // // //                   id="wildcard"
// // // // // //                   checked={includeWildcard}
// // // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // //                 />
// // // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // // //                 </label>
// // // // // //               </div>
// // // // // //               <button
// // // // // //                 onClick={generateDnsChallenge}
// // // // // //                 disabled={loading || !domain || !email}
// // // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // //               >
// // // // // //                 {loading
// // // // // //                   ? "Generating DNS Challenge..."
// // // // // //                   : "Generate DNS Challenge"}
// // // // // //               </button>
// // // // // //             </div>
// // // // // //           </div>
// // // // // //         )}

// // // // // //         {/* Step 2: DNS Records */}
// // // // // //         {step === 2 && (
// // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // // //             </h3>
// // // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // // //               <p className="text-sm text-yellow-800">
// // // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // // //                 propagated.
// // // // // //               </p>
// // // // // //               <p className="text-xs text-yellow-700 mt-2">
// // // // // //                 <strong>Note:</strong> Let's Encrypt may generate new challenge
// // // // // //                 values during certificate generation. If that happens, you'll
// // // // // //                 need to update these DNS records with the new values.
// // // // // //               </p>
// // // // // //             </div>

// // // // // //             <div className="space-y-4 mb-6">
// // // // // //               {dnsRecords.map((record, index) => (
// // // // // //                 <div
// // // // // //                   key={index}
// // // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // // //                 >
// // // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // // //                     <div>
// // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // //                         Record Name
// // // // // //                       </label>
// // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // //                           {record.name}
// // // // // //                         </code>
// // // // // //                         <CopyButton
// // // // // //                           text={record.name}
// // // // // //                           itemId={`name-${index}`}
// // // // // //                         />
// // // // // //                       </div>
// // // // // //                     </div>
// // // // // //                     <div>
// // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // //                         Record Type
// // // // // //                       </label>
// // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // // //                           TXT
// // // // // //                         </code>
// // // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // // //                       </div>
// // // // // //                     </div>
// // // // // //                     <div>
// // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // //                         Record Value
// // // // // //                       </label>
// // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // //                           {record.value}
// // // // // //                         </code>
// // // // // //                         <CopyButton
// // // // // //                           text={record.value}
// // // // // //                           itemId={`value-${index}`}
// // // // // //                         />
// // // // // //                       </div>
// // // // // //                     </div>
// // // // // //                   </div>
// // // // // //                   {record.placeholder && (
// // // // // //                     <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
// // // // // //                       <p className="text-xs text-orange-800">
// // // // // //                         <strong>Placeholder Value:</strong> This is a
// // // // // //                         placeholder. Run the server command to get the actual
// // // // // //                         DNS record value.
// // // // // //                       </p>
// // // // // //                     </div>
// // // // // //                   )}
// // // // // //                 </div>
// // // // // //               ))}
// // // // // //             </div>

// // // // // //             <div className="flex items-center gap-4 mb-4">
// // // // // //               <label className="flex items-center gap-2">
// // // // // //                 <input
// // // // // //                   type="checkbox"
// // // // // //                   checked={autoCheckDns}
// // // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // //                 />
// // // // // //                 <span className="text-sm text-gray-700">
// // // // // //                   Auto-check DNS every 30 seconds
// // // // // //                 </span>
// // // // // //               </label>
// // // // // //             </div>

// // // // // //             <div className="flex gap-4">
// // // // // //               <button
// // // // // //                 onClick={checkDnsRecords}
// // // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // // //               >
// // // // // //                 <RefreshCw size={16} />
// // // // // //                 Check DNS
// // // // // //               </button>
// // // // // //               <button
// // // // // //                 onClick={resetForm}
// // // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // // //               >
// // // // // //                 Start Over
// // // // // //               </button>
// // // // // //             </div>

// // // // // //             {verificationResults.length > 0 && (
// // // // // //               <div className="mt-6">
// // // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // // //                   DNS Verification Results:
// // // // // //                 </h4>
// // // // // //                 <div className="space-y-2">
// // // // // //                   {verificationResults.map((result, index) => (
// // // // // //                     <div
// // // // // //                       key={index}
// // // // // //                       className={`p-3 rounded border ${
// // // // // //                         result.verified
// // // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // // //                       }`}
// // // // // //                     >
// // // // // //                       <div className="flex items-center gap-2">
// // // // // //                         {result.verified ? (
// // // // // //                           <CheckCircle size={16} />
// // // // // //                         ) : (
// // // // // //                           <Clock size={16} />
// // // // // //                         )}
// // // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // // //                         <span className="text-xs">
// // // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // // //                         </span>
// // // // // //                       </div>
// // // // // //                       {result.error && (
// // // // // //                         <p className="text-xs mt-1">{result.error}</p>
// // // // // //                       )}
// // // // // //                     </div>
// // // // // //                   ))}
// // // // // //                 </div>

// // // // // //                 {verificationResults.every((r) => r.verified) && (
// // // // // //                   <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
// // // // // //                     <p className="text-sm text-green-800">
// // // // // //                       <strong>All DNS records verified!</strong> You can now
// // // // // //                       proceed to certificate generation.
// // // // // //                     </p>
// // // // // //                   </div>
// // // // // //                 )}
// // // // // //               </div>
// // // // // //             )}
// // // // // //           </div>
// // // // // //         )}

// // // // // //         {/* Step 3: Verification Complete */}
// // // // // //         {step === 3 && (
// // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // //               Step 3: DNS Verified - Generate Certificates
// // // // // //             </h3>
// // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // //               <p className="text-sm text-green-800">
// // // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // // //                 You can now generate your SSL certificates.
// // // // // //               </p>
// // // // // //             </div>
// // // // // //             <button
// // // // // //               onClick={generateCertificates}
// // // // // //               disabled={loading}
// // // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // //             >
// // // // // //               {loading
// // // // // //                 ? "Generating Certificates..."
// // // // // //                 : "Generate SSL Certificates"}
// // // // // //             </button>
// // // // // //           </div>
// // // // // //         )}

// // // // // //         {/* Manual Command Section */}
// // // // // //         {showManualCommand && (
// // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // //               Manual Certificate Generation Required for {domain}
// // // // // //             </h3>
// // // // // //             <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
// // // // // //               <p className="text-sm text-orange-800">
// // // // // //                 <strong>Automated generation failed.</strong> All automated
// // // // // //                 methods (webroot, standalone, dns-cloudflare) were unsuccessful.
// // // // // //                 Please run the manual command below on your server to generate
// // // // // //                 certificates.
// // // // // //               </p>
// // // // // //             </div>

// // // // // //             <div className="mb-4">
// // // // // //               <h4 className="font-semibold text-gray-800 mb-2">
// // // // // //                 Manual Command:
// // // // // //               </h4>
// // // // // //               <div className="bg-gray-900 text-green-400 p-4 rounded-md font-mono text-sm relative">
// // // // // //                 <pre className="whitespace-pre-wrap break-all">
// // // // // //                   {manualCommand}
// // // // // //                 </pre>
// // // // // //                 <div className="absolute top-2 right-2">
// // // // // //                   <CopyButton
// // // // // //                     text={manualCommand}
// // // // // //                     itemId="manual-command"
// // // // // //                     className="bg-gray-800 hover:bg-gray-700 text-gray-300"
// // // // // //                   />
// // // // // //                 </div>
// // // // // //               </div>
// // // // // //             </div>

// // // // // //             <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
// // // // // //               <h5 className="font-semibold text-blue-800 mb-2">
// // // // // //                 Instructions:
// // // // // //               </h5>
// // // // // //               <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
// // // // // //                 <li>SSH into your server where certbot is installed</li>
// // // // // //                 <li>Copy and paste the command above</li>
// // // // // //                 <li>
// // // // // //                   Certbot will show you the DNS TXT records (they should match
// // // // // //                   what you already added)
// // // // // //                 </li>
// // // // // //                 <li>Press Enter when prompted to continue verification</li>
// // // // // //                 <li>Certbot will generate your certificates</li>
// // // // // //                 <li>
// // // // // //                   Download your certificates from `/etc/letsencrypt/live/
// // // // // //                   {domain}/`
// // // // // //                 </li>
// // // // // //               </ol>
// // // // // //             </div>

// // // // // //             <div className="grid md:grid-cols-2 gap-4 mb-4">
// // // // // //               <div className="p-3 bg-green-50 border border-green-200 rounded">
// // // // // //                 <h6 className="font-semibold text-green-800 mb-1">
// // // // // //                   Why Manual Works:
// // // // // //                 </h6>
// // // // // //                 <p className="text-xs text-green-700">
// // // // // //                   Your DNS records are already verified and propagated. The
// // // // // //                   manual method will work because you can respond to certbot's
// // // // // //                   prompts directly.
// // // // // //                 </p>
// // // // // //               </div>
// // // // // //               <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
// // // // // //                 <h6 className="font-semibold text-yellow-800 mb-1">
// // // // // //                   After Success:
// // // // // //                 </h6>
// // // // // //                 <p className="text-xs text-yellow-700">
// // // // // //                   Once certificates are generated, you can download them
// // // // // //                   directly from your server at `/etc/letsencrypt/live/{domain}/`
// // // // // //                 </p>
// // // // // //               </div>
// // // // // //             </div>

// // // // // //             <div className="flex gap-4">
// // // // // //               <button
// // // // // //                 onClick={() => {
// // // // // //                   setShowManualCommand(false);
// // // // // //                   generateCertificates();
// // // // // //                 }}
// // // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // // //               >
// // // // // //                 Try Automatic Again
// // // // // //               </button>
// // // // // //               <button
// // // // // //                 onClick={resetForm}
// // // // // //                 className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // // //               >
// // // // // //                 Start Over
// // // // // //               </button>
// // // // // //             </div>
// // // // // //           </div>
// // // // // //         )}

// // // // // //         {/* Step 4: Certificates */}
// // // // // //         {step === 4 && certificates && (
// // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // //               Step 4: Your SSL Certificates for {domain}
// // // // // //             </h3>
// // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // //               <p className="text-sm text-green-800">
// // // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // // //                 your certificate files below.
// // // // // //               </p>
// // // // // //             </div>

// // // // // //             <div className="grid gap-4">
// // // // // //               {[
// // // // // //                 {
// // // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // // //                   title: "Full Chain Certificate",
// // // // // //                   desc: "Use for most hosting control panels",
// // // // // //                 },
// // // // // //                 {
// // // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // // //                   title: "Private Key",
// // // // // //                   desc: "Keep this secure and private",
// // // // // //                 },
// // // // // //                 {
// // // // // //                   key: "cert" as keyof CertificateFiles,
// // // // // //                   title: "Certificate Only",
// // // // // //                   desc: "Your domain certificate",
// // // // // //                 },
// // // // // //                 {
// // // // // //                   key: "chain" as keyof CertificateFiles,
// // // // // //                   title: "Certificate Chain",
// // // // // //                   desc: "Intermediate certificates",
// // // // // //                 },
// // // // // //               ].map(({ key, title, desc }) =>
// // // // // //                 certificates && certificates[key] ? (
// // // // // //                   <div
// // // // // //                     key={key}
// // // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // // //                   >
// // // // // //                     <div className="flex items-center justify-between mb-2">
// // // // // //                       <div>
// // // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // // //                       </div>
// // // // // //                       <div className="flex gap-2">
// // // // // //                         <CopyButton
// // // // // //                           text={certificates[key] || ""}
// // // // // //                           itemId={key}
// // // // // //                         />
// // // // // //                         <button
// // // // // //                           onClick={() =>
// // // // // //                             downloadAsTextFile(
// // // // // //                               certificates[key] || "",
// // // // // //                               `${domain}_${key}.txt`
// // // // // //                             )
// // // // // //                           }
// // // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // // //                         >
// // // // // //                           <Download size={12} />
// // // // // //                           Download
// // // // // //                         </button>
// // // // // //                       </div>
// // // // // //                     </div>
// // // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // // //                       </pre>
// // // // // //                     </div>
// // // // // //                   </div>
// // // // // //                 ) : null
// // // // // //               )}
// // // // // //             </div>

// // // // // //             <button
// // // // // //               onClick={resetForm}
// // // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // // //             >
// // // // // //               Generate Another Certificate
// // // // // //             </button>
// // // // // //           </div>
// // // // // //         )}
// // // // // //       </div>
// // // // // //     </div>
// // // // // //   );
// // // // // // };

// // // // // // export default SSLGenerator;
// // // // // // // "use client";
// // // // // // // import React, { useState, useEffect } from "react";

// // // // // // // // Type definitions
// // // // // // // interface DnsRecord {
// // // // // // //   name: string;
// // // // // // //   type: string;
// // // // // // //   value: string;
// // // // // // //   domain: string;
// // // // // // //   placeholder?: boolean;
// // // // // // // }

// // // // // // // interface VerificationResult extends DnsRecord {
// // // // // // //   verified: boolean;
// // // // // // //   currentValues: string[];
// // // // // // //   error?: string;
// // // // // // // }

// // // // // // // interface CertificateFiles {
// // // // // // //   fullchain?: string;
// // // // // // //   privkey?: string;
// // // // // // //   cert?: string;
// // // // // // //   chain?: string;
// // // // // // // }

// // // // // // // interface CopyButtonProps {
// // // // // // //   text: string;
// // // // // // //   itemId: string;
// // // // // // //   className?: string;
// // // // // // // }
// // // // // // // import {
// // // // // // //   Copy,
// // // // // // //   Check,
// // // // // // //   Shield,
// // // // // // //   Globe,
// // // // // // //   Mail,
// // // // // // //   AlertCircle,
// // // // // // //   Terminal,
// // // // // // //   Download,
// // // // // // //   FileText,
// // // // // // //   Key,
// // // // // // //   Award,
// // // // // // //   Server,
// // // // // // //   Settings,
// // // // // // //   RefreshCw,
// // // // // // //   CheckCircle,
// // // // // // //   Clock,
// // // // // // //   ExternalLink,
// // // // // // // } from "lucide-react";

// // // // // // // const SSLGenerator: React.FC = () => {
// // // // // // //   const [domain, setDomain] = useState<string>("");
// // // // // // //   const [email, setEmail] = useState<string>("");
// // // // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // // // //     VerificationResult[]
// // // // // // //   >([]);
// // // // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // // // //     null
// // // // // // //   );
// // // // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);

// // // // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // // // //   useEffect(() => {
// // // // // // //     let interval;
// // // // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // // // //     }
// // // // // // //     return () => clearInterval(interval);
// // // // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // // // //   const copyToClipboard = async (
// // // // // // //     text: string,
// // // // // // //     itemId: string
// // // // // // //   ): Promise<void> => {
// // // // // // //     try {
// // // // // // //       const textContent =
// // // // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // // // //       await navigator.clipboard.writeText(textContent);
// // // // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // // // //       setTimeout(() => {
// // // // // // //         setCopiedItems((prev) => {
// // // // // // //           const newSet = new Set(prev);
// // // // // // //           newSet.delete(itemId);
// // // // // // //           return newSet;
// // // // // // //         });
// // // // // // //       }, 2000);
// // // // // // //     } catch (err) {
// // // // // // //       console.error("Copy failed:", err);
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // // // //     const textContent =
// // // // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // // // //     const txtFilename = filename.endsWith(".txt")
// // // // // // //       ? filename
// // // // // // //       : `${filename}.txt`;
// // // // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // // // //     const url = window.URL.createObjectURL(blob);
// // // // // // //     const a = document.createElement("a");
// // // // // // //     a.href = url;
// // // // // // //     a.download = txtFilename;
// // // // // // //     document.body.appendChild(a);
// // // // // // //     a.click();
// // // // // // //     window.URL.revokeObjectURL(url);
// // // // // // //     document.body.removeChild(a);
// // // // // // //   };

// // // // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // // // //     if (!domain || !email) return;

// // // // // // //     setLoading(true);
// // // // // // //     try {
// // // // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // // // //         method: "POST",
// // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // // // //       });

// // // // // // //       const data = await response.json();
// // // // // // //       if (data.success) {
// // // // // // //         setDnsRecords(data.dnsRecords);
// // // // // // //         setStep(2);
// // // // // // //       } else {
// // // // // // //         alert(`Error: ${data.error}`);
// // // // // // //       }
// // // // // // //     } catch (error) {
// // // // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // // // //     } finally {
// // // // // // //       setLoading(false);
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // // // //     if (dnsRecords.length === 0) return;

// // // // // // //     try {
// // // // // // //       const response = await fetch("/api/verify-dns", {
// // // // // // //         method: "POST",
// // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // // // //       });

// // // // // // //       const data = await response.json();
// // // // // // //       setVerificationResults(data.records || []);

// // // // // // //       if (data.verified) {
// // // // // // //         setStep(3);
// // // // // // //         setAutoCheckDns(false);
// // // // // // //       }
// // // // // // //     } catch (error) {
// // // // // // //       console.error("DNS check failed:", error);
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const generateCertificates = async (): Promise<void> => {
// // // // // // //     setLoading(true);
// // // // // // //     try {
// // // // // // //       const response = await fetch("/api/generate-certificates", {
// // // // // // //         method: "POST",
// // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // //         body: JSON.stringify({ domain, dnsRecords }),
// // // // // // //       });

// // // // // // //       const data = await response.json();
// // // // // // //       if (data.success) {
// // // // // // //         setCertificates(data.certificates);
// // // // // // //         setStep(4);
// // // // // // //       } else if (data.dnsUpdateRequired && data.newDnsRecords) {
// // // // // // //         // Let's Encrypt generated new challenge values
// // // // // // //         setDnsRecords(data.newDnsRecords);
// // // // // // //         setStep(2); // Go back to DNS records step
// // // // // // //         setVerificationResults([]); // Clear previous verification
// // // // // // //         alert(
// // // // // // //           `DNS records need to be updated! Let's Encrypt generated new challenge values. Please update your DNS records with the new values shown.`
// // // // // // //         );
// // // // // // //       } else {
// // // // // // //         alert(`Error: ${data.error}`);
// // // // // // //       }
// // // // // // //     } catch (error) {
// // // // // // //       alert("Failed to generate certificates. Please try again.");
// // // // // // //     } finally {
// // // // // // //       setLoading(false);
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const resetForm = (): void => {
// // // // // // //     setStep(1);
// // // // // // //     setDomain("");
// // // // // // //     setEmail("");
// // // // // // //     setIncludeWildcard(false);
// // // // // // //     setDnsRecords([]);
// // // // // // //     setVerificationResults([]);
// // // // // // //     setCertificates(null);
// // // // // // //     setAutoCheckDns(false);
// // // // // // //   };

// // // // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // // // //     text,
// // // // // // //     itemId,
// // // // // // //     className = "",
// // // // // // //   }) => {
// // // // // // //     const isCopied = copiedItems.has(itemId);
// // // // // // //     return (
// // // // // // //       <button
// // // // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // // // //           isCopied
// // // // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // // // //         }`}
// // // // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // // // //       >
// // // // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // // // //       </button>
// // // // // // //     );
// // // // // // //   };

// // // // // // //   return (
// // // // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // // // //       <div className="max-w-6xl mx-auto">
// // // // // // //         {/* Header */}
// // // // // // //         <div className="text-center mb-8">
// // // // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // // // //               SSL Certificate Generator
// // // // // // //             </h1>
// // // // // // //           </div>
// // // // // // //           <p className="text-gray-600">
// // // // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // // // //             guidance
// // // // // // //           </p>
// // // // // // //         </div>

// // // // // // //         {/* Progress Steps */}
// // // // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // // // //           <div className="flex items-center justify-between mb-6">
// // // // // // //             {[
// // // // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // // // //               <div key={num} className="flex items-center">
// // // // // // //                 <div
// // // // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // // // //                     step >= num
// // // // // // //                       ? "bg-blue-600 text-white"
// // // // // // //                       : "bg-gray-200 text-gray-500"
// // // // // // //                   }`}
// // // // // // //                 >
// // // // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // // // //                 </div>
// // // // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // // // //                   {title}
// // // // // // //                 </span>
// // // // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // // // //               </div>
// // // // // // //             ))}
// // // // // // //           </div>
// // // // // // //         </div>

// // // // // // //         {/* Step 1: Domain Information */}
// // // // // // //         {step === 1 && (
// // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // //               Step 1: Enter Domain Information
// // // // // // //             </h3>
// // // // // // //             <div className="space-y-4">
// // // // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // // // //                 <div>
// // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // //                     <Globe size={16} />
// // // // // // //                     Domain Name
// // // // // // //                   </label>
// // // // // // //                   <input
// // // // // // //                     type="text"
// // // // // // //                     value={domain}
// // // // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // // // //                     placeholder="example.com"
// // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // //                     required
// // // // // // //                   />
// // // // // // //                 </div>
// // // // // // //                 <div>
// // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // //                     <Mail size={16} />
// // // // // // //                     Email Address
// // // // // // //                   </label>
// // // // // // //                   <input
// // // // // // //                     type="email"
// // // // // // //                     value={email}
// // // // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // // // //                     placeholder="admin@example.com"
// // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // //                     required
// // // // // // //                   />
// // // // // // //                 </div>
// // // // // // //               </div>
// // // // // // //               <div className="flex items-center gap-2">
// // // // // // //                 <input
// // // // // // //                   type="checkbox"
// // // // // // //                   id="wildcard"
// // // // // // //                   checked={includeWildcard}
// // // // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // //                 />
// // // // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // // // //                 </label>
// // // // // // //               </div>
// // // // // // //               <button
// // // // // // //                 onClick={generateDnsChallenge}
// // // // // // //                 disabled={loading || !domain || !email}
// // // // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // //               >
// // // // // // //                 {loading
// // // // // // //                   ? "Generating DNS Challenge..."
// // // // // // //                   : "Generate DNS Challenge"}
// // // // // // //               </button>
// // // // // // //             </div>
// // // // // // //           </div>
// // // // // // //         )}

// // // // // // //         {/* Step 2: DNS Records */}
// // // // // // //         {step === 2 && (
// // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // // // //             </h3>
// // // // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // // // //               <p className="text-sm text-yellow-800">
// // // // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // // // //                 propagated.
// // // // // // //               </p>
// // // // // // //               <p className="text-xs text-yellow-700 mt-2">
// // // // // // //                 <strong>Note:</strong> Let's Encrypt may generate new challenge
// // // // // // //                 values during certificate generation. If that happens, you'll
// // // // // // //                 need to update these DNS records with the new values.
// // // // // // //               </p>
// // // // // // //             </div>

// // // // // // //             <div className="space-y-4 mb-6">
// // // // // // //               {dnsRecords.map((record, index) => (
// // // // // // //                 <div
// // // // // // //                   key={index}
// // // // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // // // //                 >
// // // // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // // // //                     <div>
// // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // //                         Record Name
// // // // // // //                       </label>
// // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // //                           {record.name}
// // // // // // //                         </code>
// // // // // // //                         <CopyButton
// // // // // // //                           text={record.name}
// // // // // // //                           itemId={`name-${index}`}
// // // // // // //                         />
// // // // // // //                       </div>
// // // // // // //                     </div>
// // // // // // //                     <div>
// // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // //                         Record Type
// // // // // // //                       </label>
// // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // // // //                           TXT
// // // // // // //                         </code>
// // // // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // // // //                       </div>
// // // // // // //                     </div>
// // // // // // //                     <div>
// // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // //                         Record Value
// // // // // // //                       </label>
// // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // //                           {record.value}
// // // // // // //                         </code>
// // // // // // //                         <CopyButton
// // // // // // //                           text={record.value}
// // // // // // //                           itemId={`value-${index}`}
// // // // // // //                         />
// // // // // // //                       </div>
// // // // // // //                     </div>
// // // // // // //                   </div>
// // // // // // //                   {record.placeholder && (
// // // // // // //                     <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
// // // // // // //                       <p className="text-xs text-orange-800">
// // // // // // //                         <strong>Placeholder Value:</strong> This is a
// // // // // // //                         placeholder. Run the server command to get the actual
// // // // // // //                         DNS record value.
// // // // // // //                       </p>
// // // // // // //                     </div>
// // // // // // //                   )}
// // // // // // //                 </div>
// // // // // // //               ))}
// // // // // // //             </div>

// // // // // // //             <div className="flex items-center gap-4 mb-4">
// // // // // // //               <label className="flex items-center gap-2">
// // // // // // //                 <input
// // // // // // //                   type="checkbox"
// // // // // // //                   checked={autoCheckDns}
// // // // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // //                 />
// // // // // // //                 <span className="text-sm text-gray-700">
// // // // // // //                   Auto-check DNS every 30 seconds
// // // // // // //                 </span>
// // // // // // //               </label>
// // // // // // //             </div>

// // // // // // //             <div className="flex gap-4">
// // // // // // //               <button
// // // // // // //                 onClick={checkDnsRecords}
// // // // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // // // //               >
// // // // // // //                 <RefreshCw size={16} />
// // // // // // //                 Check DNS
// // // // // // //               </button>
// // // // // // //               <button
// // // // // // //                 onClick={resetForm}
// // // // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // // // //               >
// // // // // // //                 Start Over
// // // // // // //               </button>
// // // // // // //             </div>

// // // // // // //             {verificationResults.length > 0 && (
// // // // // // //               <div className="mt-6">
// // // // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // // // //                   DNS Verification Results:
// // // // // // //                 </h4>
// // // // // // //                 <div className="space-y-2">
// // // // // // //                   {verificationResults.map((result, index) => (
// // // // // // //                     <div
// // // // // // //                       key={index}
// // // // // // //                       className={`p-3 rounded border ${
// // // // // // //                         result.verified
// // // // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // // // //                       }`}
// // // // // // //                     >
// // // // // // //                       <div className="flex items-center gap-2">
// // // // // // //                         {result.verified ? (
// // // // // // //                           <CheckCircle size={16} />
// // // // // // //                         ) : (
// // // // // // //                           <Clock size={16} />
// // // // // // //                         )}
// // // // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // // // //                         <span className="text-xs">
// // // // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // // // //                         </span>
// // // // // // //                       </div>
// // // // // // //                       {result.error && (
// // // // // // //                         <p className="text-xs mt-1">{result.error}</p>
// // // // // // //                       )}
// // // // // // //                     </div>
// // // // // // //                   ))}
// // // // // // //                 </div>

// // // // // // //                 {verificationResults.every((r) => r.verified) && (
// // // // // // //                   <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
// // // // // // //                     <p className="text-sm text-green-800">
// // // // // // //                       <strong>All DNS records verified!</strong> You can now
// // // // // // //                       proceed to certificate generation.
// // // // // // //                     </p>
// // // // // // //                   </div>
// // // // // // //                 )}
// // // // // // //               </div>
// // // // // // //             )}
// // // // // // //           </div>
// // // // // // //         )}

// // // // // // //         {/* Step 3: Verification Complete */}
// // // // // // //         {step === 3 && (
// // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // //               Step 3: DNS Verified - Generate Certificates
// // // // // // //             </h3>
// // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // //               <p className="text-sm text-green-800">
// // // // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // // // //                 You can now generate your SSL certificates.
// // // // // // //               </p>
// // // // // // //             </div>
// // // // // // //             <button
// // // // // // //               onClick={generateCertificates}
// // // // // // //               disabled={loading}
// // // // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // //             >
// // // // // // //               {loading
// // // // // // //                 ? "Generating Certificates..."
// // // // // // //                 : "Generate SSL Certificates"}
// // // // // // //             </button>
// // // // // // //           </div>
// // // // // // //         )}

// // // // // // //         {/* Step 4: Certificates */}
// // // // // // //         {step === 4 && certificates && (
// // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // //               Step 4: Your SSL Certificates for {domain}
// // // // // // //             </h3>
// // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // //               <p className="text-sm text-green-800">
// // // // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // // // //                 your certificate files below.
// // // // // // //               </p>
// // // // // // //             </div>

// // // // // // //             <div className="grid gap-4">
// // // // // // //               {[
// // // // // // //                 {
// // // // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // // // //                   title: "Full Chain Certificate",
// // // // // // //                   desc: "Use for most hosting control panels",
// // // // // // //                 },
// // // // // // //                 {
// // // // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // // // //                   title: "Private Key",
// // // // // // //                   desc: "Keep this secure and private",
// // // // // // //                 },
// // // // // // //                 {
// // // // // // //                   key: "cert" as keyof CertificateFiles,
// // // // // // //                   title: "Certificate Only",
// // // // // // //                   desc: "Your domain certificate",
// // // // // // //                 },
// // // // // // //                 {
// // // // // // //                   key: "chain" as keyof CertificateFiles,
// // // // // // //                   title: "Certificate Chain",
// // // // // // //                   desc: "Intermediate certificates",
// // // // // // //                 },
// // // // // // //               ].map(({ key, title, desc }) =>
// // // // // // //                 certificates && certificates[key] ? (
// // // // // // //                   <div
// // // // // // //                     key={key}
// // // // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // // // //                   >
// // // // // // //                     <div className="flex items-center justify-between mb-2">
// // // // // // //                       <div>
// // // // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // // // //                       </div>
// // // // // // //                       <div className="flex gap-2">
// // // // // // //                         <CopyButton
// // // // // // //                           text={certificates[key] || ""}
// // // // // // //                           itemId={key}
// // // // // // //                         />
// // // // // // //                         <button
// // // // // // //                           onClick={() =>
// // // // // // //                             downloadAsTextFile(
// // // // // // //                               certificates[key] || "",
// // // // // // //                               `${domain}_${key}.txt`
// // // // // // //                             )
// // // // // // //                           }
// // // // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // // // //                         >
// // // // // // //                           <Download size={12} />
// // // // // // //                           Download
// // // // // // //                         </button>
// // // // // // //                       </div>
// // // // // // //                     </div>
// // // // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // // // //                       </pre>
// // // // // // //                     </div>
// // // // // // //                   </div>
// // // // // // //                 ) : null
// // // // // // //               )}
// // // // // // //             </div>

// // // // // // //             <button
// // // // // // //               onClick={resetForm}
// // // // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // // // //             >
// // // // // // //               Generate Another Certificate
// // // // // // //             </button>
// // // // // // //           </div>
// // // // // // //         )}
// // // // // // //       </div>
// // // // // // //     </div>
// // // // // // //   );
// // // // // // // };

// // // // // // // export default SSLGenerator;

// // // // // // // // "use client";
// // // // // // // // import React, { useState, useEffect } from "react";

// // // // // // // // // Type definitions
// // // // // // // // interface DnsRecord {
// // // // // // // //   name: string;
// // // // // // // //   type: string;
// // // // // // // //   value: string;
// // // // // // // //   domain: string;
// // // // // // // //   placeholder?: boolean;
// // // // // // // // }

// // // // // // // // interface VerificationResult extends DnsRecord {
// // // // // // // //   verified: boolean;
// // // // // // // //   currentValues: string[];
// // // // // // // //   error?: string;
// // // // // // // // }

// // // // // // // // interface CertificateFiles {
// // // // // // // //   fullchain?: string;
// // // // // // // //   privkey?: string;
// // // // // // // //   cert?: string;
// // // // // // // //   chain?: string;
// // // // // // // // }

// // // // // // // // interface CopyButtonProps {
// // // // // // // //   text: string;
// // // // // // // //   itemId: string;
// // // // // // // //   className?: string;
// // // // // // // // }
// // // // // // // // import {
// // // // // // // //   Copy,
// // // // // // // //   Check,
// // // // // // // //   Shield,
// // // // // // // //   Globe,
// // // // // // // //   Mail,
// // // // // // // //   AlertCircle,
// // // // // // // //   Terminal,
// // // // // // // //   Download,
// // // // // // // //   FileText,
// // // // // // // //   Key,
// // // // // // // //   Award,
// // // // // // // //   Server,
// // // // // // // //   Settings,
// // // // // // // //   RefreshCw,
// // // // // // // //   CheckCircle,
// // // // // // // //   Clock,
// // // // // // // //   ExternalLink,
// // // // // // // // } from "lucide-react";

// // // // // // // // const SSLGenerator: React.FC = () => {
// // // // // // // //   const [domain, setDomain] = useState<string>("");
// // // // // // // //   const [email, setEmail] = useState<string>("");
// // // // // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // // // // //     VerificationResult[]
// // // // // // // //   >([]);
// // // // // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // // // // //     null
// // // // // // // //   );
// // // // // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);

// // // // // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // // // // //   useEffect(() => {
// // // // // // // //     let interval;
// // // // // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // // // // //     }
// // // // // // // //     return () => clearInterval(interval);
// // // // // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // // // // //   const copyToClipboard = async (
// // // // // // // //     text: string,
// // // // // // // //     itemId: string
// // // // // // // //   ): Promise<void> => {
// // // // // // // //     try {
// // // // // // // //       const textContent =
// // // // // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // // // // //       await navigator.clipboard.writeText(textContent);
// // // // // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // // // // //       setTimeout(() => {
// // // // // // // //         setCopiedItems((prev) => {
// // // // // // // //           const newSet = new Set(prev);
// // // // // // // //           newSet.delete(itemId);
// // // // // // // //           return newSet;
// // // // // // // //         });
// // // // // // // //       }, 2000);
// // // // // // // //     } catch (err) {
// // // // // // // //       console.error("Copy failed:", err);
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // // // // //     const textContent =
// // // // // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // // // // //     const txtFilename = filename.endsWith(".txt")
// // // // // // // //       ? filename
// // // // // // // //       : `${filename}.txt`;
// // // // // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // // // // //     const url = window.URL.createObjectURL(blob);
// // // // // // // //     const a = document.createElement("a");
// // // // // // // //     a.href = url;
// // // // // // // //     a.download = txtFilename;
// // // // // // // //     document.body.appendChild(a);
// // // // // // // //     a.click();
// // // // // // // //     window.URL.revokeObjectURL(url);
// // // // // // // //     document.body.removeChild(a);
// // // // // // // //   };

// // // // // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // // // // //     if (!domain || !email) return;

// // // // // // // //     setLoading(true);
// // // // // // // //     try {
// // // // // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // // // // //         method: "POST",
// // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // // // // //       });

// // // // // // // //       const data = await response.json();
// // // // // // // //       if (data.success) {
// // // // // // // //         setDnsRecords(data.dnsRecords);
// // // // // // // //         setStep(2);
// // // // // // // //       } else {
// // // // // // // //         alert(`Error: ${data.error}`);
// // // // // // // //       }
// // // // // // // //     } catch (error) {
// // // // // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // // // // //     } finally {
// // // // // // // //       setLoading(false);
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // // // // //     if (dnsRecords.length === 0) return;

// // // // // // // //     try {
// // // // // // // //       const response = await fetch("/api/verify-dns", {
// // // // // // // //         method: "POST",
// // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // // // // //       });

// // // // // // // //       const data = await response.json();
// // // // // // // //       setVerificationResults(data.records || []);

// // // // // // // //       if (data.verified) {
// // // // // // // //         setStep(3);
// // // // // // // //         setAutoCheckDns(false);
// // // // // // // //       }
// // // // // // // //     } catch (error) {
// // // // // // // //       console.error("DNS check failed:", error);
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const generateCertificates = async (): Promise<void> => {
// // // // // // // //     setLoading(true);
// // // // // // // //     try {
// // // // // // // //       const response = await fetch("/api/generate-certificates", {
// // // // // // // //         method: "POST",
// // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // //         body: JSON.stringify({ domain, dnsRecords }),
// // // // // // // //       });

// // // // // // // //       const data = await response.json();
// // // // // // // //       if (data.success) {
// // // // // // // //         setCertificates(data.certificates);
// // // // // // // //         setStep(4);
// // // // // // // //       } else if (data.dnsUpdateRequired && data.newDnsRecords) {
// // // // // // // //         // Let's Encrypt generated new challenge values
// // // // // // // //         setDnsRecords(data.newDnsRecords);
// // // // // // // //         setStep(2); // Go back to DNS records step
// // // // // // // //         setVerificationResults([]); // Clear previous verification
// // // // // // // //         alert(
// // // // // // // //           `DNS records need to be updated! Let's Encrypt generated new challenge values. Please update your DNS records with the new values shown.`
// // // // // // // //         );
// // // // // // // //       } else {
// // // // // // // //         alert(`Error: ${data.error}`);
// // // // // // // //       }
// // // // // // // //     } catch (error) {
// // // // // // // //       alert("Failed to generate certificates. Please try again.");
// // // // // // // //     } finally {
// // // // // // // //       setLoading(false);
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const resetForm = (): void => {
// // // // // // // //     setStep(1);
// // // // // // // //     setDomain("");
// // // // // // // //     setEmail("");
// // // // // // // //     setIncludeWildcard(false);
// // // // // // // //     setDnsRecords([]);
// // // // // // // //     setVerificationResults([]);
// // // // // // // //     setCertificates(null);
// // // // // // // //     setAutoCheckDns(false);
// // // // // // // //   };

// // // // // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // // // // //     text,
// // // // // // // //     itemId,
// // // // // // // //     className = "",
// // // // // // // //   }) => {
// // // // // // // //     const isCopied = copiedItems.has(itemId);
// // // // // // // //     return (
// // // // // // // //       <button
// // // // // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // // // // //           isCopied
// // // // // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // // // // //         }`}
// // // // // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // // // // //       >
// // // // // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // // // // //       </button>
// // // // // // // //     );
// // // // // // // //   };

// // // // // // // //   return (
// // // // // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // // // // //       <div className="max-w-6xl mx-auto">
// // // // // // // //         {/* Header */}
// // // // // // // //         <div className="text-center mb-8">
// // // // // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // // // // //               SSL Certificate Generator
// // // // // // // //             </h1>
// // // // // // // //           </div>
// // // // // // // //           <p className="text-gray-600">
// // // // // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // // // // //             guidance
// // // // // // // //           </p>
// // // // // // // //         </div>

// // // // // // // //         {/* Progress Steps */}
// // // // // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // // // // //           <div className="flex items-center justify-between mb-6">
// // // // // // // //             {[
// // // // // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // // // // //               <div key={num} className="flex items-center">
// // // // // // // //                 <div
// // // // // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // // // // //                     step >= num
// // // // // // // //                       ? "bg-blue-600 text-white"
// // // // // // // //                       : "bg-gray-200 text-gray-500"
// // // // // // // //                   }`}
// // // // // // // //                 >
// // // // // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // // // // //                 </div>
// // // // // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // // // // //                   {title}
// // // // // // // //                 </span>
// // // // // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // // // // //               </div>
// // // // // // // //             ))}
// // // // // // // //           </div>
// // // // // // // //         </div>

// // // // // // // //         {/* Step 1: Domain Information */}
// // // // // // // //         {step === 1 && (
// // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // //               Step 1: Enter Domain Information
// // // // // // // //             </h3>
// // // // // // // //             <div className="space-y-4">
// // // // // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // // // // //                 <div>
// // // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // // //                     <Globe size={16} />
// // // // // // // //                     Domain Name
// // // // // // // //                   </label>
// // // // // // // //                   <input
// // // // // // // //                     type="text"
// // // // // // // //                     value={domain}
// // // // // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // // // // //                     placeholder="example.com"
// // // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // // //                     required
// // // // // // // //                   />
// // // // // // // //                 </div>
// // // // // // // //                 <div>
// // // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // // //                     <Mail size={16} />
// // // // // // // //                     Email Address
// // // // // // // //                   </label>
// // // // // // // //                   <input
// // // // // // // //                     type="email"
// // // // // // // //                     value={email}
// // // // // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // // // // //                     placeholder="admin@example.com"
// // // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // // //                     required
// // // // // // // //                   />
// // // // // // // //                 </div>
// // // // // // // //               </div>
// // // // // // // //               <div className="flex items-center gap-2">
// // // // // // // //                 <input
// // // // // // // //                   type="checkbox"
// // // // // // // //                   id="wildcard"
// // // // // // // //                   checked={includeWildcard}
// // // // // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // // //                 />
// // // // // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // // // // //                 </label>
// // // // // // // //               </div>
// // // // // // // //               <button
// // // // // // // //                 onClick={generateDnsChallenge}
// // // // // // // //                 disabled={loading || !domain || !email}
// // // // // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // // //               >
// // // // // // // //                 {loading
// // // // // // // //                   ? "Generating DNS Challenge..."
// // // // // // // //                   : "Generate DNS Challenge"}
// // // // // // // //               </button>
// // // // // // // //             </div>
// // // // // // // //           </div>
// // // // // // // //         )}

// // // // // // // //         {/* Step 2: DNS Records */}
// // // // // // // //         {step === 2 && (
// // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // // // // //             </h3>
// // // // // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // // // // //               <p className="text-sm text-yellow-800">
// // // // // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // // // // //                 propagated.
// // // // // // // //               </p>
// // // // // // // //               <p className="text-xs text-yellow-700 mt-2">
// // // // // // // //                 <strong>Note:</strong> Let's Encrypt may generate new challenge
// // // // // // // //                 values during certificate generation. If that happens, you'll
// // // // // // // //                 need to update these DNS records with the new values.
// // // // // // // //               </p>
// // // // // // // //             </div>

// // // // // // // //             <div className="space-y-4 mb-6">
// // // // // // // //               {dnsRecords.map((record, index) => (
// // // // // // // //                 <div
// // // // // // // //                   key={index}
// // // // // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // // // // //                 >
// // // // // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // // // // //                     <div>
// // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // //                         Record Name
// // // // // // // //                       </label>
// // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // // //                           {record.name}
// // // // // // // //                         </code>
// // // // // // // //                         <CopyButton
// // // // // // // //                           text={record.name}
// // // // // // // //                           itemId={`name-${index}`}
// // // // // // // //                         />
// // // // // // // //                       </div>
// // // // // // // //                     </div>
// // // // // // // //                     <div>
// // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // //                         Record Type
// // // // // // // //                       </label>
// // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // // // // //                           TXT
// // // // // // // //                         </code>
// // // // // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // // // // //                       </div>
// // // // // // // //                     </div>
// // // // // // // //                     <div>
// // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // //                         Record Value
// // // // // // // //                       </label>
// // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // // //                           {record.value}
// // // // // // // //                         </code>
// // // // // // // //                         <CopyButton
// // // // // // // //                           text={record.value}
// // // // // // // //                           itemId={`value-${index}`}
// // // // // // // //                         />
// // // // // // // //                       </div>
// // // // // // // //                     </div>
// // // // // // // //                   </div>
// // // // // // // //                   {record.placeholder && (
// // // // // // // //                     <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded">
// // // // // // // //                       <p className="text-xs text-orange-800">
// // // // // // // //                         <strong>Placeholder Value:</strong> This is a
// // // // // // // //                         placeholder. Run the server command to get the actual
// // // // // // // //                         DNS record value.
// // // // // // // //                       </p>
// // // // // // // //                     </div>
// // // // // // // //                   )}
// // // // // // // //                 </div>
// // // // // // // //               ))}
// // // // // // // //             </div>

// // // // // // // //             <div className="flex items-center gap-4 mb-4">
// // // // // // // //               <label className="flex items-center gap-2">
// // // // // // // //                 <input
// // // // // // // //                   type="checkbox"
// // // // // // // //                   checked={autoCheckDns}
// // // // // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // // //                 />
// // // // // // // //                 <span className="text-sm text-gray-700">
// // // // // // // //                   Auto-check DNS every 30 seconds
// // // // // // // //                 </span>
// // // // // // // //               </label>
// // // // // // // //             </div>

// // // // // // // //             <div className="flex gap-4">
// // // // // // // //               <button
// // // // // // // //                 onClick={checkDnsRecords}
// // // // // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // // // // //               >
// // // // // // // //                 <RefreshCw size={16} />
// // // // // // // //                 Check DNS
// // // // // // // //               </button>
// // // // // // // //               <button
// // // // // // // //                 onClick={resetForm}
// // // // // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // // // // //               >
// // // // // // // //                 Start Over
// // // // // // // //               </button>
// // // // // // // //             </div>

// // // // // // // //             {verificationResults.length > 0 && (
// // // // // // // //               <div className="mt-6">
// // // // // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // // // // //                   DNS Verification Results:
// // // // // // // //                 </h4>
// // // // // // // //                 <div className="space-y-2">
// // // // // // // //                   {verificationResults.map((result, index) => (
// // // // // // // //                     <div
// // // // // // // //                       key={index}
// // // // // // // //                       className={`p-3 rounded border ${
// // // // // // // //                         result.verified
// // // // // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // // // // //                       }`}
// // // // // // // //                     >
// // // // // // // //                       <div className="flex items-center gap-2">
// // // // // // // //                         {result.verified ? (
// // // // // // // //                           <CheckCircle size={16} />
// // // // // // // //                         ) : (
// // // // // // // //                           <Clock size={16} />
// // // // // // // //                         )}
// // // // // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // // // // //                         <span className="text-xs">
// // // // // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // // // // //                         </span>
// // // // // // // //                       </div>
// // // // // // // //                       {result.error && (
// // // // // // // //                         <p className="text-xs mt-1">{result.error}</p>
// // // // // // // //                       )}
// // // // // // // //                     </div>
// // // // // // // //                   ))}
// // // // // // // //                 </div>

// // // // // // // //                 {verificationResults.every((r) => r.verified) && (
// // // // // // // //                   <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
// // // // // // // //                     <p className="text-sm text-green-800">
// // // // // // // //                       <strong>All DNS records verified!</strong> You can now
// // // // // // // //                       proceed to certificate generation.
// // // // // // // //                     </p>
// // // // // // // //                   </div>
// // // // // // // //                 )}
// // // // // // // //               </div>
// // // // // // // //             )}
// // // // // // // //           </div>
// // // // // // // //         )}

// // // // // // // //         {/* Step 3: Verification Complete */}
// // // // // // // //         {step === 3 && (
// // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // //               Step 3: DNS Verified - Generate Certificates
// // // // // // // //             </h3>
// // // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // // //               <p className="text-sm text-green-800">
// // // // // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // // // // //                 You can now generate your SSL certificates.
// // // // // // // //               </p>
// // // // // // // //             </div>
// // // // // // // //             <button
// // // // // // // //               onClick={generateCertificates}
// // // // // // // //               disabled={loading}
// // // // // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // // //             >
// // // // // // // //               {loading
// // // // // // // //                 ? "Generating Certificates..."
// // // // // // // //                 : "Generate SSL Certificates"}
// // // // // // // //             </button>
// // // // // // // //           </div>
// // // // // // // //         )}

// // // // // // // //         {/* Step 4: Certificates */}
// // // // // // // //         {step === 4 && certificates && (
// // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // //               Step 4: Your SSL Certificates for {domain}
// // // // // // // //             </h3>
// // // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // // //               <p className="text-sm text-green-800">
// // // // // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // // // // //                 your certificate files below.
// // // // // // // //               </p>
// // // // // // // //             </div>

// // // // // // // //             <div className="grid gap-4">
// // // // // // // //               {[
// // // // // // // //                 {
// // // // // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // // // // //                   title: "Full Chain Certificate",
// // // // // // // //                   desc: "Use for most hosting control panels",
// // // // // // // //                 },
// // // // // // // //                 {
// // // // // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // // // // //                   title: "Private Key",
// // // // // // // //                   desc: "Keep this secure and private",
// // // // // // // //                 },
// // // // // // // //                 {
// // // // // // // //                   key: "cert" as keyof CertificateFiles,
// // // // // // // //                   title: "Certificate Only",
// // // // // // // //                   desc: "Your domain certificate",
// // // // // // // //                 },
// // // // // // // //                 {
// // // // // // // //                   key: "chain" as keyof CertificateFiles,
// // // // // // // //                   title: "Certificate Chain",
// // // // // // // //                   desc: "Intermediate certificates",
// // // // // // // //                 },
// // // // // // // //               ].map(({ key, title, desc }) =>
// // // // // // // //                 certificates && certificates[key] ? (
// // // // // // // //                   <div
// // // // // // // //                     key={key}
// // // // // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // // // // //                   >
// // // // // // // //                     <div className="flex items-center justify-between mb-2">
// // // // // // // //                       <div>
// // // // // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // // // // //                       </div>
// // // // // // // //                       <div className="flex gap-2">
// // // // // // // //                         <CopyButton
// // // // // // // //                           text={certificates[key] || ""}
// // // // // // // //                           itemId={key}
// // // // // // // //                         />
// // // // // // // //                         <button
// // // // // // // //                           onClick={() =>
// // // // // // // //                             downloadAsTextFile(
// // // // // // // //                               certificates[key] || "",
// // // // // // // //                               `${domain}_${key}.txt`
// // // // // // // //                             )
// // // // // // // //                           }
// // // // // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // // // // //                         >
// // // // // // // //                           <Download size={12} />
// // // // // // // //                           Download
// // // // // // // //                         </button>
// // // // // // // //                       </div>
// // // // // // // //                     </div>
// // // // // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // // // // //                       </pre>
// // // // // // // //                     </div>
// // // // // // // //                   </div>
// // // // // // // //                 ) : null
// // // // // // // //               )}
// // // // // // // //             </div>

// // // // // // // //             <button
// // // // // // // //               onClick={resetForm}
// // // // // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // // // // //             >
// // // // // // // //               Generate Another Certificate
// // // // // // // //             </button>
// // // // // // // //           </div>
// // // // // // // //         )}
// // // // // // // //       </div>
// // // // // // // //     </div>
// // // // // // // //   );
// // // // // // // // };

// // // // // // // // export default SSLGenerator;

// // // // // // // // // "use client";

// // // // // // // // // "use client";
// // // // // // // // // import React, { useState, useEffect } from "react";

// // // // // // // // // // Type definitions
// // // // // // // // // interface DnsRecord {
// // // // // // // // //   name: string;
// // // // // // // // //   type: string;
// // // // // // // // //   value: string;
// // // // // // // // //   domain: string;
// // // // // // // // //   placeholder?: boolean;
// // // // // // // // // }

// // // // // // // // // interface VerificationResult extends DnsRecord {
// // // // // // // // //   verified: boolean;
// // // // // // // // //   currentValues: string[];
// // // // // // // // //   error?: string;
// // // // // // // // // }

// // // // // // // // // interface CertificateFiles {
// // // // // // // // //   fullchain?: string;
// // // // // // // // //   privkey?: string;
// // // // // // // // //   cert?: string;
// // // // // // // // //   chain?: string;
// // // // // // // // // }

// // // // // // // // // interface CopyButtonProps {
// // // // // // // // //   text: string;
// // // // // // // // //   itemId: string;
// // // // // // // // //   className?: string;
// // // // // // // // // }
// // // // // // // // // import {
// // // // // // // // //   Copy,
// // // // // // // // //   Check,
// // // // // // // // //   Shield,
// // // // // // // // //   Globe,
// // // // // // // // //   Mail,
// // // // // // // // //   AlertCircle,
// // // // // // // // //   Terminal,
// // // // // // // // //   Download,
// // // // // // // // //   FileText,
// // // // // // // // //   Key,
// // // // // // // // //   Award,
// // // // // // // // //   Server,
// // // // // // // // //   Settings,
// // // // // // // // //   RefreshCw,
// // // // // // // // //   CheckCircle,
// // // // // // // // //   Clock,
// // // // // // // // //   ExternalLink,
// // // // // // // // // } from "lucide-react";

// // // // // // // // // const SSLGenerator: React.FC = () => {
// // // // // // // // //   const [domain, setDomain] = useState<string>("");
// // // // // // // // //   const [email, setEmail] = useState<string>("");
// // // // // // // // //   const [includeWildcard, setIncludeWildcard] = useState<boolean>(false);
// // // // // // // // //   const [loading, setLoading] = useState<boolean>(false);
// // // // // // // // //   const [step, setStep] = useState<number>(1); // 1: Input, 2: DNS Records, 3: Verification, 4: Certificates
// // // // // // // // //   const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
// // // // // // // // //   const [verificationResults, setVerificationResults] = useState<
// // // // // // // // //     VerificationResult[]
// // // // // // // // //   >([]);
// // // // // // // // //   const [certificates, setCertificates] = useState<CertificateFiles | null>(
// // // // // // // // //     null
// // // // // // // // //   );
// // // // // // // // //   const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
// // // // // // // // //   const [autoCheckDns, setAutoCheckDns] = useState<boolean>(false);

// // // // // // // // //   // Auto-check DNS every 30 seconds when enabled
// // // // // // // // //   useEffect(() => {
// // // // // // // // //     let interval;
// // // // // // // // //     if (autoCheckDns && dnsRecords.length > 0 && step === 2) {
// // // // // // // // //       interval = setInterval(checkDnsRecords, 30000);
// // // // // // // // //     }
// // // // // // // // //     return () => clearInterval(interval);
// // // // // // // // //   }, [autoCheckDns, dnsRecords, step]);

// // // // // // // // //   const copyToClipboard = async (
// // // // // // // // //     text: string,
// // // // // // // // //     itemId: string
// // // // // // // // //   ): Promise<void> => {
// // // // // // // // //     try {
// // // // // // // // //       const textContent =
// // // // // // // // //         typeof text === "string" ? text.trim() : String(text).trim();
// // // // // // // // //       await navigator.clipboard.writeText(textContent);
// // // // // // // // //       setCopiedItems((prev) => new Set([...prev, itemId]));
// // // // // // // // //       setTimeout(() => {
// // // // // // // // //         setCopiedItems((prev) => {
// // // // // // // // //           const newSet = new Set(prev);
// // // // // // // // //           newSet.delete(itemId);
// // // // // // // // //           return newSet;
// // // // // // // // //         });
// // // // // // // // //       }, 2000);
// // // // // // // // //     } catch (err) {
// // // // // // // // //       console.error("Copy failed:", err);
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const downloadAsTextFile = (content: string, filename: string): void => {
// // // // // // // // //     const textContent =
// // // // // // // // //       typeof content === "string" ? content.trim() : String(content).trim();
// // // // // // // // //     const txtFilename = filename.endsWith(".txt")
// // // // // // // // //       ? filename
// // // // // // // // //       : `${filename}.txt`;
// // // // // // // // //     const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
// // // // // // // // //     const url = window.URL.createObjectURL(blob);
// // // // // // // // //     const a = document.createElement("a");
// // // // // // // // //     a.href = url;
// // // // // // // // //     a.download = txtFilename;
// // // // // // // // //     document.body.appendChild(a);
// // // // // // // // //     a.click();
// // // // // // // // //     window.URL.revokeObjectURL(url);
// // // // // // // // //     document.body.removeChild(a);
// // // // // // // // //   };

// // // // // // // // //   const generateDnsChallenge = async (): Promise<void> => {
// // // // // // // // //     if (!domain || !email) return;

// // // // // // // // //     setLoading(true);
// // // // // // // // //     try {
// // // // // // // // //       const response = await fetch("/api/generate-dns-challenge", {
// // // // // // // // //         method: "POST",
// // // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // // //         body: JSON.stringify({ domain, email, includeWildcard }),
// // // // // // // // //       });

// // // // // // // // //       const data = await response.json();
// // // // // // // // //       if (data.success) {
// // // // // // // // //         setDnsRecords(data.dnsRecords);
// // // // // // // // //         setStep(2);
// // // // // // // // //       } else {
// // // // // // // // //         alert(`Error: ${data.error}`);
// // // // // // // // //       }
// // // // // // // // //     } catch (error) {
// // // // // // // // //       alert("Failed to generate DNS challenge. Please try again.");
// // // // // // // // //     } finally {
// // // // // // // // //       setLoading(false);
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const checkDnsRecords = async (): Promise<void> => {
// // // // // // // // //     if (dnsRecords.length === 0) return;

// // // // // // // // //     try {
// // // // // // // // //       const response = await fetch("/api/verify-dns", {
// // // // // // // // //         method: "POST",
// // // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // // //         body: JSON.stringify({ records: dnsRecords }),
// // // // // // // // //       });

// // // // // // // // //       const data = await response.json();
// // // // // // // // //       setVerificationResults(data.records || []);

// // // // // // // // //       if (data.verified) {
// // // // // // // // //         setStep(3);
// // // // // // // // //         setAutoCheckDns(false);
// // // // // // // // //       }
// // // // // // // // //     } catch (error) {
// // // // // // // // //       console.error("DNS check failed:", error);
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const generateCertificates = async (): Promise<void> => {
// // // // // // // // //     setLoading(true);
// // // // // // // // //     try {
// // // // // // // // //       const response = await fetch("/api/generate-certificates", {
// // // // // // // // //         method: "POST",
// // // // // // // // //         headers: { "Content-Type": "application/json" },
// // // // // // // // //         body: JSON.stringify({ domain, dnsRecords }),
// // // // // // // // //       });

// // // // // // // // //       const data = await response.json();
// // // // // // // // //       if (data.success) {
// // // // // // // // //         setCertificates(data.certificates);
// // // // // // // // //         setStep(4);
// // // // // // // // //       } else {
// // // // // // // // //         alert(`Error: ${data.error}`);
// // // // // // // // //       }
// // // // // // // // //     } catch (error) {
// // // // // // // // //       alert("Failed to generate certificates. Please try again.");
// // // // // // // // //     } finally {
// // // // // // // // //       setLoading(false);
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const resetForm = (): void => {
// // // // // // // // //     setStep(1);
// // // // // // // // //     setDomain("");
// // // // // // // // //     setEmail("");
// // // // // // // // //     setIncludeWildcard(false);
// // // // // // // // //     setDnsRecords([]);
// // // // // // // // //     setVerificationResults([]);
// // // // // // // // //     setCertificates(null);
// // // // // // // // //     setAutoCheckDns(false);
// // // // // // // // //   };

// // // // // // // // //   const CopyButton: React.FC<CopyButtonProps> = ({
// // // // // // // // //     text,
// // // // // // // // //     itemId,
// // // // // // // // //     className = "",
// // // // // // // // //   }) => {
// // // // // // // // //     const isCopied = copiedItems.has(itemId);
// // // // // // // // //     return (
// // // // // // // // //       <button
// // // // // // // // //         onClick={() => copyToClipboard(text, itemId)}
// // // // // // // // //         className={`inline-flex items-center gap-1 px-3 py-1 text-sm rounded transition-colors ${className} ${
// // // // // // // // //           isCopied
// // // // // // // // //             ? "bg-green-100 text-green-700 border border-green-300"
// // // // // // // // //             : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300"
// // // // // // // // //         }`}
// // // // // // // // //         title={isCopied ? "Copied!" : "Copy to clipboard"}
// // // // // // // // //       >
// // // // // // // // //         {isCopied ? <Check size={14} /> : <Copy size={14} />}
// // // // // // // // //         {isCopied ? "Copied!" : "Copy"}
// // // // // // // // //       </button>
// // // // // // // // //     );
// // // // // // // // //   };

// // // // // // // // //   return (
// // // // // // // // //     <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
// // // // // // // // //       <div className="max-w-6xl mx-auto">
// // // // // // // // //         {/* Header */}
// // // // // // // // //         <div className="text-center mb-8">
// // // // // // // // //           <div className="flex items-center justify-center gap-2 mb-4">
// // // // // // // // //             <Shield className="w-8 h-8 text-blue-600" />
// // // // // // // // //             <h1 className="text-3xl font-bold text-gray-900">
// // // // // // // // //               SSL Certificate Generator
// // // // // // // // //             </h1>
// // // // // // // // //           </div>
// // // // // // // // //           <p className="text-gray-600">
// // // // // // // // //             Generate free SSL certificates for any domain with step-by-step
// // // // // // // // //             guidance
// // // // // // // // //           </p>
// // // // // // // // //         </div>

// // // // // // // // //         {/* Progress Steps */}
// // // // // // // // //         <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
// // // // // // // // //           <div className="flex items-center justify-between mb-6">
// // // // // // // // //             {[
// // // // // // // // //               { num: 1, title: "Domain Info", icon: Globe },
// // // // // // // // //               { num: 2, title: "DNS Records", icon: Settings },
// // // // // // // // //               { num: 3, title: "Verification", icon: CheckCircle },
// // // // // // // // //               { num: 4, title: "Certificates", icon: Award },
// // // // // // // // //             ].map(({ num, title, icon: Icon }) => (
// // // // // // // // //               <div key={num} className="flex items-center">
// // // // // // // // //                 <div
// // // // // // // // //                   className={`flex items-center justify-center w-10 h-10 rounded-full ${
// // // // // // // // //                     step >= num
// // // // // // // // //                       ? "bg-blue-600 text-white"
// // // // // // // // //                       : "bg-gray-200 text-gray-500"
// // // // // // // // //                   }`}
// // // // // // // // //                 >
// // // // // // // // //                   {step > num ? <Check size={20} /> : <Icon size={20} />}
// // // // // // // // //                 </div>
// // // // // // // // //                 <span className="ml-2 text-sm font-medium text-gray-700">
// // // // // // // // //                   {title}
// // // // // // // // //                 </span>
// // // // // // // // //                 {num < 4 && <div className="w-8 h-0.5 bg-gray-300 ml-4" />}
// // // // // // // // //               </div>
// // // // // // // // //             ))}
// // // // // // // // //           </div>
// // // // // // // // //         </div>

// // // // // // // // //         {/* Step 1: Domain Information */}
// // // // // // // // //         {step === 1 && (
// // // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // // //               Step 1: Enter Domain Information
// // // // // // // // //             </h3>
// // // // // // // // //             <div className="space-y-4">
// // // // // // // // //               <div className="grid md:grid-cols-2 gap-4">
// // // // // // // // //                 <div>
// // // // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // // // //                     <Globe size={16} />
// // // // // // // // //                     Domain Name
// // // // // // // // //                   </label>
// // // // // // // // //                   <input
// // // // // // // // //                     type="text"
// // // // // // // // //                     value={domain}
// // // // // // // // //                     onChange={(e) => setDomain(e.target.value)}
// // // // // // // // //                     placeholder="example.com"
// // // // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // // // //                     required
// // // // // // // // //                   />
// // // // // // // // //                 </div>
// // // // // // // // //                 <div>
// // // // // // // // //                   <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
// // // // // // // // //                     <Mail size={16} />
// // // // // // // // //                     Email Address
// // // // // // // // //                   </label>
// // // // // // // // //                   <input
// // // // // // // // //                     type="email"
// // // // // // // // //                     value={email}
// // // // // // // // //                     onChange={(e) => setEmail(e.target.value)}
// // // // // // // // //                     placeholder="admin@example.com"
// // // // // // // // //                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
// // // // // // // // //                     required
// // // // // // // // //                   />
// // // // // // // // //                 </div>
// // // // // // // // //               </div>
// // // // // // // // //               <div className="flex items-center gap-2">
// // // // // // // // //                 <input
// // // // // // // // //                   type="checkbox"
// // // // // // // // //                   id="wildcard"
// // // // // // // // //                   checked={includeWildcard}
// // // // // // // // //                   onChange={(e) => setIncludeWildcard(e.target.checked)}
// // // // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // // // //                 />
// // // // // // // // //                 <label htmlFor="wildcard" className="text-sm text-gray-700">
// // // // // // // // //                   Include wildcard certificate (*.{domain || "example.com"})
// // // // // // // // //                 </label>
// // // // // // // // //               </div>
// // // // // // // // //               <button
// // // // // // // // //                 onClick={generateDnsChallenge}
// // // // // // // // //                 disabled={loading || !domain || !email}
// // // // // // // // //                 className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-md hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // // // //               >
// // // // // // // // //                 {loading
// // // // // // // // //                   ? "Generating DNS Challenge..."
// // // // // // // // //                   : "Generate DNS Challenge"}
// // // // // // // // //               </button>
// // // // // // // // //             </div>
// // // // // // // // //           </div>
// // // // // // // // //         )}

// // // // // // // // //         {/* Step 2: DNS Records */}
// // // // // // // // //         {step === 2 && (
// // // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // // //               Step 2: Add DNS TXT Records for {domain}
// // // // // // // // //             </h3>
// // // // // // // // //             <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
// // // // // // // // //               <p className="text-sm text-yellow-800">
// // // // // // // // //                 <strong>Instructions:</strong> Add these DNS TXT records to your
// // // // // // // // //                 domain's DNS settings, then click "Check DNS" to verify they're
// // // // // // // // //                 propagated.
// // // // // // // // //               </p>
// // // // // // // // //             </div>

// // // // // // // // //             <div className="space-y-4 mb-6">
// // // // // // // // //               {dnsRecords.map((record, index) => (
// // // // // // // // //                 <div
// // // // // // // // //                   key={index}
// // // // // // // // //                   className="border border-gray-200 rounded-lg p-4 bg-gray-50"
// // // // // // // // //                 >
// // // // // // // // //                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
// // // // // // // // //                     <div>
// // // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // // //                         Record Name
// // // // // // // // //                       </label>
// // // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // // // //                           {record.name}
// // // // // // // // //                         </code>
// // // // // // // // //                         <CopyButton
// // // // // // // // //                           text={record.name}
// // // // // // // // //                           itemId={`name-${index}`}
// // // // // // // // //                         />
// // // // // // // // //                       </div>
// // // // // // // // //                     </div>
// // // // // // // // //                     <div>
// // // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // // //                         Record Type
// // // // // // // // //                       </label>
// // // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1">
// // // // // // // // //                           TXT
// // // // // // // // //                         </code>
// // // // // // // // //                         <CopyButton text="TXT" itemId={`type-${index}`} />
// // // // // // // // //                       </div>
// // // // // // // // //                     </div>
// // // // // // // // //                     <div>
// // // // // // // // //                       <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
// // // // // // // // //                         Record Value
// // // // // // // // //                       </label>
// // // // // // // // //                       <div className="flex items-center gap-2 mt-1">
// // // // // // // // //                         <code className="bg-white px-2 py-1 rounded border text-sm font-mono flex-1 break-all">
// // // // // // // // //                           {record.value}
// // // // // // // // //                         </code>
// // // // // // // // //                         <CopyButton
// // // // // // // // //                           text={record.value}
// // // // // // // // //                           itemId={`value-${index}`}
// // // // // // // // //                         />
// // // // // // // // //                       </div>
// // // // // // // // //                     </div>
// // // // // // // // //                   </div>
// // // // // // // // //                 </div>
// // // // // // // // //               ))}
// // // // // // // // //             </div>

// // // // // // // // //             <div className="flex items-center gap-4 mb-4">
// // // // // // // // //               <label className="flex items-center gap-2">
// // // // // // // // //                 <input
// // // // // // // // //                   type="checkbox"
// // // // // // // // //                   checked={autoCheckDns}
// // // // // // // // //                   onChange={(e) => setAutoCheckDns(e.target.checked)}
// // // // // // // // //                   className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
// // // // // // // // //                 />
// // // // // // // // //                 <span className="text-sm text-gray-700">
// // // // // // // // //                   Auto-check DNS every 30 seconds
// // // // // // // // //                 </span>
// // // // // // // // //               </label>
// // // // // // // // //             </div>

// // // // // // // // //             <div className="flex gap-4">
// // // // // // // // //               <button
// // // // // // // // //                 onClick={checkDnsRecords}
// // // // // // // // //                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
// // // // // // // // //               >
// // // // // // // // //                 <RefreshCw size={16} />
// // // // // // // // //                 Check DNS
// // // // // // // // //               </button>
// // // // // // // // //               <button
// // // // // // // // //                 onClick={resetForm}
// // // // // // // // //                 className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
// // // // // // // // //               >
// // // // // // // // //                 Start Over
// // // // // // // // //               </button>
// // // // // // // // //             </div>

// // // // // // // // //             {verificationResults.length > 0 && (
// // // // // // // // //               <div className="mt-6">
// // // // // // // // //                 <h4 className="font-semibold text-gray-800 mb-3">
// // // // // // // // //                   DNS Verification Results:
// // // // // // // // //                 </h4>
// // // // // // // // //                 <div className="space-y-2">
// // // // // // // // //                   {verificationResults.map((result, index) => (
// // // // // // // // //                     <div
// // // // // // // // //                       key={index}
// // // // // // // // //                       className={`p-3 rounded border ${
// // // // // // // // //                         result.verified
// // // // // // // // //                           ? "bg-green-50 border-green-200 text-green-800"
// // // // // // // // //                           : "bg-red-50 border-red-200 text-red-800"
// // // // // // // // //                       }`}
// // // // // // // // //                     >
// // // // // // // // //                       <div className="flex items-center gap-2">
// // // // // // // // //                         {result.verified ? (
// // // // // // // // //                           <CheckCircle size={16} />
// // // // // // // // //                         ) : (
// // // // // // // // //                           <Clock size={16} />
// // // // // // // // //                         )}
// // // // // // // // //                         <span className="font-mono text-sm">{result.name}</span>
// // // // // // // // //                         <span className="text-xs">
// // // // // // // // //                           {result.verified ? "Verified" : "Pending"}
// // // // // // // // //                         </span>
// // // // // // // // //                       </div>
// // // // // // // // //                     </div>
// // // // // // // // //                   ))}
// // // // // // // // //                 </div>
// // // // // // // // //               </div>
// // // // // // // // //             )}
// // // // // // // // //           </div>
// // // // // // // // //         )}

// // // // // // // // //         {/* Step 3: Verification Complete */}
// // // // // // // // //         {step === 3 && (
// // // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // // //               Step 3: DNS Verified - Generate Certificates
// // // // // // // // //             </h3>
// // // // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // // // //               <p className="text-sm text-green-800">
// // // // // // // // //                 <strong>Success!</strong> All DNS records have been verified.
// // // // // // // // //                 You can now generate your SSL certificates.
// // // // // // // // //               </p>
// // // // // // // // //             </div>
// // // // // // // // //             <button
// // // // // // // // //               onClick={generateCertificates}
// // // // // // // // //               disabled={loading}
// // // // // // // // //               className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold py-3 px-6 rounded-md hover:from-green-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
// // // // // // // // //             >
// // // // // // // // //               {loading
// // // // // // // // //                 ? "Generating Certificates..."
// // // // // // // // //                 : "Generate SSL Certificates"}
// // // // // // // // //             </button>
// // // // // // // // //           </div>
// // // // // // // // //         )}

// // // // // // // // //         {/* Step 4: Certificates */}
// // // // // // // // //         {step === 4 && certificates && (
// // // // // // // // //           <div className="bg-white rounded-lg shadow-lg p-6">
// // // // // // // // //             <h3 className="text-lg font-bold text-gray-800 mb-4">
// // // // // // // // //               Step 4: Your SSL Certificates for {domain}
// // // // // // // // //             </h3>
// // // // // // // // //             <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
// // // // // // // // //               <p className="text-sm text-green-800">
// // // // // // // // //                 <strong>Certificates Generated Successfully!</strong> Download
// // // // // // // // //                 your certificate files below.
// // // // // // // // //               </p>
// // // // // // // // //             </div>

// // // // // // // // //             <div className="grid gap-4">
// // // // // // // // //               {[
// // // // // // // // //                 {
// // // // // // // // //                   key: "fullchain" as keyof CertificateFiles,
// // // // // // // // //                   title: "Full Chain Certificate",
// // // // // // // // //                   desc: "Use for most hosting control panels",
// // // // // // // // //                 },
// // // // // // // // //                 {
// // // // // // // // //                   key: "privkey" as keyof CertificateFiles,
// // // // // // // // //                   title: "Private Key",
// // // // // // // // //                   desc: "Keep this secure and private",
// // // // // // // // //                 },
// // // // // // // // //                 {
// // // // // // // // //                   key: "cert" as keyof CertificateFiles,
// // // // // // // // //                   title: "Certificate Only",
// // // // // // // // //                   desc: "Your domain certificate",
// // // // // // // // //                 },
// // // // // // // // //                 {
// // // // // // // // //                   key: "chain" as keyof CertificateFiles,
// // // // // // // // //                   title: "Certificate Chain",
// // // // // // // // //                   desc: "Intermediate certificates",
// // // // // // // // //                 },
// // // // // // // // //               ].map(({ key, title, desc }) =>
// // // // // // // // //                 certificates && certificates[key] ? (
// // // // // // // // //                   <div
// // // // // // // // //                     key={key}
// // // // // // // // //                     className="border border-gray-200 rounded-lg p-4"
// // // // // // // // //                   >
// // // // // // // // //                     <div className="flex items-center justify-between mb-2">
// // // // // // // // //                       <div>
// // // // // // // // //                         <h5 className="font-semibold text-gray-800">{title}</h5>
// // // // // // // // //                         <p className="text-xs text-gray-600">{desc}</p>
// // // // // // // // //                       </div>
// // // // // // // // //                       <div className="flex gap-2">
// // // // // // // // //                         <CopyButton
// // // // // // // // //                           text={certificates[key] || ""}
// // // // // // // // //                           itemId={key}
// // // // // // // // //                         />
// // // // // // // // //                         <button
// // // // // // // // //                           onClick={() =>
// // // // // // // // //                             downloadAsTextFile(
// // // // // // // // //                               certificates[key] || "",
// // // // // // // // //                               `${domain}_${key}.txt`
// // // // // // // // //                             )
// // // // // // // // //                           }
// // // // // // // // //                           className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-300 transition-colors"
// // // // // // // // //                         >
// // // // // // // // //                           <Download size={12} />
// // // // // // // // //                           Download
// // // // // // // // //                         </button>
// // // // // // // // //                       </div>
// // // // // // // // //                     </div>
// // // // // // // // //                     <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-xs overflow-x-auto max-h-32 overflow-y-auto">
// // // // // // // // //                       <pre className="whitespace-pre-wrap break-all">
// // // // // // // // //                         {(certificates[key] || "").substring(0, 200)}...
// // // // // // // // //                       </pre>
// // // // // // // // //                     </div>
// // // // // // // // //                   </div>
// // // // // // // // //                 ) : null
// // // // // // // // //               )}
// // // // // // // // //             </div>

// // // // // // // // //             <button
// // // // // // // // //               onClick={resetForm}
// // // // // // // // //               className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
// // // // // // // // //             >
// // // // // // // // //               Generate Another Certificate
// // // // // // // // //             </button>
// // // // // // // // //           </div>
// // // // // // // // //         )}
// // // // // // // // //       </div>
// // // // // // // // //     </div>
// // // // // // // // //   );
// // // // // // // // // };

// // // // // // // // // export default SSLGenerator;
